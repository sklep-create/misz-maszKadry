/**
 * Automatyczne generowanie Grafiku, osobno dla każdego pracownika.
 *
 * Zasada: grafik generuje się 5 dni przed wejściem okresu w życie. Okres ma
 * długość z Ustawienia!DNI_GRAFIKU (w dniach); jeśli puste - cały kalendarzowy
 * miesiąc. Kolejne okresy następują bezpośrednio po sobie (bez przerw i
 * nakładania) - koniec jednego to dzień przed startem następnego.
 *
 * Dla każdego dnia okresu i każdego pracownika, w tej kolejności:
 * 1. Firma zamknięta tego dnia (święto lub brak godzin w "dni pracy"/"godziny
 *    pracy") -> ŻADEN wiersz dla nikogo.
 * 2. Zatwierdzony wniosek urlopowy/e-ZLA z zakładki Wnioski obejmujący ten
 *    dzień (Status_Akceptacji = Zatwierdzony) -> "Urlop" albo "Chorobowe",
 *    bez godzin (_getApprovedLeaveMap()).
 * 3. Pracownik zgłosił ten dzień jako wolny w Dyspozycyjności -> "Wolne".
 * 4. W przeciwnym razie -> "Praca", z godzinami skróconymi do DOBOWEJ normy
 *    pracownika (patrz niżej).
 *
 * DOBOWA i TYGODNIOWA norma każdego pracownika (_effectiveEmployeeLimits()) są
 * WYLICZONE z jego Wymiar_Etatu (1.0/0.5/0.75...) i Stopien_OZN - NIE tylko
 * dla OzN, jak w pierwszej wersji generatora:
 * - dobowa norma = Wymiar_Etatu × (7h OzN Umiarkowany/Znaczny ALBO 8h
 *   pozostali) - Ustawienia/Podstawy prawne, patrz Config.gs;
 * - tygodniowa norma = Wymiar_Etatu × (35h OzN Umiarkowany/Znaczny ALBO 40h
 *   pozostali, Art. 129 §1 KP);
 * - jeśli firma NIE dopuszcza nadgodzin (Ustawienia!NADGODZINY=NIE) LUB
 *   pracownik ma orzeczenie o niepełnosprawności (OzN NIGDY nie ma nadgodzin,
 *   niezależnie od ustawienia firmy - Art. 15 ust. 3 ustawy o rehabilitacji)
 *   -> tygodniowy LIMIT = tygodniowa norma (bez podniesienia).
 * - jeśli firma dopuszcza nadgodziny I pracownik może je mieć -> tygodniowy
 *   LIMIT = Wymiar_Etatu × 48h (Art. 131 §1 KP, konserwatywnie - patrz
 *   getWeeklyOvertimeCap() w Config.gs).
 *
 * Gdy w danym tygodniu naturalna suma godzin (wszystkie dni robocze firmy,
 * bez urlopu/dyspozycyjności) przekroczyłaby tygodniowy LIMIT pracownika,
 * generator skraca/pomija tyle dni ile trzeba, żeby limit nie został
 * przekroczony (patrz _applyReduction()). Domyślnie (bez AI) obcina od
 * NAJPÓŹNIEJSZEGO dnia tygodnia - identyczne zachowanie jak w pierwszej
 * wersji generatora, tylko teraz dotyczy KAŻDEGO pracownika, nie tylko OzN.
 *
 * Ciągłość tygodnia MIĘDZY okresami: jeśli okres zaczyna się w środku
 * tygodnia (nie w poniedziałek), _seedWeeklyMinutesUsed() doczytuje z już
 * istniejących wierszy Grafiku, ile godzin dany pracownik ma zaplanowane od
 * poniedziałku tego tygodnia do dnia przed startem okresu - bez tego
 * generator zerowałby licznik na starcie KAŻDEGO okresu i mógłby przekroczyć
 * tygodniowy limit w tygodniu rozdzielonym granicą dwóch okresów.
 *
 * Rola Groq (opcjonalna, WYŁĄCZNIE "recenzja" - patrz decyzja w CLAUDE.md,
 * ta sama filozofia co w PodstawyPrawneService.gs): generator NAJPIERW liczy
 * w 100% zgodny z prawem wariant (dokładnie jak wyżej - deterministycznie,
 * KAŻDA wartość liczbowa wynika z kodu, nigdy z AI). Jeśli w danym tygodniu
 * trzeba było kogoś skrócić/pominąć, a jest więcej niż jeden kandydujący
 * dzień, Groq dostaje WYŁĄCZNIE listę tych dni (te same daty, te same minuty
 * - nic wymyślonego) i może zaproponować, KTÓRY dzień skrócić NAJPIERW, żeby
 * długoterminowo rozłożyć to sprawiedliwie (patrz getWeekendShiftFairnessReport).
 * Każda propozycja jest walidowana: musi być permutacją TYCH SAMYCH dni tej
 * samej decyzji - w przeciwnym razie generator zostaje przy domyślnej
 * kolejności. Brak klucza GROQ_API_KEY / błąd API / nieprawidłowa odpowiedź
 * -> generator działa dalej z wariantem domyślnym, bez ostrzeżenia dla
 * użytkownika (tak jak "Sugestie AI" w Podstawach prawnych - to ulepszenie,
 * nigdy wymóg). AI NIE ma żadnej możliwości zmienić SUMĘ godzin, złamać
 * dobowy/tygodniowy limit, wymyślić pracownika/datę czy pominąć urlop/dzień
 * wolny - wybiera tylko KOLEJNOŚĆ już-obliczonych, już-zgodnych-z-prawem dni.
 */

const GRAFIK_DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']; // index = Date.getDay()

/**
 * Wyznacza następny okres grafiku do wygenerowania: start (dzień po ostatnim
 * już wygenerowanym, albo 1. dzień MIESIAC_GRAFIKU/bieżącego miesiąca przy
 * pierwszym uruchomieniu) i koniec (start + DNI_GRAFIKU-1, albo koniec
 * kalendarzowego miesiąca startu, jeśli DNI_GRAFIKU puste).
 */
function getNextGrafikPeriod() {
  // formatSheetDate() (TimeTrackerService.gs) normalizuje Date -> "yyyy-MM-dd"
  // - konieczne, bo Arkusze potrafią same przekonwertować wpisane "2026-10"
  // na prawdziwą datę (bez ostrzeżenia), a wtedy proste .toString().trim() nie
  // dopasowywało się do regexu poniżej i cichcem wracało do BIEŻĄCEGO miesiąca
  // zamiast do MIESIAC_GRAFIKU (błąd znaleziony na żywo 2026-09-17).
  const lastDayStr = formatSheetDate(getSettingValue('OSTATNI_DZIEN_GRAFIKU')).trim();
  let periodStart;

  if (/^\d{4}-\d{2}-\d{2}$/.test(lastDayStr)) {
    const p = lastDayStr.split('-').map(Number);
    periodStart = new Date(p[0], p[1] - 1, p[2] + 1);
  } else {
    const miesiacGrafiku = formatSheetDate(getSettingValue('MIESIAC_GRAFIKU')).trim().slice(0, 7);
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

/**
 * Czy dany Stopien_OZN uprawnia do skróconego czasu pracy (7h/35h) wg Art. 15
 * ustawy o rehabilitacji zawodowej - TYLKO Umiarkowany i Znaczny; Lekki i
 * Brak pracują na normalnych zasadach. To INNA reguła niż zakaz nadgodzin
 * (canEmployeeHaveOvertime() w Config.gs), który dotyczy KAŻDEGO stopnia -
 * te dwie funkcje celowo się różnią.
 */
function _oznMaSkrocenieCzasuPracy(stopienOzn) {
  const s = (stopienOzn || '').toString().trim().toLowerCase();
  return s === 'umiarkowany' || s === 'znaczny';
}

/** Lista pracowników z ID_Pracownika, ChatID, imieniem/nazwiskiem, Wymiar_Etatu i uprawnieniem do skróconego czasu pracy OzN. */
function _getAllEmployeesWithChat() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const col = getEmployeesColumnMap(sheet);
  const employees = [];

  for (let i = 1; i < data.length; i++) {
    const employeeId = (data[i][col['ID_Pracownika']] || '').toString();
    if (!employeeId) continue;
    employees.push({
      employeeId: employeeId,
      chatId: (data[i][col['Telegram_ChatID']] || '').toString(),
      fullName: data[i][col['Imie_Nazwisko']] || employeeId,
      wymiarEtatu: Number(data[i][col['Wymiar_Etatu']]) || 1,
      oznSkrocenie: _oznMaSkrocenieCzasuPracy(data[i][col['Stopien_OZN']])
    });
  }

  return employees;
}

/**
 * Dobowy/tygodniowy limit KONKRETNEGO pracownika w minutach, wyliczony z jego
 * Wymiar_Etatu i Stopien_OZN (patrz komentarz na górze pliku). OzN nigdy nie
 * dostaje podniesienia limitu tygodniowego do 48h, niezależnie od
 * Ustawienia!NADGODZINY (canEmployeeHaveOvertime() już to wyklucza).
 */
function _effectiveEmployeeLimits(emp) {
  const etat = Number(emp.wymiarEtatu) || 1;
  const dailyFullNormH = emp.oznSkrocenie ? getNormaOznUop() : getNormaEtatUop();
  const weeklyFullNormH = emp.oznSkrocenie ? getNormaOznTygodniowa() : getNormaTygodniowaEtat();

  const dailyNormMin = Math.round(etat * dailyFullNormH * 60);
  const weeklyNormMin = Math.round(etat * weeklyFullNormH * 60);

  const canOvertime = !emp.oznSkrocenie && canEmployeeHaveOvertime(emp.employeeId);
  const weeklyHardCapMin = canOvertime
    ? Math.round(Math.max(weeklyNormMin, etat * getWeeklyOvertimeCap() * 60))
    : weeklyNormMin;

  return { dailyNormMin: dailyNormMin, weeklyNormMin: weeklyNormMin, weeklyHardCapMin: weeklyHardCapMin };
}

/**
 * Skraca zmianę do dobowej normy pracownika (w minutach), licząc od tej samej
 * godziny startu - nie wydłuża zmiany, jeśli firma ma tego dnia i tak krótsze
 * godziny niż norma. Limit TYGODNIOWY pilnowany jest OSOBNO (patrz
 * generateGrafikForPeriod()). Zwraca też `minutes` (długość PO skróceniu) -
 * przydatne do sumowania tygodniowego bez ponownego liczenia różnicy godzin.
 */
function _applyDailyNormLimit(parsedHours, dailyNormMin) {
  const startMin = _timeToMinutes(parsedHours.start);
  const naturalStopMin = _timeToMinutes(parsedHours.stop);
  const cappedStopMin = Math.min(naturalStopMin, startMin + dailyNormMin);
  return { start: parsedHours.start, stop: _minutesToHHMM(cappedStopMin), minutes: Math.max(0, cappedStopMin - startMin) };
}

/** Konwertuje minuty od północy na "HH:mm". */
function _minutesToHHMM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Dodaje `n` dni do daty (nowy obiekt Date, nie mutuje wejścia). */
function _addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** Poniedziałek tygodnia zawierającego `date` (konwencja polska: tydzień Pon-Nd). */
function _isoWeekStart(date) {
  const dow = date.getDay(); // 0 = niedziela ... 6 = sobota
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return _addDays(date, diffToMonday);
}

/** "2026-09-17" -> Date lokalny (bez przesunięcia strefy czasowej z Date.parse/ISO). */
function _parseDateStr(dateStr) {
  const p = dateStr.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

/**
 * Mapa "employeeId|yyyy-MM-dd" -> "Urlop"/"Chorobowe" dla WSZYSTKICH dni w
 * [startDate, endDate], na podstawie zakładki Wnioski (Status_Akceptacji =
 * Zatwierdzony). "Korekta START" jest wyłącznie ewidencyjna i NIE jest dniem
 * wolnym od pracy w Grafiku - ignorowana. e-ZLA -> "Chorobowe", każdy inny
 * zatwierdzony typ ("Urlop Wypoczynkowy"/"Urlop OzN"/"Turnus Rehabilitacyjny")
 * -> "Urlop".
 */
function _getApprovedLeaveMap(startDate, endDate) {
  const map = {};
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.LEAVES);
  if (!sheet) return map;

  const startStr = Utilities.formatDate(startDate, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(endDate, 'CET', 'yyyy-MM-dd');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[5] || '').toString().trim() !== 'Zatwierdzony') continue;

    const typ = (row[2] || '').toString().trim();
    if (typ === 'Korekta START') continue;
    const dayType = typ === 'e-ZLA' ? 'Chorobowe' : 'Urlop';

    const odStr = formatSheetDate(row[3]);
    const doStr = formatSheetDate(row[4]) || odStr;
    if (!odStr || doStr < startStr || odStr > endStr) continue;

    const empId = (row[1] || '').toString();
    const rangeStartStr = odStr > startStr ? odStr : startStr;
    const rangeEndStr = doStr < endStr ? doStr : endStr;

    for (let d = _parseDateStr(rangeStartStr); Utilities.formatDate(d, 'CET', 'yyyy-MM-dd') <= rangeEndStr; d.setDate(d.getDate() + 1)) {
      map[empId + '|' + Utilities.formatDate(d, 'CET', 'yyyy-MM-dd')] = dayType;
    }
  }

  return map;
}

/**
 * Ile minut "Praca" ma już zaplanowane każdy pracownik od poniedziałku
 * tygodnia zawierającego `periodStart` do dnia PRZED periodStart - potrzebne,
 * żeby tygodniowy limit był pilnowany NIEZALEŻNIE od granicy dwóch okresów
 * generacji (jeśli periodStart wypada w środku tygodnia, ta część tygodnia
 * została wygenerowana w POPRZEDNIM uruchomieniu i nie powinna być zerowana).
 */
function _seedWeeklyMinutesUsed(periodStart, employees) {
  const seed = {};
  employees.forEach(function (emp) { seed[emp.employeeId] = 0; });

  const weekStart = _isoWeekStart(periodStart);
  if (weekStart.getTime() === periodStart.getTime()) return seed; // okres zaczyna się w poniedziałek - nic do doliczenia

  const seedStartStr = Utilities.formatDate(weekStart, 'CET', 'yyyy-MM-dd');
  const seedEndStr = Utilities.formatDate(_addDays(periodStart, -1), 'CET', 'yyyy-MM-dd');

  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if ((row[5] || '') !== 'Praca') continue;
    const dateStr = formatSheetDate(row[2]);
    if (dateStr < seedStartStr || dateStr > seedEndStr) continue;

    const empId = (row[1] || '').toString();
    if (!(empId in seed)) seed[empId] = 0;

    const startMin = _timeToMinutes(formatSheetTime(row[3]));
    const stopMin = _timeToMinutes(formatSheetTime(row[4]));
    if (startMin === null || stopMin === null) continue;
    seed[empId] += Math.max(0, stopMin - startMin);
  }

  return seed;
}

/**
 * Rozkłada `requiredReduction` minut po `orderedCandidates` (w PODANEJ
 * kolejności - dzień na początku listy traci godziny jako pierwszy),
 * zapisując wynik do finalRows["employeeId|yyyy-MM-dd"] = [start, stop, typ].
 * Dzień w pełni pochłonięty przez redukcję -> "Wolne"; częściowo -> "Praca"
 * ze skróconym Planowany_Stop; nietknięty (redukcja już wyczerpana) ->
 * "Praca" z pełnymi, naturalnymi godzinami.
 */
function _applyReduction(orderedCandidates, requiredReduction, finalRows, employeeId) {
  let remaining = requiredReduction;

  orderedCandidates.forEach(function (c) {
    const key = employeeId + '|' + c.dateStr;

    if (remaining <= 0) {
      finalRows[key] = [c.start, c.stop, 'Praca'];
      return;
    }
    if (remaining >= c.minutes) {
      finalRows[key] = ['', '', 'Wolne'];
      remaining -= c.minutes;
      return;
    }

    const startMin = _timeToMinutes(c.start);
    finalRows[key] = [c.start, _minutesToHHMM(startMin + (c.minutes - remaining)), 'Praca'];
    remaining = 0;
  });
}

/**
 * Sprawdza, czy KONFIGURACJA godzin otwarcia firmy (Ustawienia!"dni pracy"/
 * "godziny pracy") pozwala zachować odpoczynek dobowy (min. 11h nieprzerwanie,
 * Art. 132 §1 KP) między KAŻDYMI dwoma kolejnymi dniami otwarcia, oraz co
 * najmniej jeden nieprzerwany odpoczynek tygodniowy (min. 35h, Art. 133 §1 KP)
 * gdzieś w cyklu tygodniowym. Zwraca listę opisów problemów (pusta = OK).
 *
 * Sprawdzane na poziomie KONFIGURACJI FIRMY, NIE per pracownik - bo każdy
 * pracownik zaczyna zmianę zawsze w tej samej godzinie co firma, a jego
 * Planowany_Stop jest tylko SKRACANY (nigdy wydłużany) przez dobowy/tygodniowy
 * limit etatu/OzN, albo dzień jest całkiem pomijany (Wolne/Urlop/Chorobowe).
 * Skrócenie zmiany albo pominięcie dnia może więc tylko WYDŁUŻYĆ przerwę
 * między zmianami - jeśli sama konfiguracja firmy spełnia te normy, to
 * automatycznie spełnia je też KAŻDY wygenerowany indywidualny grafik.
 */
function _validateWeeklyRestCompliance(weeklyHours) {
  const openDays = [];
  const orderPonNd = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  orderPonNd.forEach(function (name, idx) {
    const parsed = parseWorkingHoursRange(weeklyHours[name]);
    if (parsed) openDays.push({ idx: idx, start: _timeToMinutes(parsed.start), stop: _timeToMinutes(parsed.stop) });
  });

  const issues = [];
  if (openDays.length === 0) return issues;

  let maxGapMinutes = 0;
  for (let i = 0; i < openDays.length; i++) {
    const curr = openDays[i];
    const next = openDays[(i + 1) % openDays.length];
    const daysBetween = ((next.idx - curr.idx + 7) % 7) || 7; // dni kalendarzowe do następnego otwarcia (7 = jedyny otwarty dzień w tygodniu)
    const gapMinutes = (daysBetween * 24 * 60) - curr.stop + next.start;
    maxGapMinutes = Math.max(maxGapMinutes, gapMinutes);

    if (gapMinutes < 11 * 60) {
      issues.push('Odpoczynek dobowy między ' + orderPonNd[curr.idx] + ' a ' + orderPonNd[next.idx] + ': tylko ' +
        (gapMinutes / 60).toFixed(1) + 'h (wymagane min. 11h, Art. 132 §1 KP) - popraw godziny w Ustawienia!"godziny pracy".');
    }
  }

  if (maxGapMinutes < 35 * 60) {
    issues.push('Odpoczynek tygodniowy: najdłuższa nieprzerwana przerwa w otwarciu firmy w cyklu tygodniowym to tylko ' +
      (maxGapMinutes / 60).toFixed(1) + 'h (wymagane min. 35h nieprzerwanie, Art. 133 §1 KP) - firma potrzebuje co najmniej jednego dnia zamknięcia więcej.');
  }

  return issues;
}

/** Pokazuje wynik _validateWeeklyRestCompliance() dla aktualnej konfiguracji godzin firmy - do uruchomienia z menu. */
function checkWeeklyRestCompliance() {
  const issues = _validateWeeklyRestCompliance(getWeeklyWorkingHours());
  const msg = issues.length === 0
    ? '✅ Konfiguracja godzin firmy zachowuje odpoczynek dobowy (11h) i tygodniowy (35h).'
    : '⚠️ Znaleziono problemy z odpoczynkiem dobowym/tygodniowym:\n\n' + issues.join('\n');

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/**
 * Generuje wpisy Grafiku (Praca/Wolne/Urlop/Chorobowe) dla wszystkich
 * pracowników w podanym zakresie dat [startDate, endDate] (włącznie). Usuwa
 * najpierw istniejące wpisy z tego zakresu, żeby ponowne uruchomienie nie
 * tworzyło duplikatów. Przetwarza tydzień po tygodniu (Pon-Nd), żeby móc
 * ocenić NATURALNĄ sumę godzin całego tygodnia PRZED przycięciem do limitu -
 * dzięki temu jest wybór, KTÓRY dzień skrócić (patrz komentarz na górze
 * pliku o roli Groq), a nie tylko mechaniczne "obcinaj to, co przekracza".
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
  const existing = sheet.getDataRange().getValues();
  for (let i = existing.length - 1; i >= 1; i--) {
    const d = formatSheetDate(existing[i][2]);
    if (d >= startStr && d <= endStr) sheet.deleteRow(i + 1);
  }

  const holidaySet = getCompanyDaysOffSet(startDate, endDate); // ustawowe + dodatkowe z arkusza "Dni wolne"
  const leaveMap = _getApprovedLeaveMap(startDate, endDate); // zatwierdzone urlopy/e-ZLA z Wniosków
  const availabilityCache = {}; // "employeeId|YYYY-MM" -> [dni wolne]
  const weeklyMinutesUsed = _seedWeeklyMinutesUsed(startDate, employees);

  const finalRows = {}; // "employeeId|yyyy-MM-dd" -> [start, stop, typ]
  const companyOpenDates = [];
  const pendingDecisions = []; // do ewentualnej recenzji Groq

  const firstWeekStart = _isoWeekStart(startDate);
  let cursorWeekStart = firstWeekStart;

  while (cursorWeekStart <= endDate) {
    const weekEnd = _addDays(cursorWeekStart, 6);

    // Poniedziałek = początek nowego tygodnia rozliczeniowego - zeruj licznik,
    // ALE NIE dla pierwszego (częściowego) tygodnia okresu: ten licznik został
    // już zaseedowany z historii przez _seedWeeklyMinutesUsed() powyżej.
    if (cursorWeekStart.getTime() !== firstWeekStart.getTime()) {
      employees.forEach(function (emp) { weeklyMinutesUsed[emp.employeeId] = 0; });
    }

    // Dni TEGO tygodnia, które faktycznie leżą w generowanym zakresie I firma
    // w ogóle pracuje (święto/brak godzin = firma zamknięta - ŻADEN wiersz
    // dla nikogo, patrz komentarz w poprzedniej wersji o checkMissingStartLogs()).
    const weekDayInfos = [];
    for (let d = new Date(Math.max(cursorWeekStart.getTime(), startDate.getTime())); d <= weekEnd && d <= endDate; d = _addDays(d, 1)) {
      const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
      const dayName = GRAFIK_DAY_NAMES[d.getDay()];
      const isHoliday = !!holidaySet[dateStr];
      const parsedHours = isHoliday ? null : parseWorkingHoursRange(weeklyHours[dayName]);
      if (!parsedHours) continue;

      weekDayInfos.push({ dateStr: dateStr, date: new Date(d), parsedHours: parsedHours });
      if (companyOpenDates.indexOf(dateStr) === -1) companyOpenDates.push(dateStr);
    }

    employees.forEach(function (emp) {
      const limits = _effectiveEmployeeLimits(emp);
      const candidates = []; // dni tego tygodnia, które NATURALNIE (bez limitu tygodniowego) byłyby "Praca"

      weekDayInfos.forEach(function (info) {
        const leaveType = leaveMap[emp.employeeId + '|' + info.dateStr];
        if (leaveType) {
          finalRows[emp.employeeId + '|' + info.dateStr] = ['', '', leaveType];
          return;
        }

        const monthKey = Utilities.formatDate(info.date, 'CET', 'yyyy-MM');
        const cacheKey = emp.employeeId + '|' + monthKey;
        if (!(cacheKey in availabilityCache)) {
          availabilityCache[cacheKey] = getEmployeeAvailability(emp.employeeId, monthKey);
        }
        if (availabilityCache[cacheKey].indexOf(info.date.getDate()) !== -1) {
          finalRows[emp.employeeId + '|' + info.dateStr] = ['', '', 'Wolne'];
          return;
        }

        const shift = _applyDailyNormLimit(info.parsedHours, limits.dailyNormMin);
        if (shift.minutes <= 0) {
          finalRows[emp.employeeId + '|' + info.dateStr] = ['', '', 'Wolne'];
          return;
        }
        candidates.push({ dateStr: info.dateStr, minutes: shift.minutes, start: shift.start, stop: shift.stop });
      });

      if (candidates.length === 0) return;

      const totalNatural = candidates.reduce(function (sum, c) { return sum + c.minutes; }, 0);
      const availableBudget = Math.max(0, limits.weeklyHardCapMin - weeklyMinutesUsed[emp.employeeId]);

      if (totalNatural <= availableBudget) {
        candidates.forEach(function (c) {
          finalRows[emp.employeeId + '|' + c.dateStr] = [c.start, c.stop, 'Praca'];
        });
        weeklyMinutesUsed[emp.employeeId] += totalNatural;
        return;
      }

      const requiredReduction = totalNatural - availableBudget;

      // Domyślna (deterministyczna) kolejność obcinania: od NAJPÓŹNIEJSZEGO
      // dnia tygodnia - identyczne zachowanie jak w poprzedniej wersji
      // generatora. Stosowana OD RAZU, żeby wynik był zawsze kompletny i
      // zgodny z prawem, NIEZALEŻNIE od tego, czy recenzja Groq się powiedzie.
      const defaultOrder = candidates.slice().sort(function (a, b) { return b.dateStr.localeCompare(a.dateStr); });
      _applyReduction(defaultOrder, requiredReduction, finalRows, emp.employeeId);
      weeklyMinutesUsed[emp.employeeId] += availableBudget;

      pendingDecisions.push({
        employeeId: emp.employeeId,
        fullName: emp.fullName,
        weekLabel: Utilities.formatDate(cursorWeekStart, 'CET', 'yyyy-MM-dd') + ' – ' + Utilities.formatDate(weekEnd, 'CET', 'yyyy-MM-dd'),
        candidates: candidates,
        requiredReduction: requiredReduction
      });
    });

    cursorWeekStart = _addDays(cursorWeekStart, 7);
  }

  // --- Opcjonalna recenzja Groq: WYŁĄCZNIE zmiana kolejności obcinania w
  // ramach już-poprawnych decyzji powyżej (patrz komentarz na górze pliku).
  // Każdy błąd (brak klucza, HTTP, JSON) jest łapany tutaj - domyślna
  // kolejność zastosowana wyżej zostaje bez zmian, generacja nigdy nie pada
  // z powodu Groq.
  if (pendingDecisions.length > 0) {
    try {
      const overrides = _reviewCutDecisionsWithGroq(pendingDecisions);
      overrides.forEach(function (orderedCandidates, idx) {
        if (!orderedCandidates) return;
        const decision = pendingDecisions[idx];
        _applyReduction(orderedCandidates, decision.requiredReduction, finalRows, decision.employeeId);
      });
    } catch (err) {
      Logger.log('⚠️ Recenzja Groq nieudana, zostaje domyślne (chronologiczne) rozłożenie ograniczeń: ' + err.toString());
    }
  }

  // --- Zapis wierszy ---
  const newRows = [];
  Object.keys(finalRows).forEach(function (key) {
    const sep = key.indexOf('|');
    const empId = key.slice(0, sep);
    const dateStr = key.slice(sep + 1);
    const row = finalRows[key];
    newRows.push(['GRF-' + Utilities.getUuid(), empId, dateStr, row[0], row[1], row[2]]);
  });
  newRows.sort(function (a, b) { return a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]); });

  const uncoveredDays = companyOpenDates.filter(function (dateStr) {
    if (employees.length === 0) return false;
    return !employees.some(function (emp) {
      const row = finalRows[emp.employeeId + '|' + dateStr];
      return row && row[2] === 'Praca';
    });
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  const restIssues = _validateWeeklyRestCompliance(weeklyHours);

  return { rowsWritten: newRows.length, uncoveredDays: uncoveredDays, restIssues: restIssues };
}

/**
 * Prosi Groq o kolejność obcinania dla każdej decyzji z `pendingDecisions`
 * (patrz generateGrafikForPeriod() i komentarz na górze pliku). Zwraca
 * tablicę RÓWNOLEGŁĄ do pendingDecisions: na indeksie i - albo tablica
 * kandydatów w proponowanej kolejności (JUŻ zwalidowana jako permutacja
 * TYCH SAMYCH dni), albo undefined (zostaje domyślna kolejność). Brak
 * GROQ_API_KEY -> cicho zwraca [] (bez wywołania API), tak jak "Sugestie AI"
 * w PodstawyPrawneService.gs.
 */
function _reviewCutDecisionsWithGroq(pendingDecisions) {
  const apiKey = (getSettingValue('GROQ_API_KEY') || '').toString().trim();
  if (!apiKey) return [];

  const fairness = getWeekendShiftFairnessReport(60);
  const fairnessByEmp = {};
  fairness.forEach(function (r) { fairnessByEmp[r.employeeId] = r.weekendShifts; });

  const decisionsForPrompt = pendingDecisions.map(function (d, idx) {
    return {
      decisionIndex: idx,
      pracownik: d.fullName,
      tydzien: d.weekLabel,
      wymaganeOgraniczenieMin: d.requiredReduction,
      ostatnieZmianyWeekendowe60dni: fairnessByEmp[d.employeeId] || 0,
      kandydujaceDni: d.candidates.map(function (c) { return { data: c.dateStr, minuty: c.minutes }; })
    };
  });

  const prompt =
    'Generujemy Grafik pracy. Dla poniższych pracowników tygodniowy limit godzin (zgodny z prawem, JUŻ WYLICZONY, ' +
    'NIE DO ZMIANY) wymaga skrócenia/pominięcia niektórych dni w danym tygodniu - łączna wielkość ograniczenia ' +
    '("wymaganeOgraniczenieMin") jest STAŁA. Twoje ZADANIE: dla każdej decyzji zwróć TYLKO kolejność (permutację) ' +
    'dat z "kandydujaceDni" - dzień na POCZĄTKU listy traci godziny jako pierwszy. Cel: rozłożyć ograniczenia ' +
    'SPRAWIEDLIWIE w czasie - jeśli pracownik miał dużo zmian weekendowych w ostatnich 60 dniach ' +
    '("ostatnieZmianyWeekendowe60dni"), preferuj obcięcie JEMU dnia weekendowego (jeśli jest kandydujący); jeśli ' +
    'miał mało, unikaj obcinania mu kolejnego weekendu, gdy w tygodniu jest inny kandydujący dzień. Zwróć ' +
    'WYŁĄCZNIE czysty JSON (bez markdown, bez komentarzy, bez żadnego tekstu poza JSON) w formacie: ' +
    '[{"decisionIndex":0,"orderedDates":["YYYY-MM-DD", ...]}, ...] - "orderedDates" MUSI zawierać DOKŁADNIE te ' +
    'same daty co "kandydujaceDni" tej decyzji, tylko w innej kolejności.\n\n' +
    'Decyzje:\n' + JSON.stringify(decisionsForPrompt);

  const raw = _callGroq(apiKey, prompt);
  const jsonText = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('Odpowiedź Groq nie jest listą JSON.');

  const result = [];
  parsed.forEach(function (entry) {
    const decision = pendingDecisions[entry.decisionIndex];
    if (!decision || !Array.isArray(entry.orderedDates)) return;

    const candidateByDate = {};
    decision.candidates.forEach(function (c) { candidateByDate[c.dateStr] = c; });

    const validSet = Object.keys(candidateByDate).sort();
    const proposedSet = entry.orderedDates.slice().sort();
    const isValidPermutation = validSet.length === proposedSet.length &&
      validSet.every(function (v, i) { return v === proposedSet[i]; });
    if (!isValidPermutation) return; // odrzuć - nie jest permutacją tych samych dni, zostaje domyślna kolejność

    result[entry.decisionIndex] = entry.orderedDates.map(function (dateStr) { return candidateByDate[dateStr]; });
  });

  return result;
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
  if (result.restIssues.length > 0) {
    employerMsg += '\n\n⚠️ UWAGA - godziny firmy łamią odpoczynek dobowy/tygodniowy:\n' + result.restIssues.join('\n');
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
 * Jednorazowe (re)generowanie szerokiego zakresu Grafiku: od 1. dnia miesiąca
 * 2 miesiące przed `anchorDateStr` (albo dzisiejszą datą, jeśli nie podano),
 * przez okres zawierający `anchorDate`, aż do KOŃCA kolejnego okresu po nim -
 * czyli "historia 2 miesiące wstecz + aktualny grafik + następny okres" w
 * jednym ciągłym wywołaniu generateGrafikForPeriod() (ciągłość tygodni jest
 * więc automatyczna - to jeden nieprzerwany zakres, nie kilka osobnych
 * generacji). Po zakończeniu aktualizuje OSTATNI_DZIEN_GRAFIKU, żeby kolejne
 * (przyrostowe, dzienne) generacje kontynuowały od tego punktu.
 * @param {string} [anchorDateStr] "yyyy-MM-dd"; puste/brak = dzisiejsza data.
 */
function generateGrafikHistoryAndUpcoming(anchorDateStr) {
  const anchor = anchorDateStr ? _parseDateStr(anchorDateStr) : new Date();
  anchor.setHours(0, 0, 0, 0);

  const dniGrafiku = Number(getSettingValue('DNI_GRAFIKU'));
  const rangeStart = new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1);

  let periodStart = rangeStart;
  let periodEnd;
  let anchorCovered = false;
  let finalEnd = null;

  while (true) {
    periodEnd = dniGrafiku > 0
      ? new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + dniGrafiku - 1)
      : new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);

    if (anchor >= periodStart && anchor <= periodEnd) {
      anchorCovered = true;
    } else if (anchorCovered) {
      finalEnd = periodEnd; // okres PO tym, w którym leży anchor - kończymy na nim (włącznie)
      break;
    }

    periodStart = _addDays(periodEnd, 1);
  }

  const result = generateGrafikForPeriod(rangeStart, finalEnd);
  setSettingValue('OSTATNI_DZIEN_GRAFIKU', Utilities.formatDate(finalEnd, 'CET', 'yyyy-MM-dd'));

  const startStr = Utilities.formatDate(rangeStart, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(finalEnd, 'CET', 'yyyy-MM-dd');
  let msg = '📜 Wygenerowano historię (2 mies. wstecz) + aktualny + kolejny okres: ' + startStr + ' – ' + endStr +
    ' (' + result.rowsWritten + ' wpisów).';
  if (result.uncoveredDays.length > 0) {
    msg += '\n\n⚠️ UWAGA - brak obsady w dni: ' + result.uncoveredDays.join(', ') + '.';
  }
  if (result.restIssues.length > 0) {
    msg += '\n\n⚠️ UWAGA - godziny firmy łamią odpoczynek dobowy/tygodniowy:\n' + result.restIssues.join('\n');
  }

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI (np. wywołanie z triggera) - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/** Wrapper bez argumentów (kotwica = dzisiejsza data) - do menu. */
function generateGrafikHistoryAndUpcomingFromMenu() {
  return generateGrafikHistoryAndUpcoming(null);
}

/**
 * Raport informacyjny ("sprawiedliwa rotacja"): ile zmian w Sobotę/Niedzielę
 * miał każdy pracownik w ostatnich `daysBack` dniach Grafiku. Wyłącznie do
 * wglądu dla pracodawcy (i jako kontekst dla _reviewCutDecisionsWithGroq()) -
 * NIE zmienia automatycznie przydziałów.
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

/**
 * Obsługa instalowalnego triggera onEdit na CAŁYM arkuszu (patrz
 * zainstalujAutomatycznaRegeneracjeUrlopuNaZadanie() w NarzedziaSerwisowe.gs):
 * gdy Status_Akceptacji wniosku zostanie ustawiony na "Zatwierdzony" I typ
 * wniosku to WYŁĄCZNIE "Urlop na żądanie" (Art. 167(2) KP - pracownik może go
 * zgłosić tego samego dnia, pracodawca ma go zaakceptować z góry, więc grafik
 * NIE MOŻE czekać na ręczne odpalenie generatora) - automatycznie przebudowuje
 * CAŁY tydzień/tygodnie obejmujące ten urlop (żeby limity godzin pozostałych
 * pracowników w tym samym tygodniu zostały poprawnie przeliczone na nowo, nie
 * tylko dzień urlopującego). Inne typy wniosków i inne statusy (w tym
 * "Odrzucony", nawet zatwierdzony-po-fakcie-a-później-odrzucony) NIE wyzwalają
 * automatycznej regeneracji - to zwykłe, zaplanowane z wyprzedzeniem urlopy,
 * gdzie ręczne odpalenie generatora (albo poczekanie do następnego dziennego
 * triggera) jest wystarczające i bezpieczniejsze (brak zaskakujących zmian w
 * grafiku bez ręcznej weryfikacji).
 */
function onEditWnioski(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.LEAVES) return;
  if (e.range.getRow() === 1) return; // nagłówek
  if (e.range.getColumn() !== 6) return; // tylko Status_Akceptacji
  if ((e.value || '').toString().trim() !== 'Zatwierdzony') return;

  const row = e.range.getRow();
  const rowValues = sheet.getRange(row, 1, 1, 8).getValues()[0];
  if ((rowValues[2] || '').toString().trim() !== 'Urlop na żądanie') return;

  const odStr = formatSheetDate(rowValues[3]);
  const doStr = formatSheetDate(rowValues[4]) || odStr;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(odStr)) return;

  // Poza już wygenerowanym zakresem (np. ktoś wpisał "urlop na żądanie" z
  // datą w dalekiej przyszłości) - zostaw normalnemu, przyrostowemu cyklowi
  // generacji, żeby nie tworzyć przedwczesnej, potencjalnie niekompletnej
  // "dziury" przed właściwym OSTATNI_DZIEN_GRAFIKU.
  const lastGenStr = formatSheetDate(getSettingValue('OSTATNI_DZIEN_GRAFIKU')).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastGenStr) && odStr > lastGenStr) return;

  const regenStart = _isoWeekStart(_parseDateStr(odStr));
  const regenEnd = _addDays(_isoWeekStart(_parseDateStr(doStr)), 6);
  const result = generateGrafikForPeriod(regenStart, regenEnd);

  const emp = getEmployeeById((rowValues[1] || '').toString());
  const empName = emp ? emp.fullName : rowValues[1];

  let msg = '🚨 Urlop na żądanie zatwierdzony (' + empName + ', ' + odStr + (doStr !== odStr ? (' – ' + doStr) : '') +
    ') - grafik automatycznie przebudowany dla ' +
    Utilities.formatDate(regenStart, 'CET', 'yyyy-MM-dd') + ' – ' + Utilities.formatDate(regenEnd, 'CET', 'yyyy-MM-dd') + '.';
  if (result.uncoveredDays.length > 0) {
    msg += '\n⚠️ Brak obsady w dni: ' + result.uncoveredDays.join(', ') + '.';
  }

  getEmployerTelegramIds().forEach(function (chatId) { sendTelegramMessage(chatId, msg); });
  Logger.log(msg);
}
