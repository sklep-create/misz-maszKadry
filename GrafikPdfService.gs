/**
 * Generowanie zbiorczego grafiku pracy całej firmy jako kolorowy PDF do
 * druku (tabela: wiersze = pracownicy, kolumny = dni okresu).
 *
 * WAŻNE: Utilities.newBlob(html, ...).getAs('application/pdf') (pierwotne
 * podejście) NIE honoruje kolorów tła komórek/divów - ani przez <style>,
 * ani inline - stąd PDF wychodził bez żadnych kolorów mimo poprawnego HTML
 * (potwierdzone przez użytkownika, PDF wyglądał jak goła tabela). Dlatego
 * generator buduje TYMCZASOWY arkusz Google z prawdziwym formatowaniem
 * komórek (setBackground/setFontColor/setBorder) i eksportuje go natywnym
 * mechanizmem eksportu Arkuszy (ten sam silnik co "Plik → Pobierz → PDF"),
 * który kolory i obramowania renderuje poprawnie. Tymczasowy arkusz jest
 * usuwany zaraz po eksporcie.
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

/**
 * Buduje tymczasowy, w pełni sformatowany arkusz zbiorczego grafiku dla
 * podanego zakresu dat i eksportuje go jako PDF natywnym eksportem Arkuszy
 * Google. Arkusz jest usuwany zaraz po eksporcie (w finally - zawsze, nawet
 * przy błędzie).
 */
function _generateGrafikZbiorczyPdfBlob(startDate, endDate) {
  const ss = getSpreadsheet();
  const employees = _getAllEmployeesWithChat();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();
  const daysOffSet = getCompanyDaysOffSet(startDate, endDate);
  const theme = getThemeColors();
  const textOnMarka = getContrastingTextColor(theme.marka);
  const textOnPraca = getContrastingTextColor(theme.praca);
  const textOnUwaga = getContrastingTextColor(theme.uwaga);

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

  const nazwaFirmy = (getSettingValue('NAZWA_FIRMY') || 'Firma').toString();
  const startStr = Utilities.formatDate(startDate, 'CET', 'd MMMM yyyy');
  const endStr = Utilities.formatDate(endDate, 'CET', 'd MMMM yyyy');
  const numCols = days.length + 1; // +1 na kolumnę z nazwiskiem

  const tempSheet = ss.insertSheet('__grafik_pdf_tmp__' + new Date().getTime());

  try {
    // Wiersz 1: baner (scalony na całą szerokość)
    tempSheet.getRange(1, 1, 1, numCols).merge()
      .setValue(nazwaFirmy + ' — GRAFIK PRACY   (' + startStr + ' – ' + endStr + ')')
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontSize(14)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(1, 32);

    // Wiersz 2: nagłówki dni
    const headerRow = ['Pracownik'].concat(days.map(function (d) {
      return d.getDate() + ' ' + GRAFIK_PDF_DAY_NAMES_SHORT[d.getDay()];
    }));
    tempSheet.getRange(2, 1, 1, numCols).setValues([headerRow])
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontWeight('bold')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    days.forEach(function (d, i) {
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
      const isHoliday = !!daysOffSet[dateStr];
      if (isHoliday) {
        tempSheet.getRange(2, i + 2).setBackground(theme.uwaga).setFontColor(textOnUwaga);
      } else if (isWeekend) {
        tempSheet.getRange(2, i + 2).setBackground('#4A5568').setFontColor('#FFFFFF');
      }
    });

    // Wiersze danych - jeden na pracownika
    employees.forEach(function (emp, empIndex) {
      const r = 3 + empIndex;
      tempSheet.getRange(r, 1).setValue(emp.fullName)
        .setBackground('#D9D9D9')
        .setFontWeight('bold')
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle');

      days.forEach(function (d, i) {
        const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
        const entry = grafikMap[emp.employeeId + '|' + dateStr];
        const isHoliday = !!daysOffSet[dateStr];
        const cell = tempSheet.getRange(r, i + 2);
        cell.setHorizontalAlignment('center').setVerticalAlignment('middle').setFontSize(9).setFontWeight('bold');

        if (entry && entry.type === 'Praca') {
          cell.setValue(entry.start.slice(0, 5) + '-' + entry.stop.slice(0, 5))
            .setBackground(theme.praca).setFontColor(textOnPraca);
        } else if (isHoliday) {
          cell.setValue('ŚWIĘTO').setBackground(theme.uwaga).setFontColor(textOnUwaga);
        } else {
          cell.setValue('WOLNE').setBackground(theme.tlo).setFontColor('#555555');
        }
      });
    });

    // Wiersz legendy
    const legendRow = 3 + employees.length + 1;
    tempSheet.getRange(legendRow, 1).setValue('Legenda:').setFontWeight('bold');
    tempSheet.getRange(legendRow, 2).setValue('PRACA').setBackground(theme.praca).setFontColor(textOnPraca).setFontWeight('bold').setHorizontalAlignment('center');
    tempSheet.getRange(legendRow, 3).setValue('WOLNE').setBackground(theme.tlo).setFontColor('#555555').setFontWeight('bold').setHorizontalAlignment('center');
    tempSheet.getRange(legendRow, 4).setValue('ŚWIĘTO').setBackground(theme.uwaga).setFontColor(textOnUwaga).setFontWeight('bold').setHorizontalAlignment('center');

    // Obramowania na siatce danych (baner i legenda zostają bez ramki)
    tempSheet.getRange(2, 1, 1 + employees.length, numCols)
      .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    tempSheet.setColumnWidth(1, 140);
    for (let c = 2; c <= numCols; c++) {
      tempSheet.setColumnWidth(c, 55);
    }
    tempSheet.setFrozenRows(2);
    tempSheet.setFrozenColumns(1);
    tempSheet.setHiddenGridlines(true);

    SpreadsheetApp.flush();

    // Eksport natywnym mechanizmem Arkuszy Google - w przeciwieństwie do
    // Utilities.newBlob(html).getAs('application/pdf') POPRAWNIE renderuje
    // tła komórek i obramowania (to ten sam silnik co "Plik → Pobierz → PDF").
    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export' +
      '?format=pdf&gid=' + tempSheet.getSheetId() +
      '&portrait=false&size=A4&fitw=true&scale=2' +
      '&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&fzr=true' +
      '&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3';

    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    });

    return response.getBlob();
  } finally {
    ss.deleteSheet(tempSheet);
  }
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

  const blob = _generateGrafikZbiorczyPdfBlob(range.start, range.end);

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
