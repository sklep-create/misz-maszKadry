/**
 * Ustawienia globalne projektu
 */
const CONFIG = {
  TELEGRAM_TOKEN: '8051306652:AAE4os8j1S4y0rR34VK3pBBlcjM_kgec3xs',
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
 * Pobiera aktualny PIN z zakładki 'Ustawienia' (Komórka B1)
 */
function getSystemPin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  return sheet.getRange("B1").getValue().toString().trim();
}

/**
 * Ustawia Webhook dla Bota Telegram (Uruchomić jednorazowo)
 */
function setupTelegramWebhook() {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/setWebhook?url=${CONFIG.WEBHOOK_URL}`;
  const response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}