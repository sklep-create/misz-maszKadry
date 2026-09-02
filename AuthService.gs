/**
 * Weryfikuje czy użytkownik Telegrama przeszedł autoryzację PIN
 */
function isUserAuthorized(chatId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString() === chatId.toString() && data[i][6] === true) { // Kolumna B: ChatID, Kolumna G: Aktywny/Zautoryzowany
      return { authorized: true, employeeId: data[i][0], name: data[i][2] };
    }
  }
  return { authorized: false };
}

/**
 * Próba weryfikacji i aktywacji użytkownika kodem PIN
 */
function authorizeUserWithPin(chatId, username, enteredPin) {
  const systemPin = getSystemPin();
  
  if (enteredPin.trim() !== systemPin) {
    return false;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    // Dopasowanie po nazwie użytkownika Telegram lub dopisanie ChatID dowolnego pierwszego nieprzypisanego
    if (data[i][1].toString() === chatId.toString() || (data[i][1] === "" && !found)) {
      sheet.getRange(i + 1, 2).setValue(chatId); // Wpisz ChatID
      sheet.getRange(i + 1, 7).setValue(true);   // Flaga Autoryzacji
      found = true;
      break;
    }
  }
  return found;
}
