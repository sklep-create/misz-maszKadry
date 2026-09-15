/**
 * Generowanie zbiorczego grafiku pracy całej firmy jako kolorowy PDF do
 * druku (tabela: wiersze = pracownicy, kolumny = dni okresu). Konwersja
 * HTML → PDF przez Utilities.newBlob(...).getAs('application/pdf').
 */

const GRAFIK_PDF_FOLDER_NAME = 'Kadry - Grafiki PDF';
const GRAFIK_PDF_DAY_NAMES_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

/** Folder na wygenerowane PDF-y, tworzony przy pierwszym użyciu. */
function _getOrCreateGrafikPdfFolder() {
  const folders = DriveApp.getFoldersByName(GRAFIK_PDF_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(GRAFIK_PDF_FOLDER_NAME);
}

/**
 * Wyznacza zakres dat ostatnio wygenerowanego okresu Grafiku, patrząc
 * bezpośrednio na dane w arkuszu (nie tylko na Ustawienia!OSTATNI_DZIEN_GRAFIKU) -
 * bierze najpóźniejszą datę obecną w Grafiku i cofa się dzień po dniu, dopóki
 * kolejne dni też tam są (okresy są ciągłe, więc to wyznacza dokładnie
 * granice ostatniego wygenerowanego bloku, niezależnie od jego długości).
 */
function _getLatestGrafikPeriodRange() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();
  const datesSet = {};

  for (let i = 1; i < data.length; i++) {
    const d = formatSheetDate(data[i][2]);
    if (d) datesSet[d] = true;
  }

  const allDates = Object.keys(datesSet).sort();
  if (allDates.length === 0) return null;

  const maxDateStr = allDates[allDates.length - 1];
  const maxParts = maxDateStr.split('-').map(Number);
  const maxDate = new Date(maxParts[0], maxParts[1] - 1, maxParts[2]);
  let minDate = new Date(maxDate);

  while (true) {
    const prev = new Date(minDate);
    prev.setDate(prev.getDate() - 1);
    const prevStr = Utilities.formatDate(prev, 'CET', 'yyyy-MM-dd');
    if (!datesSet[prevStr]) break;
    minDate = prev;
  }

  return { start: minDate, end: maxDate };
}

/** Buduje kolorowy HTML zbiorczego grafiku dla podanego zakresu dat. */
function _buildGrafikZbiorczyHtml(startDate, endDate) {
  const employees = _getAllEmployeesWithChat();
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();
  const daysOffSet = getCompanyDaysOffSet(startDate, endDate);

  const grafikMap = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateStr = formatSheetDate(row[2]);
    if (!dateStr) continue;
    grafikMap[row[1] + '|' + dateStr] = {
      type: row[5],
      start: formatSheetTime(row[3]),
      stop: formatSheetTime(row[4])
    };
  }

  const days = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const headerCells = days.map(function (d) {
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
    const isHoliday = !!daysOffSet[dateStr];
    const cls = isHoliday ? 'holiday-header' : (isWeekend ? 'weekend-header' : '');
    return '<th class="' + cls + '">' + d.getDate() + '<br><span class="dow">' + GRAFIK_PDF_DAY_NAMES_SHORT[dow] + '</span></th>';
  }).join('');

  const rows = employees.map(function (emp, empIndex) {
    const cells = days.map(function (d) {
      const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
      const entry = grafikMap[emp.employeeId + '|' + dateStr];
      const isHoliday = !!daysOffSet[dateStr];

      if (entry && entry.type === 'Praca') {
        return '<td class="praca"><span class="pill">' + entry.start.slice(0, 5) + '–' + entry.stop.slice(0, 5) + '</span></td>';
      }
      if (isHoliday) {
        return '<td class="swieto">✦</td>';
      }
      return '<td class="wolne">·</td>';
    }).join('');
    const rowCls = empIndex % 2 === 0 ? 'row-even' : 'row-odd';
    return '<tr class="' + rowCls + '"><td class="emp-name">' + escapeHtml(emp.fullName) + '</td>' + cells + '</tr>';
  }).join('');

  const nazwaFirmy = (getSettingValue('NAZWA_FIRMY') || 'Firma').toString();
  const startStr = Utilities.formatDate(startDate, 'CET', 'd MMMM yyyy');
  const endStr = Utilities.formatDate(endDate, 'CET', 'd MMMM yyyy');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page { size: A4 landscape; margin: 8mm; }' +
    '* { box-sizing: border-box; }' +
    'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9px; color: #1A202C; margin: 0; }' +
    '.banner { background: linear-gradient(135deg, #1A365D 0%, #2C5282 100%); color: #fff; ' +
      'padding: 14px 18px; border-radius: 10px; margin-bottom: 12px; }' +
    '.banner h1 { font-size: 20px; margin: 0 0 3px; letter-spacing: 0.3px; }' +
    '.banner .subtitle { color: #BEE3F8; font-size: 12px; }' +
    'table { border-collapse: separate; border-spacing: 0; width: 100%; border-radius: 8px; overflow: hidden; }' +
    'th, td { border: 1px solid #E2E8F0; padding: 4px 2px; text-align: center; }' +
    'th { background: #2D3748; color: #fff; font-size: 8px; font-weight: 600; padding: 6px 2px; }' +
    'th:first-child { border-top-left-radius: 8px; }' +
    'th:last-child { border-top-right-radius: 8px; }' +
    'th .dow { display: block; font-size: 7px; opacity: 0.75; font-weight: normal; margin-top: 1px; }' +
    'th.weekend-header { background: #4A5568; }' +
    'th.holiday-header { background: #C53030; }' +
    'td.emp-name { text-align: left; font-weight: 600; background: #EDF2F7; white-space: nowrap; padding-left: 8px; color: #2D3748; }' +
    'tr.row-odd td:not(.emp-name):not(.praca):not(.swieto) { background: #FAFBFC; }' +
    'td.praca { background: #E6FFFA; }' +
    'td.praca .pill { display: inline-block; background: #38B2AC; color: #fff; font-weight: 700; ' +
      'border-radius: 10px; padding: 2px 6px; font-size: 7.5px; white-space: nowrap; }' +
    'td.wolne { background: #F7FAFC; color: #CBD5E0; font-size: 11px; }' +
    'td.swieto { background: #FFF5F5; color: #E53E3E; font-size: 11px; font-weight: 700; }' +
    '.legend { margin-top: 14px; font-size: 9px; background: #F7FAFC; border-radius: 8px; padding: 8px 12px; display: inline-block; }' +
    '.legend span.item { display: inline-block; margin-right: 18px; }' +
    '.swatch { display: inline-block; width: 11px; height: 11px; margin-right: 5px; vertical-align: middle; border-radius: 3px; }' +
    '.footer { margin-top: 10px; font-size: 8px; color: #A0AEC0; }' +
    '</style></head><body>' +
    '<div class="banner">' +
    '<h1>' + escapeHtml(nazwaFirmy) + ' · Grafik pracy</h1>' +
    '<div class="subtitle">' + startStr + ' – ' + endStr + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Pracownik</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="legend">' +
    '<span class="item"><span class="swatch" style="background:#38B2AC;"></span>Praca (godziny)</span>' +
    '<span class="item"><span class="swatch" style="background:#F7FAFC;border:1px solid #CBD5E0;"></span>Wolne</span>' +
    '<span class="item"><span class="swatch" style="background:#E53E3E;"></span>Święto / dzień zamknięcia firmy</span>' +
    '</div>' +
    '<div class="footer">Wygenerowano: ' + Utilities.formatDate(new Date(), 'CET', 'yyyy-MM-dd HH:mm') + '</div>' +
    '</body></html>';
}

/** Ucieczka znaków specjalnych HTML (nazwiska mogą zawierać & < > "). */
function escapeHtml(value) {
  return (value == null ? '' : value.toString())
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generuje kolorowy PDF zbiorczego grafiku firmy dla ostatnio wygenerowanego
 * okresu i zapisuje go w folderze "Kadry - Grafiki PDF" na Dysku.
 */
function generujGrafikZbiorczyPdf() {
  const range = _getLatestGrafikPeriodRange();
  if (!range) {
    const msg = '❌ Brak wygenerowanego grafiku - najpierw wygeneruj grafik (⚙️ System Kadrowy → 🗓️ Grafik).';
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* brak UI */ }
    return msg;
  }

  const html = _buildGrafikZbiorczyHtml(range.start, range.end);
  const blob = Utilities.newBlob(html, 'text/html', 'grafik.html').getAs('application/pdf');

  const startStr = Utilities.formatDate(range.start, 'CET', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(range.end, 'CET', 'yyyy-MM-dd');
  const fileName = 'Grafik zbiorczy ' + startStr + ' - ' + endStr + '.pdf';
  blob.setName(fileName);

  const folder = _getOrCreateGrafikPdfFolder();
  const file = folder.createFile(blob);

  Logger.log('✅ Wygenerowano PDF: "' + fileName + '" - ' + file.getUrl());
  _pokazWynikGenerowaniaPdf(fileName, file.getUrl());
  return '✅ Wygenerowano PDF: "' + fileName + '"';
}

/** Ładne okienko z wynikiem - klikalne przyciski zamiast zwykłego alertu tekstowego. */
function _pokazWynikGenerowaniaPdf(fileName, pdfUrl) {
  let grafikUrl = '';
  try {
    const ss = getSpreadsheet();
    const grafikSheet = ss.getSheetByName(CONFIG.SHEETS.SCHEDULE);
    grafikUrl = ss.getUrl() + '#gid=' + grafikSheet.getSheetId();
  } catch (e) {
    // brak arkusza Grafik - link po prostu nie zostanie pokazany
  }

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 6px 10px; text-align: center; }
      .icon { font-size: 32px; margin-bottom: 6px; }
      .filename { color: #4A5568; font-size: 12px; margin-bottom: 18px; word-break: break-word; }
      a.btn { display: block; text-decoration: none; padding: 12px; border-radius: 8px; font-weight: bold; margin-bottom: 10px; }
      a.btn-pdf { background: #38B2AC; color: #fff; }
      a.btn-grafik { background: #EDF2F7; color: #2D3748; }
    </style>
    <div class="icon">✅</div>
    <div class="filename">${fileName}</div>
    <a class="btn btn-pdf" href="${pdfUrl}" target="_blank">📄 Otwórz PDF</a>
    ${grafikUrl ? '<a class="btn btn-grafik" href="' + grafikUrl + '" target="_blank">📅 Przejdź do arkusza Grafik</a>' : ''}
  `).setWidth(320).setHeight(220);

  try {
    SpreadsheetApp.getUi().showModalDialog(html, '🖨️ Grafik zbiorczy gotowy');
  } catch (e) {
    // Brak kontekstu UI (np. wywołanie z triggera) - link jest w Logger.log powyżej.
  }
}
