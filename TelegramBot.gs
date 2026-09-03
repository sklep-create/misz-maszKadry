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
  
  // Jeśli użytkownik nie jest zautoryzowany
  if (!auth.authorized) {
    if (text.startsWith("/pin ")) {
      const pin = text.split(" ")[1];
      if (authorizeUserWithPin(chatId, msg.from.username, pin)) {
        sendTelegramMessage(chatId, "✅ Autoryzacja pomyślna! Twoje konto zostało powiązane. Możesz teraz rejestrować czas pracy.", getMainKeyboard());
      } else {
        sendTelegramMessage(chatId, "❌ Niepoprawny PIN. Spróbuj ponownie wpisując: /pin [KOD_PIN]");
      }
    } else {
      sendTelegramMessage(chatId, "🔒 **Brak dostępu.** Aby korzystać z bota, musisz podać kod PIN firmy.\nWpisz komendę: `/pin KOD` (np. `/pin 1234`)");
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
