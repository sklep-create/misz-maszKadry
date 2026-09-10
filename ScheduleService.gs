/**
 * Obsługa grafiku pracy (zakładka "Grafik")
 */

/**
 * Zwraca najbliższe wpisy grafiku dla pracownika, od dziś wzwyż.
 * @param {string} employeeId
 * @param {number} [daysAhead] Maksymalna liczba zwróconych wpisów (domyślnie 7).
 */
function getUpcomingScheduleForEmployee(employeeId, daysAhead) {
  const limit = daysAhead || 7;
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();
  const todayStr = Utilities.formatDate(new Date(), "CET", "yyyy-MM-dd");

  const entries = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[1] || "").toString() !== employeeId.toString()) continue;

    const dateStr = formatSheetDate(row[2]);
    if (!dateStr || dateStr < todayStr) continue;

    entries.push({
      date: dateStr,
      start: formatSheetTime(row[3]),
      stop: formatSheetTime(row[4]),
      type: row[5] || "Praca"
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  return entries.slice(0, limit);
}
