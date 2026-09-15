/**
 * Automatyczne wywołanie przy otwarciu pliku Arkusza XXX.
 * Tworzy własne menu na pasku narzędzi po sekcji "Pomoc".
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const setupMenu = ui.createMenu('🔐 Pierwsze uruchomienie')
    .addItem('🔐 Inicjalizuj sekretne dane (token bota)', 'initializeSecrets')
    .addItem('🗂️ Zapamiętaj ID tego Arkusza (wymagane dla bota)', 'setSpreadsheetId')
    .addItem('🔍 Status konfiguracji', 'checkSecretsStatus');

  const databaseMenu = ui.createMenu('🗄️ Baza danych (arkusze)')
    .addItem('🚀 Wygeneruj całą bazę danych od nowa', 'setupDatabaseStructure')
    .addItem('🔁 Przebuduj wybrany arkusz od nowa', 'showRebuildSheetDialog')
    .addItem('📋 Wstaw przykładowe dane (tylko otwarty arkusz)', 'insertSampleDataIntoActiveSheet')
    .addItem('➕ Dodaj brakujące kolumny do Ustawień (bezpieczne)', 'ensureSettingsColumnsExist');

  const webhookMenu = ui.createMenu('🔗 Telegram: Webhook i wdrożenie')
    .addItem('🔗 Skonfiguruj Telegram Webhook', 'setupTelegramWebhook')
    .addItem('📡 Ustaw Deployment ID dla Webhook\'a', 'setWebhookDeploymentId')
    .addItem('🌐 Ustaw URL Proxy (Cloudflare) dla Webhooka', 'setTelegramWebhookProxyUrl');

  // Narzędzia Bota (diagnostyka) celowo NIE są w menu arkusza - uruchamia się
  // je wyłącznie z edytora Apps Script (lista funkcji → Uruchom ▶):
  // runFullBotDiagnostics, telegramGetMe, telegramGetWebhookInfo,
  // telegramSetWebhookNow, telegramFlushUpdates, telegramSetMenuButton,
  // telegramResetWebhook, telegramSendTestMessage (wszystkie w TelegramBotTools.gs).

  const businessProfileMenu = ui.createMenu('🏢 Google Wizytówka')
    .addItem('🔍 Znajdź lokalizację Google Wizytówki (My Business API)', 'listGoogleBusinessAccountsAndLocations')
    .addItem('⬇️ Pobierz godziny (publiczne Places API, działa od razu)', 'pullHoursFromPublicPlacesApi')
    .addItem('⏰ Zainstaluj automatyczne pobieranie godzin (raz)', 'zainstalujAutomatycznePobieranieGodzin')
    .addSeparator()
    .addItem('⬇️ Pobierz godziny (My Business API, wymaga limitu Google)', 'pullHoursFromGoogleBusinessProfile')
    .addItem('⬆️ Wyślij godziny do Google Wizytówki (My Business API)', 'pushHoursToGoogleBusinessProfile');

  const grafikMenu = ui.createMenu('🗓️ Grafik')
    .addItem('⏰ Zainstaluj automatyczne generowanie (raz)', 'zainstalujAutomatyczneGenerowanieGrafiku')
    .addItem('🔁 Wygeneruj następny okres teraz (ręcznie/test)', 'generateGrafikNowForced')
    .addItem('⚖️ Sprawdź równowagę zmian weekendowych', 'showWeekendFairnessReport');

  const daysOffMenu = ui.createMenu('📅 Dni wolne')
    .addItem('🔄 Odśwież listę dni wolnych (poprzedni/obecny/kolejny rok)', 'refreshDniWolneSheet')
    .addItem('⏰ Zainstaluj automatyczne odświeżanie (raz)', 'zainstalujAutomatyczneOdswiezanieDniWolnych')
    .addItem('⬇️ Pobierz dni wolne z Google Wizytówki', 'pullDaysOffFromGoogleBusinessProfile')
    .addItem('⬆️ Wyślij dni wolne do Google Wizytówki i strony', 'pushDaysOffToGoogleBusinessProfile');

  const backupMenu = ui.createMenu('💾 Kopie zapasowe')
    .addItem('💾 Zrób backup teraz (ręcznie)', 'wykonajBackupArkusza')
    .addItem('⏰ Zainstaluj automatyczny backup (raz)', 'zainstalujAutomatycznyBackupArkusza')
    .addItem('♻️ Przywróć dane z backupu...', 'pokazDialogPrzywracaniaBackupu');

  ui.createMenu('⚙️ System Kadrowy')
    .addSubMenu(setupMenu)
    .addSubMenu(databaseMenu)
    .addSubMenu(webhookMenu)
    .addSubMenu(grafikMenu)
    .addSubMenu(daysOffMenu)
    .addSubMenu(backupMenu)
    .addSeparator()
    .addItem('👔 Ustaw Telegram ID Pracodawców', 'setEmployerTelegramIds')
    .addItem('🔔 Uruchom sprawdzanie braku START', 'checkMissingStartLogs')
    .addSeparator()
    .addSubMenu(businessProfileMenu)
    .addToUi();
}

/**
 * Wyskakujące okienko z prośbą o link do nowego wdrożenia aplikacji (deployment URL)
 * Link powinien kończyć się na /exec
 */
function setWebhookDeploymentId() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '📡 Konfiguracja URL dla przycisku Mini App\n\n' +
    'Wklej adres Web App z wdrożenia Apps Script (.../exec),\n' +
    'albo URL proxy (np. Cloudflare Worker), jeśli go używasz:\n' +
    'np. https://script.google.com/macros/s/[ID]/exec\n' +
    'lub https://twoj-worker.workers.dev',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const deploymentUrl = response.getResponseText().trim();

    // Validacja URL
    if (!deploymentUrl || deploymentUrl.length < 20) {
      ui.alert('❌ URL jest zbyt krótki. Upewnij się, że wklejasz pełny link.');
      return;
    }

    if (!deploymentUrl.startsWith('https://')) {
      ui.alert('❌ URL musi zaczynać się od "https://"');
      return;
    }

    // Adres Apps Script musi kończyć się na /exec - inne domeny (np. proxy) są dozwolone bez tego wymogu.
    if (deploymentUrl.includes('script.google.com') && !deploymentUrl.includes('/exec')) {
      ui.alert('❌ URL Apps Script musi kończyć się na "/exec" (adres Web App).\n\nPrzykład:\nhttps://script.google.com/macros/s/[ID]/exec');
      return;
    }

    // Zapisz URL w Properties Service
    PropertiesService.getScriptProperties().setProperty('WEBHOOK_DEPLOYMENT_URL', deploymentUrl);
    
    // Zaktualizuj kolumnę WEBHOOK_URL w arkuszu Ustawienia (jeśli istnieje)
    try {
      const col = getSettingsColumnIndex('WEBHOOK_URL');
      if (col !== -1) {
        getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS).getRange(2, col).setValue(deploymentUrl);
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

/**
 * Ustawia URL proxy (np. Cloudflare Worker), który ma pośredniczyć
 * między Telegramem a Apps Script, omijając przekierowanie 302
 * zwracane bezpośrednio przez /exec. Zostaw puste i zatwierdź OK,
 * żeby usunąć proxy i wrócić do bezpośredniego URL Apps Script.
 */
function setTelegramWebhookProxyUrl() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const current = props.getProperty('TELEGRAM_WEBHOOK_PROXY_URL') || '(brak - używany bezpośredni URL Apps Script)';

  const response = ui.prompt(
    '🌐 URL Proxy dla Webhooka Telegrama\n\n' +
    'Obecnie: ' + current + '\n\n' +
    'Wklej URL Cloudflare Workera (np. https://xxx.workers.dev).\n' +
    'Zostaw puste i kliknij OK, żeby usunąć proxy.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const proxyUrl = response.getResponseText().trim();

  if (!proxyUrl) {
    props.deleteProperty('TELEGRAM_WEBHOOK_PROXY_URL');
    ui.alert('✅ Proxy usunięte. Webhook będzie wskazywał bezpośrednio na Apps Script.');
    telegramSetWebhookNow();
    return;
  }

  if (!proxyUrl.startsWith('https://')) {
    ui.alert('❌ URL musi zaczynać się od https://');
    return;
  }

  props.setProperty('TELEGRAM_WEBHOOK_PROXY_URL', proxyUrl);
  telegramSetWebhookNow();
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
  
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const col = getSettingsColumnIndex('PRACODAWCY_TELEGRAM_IDS');

  if (col === -1) {
    ui.alert('❌ Nie znaleziono kolumny "PRACODAWCY_TELEGRAM_IDS" w arkuszu Ustawienia.');
    return;
  }

  const existingIds = getEmployerTelegramIds();
  const mergedIds = Array.from(new Set(existingIds.concat(ids)));
  const addedCount = mergedIds.length - existingIds.length;

  const currentLastRow = sheet.getLastRow();
  if (currentLastRow >= 2) {
    sheet.getRange(2, col, currentLastRow - 1, 1).clearContent();
  }
  sheet.getRange(2, col, mergedIds.length, 1).setValues(mergedIds.map(function (id) { return [id]; }));

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

