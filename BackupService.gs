/**
 * Kopie zapasowe całego arkusza (skoroszytu) na Google Dysku - folder
 * "Kadry - Backupy" (tworzony automatycznie przy pierwszym użyciu, szukany
 * po nazwie za każdym razem - żadne ID nie jest nigdzie przechowywane, więc
 * przetrwa nawet migrację do innego projektu Apps Script).
 *
 * Backup kodu (Apps Script) NIE jest tu obsługiwany - każda zmiana trafia do
 * Gita (pełna historia, niezależna od Google) i każdy `clasp deploy` tworzy
 * numerowaną wersję w samym Apps Script. To już wystarczające zabezpieczenie.
 */

const BACKUP_FOLDER_NAME = 'Kadry - Backupy';
const BACKUP_RETENTION_DAYS = 30;

/** Zwraca folder na backupy, tworząc go przy pierwszym użyciu. */
function _getOrCreateBackupFolder() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

/**
 * Tworzy pełną kopię arkusza (wszystkie zakładki, formatowanie, formuły) w
 * folderze "Kadry - Backupy", z datą w nazwie. Kasuje (do kosza, nie trwale)
 * kopie starsze niż BACKUP_RETENTION_DAYS dni. Wywoływane zarówno ręcznie z
 * menu, jak i przez automatyczny trigger co X dni.
 */
function wykonajBackupArkusza() {
  const ss = getSpreadsheet();
  const folder = _getOrCreateBackupFolder();

  const timestamp = Utilities.formatDate(new Date(), 'CET', 'yyyy-MM-dd_HH-mm');
  const backupName = ss.getName() + ' — backup ' + timestamp;

  const file = DriveApp.getFileById(ss.getId());
  file.makeCopy(backupName, folder);

  // Retencja: kopie starsze niż BACKUP_RETENTION_DAYS trafiają do kosza (nie
  // usuwane trwale - zostają tam jeszcze przez jakiś czas jako dodatkowy bufor).
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BACKUP_RETENTION_DAYS);

  let removedCount = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated() < cutoff) {
      f.setTrashed(true);
      removedCount++;
    }
  }

  const msg = '✅ Backup utworzony: "' + backupName + '"' +
    (removedCount > 0 ? ('\n🗑️ Usunięto ' + removedCount + ' backup(ów) starszych niż ' + BACKUP_RETENTION_DAYS + ' dni.') : '');

  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // Brak kontekstu UI (np. trigger) - wynik jest w Logger.log powyżej.
  }
  return msg;
}

/** Lista dostępnych backupów (najnowszy pierwszy) - do okna przywracania. */
function _listujBackupy() {
  const folder = _getOrCreateBackupFolder();
  const files = folder.getFiles();
  const list = [];

  while (files.hasNext()) {
    const f = files.next();
    list.push({
      id: f.getId(),
      name: f.getName(),
      date: f.getDateCreated()
    });
  }

  list.sort(function (a, b) { return b.date - a.date; });
  return list;
}

/**
 * Otwiera okno z listą backupów do wyboru. Po potwierdzeniu NADPISUJE dane w
 * bieżącym arkuszu wartościami z wybranej kopii (zakładka po zakładce,
 * dopasowanie po nazwie) - operacja nieodwracalna, stąd podwójne potwierdzenie.
 */
function pokazDialogPrzywracaniaBackupu() {
  const backups = _listujBackupy();

  if (backups.length === 0) {
    SpreadsheetApp.getUi().alert('ℹ️ Brak zapisanych backupów. Zrób najpierw backup (💾 Zrób backup teraz).');
    return;
  }

  const options = backups.map(function (b) {
    const label = b.name + ' (' + Utilities.formatDate(b.date, 'CET', 'yyyy-MM-dd HH:mm') + ')';
    return '<option value="' + b.id + '">' + label + '</option>';
  }).join('');

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 4px 8px; }
      p.warn { color: #a94442; font-weight: bold; }
      select { width: 100%; padding: 6px; margin: 10px 0; font-size: 13px; }
      button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
      #restoreBtn { background: #d9534f; color: #fff; border: none; border-radius: 4px; }
      #restoreBtn:disabled { opacity: 0.6; cursor: wait; }
      #status { margin-top: 10px; font-size: 12px; }
    </style>
    <p>Wybierz backup do przywrócenia.</p>
    <p class="warn">⚠️ To NADPISZE dane we wszystkich zakładkach obecnymi z wybranej kopii. Operacja nieodwracalna (chyba że sam zrobisz backup przed przywróceniem).</p>
    <select id="backupSelect">${options}</select>
    <br>
    <button id="restoreBtn" onclick="restore()">♻️ Przywróć dane</button>
    <div id="status"></div>
    <script>
      function restore() {
        const backupId = document.getElementById('backupSelect').value;
        const backupLabel = document.getElementById('backupSelect').selectedOptions[0].textContent;
        if (!confirm('Na pewno przywrócić dane z:\\n' + backupLabel + '\\n\\nWszystkie obecne dane w arkuszu zostaną NADPISANE.')) {
          return;
        }
        const btn = document.getElementById('restoreBtn');
        btn.disabled = true;
        document.getElementById('status').textContent = 'Przywracam...';
        google.script.run
          .withSuccessHandler(function (result) {
            document.getElementById('status').textContent = result;
            btn.disabled = false;
          })
          .withFailureHandler(function (err) {
            document.getElementById('status').textContent = '❌ ' + err.message;
            btn.disabled = false;
          })
          .przywrocDaneZBackupu(backupId);
      }
    </script>
  `).setWidth(420).setHeight(260);

  SpreadsheetApp.getUi().showModalDialog(html, '♻️ Przywróć dane z backupu');
}

/**
 * Przywraca arkusz DOKŁADNIE do stanu z backupu - pełna wierność
 * (formatowanie, formuły), nie tylko wartości. Zakładki z backupu nadpisują
 * (po nazwie) odpowiadające bieżące; zakładki bieżące BEZ odpowiednika w
 * backupie są USUWANE (backup jest pełnym źródłem prawdy, np. testowy
 * "Arkusz1" po usunWszystkieDane() zniknie po przywróceniu).
 */
function przywrocDaneZBackupu(backupFileId) {
  const liveSs = getSpreadsheet();
  const backupSs = SpreadsheetApp.openById(backupFileId);
  const backupSheetNames = backupSs.getSheets().map(function (s) { return s.getName(); });

  let restoredCount = 0;
  backupSs.getSheets().forEach(function (backupSheet) {
    const sheetName = backupSheet.getName();
    const existingSheet = liveSs.getSheetByName(sheetName);
    const existingIndex = existingSheet ? existingSheet.getIndex() : null;

    const copied = backupSheet.copyTo(liveSs);
    copied.setName('__restore_tmp__' + sheetName);

    if (existingSheet) {
      liveSs.deleteSheet(existingSheet);
    }

    copied.setName(sheetName);
    if (existingIndex !== null) {
      liveSs.setActiveSheet(copied);
      liveSs.moveActiveSheet(existingIndex);
    }

    restoredCount++;
  });

  // Zakładki bieżące, których nie ma w backupie, zostają usunięte - backup
  // jest pełnym źródłem prawdy o stanie arkusza. Bezpieczne: przywrócone
  // zakładki z backupu są już na miejscu, więc skoroszyt nigdy nie zostaje
  // bez żadnej zakładki.
  let removedCount = 0;
  liveSs.getSheets().forEach(function (sheet) {
    if (backupSheetNames.indexOf(sheet.getName()) === -1) {
      liveSs.deleteSheet(sheet);
      removedCount++;
    }
  });

  let msg = '✅ Przywrócono ' + restoredCount + ' zakładek z backupu "' + backupSs.getName() + '".';
  if (removedCount > 0) {
    msg += '\n🗑️ Usunięto ' + removedCount + ' zakładek, których nie było w backupie.';
  }
  return msg;
}
