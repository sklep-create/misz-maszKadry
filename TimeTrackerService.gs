/**
 * Rejestruje START lub STOP w arkuszu Ewidencja.
 * Jeden wiersz = jeden dzień pracy: START tworzy nowy wiersz, STOP uzupełnia
 * Czas_Stop w najnowszym otwartym (bez Czas_Stop) wierszu tego pracownika.
 */
function registerTimeEvent(employeeId, eventType) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const now = new Date();
  const today = Utilities.formatDate(now, "CET", "yyyy-MM-dd");
  const time = Utilities.formatDate(now, "CET", "HH:mm:ss");

  if (eventType === "START") {
    sheet.appendRow([Utilities.getUuid(), employeeId, today, time, "", "", ""]);
    return;
  }

  // STOP: znajdź od dołu najnowszy wiersz tego pracownika z pustym Czas_Stop
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if ((data[i][1] || "").toString() !== employeeId.toString()) continue;
    if (data[i][3] && !data[i][4]) {
      sheet.getRange(i + 1, 5).setValue(time); // Czas_Stop
    }
    return;
  }
}

/**
 * Zapisuje wniosek o korektę do akceptacji
 */
function saveCorrectionRequest(employeeId, details) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.LEAVES);
  const now = new Date();

  sheet.appendRow([
    Utilities.getUuid(),
    employeeId,
    "Korekta START",
    Utilities.formatDate(now, "CET", "yyyy-MM-dd"),
    details,
    "Oczekuje"
  ]);
}

function getFormattedTime() {
  return Utilities.formatDate(new Date(), "CET", "HH:mm");
}

/**
 * Zapisuje ustrukturyzowany wniosek o korektę (formularz w Mini App)
 */
function saveStructuredCorrectionRequest(employeeId, date, startTime, note) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.LEAVES);

  sheet.appendRow([
    Utilities.getUuid(),
    employeeId,
    "Korekta START",
    date,
    date,
    "Oczekuje",
    "",
    `Godzina startu: ${startTime}` + (note ? ` — ${note}` : "")
  ]);
}

/**
 * Zwraca dni pracy (wiersze Ewidencji) danego pracownika, od najnowszego.
 * @param {string} employeeId
 * @param {number} [limit] Maksymalna liczba zwróconych dni.
 */
function getTimeEventsForEmployee(employeeId, limit) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const data = sheet.getDataRange().getValues();
  const days = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[1] || "").toString() !== employeeId.toString()) continue;

    const start = formatSheetTime(row[3]);
    const stop = formatSheetTime(row[4]);
    const przepracowane = (row[6] || "").toString();

    days.push({
      date: formatSheetDate(row[2]),
      start: start,
      stop: stop,
      nadgodziny: (row[5] || "").toString(),
      przepracowane: przepracowane,
      approved: !!przepracowane
    });
  }

  days.sort((a, b) => (a.date + "T" + a.start).localeCompare(b.date + "T" + b.start));
  days.reverse();

  return limit ? days.slice(0, limit) : days;
}

/**
 * Zwraca bieżący status pracownika na podstawie najnowszego wiersza Ewidencji.
 * @param {string} employeeId
 */
function getEmployeeStatus(employeeId) {
  const lastDays = getTimeEventsForEmployee(employeeId, 1);

  if (!lastDays.length) {
    return { working: false, lastEventType: null, lastEventDate: null, lastEventTime: null };
  }

  const last = lastDays[0];

  if (last.start && !last.stop) {
    return { working: true, lastEventType: "START", lastEventDate: last.date, lastEventTime: last.start };
  }

  return {
    working: false,
    lastEventType: last.stop ? "STOP" : (last.start ? "START" : null),
    lastEventDate: last.date,
    lastEventTime: last.stop || last.start || null
  };
}

/**
 * Formatuje wartość komórki z datą (Date lub string) do "yyyy-MM-dd".
 */
function formatSheetDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "CET", "yyyy-MM-dd");
  }
  return (value || "").toString();
}

/**
 * Formatuje wartość komórki z godziną (Date lub string) do "HH:mm:ss" lub "HH:mm".
 */
function formatSheetTime(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "CET", "HH:mm:ss");
  }
  return (value || "").toString();
}
