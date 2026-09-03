/**
 * Odbieranie powiadomień HTTP POST z Telegrama
 */
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    if (update.message) {
      handleMessage(update.message);
    } else if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    Logger.log("Błąd doPost: " + err.toString());
  }
  return ContentService.createTextOutput("OK");
}

function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : "";
  const auth = isUserAuthorized(chatId);
  const pinMatch = text.match(/^\/pin\s+(\d{6})$/);
  
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
    } else if (pinMatch) {
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
          `❌ PIN nieprawidłowy\nPozostało Ci ${result.attemptsLeft} prób\nPodaj poprawny PIN:\n/pin 123456`
        );
      }
    } else if (text === "📌 Podaj PIN") {
      sendTelegramMessage(chatId, "Podaj PIN w formacie:\n/pin 123456");
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
  return {
    keyboard: [
      [{ text: "▶️ START" }, { text: "⏹️ STOP" }],
      [{ text: "✏️ Zgłoś Korektę" }, { text: "📅 Swój Grafik" }]
    ],
    resize_keyboard: true
  };
}

function getPinKeyboard() {
  return {
    keyboard: [[{ text: "📌 Podaj PIN" }]],
    resize_keyboard: true
  };
}

function handleStartCommand(msg, auth) {
  const chatId = msg.chat.id;
  const fullName = [msg.from.first_name || "", msg.from.last_name || ""].join(" ").trim();
  
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
    "🔐 Twoje konto oczekuje na PIN od Pracodawcy.\nKliknij przycisk „📌 Podaj PIN” i dokończ rejestrację.",
    getPinKeyboard()
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
