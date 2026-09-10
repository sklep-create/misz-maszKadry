/**
 * Odbieranie powiadomień HTTP POST z Telegrama
 */
const TELEGRAM_UPDATE_STATE_KEY = 'TELEGRAM_UPDATE_STATE';
const TELEGRAM_RECENT_UPDATE_LIMIT = 50;

function doPost(e) {
  try {
    Logger.log("doPost: otrzymano POST od: " +
      (e && e.parameter && e.parameter['user-agent'] ? e.parameter['user-agent'] : "nieznane źródło"));
    const update = JSON.parse(e.postData.contents);
    const updateId = getTelegramUpdateId(update);
    
    if (updateId !== null && isTelegramUpdateProcessed(updateId)) {
      return ContentService.createTextOutput("OK");
    }
    
    if (update.message) {
      handleMessage(update.message);
    } else if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
    }
    
    if (updateId !== null) {
      markTelegramUpdateProcessed(updateId);
    }
  } catch (err) {
    Logger.log("Błąd doPost: " + err.toString());
    if (err.stack) {
      Logger.log("Stack doPost:\n" + err.stack);
    }
    if (e && e.postData && e.postData.contents) {
      try {
        Logger.log("Raw payload (pierwsze 2000 znaków):\n" + e.postData.contents.slice(0, 2000));
      } catch (logErr) {
        Logger.log("Nie udało się zapisać surowego payload: " + logErr.toString());
      }
    }
  }
  return ContentService.createTextOutput("OK");
}

function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : "";
  
  if (isEmployerTelegramChat(chatId)) {
    handleEmployerMessage(msg);
    return;
  }
  
  const auth = isUserAuthorized(chatId);
  const pinMatch = text.match(/^\/pin\s+(\d{6})$/) || text.match(/^(\d{6})$/);
  
  if (text === "/start") {
    handleStartCommand(msg, auth);
    return;
  }
  
  // Jeśli użytkownik nie jest zautoryzowany
  if (!auth.authorized) {
    if (auth.status === "Zablokowany") {
      sendTelegramMessage(
        chatId,
        "🚫 Twoje konto jest zablokowane.\nSkontaktuj się z Pracodawcą aby odblokować konto."
      );
    } else if (text === "Podaję PIN") {
      setAwaitingPinStatus(chatId);
      sendTelegramMessage(chatId, "Podaj PIN otrzymany od Pracodawcy w prywatnej wiadomości.");
    } else if (pinMatch) {
      if (auth.status !== "PodajePIN") {
        sendTelegramMessage(
          chatId,
          "🤔 Nie rozumiem. Kliknij najpierw przycisk „Podaję PIN”, a potem wyślij PIN otrzymany od Pracodawcy.",
          getPinKeyboard()
        );
      } else {
        const result = authorizeUserWithPin(chatId, pinMatch[1]);
        if (result.success) {
          sendTelegramMessage(chatId, "✅ Autoryzacja pomyślna! Możesz teraz rejestrować czas pracy.", getMainKeyboard());
        } else if (result.blocked) {
          sendTelegramMessage(
            chatId,
            "🚫 ZOSTAŁEŚ ZABLOKOWANY\nPrzekroczyłeś limit prób podania PINu.\nSkontaktuj się z Pracodawcą aby odblokować konto."
          );
        } else {
          sendTelegramMessage(
            chatId,
            `❌ PIN nieprawidłowy\nPozostało Ci ${result.attemptsLeft} prób\nPodaj poprawny PIN otrzymany od Pracodawcy.`
          );
        }
      }
    } else {
      sendTelegramMessage(
        chatId,
        "🔐 INSTRUKCJA LOGOWANIA\nAby się zalogować, kliknij przycisk poniżej i podaj PIN, który otrzymałeś od Pracodawcy.",
        getPinKeyboard()
      );
    }
    return;
  }
  
  // Przetwarzanie akcji autoryzowanego pracownika
  if (text === "▶️ START") {
    registerTimeEvent(auth.employeeId, "START");
    sendTelegramMessage(chatId, `⏱️ Rejestracja rozpoczęta o ${getFormattedTime()}`);
  } else if (text === "⏹️ STOP") {
    registerTimeEvent(auth.employeeId, "STOP");
    sendTelegramMessage(chatId, `🛑 Rejestracja zakończona o ${getFormattedTime()}`);
  } else if (text === "✏️ Zgłoś Korektę") {
    sendTelegramMessage(chatId, "Wpisz godzinę rozpoczęcia pracy, jeśli zapomniałeś kliknąć START, np:\n`/korekta 08:00 Praca stacjonarna`");
  } else if (text.startsWith("/korekta ")) {
    const details = text.replace("/korekta ", "");
    saveCorrectionRequest(auth.employeeId, details);
    sendTelegramMessage(chatId, "📩 Wniosek o korektę został przesłany do akceptacji pracodawcy.");
  } else {
    sendTelegramMessage(chatId, "Wybierz opcję z menu poniżej:", getMainKeyboard());
  }
}

function getMainKeyboard() {
  const keyboard = [];

  try {
    keyboard.push([
      {
        text: "📱 Otwórz Panel Pracownika",
        web_app: { url: getWebhookDeploymentUrl() + "?page=miniapp" }
      }
    ]);
  } catch (err) {
    Logger.log("⚠️ Mini App URL niedostępny: " + err.toString());
    // Awaryjnie (brak skonfigurowanego URL Mini App) - stare przyciski tekstowe.
    keyboard.push([{ text: "▶️ START" }, { text: "⏹️ STOP" }]);
    keyboard.push([{ text: "✏️ Zgłoś Korektę" }, { text: "📅 Swój Grafik" }]);
  }

  return {
    keyboard: keyboard,
    resize_keyboard: true
  };
}

function getEmployerKeyboard() {
  return {
    keyboard: [[{ text: "👔 Panel Pracodawcy" }]],
    resize_keyboard: true
  };
}

function getPinKeyboard() {
  return {
    keyboard: [[{ text: "Podaję PIN" }]],
    resize_keyboard: true
  };
}

function handleStartCommand(msg, auth) {
  const chatId = msg.chat.id;
  const fullName = [msg.from.first_name || "", msg.from.last_name || ""].join(" ").trim();
  
  if (isEmployerTelegramChat(chatId)) {
    handleEmployerMessage(msg);
    return;
  }
  
  if (auth.status === "Zablokowany") {
    sendTelegramMessage(
      chatId,
      "🚫 Twoje konto jest zablokowane.\nSkontaktuj się z Pracodawcą aby odblokować konto."
    );
    return;
  }
  
  if (!auth.employeeId) {
    const employee = registerNewEmployee(chatId, fullName);
    notifyEmployersAboutNewEmployee(employee, chatId);
    
    sendTelegramMessage(
      chatId,
      "🔐 INSTRUKCJA LOGOWANIA\nWitaj! Twoje konto zostało dodane do systemu.\n\nAby się zalogować, kliknij przycisk poniżej i podaj PIN, który otrzymałeś od Pracodawcy.",
      getPinKeyboard()
    );
    return;
  }
  
  if (auth.authorized) {
    sendTelegramMessage(chatId, "✅ Jesteś już autoryzowany. Wybierz opcję z menu poniżej:", getMainKeyboard());
    return;
  }
  
  sendTelegramMessage(
    chatId,
    "🔐 Twoje konto oczekuje na PIN od Pracodawcy.\nKliknij przycisk „Podaję PIN” i dokończ rejestrację.",
    getPinKeyboard()
  );
}

function handleEmployerMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : "";
  
  if (text === "/start") {
    sendTelegramMessage(
      chatId,
      "👔 Witaj, jesteś zalogowany jako Pracodawca.\n\nFunkcje panelu pracodawcy są dostępne z poziomu arkusza Google Sheets oraz Mini App.",
      getEmployerKeyboard()
    );
    return;
  }
  
  if (text === "Podaję PIN" || /^\/pin\b/.test(text)) {
    sendTelegramMessage(
      chatId,
      "👔 To konto jest oznaczone jako Pracodawca.\nPIN pracownika nie jest tutaj wymagany.",
      getEmployerKeyboard()
    );
    return;
  }
  
  sendTelegramMessage(
    chatId,
    "👔 Jesteś zalogowany jako Pracodawca.\nZarządzanie pracownikami wykonuj z poziomu arkusza Google Sheets lub Mini App.",
    getEmployerKeyboard()
  );
}

function notifyEmployersAboutNewEmployee(employee, employeeChatId) {
  const employerIds = getEmployerTelegramIds();
  if (!employerIds.length) {
    Logger.log("⚠️ Brak skonfigurowanych ID pracodawców.");
    return;
  }
  
  const employeeName = employee.fullName || "Nie podane";
  const message = [
    "🆕 NOWY PRACOWNIK",
    `Imię i nazwisko: ${employeeName}`,
    `Telegram ID: ${employeeChatId}`,
    `PIN: ${employee.pin}`,
    "",
    "Wiadomość do przekazania pracownikowi:",
    `Cześć ${employeeName}!`,
    "Aby zakończyć rejestrację w bocie, wpisz otrzymany PIN komendą:",
    `/pin ${employee.pin}`
  ].join("\n");
  
  employerIds.forEach(employerChatId => sendTelegramMessage(employerChatId, message));
}

function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data || "";
  
  if (data === "PIN_INPUT") {
    sendTelegramMessage(chatId, "Podaj PIN w formacie:\n/pin 123456");
  }
}

function sendTelegramMessage(chatId, text, replyMarkup = null) {
  try {
    const token = getTelegramToken(); // Pobierz token z Properties Service
    
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
    
    UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (err) {
    Logger.log("❌ Błąd wysyłania wiadomości Telegram: " + err.toString());
  }
}

function getTelegramUpdateId(update) {
  if (!update || typeof update.update_id === 'undefined' || update.update_id === null) {
    return null;
  }
  
  const updateId = Number(update.update_id);
  return isNaN(updateId) ? null : updateId;
}

function getTelegramUpdateState() {
  const storedState = PropertiesService.getScriptProperties().getProperty(TELEGRAM_UPDATE_STATE_KEY);
  
  if (!storedState) {
    return {
      lastUpdateId: null,
      recentIds: []
    };
  }
  
  try {
    const parsed = JSON.parse(storedState);
    return {
      lastUpdateId: typeof parsed.lastUpdateId === 'number' ? parsed.lastUpdateId : null,
      recentIds: Array.isArray(parsed.recentIds)
        ? parsed.recentIds
            .map(item => Number(item))
            .filter(item => !isNaN(item))
        : []
    };
  } catch (err) {
    Logger.log("⚠️ Nie udało się odczytać stanu update_id: " + err.toString());
    return {
      lastUpdateId: null,
      recentIds: []
    };
  }
}

function isTelegramUpdateProcessed(updateId) {
  const state = getTelegramUpdateState();
  return state.recentIds.indexOf(updateId) !== -1;
}

function markTelegramUpdateProcessed(updateId) {
  const state = getTelegramUpdateState();
  const recentIds = state.recentIds.filter(item => item !== updateId);
  
  recentIds.push(updateId);
  
  while (recentIds.length > TELEGRAM_RECENT_UPDATE_LIMIT) {
    recentIds.shift();
  }
  
  PropertiesService.getScriptProperties().setProperty(
    TELEGRAM_UPDATE_STATE_KEY,
    JSON.stringify({
      lastUpdateId: state.lastUpdateId === null ? updateId : Math.max(state.lastUpdateId, updateId),
      recentIds: recentIds
    })
  );
}
