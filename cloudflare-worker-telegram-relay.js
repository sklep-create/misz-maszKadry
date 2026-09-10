/**
 * Przekaźnik (proxy) między webhookiem Telegrama a Google Apps Script.
 *
 * PROBLEM: Google Apps Script Web App (/exec) zawsze odpowiada
 * przekierowaniem HTTP 302 (na script.googleusercontent.com), zanim
 * jakikolwiek kod doPost/doGet się wykona. Telegram NIE podąża za
 * przekierowaniami przy dostarczaniu webhooków i traktuje 302 jako błąd
 * ("Wrong response from the webhook: 302 Found").
 *
 * ROZWIĄZANIE: ten Worker odbiera POST od Telegrama, sam podąża za
 * przekierowaniem Google (fetch() w Workers robi to domyślnie), czeka
 * na pełne wykonanie doPost w Apps Script, i zawsze zwraca Telegramowi
 * czyste 200 OK.
 *
 * WDROŻENIE (Cloudflare Dashboard → Workers & Pages → Create → Edit code):
 * 1. Podmień GAS_EXEC_URL poniżej na aktualny URL wdrożenia (.../exec).
 * 2. Zapisz i wdróż.
 * 3. Skopiuj URL Workera (https://<nazwa>.<subdomena>.workers.dev).
 * 4. W arkuszu: ⚙️ System Kadrowy → 🛠️ Narzędzia Bota →
 *    ustaw ten URL jako webhook (patrz TELEGRAM_WEBHOOK_PROXY_URL w Setup.gs).
 *
 * Jeśli GAS_EXEC_URL się zmieni (nowe wdrożenie /exec), wystarczy
 * podmienić tylko tę stałą i ponownie wdrożyć Worker — nic więcej.
 */

const GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycbzx1KPVBE9HrxP1MUsOzXbe9FY5ezgExrveX5lfjfmVLIobLxs8NFrCyziY0YP8w3_8ug/exec";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const body = await request.text();

    try {
      const gasResponse = await fetch(GAS_EXEC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        redirect: "follow"
      });
      // Wynik nie jest potrzebny Telegramowi - ważne, że doPost się wykonał.
      await gasResponse.text();
    } catch (err) {
      // Logujemy w Cloudflare (widoczne w zakładce "Logs" Workera),
      // ale i tak zwracamy 200, żeby Telegram nie zarzucał wiadomościami.
      console.error("Błąd przekazywania do Apps Script: " + err);
    }

    return new Response("OK", { status: 200 });
  }
};
