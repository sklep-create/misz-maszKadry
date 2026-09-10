/**
 * Zapisuje zdarzenie START / STOP w arkuszu Ewidencja
 */
function registerTimeEvent(employeeId, eventType, source) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const now = new Date();
  const eventSource = source || "Telegram";
  
  sheet.appendRow([
    Utilities.getUuid(),
    employeeId,
    Utilities.formatDate(now, "CET", "yyyy-MM-dd"),
    Utilities.formatDate(now, "CET", "HH:mm:ss"),
    eventType,
    eventSource,
    "Zatwierdzone"
  ]);
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
 * Zwraca zdarzenia START/STOP danego pracownika, od najnowszego.
 * @param {string} employeeId
 * @param {number} [limit] Maksymalna liczba zwróconych zdarzeń.
 */
function getTimeEventsForEmployee(employeeId, limit) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const data = sheet.getDataRange().getValues();
  const events = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[1] || "").toString() !== employeeId.toString()) continue;
    if (row[6] === "Anulowane") continue;

    events.push({
      date: formatSheetDate(row[2]),
      time: formatSheetTime(row[3]),
      type: row[4],
      source: row[5]
    });
  }

  events.sort((a, b) => (a.date + "T" + a.time).localeCompare(b.date + "T" + b.time));
  events.reverse();

  return limit ? events.slice(0, limit) : events;
}

/**
 * Zwraca bieżący status pracownika na podstawie ostatniego zdarzenia.
 * @param {string} employeeId
 */
function getEmployeeStatus(employeeId) {
  const lastEvents = getTimeEventsForEmployee(employeeId, 1);

  if (!lastEvents.length) {
    return { working: false, lastEventType: null, lastEventDate: null, lastEventTime: null };
  }

  const last = lastEvents[0];
  return {
    working: last.type === "START",
    lastEventType: last.type,
    lastEventDate: last.date,
    lastEventTime: last.time
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