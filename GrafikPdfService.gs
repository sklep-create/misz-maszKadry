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

  const rows = employees.map(function (emp) {
    const cells = days.map(function (d) {
      const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
      const entry = grafikMap[emp.employeeId + '|' + dateStr];
      const isHoliday = !!daysOffSet[dateStr];

      if (entry && entry.type === 'Praca') {
        return '<td class="praca">' + entry.start.slice(0, 5) + '<br>' + entry.stop.slice(0, 5) + '</td>';
      }
      if (isHoliday) {
        return '<td class="swieto">—</td>';
      }
      return '<td class="wolne">—</td>';
    }).join('');
    return '<tr><td class="emp-name">' + escapeHtml(emp.fullName) + '</td>' + cells + '</tr>';
  }).join('');

  const nazwaFirmy = (getSettingValue('NAZWA_FIRMY') || 'Firma').toString();
  const startStr = Utilities.formatDate(startDate, 'CET', 'd MMMM yyyy');
  const endStr = Utilities.formatDate(endDate, 'CET', 'd MMMM yyyy');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page { size: A4 landscape; margin: 10mm; }' +
    'body { font-family: Arial, sans-serif; font-size: 9px; color: #1A202C; }' +
    'h1 { font-size: 18px; color: #2D3748; margin: 0 0 2px; }' +
    '.subtitle { color: #718096; font-size: 12px; margin-bottom: 14px; }' +
    'table { border-collapse: collapse; width: 100%; }' +
    'th, td { border: 1px solid #CBD5E0; padding: 3px 2px; text-align: center; }' +
    'th { background: #2D3748; color: #fff; font-size: 8px; font-weight: normal; }' +
    'th .dow { font-size: 7px; opacity: 0.85; }' +
    'th.weekend-header { background: #4A5568; }' +
    'th.holiday-header { background: #C53030; }' +
    'td.emp-name { text-align: left; font-weight: bold; background: #EDF2F7; white-space: nowrap; padding-left: 6px; }' +
    'td.praca { background: #C6F6D5; color: #22543D; font-weight: bold; }' +
    'td.wolne { background: #F7FAFC; color: #A0AEC0; }' +
    'td.swieto { background: #FED7D7; color: #822727; font-weight: bold; }' +
    '.legend { margin-top: 14px; font-size: 9px; }' +
    '.legend span.item { display: inline-block; margin-right: 16px; }' +
    '.swatch { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: middle; border: 1px solid #999; }' +
    '.footer { margin-top: 10px; font-size: 8px; color: #A0AEC0; }' +
    '</style></head><body>' +
    '<h1>' + escapeHtml(nazwaFirmy) + ' — Grafik pracy</h1>' +
    '<div class="subtitle">' + startStr + ' – ' + endStr + '</div>' +
    '<table><thead><tr><th>Pracownik</th>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="legend">' +
    '<span class="item"><span class="swatch" style="background:#C6F6D5;"></span>Praca</span>' +
    '<span class="item"><span class="swatch" style="background:#F7FAFC;"></span>Wolne</span>' +
    '<span class="item"><span class="swatch" style="background:#FED7D7;"></span>Święto / dzień zamknięcia firmy</span>' +
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

  const msg = '✅ Wygenerowano PDF: "' + fileName + '"\n🔗 ' + file.getUrl();
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI - wynik jest w Logger.log powyżej.
  }
  return msg;
}
