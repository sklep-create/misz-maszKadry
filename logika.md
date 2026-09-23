# Logika działania projektu — system kadrowy misz-masz

Ten dokument opisuje architekturę, zależności między plikami i pełne przepływy (end-to-end) systemu. Zmienne/kolumny arkusza opisane są osobno w `zmienne.md`.

## Architektura ogólna

System to Google Apps Script (standalone, `scriptId` w `.clasp.json` — patrz notatka o migracji w CLAUDE.md) podpięty do jednego arkusza Google Sheets pełniącego rolę bazy danych. Trzy kanały wejścia:

1. **Bot Telegram** — webhook (`doPost` w `TelegramBot.gs`) — rozmowa z pracownikami/pracodawcami.
2. **Telegram Mini App** — strona WWW osadzona w Telegramie, serwowana i obsługiwana przez `doGet` (`ApiWindows.gs`) + `MiniAppApi.gs`, zabezpieczona podpisem `initData` (`MiniAppAuth.gs`).
3. **Menu arkusza** (`onOpen`, `Setup.gs`) — ręczne akcje pracodawcy/administratora bezpośrednio w edytorze Google Sheets.

Do tego dochodzą **triggery czasowe** (instalowane ręcznie raz przez `NarzedziaSerwisowe.gs`) odpowiedzialne za automatyzację: generowanie grafiku, backup, odświeżanie dni wolnych, pobieranie godzin z Google Wizytówki.

```
Telegram ──webhook──▶ TelegramBot.gs ──┐
                                        ├──▶ AuthService.gs / TimeTrackerService.gs ──▶ Arkusz (Sheets)
Mini App ──HTTP GET──▶ ApiWindows.gs ──▶ MiniAppApi.gs (+ MiniAppAuth.gs) ──┘

Menu arkusza ──▶ Setup.gs / NarzedziaSerwisowe.gs ──▶ pozostałe serwisy ──▶ Arkusz

Triggery czasowe ──▶ GrafikGeneratorService / BackupService / AvailabilityService / BusinessProfileService
```

Wspólny rdzeń, od którego zależy niemal wszystko: **Config.gs** (dostęp do arkusza, ustawienia, normy godzin, uprawnienia do nadgodzin) i **AuthService.gs** (kto jest kim — pracownik/pracodawca, status autoryzacji).

---

## Mapowanie zakładek (CONFIG.SHEETS)

| Stała | Zakładka |
|---|---|
| `SETTINGS` | Ustawienia |
| `EMPLOYEES` | Pracownicy |
| `SCHEDULE` | Grafik |
| `TIMELOG` | Ewidencja |
| `LEAVES` | Wnioski (w praktyce: tylko korekty START, nie klasyczne urlopy) |
| `AVAILABILITY` | Dyspozycyjność |
| `DAYS_OFF` | Dni wolne |

`Podstawy prawne` nie ma stałej w `CONFIG.SHEETS` — odwołania do niej są po nazwie stringowej wprost.

---

## Opis plików

### Config.gs — rdzeń konfiguracji
Dostarcza: dostęp do arkusza (`getSpreadsheet()` — otwiera po `SPREADSHEET_ID` z Properties Service, bo projekt jest standalone), odczyt/zapis pojedynczych ustawień (`getSettingValue`/`setSettingValue`, kolumnowy odczyt po nazwie nagłówka), generyczny skaner mini-tabel „Podstawy prawne” (`_scanPodstawyPrawneBlocks`), normy godzin z priorytetem **Podstawy prawne → Ustawienia → wartość domyślna** (`getNormaEtatUop`, `getNormaOznUop`, `getNormaOznTygodniowa`), sprawdzenie zgody na nadgodziny (`isOvertimeAllowed`, `canEmployeeHaveOvertime` — OzN nigdy nie ma nadgodzin), godziny otwarcia firmy (`getWeeklyWorkingHours`/`setWeeklyWorkingHours`), sekrety Telegrama (token, webhook URL, z fallbackiem na proxy Cloudflare — `getEffectiveTelegramWebhookUrl`). Używany przez praktycznie wszystkie pozostałe pliki.

### AuthService.gs — tożsamość i autoryzacja
Rdzeń rozpoznawania pracowników po `Telegram_ChatID` i maszyna stanów PIN (`OczekujeNaPIN → PodajePIN → Autoryzowany`, lub `Zablokowany` po 3 błędach). Rozpoznaje też pracodawców po liście `PRACODAWcy_TELEGRAM_IDS`. Kluczowe funkcje: `isUserAuthorized`, `registerNewEmployee`, `authorizeUserWithPin`, `getEmployeeById`, `isEmployerTelegramChat`, `getEmployerTelegramIds`. Używany przez `TelegramBot.gs`, `MiniAppApi.gs`, `AttendanceService.gs`, `GrafikGeneratorService.gs`.

### MiniAppAuth.gs — bezpieczeństwo Mini App
Samodzielna funkcja kryptograficzna `verifyTelegramInitData()` — weryfikuje HMAC-SHA256 podpis danych przesyłanych przez Telegram Web App, żeby nikt nie mógł podszyć się pod cudzy `chatId` w zapytaniach HTTP GET. Używana jako pierwsza bramka w **każdej** funkcji `MiniAppApi.gs`.

### TimeTrackerService.gs — START/STOP i formatowanie
Podstawowa logika ewidencji: `registerTimeEvent(employeeId, "START"/"STOP")` — START dopisuje nowy wiersz do Ewidencji, STOP uzupełnia `Czas_Stop` w najnowszym otwartym wierszu. Zapis wniosków o korektę (`saveCorrectionRequest`, `saveStructuredCorrectionRequest`) do zakładki Wnioski. Funkcje formatujące (`formatSheetDate`, `formatSheetTime`) używane w niemal całym projekcie do normalizacji dat/godzin z komórek Sheets.

### AttendanceService.gs — zatwierdzanie godzin (Panel Pracodawcy)
`getPendingAttendanceForEmployee()` — dni z wypełnionym `Czas_Stop`, ale pustym `Przepracowane` (czekają na akceptację). `approveAttendanceDay(logId, employeeId, nadgodziny, przepracowane)` — jedyne miejsce, gdzie zapisywane są kolumny `Nadgodziny`/`Przepracowane`: `NIE` → zawsze norma dobowa (ignoruje realny czas), `TAK` → wymaga zgody (`canEmployeeHaveOvertime`, Config.gs) i realnego czasu w formacie `H:mm`.

### ScheduleService.gs — odczyt grafiku pracownika
Mały serwis: `getUpcomingScheduleForEmployee(employeeId, daysAhead)` — najbliższe dni z zakładki Grafik, do wyświetlenia w Panelu Pracownika Mini App.

### GrafikGeneratorService.gs — generator harmonogramu (przebudowany 2026-09-22)
Najbardziej złożona logika biznesowa. `getNextGrafikPeriod()` wyznacza kolejny okres na bazie `OSTATNI_DZIEN_GRAFIKU`/`DNI_GRAFIKU`/`MIESIAC_GRAFIKU`. `generateGrafikForPeriod(start, end)` przetwarza TYDZIEŃ PO TYGODNIU (Pon-Nd), dla każdego pracownika sprawdza kolejno: czy firma pracuje tego dnia (`getWeeklyWorkingHours`), czy to święto (`getCompanyDaysOffSet`), czy jest zatwierdzony urlop/e-ZLA z **Wniosków** (`_getApprovedLeaveMap()` — tylko `Status_Akceptacji=Zatwierdzony`), czy pracownik zgłosił dzień jako wolny (`getEmployeeAvailability`). Dobowa/tygodniowa norma KAŻDEGO pracownika (nie tylko OzN) jest liczona z jego `Wymiar_Etatu` × (7h/35h OzN Umiarkowany-Znaczny albo 8h/40h pozostali) — `_effectiveEmployeeLimits()`. Gdy firma NIE dopuszcza nadgodzin (albo pracownik jest OzN, co ZAWSZE wyklucza nadgodziny), tygodniowy LIMIT = norma; gdy dopuszcza I pracownik może je mieć, limit = Wymiar_Etatu × 48h (Art. 131 §1 KP, konserwatywnie na POJEDYNCZY tydzień). Naturalna suma godzin tygodnia > limit → generator skraca/pomija dni **od najpóźniejszego** (`_applyReduction()`), a jeśli jest wybór który dzień skrócić, może to (opcjonalnie) zmienić **Groq** — patrz akapit AI niżej. Ciągłość tygodnia MIĘDZY okresami pilnuje `_seedWeeklyMinutesUsed()` (doczytuje już zaplanowane godziny od poniedziałku do startu okresu). Generacja jest idempotentna (usuwa i odtwarza wiersze w danym zakresie) i zwraca też `restIssues` — wynik `_validateWeeklyRestCompliance()`, sprawdzenia na poziomie KONFIGURACJI GODZIN FIRMY (nie per pracownik), czy między kolejnymi dniami otwarcia jest min. 11h odpoczynku dobowego i gdzieś w tygodniu min. 35h nieprzerwanego odpoczynku tygodniowego (Art. 132/133 KP) — samodzielnie też jako `checkWeeklyRestCompliance()` z menu.

`checkAndGenerateGrafikIfDue()` — trigger dzienny, generuje tylko gdy dziś = start kolejnego okresu minus 5 dni; po wygenerowaniu wysyła powiadomienia Telegram (pracodawcom zawsze, z ostrzeżeniem o brakach obsady/odpoczynku; pracownikom krótkie info) i aktualizuje `OSTATNI_DZIEN_GRAFIKU`. `generateGrafikHistoryAndUpcoming(anchorDateStr)` — jednorazowa (re)generacja szerokiego, CIĄGŁEGO zakresu: 2 miesiące wstecz (od 1. dnia miesiąca) + okres zawierający `anchorDate` + jeden okres po nim, w jednym wywołaniu `generateGrafikForPeriod()` (ciągłość tygodni jest więc automatyczna).

`onEditWnioski(e)` (trigger instalowalny `onEdit`, `zainstalujAutomatycznaRegeneracjeUrlopuNaZadanie()` w NarzedziaSerwisowe.gs) — gdy `Status_Akceptacji` wniosku typu **"Urlop na żądanie"** (Art. 167(2) KP) zostanie ustawiony na `Zatwierdzony`, AUTOMATYCZNIE przebudowuje tydzień/tygodnie obejmujące ten urlop (bez czekania na ręczne odpalenie generatora — to jedyny typ wniosku wymagający natychmiastowej reakcji z definicji). Inne typy/statusy (w tym `Odrzucony`) nie wyzwalają nic automatycznie.

**Rola Groq (opcjonalna, tylko "recenzja"):** generator NAJPIERW liczy w 100% zgodny z prawem wariant deterministycznie — Groq nigdy nie liczy godzin/limitów. Jeśli trzeba skrócić/pominąć dzień komuś w tygodniu, Groq (jeśli jest `GROQ_API_KEY`) dostaje WYŁĄCZNIE listę already-legal kandydujących dni tej samej decyzji + dane o rotacji weekendowej (`getWeekendShiftFairnessReport`) i może zaproponować inną KOLEJNOŚĆ przycinania (`_reviewCutDecisionsWithGroq()`) — walidowaną jako permutacja tych samych dni; błąd/brak klucza/nieprawidłowa odpowiedź = cichy fallback na wariant domyślny. AI nie ma żadnej możliwości zmienić sumę godzin, złamać limit czy wymyślić dane.

### GrafikPdfService.gs — eksport do PDF
`showGrafikPdfPeriodDialog()` (menu) otwiera okno wyboru okresu - lista rozwijana z `_getSelectableGrafikPeriods()`, wyliczona z RZECZYWISTYCH dat w zakładce Grafik (nie z Ustawień, więc zawsze zgodna z tym, co faktycznie da się wydrukować): `DNI_GRAFIKU` puste → jedna pozycja na każdy kalendarzowy miesiąc pokryty danymi; `DNI_GRAFIKU=N` → kolejne N-dniowe okresy chainowane od najwcześniejszej daty w Grafiku. Najnowszy okres jest domyślnie zaznaczony. Wybór wywołuje `generujGrafikZbiorczyPdfDlaOkresu(startStr, endStr)`, która buduje **tymczasowy arkusz Google** z realnym formatowaniem komórek (bo `Utilities.newBlob(html).getAs('pdf')` nie renderuje kolorów tła) - logo firmy (`getCompanyLogoUrl()`) w nagłówku, kolory z `Ustawienia`/`PaletaKolorow.gs` (w tym `KOLOR_PRACA` na numerach dni), święta z `AvailabilityService.gs` - eksportuje natywnym mechanizmem Sheets→PDF, usuwa arkusz tymczasowy, zapisuje plik na Dysku (folder "Kadry - Grafiki PDF").

### AvailabilityService.gs — kalendarz, święta, dyspozycyjność
Największy plik logiki kalendarzowej. Liczy polskie święta ustawowe matematycznie dla dowolnego roku (`getEasterSunday` — algorytm Gaussa, plus święta ruchome zależne od Wielkanocy). `refreshDniWolneSheet()` nadpisuje TYLKO blok "Ustawowe" zakładki Dni wolne dla 3 lat, zostawiając blok "Własne" nietknięty, i best-effort synchronizuje z Google Wizytówką. `getCompanyDaysOffSet()` łączy oba bloki (plus awaryjne matematyczne wyliczenie, gdyby arkusz nie miał jeszcze danych dla danego roku) — to jedyne źródło prawdy o dniach wolnych dla generatora Grafiku i PDF. `getAvailabilityLimit()` liczy ile dni wolnych może zgłosić pracownik w danym miesiącu na bazie miesięcznej normy KP i jego `Wymiar_Etatu`/`Stopien_OZN`. Termin zgłaszania dyspozycyjności: 15 dni przed 1. dniem miesiąca (`AVAILABILITY_CUTOFF_DAYS`, `isMonthSelectable`).

### PaletaKolorow.gs — kolory UI
`wygenerujPaletKolorow()` liczy z jednego koloru bazowego (`KOLOR_MARKA`, HSL) trzy pochodne kolory (praca, uwaga, tło) i zapisuje je z powrotem w Ustawieniach. Używane przez PDF grafiku i frontend Mini App.

### PodstawyPrawneService.gs — monitorowanie zmian w prawie
`sprawdzAktualizacjePodstawPrawnych()` — deterministyczne sprawdzenie przez `api.sejm.gov.pl`, czy śledzone teksty jednolite (Kodeks pracy, ustawa o rehabilitacji zawodowej) są nadal aktualne; przy sygnałach do sprawdzenia pobiera świeży PDF na Dysk. `sprawdzNowelizacjeZAI()` — wyłącznie doradcze pytanie do Groq o urzędowe tytuły nowelizacji; **nigdy nie nadpisuje** wartości liczbowych w tabeli (świadoma decyzja architektoniczna — patrz CLAUDE.md). Obsługiwane przez checkboxy-przyciski w wierszu 1 zakładki Podstawy prawne (`onEditPodstawyPrawne` trigger).

### MiniAppApi.gs — API Mini App
Warstwa funkcji wywoływanych z frontendu (przez `doGet`): każda niezależnie weryfikuje `initData` (MiniAppAuth.gs) i sprawdza rolę/autoryzację (AuthService.gs), stateless. Pokrywa: rejestrację zdarzeń START/STOP, dashboard pracownika, zgłaszanie korekt, dyspozycyjność, rozróżnienie roli pracownik/pracodawca, listę oczekujących dni do zatwierdzenia i samo zatwierdzanie (delegacja do `AttendanceService.gs`).

### ApiWindows.gs — router HTTP
Jedyny `doGet` w projekcie. `page=miniapp` → renderuje `MiniApp.html`. `action=...` → JSON z odpowiedniej funkcji `MiniAppApi.gs`, albo (dla starszego dashboardu React) surowy zrzut zakładek Pracownicy/Ewidencja/Wnioski (`getSheetDataAsJson`).

### TelegramBot.gs — webhook i konwersacja
`doPost(e)` — webhook, deduplikacja po `update_id` (Properties Service), zawsze zwraca "OK" (błędy logowane, nie rzucane, żeby Telegram nie retry'ował w nieskończoność). `handleMessage` rozgałęzia na: komunikat pracodawcy, `/start` (rejestracja), przepływ PIN, przyciski START/STOP/korekta. `sendTelegramMessage()` — wspólna funkcja wysyłki, używana też przez `GrafikGeneratorService.gs` i `Reminders.gs`.

### TelegramBotTools.gs — narzędzia diagnostyczne (ręczne)
Zestaw funkcji do ręcznego uruchamiania z edytora: pobranie zdjęcia bota (z cache 1h, żeby token nie trafiał do klienta), diagnostyka webhooka, ustawienie/reset webhooka, wysyłka testowej wiadomości, pełna diagnostyka (`runFullBotDiagnostics`), ustawienie stałego przycisku Menu Telegrama wskazującego na Mini App.

### Reminders.gs — przypomnienia o braku START
`checkMissingStartLogs()` porównuje Grafik (co powinno się dziać) z Ewidencją (co się faktycznie dzieje) — jeśli wg grafiku pracownik powinien już pracować, a nie ma dzisiejszego wpisu z `Czas_Start`, wysyła ostrzeżenie Telegram. **Brak zainstalowanego automatycznego triggera** dla tej funkcji (w przeciwieństwie do Grafiku/Backupu/Dni wolnych) — uruchamiana ręcznie z menu.

### BackupService.gs — kopie zapasowe
`wykonajBackupArkusza()` — pełna kopia skoroszytu na Dysku (folder "Kadry - Backupy"), retencja 30 dni. `przywrocDaneZBackupu()` — destrukcyjne przywrócenie: kopiuje każdą zakładkę z backupu do żywego arkusza, usuwa zakładki żywego arkusza bez odpowiednika w backupie (backup = pełne źródło prawdy). Kod aplikacji (git/clasp) celowo nie jest tu obsługiwany.

### BusinessProfileService.gs — integracja Google Wizytówka
Dwustronna synchronizacja godzin otwarcia i dni wolnych z Google Business Profile. Pobieranie godzin ma dwie ścieżki: My Business API (`pullHoursFromGoogleBusinessProfile`, wymaga uprawnień właściciela, częściowo zablokowana limitem Google) i publiczne Places API (`pullHoursFromPublicPlacesApi`, fallback bez tych uprawnień — to ta uruchamiana automatycznie codziennie). Wypychanie dni wolnych (`pushDaysOffToGoogleBusinessProfile`) wywoływane automatycznie po każdym `refreshDniWolneSheet()`.

### Setup.gs — menu i konfiguracja webhooka
`onOpen()` buduje menu "⚙️ System Kadrowy". Funkcje konfiguracyjne: `setWebhookDeploymentId()` (z walidacją URL), `setTelegramWebhookProxyUrl()` (Cloudflare Worker jako obejście przekierowania 302 Apps Script), `setEmployerTelegramIds()`.

### NarzedziaSerwisowe.gs — instalatory i narzędzia migracyjne
"Klej" instalujący całą automatyzację: triggery czasowe dla generatora grafiku (~6:00 codziennie), backupu (co `BACKUP_CO_DNI` dni, ~3:00), odświeżania dni wolnych (1. dnia miesiąca, ~4:00), pobierania godzin z Places API (~5:00 codziennie), oraz trigger `onEdit` dla przycisków Podstaw prawnych. Zawiera też narzędzia migracyjne po przeniesieniu projektu (`podlaczArkuszIZainstalujMenu`, `ustawAdresyWebhookaPoMigracji`) i diagnostyczne (`sprawdzWszystkieUprawnienia`). Funkcje mają celowo polskie nazwy — plik uruchamiany ręcznie z edytora, ma być zrozumiały bez tłumaczenia (patrz CLAUDE.md).

---

## Przepływy end-to-end

### A. Rejestracja nowego pracownika (Telegram, PIN)
1. Pracownik pisze `/start` → `TelegramBot.gs: doPost → handleMessage → handleStartCommand`.
2. Brak wpisu w Pracownicy → `AuthService.registerNewEmployee()`: nowy `EMP-NNN`, 6-cyfrowy PIN, status `OczekujeNaPIN`, 3 próby.
3. `notifyEmployersAboutNewEmployee()` wysyła dane nowego pracownika + PIN do wszystkich `getEmployerTelegramIds()` — pracodawca przekazuje PIN pracownikowi ręcznie (np. ustnie).
4. Pracownik klika "Podaję PIN" → status `PodajePIN` (`setAwaitingPinStatus`).
5. Wpisuje PIN → `authorizeUserWithPin()`: zgodny → `Autoryzowany` (PIN czyszczony); niezgodny → `Licz_błędy` -1, po 0 → `Zablokowany`.
6. Od tej pory pracownik ma dostęp do Mini App (przycisk Menu Telegrama) i funkcji bota — każde wywołanie weryfikowane osobno (`isUserAuthorized`/`verifyTelegramInitData`).

### B. START/STOP → Ewidencja → zatwierdzenie → Nadgodziny/Przepracowane
1. Telegram (przycisk) lub Mini App (`action=registerEvent`) → w obu przypadkach ląduje w `TimeTrackerService.registerTimeEvent()`.
2. START → nowy wiersz w Ewidencji; STOP → uzupełnienie `Czas_Stop` najnowszego otwartego wiersza tego pracownika.
3. `Reminders.checkMissingStartLogs()` (ręcznie/co 15 min) porównuje Grafik vs Ewidencję i ostrzega, jeśli ktoś zapomniał START.
4. Pracodawca w Panelu Pracodawcy (Mini App) widzi listę niezatwierdzonych dni (`AttendanceService.getPendingAttendanceForEmployee`).
5. Zatwierdzenie (`approveAttendanceDay`): `Nadgodziny=NIE` → `Przepracowane` = norma dobowa niezależnie od realnego czasu; `Nadgodziny=TAK` → wymaga zgody firmowej i braku OzN (`canEmployeeHaveOvertime`), `Przepracowane` = realny czas.
6. Korekty zapomnianego START (`/korekta` lub formularz) trafiają do zakładki Wnioski ze statusem `Oczekuje` — **brak automatycznej akceptacji**, to ręczna interwencja pracodawcy w arkuszu (jedyny w pełni zautomatyzowany cykl zatwierdzania to punkty 4-5, dotyczące Ewidencji, nie Wniosków).

### C. Generowanie Grafiku (trigger okresowy)
1. Trigger dzienny (~6:00) → `checkAndGenerateGrafikIfDue()`; generacja uruchamia się tylko gdy dziś = start kolejnego okresu minus 5 dni.
2. `generateGrafikForPeriod()`: dla każdego dnia × pracownika sprawdza godziny firmy (Ustawienia), święta (`getCompanyDaysOffSet` — Dni wolne + wyliczenie matematyczne), zgłoszoną dyspozycyjność pracownika, a dla OzN Umiarkowany/Znaczny — podwójny limit dobowy+tygodniowy (normy z Podstawy prawne → Ustawienia → domyślne).
3. Zapis do Grafiku, aktualizacja `OSTATNI_DZIEN_GRAFIKU`, powiadomienia Telegram (pracodawcy zawsze + ostrzeżenie o brakach obsady; pracownicy krótkie info).

### D. Generowanie PDF grafiku
1. Ręcznie z menu → `showGrafikPdfPeriodDialog()` → wybór okresu z listy (wyliczonej z realnych dat w Grafiku) → `generujGrafikZbiorczyPdfDlaOkresu()`.
2. Budowa tymczasowego arkusza-siatki z logo firmy, kolorami (PaletaKolorow.gs/Ustawienia) i świętami (AvailabilityService.gs), eksport natywny Sheets→PDF, zapis na Dysku, usunięcie arkusza tymczasowego.

### E. Wnioski (korekty czasu)
Zgłoszenie (Telegram/Mini App) → wiersz w Wnioski, status `Oczekuje`. Dalszy los wniosku (akceptacja, ewentualna ręczna poprawka w Ewidencji) odbywa się **wyłącznie ręcznie** w arkuszu — kod nie ma tu automatyzacji.

### F. Backup arkusza
Trigger (co `BACKUP_CO_DNI` dni, ~3:00) lub ręcznie → `wykonajBackupArkusza()`: pełna kopia na Dysk, retencja 30 dni. Przywracanie (`przywrocDaneZBackupu`) jest destrukcyjne i wymaga podwójnego potwierdzenia w UI.

### G. Odświeżanie dni wolnych ustawowych
Trigger comiesięczny (1. dnia, ~4:00) lub ręcznie → `refreshDniWolneSheet()`: przelicza święta dla 3 lat, nadpisuje tylko blok "Ustawowe", best-effort synchronizuje z Google Wizytówką. Efekt natychmiast widoczny w generatorze Grafiku (przepływ C) i PDF (przepływ D).

---

## Znane luki / celowe uproszczenia (stan na 2026-09-22)

- Zakładka **Wnioski** WCIĄŻ nie ma pełnego zautomatyzowanego cyklu akceptacji (zmiana `Status_Akceptacji` jest zawsze ręczna) — ale od 2026-09-22 `Status_Akceptacji=Zatwierdzony` NA **DOWOLNYM** typie urlopu/e-ZLA wpływa na generator Grafiku (patrz `_getApprovedLeaveMap()`), a `Urlop na żądanie` dodatkowo wyzwala automatyczną regenerację (`onEditWnioski()`). Korekty START (`saveCorrectionRequest`) nadal nie mają żadnej automatyzacji akceptacji.
- **Staz_Pracy_Lata** nadal wymaga ręcznej aktualizacji (staż z edukacją, Art. 155 KP) — ale **Suma_Urlopów** jest od 2026-09-22 przeliczana automatycznie z niego (`calculateSumaUrlopow()`, AvailabilityService.gs: 20/26 dni wg stażu + 10 dni OzN Umiarkowany/Znaczny) przy każdej zmianie `Stopien_OZN`/`Staz_Pracy_Lata` (trigger `onEditPracownicy()`, jeśli zainstalowany) albo ręcznie z menu.
- **Reminders.checkMissingStartLogs()** nie ma zainstalowanego automatycznego triggera — uruchamiana ręcznie z menu.
- AI (Groq) w `PodstawyPrawneService.gs` jest celowo tylko doradcze — nigdy nie nadpisuje liczb używanych do wyliczeń czasu pracy/wynagrodzeń (patrz uzasadnienie w CLAUDE.md). W `GrafikGeneratorService.gs` Groq ma od 2026-09-22 WĄŻSZĄ, ale też nigdy-nadpisującą-liczb rolę: może tylko zmienić KOLEJNOŚĆ przycinania już-legalnie wyliczonych dni (patrz wyżej) — każda propozycja jest walidowana jako permutacja tych samych dni, więc nie może złamać żadnego limitu.
- `_validateWeeklyRestCompliance()` (odpoczynek 11h/35h) sprawdza tylko KONFIGURACJĘ godzin firmy, nie generuje żadnych korekt automatycznie — jeśli wykryje problem, tylko ostrzega (Telegram/alert), bo zmiana godzin otwarcia to decyzja biznesowa, nie coś do automatycznego "naprawienia" przez kod.
