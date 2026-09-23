/**
 * Funkcja uruchamiana co 15 minut przez wyzwalacz czasowy GAS
 */
function checkMissingStartLogs() {
  const ss = getSpreadsheet();
  const todayStr = Utilities.formatDate(new Date(), "CET", "yyyy-MM-dd");
  const currentTimeStr = Utilities.formatDate(new Date(), "CET", "HH:mm");
  
  const scheduleData = ss.getSheetByName(CONFIG.SHEETS.SCHEDULE).getDataRange().getValues();
  const timeLogs = ss.getSheetByName(CONFIG.SHEETS.TIMELOG).getDataRange().getValues();
  const employees = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES).getDataRange().getValues();

  for (let i = 1; i < scheduleData.length; i++) {
    const [empId, date, startTime, endTime] = scheduleData[i];
    const formattedDate = Utilities.formatDate(new Date(date), "CET", "yyyy-MM-dd");

    // Puste startTime = dzień "Wolne"/"Urlop"/"Chorobowe" (nikt nie ma dzisiaj
    // zaczynać pracy) - bez tego sprawdzenia "" porównane jako string zawsze
    // wypada <= dowolnej godzinie ("12:00" >= "" to true w JS), co wysyłało
    // fałszywe przypomnienia o braku STARTu w dni, gdy pracownik wcale nie
    // miał pracować (błąd ujawniony przez rozszerzenie generatora Grafiku o
    // urlopy/e-ZLA z Wniosków - teraz dużo więcej dni ma puste startTime).
    if (formattedDate === todayStr && startTime && currentTimeStr >= startTime) {
      // Sprawdź czy pracownik kliknął dzisiaj START
      const hasStarted = timeLogs.some(log => log[1] === empId && Utilities.formatDate(new Date(log[2]), "CET", "yyyy-MM-dd") === todayStr && !!log[3]);
      
      if (!hasStarted) {
        // Znajdź ChatID pracownika i wyślij ostrzeżenie
        const emp = employees.find(e => e[0] === empId);
        if (emp && emp[1]) {
          sendTelegramMessage(emp[1], `⚠️ **Przypomnienie:** Według grafiku powinieneś rozpocząć pracę o godz. **${startTime}**.\n\nNie kliknąłeś przycisku **START**. Jeśli już pracujesz, kliknij START lub zgłoś korektę.`);
        }
      }
    }
  }
}