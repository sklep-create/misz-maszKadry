/**
 * Ustawienia globalne projektu
 * 
 * ⚠️ WAŻNE: Token Telegrama jest przechowywany w Properties Service (zmienne sekretne)
 * Aby ustawić token po raz pierwszy, uruchom: initializeSecrets()
 */
const CONFIG = {
  // Token pobierany dynamicznie z Properties Service
  get TELEGRAM_TOKEN() {
    return PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || 'NOT_SET';
  },
  
  WEBHOOK_URL: 'TUTAJ_WSTAWDZ_URL_WDROZENIA_APPS_SCRIPT',
  
  // Nazwy zakładek w Arkuszu Google
  SHEETS: {
    SETTINGS: 'Ustawienia',
    EMPLOYEES: 'Pracownicy',
    SCHEDULE: 'Grafik',
    TIMELOG: 'Ewidencja',
    LEAVES: 'Wnioski'
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
 * Pobiera aktualny PIN z zakładki 'Ustawienia' (Komórka B2)
 */
function getSystemPin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  return sheet.getRange("B2").getValue().toString().trim();
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
 * Ustawia Webhook dla Bota Telegram (Uruchomić jednorazowo)
 */
function setupTelegramWebhook() {
  try {
    const token = getTelegramToken();
    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${CONFIG.WEBHOOK_URL}`;
    const response = UrlFetchApp.fetch(url);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      SpreadsheetApp.getUi().alert('✅ Webhook Telegrama został pomyślnie skonfigurowany!');
      Logger.log('✅ Webhook setup successful:', result);
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
  
  const status = token ? '✅ Ustawiony' : '❌ Nie ustawiony';
  const message = `
🔐 Status bezpieczeństwa:
Token Telegrama: ${status}

Aby ustawić/zmienić token:
1. Uruchom: initializeSecrets()
2. Wklej token w wyskakującym oknie
  `;
  
  SpreadsheetApp.getUi().alert(message);
  Logger.log('Token status:', status);
}
