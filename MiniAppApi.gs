/**
 * Rejestracja zdarzeń START/STOP wywoływana z Telegram Mini App.
 * @param {Object} params Parametry zapytania HTTP.
 * @returns {{ok: boolean, message?: string, time?: string, error?: string}}
 */
function registerEventFromMiniApp(params) {
  try {
    const eventType = ((params.type || "") + "").toUpperCase();
    const initData = (params.initData || "") + "";

    if (eventType !== "START" && eventType !== "STOP") {
      return { ok: false, error: "Nieprawidłowy typ zdarzenia." };
    }

    const verification = verifyTelegramInitData(initData, getTelegramToken());
    if (!verification.ok) {
      return { ok: false, error: verification.error || "Invalid initData" };
    }

    const auth = isUserAuthorized(verification.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        error: "Musisz najpierw dokończyć autoryzację PIN w bocie Telegram."
      };
    }

    registerTimeEvent(auth.employeeId, eventType, "MiniApp");

    return {
      ok: true,
      message: eventType === "START"
        ? "✅ Rejestracja rozpoczęta"
        : "🛑 Rejestracja zakończona",
      time: getFormattedTime()
    };
  } catch (err) {
    Logger.log("Błąd registerEventFromMiniApp: " + err.toString());
    return { ok: false, error: "Wystąpił błąd podczas rejestracji zdarzenia." };
  }
}

/**
 * Zwraca dane potrzebne do zbudowania Panelu Pracownika: status, historię i grafik.
 * @param {Object} params Parametry zapytania HTTP.
 * @returns {{ok: boolean, employeeName?: string, status?: Object, history?: Object[], schedule?: Object[], error?: string}}
 */
function getMiniAppDashboard(params) {
  try {
    const initData = (params.initData || "") + "";

    const verification = verifyTelegramInitData(initData, getTelegramToken());
    if (!verification.ok) {
      return { ok: false, error: verification.error || "Invalid initData" };
    }

    const auth = isUserAuthorized(verification.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        error: "Musisz najpierw dokończyć autoryzację PIN w bocie Telegram."
      };
    }

    return {
      ok: true,
      employeeName: auth.name || "",
      status: getEmployeeStatus(auth.employeeId),
      history: getTimeEventsForEmployee(auth.employeeId, 10),
      schedule: getUpcomingScheduleForEmployee(auth.employeeId, 7)
    };
  } catch (err) {
    Logger.log("Błąd getMiniAppDashboard: " + err.toString());
    return { ok: false, error: "Wystąpił błąd podczas pobierania danych." };
  }
}

/**
 * Zapisuje wniosek o korektę zgłoszony z formularza w Mini App.
 * @param {Object} params Parametry zapytania HTTP.
 * @returns {{ok: boolean, message?: string, error?: string}}
 */
function submitCorrectionFromMiniApp(params) {
  try {
    const initData = (params.initData || "") + "";
    const date = ((params.date || "") + "").trim();
    const time = ((params.time || "") + "").trim();
    const note = ((params.note || "") + "").trim();

    const verification = verifyTelegramInitData(initData, getTelegramToken());
    if (!verification.ok) {
      return { ok: false, error: verification.error || "Invalid initData" };
    }

    const auth = isUserAuthorized(verification.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        error: "Musisz najpierw dokończyć autoryzację PIN w bocie Telegram."
      };
    }

    if (!date || !time) {
      return { ok: false, error: "Podaj datę i godzinę korekty." };
    }

    saveStructuredCorrectionRequest(auth.employeeId, date, time, note);

    return { ok: true, message: "📩 Wniosek o korektę został przesłany do akceptacji pracodawcy." };
  } catch (err) {
    Logger.log("Błąd submitCorrectionFromMiniApp: " + err.toString());
    return { ok: false, error: "Wystąpił błąd podczas zapisywania korekty." };
  }
}

/**
 * Dane do zakładki Dyspozycyjność: wybieralne miesiące, dni wybranego
 * miesiąca, limit dni wolnych i już zapisany wybór pracownika.
 * @param {Object} params Parametry zapytania HTTP (initData, opcjonalnie month).
 */
function getAvailabilityData(params) {
  try {
    const initData = (params.initData || "") + "";

    const verification = verifyTelegramInitData(initData, getTelegramToken());
    if (!verification.ok) {
      return { ok: false, error: verification.error || "Invalid initData" };
    }

    const auth = isUserAuthorized(verification.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        error: "Musisz najpierw dokończyć autoryzację PIN w bocie Telegram."
      };
    }

    const months = getSelectableAvailabilityMonths(4);
    const requestedMonth = ((params.month || "") + "").trim();
    const monthValue = months.some(function (m) { return m.value === requestedMonth; })
      ? requestedMonth
      : months[0].value;

    const parts = monthValue.split("-").map(Number);
    const year = parts[0];
    const month = parts[1];
    const daysInMonth = getDaysInMonth(year, month);

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      days.push({ day: d, dayName: POLISH_DAY_NAMES_SHORT[dayOfWeek] });
    }

    return {
      ok: true,
      months: months,
      selectedMonth: monthValue,
      limit: getAvailabilityLimit(auth.employeeId, year, month),
      days: days,
      selectedDays: getEmployeeAvailability(auth.employeeId, monthValue)
    };
  } catch (err) {
    Logger.log("Błąd getAvailabilityData: " + err.toString());
    return { ok: false, error: "Wystąpił błąd podczas pobierania dyspozycyjności." };
  }
}

/**
 * Zapisuje dyspozycyjność (dni wolne) zgłoszoną z Mini App.
 * @param {Object} params Parametry zapytania HTTP (initData, month, days - lista dni po przecinku).
 */
function submitAvailability(params) {
  try {
    const initData = (params.initData || "") + "";
    const month = ((params.month || "") + "").trim();
    const daysParam = ((params.days || "") + "").trim();

    const verification = verifyTelegramInitData(initData, getTelegramToken());
    if (!verification.ok) {
      return { ok: false, error: verification.error || "Invalid initData" };
    }

    const auth = isUserAuthorized(verification.userId);
    if (!auth.authorized) {
      return {
        ok: false,
        error: "Musisz najpierw dokończyć autoryzację PIN w bocie Telegram."
      };
    }

    const days = daysParam ? daysParam.split(",") : [];
    const result = saveEmployeeAvailability(auth.employeeId, month, days);
    if (!result.ok) {
      return result;
    }

    return { ok: true, message: "✅ Dyspozycyjność zapisana." };
  } catch (err) {
    Logger.log("Błąd submitAvailability: " + err.toString());
    return { ok: false, error: "Wystąpił błąd podczas zapisywania dyspozycyjności." };
  }
}
