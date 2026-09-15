/**
 * Funkcje diagnostyczne uruchamiane ręcznie z edytora Apps Script -
 * sprawdzanie autoryzacji, uprawnień i konfiguracji. Nie są wywoływane
 * automatycznie przez bota ani Mini App.
 */

/**
 * JEDNORAZOWA konfiguracja po migracji do nowego (standalone) projektu.
 * Standalone script nie jest "przypięty" do arkusza, więc:
 * 1) zapisuje ID arkusza w Properties Service (getSpreadsheet() go użyje),
 * 2) instaluje trigger onOpen na TYM konkretnym arkuszu, żeby po jego
 *    otwarciu budowało się niestandardowe menu "⚙️ System Kadrowy" -
 *    zwykły (prosty) trigger onOpen działa tylko w skryptach przypiętych,
 *    tutaj musi być zainstalowany jawnie.
 * Uruchom RAZ z edytora (Uruchom ▶), potem odśwież arkusz w przeglądarce.
 */
function migrationInitialSetup() {
  const spreadsheetId = '1SmbwZtQN6hdC6qlzUOZXH_oLRP0TH1Plh1RFMal-exs';

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);
  Logger.log('✅ SPREADSHEET_ID zapisane: ' + spreadsheetId);

  const ss = SpreadsheetApp.openById(spreadsheetId);

  // Usuń ewentualne stare triggery onOpen z tego projektu, żeby się nie zdublowały.
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onOpen') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  Logger.log('✅ Zainstalowano trigger onOpen dla arkusza: ' + ss.getName());
  Logger.log('Odśwież arkusz w przeglądarce, żeby zobaczyć menu ⚙️ System Kadrowy.');
}

/**
 * JEDNORAZOWA konfiguracja adresów webhooka po migracji do nowego projektu
 * (Properties Service jest per-projekt, więc trzeba je ustawić od nowa).
 * Ustawia WEBHOOK_DEPLOYMENT_URL i TELEGRAM_WEBHOOK_PROXY_URL na adres
 * Cloudflare Workera (ten sam co zawsze - nie trzeba nic zmieniać w
 * Cloudflare) i od razu rejestruje webhook w Telegramie.
 *
 * Token bota NIE jest tutaj ustawiany celowo - to sekret i nie powinien
 * trafiać na sztywno do pliku kodu (trafiłby do historii gita). Ustaw go
 * osobno przez menu: ⚙️ System Kadrowy → 🔐 Pierwsze uruchomienie →
 * 🔐 Inicjalizuj sekretne dane (tam jest bezpieczne okienko do wpisania).
 * Uruchom RAZ z edytora (Uruchom ▶) - nie wymaga kontekstu UI arkusza.
 */
function migrationSetWebhookUrls() {
  const cloudflareWorkerUrl = 'https://telegram-gas-relay.sklep-dd2.workers.dev';
  const props = PropertiesService.getScriptProperties();

  props.setProperty('WEBHOOK_DEPLOYMENT_URL', cloudflareWorkerUrl);
  props.setProperty('TELEGRAM_WEBHOOK_PROXY_URL', cloudflareWorkerUrl);
  Logger.log('✅ WEBHOOK_DEPLOYMENT_URL i TELEGRAM_WEBHOOK_PROXY_URL ustawione na: ' + cloudflareWorkerUrl);

  if (!props.getProperty('TELEGRAM_TOKEN')) {
    Logger.log('⚠️ Brak TELEGRAM_TOKEN - ustaw go najpierw przez menu (🔐 Inicjalizuj sekretne dane), potem uruchom tę funkcję ponownie, żeby zarejestrować webhook.');
    return;
  }

  const result = telegramSetWebhookNow();
  Logger.log('Wynik rejestracji webhooka: ' + JSON.stringify(result));
}

/**
 * Uruchom RAZ z edytora, żeby przejść przez ekran zgody obejmujący WSZYSTKIE
 * uprawnienia naraz (Arkusze, zewnętrzne żądania, People API, cache) - po
 * zmianach w oauthScopes stara zgoda się unieważnia i trzeba ją odnowić.
 * Sama w sobie NIE naprawia autoryzacji wdrożenia web app (to osobna zgoda) -
 * służy tylko do wywołania pełnego ekranu "Zezwól" w jednym miejscu.
 */
function authorizeAllScopes() {
  const results = [];

  try {
    getSpreadsheet().getName();
    results.push('✅ Arkusze (spreadsheets)');
  } catch (err) {
    results.push('❌ Arkusze: ' + err.toString());
  }

  try {
    UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
    results.push('✅ Zewnętrzne żądania (script.external_request)');
  } catch (err) {
    results.push('❌ Zewnętrzne żądania: ' + err.toString());
  }

  try {
    People.People.get('people/me', { personFields: 'photos' });
    results.push('✅ People API (userinfo.profile)');
  } catch (err) {
    results.push('❌ People API: ' + err.toString());
  }

  try {
    CacheService.getScriptCache().get('test');
    results.push('✅ Cache');
  } catch (err) {
    results.push('❌ Cache: ' + err.toString());
  }

  const summary = results.join('\n');
  Logger.log(summary);
  try {
    SpreadsheetApp.getUi().alert('Autoryzacja - wynik:\n\n' + summary);
  } catch (e) {
    // Brak kontekstu UI (np. uruchomione spoza arkusza) - wynik jest w Logger.log powyżej.
  }
  return summary;
}

/**
 * Pokazuje surową odpowiedź People API dla zdjęć profilowych (people/me) -
 * do diagnozy, czemu logo w Mini App się nie pokazuje (np. konto może po
 * prostu nie mieć ustawionego zdjęcia, albo jest ukryte politykami Workspace).
 * Czyści też cache logo, na wypadek gdyby wcześniej zapisał się pusty wynik.
 */
function debugGoogleAccountPhoto() {
  CacheService.getScriptCache().remove('GOOGLE_ACCOUNT_PHOTO_URL');

  try {
    const person = People.People.get('people/me', { personFields: 'photos' });
    Logger.log('Surowa odpowiedź People API:\n' + JSON.stringify(person, null, 2));
  } catch (err) {
    Logger.log('❌ Błąd People API: ' + err.toString());
  }

  const freshUrl = getGoogleAccountPhotoUrl();
  Logger.log('getGoogleAccountPhotoUrl() zwraca: "' + freshUrl + '"');
}
