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
      return { ok: false, error: "Invalid initData" };
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
      return { ok: false, error: "Invalid initData" };
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
      return { ok: false, error: "Invalid initData" };
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
