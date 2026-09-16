/**
 * Generowanie zbiorczego grafiku pracy całej firmy jako kolorowy PDF do
 * druku - widok kalendarzowy (siatka Pon-Nd, jedna komórka = jeden dzień,
 * numer dnia w rogu + lista pracowników z godzinami pod spodem), plus
 * podsumowanie sumy godzin na pracownika w okresie.
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
// Kolumny kalendarza zaczynają się od poniedziałku (polska konwencja).
const GRAFIK_PDF_WEEK_HEADERS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const GRAFIK_PDF_MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const GRAFIK_PDF_MONTHS_PL_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

/** "1 – 30" w tym samym miesiącu, albo "28 września – 5 października" na granicy miesięcy. */
function _formatGrafikSubtitle(startDate, endDate) {
  const sameMonth = startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear();
  if (sameMonth) {
    return GRAFIK_PDF_MONTHS_PL_NOM[startDate.getMonth()] + ' ' + startDate.getFullYear() +
      ' (' + startDate.getDate() + ' – ' + endDate.getDate() + ')';
  }
  return startDate.getDate() + ' ' + GRAFIK_PDF_MONTHS_PL[startDate.getMonth()] + ' – ' +
    endDate.getDate() + ' ' + GRAFIK_PDF_MONTHS_PL[endDate.getMonth()] + ' ' + endDate.getFullYear();
}

/** "Marcin Szewczyk" -> "M.Szewczyk" - żeby zmieściło się w komórce kalendarza. */
function _abbreviateEmployeeName(fullName) {
  const parts = (fullName || '').toString().trim().split(/\s+/);
  if (parts.length < 2) return fullName || '';
  return parts[0].charAt(0) + '.' + parts.slice(1).join(' ');
}

/** Suma minut ze wszystkich "Praca" pracownika w danym zakresie, jako "H:mm". */
function _formatMinutesAsHours(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h + ':' + String(m).padStart(2, '0');
}

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
 * Buduje tymczasowy, w pełni sformatowany arkusz zbiorczego grafiku - widok
 * KALENDARZOWY (7 kolumn Pon-Nd, jeden wiersz = jeden tydzień, jedna komórka
 * = jeden dzień z numerem dnia w rogu i listą pracowników pod spodem) - i
 * eksportuje go jako PDF natywnym eksportem Arkuszy Google. Arkusz jest
 * usuwany zaraz po eksporcie (w finally - zawsze, nawet przy błędzie).
 */
function _generateGrafikZbiorczyPdfBlob(startDate, endDate) {
  const ss = getSpreadsheet();
  const employees = _getAllEmployeesWithChat();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();
  const daysOffSet = getCompanyDaysOffSet(startDate, endDate);
  const theme = getThemeColors();
  const textOnMarka = getContrastingTextColor(theme.marka);
  const textOnUwaga = getContrastingTextColor(theme.uwaga);

  // employeeId|data -> {type, start, stop}
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

  // Suma godzin w okresie na pracownika (do tabeli podsumowania).
  const totalMinutesByEmployee = {};
  employees.forEach(function (e) { totalMinutesByEmployee[e.employeeId] = 0; });
  days.forEach(function (d) {
    const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
    employees.forEach(function (e) {
      const entry = grafikMap[e.employeeId + '|' + dateStr];
      if (entry && entry.type === 'Praca') {
        const startMin = _timeToMinutes(entry.start);
        const stopMin = _timeToMinutes(entry.stop);
        if (startMin !== null && stopMin !== null) {
          totalMinutesByEmployee[e.employeeId] += Math.max(0, stopMin - startMin);
        }
      }
    });
  });

  // Poniedziałek = 0 ... niedziela = 6 (kalendarz zaczyna się od poniedziałku).
  const dowMonFirst = function (jsDay) { return (jsDay + 6) % 7; };
  const leadingBlanks = dowMonFirst(startDate.getDay());
  const totalCells = leadingBlanks + days.length;
  const numWeeks = Math.ceil(totalCells / 7);

  const nazwaFirmy = (getSettingValue('NAZWA_FIRMY') || 'Firma').toString();
  const subtitle = _formatGrafikSubtitle(startDate, endDate);

  const tempSheet = ss.insertSheet('__grafik_pdf_tmp__' + new Date().getTime());

  try {
    // Wiersz 1: baner (scalony na całą szerokość) - nazwa firmy + podtytuł po polsku.
    tempSheet.getRange(1, 1, 1, 7).merge()
      .setValue(nazwaFirmy.toUpperCase() + ' — GRAFIK PRACY: ' + subtitle)
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontSize(15)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(1, 36);

    // Wiersz 2: nagłówki dni tygodnia Pon..Nd.
    tempSheet.getRange(2, 1, 1, 7).setValues([GRAFIK_PDF_WEEK_HEADERS])
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(2, 20);
    // Sobota/niedziela odróżnione ciemniejszym tłem nagłówka.
    tempSheet.getRange(2, 6, 1, 2).setBackground('#4A5568');

    // Siatka kalendarza: numWeeks wierszy x 7 kolumn, zaczynając od wiersza 3.
    const gridStartRow = 3;
    let dayCursor = 0; // indeks w tablicy `days`

    for (let week = 0; week < numWeeks; week++) {
      const row = gridStartRow + week;
      let maxLinesInRow = 1;
      const rowValues = [];
      const richValues = [];

      for (let col = 0; col < 7; col++) {
        const cellIndex = week * 7 + col;
        const isWithinPeriod = cellIndex >= leadingBlanks && dayCursor < days.length;

        if (!isWithinPeriod) {
          rowValues.push('');
          richValues.push(null);
          continue;
        }

        const d = days[dayCursor];
        dayCursor++;
        const dateStr = Utilities.formatDate(d, 'CET', 'yyyy-MM-dd');
        const isHoliday = !!daysOffSet[dateStr];
        const isWeekend = col >= 5;

        const dayLabel = String(d.getDate());
        const lines = [dayLabel];

        if (isHoliday) {
          lines.push('ŚWIĘTO');
        } else {
          employees.forEach(function (e) {
            const entry = grafikMap[e.employeeId + '|' + dateStr];
            if (entry && entry.type === 'Praca') {
              lines.push(_abbreviateEmployeeName(e.fullName) + '  ' + entry.start.slice(0, 5) + '-' + entry.stop.slice(0, 5));
            }
          });
        }

        maxLinesInRow = Math.max(maxLinesInRow, lines.length);
        const text = lines.join('\n');
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(text)
          .setTextStyle(0, dayLabel.length, SpreadsheetApp.newTextStyle().setBold(true).setFontSize(11).build())
          .build();

        rowValues.push({ text: text, isHoliday: isHoliday, isWeekend: isWeekend });
        richValues.push(rich);
      }

      // Zapis komórek tego tygodnia.
      for (let col = 0; col < 7; col++) {
        const cell = tempSheet.getRange(row, col + 1);
        const meta = rowValues[col];
        const rich = richValues[col];

        cell.setHorizontalAlignment('left').setVerticalAlignment('top').setWrap(true).setFontSize(9);

        if (!meta) {
          cell.setBackground('#FAFAFA');
          continue;
        }

        cell.setRichTextValue(rich);

        if (meta.isHoliday) {
          cell.setBackground(theme.uwaga).setFontColor(textOnUwaga);
        } else if (meta.isWeekend) {
          cell.setBackground(theme.tlo);
        }
      }

      tempSheet.setRowHeight(row, 24 + maxLinesInRow * 13);
    }

    const gridEndRow = gridStartRow + numWeeks - 1;

    // Obramowania na siatce kalendarza (baner i nagłówki dni zostają bez ramki).
    tempSheet.getRange(gridStartRow, 1, numWeeks, 7)
      .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    // Podsumowanie: lista pracowników i suma godzin w okresie.
    let summaryRow = gridEndRow + 2;
    tempSheet.getRange(summaryRow, 1, 1, 3).merge()
      .setValue('PODSUMOWANIE GODZIN W OKRESIE')
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontWeight('bold')
      .setFontSize(11)
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(summaryRow, 22);
    summaryRow++;

    tempSheet.getRange(summaryRow, 1).setValue('Pracownik').setFontWeight('bold').setBackground('#D9D9D9');
    tempSheet.getRange(summaryRow, 2).setValue('Godziny').setFontWeight('bold').setBackground('#D9D9D9').setHorizontalAlignment('center');
    const summaryHeaderRow = summaryRow;
    summaryRow++;

    employees.forEach(function (e) {
      tempSheet.getRange(summaryRow, 1).setValue(e.fullName);
      tempSheet.getRange(summaryRow, 2).setValue(_formatMinutesAsHours(totalMinutesByEmployee[e.employeeId])).setHorizontalAlignment('center');
      summaryRow++;
    });

    tempSheet.getRange(summaryHeaderRow, 1, summaryRow - summaryHeaderRow, 2)
      .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

    // Szerokości kolumn - 7 równych kolumn kalendarza.
    for (let c = 1; c <= 7; c++) {
      tempSheet.setColumnWidth(c, 150);
    }
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
