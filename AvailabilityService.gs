/**
 * Dyspozycyjność - dni wolne zgłaszane przez pracownika na kolejne miesiące.
 *
 * Termin zgłoszenia: do 10. dnia miesiąca (włącznie) można zgłosić
 * dyspozycyjność na najbliższy możliwy miesiąc. Po tym terminie
 * najbliższy zgłaszalny miesiąc przesuwa się o kolejny (np. do 10 września
 * można zgłosić na październik; po 10 września - dopiero na listopad).
 *
 * Limit dni wolnych w miesiącu = dni w miesiącu minus wymagane dni pracy,
 * gdzie wymagane dni pracy = miesięczny wymiar godzin (wg Kodeksu Pracy,
 * przeliczony przez Wymiar_Etatu) podzielony przez dobową normę godzin
 * (8h UoP / 7h OzN umiarkowany-znaczny).
 */

const POLISH_MONTH_NAMES = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"
];

const POLISH_DAY_NAMES_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

/** Liczba dni w miesiącu (month: 1-12). */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Data Wielkanocy (algorytm anonimowy gregoriański / Gaussa). */
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Ustawowo wolne dni w Polsce dla danego roku (w tym ruchome - Wielkanoc, Boże Ciało). */
function getPolishHolidays(year) {
  const easter = getEasterSunday(year);
  const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1);
  const corpusChristi = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 60);

  return [
    new Date(year, 0, 1),   // Nowy Rok
    new Date(year, 0, 6),   // Trzech Króli
    easter,                  // Wielkanoc
    easterMonday,             // Poniedziałek Wielkanocny
    new Date(year, 4, 1),   // Święto Pracy
    new Date(year, 4, 3),   // Konstytucja 3 Maja
    corpusChristi,            // Boże Ciało
    new Date(year, 7, 15),  // Wniebowzięcie NMP
    new Date(year, 10, 1),  // Wszystkich Świętych
    new Date(year, 10, 11), // Święto Niepodległości
    new Date(year, 11, 25), // Boże Narodzenie (1. dzień)
    new Date(year, 11, 26)  // Boże Narodzenie (2. dzień)
  ];
}

/**
 * Miesięczny wymiar godzin pracy dla pełnego etatu (1.0) wg Kodeksu Pracy:
 * (liczba dni roboczych pon-pt w miesiącu) x 8h, minus 8h za każde święto
 * przypadające w dniu innym niż niedziela.
 */
function getMonthlyWorkNormHours(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  let workdays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) workdays++;
  }

  const holidaysNotOnSunday = getPolishHolidays(year).filter(function (h) {
    return h.getFullYear() === year && (h.getMonth() + 1) === month && h.getDay() !== 0;
  }).length;

  return (workdays - holidaysNotOnSunday) * 8;
}

/**
 * Limit dni wolnych w miesiącu dla danego pracownika.
 */
function getAvailabilityLimit(employeeId, year, month) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return 0;

  const wymiarEtatu = Number(employee.wymiarEtatu) || 1;
  const stopienOzn = (employee.stopienOzn || "").toString();
  const isOzn = stopienOzn !== "" && stopienOzn !== "Brak";
  const dailyNorm = isOzn ? 7 : 8;

  const monthlyNormFullTime = getMonthlyWorkNormHours(year, month);
  const monthlyNormForEmployee = monthlyNormFullTime * wymiarEtatu;
  const requiredWorkDays = Math.ceil(monthlyNormForEmployee / dailyNorm);
  const daysInMonth = getDaysInMonth(year, month);

  return Math.max(daysInMonth - requiredWorkDays, 0);
}

/**
 * Miesiące, na które pracownik może obecnie zgłosić dyspozycyjność.
 * Do 10. dnia (włącznie) - najbliższy miesiąc jest dostępny.
 * Po 10. dniu - najbliższy dostępny to kolejny po najbliższym.
 */
function getSelectableAvailabilityMonths(monthCount) {
  const now = new Date();
  const earliestOffset = now.getDate() <= 10 ? 1 : 2;
  const count = monthCount || 4;
  const months = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + earliestOffset + i, 1);
    months.push({
      value: Utilities.formatDate(d, "CET", "yyyy-MM"),
      label: POLISH_MONTH_NAMES[d.getMonth()] + " " + d.getFullYear()
    });
  }

  return months;
}

/** Czy podany miesiąc (YYYY-MM) jest obecnie dozwolony do zgłoszenia. */
function isMonthSelectable(monthValue) {
  return getSelectableAvailabilityMonths(12).some(function (m) {
    return m.value === monthValue;
  });
}

/** Zwraca arkusz Dyspozycyjność, tworząc go (z nagłówkami), jeśli brakuje. */
function getOrCreateAvailabilitySheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.AVAILABILITY);
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEETS.AVAILABILITY);
  const headers = ["ID_Dyspozycji", "ID_Pracownika", "Miesiac", "Dni_Wolne", "Data_Aktualizacji"];
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground("#6B46C1")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);

  for (let col = 1; col <= headers.length; col++) {
    sheet.autoResizeColumn(col);
    if (sheet.getColumnWidth(col) < 120) sheet.setColumnWidth(col, 140);
  }

  return sheet;
}

/** Zapisane dni wolne pracownika dla danego miesiąca (tablica liczb 1-31). */
function getEmployeeAvailability(employeeId, monthValue) {
  const sheet = getOrCreateAvailabilitySheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString() === employeeId.toString() && (data[i][2] || "").toString() === monthValue) {
      const raw = (data[i][3] || "").toString();
      return raw ? raw.split(",").map(Number).filter(function (n) { return !isNaN(n); }) : [];
    }
  }

  return [];
}

/**
 * Zapisuje (nadpisuje) dni wolne pracownika dla danego miesiąca.
 * @returns {{ok: boolean, error?: string}}
 */
function saveEmployeeAvailability(employeeId, monthValue, days) {
  if (!isMonthSelectable(monthValue)) {
    return { ok: false, error: "Termin zgłoszenia dyspozycyjności na ten miesiąc już minął." };
  }

  const parts = monthValue.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const limit = getAvailabilityLimit(employeeId, year, month);

  const uniqueDays = Array.from(new Set(
    days.map(Number).filter(function (n) { return !isNaN(n) && n >= 1 && n <= 31; })
  ));

  if (uniqueDays.length > limit) {
    return {
      ok: false,
      error: "Zaznaczono za dużo dni (" + uniqueDays.length + "/" + limit + "). Odznacz jeszcze " +
        (uniqueDays.length - limit) + "."
    };
  }

  const sheet = getOrCreateAvailabilitySheet();
  const data = sheet.getDataRange().getValues();
  const daysValue = uniqueDays.sort(function (a, b) { return a - b; }).join(",");
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString() === employeeId.toString() && (data[i][2] || "").toString() === monthValue) {
      sheet.getRange(i + 1, 4).setValue(daysValue);
      sheet.getRange(i + 1, 5).setValue(now);
      return { ok: true };
    }
  }

  sheet.appendRow([Utilities.getUuid(), employeeId, monthValue, daysValue, now]);
  return { ok: true };
}
