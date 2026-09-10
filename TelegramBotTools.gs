/**
 * 🛠️ NARZĘDZIA DIAGNOSTYCZNE BOTA TELEGRAM
 * ---------------------------------------
 * Zbiór funkcji, które uruchamiasz RĘCZNIE z edytora Apps Script
 * (listy funkcji: [Uruchom ▾]) lub z menu arkusza „⚙️ System Kadrowy”.
 *
 * Co potrafią:
 *  - runFullBotDiagnostics()      - pełna diagnostyka (token, webhook, arkusz, bot)
 *  - telegramGetMe()              - sprawdza czy token bota jest poprawny (getMe)
 *  - telegramGetWebhookInfo()     - pokazuje aktualnie ustawiony webhook + błędy
 *  - telegramSetWebhookNow()      - ustawia webhook na adres z Properties Service
 *  - telegramResetWebhook()       - USUWA webhook (Telegram wraca do long-polling)
 *  - telegramSendTestMessage()    - wysyła wiadomość testową na podany ChatID
 *  - telegramFlushUpdates()       - czyści kolejkę pendnych update'ow
 */

/** Pobiera token bota albo rzuca wyjątek z jasnym komunikatem. */
function _botTokenOrThrow() {
  return getTelegramToken(); // rzuca błąd, gdy token nie jest ustawiony
}

/** Wykonuje dowolne żądanie do Telegram Bot API i zwraca obiekt JSON. */
function _botApi(method, params) {
  const token = _botTokenOrThrow();
  const baseUrl = "https://api.telegram.org/bot" + token + "/" + method;
  const response = UrlFetchApp.fetch(baseUrl, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(params || {})
  });
  const text = response.getContentText();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("Odpowiedź Telegrama nie jest JSON: " + text);
  }
  return json;
}

/**
 * Zgłasza wynik funkcji: zapisuje go do logów i pokazuje w okienku
 * z przyciskiem kopiowania, o ile wykonywana jest w kontekście z
 * dostępnym UI (arka Google). Przy silent=true pomija okienko
 * (używane, gdy wynik jest tylko składową większego raportu).
 */
function _reportResult(text, silent) {
  Logger.log(text);
  if (silent) return text;
  try {
    _showCopyableDialog("Wynik diagnostyki", text);
  } catch (e) {
    Logger.log("⚠️ Nie udało się pokazać okna z przyciskiem kopiowania: " + e.toString());
    try {
      SpreadsheetApp.getUi().alert(text);
    } catch (e2) {
      // brak UI (np. webhook/trigger) - GitHub Actions/run w edytorze i tak zobaczą Logger.log
    }
  }
  return text;
}

/** Pokazuje tekst w oknie z polem do zaznaczenia i przyciskiem "Kopiuj". */
function _showCopyableDialog(title, text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const html = HtmlService.createHtmlOutput(
    '<textarea id="txt" style="width:100%;height:340px;font-family:monospace;' +
    'font-size:12px;box-sizing:border-box;" readonly>' + escaped + '</textarea>' +
    '<div style="margin-top:10px;text-align:right;">' +
    '<button onclick="copyText()" style="padding:8px 16px;font-size:13px;cursor:pointer;">📋 Kopiuj komunikat</button>' +
    '</div>' +
    '<script>' +
    'function copyText() {' +
    '  const el = document.getElementById("txt");' +
    '  el.select();' +
    '  el.setSelectionRange(0, 999999);' +
    '  document.execCommand("copy");' +
    '}' +
    '</script>'
  ).setWidth(520).setHeight(440);

  SpreadsheetApp.getUi().showModalDialog(html, title);
}

/** Sprawdza czy token bota jest poprawny (getMe). */
function telegramGetMe(silent) {
  try {
    const info = _botApi("getMe");
    if (info.ok) {
      const b = info.result;
      return _reportResult("🤖 BOT zidentyfikowany:\n" +
        "Nazwa: " + (b.first_name || "") + "\n" +
        "Username: @" + (b.username || "brak") + "\n" +
        "ID bota: " + b.id + "\n\n" +
        "✅ Token poprawny.", silent);
    }
    return _reportResult("❌ getMe nie powiodło się:\n" + JSON.stringify(info), silent);
  } catch (err) {
    return _reportResult("❌ Telegram nieosiągalny lub token błędny:\n" + err.toString(), silent);
  }
}

/** Pokazuje aktualny webhook + ewentualne błędy Telegrama. */
function telegramGetWebhookInfo(silent) {
  try {
    const info = _botApi("getWebhookInfo");
    if (!info.ok) {
      return _reportResult("❌ getWebhookInfo error:\n" + JSON.stringify(info), silent);
    }
    const w = info.result;
    const lines = [
      "📡 WEBHOOK INFO",
      "----------------",
      "url: " + (w.url || "BRAK"),
      "has_custom_certificate: " + w.has_custom_certificate,
      "pending_update_count: " + w.pending_update_count,
      "last_error_date: " + (w.last_error_date || "-"),
      "last_error_message: " + (w.last_error_message || "BRAK"),
      "max_connections: " + (w.max_connections || "-"),
      "ip_address: " + (w.ip_address || "-")
    ];
    lines.push("");
    if (w.url) {
      lines.push("🟢 Webhook ustawiony" + (w.pending_update_count > 0 ? " (ale " + w.pending_update_count + " wiadomości czeka w kolejce)" : ""));
    } else {
      lines.push("🔴 Webhook NIE jest ustawiony.");
    }
    if (w.last_error_message) {
      lines.push("");
      lines.push("⚠️ Ostatni błąd: " + w.last_error_message);
      lines.push("👉 Częste przyczyny: zły adres /exec, stare wdrożenie, " +
        "deployment wymagający logowania zamiast publicznego /exec, " +
        "lub webhook wskazujący adres innego projektu.");
    }
    return _reportResult(lines.join("\n"), silent);
  } catch (err) {
    return _reportResult("❌ getWebhookInfo error:\n" + err.toString(), silent);
  }
}
/**
 * Ustawia webhook na adres zapisany w Properties Service.
 * Jeśli ustawiono TELEGRAM_WEBHOOK_PROXY_URL, użyty zostanie proxy
 * (np. Cloudflare Worker) zamiast bezpośredniego URL Apps Script.
 */
function telegramSetWebhookNow() {
  try {
    const webhookUrl = getEffectiveTelegramWebhookUrl(); // przy braku URL rzuci wyjątek z instrukcją
    const result = _botApi("setWebhook", { url: webhookUrl });
    if (result.ok) {
      return _reportResult("✅ Webhook ustawiony:\n" + webhookUrl + "\n\n" + telegramGetWebhookInfo(true));
    }
    return _reportResult("❌ setWebhook failed:\n" + JSON.stringify(result));
  } catch (err) {
    return _reportResult("❌ Błąd setWebhook:\n" + err.toString() +
      "\n\nSprawdź: ⚙️ System Kadrowy → 📡 Ustaw Deployment ID dla Webhook'a");
  }
}

/**
 * USUWA webhook (deleteWebhook). Telegram wraca wtedy do trybu long-polling:
 * wiadomości NIE będą już automatycznie trafiać do skryptu,
 * a po ustawieniu webhooka na nowo wrócą.
 */
function telegramResetWebhook() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert(
    "🗑️ Na pewno USUNĄĆ webhook Telegrama?\n\n" +
    "Po tym kroku wiadomości bota przestaną trafiać do Apps Script do czasu " +
    "ponownego ustawienia (telegramSetWebhookNow).",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) {
    return _reportResult("Anulowano.");
  }
  try {
    const result = _botApi("deleteWebhook", { drop_pending_updates: true });
    if (result.ok) {
      return _reportResult("✅ Webhook usunięty, pending updates odrzucone.\n\n" + telegramGetWebhookInfo(true));
    }
    return _reportResult("❌ deleteWebhook failed:\n" + JSON.stringify(result));
  } catch (err) {
    return _reportResult("❌ Błąd deleteWebhook:\n" + err.toString());
  }
}

/** Wysyła wiadomość testową na podany ChatID. */
function telegramSendTestMessage() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt("✉️ Wpisz ChatID odbiorcy (liczba), np. 123456789.", ui.ButtonSet.OK_CANCEL);
  if (prompt.getSelectedButton() !== ui.Button.OK) return _reportResult("Anulowano.");
  const targetId = prompt.getResponseText().trim();
  if (!/^-?\d+$/.test(targetId)) return _reportResult("❌ ChatID musi być liczbą.");
  try {
    const result = _botApi("sendMessage", {
      chat_id: Number(targetId),
      text: "🧪 Wiadomość testowa z Google Apps Script.\nJeśli widzisz tę wiadomość, bot i token działają poprawnie.",
      parse_mode: "Markdown"
    });
    if (result.ok) return _reportResult("✅ Wiadomość testowa wysłana na ChatID " + targetId + ".");
    return _reportResult("❌ sendMessage failed:\n" + JSON.stringify(result));
  } catch (err) {
    return _reportResult("❌ Błąd sendMessage:\n" + err.toString());
  }
}

/** Czyści pending updates (drop_pending_updates) bez zmiany URL webhooka. */
function telegramFlushUpdates() {
  try {
    const info = _botApi("getWebhookInfo");
    const currentUrl = info.ok ? info.result.url : "";
    const result = _botApi("setWebhook", { url: currentUrl, drop_pending_updates: true });
    if (result.ok) {
      return _reportResult("✅ Kolejka pendnych update'ow wyczyszczona.\nWebhook pozostał: " + currentUrl);
    }
    return _reportResult("❌ flush failed:\n" + JSON.stringify(result));
  } catch (err) {
    return _reportResult("❌ Błąd flush:\n" + err.toString());
  }
}
/** Pełna diagnostyka: token, webhook, podpięty arkusz, status danych. */
function runFullBotDiagnostics() {
  const props = PropertiesService.getScriptProperties();
  const reports = [];

  // 1. Token
  const token = props.getProperty("TELEGRAM_TOKEN");
  reports.push("🔐 TOKEN: " + (token ? "ustawiony (długość " + token.length + ")" : "❌ BRAK"));

  // 2. getMe
  if (token) {
    reports.push("");
    reports.push("--- getMe ---");
    reports.push(telegramGetMe(true));
  }

  // 3. Webhook URL z Properties
  const webhookUrl = props.getProperty("WEBHOOK_DEPLOYMENT_URL");
  reports.push("");
  reports.push("📍 WEBHOOK_URL (Properties): " + (webhookUrl || "❌ BRAK"));

  // 4. Webhook info
  if (token) {
    reports.push("");
    reports.push("--- getWebhookInfo ---");
    reports.push(telegramGetWebhookInfo(true));
  }

  // 5. Format adresu
  if (webhookUrl) {
    reports.push("");
    if (webhookUrl.endsWith("/exec")) {
      reports.push("✅ Adres kończy się na /exec (poprawna forma).");
    } else {
      reports.push("🔴 UWAGA: adres NIE kończy się na /exec. Telegram wymaga adresu Web App /exec.");
    }
  }

  // 6. Arkusz
  reports.push("");
  reports.push("--- Arkusz ---");
  const sheetId = props.getProperty("SPREADSHEET_ID");
  reports.push("SPREADSHEET_ID: " + (sheetId || "❌ BRAK (uruchom: 🗂️ Zapamiętaj ID tego Arkusza)"));
  try {
    const ss = getSpreadsheet();
    reports.push("✅ Podpięty arkusz: " + ss.getName());
    const emp = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
    reports.push("Zakładka „Pracownicy”: " + (emp ? "✅ istnieje (" + (emp.getLastRow() - 1) + " wierszy danych)" : "❌ BRAK – uruchom: 🚀 Wygeneruj bazę danych"));
    const settings = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
    reports.push("Zakładka „Ustawienia”: " + (settings ? "✅ istnieje" : "❌ BRAK"));
  } catch (err) {
    reports.push("❌ Nie można otworzyć arkusza: " + err.toString());
  }

  return _reportResult(reports.join("\n"));
}