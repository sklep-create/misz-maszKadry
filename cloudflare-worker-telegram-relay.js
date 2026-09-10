/**
 * Przekaźnik (proxy) między Telegramem a Google Apps Script.
 *
 * PROBLEM: Google Apps Script Web App (/exec) zawsze odpowiada
 * przekierowaniem HTTP 302 (na script.googleusercontent.com), zanim
 * jakikolwiek kod doPost/doGet się wykona.
 * - Telegram NIE podąża za przekierowaniami przy dostarczaniu webhooków
 *   (POST) i traktuje 302 jako błąd ("Wrong response: 302 Found").
 * - WebView Telegrama (Mini App) też potrafi odrzucić fetch() między
 *   różnymi domenami Google podczas przekierowania.
 *
 * ROZWIĄZANIE: ten Worker jest pełnym proxy do Apps Script:
 * - POST (webhook Telegrama) -> przekazuje do GAS, podąża za
 *   przekierowaniem, i ZAWSZE zwraca Telegramowi czyste 200 OK.
 * - GET (strona Mini App + jej wywołania API) -> przekazuje do GAS,
 *   podąża za przekierowaniem, i zwraca PRAWDZIWĄ treść odpowiedzi
 *   (HTML albo JSON) z zachowanym kodem statusu i Content-Type.
 *
 * WDROŻENIE (Cloudflare Dashboard → Workers & Pages → Create → Edit code):
 * 1. Podmień GAS_EXEC_URL poniżej na aktualny URL wdrożenia (.../exec).
 * 2. Zapisz i wdróż.
 * 3. Skopiuj URL Workera (https://<nazwa>.<subdomena>.workers.dev).
 * 4. W arkuszu ustaw ten sam URL Workera w DWÓCH miejscach:
 *    - ⚙️ System Kadrowy → 📡 Ustaw Deployment ID dla Webhook'a
 *      (używane też do budowy przycisku "Otwórz Panel Pracownika")
 *    - ⚙️ System Kadrowy → 🌐 Ustaw URL Proxy (Cloudflare) dla Webhooka
 *      (webhook Telegrama)
 *
 * Jeśli GAS_EXEC_URL się zmieni (nowe wdrożenie /exec), wystarczy
 * podmienić tylko tę stałą i ponownie wdrożyć Worker — nic więcej.
 */

const GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycbzx1KPVBE9HrxP1MUsOzXbe9FY5ezgExrveX5lfjfmVLIobLxs8NFrCyziY0YP8w3_8ug/exec";

export default {
  async fetch(request) {
    if (request.method === "POST") {
      return handleTelegramWebhook(request);
    }
    return handleMiniAppOrPage(request);
  }
};

/** Webhook Telegrama: przekaż POST do GAS i zawsze zwróć czyste 200 OK. */
async function handleTelegramWebhook(request) {
  const body = await request.text();

  try {
    const gasResponse = await fetch(GAS_EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      redirect: "follow"
    });
    await gasResponse.text(); // wynik nieistotny dla Telegrama
  } catch (err) {
    console.error("Błąd przekazywania POST do Apps Script: " + err);
  }

  return new Response("OK", { status: 200 });
}

/** Mini App (strona + wywołania API): pełne przezroczyste proxy GET. */
async function handleMiniAppOrPage(request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = GAS_EXEC_URL + incomingUrl.search;

  try {
    const gasResponse = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow"
    });
    const contentType = gasResponse.headers.get("Content-Type") || "text/plain; charset=utf-8";
    const body = await gasResponse.text();

    return new Response(body, {
      status: gasResponse.status,
      headers: { "Content-Type": contentType }
    });
  } catch (err) {
    return new Response("Błąd proxy: " + err, { status: 502 });
  }
}
