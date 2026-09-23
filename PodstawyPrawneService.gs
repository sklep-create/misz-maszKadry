/**
 * Automatyzacja zakładki "Podstawy prawne":
 * - sprawdzAktualizacjePodstawPrawnych() - deterministyczne sprawdzenie przez
 *   api.sejm.gov.pl (ELI API), BEZ AI: czy śledzone ustawy nadal obowiązują w
 *   obecnej wersji tekstu jednolitego i czy nie ma nowelizacji, których ten
 *   tekst jeszcze nie uwzględnia. Jeśli są sygnały do sprawdzenia, ZAPISUJE
 *   kopię PDF-u aktualnego tekstu jednolitego na Dysku Google (folder "Kadry -
 *   Podstawy prawne (pobrane)") - to jedyna część, która realnie "pobiera
 *   nowe akty do dysku", i działa w 100% za darmo, bez żadnego klucza AI.
 * - sprawdzNowelizacjeZAI() - opcjonalna, WYŁĄCZNIE DORADCZA warstwa: prosi
 *   Groq (darmowe API, console.groq.com/keys, bez karty) o ocenę, które z
 *   nowelizacji (na podstawie samych ich URZĘDOWYCH TYTUŁÓW z Dziennika
 *   Ustaw) wyglądają, jakby mogły dotyczyć śledzonych zagadnień. NIC nie
 *   zapisuje w arkuszu - tylko podpowiada, co warto sprawdzić ręcznie.
 * - onEditPodstawyPrawne(e) - obsługa checkboxów-przycisków w I1:L1 (patrz
 *   zainstalujPrzyciskiPodstawPrawnych() w NarzedziaSerwisowe.gs).
 *
 * Historia decyzji (2026-09): pierwotna wersja miała AI (Gemini) bezpośrednio
 * czytać PDF tekstu jednolitego i NADPISYWAĆ wartości w tabeli. Porzucone po
 * tym, jak żywe testy pokazały: (1) Gemini wymaga przedpłaty na koncie, żeby
 * klucz API w ogóle odpowiadał - sprzeczne z "darmowe AI" z założenia zadania;
 * (2) Groq jest realnie darmowy (bez karty), ale nie przyjmuje plików PDF ani
 * nie ma wbudowanego wyszukiwania w sieci - więc nie da się go bezpiecznie
 * "uziemić" w treści ustawy. Zamiast ryzykować, że AI zgaduje liczby z pamięci
 * i nadpisuje dane używane do wyliczania wynagrodzeń, AI dostało węższą,
 * dobrze ugruntowaną rolę (ocena tytułów nowelizacji - realny, pobrany tekst,
 * nie zgadywanie), a nadpisywanie zostało CAŁKOWICIE usunięte.
 */

/** Śledzone ustawy: ELI (Dziennik Ustaw) obecnie zapisanego tekstu jednolitego + lista Kluczy z tabeli, które z niego pochodzą. */
const PODSTAWY_PRAWNE_TRACKED_ACTS = [
  {
    nazwa: 'Kodeks pracy',
    propKey: 'PODSTAWY_PRAWNE_ELI_KP',
    domyslny: { publisher: 'DU', year: 2025, pos: 277 },
    klucze: ['NORMA_DOBOWA_ETAT']
  },
  {
    nazwa: 'Ustawa o rehabilitacji zawodowej i społecznej oraz zatrudnianiu osób niepełnosprawnych',
    propKey: 'PODSTAWY_PRAWNE_ELI_REHAB',
    domyslny: { publisher: 'DU', year: 2025, pos: 913 },
    klucze: ['NORMA_DOBOWA_OZN', 'NORMA_TYGODNIOWA_OZN']
  }
];

/**
 * Sprawdza przez api.sejm.gov.pl, czy zapisane teksty jednolite nadal
 * obowiązują i czy nie ma nowelizacji ogłoszonych już PO nich. Jeśli tak -
 * zapisuje kopię aktualnego PDF-u na Dysku (referencja, nic w arkuszu poza
 * komórką statusu N1 się nie zmienia). Bezpieczne do uruchamiania dowolnie
 * często, nie wymaga żadnego klucza AI.
 */
function sprawdzAktualizacjePodstawPrawnych() {
  const sheet = getSpreadsheet().getSheetByName('Podstawy prawne');
  const lines = [];
  let anyIssue = false;

  PODSTAWY_PRAWNE_TRACKED_ACTS.forEach(function (act) {
    const parts = _getTrackedActEli(act);
    const label = 'Dz.U. ' + parts.year + ' poz. ' + parts.pos;
    let meta;
    try {
      meta = _fetchEliActMeta(parts);
    } catch (err) {
      anyIssue = true;
      lines.push('❌ ' + act.nazwa + ' (' + label + '): błąd pobierania - ' + err);
      return;
    }

    const amendments = (meta.references && meta.references['Nowelizacje po tekście jednolitym']) || [];
    const issues = [];

    if (meta.inForce && meta.inForce !== 'IN_FORCE') {
      issues.push('status "' + meta.status + '"' + (meta.expirationDate ? (', wygasła ' + meta.expirationDate) : ''));
    }
    if (amendments.length > 0) {
      const dates = amendments.map(function (a) { return a.date; }).sort();
      issues.push(amendments.length + ' nowelizacji po tym tekście jednolitym (najnowsza: ' + dates[dates.length - 1] + ')');
    }

    if (issues.length > 0) {
      anyIssue = true;
      let driveNote = '';
      try {
        const pdfBase64 = _downloadEliPdfBase64(parts);
        _zapiszPdfNaDysku(act.nazwa, parts, pdfBase64);
        driveNote = ' → kopia PDF zapisana na Dysku Google.';
      } catch (err) {
        driveNote = ' (nie udało się zapisać kopii PDF na Dysku: ' + err + ')';
      }
      lines.push('⚠️ ' + act.nazwa + ' (' + label + '): ' + issues.join('; ') + driveNote);
    } else {
      lines.push('✅ ' + act.nazwa + ' (' + label + '): bez zmian.');
    }
  });

  const summary = lines.join('\n');
  if (sheet) {
    _ustawStatusPodstawPrawne(sheet, (anyIssue ? '⚠️ ' : '✅ ') + 'Sprawdzono ' + _formatujDzisiaj() + (anyIssue ? ' - są zmiany' : ''));
  }

  Logger.log(summary);
  try {
    SpreadsheetApp.getUi().alert(
      '🔄 Sprawdzono aktualizację ustaw',
      summary + (anyIssue ? '\n\nSą zmiany do przejrzenia - "🔍 Sugestie AI (Groq)" podpowie, które nowelizacje warto sprawdzić ręcznie.' : ''),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (err) {
    // Brak kontekstu UI (np. wywołanie spoza edycji arkusza) - wynik jest w Logger.log powyżej.
  }
  return summary;
}

/**
 * WYŁĄCZNIE DORADCZE - niczego nie zapisuje w arkuszu. Dla każdej śledzonej
 * ustawy z nowelizacjami po tekście jednolitym pobiera ich URZĘDOWE TYTUŁY
 * (api.sejm.gov.pl, bez AI - to sam fakt, nie zgadywanie) i prosi Groq o
 * ocenę, które z nich - sądząc TYLKO po tytule - mogą dotyczyć śledzonych
 * zagadnień i warto je sprawdzić ręcznie na isap.sejm.gov.pl. Wynik trafia
 * wyłącznie do okienka i komórki statusu (N1).
 */
function sprawdzNowelizacjeZAI() {
  const ui = SpreadsheetApp.getUi();
  const apiKey = (getSettingValue('GROQ_API_KEY') || '').toString().trim();

  if (!apiKey) {
    ui.alert(
      '❌ Brak klucza AI',
      'Wpisz darmowy klucz Groq w Ustawienia!GROQ_API_KEY.\n\n' +
      'Załóż go na console.groq.com/keys (logowanie Google/e-mail, bez karty płatniczej) i uruchom ponownie.',
      ui.ButtonSet.OK
    );
    return;
  }

  const sheet = getSpreadsheet().getSheetByName('Podstawy prawne');
  if (!sheet) {
    ui.alert('❌ Brak zakładki "Podstawy prawne".');
    return;
  }

  const rows = _readPodstawyPrawneRows(sheet);
  const summaryLines = [];

  PODSTAWY_PRAWNE_TRACKED_ACTS.forEach(function (act) {
    const relevantRows = rows.filter(function (r) { return act.klucze.indexOf(r.klucz) !== -1; });
    if (relevantRows.length === 0) return;

    const parts = _getTrackedActEli(act);
    let meta;
    try {
      meta = _fetchEliActMeta(parts);
    } catch (err) {
      summaryLines.push('❌ ' + act.nazwa + ': nie udało się pobrać metadanych - ' + err);
      return;
    }

    if (meta.inForce && meta.inForce !== 'IN_FORCE') {
      summaryLines.push(
        '⚠️ ' + act.nazwa + ': obecny tekst jednolity już nie obowiązuje (status "' + meta.status + '") - ' +
        'sprawdź ręcznie na isap.sejm.gov.pl. Groq nie ma wyszukiwania w sieci, więc nie zgaduje nowego numeru Dz.U.'
      );
      return;
    }

    const amendments = (meta.references && meta.references['Nowelizacje po tekście jednolitym']) || [];
    if (amendments.length === 0) {
      summaryLines.push('✅ ' + act.nazwa + ': brak nowelizacji do oceny.');
      return;
    }

    let opinion;
    try {
      opinion = _ocenNowelizacjeAI(apiKey, act, amendments, relevantRows.map(function (r) { return r.zagadnienie; }));
    } catch (err) {
      summaryLines.push('❌ ' + act.nazwa + ': błąd AI - ' + err);
      return;
    }

    summaryLines.push('🔍 ' + act.nazwa + ' (' + amendments.length + ' nowelizacji):\n' + opinion);
  });

  const summary = summaryLines.join('\n\n') || 'Brak śledzonych wierszy (żaden nie ma wypełnionego Klucza).';
  if (sheet) {
    _ustawStatusPodstawPrawne(sheet, '🔍 Oceniono AI ' + _formatujDzisiaj());
  }

  Logger.log(summary);
  ui.alert('🔍 Sugestie AI (Groq) — zweryfikuj ręcznie', summary, ui.ButtonSet.OK);
}

/** Obsługa checkboxów-przycisków I1:L1 w "Podstawy prawne" (patrz zainstalujPrzyciskiPodstawPrawnych w NarzedziaSerwisowe.gs). */
function onEditPodstawyPrawne(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Podstawy prawne') return;

  const a1 = e.range.getA1Notation();
  if (a1 === 'J1' && e.value === 'TRUE') {
    e.range.setValue(false); // odznacz od razu - działa jak przycisk, nie jak stan
    sprawdzAktualizacjePodstawPrawnych();
  } else if (a1 === 'L1' && e.value === 'TRUE') {
    e.range.setValue(false);
    sprawdzNowelizacjeZAI();
  }
}

// --- Pomocnicze: api.sejm.gov.pl (ELI) ---------------------------------

/** Obecnie zapisany ELI śledzonej ustawy (Właściwości Skryptu, z fallbackiem na domyślny z tabeli powyżej). Zmień "domyslny" w PODSTAWY_PRAWNE_TRACKED_ACTS ręcznie w kodzie, gdy potwierdzisz nowy tekst jednolity. */
function _getTrackedActEli(act) {
  const stored = PropertiesService.getScriptProperties().getProperty(act.propKey);
  if (stored) {
    const bits = stored.split('/');
    if (bits.length === 3) {
      return { publisher: bits[0], year: Number(bits[1]), pos: Number(bits[2]) };
    }
  }
  return act.domyslny;
}

/** Metadane aktu (status, czy obowiązuje, tytuł, lista nowelizacji po tym tekście jednolitym...) - https://api.sejm.gov.pl/eli/acts/{publisher}/{year}/{pos} */
function _fetchEliActMeta(parts) {
  const url = 'https://api.sejm.gov.pl/eli/acts/' + parts.publisher + '/' + parts.year + '/' + parts.pos;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  if (response.getResponseCode() !== 200) {
    throw new Error('HTTP ' + response.getResponseCode() + ' (' + url + ')');
  }
  return JSON.parse(response.getContentText());
}

/** Treść aktu jako PDF, zakodowana base64 (do zapisu na Dysku - referencja, nie wysyłana do żadnego AI). */
function _downloadEliPdfBase64(parts) {
  const url = 'https://api.sejm.gov.pl/eli/acts/' + parts.publisher + '/' + parts.year + '/' + parts.pos + '/text.pdf';
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('HTTP ' + response.getResponseCode() + ' (' + url + ')');
  }
  return Utilities.base64Encode(response.getContent());
}

/** Kopia pobranego PDF-u na Dysku Google - folder tworzony automatycznie, szukany po nazwie (jak w BackupService.gs). */
function _zapiszPdfNaDysku(nazwaUstawy, parts, base64) {
  const folderName = 'Kadry - Podstawy prawne (pobrane)';
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const fileName = nazwaUstawy + ' — Dz.U. ' + parts.year + ' poz. ' + parts.pos + '.pdf';
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', fileName);
  folder.createFile(blob);
}

// --- Pomocnicze: arkusz --------------------------------------------------

/** Deleguje do _scanPodstawyPrawneBlocks() w Config.gs - patrz tam po wyjaśnienie, czemu czytanie jest teraz niezależne od pozycji kolumn/liczby bloków w zakładce. */
function _readPodstawyPrawneRows(sheet) {
  return _scanPodstawyPrawneBlocks(sheet);
}

function _ustawStatusPodstawPrawne(sheet, text) {
  sheet.getRange('N1').setValue(text).setFontStyle('normal');
}

function _formatujDzisiaj() {
  return Utilities.formatDate(new Date(), 'CET', 'yyyy-MM-dd HH:mm');
}

// --- Pomocnicze: Groq -------------------------------------------------

/**
 * Prosi Groq o ocenę listy nowelizacji na podstawie ich urzędowych tytułów
 * (pobranych osobno, deterministycznie, przez api.sejm.gov.pl - AI dostaje
 * gotowy tekst, nie zgaduje). Zwraca zwykły tekst po polsku (bez JSON) -
 * to CELOWO tylko podpowiedź dla człowieka, nigdy nie trafia do komórek.
 */
function _ocenNowelizacjeAI(apiKey, act, amendments, zagadnienia) {
  const capped = amendments.slice(0, 10);
  const tytuly = capped.map(function (a) {
    let title = '(nie udało się pobrać tytułu)';
    try {
      const bits = a.id.split('/');
      const m = _fetchEliActMeta({ publisher: bits[0], year: Number(bits[1]), pos: Number(bits[2]) });
      title = m.title;
    } catch (err) {
      // zostaje domyślny opis powyżej
    }
    return '- ' + a.id + ' (' + a.date + '): ' + title;
  }).join('\n');

  const prompt =
    'Oto lista nowelizacji ogłoszonych PO obecnym tekście jednolitym ustawy "' + act.nazwa + '" ' +
    '(same urzędowe tytuły z Dziennika Ustaw, nic ponadto):\n\n' + tytuly + '\n\n' +
    'W naszej tabeli śledzimy tylko te konkretne zagadnienia tej ustawy:\n' +
    zagadnienia.map(function (z) { return '- ' + z; }).join('\n') + '\n\n' +
    'Na podstawie WYŁĄCZNIE powyższych tytułów (nie zgaduj treści, której nie znasz) - które z tych nowelizacji brzmią, ' +
    'jakby mogły dotyczyć powyższych zagadnień i warto je sprawdzić ręcznie? Odpowiedz krótko po polsku, zwykłym ' +
    'tekstem (bez list w JSON), maksymalnie kilka zdań. Jeśli żaden tytuł na to nie wskazuje, napisz to wprost - i zaznacz, ' +
    'że to nie znaczy, że nic się nie zmieniło, tylko że same tytuły tego nie ujawniają.';

  return _callGroq(apiKey, prompt);
}

/** Pojedyncze zapytanie chat completion do Groq (API kompatybilne z OpenAI). Zwraca odpowiedź jako zwykły tekst. */
function _callGroq(apiKey, prompt) {
  Utilities.sleep(1000); // Groq ma dużo hojniejszy darmowy limit niż Gemini, mały odstęp tylko na wszelki wypadek przy kilku wywołaniach pod rząd.

  // llama-3.3-70b-versatile zwracał 404 "does not exist or you do not have
  // access to it" na tym koncie (2026-09) mimo że wg dokumentacji Groq nadal
  // istnieje - model wybrany na podstawie tego, co faktycznie widać jako
  // aktywne w console.groq.com/playground.
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = {
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }]
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Groq HTTP ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 300));
  }

  const data = JSON.parse(response.getContentText());
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error('Nieoczekiwana odpowiedź Groq: ' + response.getContentText().slice(0, 300));
  }
  return content.trim();
}
