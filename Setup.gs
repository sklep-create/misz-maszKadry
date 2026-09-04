/**
 * Automatyczne wywołanie przy otwarciu pliku Arkusza XXX.
 * Tworzy własne menu na pasku narzędzi po sekcji "Pomoc".
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('⚙️ System Kadrowy')
    .addItem('🚀 Wygeneruj bazę danych (Pierwsze uruchomienie)', 'setupDatabaseStructure')
    .addItem('🔐 Inicjalizuj sekretne dane (PIERWSZE URUCHOMIENIE)', 'initializeSecrets')
    .addItem('🗂️ Zapamiętaj ID tego Arkusza (wymagane dla bota)', 'setSpreadsheetId')
    .addItem('🔍 Status konfiguracji', 'checkSecretsStatus')    
    .addSeparator()    
    .addItem('👔 Ustaw Telegram ID Pracodawców', 'setEmployerTelegramIds')
    .addSeparator()    
    .addItem('🔔 Uruchom sprawdzanie braku START', 'checkMissingStartLogs')
    .addSeparator()
    .addItem('🔗 Skonfiguruj Telegram Webhook', 'setupTelegramWebhook')
    .addItem('📡 Ustaw Deployment ID dla Webhook\'a', 'setWebhookDeploymentId')
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠️ Narzędzia Bota (diagnostyka)'))
      .addItem('🔍 Pełna diagnostyka bota', 'runFullBotDiagnostics')
      .addItem('🤖 Sprawdź token bota (getMe)', 'telegramGetMe')
      .addItem('📡 Pokaż webhook info', 'telegramGetWebhookInfo')
      .addItem('🔗 Ustaw webhook (z zapisanych danych)', 'telegramSetWebhookNow')
      .addItem('🧹 Wyczyść pendną kolejkę (flush)', 'telegramFlushUpdates')
      .addItem('🗑️ USUŃ webhook (reset)', 'telegramResetWebhook')
      .addItem('✉️ Wyślij wiadomość testową', 'telegramSendTestMessage')
    .addToUi();
}

/**
 * Wyskakujące okienko z prośbą o link do nowego wdrożenia aplikacji (deployment URL)
 * Link powinien kończyć się na /exec
 */
function setWebhookDeploymentId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '📡 Konfiguracja URL Webhook\'a (adres Web App /exec)\n\n' +
    'Wklej tutaj adres Web App z wdrożenia Apps Script:\n' +
    '(musi kończyć się na /exec, np.: https://script.google.com/macros/s/[ID]/exec)',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const deploymentUrl = response.getResponseText().trim();
    
    // Validacja URL
    if (!deploymentUrl || deploymentUrl.length < 20) {
      ui.alert('❌ URL jest zbyt krótki. Upewnij się, że wklejasz pełny link.');
      return;
    }
    
    if (!deploymentUrl.includes('script.google.com')) {
      ui.alert('❌ URL musi zawierać "script.google.com"');
      return;
    }
    
    // Jedynym poprawnym adresem, na który Telegram może wysyłać wiadomości, jest adres Web App /exec
    if (!deploymentUrl.includes('/exec')) {
      ui.alert('❌ URL musi kończyć się na "/exec" (adres Web App).\n\nPrzykład:\nhttps://script.google.com/macros/s/[ID]/exec\n\nTo jedyny adres, na który Telegram wysyła wiadomości (webhook).');
      return;
    }
    
    // Zapisz URL w Properties Service
    PropertiesService.getScriptProperties().setProperty('WEBHOOK_DEPLOYMENT_URL', deploymentUrl);
    
    // Zaktualizuj CONFIG.WEBHOOK_URL
    try {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
      
      if (sheet) {
        // Szukamy wiersza z WEBHOOK_URL
        const data = sheet.getDataRange().getValues();
        for (let i = 0; i < data.length; i++) {
          if (data[i][0] === 'WEBHOOK_URL' || data[i][0] === 'Webhook URL') {
            sheet.getRange(i + 1, 2).setValue(deploymentUrl);
            break;
          }
        }

      }
    } catch (err) {
      Logger.log('Uwaga: Nie udało się zaktualizować arkusza: ' + err.toString());
    }
    
    const configureWebhookNow = ui.alert(
      '✅ Deployment URL został bezpiecznie zapisany!\n\n' +
      'Link: ' + deploymentUrl + '\n\n' +
      'Czy chcesz teraz skonfigurować webhook Telegrama?',
      ui.ButtonSet.YES_NO
    );

    if (configureWebhookNow === ui.Button.YES) {
      setupTelegramWebhook();
    }
    
    Logger.log('✅ Webhook Deployment URL został zapisany: ' + deploymentUrl);
  }
}

function setEmployerTelegramIds() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '👔 Konfiguracja Telegram ID Pracodawców\n\n' +
    'Podaj jeden lub wiele ID rozdzielonych przecinkami.\n' +
    'Nowe ID zostaną dopisane do istniejącej listy.\n' +
    'Przykład: 123456789,987654321',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const raw = response.getResponseText().trim();
  const ids = parseEmployerTelegramIds(raw);
  
  if (!ids.length) {
    ui.alert('❌ Nie podano poprawnego numerycznego ID.');
    return;
  }
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === 'PRACODAWCY_TELEGRAM_IDS') {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1).setValue('PRACODAWCY_TELEGRAM_IDS');
  }
  
  const existingIds = getEmployerTelegramIds();
  const mergedIds = Array.from(new Set(existingIds.concat(ids)));
  const addedCount = mergedIds.length - existingIds.length;
  const clearWidth = Math.max(sheet.getLastColumn() - 1, mergedIds.length, 1);
  sheet.getRange(rowIndex, 2, 1, clearWidth).clearContent();
  sheet.getRange(rowIndex, 2, 1, mergedIds.length).setValues([mergedIds]);
  
  ui.alert(`✅ Zapisano ${mergedIds.length} ID pracodawców (dodano ${addedCount} nowych).`);
}

/**
 * Pobiera Deployment URL z Properties Service
 */
function getWebhookDeploymentUrl() {
  const url = PropertiesService.getScriptProperties().getProperty('WEBHOOK_DEPLOYMENT_URL');
  
  if (!url || url === '') {
    Logger.log('⚠️ UWAGA: Deployment URL nie jest ustawiony!');
    Logger.log('Uruchom funkcję: setWebhookDeploymentId()');
    throw new Error('Webhook Deployment URL is not configured. Run setWebhookDeploymentId() first.');
  }
  
  return url;
}

/**
 * Automatyczny generator bazy danych dla systemu ewidencji czasu pracy
 */
function setupDatabaseStructure() {
  const ss = getSpreadsheet();
  
  const schema = {
    'Ustawienia': {
      color: '#4A5568',
      headers: ['Parametr', 'Wartość', 'Opis'],
      initialData: [
        ['PIN_SYSTEMOWY', '1234', 'Jednolicie obowiązujący kod PIN autoryzacji bota w Telegramie'],
        ['NAZWA_FIRMY', 'Moja Firma Sp. z o.o.', 'Nazwa firmy widoczna w raportach'],
        ['NORMA_ETAT_UOP', '8', 'Standardowa norma dobowa dla UoP (godziny)'],
        ['NORMA_OZN_UOP', '7', 'Norma dobowa dla pracowników OzN (stopień umiarkowany/znaczny)'],
        ['MIESIAC_GRAFIKU', '2026-10', 'Aktualnie planowany miesiąc grafiku (YYYY-MM)'],
        ['WEBHOOK_URL', '', 'URL wdrożenia Apps Script do webhook\'a Telegrama'],
        ['PRACODAWCY_TELEGRAM_IDS', '', 'ID Telegram pracodawców (kolumny B..N)']
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
        'Status_Autoryzacji', // OczekujeNaPIN / Autoryzowany / Zablokowany
        'Staz_Pracy_Lata',    
        'Licz_błędy',         // Licznik prób PIN
        'PIN',                // Jednorazowy PIN rejestracyjny
        'Roczny_Limit_Urlopu'
      ],
      initialData: [
        ['EMP-001', '', 'Jan Kowalski', 'UoP', 1.0, 'Brak', 'Autoryzowany', 12, 3, '', 26],
        ['EMP-002', '', 'Anna Nowak', 'UoP', 1.0, 'Umiarkowany', 'OczekujeNaPIN', 4, 3, '', 30],
        ['EMP-003', '', 'Piotr Wiśniewski', 'UZ', 1.0, 'Brak', 'OczekujeNaPIN', 2, 3, '', 0]
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
