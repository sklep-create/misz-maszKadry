/**
 * Logika Panelu Pracodawcy: lista pracowników, niezatwierdzone dni pracy
 * (Ewidencja) i zatwierdzanie godzin (Nadgodziny + Przepracowane) do
 * generowania listy obecności.
 */

/**
 * Lista pracowników do rozwijanej listy w Panelu Pracodawcy.
 */
function getEmployeesForEmployer() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const employees = [];

  for (let i = 1; i < data.length; i++) {
    const employeeId = (data[i][0] || "").toString();
    if (!employeeId) continue;

    employees.push({
      employeeId: employeeId,
      fullName: data[i][2] || employeeId
    });
  }

  return employees;
}

/**
 * Dobowa norma godzin danego pracownika, sformatowana jako "H:00"
 * (8:00 dla pełnosprawnych UoP, 7:00 dla stopnia OzN innego niż "Brak").
 */
function getStandardHoursForEmployee(employeeId) {
  const employee = getEmployeeById(employeeId);
  const stopienOzn = (employee && employee.stopienOzn || "Brak").toString().trim();
  const norm = stopienOzn && stopienOzn !== "Brak" ? getNormaOznUop() : getNormaEtatUop();
  return _hoursToHHMM(norm);
}

/**
 * Niezatwierdzone dni pracy (Czas_Stop uzupełniony, Przepracowane puste)
 * wybranego pracownika, z podpowiedzią faktycznego czasu i normy dobowej.
 */
function getPendingAttendanceForEmployee(employeeId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const data = sheet.getDataRange().getValues();
  const standard = getStandardHoursForEmployee(employeeId);
  const pending = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[1] || "").toString() !== employeeId.toString()) continue;

    const start = formatSheetTime(row[3]);
    const stop = formatSheetTime(row[4]);
    const przepracowane = (row[6] || "").toString();

    if (!stop || przepracowane) continue; // trwająca rejestracja albo już zatwierdzone

    pending.push({
      logId: row[0],
      date: formatSheetDate(row[2]),
      start: start,
      stop: stop,
      rawDuration: _diffHHMM(start, stop),
      standardHours: standard
    });
  }

  pending.sort((a, b) => (a.date + "T" + a.start).localeCompare(b.date + "T" + b.start));
  return pending;
}

/**
 * Zatwierdza dzień pracy: zapisuje Nadgodziny (TAK/NIE) i Przepracowane.
 * Gdy Nadgodziny="NIE", Przepracowane jest zawsze normą dobową pracownika,
 * niezależnie od tego, co faktycznie pokazywał Czas_Start/Czas_Stop.
 * @param {string} logId ID_Logu wiersza w Ewidencji.
 * @param {string} employeeId ID_Pracownika (do wyliczenia normy).
 * @param {string} nadgodziny "TAK" albo "NIE".
 * @param {string} przepracowane Godziny w formacie "H:mm", wymagane gdy nadgodziny="TAK".
 */
function approveAttendanceDay(logId, employeeId, nadgodziny, przepracowane) {
  const normalized = (nadgodziny || "").toString().trim().toUpperCase();
  if (normalized !== "TAK" && normalized !== "NIE") {
    return { ok: false, error: "Nadgodziny musi być TAK albo NIE." };
  }

  let finalHours;
  if (normalized === "NIE") {
    finalHours = getStandardHoursForEmployee(employeeId);
  } else {
    finalHours = (przepracowane || "").toString().trim();
    if (!/^\d{1,2}:\d{2}$/.test(finalHours)) {
      return { ok: false, error: "Podaj przepracowane godziny w formacie H:mm, np. 7:45." };
    }
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELOG);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").toString() !== logId.toString()) continue;

    sheet.getRange(i + 1, 6).setValue(normalized);  // Nadgodziny
    sheet.getRange(i + 1, 7).setValue(finalHours);  // Przepracowane
    return { ok: true, przepracowane: finalHours };
  }

  return { ok: false, error: "Nie znaleziono wskazanego dnia w Ewidencji." };
}

/** Formatuje liczbę godzin (np. 8) do postaci "8:00". */
function _hoursToHHMM(hours) {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return wholeHours + ":" + String(minutes).padStart(2, "0");
}

/** Różnica dwóch znaczników czasu "HH:mm:ss" tego samego dnia, jako "H:mm". */
function _diffHHMM(startTime, stopTime) {
  const startMin = _timeToMinutes(startTime);
  const stopMin = _timeToMinutes(stopTime);
  if (startMin === null || stopMin === null) return "";

  const diff = Math.max(0, stopMin - startMin);
  return Math.floor(diff / 60) + ":" + String(diff % 60).padStart(2, "0");
}

/** Konwertuje "HH:mm" lub "HH:mm:ss" na liczbę minut od północy. */
function _timeToMinutes(value) {
  const match = (value || "").toString().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
