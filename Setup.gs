/**
 * Automatyczne wywołanie przy otwarciu pliku Arkusza.
 * Tworzy własne menu na pasku narzędzi po sekcji "Pomoc".
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('⚙️ System Kadrowy')
    .addItem('🚀 Wygeneruj bazę danych (Pierwsze uruchomienie)', 'setupDatabaseStructure')
    .addSeparator()
    .addItem('🔗 Skonfiguruj Telegram Webhook', 'setupTelegramWebhook')
    .addItem('🔔 Uruchom sprawdzanie braku START', 'checkMissingStartLogs')
    .addToUi();
}

/**
 * Automatyczny generator bazy danych dla systemu ewidencji czasu pracy
 */
function setupDatabaseStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const schema = {
    'Ustawienia': {
      color: '#4A5568',
      headers: ['Parametr', 'Wartość', 'Opis'],
      initialData: [
        ['PIN_SYSTEMOWY', '1234', 'Jednolicie obowiązujący kod PIN autoryzacji bota w Telegramie'],
        ['NAZWA_FIRMY', 'Moja Firma Sp. z o.o.', 'Nazwa firmy widoczna w raportach'],
        ['NORMA_ETAT_UOP', '8', 'Standardowa norma dobowa dla UoP (godziny)'],
        ['NORMA_OZN_UOP', '7', 'Norma dobowa dla pracowników OzN (stopień umiarkowany/znaczny)'],
        ['MIESIAC_GRAFIKU', '2026-10', 'Aktualnie planowany miesiąc grafiku (YYYY-MM)']
      ]
    },
    'Pracownicy': {
      color: '#2B6CB0',
      headers: [
        'ID_Pracownika', 
        'Telegram_ChatID', 
        'Imie_Nazwisko', 
        'Forma_Zatrudnienia', 
        'Wymiar_Etatu',       
        'Stopien_OZN',        
        'Status_Autoryzacji', 
        'Staz_Pracy_Lata',    
        'Roczny_Limit_Urlopu' 
      ],
      initialData: [
        ['EMP-001', '', 'Jan Kowalski', 'UoP', 1.0, 'Brak', true, 12, 26],
        ['EMP-002', '', 'Anna Nowak', 'UoP', 1.0, 'Umiarkowany', false, 4, 30],
        ['EMP-003', '', 'Piotr Wiśniewski', 'UZ', 1.0, 'Brak', false, 2, 0]
      ]
    },
    'Grafik': {
      color: '#2D3748',
      headers: ['ID_Grafiku', 'ID_Pracownika', 'Data', 'Planowany_Start', 'Planowany_Stop', 'Typ_Dnia'],
      initialData: []
    },
    'Ewidencja': {
      color: '#2F855A',
      headers: ['ID_Logu', 'ID_Pracownika', 'Data', 'Czas_Zdazenia', 'Typ_Zdazenia', 'Zrodlo', 'Status'],
      initialData: []
    },
    'Wnioski': {
      color: '#D69E2E',
      headers: ['ID_Wniosku', 'ID_Pracownika', 'Typ_Wniosku', 'Data_Od', 'Data_Do', 'Status_Akceptacji', 'Plik_GDrive_URL', 'Uwagi'],
      initialData: []
    }
  };

  Object.keys(schema).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }

    const config = schema[sheetName];
    const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
    
    headerRange.setValues([config.headers]);
    headerRange.setBackground(config.color)
               .setFontColor('#FFFFFF')
               .setFontWeight('bold')
               .setHorizontalAlignment('center')
               .setVerticalAlignment('middle');

    if (config.initialData && config.initialData.length > 0) {
      const dataRange = sheet.getRange(2, 1, config.initialData.length, config.headers.length);
      dataRange.setValues(config.initialData);
    }

    sheet.setRowHeight(1, 35);
    sheet.setFrozenRows(1);
    
    for (let col = 1; col <= config.headers.length; col++) {
      sheet.autoResizeColumn(col);
      if (sheet.getColumnWidth(col) < 120) {
        sheet.setColumnWidth(col, 140);
      }
    }
  });

  const defaultSheet = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert('✅ Baza danych została pomyślnie wygenerowana!');
}