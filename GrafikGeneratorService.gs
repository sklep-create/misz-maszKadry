/**
 * Automatyczne generowanie Grafiku, osobno dla każdego pracownika.
 *
 * Zasada: grafik generuje się 5 dni przed wejściem okresu w życie. Okres ma
 * długość z Ustawienia!DNI_GRAFIKU (w dniach); jeśli puste - cały kalendarzowy
 * miesiąc. Kolejne okresy następują bezpośrednio po sobie (bez przerw i
 * nakładania) - koniec jednego to dzień przed startem następnego.
 *
 * Dla każdego dnia okresu i każdego pracownika: jeśli to dzień roboczy wg
 * "dni pracy"/"godziny pracy" z Ustawienia I pracownik NIE zaznaczył go jako
 * wolny w Dyspozycyjności -> wpis "Praca" z domyślnymi godzinami firmy dla
 * tego dnia tygodnia (skróconymi do NORMA_OZN_UOP godzin od tej samej
 * godziny startu, jeśli pracownik ma orzeczony stopień OzN - patrz
 * _applyOznHourLimit()); w przeciwnym razie "Wolne". Dyspozycyjność zostaje
 * miesięczna niezależnie od długości okresu grafiku - dla każdego dnia
 * sprawdzany jest właściwy miesiąc kalendarzowy tego dnia.
 */

const GRAFIK_DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']; // index = Date.getDay()

/**
 * Wyznacza następny okres grafiku do wygenerowania: start (dzień po ostatnim
 * już wygenerowanym, albo 1. dzień MIESIAC_GRAFIKU/bieżącego miesiąca przy
 * pierwszym uruchomieniu) i koniec (start + DNI_GRAFIKU-1, albo koniec
 * kalendarzowego miesiąca startu, jeśli DNI_GRAFIKU puste).
 */
function getNextGrafikPeriod() {
  const lastDayStr = (getSettingValue('OSTATNI_DZIEN_GRAFIKU') || '').toString().trim();
  let periodStart;

  if (/^\d{4}-\d{2}-\d{2}$/.test(lastDayStr)) {
    const p = lastDayStr.split('-').map(Number);
    periodStart = new Date(p[0], p[1] - 1, p[2] + 1);
  } else {
    const miesiacGrafiku = (getSettingValue('MIESIAC_GRAFIKU') || '').toString().trim();
    if (/^\d{4}-\d{2}$/.test(miesiacGrafiku)) {
      const p = miesiacGrafiku.split('-').map(Number);
      periodStart = new Date(p[0], p[1] - 1, 1);
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  const dniGrafiku = Number(getSettingValue('DNI_GRAFIKU'));
  let periodEnd;
  if (dniGrafiku > 0) {
    periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + dniGrafiku - 1);
  } else {
    periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0); // ostatni dzień miesiąca startu
  }

  return { start: periodStart, end: periodEnd };
}

/** Konwertuje "8.30" / "8" na "08:30". */
function _parseHourToken(token) {
  const t = token.trim().replace(',', '.');
  const parts = t.split('.');
  const hh = parts[0].padStart(2, '0');
  const mm = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
  return hh + ':' + mm;
}

/** "8.30 - 15.30" -> {start: "08:30", stop: "15:30"}; null jeśli nie da się sparsować. */
function parseWorkingHoursRange(rangeStr) {
  if (!rangeStr) return null;
  const parts = rangeStr.toString().split('-');
  if (parts.length !== 2) return null;
  return { start: _parseHourToken(parts[0]), stop: _parseHourToken(parts[1]) };
}

/** Lista pracowników z ID_Pracownika, ChatID, imieniem/nazwiskiem i statusem OzN. */
function _getAllEmployeesWithChat() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const employees = [];

  for (let i = 1; i < data.length; i++) {
    const employeeId = (data[i][0] || '').toString();
    if (!employeeId) continue;
    const stopienOzn = (data[i][5] || '').toString().trim();
    employees.push({
      employeeId: employeeId,
      chatId: (data[i][1] || '').toString(),
      fullName: data[i][2] || employeeId,
      isOzn: stopienOzn !== '' && stopienOzn !== 'Brak',
      normaGodzinOzn: Number(data[i][11]) || null // nadpisanie per-pracownik (Pracownicy!Norma_Godzin_OzN); puste = użyj globalnego NORMA_OZN_UOP
    });
  }

  return employees;
}

/** Skraca zmianę do dobowej normy OzN, licząc od tej samej godziny startu -
 *  zgodnie z Art. 15 ustawy o rehabilitacji zawodowej (7h/dzień, 35h/tydzień
 *  dla znacznego/umiarkowanego stopnia niepełnosprawności - przepisy mogą się
 *  zmienić, stąd liczba godzin jest konfigurowalna). Norma per pracownik
 *  (Pracownicy!Norma_Godzin_OzN) ma pierwszeństwo; jeśli pusta - używana jest
 *  globalna Ustawienia!NORMA_OZN_UOP (domyślnie 7h). Nie wydłuża zmiany,
 *  jeśli firma ma tego dnia i tak krótsze godziny niż norma OzN. */
function _applyOznHourLimit(parsedHours, isOzn, normaGodzinOzn) {
  if (!isOzn) return parsedHours;

  const norma = normaGodzinOzn > 0 ? normaGodzinOzn : getNormaOznUop();
  const startMin = _timeToMinutes(parsedHours.start);
  const naturalStopMin = _timeToMinutes(parsedHours.stop);
  const oznStopMin = startMin + norma * 60;
  const stopMin = Math.min(naturalStopMin, oznStopMin);

  return { start: parsedHours.start, stop: _minutesToHHMM(stopMin) };
}

/** Konwertuje minuty od północy na "HH:mm". */
function _minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Generuje wpisy Grafiku (Praca/Wolne) dla wszystkich pracowników w podanym
 * zakresie dat [startDate, endDate] (włącznie). Usuwa najpierw istniejące
 * wpisy z tego zakresu, żeby ponowne uruchomienie nie tworzyło duplikatów.
 * @returns {{rowsWritten: number, uncoveredDays: string[]}} uncoveredDays to
 *   dni robocze firmy, w które NIKT nie ma "Praca" (potencjalna dziura w obsadzie).
 */
function generateGrafikForPeriod(startDate, endDate) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const employees = _getAllEmployeesWithChat();
  const weeklyHours = getWeeklyWorkingHours();

  const startStr = Utilities.formatDate(startDate, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(endDate, 'CET', 'yyyy-MM-dd');

  // Usuń istniejące wiersze z tego zakresu dat (idempotentność przy ponownym uruchomieniu).
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const d = formatSheetDate(data[i][2]);
    if (d >= startStr && d <= endStr) sheet.deleteRow(i + 1);
  }

  const holidaySet = getCompanyDaysOffSet(startDate, endDate); // ustawowe + dodatkowe z arkusza "Dni wolne"
  const newRows = [];
  const uncoveredDays = [];
  const availabilityCache = {}; // "employeeId|YYYY-MM" -> [dni wolne]

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
    const dayName = GRAFIK_DAY_NAMES[d.getDay()];
    const isHoliday = !!holidaySet[dateStr];
    const parsedHours = isHoliday ? null : parseWorkingHoursRange(weeklyHours[dayName]);
    let workingCount = 0;

    employees.forEach(function (emp) {
      let typDnia = 'Wolne';
      let start = '';
      let stop = '';

      if (parsedHours) {
        const monthKey = Utilities.formatDate(d, 'CET', 'yyyy-MM');
        const cacheKey = emp.employeeId + '|' + monthKey;
        if (!(cacheKey in availabilityCache)) {
          availabilityCache[cacheKey] = getEmployeeAvailability(emp.employeeId, monthKey);
        }

        if (availabilityCache[cacheKey].indexOf(d.getDate()) === -1) {
          const shift = _applyOznHourLimit(parsedHours, emp.isOzn, emp.normaGodzinOzn);
          typDnia = 'Praca';
          start = shift.start;
          stop = shift.stop;
          workingCount++;
        }
      }

      newRows.push(['GRF-' + Utilities.getUuid(), emp.employeeId, dateStr, start, stop, typDnia]);
    });

    if (parsedHours && workingCount === 0 && employees.length > 0) {
      uncoveredDays.push(dateStr);
    }
  }

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  return { rowsWritten: newRows.length, uncoveredDays: uncoveredDays };
}

/**
 * Wywoływane codziennie przez zainstalowany trigger czasowy
 * (zainstalujAutomatyczneGenerowanieGrafiku w NarzedziaSerwisowe.gs). Jeśli dziś jest dokładnie 5 dni przed
 * startem następnego okresu - generuje go i wysyła powiadomienia Telegram
 * (pracodawcy zawsze, z ostrzeżeniem o dniach bez obsady jeśli są; każdemu
 * pracownikowi krótką informację że grafik jest gotowy).
 */
function checkAndGenerateGrafikIfDue() {
  const period = getNextGrafikPeriod();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysUntilStart = Math.round((period.start - today) / (1000 * 60 * 60 * 24));
  if (daysUntilStart !== 5) return;

  _runGrafikGeneration(period);
}

/** Wymusza wygenerowanie następnego okresu TERAZ, niezależnie od daty - do testów/ręcznego użycia z menu. */
function generateGrafikNowForced() {
  const period = getNextGrafikPeriod();
  const message = _runGrafikGeneration(period);
  return message;
}

function _runGrafikGeneration(period) {
  const result = generateGrafikForPeriod(period.start, period.end);
  setSettingValue('OSTATNI_DZIEN_GRAFIKU', Utilities.formatDate(period.end, 'CET', 'yyyy-MM-dd'));

  const startStr = Utilities.formatDate(period.start, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(period.end, 'CET', 'yyyy-MM-dd');

  let employerMsg = '📅 Nowy grafik wygenerowany: ' + startStr + ' – ' + endStr + ' (' + result.rowsWritten + ' wpisów).';
  if (result.uncoveredDays.length > 0) {
    employerMsg += '\n\n⚠️ UWAGA - brak obsady (nikt nie ma "Praca") w dni: ' + result.uncoveredDays.join(', ') + '.';
  }

  getEmployerTelegramIds().forEach(function (chatId) {
    sendTelegramMessage(chatId, employerMsg);
  });

  _getAllEmployeesWithChat().forEach(function (emp) {
    if (!emp.chatId) return;
    sendTelegramMessage(emp.chatId, '📅 Twój grafik na okres ' + startStr + ' – ' + endStr + ' jest już gotowy. Sprawdź w Panelu Pracownika → zakładka Grafik.');
  });

  Logger.log(employerMsg);
  try {
    SpreadsheetApp.getUi().alert(employerMsg);
  } catch (e) {
    // Brak kontekstu UI (np. wywołanie z triggera) - wynik jest w Logger.log powyżej.
  }

  return employerMsg;
}

/**
 * Raport informacyjny ("sprawiedliwa rotacja"): ile zmian w Sobotę/Niedzielę
 * miał każdy pracownik w ostatnich `daysBack` dniach Grafiku. Wyłącznie do
 * wglądu dla pracodawcy - NIE zmienia automatycznie przydziałów, bo grafik
 * jest generowany mechanicznie na podstawie zgłoszonej dyspozycyjności, a nie
 * ręcznego przydziału zmian.
 */
function getWeekendShiftFairnessReport(daysBack) {
  const lookback = daysBack || 60;
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookback);
  const cutoffStr = Utilities.formatDate(cutoffDate, 'CET', 'yyyy-MM-dd');

  const counts = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateStr = formatSheetDate(row[2]);
    if (!dateStr || dateStr < cutoffStr) continue;
    if ((row[5] || '') !== 'Praca') continue;

    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) continue;

    const employeeId = (row[1] || '').toString();
    counts[employeeId] = (counts[employeeId] || 0) + 1;
  }

  const report = _getAllEmployeesWithChat().map(function (emp) {
    return { employeeId: emp.employeeId, fullName: emp.fullName, weekendShifts: counts[emp.employeeId] || 0 };
  });

  report.sort(function (a, b) { return b.weekendShifts - a.weekendShifts; });
  return report;
}

/** Pokazuje raport równowagi zmian weekendowych - do uruchomienia z menu. */
function showWeekendFairnessReport() {
  const report = getWeekendShiftFairnessReport(60);
  const lines = report.map(function (r) {
    return r.fullName + ' (' + r.employeeId + '): ' + r.weekendShifts + ' zmian weekendowych';
  });
  const text = '⚖️ Zmiany weekendowe w ostatnich 60 dniach:\n\n' + (lines.length ? lines.join('\n') : 'Brak danych w Grafiku.');

  Logger.log(text);
  try {
    SpreadsheetApp.getUi().alert(text);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return text;
}
