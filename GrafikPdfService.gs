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
        return '<td class="praca">' + entry.start.slice(0, 5) + '<br>' + entry.stop.slice(0, 5) + '</td>';
      }
      if (isHoliday) {
        return '<td class="swieto">ŚWIĘTO</td>';
      }
      return '<td class="wolne">WOLNE</td>';
    }).join('');
    const rowCls = empIndex % 2 === 0 ? 'row-even' : 'row-odd';
    return '<tr class="' + rowCls + '"><td class="emp-name">' + escapeHtml(emp.fullName) + '</td>' + cells + '</tr>';
  }).join('');

  const nazwaFirmy = (getSettingValue('NAZWA_FIRMY') || 'Firma').toString();
  const startStr = Utilities.formatDate(startDate, 'CET', 'd MMMM yyyy');
  const endStr = Utilities.formatDate(endDate, 'CET', 'd MMMM yyyy');

  // Uwaga: konwerter Apps Script (Utilities.newBlob(html).getAs('application/pdf'))
  // NIE renderuje dobrze gradientów/border-radius/subtelnych pasteli - stąd
  // celowo tylko płaskie, mocno nasycone kolory i grube czcionki.
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page { size: A4 landscape; margin: 8mm; }' +
    'body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }' +
    '.banner { background: #1A365D; color: #fff; padding: 10px 16px; margin-bottom: 10px; }' +
    '.banner h1 { font-size: 22px; margin: 0; font-weight: bold; }' +
    '.banner .subtitle { color: #fff; font-size: 13px; font-weight: bold; }' +
    'table { border-collapse: collapse; width: 100%; }' +
    'th, td { border: 2px solid #000; padding: 5px 2px; text-align: center; }' +
    'th { background: #000; color: #fff; font-size: 10px; font-weight: bold; }' +
    'th .dow { display: block; font-size: 9px; }' +
    'th.weekend-header { background: #4A5568; }' +
    'th.holiday-header { background: #C0392B; }' +
    'td.emp-name { text-align: left; font-weight: bold; background: #D9D9D9; white-space: nowrap; padding-left: 8px; font-size: 12px; }' +
    'tr.row-odd td.wolne { background: #E8E8E8; }' +
    'td.praca { background: #27AE60; color: #fff; font-weight: bold; font-size: 11px; }' +
    'td.wolne { background: #F2F2F2; color: #555; font-weight: bold; font-size: 9px; }' +
    'td.swieto { background: #C0392B; color: #fff; font-weight: bold; font-size: 9px; }' +
    '.legend { margin-top: 12px; font-size: 11px; font-weight: bold; }' +
    '.legend span.item { display: inline-block; margin-right: 20px; }' +
    '.swatch { display: inline-block; width: 14px; height: 14px; margin-right: 5px; vertical-align: middle; border: 1px solid #000; }' +
    '.footer { margin-top: 10px; font-size: 8px; color: #666; }' +
    '</style></head><body>' +
    '<div class="banner">' +
    '<h1>' + escapeHtml(nazwaFirmy) + ' — GRAFIK PRACY</h1>' +
    '<div class="subtitle">' + startStr + ' – ' + endStr + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Pracownik</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="legend">' +
    '<span class="item"><span class="swatch" style="background:#27AE60;"></span>PRACA (godziny)</span>' +
    '<span class="item"><span class="swatch" style="background:#F2F2F2;"></span>WOLNE</span>' +
    '<span class="item"><span class="swatch" style="background:#C0392B;"></span>ŚWIĘTO / dzień zamknięcia firmy</span>' +
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
