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
 * Logo firmy (getCompanyLogoUrl(), Config.gs) jako Blob do wstawienia w PDF
 * (sheet.insertImage() wymaga Blob albo URL-a wprost - logo bywa data URI z
 * automatycznego zdjęcia bota Telegram, więc trzeba je najpierw zdekodować).
 * Zwraca null, jeśli logo nie jest ustawione albo nie da się go pobrać -
 * PDF generuje się dalej normalnie, tylko bez logo (nigdy nie przerywa eksportu).
 */
function _getCompanyLogoBlob() {
  const logoUrl = (getCompanyLogoUrl() || '').toString().trim();
  if (!logoUrl) return null;

  try {
    if (logoUrl.indexOf('data:') === 0) {
      const match = logoUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!match) return null;
      return Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], 'logo');
    }
    const response = UrlFetchApp.fetch(logoUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return null;
    return response.getBlob();
  } catch (err) {
    Logger.log('⚠️ Nie udało się pobrać logo do PDF grafiku: ' + err.toString());
    return null;
  }
}

/** Wariant koloru bazowego - ten sam odcień, lżejsza/ciemniejsza jasność (do dwutonowego nagłówka "kartki z kalendarza"). */
function _shadeColor(hex, lightnessDelta) {
  const hsl = _hexToHsl(hex);
  return _hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(100, hsl.l + lightnessDelta)));
}

/**
 * Lista wybieralnych okresów do PDF-a, wyliczona z RZECZYWISTYCH dat obecnych
 * w zakładce Grafik (nie z Ustawień) - dzięki temu zawsze odzwierciedla, co
 * faktycznie da się wydrukować, niezależnie od tego, czy DNI_GRAFIKU/
 * MIESIAC_GRAFIKU zmieniały się w międzyczasie (odporne na "dryf"
 * konfiguracji względem już wygenerowanych danych).
 *
 * Ustawienia!DNI_GRAFIKU puste -> jeden wpis na każdy kalendarzowy miesiąc
 * pokryty danymi (etykieta "Wrzesień 2026"). DNI_GRAFIKU=N -> kolejne
 * N-dniowe okresy, chainowane od NAJWCZEŚNIEJSZEJ daty w Grafiku (ta sama
 * logika łańcuchowania co getNextGrafikPeriod()/generateGrafikHistoryAndUpcoming(),
 * GrafikGeneratorService.gs). Posortowane od NAJNOWSZEGO (domyślny wybór w
 * oknie dialogowym).
 * @returns {{value: string, label: string, start: string, end: string}[]}
 */
function _getSelectableGrafikPeriods() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.SCHEDULE);
  const data = sheet.getDataRange().getValues();

  let minStr = null, maxStr = null;
  for (let i = 1; i < data.length; i++) {
    const d = formatSheetDate(data[i][2]);
    if (!d) continue;
    if (!minStr || d < minStr) minStr = d;
    if (!maxStr || d > maxStr) maxStr = d;
  }
  if (!minStr) return [];

  const minDate = _parseDateStr(minStr);
  const maxDate = _parseDateStr(maxStr);
  const dniGrafiku = Number(getSettingValue('DNI_GRAFIKU'));
  const periods = [];

  if (dniGrafiku > 0) {
    let periodStart = minDate;
    while (periodStart <= maxDate) {
      const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + dniGrafiku - 1);
      const startStr = Utilities.formatDate(periodStart, 'CET', 'yyyy-MM-dd');
      const endStr = Utilities.formatDate(periodEnd, 'CET', 'yyyy-MM-dd');
      periods.push({ value: startStr, label: _formatDatePL(periodStart) + ' – ' + _formatDatePL(periodEnd), start: startStr, end: endStr });
      periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1);
    }
  } else {
    let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const lastMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    while (cursor <= lastMonth) {
      const periodStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const periodEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const startStr = Utilities.formatDate(periodStart, 'CET', 'yyyy-MM-dd');
      const endStr = Utilities.formatDate(periodEnd, 'CET', 'yyyy-MM-dd');
      periods.push({ value: startStr, label: GRAFIK_PDF_MONTHS_PL_NOM[cursor.getMonth()] + ' ' + cursor.getFullYear(), start: startStr, end: endStr });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  return periods.reverse(); // najnowszy pierwszy - domyślny wybór w <select>
}

/** "12.09.2026" - format daty do etykiet okresów w oknie wyboru. */
function _formatDatePL(date) {
  return Utilities.formatDate(date, 'CET', 'dd.MM.yyyy');
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
  const subtitleBg = _shadeColor(theme.marka, -12);
  const textOnSubtitleBg = getContrastingTextColor(subtitleBg);

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
    // Wiersz 1: baner "letterhead" - logo (lewy górny róg) + nazwa firmy, duża
    // czcionka - kolumna A zostaje bez tekstu (tylko tło), żeby logo (obraz
    // "nad siatką") nigdy nie nakładało się na tekst nazwy firmy.
    tempSheet.getRange(1, 1, 1, 7).setBackground(theme.marka);
    tempSheet.getRange(1, 2, 1, 6).merge()
      .setValue(nazwaFirmy.toUpperCase())
      .setFontColor(textOnMarka)
      .setFontSize(17)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(1, 46);

    const logoBlob = _getCompanyLogoBlob();
    if (logoBlob) {
      try {
        const logoImage = tempSheet.insertImage(logoBlob, 1, 1, 6, 4);
        logoImage.setWidth(38).setHeight(38);
      } catch (err) {
        Logger.log('⚠️ Logo pobrane, ale nie udało się go wstawić do PDF: ' + err.toString());
      }
    }

    // Wiersz 2: podtytuł (okres) - drugi, ciemniejszy odcień KOLOR_MARKA, jak
    // linijka z datą pod nazwą firmy na papierowym kalendarzu.
    tempSheet.getRange(2, 1, 1, 7).merge()
      .setValue('GRAFIK PRACY — ' + subtitle)
      .setBackground(subtitleBg)
      .setFontColor(textOnSubtitleBg)
      .setFontSize(11)
      .setFontStyle('italic')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(2, 22);

    // Wiersz 3: nagłówki dni tygodnia Pon..Nd.
    tempSheet.getRange(3, 1, 1, 7).setValues([GRAFIK_PDF_WEEK_HEADERS])
      .setBackground(theme.marka)
      .setFontColor(textOnMarka)
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    tempSheet.setRowHeight(3, 20);
    // Sobota/niedziela odróżnione ciemniejszym tłem nagłówka.
    tempSheet.getRange(3, 6, 1, 2).setBackground(_shadeColor(theme.marka, -25));

    // Siatka kalendarza: numWeeks wierszy x 7 kolumn, zaczynając od wiersza 4.
    const gridStartRow = 4;
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
            if (!entry) return;
            if (entry.type === 'Praca') {
              lines.push(_abbreviateEmployeeName(e.fullName) + '  ' + entry.start.slice(0, 5) + '-' + entry.stop.slice(0, 5));
            } else if (entry.type === 'Urlop' || entry.type === 'Chorobowe') {
              lines.push(_abbreviateEmployeeName(e.fullName) + '  (' + entry.type + ')');
            }
          });
        }

        maxLinesInRow = Math.max(maxLinesInRow, lines.length);
        const text = lines.join('\n');
        // Numer dnia kolorowany KOLOR_PRACA (jak "plakietka" na papierowym
        // kalendarzu) - albo kontrastowym tekstem na tle święta, gdzie całe
        // tło komórki i tak jest już KOLOR_UWAGA.
        const dayNumberColor = isHoliday ? textOnUwaga : theme.praca;
        const rich = SpreadsheetApp.newRichTextValue()
          .setText(text)
          .setTextStyle(0, dayLabel.length, SpreadsheetApp.newTextStyle().setBold(true).setFontSize(13).setForegroundColor(dayNumberColor).build())
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

    tempSheet.getRange(summaryRow, 1).setValue('Pracownik').setFontWeight('bold').setBackground(theme.tlo);
    tempSheet.getRange(summaryRow, 2).setValue('Godziny').setFontWeight('bold').setBackground(theme.tlo).setHorizontalAlignment('center');
    const summaryHeaderRow = summaryRow;
    summaryRow++;

    employees.forEach(function (e, idx) {
      const rowBg = idx % 2 === 1 ? theme.tlo : '#FFFFFF';
      tempSheet.getRange(summaryRow, 1).setValue(e.fullName).setBackground(rowBg);
      tempSheet.getRange(summaryRow, 2).setValue(_formatMinutesAsHours(totalMinutesByEmployee[e.employeeId])).setHorizontalAlignment('center').setBackground(rowBg);
      summaryRow++;
    });

    tempSheet.getRange(summaryHeaderRow, 1, summaryRow - summaryHeaderRow, 2)
      .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

    // Stopka - data wygenerowania, dyskretnym szarym tekstem, jak na dole
    // wydrukowanej kartki kalendarza.
    summaryRow++;
    tempSheet.getRange(summaryRow, 1, 1, 3).merge()
      .setValue('Wygenerowano automatycznie: ' + Utilities.formatDate(new Date(), 'CET', 'dd.MM.yyyy HH:mm'))
      .setFontColor('#999999')
      .setFontSize(8)
      .setFontStyle('italic');

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
 * Okno dialogowe do wyboru okresu przed wygenerowaniem zbiorczego PDF-a -
 * lista rozwijana (_getSelectableGrafikPeriods(), tylko okresy z realnymi
 * danymi w Grafiku, najnowszy domyślnie zaznaczony jako pierwsza pozycja) -
 * ten sam wzorzec UI co showRebuildSheetDialog() (DatabaseSetup.gs).
 */
function showGrafikPdfPeriodDialog() {
  const periods = _getSelectableGrafikPeriods();

  if (periods.length === 0) {
    const msg = '❌ Brak danych w zakładce Grafik - najpierw wygeneruj grafik (⚙️ System Kadrowy → 🗓️ Grafik).';
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* brak UI */ }
    return msg;
  }

  const options = periods
    .map(function (p) { return '<option value="' + p.start + '|' + p.end + '">' + p.label + '</option>'; })
    .join('');

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 4px 8px; }
      select { width: 100%; padding: 6px; margin: 10px 0; font-size: 13px; }
      button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
      #genBtn { background: #38B2AC; color: #fff; border: none; border-radius: 4px; }
      #genBtn:disabled { opacity: 0.6; cursor: wait; }
      #status { margin-top: 10px; font-size: 12px; }
    </style>
    <p>Wybierz okres, dla którego wygenerować zbiorczy PDF grafiku.</p>
    <select id="periodSelect">${options}</select>
    <br>
    <button id="genBtn" onclick="generate()">🖨️ Wygeneruj PDF</button>
    <div id="status"></div>
    <script>
      function generate() {
        const parts = document.getElementById('periodSelect').value.split('|');
        const btn = document.getElementById('genBtn');
        btn.disabled = true;
        document.getElementById('status').textContent = 'Generuję...';
        google.script.run
          .withSuccessHandler(function (result) {
            document.getElementById('status').textContent = result;
            btn.disabled = false;
          })
          .withFailureHandler(function (err) {
            document.getElementById('status').textContent = '❌ ' + err.message;
            btn.disabled = false;
          })
          .generujGrafikZbiorczyPdfDlaOkresu(parts[0], parts[1]);
      }
    </script>
  `).setWidth(360).setHeight(220);

  SpreadsheetApp.getUi().showModalDialog(html, '🖨️ Wygeneruj zbiorczy grafik za okres PDF');
}

/**
 * Generuje kolorowy PDF zbiorczego grafiku firmy dla PODANEGO zakresu dat
 * (wywoływane z showGrafikPdfPeriodDialog()) i zapisuje go w folderze
 * "Kadry - Grafiki PDF" na Dysku.
 * @param {string} startStr "yyyy-MM-dd"
 * @param {string} endStr "yyyy-MM-dd"
 */
function generujGrafikZbiorczyPdfDlaOkresu(startStr, endStr) {
  const start = _parseDateStr(startStr);
  const end = _parseDateStr(endStr);
  const blob = _generateGrafikZbiorczyPdfBlob(start, end);

  const fileName = 'Grafik zbiorczy ' + startStr + ' - ' + endStr + '.pdf';
  blob.setName(fileName);

  const folder = _getOrCreateGrafikPdfFolder();
  const file = folder.createFile(blob);

  Logger.log('✅ Wygenerowano PDF: "' + fileName + '" - ' + file.getUrl());
  _pokazWynikGenerowaniaPdf(fileName, file.getUrl(), folder.getUrl());
  return '✅ Wygenerowano PDF: "' + fileName + '"';
}

/** Ładne okienko z wynikiem - klikalne przyciski zamiast zwykłego alertu tekstowego. */
function _pokazWynikGenerowaniaPdf(fileName, pdfUrl, folderUrl) {
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
      a.btn-folder { background: #EDF2F7; color: #2D3748; }
    </style>
    <div class="icon">✅</div>
    <div class="filename">${fileName}</div>
    <a class="btn btn-pdf" href="${pdfUrl}" target="_blank">📄 Otwórz PDF</a>
    ${grafikUrl ? '<a class="btn btn-grafik" href="' + grafikUrl + '" target="_blank">📅 Przejdź do arkusza Grafik</a>' : ''}
    ${folderUrl ? '<a class="btn btn-folder" href="' + folderUrl + '" target="_blank">📁 Przejdź do Dysku</a>' : ''}
  `).setWidth(320).setHeight(270);

  try {
    SpreadsheetApp.getUi().showModalDialog(html, '🖨️ Grafik zbiorczy gotowy');
  } catch (e) {
    // Brak kontekstu UI (np. wywołanie z triggera) - link jest w Logger.log powyżej.
  }
}
