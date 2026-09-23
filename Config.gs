/**
 * Ustawienia globalne projektu
 * 
 * ⚠️ WAŻNE: Token Telegrama i Webhook URL są przechowywane w Properties Service (zmienne sekretne)
 * Aby ustawić token po raz pierwszy, uruchom: initializeSecrets()
 * Aby ustawić webhook URL, uruchom: setWebhookDeploymentId()
 */
const CONFIG = {
  // Token pobierany dynamicznie z Properties Service
  get TELEGRAM_TOKEN() {
    return PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || 'NOT_SET';
  },
  
  // Webhook URL pobierany dynamicznie z Properties Service
  get WEBHOOK_URL() {
    return PropertiesService.getScriptProperties().getProperty('WEBHOOK_DEPLOYMENT_URL') || 'NOT_SET';
  },
  
  // Nazwy zakładek w Arkuszu Google
  SHEETS: {
    SETTINGS: 'Ustawienia',
    EMPLOYEES: 'Pracownicy',
    SCHEDULE: 'Grafik',
    TIMELOG: 'Ewidencja',
    LEAVES: 'Wnioski',
    AVAILABILITY: 'Dyspozycyjność',
    DAYS_OFF: 'Dni wolne'
  }
};

/**
 * Inicjalizacja sekretów - uruchomić jednorazowo przy pierwszym uruchomieniu
 */
function initializeSecrets() {
  try {
    showTokenInputDialog();
  } catch (err) {
    Logger.log("Błąd initializeSecrets: " + err.toString());
    SpreadsheetApp.getUi().alert('❌ Błąd: ' + err.toString());
  }
}

/**
 * Dialog do wpisania tokena Telegrama
 */
function showTokenInputDialog() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '🔐 Ustawienie tokena Telegrama\n\n' +
    'Wklej tutaj token API bota Telegram:\n' +
    '(Token w formacie: 123456789:ABCdef...)',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const token = response.getResponseText().trim();
    
    if (!token || token.length < 10) {
      ui.alert('❌ Token jest zbyt krótki lub pusty. Spróbuj ponownie.');
      return;
    }
    
    // Zapisz token w Properties Service
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_TOKEN', token);
    
    ui.alert('✅ Token Telegrama został bezpiecznie zapisany!\n\n' +
             'Możesz teraz używać systemu. Token nie będzie widoczny w kodzie.');
    
    Logger.log('✅ Token został zapisany w Properties Service');
  }
}

/**
 * Znajduje pierwszą komórkę w arkuszu "Ustawienia" o dokładnie takim tekście
 * (bez rozróżniania wielkości liter) - zakładka przebudowana 2026-09-17/18 z
 * jednego wiersza z 22 kolumnami na kilka tytułowanych mini-tabel, jedna pod
 * drugą (patrz getDatabaseSchema() w DatabaseSetup.gs), ale nagłówek nadal =
 * nazwa ustawienia, wartość zawsze w wierszu BEZPOŚREDNIO pod nagłówkiem, w
 * tej samej kolumnie (jak w oryginalnym układzie - zmieniła się tylko liczba
 * wierszy nagłówkowych, z 1 na kilka). Szuka więc GDZIEKOLWIEK w arkuszu, nie
 * tylko w wierszu 1. Zwraca {row, col} (1-indeks) nagłówka, albo null.
 */
function _findHeaderCell(sheet, headerText) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return null;

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const target = headerText.toString().trim().toLowerCase();

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if ((data[r][c] || '').toString().trim().toLowerCase() === target) {
        return { row: r + 1, col: c + 1 };
      }
    }
  }
  return null;
}

/**
 * Mapa nazwa_nagłówka -> indeks kolumny (0-based, dla data[i][col.X]) dla
 * zakładki Pracownicy, czytana z wiersza 1. Wprowadzona 2026-09-22 po tym, jak
 * ręczne dodanie kolumny "Data_Zatrudnienia" bezpośrednio w arkuszu (bez
 * zmiany kodu) przesunęło o 1 wszystkie kolumny za Imie_Nazwisko i po cichu
 * rozjechało odczyty na sztywnych indeksach (data[i][3] itd.) w AuthService.gs/
 * AttendanceService.gs/AvailabilityService.gs/GrafikGeneratorService.gs -
 * m.in. autoryzacja PIN i przeliczanie Suma_Urlopów czytały złe kolumny. Ten
 * sam mechanizm co _findHeaderCell() dla Ustawienia/Podstawy prawne - odporny
 * na dowolne wstawienie/przesunięcie kolumn, dopóki nazwy nagłówków się
 * zgadzają. Zwraca undefined dla brakującego nagłówka (użycie: col['Nazwa']).
 */
function getEmployeesColumnMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach(function (h, idx) {
    const key = (h || '').toString().trim();
    if (key) map[key] = idx;
  });
  return map;
}

/** Pojedyncza wartość ustawienia (wiersz bezpośrednio pod nagłówkiem) po nazwie - patrz _findHeaderCell. */
function getSettingValue(headerName) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const header = _findHeaderCell(sheet, headerName);
  if (!header) return '';
  return sheet.getRange(header.row + 1, header.col).getValue();
}

/** Zapisuje pojedynczą wartość ustawienia (wiersz bezpośrednio pod nagłówkiem) po nazwie - patrz _findHeaderCell. */
function setSettingValue(headerName, value) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const header = _findHeaderCell(sheet, headerName);
  if (!header) throw new Error('Brak ustawienia "' + headerName + '" w arkuszu Ustawienia.');
  sheet.getRange(header.row + 1, header.col).setValue(value);
}

/**
 * URL logo firmy do wyświetlenia w Mini App: jeśli w Ustawienia!logo jest
 * ręcznie wklejony link, ma pierwszeństwo; w przeciwnym razie automatycznie
 * pobierane jest zdjęcie profilowe bota Telegram (bez dodatkowych uprawnień
 * Google - patrz getTelegramBotPhotoDataUri w TelegramBotTools.gs).
 */
function getCompanyLogoUrl() {
  const manual = (getSettingValue('logo') || '').toString().trim();
  return manual || getTelegramBotPhotoDataUri();
}

/**
 * Uniwersalne odczytanie WSZYSTKICH mini-tabel (bloków) w zakładce "Podstawy
 * prawne" - przebudowanej 2026-09-17 na kilka samodzielnych, tytułowanych
 * tabelek rozmieszczonych w układzie 2x2 (patrz getDatabaseSchema() w
 * DatabaseSetup.gs), a nie jedną płaską tabelę A-G jak wcześniej. Funkcja
 * NIE zakłada żadnej konkretnej pozycji kolumn/wierszy - blok rozpoznaje po
 * wierszu nagłówkowym zawierającym komórkę z tekstem "Klucz"; z TEGO SAMEGO
 * wiersza odczytuje pozycje kolumn "Wartość"/"Zagadnienie"/"Podstawa
 * prawna"/"Jednostka"/"Uwagi" (o ile istnieją), a tytuł blocku to najbliższy
 * niepusty wiersz POWYŻEJ nagłówka w kolumnie "Zagadnienie" (tam, gdzie
 * buildBlockGridSheet() zapisuje scalony tytuł). Dane blocku kończą się na
 * pustej komórce w kolumnie "Wartość" (separator/koniec arkusza) albo na
 * kolejnym wierszu nagłówkowym w tej samej kolumnie "Klucz" - dzięki temu
 * działa identycznie dla bloków ułożonych w poziomie (różne kolumny) i w
 * pionie (te same kolumny, kolejny nagłówek niżej).
 */
function _scanPodstawyPrawneBlocks(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const norm = function (v) { return (v || '').toString().trim().toLowerCase(); };
  const rows = [];

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      if (norm(data[r][c]) !== 'klucz') continue;

      const headerRow = data[r];
      // Ogranicz szukanie towarzyszących nagłówków (Wartość, Zagadnienie...) do
      // CIĄGŁEGO fragmentu wiersza wokół kolumny "Klucz" (do najbliższej pustej
      // komórki w obie strony) - przy siatce 2x2 dwa bloki mogą mieć nagłówek w
      // TYM SAMYM wierszu (różne kolumny); bez tego ograniczenia złapałoby
      // kolumny sąsiedniego blocku (znalezione na żywej symulacji przed wgraniem).
      let spanStart = c, spanEnd = c;
      while (spanStart > 0 && norm(headerRow[spanStart - 1]) !== '') spanStart--;
      while (spanEnd < headerRow.length - 1 && norm(headerRow[spanEnd + 1]) !== '') spanEnd++;

      const col = { klucz: c, wartosc: -1, zagadnienie: -1, podstawaPrawna: -1, jednostka: -1, uwagi: -1 };
      for (let hc = spanStart; hc <= spanEnd; hc++) {
        const h = norm(headerRow[hc]);
        if (h === 'wartość') col.wartosc = hc;
        else if (h === 'zagadnienie') col.zagadnienie = hc;
        else if (h === 'podstawa prawna') col.podstawaPrawna = hc;
        else if (h === 'jednostka') col.jednostka = hc;
        else if (h === 'uwagi') col.uwagi = hc;
      }
      if (col.wartosc === -1) continue; // nagłówek "Klucz" bez "Wartość" w tym samym wierszu - to nie jest blok Podstaw prawnych

      const titleCol = col.zagadnienie !== -1 ? col.zagadnienie : c;
      let kategoria = '';
      for (let tr = r - 1; tr >= 0; tr--) {
        const t = (data[tr][titleCol] || '').toString().trim();
        if (t !== '') { kategoria = t; break; }
      }

      for (let dr = r + 1; dr < data.length; dr++) {
        const row = data[dr];
        const cellKey = norm(row[c]);
        if (cellKey === 'klucz') break; // kolejny blok zaczyna się w tej samej kolumnie
        const wartoscVal = row[col.wartosc];
        if (wartoscVal === '' || wartoscVal === null || wartoscVal === undefined) break; // koniec danych tego blocku

        rows.push({
          rowIndex: dr + 1,
          kategoria: kategoria,
          zagadnienie: col.zagadnienie !== -1 ? row[col.zagadnienie] : '',
          wartosc: wartoscVal,
          podstawaPrawna: col.podstawaPrawna !== -1 ? row[col.podstawaPrawna] : '',
          jednostka: col.jednostka !== -1 ? row[col.jednostka] : '',
          uwagi: col.uwagi !== -1 ? row[col.uwagi] : '',
          klucz: (row[c] || '').toString().trim()
        });
      }
    }
  }
  return rows;
}

/**
 * Szuka w arkuszu "Podstawy prawne" wiersza o podanym Kluczu i zwraca jego
 * Wartość (celowo sama liczba - patrz schemat w DatabaseSetup.gs) jako
 * liczbę - albo null, jeśli arkusz nie istnieje, klucz nie został
 * znaleziony/wypełniony, albo Wartość nie jest czystą liczbą (np. "100/50"
 * przy dwuwariantowych wierszach - te celowo nie mają Klucza). To jedyny
 * sposób, żeby normy godzin użyte w generatorze Grafiku faktycznie
 * pochodziły z tabeli podstaw prawnych, a nie tylko z jej opisu tekstowego
 * dla ludzi. Czyta przez _scanPodstawyPrawneBlocks() - działa niezależnie od
 * tego, w którym z kilku bloków tabeli dany Klucz akurat leży.
 */
function getPodstawaPrawnaNumber(klucz) {
  const sheet = getSpreadsheet().getSheetByName('Podstawy prawne');
  if (!sheet) return null;

  const rows = _scanPodstawyPrawneBlocks(sheet);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].klucz === klucz) {
      const value = Number(rows[i].wartosc);
      return value > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Dobowa norma godzin dla pracownika UoP, domyślnie 8. Priorytet: "Podstawy
 * prawne" (Klucz NORMA_DOBOWA_ETAT) -> Ustawienia!NORMA_ETAT_UOP (ręczny
 * override/starsze arkusze bez zakładki Podstawy prawne) -> domyślne 8.
 */
function getNormaEtatUop() {
  const fromLaw = getPodstawaPrawnaNumber('NORMA_DOBOWA_ETAT');
  if (fromLaw) return fromLaw;
  const value = Number(getSettingValue('NORMA_ETAT_UOP'));
  return value > 0 ? value : 8;
}

/**
 * Dobowa norma godzin dla pracownika OzN (Umiarkowany/Znaczny), domyślnie 7.
 * Priorytet: "Podstawy prawne" (Klucz NORMA_DOBOWA_OZN) ->
 * Ustawienia!NORMA_OZN_UOP -> domyślne 7.
 */
function getNormaOznUop() {
  const fromLaw = getPodstawaPrawnaNumber('NORMA_DOBOWA_OZN');
  if (fromLaw) return fromLaw;
  const value = Number(getSettingValue('NORMA_OZN_UOP'));
  return value > 0 ? value : 7;
}

/**
 * Tygodniowa norma godzin dla pracownika OzN (Umiarkowany/Znaczny), domyślnie
 * 35. Priorytet: "Podstawy prawne" (Klucz NORMA_TYGODNIOWA_OZN) ->
 * Ustawienia!NORMA_OZN_TYGODNIOWA_UOP -> domyślne 35.
 */
function getNormaOznTygodniowa() {
  const fromLaw = getPodstawaPrawnaNumber('NORMA_TYGODNIOWA_OZN');
  if (fromLaw) return fromLaw;
  const value = Number(getSettingValue('NORMA_OZN_TYGODNIOWA_UOP'));
  return value > 0 ? value : 35;
}

/**
 * Tygodniowa norma godzin pełnego etatu (Brak/Lekki stopień OzN), domyślnie
 * 40 wg Art. 129 §1 KP (przeciętnie, w przyjętym okresie rozliczeniowym).
 * Priorytet: "Podstawy prawne" (Klucz NORMA_TYGODNIOWA_ETAT) -> domyślne 40.
 * Używane przez generator Grafiku do pilnowania tygodniowego limitu godzin
 * pracowników pełnoetatowych/część etatu, gdy firma NIE dopuszcza nadgodzin
 * (patrz _effectiveEmployeeLimits() w GrafikGeneratorService.gs).
 */
function getNormaTygodniowaEtat() {
  const fromLaw = getPodstawaPrawnaNumber('NORMA_TYGODNIOWA_ETAT');
  if (fromLaw) return fromLaw;
  return 40;
}

/**
 * Tygodniowy limit godzin Z NADGODZINAMI (Art. 131 §1 KP: przeciętnie max
 * 48h/tydzień, w tym nadgodziny), domyślnie 48. Priorytet: "Podstawy prawne"
 * (Klucz LIMIT_TYGODNIOWY_Z_NADGODZINAMI) -> domyślne 48. To GÓRNA GRANICA,
 * ponad którą generator Grafiku NIGDY nie planuje - nawet gdy firma dopuszcza
 * nadgodziny (NADGODZINY=TAK) - konserwatywne uproszczenie: art. 131 liczy
 * średnią w całym okresie rozliczeniowym (może się wyrównać krótszymi
 * tygodniami), a generator (bez mechanizmu bilansowania okresu) zamiast tego
 * nigdy nie przekracza 48h w POJEDYNCZYM tygodniu - to zawsze bezpieczne
 * (średnia z tygodni ≤48h też jest ≤48h), tylko czasem ostrożniejsze niż
 * absolutne maksimum dozwolone przez prawo.
 */
function getWeeklyOvertimeCap() {
  const fromLaw = getPodstawaPrawnaNumber('LIMIT_TYGODNIOWY_Z_NADGODZINAMI');
  if (fromLaw) return fromLaw;
  return 48;
}

/**
 * Czy zakładka/funkcja Dyspozycyjność jest aktywna (Ustawienia!DYSPOZYCYJNOSC,
 * TAK/NIE) - domyślnie TAK (kompatybilność z zachowaniem sprzed wprowadzenia
 * tego ustawienia, gdy przycisk w Mini App był zawsze widoczny). NIE = Mini
 * App chowa przycisk/zakładkę i blokuje zapis nowych zgłoszeń - generator
 * Grafiku NIE wymaga żadnej specjalnej obsługi tego ustawienia, bo skoro
 * nikt nie może niczego zgłosić, getEmployeeAvailability() i tak zawsze
 * zwróci [] (pracownik naturalnie liczy się jako dostępny każdego dnia).
 */
function isDyspozycyjnoscEnabled() {
  const raw = (getSettingValue('DYSPOZYCYJNOSC') || '').toString().trim().toUpperCase();
  return raw !== 'NIE';
}

/**
 * Czy w firmie w ogóle dopuszcza się nadgodziny (kolumna NADGODZINY w
 * Ustawienia, TAK/NIE). Domyślnie NIE (bezpieczny wariant), dopóki
 * pracodawca jawnie nie ustawi TAK.
 */
function isOvertimeAllowed() {
  return (getSettingValue('NADGODZINY') || '').toString().trim().toUpperCase() === 'TAK';
}

/**
 * Czy KONKRETNY pracownik może mieć nadgodziny: wymaga zgody firmowej
 * (isOvertimeAllowed) ORAZ braku stopnia OzN - pracownicy z orzeczeniem o
 * niepełnosprawności nigdy nie mają nadgodzin, niezależnie od ustawienia firmy.
 */
function canEmployeeHaveOvertime(employeeId) {
  if (!isOvertimeAllowed()) return false;

  const employee = getEmployeeById(employeeId);
  const stopienOzn = (employee && employee.stopienOzn || '').toString().trim();
  const isOzn = stopienOzn !== '' && stopienOzn !== 'Brak';

  return !isOzn;
}

/**
 * Tygodniowe godziny otwarcia firmy z tabeli "dni pracy" / "godziny pracy"
 * w arkuszu Ustawienia. Zwraca obiekt {NazwaDnia: "8.30 - 15.30" | null},
 * gdzie null oznacza dzień zamknięty (pusta komórka godzin).
 */
function getWeeklyWorkingHours() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const dayHeader = _findHeaderCell(sheet, 'dni pracy');
  const hoursHeader = _findHeaderCell(sheet, 'godziny pracy');
  if (!dayHeader || !hoursHeader) return {};

  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - dayHeader.row;
  if (rowCount < 1) return {};

  const days = sheet.getRange(dayHeader.row + 1, dayHeader.col, rowCount, 1).getValues().map(function (r) { return r[0]; });
  const hours = sheet.getRange(hoursHeader.row + 1, hoursHeader.col, rowCount, 1).getValues().map(function (r) { return r[0]; });

  // Pętla z break (NIE forEach+return - to tylko pomija jeden wiersz, nie
  // przerywa) - pierwszy pusty wiersz kończy TĘ mini-tabelę; inaczej przy
  // układzie kilku bloków jedna pod drugą (patrz DatabaseSetup.gs) czytanie
  // leciałoby aż do końca arkusza i łapało śmieci z kolejnych bloków w tej
  // samej kolumnie (znalezione na symulacji przed wgraniem).
  const result = {};
  for (let i = 0; i < days.length; i++) {
    const dayName = (days[i] || '').toString().trim();
    if (!dayName) break;
    result[dayName] = (hours[i] || '').toString().trim() || null;
  }

  return result;
}

/**
 * Zapisuje tygodniowe godziny otwarcia do tabeli "dni pracy" / "godziny
 * pracy" (np. po pobraniu z Google Wizytówki). Nadpisuje godziny tylko
 * dla dni obecnych w hoursMap - inne wiersze zostają bez zmian.
 * @param {Object} hoursMap {NazwaDnia: "8.30 - 15.30" | null}
 */
function setWeeklyWorkingHours(hoursMap) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const dayHeader = _findHeaderCell(sheet, 'dni pracy');
  const hoursHeader = _findHeaderCell(sheet, 'godziny pracy');
  if (!dayHeader || !hoursHeader) {
    throw new Error('Brak "dni pracy" / "godziny pracy" w arkuszu Ustawienia.');
  }

  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - dayHeader.row;
  if (rowCount < 1) return;

  const days = sheet.getRange(dayHeader.row + 1, dayHeader.col, rowCount, 1).getValues().map(function (r) { return r[0]; });

  // break (nie forEach+return) z tego samego powodu co w getWeeklyWorkingHours()
  // powyżej - pierwszy pusty wiersz kończy tę mini-tabelę.
  for (let i = 0; i < days.length; i++) {
    const dayName = (days[i] || '').toString().trim();
    if (!dayName) break;
    if (!(dayName in hoursMap)) continue;
    sheet.getRange(hoursHeader.row + 1 + i, hoursHeader.col).setValue(hoursMap[dayName] || '');
  }
}

/**
 * Zwraca aktywny skoroszyt.
 * Jeśli w Properties Service ustawiono SPREADSHEET_ID, otwiera go wprost
 * (skrypt samodzielny / standalone, np. wdrażany przez clasp/GitHub Actions).
 * W przeciwnym razie sięga po aktywny arkusz (skrypt podpięty do arkusza).
 */
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Zapisuje ID aktywnego arkusza w Properties Service.
 * Wymagane, gdy skrypt jest samodzielny (nie jest podpięty do konkretnego arkusza).
 */
function setSpreadsheetId() {
  const ui = SpreadsheetApp.getUi();
  const currentId = SpreadsheetApp.getActiveSpreadsheet().getId();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', currentId);
  ui.alert('✅ Zapamiętano ID arkusza: ' + currentId + '\n\nOd teraz bot i dashboard korzystają z tego arkusza.');
  Logger.log('✅ SPREADSHEET_ID = ' + currentId);
}

/**
 * Pobiera token Telegrama z Properties Service
 * Jeśli nie jest ustawiony, wyświetla komunikat błędu
 */
function getTelegramToken() {
  const token = CONFIG.TELEGRAM_TOKEN;
  
  if (token === 'NOT_SET') {
    Logger.log('⚠️ UWAGA: Token Telegrama nie jest ustawiony!');
    Logger.log('Uruchom funkcję: initializeSecrets()');
    throw new Error('Telegram token is not configured. Run initializeSecrets() first.');
  }
  
  return token;
}

/**
 * Pobiera Webhook URL z Properties Service
 * Jeśli nie jest ustawiony, wyświetla komunikat błędu
 */
function getWebhookUrl() {
  const url = CONFIG.WEBHOOK_URL;
  
  if (url === 'NOT_SET') {
    Logger.log('⚠️ UWAGA: Webhook URL nie jest ustawiony!');
    Logger.log('Uruchom funkcję: setWebhookDeploymentId()');
    throw new Error('Webhook URL is not configured. Run setWebhookDeploymentId() first.');
  }
  
  return url;
}

/**
 * Zwraca URL, na który faktycznie ma wskazywać webhook Telegrama.
 * Jeśli ustawiono TELEGRAM_WEBHOOK_PROXY_URL (np. Cloudflare Worker
 * obchodzący przekierowanie 302 Apps Script), ma on pierwszeństwo.
 * W przeciwnym razie używany jest bezpośredni URL wdrożenia Apps Script.
 */
function getEffectiveTelegramWebhookUrl() {
  const proxyUrl = PropertiesService.getScriptProperties().getProperty('TELEGRAM_WEBHOOK_PROXY_URL');
  return proxyUrl || getWebhookUrl();
}

/**
 * Zwraca sekret webhooka Telegrama (generuje i zapisuje przy pierwszym użyciu).
 * Telegram dołącza go jako nagłówek X-Telegram-Bot-Api-Secret-Token do każdego
 * prawdziwego update'u wysłanego na webhook (patrz secret_token w setWebhook).
 * Apps Script Web App nie ma dostępu do nagłówków HTTP w doPost, dlatego
 * Cloudflare Worker (cloudflare-worker-telegram-relay.js) weryfikuje ten
 * nagłówek i doczepia sekret jako parametr URL przy przekazywaniu do GAS —
 * doPost (TelegramBot.gs) sprawdza go z e.parameter.secret. Bez zgodnego
 * sekretu w obu miejscach (Telegram + Worker muszą mieć tę samą wartość)
 * dowolny POST na publiczny URL webhooka jest odrzucany bez przetwarzania.
 */
function getOrCreateTelegramWebhookSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('TELEGRAM_WEBHOOK_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TELEGRAM_WEBHOOK_SECRET', secret);
  }
  return secret;
}

/**
 * Ustawia Webhook dla Bota Telegram (Uruchomić jednorazowo)
 */
function setupTelegramWebhook() {
  try {
    const token = getTelegramToken();
    const webhookUrl = getEffectiveTelegramWebhookUrl();
    const secret = getOrCreateTelegramWebhookSecret();

    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${encodeURIComponent(secret)}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());

    if (result.ok) {
      SpreadsheetApp.getUi().alert('✅ Webhook Telegrama został pomyślnie skonfigurowany!\n\n' +
        'Sekret webhooka (wklej do stałej TELEGRAM_WEBHOOK_SECRET w Cloudflare Workerze):\n' + secret);
      Logger.log('✅ Webhook setup successful:', result);
      Logger.log('Sekret webhooka: ' + secret);
    } else {
      SpreadsheetApp.getUi().alert('❌ Błąd: ' + result.description);
      Logger.log('❌ Webhook setup failed:', result);
    }
  } catch (err) {
    Logger.log('❌ Błąd setupTelegramWebhook: ' + err.toString());
    SpreadsheetApp.getUi().alert('❌ Błąd konfiguracji webhook\'a: ' + err.toString());
  }
}

/**
 * Wyświetla status konfiguracji sekretów
 */
function checkSecretsStatus() {
  const properties = PropertiesService.getScriptProperties();
  const token = properties.getProperty('TELEGRAM_TOKEN');
  const webhookUrl = properties.getProperty('WEBHOOK_DEPLOYMENT_URL');
  
  const tokenStatus = token ? '✅ Ustawiony' : '❌ Nie ustawiony';
  const webhookStatus = webhookUrl ? '✅ Ustawiony' : '❌ Nie ustawiony';
  
  const message = `
🔐 Status bezpieczeństwa:
Token Telegrama: ${tokenStatus}
Webhook URL: ${webhookStatus}

Aby ustawić/zmienić:
1. Token: ⚙️ System Kadrowy → 🔐 Inicjalizuj sekretne dane
2. URL: ⚙️ System Kadrowy → 📡 Ustaw Deployment ID dla Webhook'a
  `;
  
  SpreadsheetApp.getUi().alert(message);
  Logger.log('Config status - Token:', tokenStatus, ', Webhook:', webhookStatus);
}
