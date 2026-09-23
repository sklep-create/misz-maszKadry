/**
 * Weryfikuje czy użytkownik Telegrama przeszedł autoryzację PIN
 */
function isUserAuthorized(chatId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const col = getEmployeesColumnMap(sheet);

  for (let i = 1; i < data.length; i++) {
    if (data[i][col['Telegram_ChatID']].toString() === chatId.toString()) {
      const status = data[i][col['Status_Autoryzacji']];
      return {
        authorized: status === 'Autoryzowany' || status === true,
        employeeId: data[i][col['ID_Pracownika']],
        name: data[i][col['Imie_Nazwisko']] || '',
        status: status || '',
        attemptsLeft: Number(data[i][col['Licz_błędy']]) || 3
      };
    }
  }
  return { authorized: false };
}

/**
 * Zwraca dane pracownika (etat, stopień OzN) na podstawie ID_Pracownika.
 */
function getEmployeeById(employeeId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const col = getEmployeesColumnMap(sheet);

  for (let i = 1; i < data.length; i++) {
    if ((data[i][col['ID_Pracownika']] || '').toString() === employeeId.toString()) {
      return {
        employeeId: data[i][col['ID_Pracownika']],
        fullName: data[i][col['Imie_Nazwisko']] || '',
        wymiarEtatu: data[i][col['Wymiar_Etatu']],
        stopienOzn: data[i][col['Stopien_OZN']]
      };
    }
  }

  return null;
}

/**
 * Oznacza, że pracownik zadeklarował chęć podania PINu (kliknął
 * "Podaję PIN") - bot będzie oczekiwał PINu w kolejnej wiadomości,
 * nawet jeśli minie sporo czasu od rejestracji.
 */
function setAwaitingPinStatus(chatId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const col = getEmployeesColumnMap(sheet);

  for (let i = 1; i < data.length; i++) {
    if (data[i][col['Telegram_ChatID']].toString() !== chatId.toString()) continue;

    const status = (data[i][col['Status_Autoryzacji']] || '').toString();
    if (status === 'Zablokowany' || status === 'Autoryzowany') return;

    sheet.getRange(i + 1, col['Status_Autoryzacji'] + 1).setValue('PodajePIN');
    return;
  }
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
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const col = getEmployeesColumnMap(sheet);
  const pin = generateRegistrationPin();
  const employeeId = generateNextEmployeeId(sheet);
  const safeName = (fullName || '').toString().trim();

  const row = new Array(sheet.getLastColumn()).fill('');
  row[col['ID_Pracownika']] = employeeId;
  row[col['Telegram_ChatID']] = chatId;
  row[col['Imie_Nazwisko']] = safeName;
  row[col['Status_Autoryzacji']] = 'OczekujeNaPIN';
  row[col['Licz_błędy']] = 3;
  row[col['PIN']] = pin;

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
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  const data = sheet.getDataRange().getValues();
  const col = getEmployeesColumnMap(sheet);

  for (let i = 1; i < data.length; i++) {
    if (data[i][col['Telegram_ChatID']].toString() !== chatId.toString()) {
      continue;
    }

    const rowIndex = i + 1;
    const status = (data[i][col['Status_Autoryzacji']] || '').toString();
    const storedPin = (data[i][col['PIN']] || '').toString().trim();
    const attemptsLeft = Number(data[i][col['Licz_błędy']]) || 3;

    if (status === 'Zablokowany') {
      return { success: false, blocked: true, attemptsLeft: 0 };
    }

    if (status === 'Autoryzowany') {
      return { success: true, alreadyAuthorized: true };
    }

    if (storedPin && enteredPin.trim() === storedPin) {
      sheet.getRange(rowIndex, col['Status_Autoryzacji'] + 1).setValue('Autoryzowany');
      sheet.getRange(rowIndex, col['PIN'] + 1).setValue('');
      return { success: true, attemptsLeft: attemptsLeft };
    }

    const nextAttemptsLeft = Math.max(attemptsLeft - 1, 0);
    sheet.getRange(rowIndex, col['Licz_błędy'] + 1).setValue(nextAttemptsLeft);

    if (nextAttemptsLeft === 0) {
      sheet.getRange(rowIndex, col['Status_Autoryzacji'] + 1).setValue('Zablokowany');
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
 * Kolumna PRACODAWCY_TELEGRAM_IDS: jedno ID na wiersz, od wiersza 2 w dół.
 */
function getEmployerTelegramIds() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SETTINGS);
  const header = _findHeaderCell(sheet, 'PRACODAWCY_TELEGRAM_IDS');
  if (!header) return [];

  const lastRow = sheet.getLastRow();
  const rowCount = lastRow - header.row;
  if (rowCount < 1) return [];

  const values = sheet.getRange(header.row + 1, header.col, rowCount, 1).getValues().map(function (r) { return r[0]; });
  return parseEmployerTelegramIds(values);
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
