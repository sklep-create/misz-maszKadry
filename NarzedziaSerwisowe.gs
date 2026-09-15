/**
 * Narzędzia serwisowe uruchamiane RĘCZNIE z edytora Apps Script (lista
 * funkcji → Uruchom ▶) albo raz z menu - jednorazowe instalatory
 * automatyzacji (triggery), migracja/konfiguracja projektu i diagnostyka
 * autoryzacji. Nie są wywoływane automatycznie przez bota ani Mini App.
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
function podlaczArkuszIZainstalujMenu() {
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
function ustawAdresyWebhookaPoMigracji() {
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
 * uprawnienia naraz (Arkusze, zewnętrzne żądania, cache) - po zmianach w
 * oauthScopes stara zgoda się unieważnia i trzeba ją odnowić. Sama w sobie
 * NIE naprawia autoryzacji wdrożenia web app (to osobna zgoda) - służy
 * tylko do wywołania pełnego ekranu "Zezwól" w jednym miejscu.
 */
function sprawdzWszystkieUprawnienia() {
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
    CacheService.getScriptCache().get('test');
    results.push('✅ Cache');
  } catch (err) {
    results.push('❌ Cache: ' + err.toString());
  }

  try {
    DriveApp.getRootFolder().getName();
    results.push('✅ Dysk Google (drive)');
  } catch (err) {
    results.push('❌ Dysk Google: ' + err.toString());
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
 * Pokazuje surowe dane zdjęcia profilowego bota Telegram (getChat) - do
 * diagnozy, czemu logo w Mini App się nie pokazuje (np. bot może po prostu
 * nie mieć ustawionego zdjęcia - BotFather → /setuserpic). Czyści też cache
 * logo, na wypadek gdyby wcześniej zapisał się pusty wynik.
 */
function sprawdzZdjecieProfiloweBota() {
  CacheService.getScriptCache().remove('TELEGRAM_BOT_PHOTO_DATAURI');

  try {
    const me = _botApi('getMe');
    const chat = _botApi('getChat', { chat_id: me.result.id });
    Logger.log('getChat (bot):\n' + JSON.stringify(chat, null, 2));
  } catch (err) {
    Logger.log('❌ Błąd Telegram Bot API: ' + err.toString());
  }

  const freshUri = getTelegramBotPhotoDataUri();
  Logger.log('getTelegramBotPhotoDataUri() zwraca ' + freshUri.length + ' znaków' + (freshUri ? (' (zaczyna się od: ' + freshUri.slice(0, 40) + '...)') : ' (puste - brak zdjęcia bota)'));
}

/**
 * JEDNORAZOWY instalator: włącza codzienne automatyczne pobieranie godzin
 * otwarcia z Google Wizytówki (publiczne Places API) do arkusza Ustawienia.
 * Uruchom RAZ z menu (⚙️ System Kadrowy → 🏢 Google Wizytówka).
 */
function zainstalujAutomatycznePobieranieGodzin() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'pullHoursFromPublicPlacesApi') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('pullHoursFromPublicPlacesApi')
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();

  const msg = '✅ Zainstalowano automatyczne pobieranie godzin z Wizytówki (codziennie ok. 5:00).';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * JEDNORAZOWY instalator: włącza codzienne automatyczne generowanie Grafiku
 * (sprawdza codziennie czy to dokładnie 5 dni przed startem kolejnego okresu
 * i jeśli tak, generuje go). Uruchom RAZ z menu (⚙️ System Kadrowy → 🗓️ Grafik).
 */
function zainstalujAutomatyczneGenerowanieGrafiku() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'checkAndGenerateGrafikIfDue') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkAndGenerateGrafikIfDue')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  const msg = '✅ Zainstalowano automatyczne generowanie grafiku (codzienne sprawdzanie o ok. 6:00).';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * JEDNORAZOWY instalator: włącza comiesięczne automatyczne odświeżanie
 * rolowanego okna 3 lat (poprzedni/obecny/kolejny) w arkuszu "Dni wolne".
 * Uruchom RAZ z menu (⚙️ System Kadrowy → 📅 Dni wolne).
 */
function zainstalujAutomatyczneOdswiezanieDniWolnych() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'refreshDniWolneSheet') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('refreshDniWolneSheet')
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  const msg = '✅ Zainstalowano comiesięczne odświeżanie "Dni wolne" (1. dnia miesiąca, ok. 4:00).';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * JEDNORAZOWY instalator: włącza automatyczny backup arkusza co N dni
 * (N z Ustawienia!BACKUP_CO_DNI, domyślnie 7). Uruchom RAZ z menu
 * (⚙️ System Kadrowy → 💾 Kopie zapasowe).
 */
function zainstalujAutomatycznyBackupArkusza() {
  const dniCoIle = Number(getSettingValue('BACKUP_CO_DNI')) || 7;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'wykonajBackupArkusza') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('wykonajBackupArkusza')
    .timeBased()
    .everyDays(dniCoIle)
    .atHour(3)
    .create();

  const msg = '✅ Zainstalowano automatyczny backup arkusza co ' + dniCoIle + ' dni (ok. 3:00).';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}
