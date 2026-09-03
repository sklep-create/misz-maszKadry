/**
 * Weryfikuje czy użytkownik Telegrama przeszedł autoryzację PIN
 */
function isUserAuthorized(chatId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString() === chatId.toString()) {
      return {
        authorized: data[i][6] === 'Autoryzowany' || data[i][6] === true,
        employeeId: data[i][0],
        name: data[i][2] || '',
        status: data[i][6] || '',
        attemptsLeft: Number(data[i][8]) || 3
      };
    }
  }
  return { authorized: false };
}

/**
 * Normalizuje listę Telegram ID pracodawców do unikalnych wartości numerycznych
 */
function parseEmployerTelegramIds(rawValues) {
  const values = Array.isArray(rawValues) ? rawValues : [rawValues];
  const ids = [];
  
  values.forEach(item => {
    const raw = (item || '').toString().trim();
    if (!raw) {
      return;
    }
    
    raw.split(',').forEach(part => {
      const value = part.trim();
      if (/^-?\d+$/.test(value)) {
        ids.push(value);
      }
    });
  });
  
  return Array.from(new Set(ids));
}

function isEmployerTelegramChat(chatId) {
  return getEmployerTelegramIds().indexOf(chatId.toString()) !== -1;
}

/**
 * Rejestruje nowego pracownika po /start
 */
function registerNewEmployee(chatId, fullName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const pin = generateRegistrationPin();
  const employeeId = generateNextEmployeeId(sheet);
  const safeName = (fullName || '').toString().trim();
  
  const row = [
    employeeId,
    chatId,
    safeName,
    '',
    '',
    '',
    'OczekujeNaPIN',
    '',
    3,
    pin,
    ''
  ];
  
  sheet.appendRow(row);
  
  return {
    employeeId: employeeId,
    fullName: safeName,
    pin: pin
  };
}

/**
 * Próba weryfikacji użytkownika jednorazowym PIN-em rejestracyjnym
 */
function authorizeUserWithPin(chatId, enteredPin) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toString() !== chatId.toString()) {
      continue;
    }
    
    const rowIndex = i + 1;
    const status = (data[i][6] || '').toString();
    const storedPin = (data[i][9] || '').toString().trim();
    const attemptsLeft = Number(data[i][8]) || 3;
    
    if (status === 'Zablokowany') {
      return { success: false, blocked: true, attemptsLeft: 0 };
    }
    
    if (status === 'Autoryzowany') {
      return { success: true, alreadyAuthorized: true };
    }
    
    if (storedPin && enteredPin.trim() === storedPin) {
      sheet.getRange(rowIndex, 7).setValue('Autoryzowany'); // Status_Autoryzacji
      sheet.getRange(rowIndex, 10).setValue('');            // PIN (jednorazowy)
      return { success: true, attemptsLeft: attemptsLeft };
    }
    
    const nextAttemptsLeft = Math.max(attemptsLeft - 1, 0);
    sheet.getRange(rowIndex, 9).setValue(nextAttemptsLeft); // Licz_błędy
    
    if (nextAttemptsLeft === 0) {
      sheet.getRange(rowIndex, 7).setValue('Zablokowany');
      return { success: false, blocked: true, attemptsLeft: 0 };
    }
    
    return { success: false, blocked: false, attemptsLeft: nextAttemptsLeft };
  }
  
  return { success: false, notFound: true };
}

/**
 * Generowanie PIN-u rejestracyjnego (6 cyfr)
 */
function generateRegistrationPin() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

/**
 * Lista ID Telegram pracodawców z arkusza "Ustawienia"
 * Wiersz: PRACODAWCY_TELEGRAM_IDS, kolumny B..N
 */
function getEmployerTelegramIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() !== 'PRACODAWCY_TELEGRAM_IDS') {
      continue;
    }
    
    return parseEmployerTelegramIds(data[i].slice(1));
  }
  
  return [];
}

function generateNextEmployeeId(sheet) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  
  for (let i = 1; i < data.length; i++) {
    const id = (data[i][0] || '').toString().trim();
    const match = id.match(/^EMP-(\d+)$/);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  
  return 'EMP-' + String(max + 1).padStart(3, '0');
}
