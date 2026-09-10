/**
 * Integracja z Google Wizytówką (Business Profile) - synchronizacja
 * tygodniowych godzin otwarcia z tabelą "dni pracy" / "godziny pracy"
 * w arkuszu Ustawienia.
 *
 * Wymaga:
 * - włączonych API "My Business Business Information API" oraz
 *   "My Business Account Management API" w projekcie GCP powiązanym
 *   z tym skryptem (Ustawienia projektu → Projekt GCP),
 * - konta uruchamiającego skrypt jako Właściciel/Menedżer wizytówki.
 *
 * Kolejność użycia:
 * 1. 🔍 Znajdź lokalizację Google Wizytówki (jednorazowo)
 * 2. ⬇️ Pobierz godziny z Google Wizytówki - albo
 *    ⬆️ Wyślij godziny do Google Wizytówki
 */

const GBP_DAY_MAP = {
  "Poniedziałek": "MONDAY",
  "Wtorek": "TUESDAY",
  "Środa": "WEDNESDAY",
  "Czwartek": "THURSDAY",
  "Piątek": "FRIDAY",
  "Sobota": "SATURDAY",
  "Niedziela": "SUNDAY"
};

const GBP_DAY_MAP_REVERSE = Object.keys(GBP_DAY_MAP).reduce(function (acc, plName) {
  acc[GBP_DAY_MAP[plName]] = plName;
  return acc;
}, {});

/** Zapisany identyfikator lokalizacji (locations/xxxxx), wykryty jednorazowo. */
function getGoogleBusinessLocationId() {
  const id = PropertiesService.getScriptProperties().getProperty('GOOGLE_BUSINESS_LOCATION_ID');
  if (!id) {
    throw new Error('Brak zapisanej lokalizacji. Uruchom najpierw: 🔍 Znajdź lokalizację Google Wizytówki');
  }
  return id;
}

/**
 * Jednorazowe wykrycie dostępnych kont i lokalizacji Google Wizytówki
 * na koncie uruchamiającym skrypt. Zapisuje pierwszą znalezioną lokalizację
 * jako domyślną (GOOGLE_BUSINESS_LOCATION_ID w Properties Service).
 */
function listGoogleBusinessAccountsAndLocations() {
  try {
    const token = ScriptApp.getOAuthToken();
    const accountsResponse = UrlFetchApp.fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    );
    const accountsData = JSON.parse(accountsResponse.getContentText());

    if (accountsData.error) {
      return _reportResult('❌ Błąd pobierania kont:\n' + JSON.stringify(accountsData.error));
    }

    if (!accountsData.accounts || !accountsData.accounts.length) {
      return _reportResult('❌ Nie znaleziono żadnych kont Google Wizytówki dla tego konta Google.\n\nOdpowiedź: ' + accountsResponse.getContentText());
    }

    const lines = ['📍 KONTA I LOKALIZACJE GOOGLE WIZYTÓWKI', '----------------'];
    let firstLocationId = null;

    accountsData.accounts.forEach(function (account) {
      lines.push('Konto: ' + account.accountName + ' (' + account.name + ')');

      const locationsResponse = UrlFetchApp.fetch(
        'https://mybusinessbusinessinformation.googleapis.com/v1/' + account.name + '/locations?readMask=name,title',
        { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
      );
      const locationsData = JSON.parse(locationsResponse.getContentText());

      if (locationsData.locations && locationsData.locations.length) {
        locationsData.locations.forEach(function (loc) {
          lines.push('  - ' + (loc.title || '(bez nazwy)') + ' -> ' + loc.name);
          if (!firstLocationId) firstLocationId = loc.name;
        });
      } else {
        lines.push('  (brak lokalizacji albo błąd: ' + locationsResponse.getContentText() + ')');
      }
    });

    if (firstLocationId) {
      PropertiesService.getScriptProperties().setProperty('GOOGLE_BUSINESS_LOCATION_ID', firstLocationId);
      lines.push('');
      lines.push('✅ Zapisano jako domyślną lokalizację: ' + firstLocationId);
    } else {
      lines.push('');
      lines.push('⚠️ Nie znaleziono żadnej lokalizacji - nic nie zapisano.');
    }

    return _reportResult(lines.join('\n'));
  } catch (err) {
    return _reportResult('❌ Błąd: ' + err.toString());
  }
}

/** Format "8.30" z obiektu TimeOfDay {hours, minutes} zwracanego przez API. */
function formatGbpTime(timeOfDay) {
  const hours = (timeOfDay && timeOfDay.hours) || 0;
  const minutes = (timeOfDay && timeOfDay.minutes) || 0;
  return hours + '.' + ('0' + minutes).slice(-2);
}

/** Parsuje "8.30" do obiektu TimeOfDay {hours, minutes} wymaganego przez API. */
function parseHoursToGbpTime(str) {
  const parts = str.trim().split('.');
  return { hours: Number(parts[0]) || 0, minutes: Number(parts[1]) || 0 };
}

/**
 * Pobiera godziny otwarcia z Google Wizytówki i zapisuje je w tabeli
 * "dni pracy" / "godziny pracy" arkusza Ustawienia (nadpisuje).
 */
function pullHoursFromGoogleBusinessProfile() {
  try {
    const token = ScriptApp.getOAuthToken();
    const locationId = getGoogleBusinessLocationId();

    const response = UrlFetchApp.fetch(
      'https://mybusinessbusinessinformation.googleapis.com/v1/' + locationId + '?readMask=regularHours',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
    );
    const data = JSON.parse(response.getContentText());

    if (data.error) {
      return _reportResult('❌ Błąd pobierania godzin:\n' + JSON.stringify(data.error));
    }

    const hoursMap = {};
    Object.keys(GBP_DAY_MAP).forEach(function (plName) { hoursMap[plName] = null; });

    const periods = (data.regularHours && data.regularHours.periods) || [];
    periods.forEach(function (period) {
      const plName = GBP_DAY_MAP_REVERSE[period.openDay];
      if (!plName) return;
      hoursMap[plName] = formatGbpTime(period.openTime) + ' - ' + formatGbpTime(period.closeTime);
    });

    setWeeklyWorkingHours(hoursMap);

    const summary = Object.keys(hoursMap).map(function (d) {
      return d + ': ' + (hoursMap[d] || 'zamknięte');
    }).join('\n');

    return _reportResult('✅ Pobrano godziny z Google Wizytówki i zapisano w arkuszu Ustawienia:\n\n' + summary);
  } catch (err) {
    return _reportResult('❌ Błąd: ' + err.toString());
  }
}

/**
 * Wysyła godziny otwarcia z tabeli "dni pracy" / "godziny pracy" (arkusz
 * Ustawienia) do Google Wizytówki, nadpisując tam obecny harmonogram.
 */
function pushHoursToGoogleBusinessProfile() {
  try {
    const token = ScriptApp.getOAuthToken();
    const locationId = getGoogleBusinessLocationId();
    const hoursMap = getWeeklyWorkingHours();

    const periods = [];
    Object.keys(hoursMap).forEach(function (plName) {
      const value = hoursMap[plName];
      const gbpDay = GBP_DAY_MAP[plName];
      if (!value || !gbpDay) return; // brak wpisu = zamknięte, pomijamy

      const range = value.split('-').map(function (s) { return s.trim(); });
      if (range.length !== 2) return;

      periods.push({
        openDay: gbpDay,
        openTime: parseHoursToGbpTime(range[0]),
        closeDay: gbpDay,
        closeTime: parseHoursToGbpTime(range[1])
      });
    });

    const response = UrlFetchApp.fetch(
      'https://mybusinessbusinessinformation.googleapis.com/v1/' + locationId + '?updateMask=regularHours',
      {
        method: 'patch',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ regularHours: { periods: periods } }),
        muteHttpExceptions: true
      }
    );

    const data = JSON.parse(response.getContentText());
    if (data.error) {
      return _reportResult('❌ Błąd aktualizacji Google Wizytówki:\n' + JSON.stringify(data.error));
    }

    return _reportResult('✅ Zaktualizowano godziny otwarcia w Google Wizytówce.');
  } catch (err) {
    return _reportResult('❌ Błąd: ' + err.toString());
  }
}
