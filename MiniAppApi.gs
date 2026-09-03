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
