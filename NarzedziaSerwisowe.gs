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
 * Wszystkie automatyzacje tego projektu mają WSPÓLNĄ cechę: samo wpisanie
 * wartości w Ustawieniach (np. BACKUP_CO_DNI) NICZEGO nie uruchamia - to
 * tylko liczba, którą odczytuje jednorazowy instalator (np.
 * zainstalujAutomatycznyBackupArkusza()) W MOMENCIE URUCHOMIENIA i "zapieka"
 * w triggerze czasowym. Dopóki instalator nie zostanie kliknięty w menu ANI
 * RAZU, żaden backup/generowanie grafiku/odświeżanie dni wolnych NIE
 * dzieje się samo - i jeśli zmienisz liczbę PO instalacji, stary trigger
 * dalej działa ze STARYM interwałem, dopóki nie klikniesz instalatora
 * jeszcze raz (każdy instalator najpierw usuwa swój poprzedni trigger, więc
 * ponowne kliknięcie jest bezpieczne, nie tworzy duplikatów).
 *
 * Ta funkcja pokazuje, co NAPRAWDĘ jest zainstalowane w projekcie TERAZ
 * (ScriptApp.getProjectTriggers()) - jedyny wiarygodny sposób, żeby
 * odpowiedzieć na pytanie "czy X działa automatycznie", zamiast zgadywać po
 * samej wartości w Ustawieniach. Apps Script NIE udostępnia w API dokładnego
 * interwału zapisanego w triggerze (np. "co 7 dni") - tylko czy trigger
 * istnieje i jakiego jest typu, dlatego obok pokazywana jest AKTUALNA
 * wartość z Ustawień, żeby ocenić, czy trigger mógł "wystrzelić" z innym
 * interwałem niż ten, co teraz widać w arkuszu.
 */
function pokazZainstalowaneAutomatyzacje() {
  const known = [
    { handler: 'checkAndGenerateGrafikIfDue', opis: 'Generowanie Grafiku (sprawdzanie codziennie ~6:00, generacja tylko co DNI_GRAFIKU dni - gdy dziś = start kolejnego okresu minus 5 dni)' },
    { handler: 'onEditWnioski', opis: 'Auto-regeneracja po "Urlop na żądanie"' },
    { handler: 'onEditPracownicy', opis: 'Auto-przeliczanie Suma_Urlopów' },
    { handler: 'refreshDniWolneSheet', opis: 'Odświeżanie "Dni wolne" (comiesięcznie)' },
    { handler: 'wykonajBackupArkusza', opis: 'Backup arkusza (co Ustawienia!BACKUP_CO_DNI dni, ~3:00)' },
    { handler: 'pullHoursFromPublicPlacesApi', opis: 'Pobieranie godzin z Google Wizytówki (codziennie, ~5:00)' },
    { handler: 'onEditPodstawyPrawne', opis: 'Przyciski "Podstawy prawne"' },
    { handler: 'onOpen', opis: 'Menu "⚙️ System Kadrowy" po otwarciu arkusza' }
  ];

  const installed = {};
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const handler = t.getHandlerFunction();
    installed[handler] = (installed[handler] || 0) + 1;
  });

  const lines = known.map(function (k) {
    const count = installed[k.handler] || 0;
    const status = count === 0 ? '❌ NIEZAINSTALOWANY' : (count === 1 ? '✅ zainstalowany' : ('⚠️ ' + count + '× - ZDUPLIKOWANY, zainstaluj ponownie z menu'));
    return status + '  —  ' + k.opis + '  (' + k.handler + ')';
  });

  const backupCoDni = getSettingValue('BACKUP_CO_DNI');
  lines.push('');
  lines.push('ℹ️ Ustawienia!BACKUP_CO_DNI teraz = ' + (backupCoDni || '(puste, domyślnie 7)') +
    ' - jeśli zmieniłeś tę wartość PO instalacji backupu, kliknij ponownie "⏰ Zainstaluj automatyczny backup", żeby trigger użył nowej liczby.');

  const summary = lines.join('\n');
  Logger.log(summary);
  try {
    SpreadsheetApp.getUi().alert('🔍 Zainstalowane automatyzacje', summary, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
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
 * JEDNORAZOWY instalator: włącza automatyczną, natychmiastową regenerację
 * Grafiku po zatwierdzeniu wniosku typu "Urlop na żądanie" (patrz
 * onEditWnioski() w GrafikGeneratorService.gs - WYŁĄCZNIE ten jeden typ
 * wniosku, bo tylko on z definicji (Art. 167(2) KP) wymaga natychmiastowej
 * reakcji, nie może czekać na ręczne odpalenie generatora). Uruchom RAZ z
 * menu (⚙️ System Kadrowy → 🗓️ Grafik).
 */
function zainstalujAutomatycznaRegeneracjeUrlopuNaZadanie() {
  const ss = getSpreadsheet();

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onEditWnioski') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onEditWnioski')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const msg = '✅ Zainstalowano automatyczną regenerację grafiku po zatwierdzeniu "Urlop na żądanie" w Wnioskach.';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * JEDNORAZOWY instalator: włącza automatyczne przeliczanie Suma_Urlopów
 * (Pracownicy) przy KAŻDEJ ręcznej zmianie Stopien_OZN albo Staz_Pracy_Lata
 * (patrz onEditPracownicy() w AvailabilityService.gs). Uruchom RAZ z menu
 * (⚙️ System Kadrowy → 🗄️ Baza danych).
 */
function zainstalujAutomatycznePrzeliczanieSumyUrlopow() {
  const ss = getSpreadsheet();

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onEditPracownicy') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onEditPracownicy')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const msg = '✅ Zainstalowano automatyczne przeliczanie Suma_Urlopów przy zmianie Stopien_OZN/Staz_Pracy_Lata.';
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

/**
 * JEDNORAZOWY instalator: wstawia w wierszu 1 zakładki "Podstawy prawne"
 * (kolumny I-N, obok nagłówków tabeli A-G) dwa "przyciski" - checkboxy, które
 * po zaznaczeniu uruchamiają sprawdzAktualizacjePodstawPrawnych() /
 * sprawdzNowelizacjeZAI() i same się odznaczają (patrz
 * onEditPodstawyPrawne() w PodstawyPrawneService.gs). Uruchom RAZ z menu
 * (⚙️ System Kadrowy → ⚖️ Podstawy prawne) - i za każdym razem po przebudowie
 * tej zakładki (🔁 Przebuduj wybrany arkusz od nowa czyści też I1:N1).
 */
function zainstalujPrzyciskiPodstawPrawnych() {
  const ui = SpreadsheetApp.getUi();
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Podstawy prawne');

  if (!sheet) {
    ui.alert('❌ Brak zakładki "Podstawy prawne". Najpierw ją utwórz (⚙️ System Kadrowy → 🗄️ Baza danych).');
    return;
  }

  sheet.getRange('I1').setValue('🔄 Sprawdź aktualizację ustaw →');
  sheet.getRange('K1').setValue('🔍 Sugestie AI (Groq) →');
  sheet.getRange('I1:L1')
    .setFontWeight('bold')
    .setHorizontalAlignment('right')
    .setVerticalAlignment('middle');

  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange('J1').setDataValidation(checkboxRule).setValue(false);
  sheet.getRange('L1').setDataValidation(checkboxRule).setValue(false);

  sheet.getRange('N1')
    .setValue('⏳ Nie sprawdzano jeszcze.')
    .setFontStyle('italic')
    .setHorizontalAlignment('left');

  sheet.setColumnWidth(9, 200);  // I
  sheet.setColumnWidth(10, 40);  // J (checkbox)
  sheet.setColumnWidth(11, 200); // K
  sheet.setColumnWidth(12, 40);  // L (checkbox)
  sheet.setColumnWidth(14, 320); // N (status)

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onEditPodstawyPrawne') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onEditPodstawyPrawne')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  const msg = '✅ Przyciski gotowe w "Podstawy prawne" (I1:L1). Zaznacz checkbox, żeby uruchomić.';
  Logger.log(msg);
  ui.alert(msg);
}

/**
 * ⚠️ NIEBEZPIECZNE - usuwa WSZYSTKIE zakładki w arkuszu (cały skoroszyt
 * zostaje pusty). Google Sheets nie pozwala usunąć ostatniej zakładki, więc
 * zostaje jedna pusta "Arkusz1" - potem użyj generatora (⚙️ System Kadrowy →
 * 🗄️ Baza danych → 🚀 Wygeneruj całą bazę danych od nowa), żeby odtworzyć
 * strukturę od zera. Do testowania generatora - NIEODWRACALNE bez wcześniej
 * zrobionego backupu (💾 Zrób backup teraz).
 * Celowo NIE ma tego w menu arkusza - uruchamiaj WYŁĄCZNIE ręcznie z edytora.
 */
function usunWszystkieDane() {
  const ss = getSpreadsheet();
  const tempSheet = ss.insertSheet('__tymczasowy__' + Utilities.getUuid().slice(0, 8));

  const sheetsToDelete = ss.getSheets().filter(function (s) {
    return s.getSheetId() !== tempSheet.getSheetId();
  });

  sheetsToDelete.forEach(function (s) {
    ss.deleteSheet(s);
  });

  tempSheet.setName('Arkusz1');

  const msg = '🗑️ Usunięto wszystkie zakładki (' + sheetsToDelete.length + '). Zostaje pusty "Arkusz1" - użyj generatora, żeby odtworzyć strukturę.';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * Generuje Grafik dla BIEŻĄCEGO miesiąca kalendarzowego (1. do ostatniego dnia),
 * niezależnie od logiki ciągłych okresów (DNI_GRAFIKU/OSTATNI_DZIEN_GRAFIKU) -
 * przydatne do szybkiego wygenerowania/przetestowania grafiku bez czekania na
 * automatyczny cykl. Bezpieczne do wielokrotnego uruchomienia - nadpisuje
 * tylko wiersze z tego miesiąca (patrz generateGrafikForPeriod()). Celowo NIE
 * aktualizuje Ustawienia!OSTATNI_DZIEN_GRAFIKU i NIE wysyła powiadomień
 * Telegram (to robi generateGrafikNowForced() w normalnym cyklu) - to czysto
 * ręczne narzędzie testowe/naprawcze.
 */
function utworzGrafikNaTenMiesiac() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const result = generateGrafikForPeriod(start, end);

  const startStr = Utilities.formatDate(start, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(end, 'CET', 'yyyy-MM-dd');
  let msg = '✅ Wygenerowano Grafik na ' + startStr + ' – ' + endStr + ' (' + result.rowsWritten + ' wpisów).';
  if (result.uncoveredDays.length > 0) {
    msg += '\n⚠️ Brak obsady w dni: ' + result.uncoveredDays.join(', ') + '.';
  }

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}
