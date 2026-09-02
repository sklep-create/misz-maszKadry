/**
 * Obsługa zapytań HTTP GET z Dashboardu React (Windows)
 */
function doGet(e) {
  const action = e.parameter.action;
  let responseData = {};

  if (action === "getDashboardData") {
    responseData = {
      employees: getSheetDataAsJson(CONFIG.SHEETS.EMPLOYEES),
      todayLogs: getSheetDataAsJson(CONFIG.SHEETS.TIMELOG),
      pendingRequests: getSheetDataAsJson(CONFIG.SHEETS.LEAVES)
    };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetDataAsJson(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = [];

  for (let i = 1; i < data.length; i++) {
    let row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    result.push(row);
  }
  return result;
}
