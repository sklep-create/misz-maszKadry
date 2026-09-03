/**
 * Automatyczny generator bazy danych dla systemu ewidencji czasu pracy
 * Tworzy zakładki, nagłówki, formatowanie i dane początkowe.
 */
function setupDatabaseStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Słownik struktur tabel
  const schema = {
    'Ustawienia': {
      color: '#4A5568', // Ciemnoszary
      headers: ['Parametr', 'Wartość', 'Opis'],
      initialData: [
        ['PIN_SYSTEMOWY', '1234', 'Jednolicie obowiązujący kod PIN autoryzacji bota w Telegramie'],
        ['NAZWA_FIRMY', 'Moja Firma Sp. z o.o.', 'Nazwa firmy widoczna w raportach'],
        ['NORMA_ETAT_UOP', '8', 'Standardowa norma dobowa dla UoP (godziny)'],
        ['NORMA_OZN_UOP', '7', 'Norma dobowa dla pracowników OzN (stopień umiarkowany/znaczny)'],
        ['MIESIAC_GRAFIKU', '2026-10', 'Aktualnie planowany miesiąc grafiku (YYYY-MM)'],
        ['PRACODAWCY_TELEGRAM_IDS', '', 'ID Telegram pracodawców (kolumny B..N)']
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
        'Roczny_Limit_Urlopu' // 20, 26, 30 (+10 OzN)
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
      initialData: []
    },
    'Ewidencja': {
      color: '#2F855A', // Zielony
      headers: [
        'ID_Logu', 
        'ID_Pracownika', 
        'Data',              // YYYY-MM-DD
        'Czas_Zdazenia',     // HH:mm:ss
        'Typ_Zdazenia',      // START / STOP
        'Zrodlo',            // Telegram / Dashboard / Korekta
        'Status'             // Zatwierdzone / Anulowane
      ],
      initialData: []
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
      initialData: []
    }
  };

  // Iteracja po zakładkach i tworzenie struktur
  Object.keys(schema).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    
    // Tworzenie zakładki, jeśli nie istnieje
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear(); // Wyczyszczenie istniejącej zawartości przed nadpisaniem
    }

    const config = schema[sheetName];
    
    // 1. Dodanie nagłówków
    const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
    headerRange.setValues([config.headers]);
    
    // Formatowanie nagłówka
    headerRange.setBackground(config.color)
               .setFontColor('#FFFFFF')
               .setFontWeight('bold')
               .setHorizontalAlignment('center')
               .setVerticalAlignment('middle');

    // 2. Wstawienie danych początkowych (jeśli istnieją)
    if (config.initialData && config.initialData.length > 0) {
      const dataRange = sheet.getRange(2, 1, config.initialData.length, config.headers.length);
      dataRange.setValues(config.initialData);
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
  });

  // Usunięcie domyślnego "Arkusz1" / "Sheet1", jeśli istnieje i nie jest już jedyny
  const defaultSheet = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // Wyświetlenie powiadomienia w edytorze
  SpreadsheetApp.getUi().alert('✅ Baza danych w Google Sheets została pomyślnie wygenerowana i sformatowana!');
}