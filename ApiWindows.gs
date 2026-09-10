/**
 * Obsługa zapytań HTTP GET z Dashboardu React (Windows)
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action;
  const page = params.page;
  let responseData = {};

  if (page === "miniapp") {
    return HtmlService.createHtmlOutputFromFile("MiniApp")
      .setTitle("Panel Pracownika")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  if (action === "getDashboardData") {
    responseData = {
      employees: getSheetDataAsJson(CONFIG.SHEETS.EMPLOYEES),
      todayLogs: getSheetDataAsJson(CONFIG.SHEETS.TIMELOG),
      pendingRequests: getSheetDataAsJson(CONFIG.SHEETS.LEAVES)
    };
  } else if (action === "registerEvent") {
    responseData = registerEventFromMiniApp(params);
  } else if (action === "getMiniAppDashboard") {
    responseData = getMiniAppDashboard(params);
  } else if (action === "submitCorrection") {
    responseData = submitCorrectionFromMiniApp(params);
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetDataAsJson(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
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
