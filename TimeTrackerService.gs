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