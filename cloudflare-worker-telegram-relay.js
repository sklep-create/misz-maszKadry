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
 *
 * OCHRONA PRZED SPAMEM/PODROBIONYMI ŻĄDANIAMI: ten Worker (a przez to
 * GAS_EXEC_URL, bo jest tu jawnie w kodzie w repo) jest publicznie
 * dostępny pod POST — bez poniższej weryfikacji ktokolwiek mógłby
 * POST-ować dowolny JSON udający update Telegrama. Telegram dołącza
 * nagłówek X-Telegram-Bot-Api-Secret-Token (ustawiany przez secret_token
 * w setWebhook — patrz telegramSetWebhookNow()/setupTelegramWebhook() w
 * Apps Script) do KAŻDEGO prawdziwego update'u. Worker go tu sprawdza, a
 * zgodny sekret doczepia jako ?secret= do żądania przekazywanego dalej do
 * GAS (który sam nie ma dostępu do nagłówków HTTP w doPost).
 * WEBHOOK_SECRET poniżej MUSI być identyczny z TELEGRAM_WEBHOOK_SECRET w
 * Properties Service GAS (Logger/alert pokazują wartość po ustawieniu
 * webhooka) — inaczej wszystkie prawdziwe update'y zaczną być odrzucane.
 */

const GAS_EXEC_URL = "https://script.google.com/macros/s/AKfycbyjmXkemAgKBPI2sHzqCDg32dpS8bmHwDZHk_EBXjJxPnUJ6R127-keH3uVSpz1f4gV/exec";
const WEBHOOK_SECRET = "WKLEJ_TU_SEKRET_Z_APPS_SCRIPT";

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
  // Odrzuć wszystko, co nie ma prawdziwego sekretu Telegrama w nagłówku -
  // zwracamy 200 OK bez przetwarzania, żeby nie zdradzać ataku i nie
  // prowokować Telegrama (ani atakującego) do ponawiania żądań.
  const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    console.warn("Odrzucono POST bez zgodnego sekretu Telegrama.");
    return new Response("OK", { status: 200 });
  }

  const body = await request.text();
  const targetUrl = GAS_EXEC_URL + "?secret=" + encodeURIComponent(WEBHOOK_SECRET);

  try {
    const gasResponse = await fetch(targetUrl, {
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

    // Odpowiedzi HtmlService (strony) Google owija we własny "wrapper" z
    // paskiem ostrzeżeń i ładuje właściwą treść w ukrytym iframe zamiast
    // prawdziwego przekierowania 302. Wyciągamy prawdziwy HTML wprost
    // z tego wrappera, żeby ominąć pasek i iframe.
    const extracted = contentType.includes("text/html") ? extractUserHtml(body) : null;

    return new Response(extracted || body, {
      status: gasResponse.status,
      headers: { "Content-Type": extracted ? "text/html; charset=utf-8" : contentType }
    });
  } catch (err) {
    return new Response("Błąd proxy: " + err, { status: 502 });
  }
}

/**
 * Wyciąga rzeczywisty HTML strony z wrappera goog.script.init(...),
 * jeśli odpowiedź nim jest. Zwraca null, gdy nie da się wyciągnąć
 * (np. format się zmienił) - wtedy używana jest oryginalna treść.
 */
function extractUserHtml(html) {
  try {
    const match = html.match(/goog\.script\.init\("((?:[^"\\]|\\.)*)"/);
    if (!match) return null;

    // Cloudflare Workers blokuje eval()/Function() (generowanie kodu
    // z ciągów znaków), więc dekodujemy literał JS ręcznie: jedyna
    // różnica względem poprawnego JSON-a to escape'y \xHH (JS), które
    // zamieniamy na \u00HH (JSON), a resztę parsuje już JSON.parse.
    const jsonSafe = match[1].replace(/\\x([0-9a-fA-F]{2})/g, "\\u00$1");
    const decodedJson = JSON.parse('"' + jsonSafe + '"');
    const payload = JSON.parse(decodedJson);

    return payload && typeof payload.userHtml === "string" ? payload.userHtml : null;
  } catch (err) {
    console.error("Nie udało się wyciągnąć userHtml: " + err);
    return null;
  }
}
