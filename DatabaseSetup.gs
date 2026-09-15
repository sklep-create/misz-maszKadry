/**
 * Automatyczny generator bazy danych dla systemu ewidencji czasu pracy
 * Tworzy zakładki, nagłówki, formatowanie i dane początkowe.
 */

/**
 * Słownik struktur tabel (nazwa arkusza -> kolor, nagłówki, dane początkowe).
 * Współdzielony przez pełną regenerację (setupDatabaseStructure) i
 * przebudowę pojedynczego arkusza (rebuildSingleSheet).
 */
function getDatabaseSchema() {
  return {
    'Ustawienia': {
      color: '#4A5568', // Ciemnoszary
      // Układ kolumnowy: nagłówek = nazwa ustawienia, wartości pod spodem.
      // NAZWA_FIRMY/logo/normy/miesiąc/webhook/NADGODZINY mają jedną wartość
      // (wiersz 2). PRACODAWCY_TELEGRAM_IDS i dni/godziny pracy mają po
      // jednej wartości na wiersz (rosnąco w dół), niezależnie od
      // pozostałych kolumn.
      headers: [
        'NAZWA_FIRMY', 'logo', 'NORMA_ETAT_UOP', 'NORMA_OZN_UOP',
        'MIESIAC_GRAFIKU', 'WEBHOOK_URL', 'PRACODAWCY_TELEGRAM_IDS',
        'dni pracy', 'godziny pracy',
        'NADGODZINY', // TAK/NIE - globalna zgoda firmy na nadgodziny (patrz isOvertimeAllowed() w Config.gs). OzN nigdy nie ma nadgodzin, niezależnie od tej wartości.
        'DNI_GRAFIKU',           // liczba dni okresu grafiku (np. 14, 20); puste = cały kalendarzowy miesiąc. Patrz getNextGrafikPeriod() w GrafikGeneratorService.gs.
        'OSTATNI_DZIEN_GRAFIKU', // YYYY-MM-DD ostatniego dnia już wygenerowanego okresu - ustawiane automatycznie, nie edytuj ręcznie.
        'GOOGLE_PLACES_API_KEY', // klucz do publicznego Places API (New) - ten sam, którego używa strona misz-masz.cc do pokazywania godzin na żywo.
        'GOOGLE_PLACE_ID',       // ID lokalizacji w Google Maps - też ten sam co na stronie.
        'APPS_SCRIPT_EDITOR_URL' // Link do edytora Apps Script (standalone projekt) - "Rozszerzenia → Apps Script" w arkuszu NIE otwiera tego projektu (patrz notatka o migracji w CLAUDE.md), więc link trzeba trzymać tutaj.
      ],
      initialData: [
        ['Moja Firma Sp. z o.o.', '', 8, 7, '2026-10', '', '', 'Poniedziałek', '8.00 - 16.00', 'NIE', '', '', '', '', 'https://script.google.com/d/1qRQLX_ljI23OK4-EFg6UYHCngRhvkHT212KH83IYPkluIMasMaYOth-i/edit'],
        ['', '', '', '', '', '', '', 'Wtorek', '8.00 - 16.00', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', 'Środa', '8.00 - 16.00', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', 'Czwartek', '8.00 - 16.00', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', 'Piątek', '8.00 - 16.00', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', 'Sobota', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', 'Niedziela', '', '', '', '', '', '', '']
      ]
    },
    'Pracownicy': {
      color: '#2B6CB0', // Niebieski
      headers: [
        'ID_Pracownika',
        'Telegram_ChatID',
        'Imie_Nazwisko',
        'Forma_Zatrudnienia', // UoP / UZ / B2B
        'Wymiar_Etatu',       // 1.0, 0.5, 0.75
        'Stopien_OZN',        // Brak / Lekki / Umiarkowany / Znaczny
        'Status_Autoryzacji', // OczekujeNaPIN / Autoryzowany / Zablokowany
        'Staz_Pracy_Lata',    // Łączny staż pracy z edukacją
        'Licz_błędy',         // Licznik prób PIN
        'PIN',                // Jednorazowy PIN rejestracyjny
        'Suma_Urlopów'        // 20, 26, 30 (+10 OzN)
      ],
      initialData: [
        ['EMP-001', '', 'Jan Kowalski', 'UoP', 1.0, 'Brak', 'Autoryzowany', 12, 3, '', 26],
        ['EMP-002', '', 'Anna Nowak', 'UoP', 1.0, 'Umiarkowany', 'OczekujeNaPIN', 4, 3, '', 30], // 20 + 10 OzN
        ['EMP-003', '', 'Piotr Wiśniewski', 'UZ', 1.0, 'Brak', 'OczekujeNaPIN', 2, 3, '', 0]
      ]
    },
    'Grafik': {
      color: '#2D3748', // Szary
      headers: [
        'ID_Grafiku',
        'ID_Pracownika',
        'Data',              // YYYY-MM-DD
        'Planowany_Start',   // HH:mm
        'Planowany_Stop',    // HH:mm
        'Typ_Dnia'           // Praca / Wolne / Urlop / Chorobowe
      ],
      initialData: [
        ['GRF-001', 'EMP-001', '2026-09-14', '08:00', '16:00', 'Praca'],
        ['GRF-002', 'EMP-002', '2026-09-14', '07:00', '14:00', 'Praca'],
        ['GRF-003', 'EMP-003', '2026-09-14', '', '', 'Wolne'],
        ['GRF-004', 'EMP-001', '2026-09-15', '08:00', '16:00', 'Praca']
      ]
    },
    'Ewidencja': {
      color: '#2F855A', // Zielony
      // Jeden wiersz = jeden dzień pracy danego pracownika. Czas_Start /
      // Czas_Stop wypełnia pracownik (START/STOP w Telegramie/Mini App).
      // Nadgodziny i Przepracowane wypełnia Pracodawca przy zatwierdzaniu:
      // Nadgodziny=NIE -> Przepracowane = norma dobowa (8h lub 7h dla OzN,
      // niezależnie od faktycznego Czas_Start/Czas_Stop);
      // Nadgodziny=TAK -> Przepracowane = dokładny faktyczny czas (np. 7:45).
      // Dopóki Przepracowane jest puste, dzień czeka na zatwierdzenie.
      headers: [
        'ID_Logu',
        'ID_Pracownika',
        'Data',              // YYYY-MM-DD
        'Czas_Start',        // HH:mm:ss
        'Czas_Stop',         // HH:mm:ss
        'Nadgodziny',        // TAK / NIE (wypełnia Pracodawca)
        'Przepracowane'      // HH:mm (wypełnia Pracodawca)
      ],
      // Przykładowe dni czekające na zatwierdzenie - do testowania Panelu
      // Pracodawcy: EMP-001 (pełny etat, 10h surowego czasu) i EMP-002
      // (OzN, 6:55 surowego czasu), plus jeden wiersz "w trakcie pracy".
      initialData: [
        ['LOG-001', 'EMP-001', '2026-09-08', '08:00:00', '18:00:00', '', ''],
        ['LOG-002', 'EMP-002', '2026-09-08', '07:55:00', '14:50:00', '', ''],
        ['LOG-003', 'EMP-001', '2026-09-09', '08:05:00', '', '', '']
      ]
    },
    'Wnioski': {
      color: '#D69E2E', // Żółty/Bursztynowy
      headers: [
        'ID_Wniosku',
        'ID_Pracownika',
        'Typ_Wniosku',       // Urlop Wypoczynkowy / Urlop OzN / Turnus Rehabilitacyjny / e-ZLA / Korekta START
        'Data_Od',
        'Data_Do',
        'Status_Akceptacji', // Oczekuje / Zatwierdzony / Odrzucony
        'Plik_GDrive_URL',   // Link do skanu/orzeczenia na Dysku Google
        'Uwagi'
      ],
      initialData: [
        ['WN-001', 'EMP-001', 'Urlop Wypoczynkowy', '2026-10-05', '2026-10-09', 'Oczekuje', '', ''],
        ['WN-002', 'EMP-002', 'Urlop OzN', '2026-09-20', '2026-09-20', 'Zatwierdzony', '', 'Turnus rehabilitacyjny'],
        ['WN-003', 'EMP-003', 'e-ZLA', '2026-09-10', '2026-09-12', 'Zatwierdzony', '', '']
      ]
    },
    'Dyspozycyjność': {
      color: '#6B46C1', // Fioletowy
      headers: ['ID_Dyspozycji', 'ID_Pracownika', 'Miesiac', 'Dni_Wolne', 'Data_Aktualizacji'],
      // Dni_Wolne (kolumna 4) to lista dni po przecinku (np. "5,12,19") -
      // musi zostać zapisana jako czysty tekst (patrz textColumns w
      // buildSheetFromSchema), inaczej Arkusze przy polskiej lokalizacji
      // (przecinek = separator dziesiętny) próbują to sparsować jako liczbę
      // i psują wartość (np. "20,5,6,7" -> "2005,6,7").
      textColumns: [4],
      initialData: [
        ['DYSP-001', 'EMP-001', '2026-10', '5,12,19,26', '2026-09-01'],
        ['DYSP-002', 'EMP-002', '2026-10', '3,10,17,24,31', '2026-09-01']
      ]
    },
    'Dni wolne': {
      color: '#38A169', // Zielony
      // DWIE OSOBNE tabele obok siebie w tej samej zakładce:
      // - A-C "Ustawowe": generowane automatycznie dla 3 lat (poprzedni,
      //   obecny, kolejny), nadpisywane przy każdym odświeżeniu - NIE edytuj
      //   ręcznie (patrz refreshDniWolneSheet() w AvailabilityService.gs).
      // - E-G "Własne": dopisujesz/edytujesz sam (lokalne święto, dodatkowy
      //   dzień zamknięcia sklepu) - odświeżanie nigdy tego nie rusza.
      headers: ['Data', 'Nazwa', 'Rodzaj'], // A-C, Rodzaj zawsze "Ustawowe"
      initialData: [],
      secondBlock: {
        startColumn: 5, // E
        color: '#DD6B20', // Pomarańczowy - wizualnie odróżnia od Ustawowe
        headers: ['Data', 'Nazwa', 'Rodzaj'] // E-G, Rodzaj zawsze "Dodatkowe"
      },
      // Przykładowy wzór własnego dnia wolnego - podmień na realną datę/nazwę.
      secondBlockInitialData: [
        ['2026-12-24', 'Wigilia (dodatkowy dzień wolny sklepu)', 'Dodatkowe']
      ]
    }
  };
}

/**
 * Tworzy (lub czyści i odtwarza) jeden arkusz wg podanej konfiguracji ze
 * schematu: nagłówki, formatowanie, szerokość kolumn. Arkusz zostaje PUSTY
 * (bez danych) — przykładowe dane wstawia się osobno, przyciskiem
 * "📋 Wstaw przykładowe dane" (insertSampleDataIntoActiveSheet).
 */
function buildSheetFromSchema(ss, sheetName, config) {
  let sheet = ss.getSheetByName(sheetName);

  // Tworzenie zakładki, jeśli nie istnieje
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clear(); // Wyczyszczenie istniejącej zawartości przed nadpisaniem
  }

  // 1. Dodanie nagłówków
  const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
  headerRange.setValues([config.headers]);

  // Formatowanie nagłówka
  headerRange.setBackground(config.color)
             .setFontColor('#FFFFFF')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');

  // 2. Kolumny, które muszą być czystym tekstem (np. lista dni po przecinku) -
  // ustawione PRZED wpisaniem jakichkolwiek danych, żeby Arkusze nie próbowały
  // ich sparsować jako liczbę/datę wg lokalizacji.
  if (config.textColumns && config.textColumns.length) {
    config.textColumns.forEach(function (colIndex) {
      sheet.getRange(1, colIndex, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
  }

  // 3. Estetyka i dopasowanie kolumn
  sheet.setRowHeight(1, 35); // Wyższy wiersz nagłówka
  sheet.setFrozenRows(1);    // Zamrożenie wiersza nagłówkowego

  // Automatyczne wyrównanie szerokości kolumn
  for (let col = 1; col <= config.headers.length; col++) {
    sheet.autoResizeColumn(col);
    // Minimalna szerokość kolumny dla estetyki
    if (sheet.getColumnWidth(col) < 120) {
      sheet.setColumnWidth(col, 140);
    }
  }

  // 4. Drugi, osobny blok nagłówków obok pierwszego (np. "Dni wolne": A-C
  // Ustawowe + E-G Własne w tej samej zakładce) - opcjonalny, tylko jeśli
  // schemat go definiuje.
  if (config.secondBlock) {
    const sb = config.secondBlock;
    const sbHeaderRange = sheet.getRange(1, sb.startColumn, 1, sb.headers.length);
    sbHeaderRange.setValues([sb.headers]);
    sbHeaderRange.setBackground(sb.color || config.color)
                 .setFontColor('#FFFFFF')
                 .setFontWeight('bold')
                 .setHorizontalAlignment('center')
                 .setVerticalAlignment('middle');

    for (let col = sb.startColumn; col < sb.startColumn + sb.headers.length; col++) {
      sheet.autoResizeColumn(col);
      if (sheet.getColumnWidth(col) < 120) {
        sheet.setColumnWidth(col, 140);
      }
    }
  }

  return sheet;
}

/**
 * Dopisuje do arkusza Ustawienia brakujące nagłówki kolumn ze schematu, BEZ
 * ruszania istniejących danych - bezpieczne uzupełnienie żywego arkusza po
 * dodaniu nowych ustawień do generatora (np. DNI_GRAFIKU). Uruchom RAZ z
 * edytora albo menu, kiedy schemat się zmieni.
 */
function ensureSettingsColumnsExist() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const schema = getDatabaseSchema()['Ustawienia'];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  // Porównanie bez rozróżniania wielkości liter - "Nadgodziny" i "NADGODZINY"
  // to dla ludzi ta sama kolumna, nie powinny stać się dwoma osobnymi.
  const existingLower = existingHeaders.map(function (h) { return (h || '').toString().trim().toLowerCase(); });

  const missing = schema.headers.filter(function (h) {
    return existingLower.indexOf(h.toLowerCase()) === -1;
  });

  let msg;
  if (missing.length === 0) {
    msg = 'ℹ️ Wszystkie kolumny ze schematu już istnieją w Ustawieniach.';
  } else {
    const startCol = lastCol + 1;
    const headerRange = sheet.getRange(1, startCol, 1, missing.length);
    headerRange.setValues([missing]);
    headerRange.setBackground(schema.color)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    for (let i = 0; i < missing.length; i++) {
      sheet.autoResizeColumn(startCol + i);
    }

    msg = '✅ Dodano brakujące kolumny: ' + missing.join(', ');
  }

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * Generuje / regeneruje WSZYSTKIE arkusze systemu od zera (czyści istniejące).
 * Użyj przy pierwszym uruchomieniu — na arkuszu z prawdziwymi danymi
 * skorzystaj raczej z "🔁 Przebuduj wybrany arkusz od nowa", żeby nie
 * skasować danych w pozostałych zakładkach.
 */
function setupDatabaseStructure() {
  const ss = getSpreadsheet();
  const schema = getDatabaseSchema();

  Object.keys(schema).forEach(sheetName => {
    buildSheetFromSchema(ss, sheetName, schema[sheetName]);
  });

  // Usunięcie domyślnego "Arkusz1" / "Sheet1", jeśli istnieje i nie jest już jedyny
  const defaultSheet = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // Wyświetlenie powiadomienia w edytorze
  SpreadsheetApp.getUi().alert('✅ Baza danych w Google Sheets została pomyślnie wygenerowana i sformatowana!');
}

/**
 * Otwiera okno dialogowe z listą arkuszy systemu (z listy rozwijanej) do
 * przebudowania od zera — czyści i odtwarza TYLKO wybrany arkusz, reszta
 * (i inne zakładki spoza schematu) zostaje nietknięta.
 */
function showRebuildSheetDialog() {
  const schema = getDatabaseSchema();
  const sheetNames = Object.keys(schema);

  const options = sheetNames
    .map(name => `<option value="${name}">${name}</option>`)
    .join('');

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 4px 8px; }
      p.warn { color: #a94442; }
      select { width: 100%; padding: 6px; margin: 10px 0; font-size: 13px; }
      button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
      #rebuildBtn { background: #d9534f; color: #fff; border: none; border-radius: 4px; }
      #rebuildBtn:disabled { opacity: 0.6; cursor: wait; }
      #status { margin-top: 10px; font-size: 12px; }
    </style>
    <p>Wybierz arkusz do przebudowania od nowa.</p>
    <p class="warn">⚠️ Wszystkie dane w wybranym arkuszu zostaną skasowane i zastąpione pustym szablonem (same nagłówki, bez danych).</p>
    <select id="sheetSelect">${options}</select>
    <br>
    <button id="rebuildBtn" onclick="rebuild()">🔁 Przebuduj arkusz</button>
    <div id="status"></div>
    <script>
      function rebuild() {
        const sheetName = document.getElementById('sheetSelect').value;
        if (!confirm('Na pewno przebudować arkusz "' + sheetName + '" od nowa? Obecne dane w tym arkuszu zostaną skasowane.')) {
          return;
        }
        const btn = document.getElementById('rebuildBtn');
        btn.disabled = true;
        document.getElementById('status').textContent = 'Przebudowuję...';
        google.script.run
          .withSuccessHandler(function (result) {
            document.getElementById('status').textContent = result;
            btn.disabled = false;
          })
          .withFailureHandler(function (err) {
            document.getElementById('status').textContent = '❌ ' + err.message;
            btn.disabled = false;
          })
          .rebuildSingleSheet(sheetName);
      }
    </script>
  `).setWidth(360).setHeight(230);

  SpreadsheetApp.getUi().showModalDialog(html, '🔁 Przebuduj wybrany arkusz');
}

/**
 * Czyści i odtwarza od zera JEDEN arkusz na podstawie schematu (wywoływane
 * z okna dialogowego showRebuildSheetDialog).
 * @param {string} sheetName Nazwa arkusza ze schematu (np. "Ewidencja").
 * @returns {string} Komunikat wyniku.
 */
function rebuildSingleSheet(sheetName) {
  const schema = getDatabaseSchema();
  const config = schema[sheetName];

  if (!config) {
    throw new Error('Nieznany arkusz: ' + sheetName);
  }

  buildSheetFromSchema(getSpreadsheet(), sheetName, config);

  return '✅ Arkusz "' + sheetName + '" został przebudowany od nowa.';
}

/**
 * Wstawia przykładowe dane ze schematu do arkusza, który jest AKTUALNIE
 * OTWARTY (aktywny) w edytorze — nigdy do całego pliku naraz. Nadpisuje
 * tylko wiersze 2..N pod nagłówkiem, resztę arkusza zostawia bez zmian.
 */
function insertSampleDataIntoActiveSheet() {
  const ui = SpreadsheetApp.getUi();
  // Uwaga: celowo SpreadsheetApp.getActiveSheet() (nie getSpreadsheet()) -
  // ma odzwierciedlać kartę faktycznie otwartą w przeglądarce użytkownika,
  // a getSpreadsheet() przy ustawionym SPREADSHEET_ID otwiera plik przez
  // openById() i traci tę informację (zwraca np. zawsze pierwszą zakładkę).
  const sheet = SpreadsheetApp.getActiveSheet();
  const sheetName = sheet.getName();
  const schema = getDatabaseSchema();
  const config = schema[sheetName];

  if (!config) {
    ui.alert('⚠️ Arkusz "' + sheetName + '" nie jest częścią schematu systemu — brak dla niego przykładowych danych.');
    return;
  }

  const hasMainData = config.initialData && config.initialData.length > 0;
  const hasSecondBlockData = config.secondBlock && config.secondBlockInitialData && config.secondBlockInitialData.length > 0;

  if (!hasMainData && !hasSecondBlockData) {
    ui.alert('ℹ️ Arkusz "' + sheetName + '" nie ma zdefiniowanych przykładowych danych w schemacie.');
    return;
  }

  const response = ui.alert(
    '📋 Wstaw przykładowe dane',
    'Wstawić przykładowe dane do otwartego arkusza "' + sheetName + '"?\n\n' +
      'Nadpisze to odpowiednie wiersze w TYM arkuszu (reszta pliku zostaje bez zmian).',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  if (hasMainData) {
    sheet.getRange(2, 1, config.initialData.length, config.headers.length).setValues(config.initialData);
  }

  if (hasSecondBlockData) {
    sheet.getRange(2, config.secondBlock.startColumn, config.secondBlockInitialData.length, config.secondBlock.headers.length)
      .setValues(config.secondBlockInitialData);
  }

  ui.alert('✅ Wstawiono przykładowe dane do arkusza "' + sheetName + '".');
}
