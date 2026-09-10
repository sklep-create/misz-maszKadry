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
    AVAILABILITY: 'Dyspozycyjność'
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
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  return sheet.getRange("B2").getValue().toString().trim();
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
 * Ustawia Webhook dla Bota Telegram (Uruchomić jednorazowo)
 */
function setupTelegramWebhook() {
  try {
    const token = getTelegramToken();
    const webhookUrl = getEffectiveTelegramWebhookUrl();
    
    const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
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
