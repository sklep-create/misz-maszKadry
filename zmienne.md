# Zmienne w arkuszu Google Sheets

Dokument opisuje wszystkie kolumny/zmienne w każdej zakładce arkusza: możliwe wartości i z czym są powiązane w kodzie. Źródło: `getDatabaseSchema()` w `DatabaseSetup.gs` + funkcje odczytujące w `Config.gs` i pozostałych serwisach. Zobacz też `logika.md` dla pełnych przepływów.

---

## Ustawienia

Układ kolumnowy: nagłówek w wierszu 1 = nazwa ustawienia, wartości pod spodem. Większość ustawień ma jedną wartość (wiersz 2); `PRACODAWCY_TELEGRAM_IDS` oraz para "dni pracy"/"godziny pracy" mają jedną wartość na wiersz (rosnąco w dół), niezależnie od pozostałych kolumn.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `NAZWA_FIRMY` | dowolny tekst | Nazwa firmy, wyświetlana w Mini App i PDF grafiku. |
| `logo` | URL obrazka lub puste | Ręczny link do logo (pierwszeństwo). Puste → automatyczne zdjęcie profilowe bota Telegram (`getTelegramBotPhotoDataUri`, `TelegramBotTools.gs`). Odczyt: `getCompanyLogoUrl()` (Config.gs). |
| `NORMA_ETAT_UOP` | liczba godzin (domyślnie 8) | Dobowa norma pełnego etatu — **override**, nadpisywany przez `Podstawy prawne!NORMA_DOBOWA_ETAT` gdy ten jest wypełniony. Odczyt: `getNormaEtatUop()`. |
| `NORMA_OZN_UOP` | liczba godzin (domyślnie 7) | Dobowa norma OzN (Umiarkowany/Znaczny) — override, priorytet niższy niż `Podstawy prawne!NORMA_DOBOWA_OZN`. Odczyt: `getNormaOznUop()`. Używane bezpośrednio przez generator Grafiku. |
| `NORMA_OZN_TYGODNIOWA_UOP` | liczba godzin (domyślnie 35) | Tygodniowa norma OzN — override, priorytet niższy niż `Podstawy prawne!NORMA_TYGODNIOWA_OZN`. Odczyt: `getNormaOznTygodniowa()`. |
| `MIESIAC_GRAFIKU` | tekst `YYYY-MM` (wymuszony format `@`) | Miesiąc startowy pierwszego wygenerowanego grafiku. Używany tylko dopóki `OSTATNI_DZIEN_GRAFIKU` jest puste. Patrz `getNextGrafikPeriod()` (GrafikGeneratorService.gs). |
| `WEBHOOK_URL` | URL wdrożenia Web App | Kopia `WEBHOOK_DEPLOYMENT_URL` z Properties Service, widoczna w arkuszu do wglądu. Ustawiane przez `setWebhookDeploymentId()` (Setup.gs). |
| `PRACODAWcy_TELEGRAM_IDS` | lista liczbowych Chat ID Telegram, po jednym na wiersz | Kto dostaje powiadomienia pracodawcy i ma dostęp do Panelu Pracodawcy w Mini App. Odczyt: `getEmployerTelegramIds()`, sprawdzenie roli: `isEmployerTelegramChat()` (AuthService.gs). |
| `dni pracy` | nazwy dni tygodnia (Poniedziałek...Niedziela), jeden na wiersz | Lista dni tygodnia firmy — kolumna towarzysząca `godziny pracy`. Odczyt/zapis: `getWeeklyWorkingHours()`/`setWeeklyWorkingHours()` (Config.gs). |
| `godziny pracy` | np. `"8.30 - 15.30"` lub puste | Godziny otwarcia danego dnia; puste = dzień zamknięty (firma nie pracuje). Parsowane przez `parseWorkingHoursRange()` (GrafikGeneratorService.gs). Może być synchronizowane z Google Wizytówką (`pullHoursFromPublicPlacesApi`, `pullHoursFromGoogleBusinessProfile`, `pushHoursToGoogleBusinessProfile` — BusinessProfileService.gs). |
| `NADGODZINY` | `TAK` / `NIE` | Globalna zgoda firmy na nadgodziny. Domyślnie `NIE` (bezpieczny wariant). OzN nigdy nie ma nadgodzin niezależnie od tej wartości. Odczyt: `isOvertimeAllowed()`, `canEmployeeHaveOvertime()` (Config.gs). |
| `DNI_GRAFIKU` | liczba (np. 14, 20) lub puste | Długość okresu grafiku w dniach; puste = cały kalendarzowy miesiąc. Patrz `getNextGrafikPeriod()`. |
| `OSTATNI_DZIEN_GRAFIKU` | tekst `YYYY-MM-DD` (wymuszony format `@`) | Ostatni dzień już wygenerowanego okresu grafiku — ustawiane automatycznie po każdej generacji, **nie edytować ręcznie**. Steruje kolejnym cyklem generacji (`_runGrafikGeneration`) i odtworzeniem zakresu do PDF (`_getLatestGrafikPeriodRange`, GrafikPdfService.gs). |
| `DYSPOZYCYJNOSC` | `TAK` / `NIE` (domyślnie `TAK`) | Czy Mini App pokazuje pracownikom zakładkę/przycisk "Dyspozycyjność". `NIE` = pracownicy nie mogą zgłaszać dni wolnych — generator NIE wymaga żadnej specjalnej obsługi tego ustawienia, bo `getEmployeeAvailability()` wtedy i tak zawsze zwraca `[]` (dostępny każdego dnia). Odczyt: `isDyspozycyjnoscEnabled()` (Config.gs). |
| `GOOGLE_PLACES_API_KEY` | klucz API (tekst) | Klucz do publicznego Places API (New) — ten sam, którego używa strona misz-masz.cc. Używany przez `pullHoursFromPublicPlacesApi()`. |
| `GOOGLE_PLACE_ID` | ID lokalizacji Google Maps | Identyfikator firmy w Google Maps, używany razem z kluczem Places API. |
| `APPS_SCRIPT_EDITOR_URL` | URL edytora Apps Script | Link do standalone projektu (bo "Rozszerzenia → Apps Script" w arkuszu nie prowadzi już do właściwego projektu po migracji — patrz CLAUDE.md). Czysto informacyjne. |
| `BACKUP_CO_DNI` | liczba dni (domyślnie 7, gdy puste) | Częstotliwość automatycznego backupu. Trigger instalowany przez `zainstalujAutomatycznyBackupArkusza()` (NarzedziaSerwisowe.gs), wykonanie: `wykonajBackupArkusza()` (BackupService.gs). |
| `GROQ_API_KEY` | klucz API Groq (tekst) lub puste | Klucz do darmowego API Groq. Używany przez `sprawdzNowelizacjeZAI()` (PodstawyPrawneService.gs, doradcza ocena tytułów nowelizacji) ORAZ przez `_reviewCutDecisionsWithGroq()` (GrafikGeneratorService.gs, doradcza kolejność przycinania dni w grafiku) — w obu miejscach WYŁĄCZNIE jako recenzja/podpowiedź, nigdy nie nadpisuje liczb/limitów. Puste = generator Grafiku działa w 100% deterministycznie (bez zmian w zgodności z prawem). |
| `KOLOR_MARKA` | kolor hex (np. `#2EA6FF`) | Kolor bazowy marki — jedyny wpisywany ręcznie. Z niego wyliczane są pozostałe 3 kolory (`wygenerujPaletKolorow()`, PaletaKolorow.gs). |
| `KOLOR_PRACA` | kolor hex, wyliczany automatycznie | Kolor "praca" (rotacja +120° HSL względem KOLOR_MARKA) — nie edytować ręcznie, nadpisywany przy każdym uruchomieniu generatora palety. |
| `KOLOR_UWAGA` | kolor hex, wyliczany automatycznie | Kolor "uwaga/ostrzeżenie" (rotacja +240°, +10% nasycenia) — używany m.in. do oznaczania świąt w PDF grafiku. |
| `KOLOR_TLO` | kolor hex, wyliczany automatycznie | Jasny, stonowany neutralny odcień tła (L=95%). |

---

## Pracownicy

**Od 2026-09-22 kolumny czytane PO NAZWIE NAGŁÓWKA** (`getEmployeesColumnMap()`,
Config.gs), nie po stałej pozycji — wcześniej AuthService.gs/AttendanceService.gs/
AvailabilityService.gs/GrafikGeneratorService.gs czytały `data[i][3]` itd. wprost,
co po ręcznym wstawieniu kolumny `Data_Zatrudnienia` w arkuszu (bez zmiany kodu)
po cichu rozjechało autoryzację PIN i przeliczanie `Suma_Urlopów` na złe kolumny.
Kolejność kolumn w arkuszu może się teraz różnić od kolejności w schemacie bez ryzyka.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `ID_Pracownika` | `EMP-001`, `EMP-002`, ... | Klucz główny pracownika, generowany automatycznie (`generateNextEmployeeId`, AuthService.gs). Referencja w Grafik/Ewidencja/Wnioski/Dyspozycyjność. |
| `Telegram_ChatID` | liczba (Chat ID Telegram) lub puste | Identyfikator konta Telegram pracownika — łączy wpis w arkuszu z rozmową na Telegramie. Ustawiane przy `registerNewEmployee()`. |
| `Imie_Nazwisko` | tekst | Wyświetlane w Mini App, PDF grafiku, powiadomieniach. |
| `Data_Zatrudnienia` | `YYYY-MM-DD` lub puste | Data zatrudnienia u TEGO pracodawcy — czysto informacyjna, wpisywana ręcznie. NIE wpływa na `Staz_Pracy_Lata`/`Suma_Urlopów` (staż liczy się łącznie z poprzednimi pracodawcami/edukacją, patrz `Staz_Pracy_Lata` niżej — nie da się go wyprowadzić z samej tej daty). |
| `Forma_Zatrudnienia` | `UoP` / `UZ` / `B2B` | Forma zatrudnienia — obecnie tylko informacyjna (logika generatora/ewidencji operuje na `Wymiar_Etatu` i `Stopien_OZN`, nie na tej kolumnie). |
| `Wymiar_Etatu` | `1.0`, `0.5`, `0.75` (ułamek etatu) | Używany do wyliczenia limitu dyspozycyjności (`getAvailabilityLimit`, AvailabilityService.gs) ORAZ (od 2026-09-22) do proporcjonalnego skalowania dobowej/tygodniowej normy godzin w generatorze Grafiku (`_effectiveEmployeeLimits()`, GrafikGeneratorService.gs) - 0.5 etatu = proporcjonalnie krótsze zmiany, ten sam wzorzec dni co firma. |
| `Stopien_OZN` | `Brak` / `Lekki` / `Umiarkowany` / `Znaczny` | Kluczowa zmienna prawna: `Umiarkowany`/`Znaczny` → skrócona norma czasu pracy (7h/dzień, 35h/tydzień) i zakaz nadgodzin (`_oznMaSkrocenieCzasuPracy`, `canEmployeeHaveOvertime` — Config.gs/GrafikGeneratorService.gs). `Lekki` NIE ma skróconej normy, ale (wg Podstaw prawnych) też ma zakaz nadgodzin. |
| `Status_Autoryzacji` | `OczekujeNaPIN` / `PodajePIN` / `Autoryzowany` / `Zablokowany` | Maszyna stanów rejestracji Telegram. Sterowana przez `AuthService.gs` (`registerNewEmployee`, `setAwaitingPinStatus`, `authorizeUserWithPin`). Tylko `Autoryzowany` ma dostęp do funkcji Mini App/bota. |
| `Staz_Pracy_Lata` | liczba (łącznie ze stażem z edukacją, Art. 155 KP) | Wejście dla `calculateSumaUrlopow()` (AvailabilityService.gs) - nadal wpisywane ręcznie, ale teraz automatycznie PRZELICZA `Suma_Urlopów` (patrz niżej) przy każdej zmianie, jeśli zainstalowano trigger `onEditPracownicy()` (`zainstalujAutomatycznePrzeliczanieSumyUrlopow()`, NarzedziaSerwisowe.gs). |
| `Licz_błędy` | liczba, domyślnie 3, maleje do 0 | Licznik pozostałych prób wpisania PIN. Po osiągnięciu 0 → `Status_Autoryzacji` = `Zablokowany` (`authorizeUserWithPin`). |
| `PIN` | 6-cyfrowy kod (tekst) lub puste | Jednorazowy PIN rejestracyjny (`generateRegistrationPin`), czyszczony po udanej autoryzacji. |
| `Suma_Urlopów` | liczba dni (np. 20, 26, 30) | 20/26 wg stażu (Art. 154 §1 KP, próg 10 lat) + 10 dodatkowych dla OzN Umiarkowany/Znaczny (Art. 19 ust. 1 ustawy o rehabilitacji, Klucz `DODATKOWY_URLOP_OZN` w Podstawy prawne). Od 2026-09-22 przeliczana AUTOMATYCZNIE przez `calculateSumaUrlopow()` (AvailabilityService.gs) - przy zmianie `Stopien_OZN`/`Staz_Pracy_Lata` (trigger `onEditPracownicy`) albo ręcznie z menu (`przeliczSumeUrlopowWszystkichPracownikow()`). Nadal można wpisać wartość ręcznie - kolejna automatyczna zmiana `Stopien_OZN`/`Staz_Pracy_Lata` ją nadpisze. |

---

## Grafik

Jeden wiersz = jeden zaplanowany dzień jednego pracownika. Generowany automatycznie przez `generateGrafikForPeriod()` (GrafikGeneratorService.gs), czyszczony i odtwarzany dla danego zakresu dat przy każdej generacji (idempotentnie).

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `ID_Grafiku` | UUID (np. `GRF-...`) | Klucz wiersza. |
| `ID_Pracownika` | `EMP-NNN` | Odniesienie do zakładki Pracownicy. |
| `Data` | `YYYY-MM-DD` | Dzień, którego dotyczy wpis. Brak wiersza dla danego dnia = firma tego dnia nie pracuje (żeby nie mylić przypomnień o starcie). |
| `Planowany_Start` | `HH:mm` lub puste | Godzina rozpoczęcia wg grafiku; puste przy `Typ_Dnia` ≠ `Praca`. |
| `Planowany_Stop` | `HH:mm` lub puste | Godzina zakończenia wg grafiku; puste przy `Typ_Dnia` ≠ `Praca`. Skracana proporcjonalnie do `Wymiar_Etatu`/OzN wg `_applyDailyNormLimit()` (GrafikGeneratorService.gs). |
| `Typ_Dnia` | `Praca` / `Wolne` / `Urlop` / `Chorobowe` | `Wolne` = zgłoszona dyspozycyjność pracownika, albo wyczerpany tygodniowy limit godzin (etat/OzN). `Urlop`/`Chorobowe` (od 2026-09-22, `_getApprovedLeaveMap()`) = zatwierdzony wniosek (`Wnioski!Status_Akceptacji=Zatwierdzony`) obejmujący ten dzień - `e-ZLA` → `Chorobowe`, każdy inny zatwierdzony typ (w tym `Urlop na żądanie`) → `Urlop`. Używane też przez `checkMissingStartLogs()` (Reminders.gs, tylko gdy `Planowany_Start` niepuste) i PDF grafiku (pokazuje "(Urlop)"/"(Chorobowe)" przy nazwisku). |

---

## Ewidencja

Jeden wiersz = jeden dzień pracy danego pracownika (rzeczywisty, nie planowany). START/STOP wypełnia pracownik; Nadgodziny/Przepracowane wypełnia pracodawca przy zatwierdzaniu.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `ID_Logu` | UUID (np. `LOG-...`) | Klucz wiersza. |
| `ID_Pracownika` | `EMP-NNN` | Odniesienie do Pracownicy. |
| `Data` | `YYYY-MM-DD` | Dzień pracy. |
| `Czas_Start` | `HH:mm:ss` | Zapisywany przy kliknięciu START (Telegram/Mini App) — `registerTimeEvent()` (TimeTrackerService.gs). |
| `Czas_Stop` | `HH:mm:ss` lub puste | Puste = pracownik nadal "w trakcie pracy" (`getEmployeeStatus`). Wypełniane przy STOP. |
| `Nadgodziny` | `TAK` / `NIE` (puste dopóki niezatwierdzone) | Ustawiane WYŁĄCZNIE przez pracodawcę w `approveAttendanceDay()` (AttendanceService.gs). `TAK` wymaga `canEmployeeHaveOvertime()` = true. |
| `Przepracowane` | `H:mm` (puste dopóki niezatwierdzone) | Wynik zatwierdzenia: `Nadgodziny=NIE` → zawsze norma dobowa pracownika (8h lub 7h dla OzN), niezależnie od realnego Czas_Start/Czas_Stop; `Nadgodziny=TAK` → dokładny faktyczny czas. Dopóki puste, dzień "czeka na zatwierdzenie" (widoczny w Panelu Pracodawcy). |

---

## Wnioski

**Od 2026-09-22:** zapisywanie wniosków (Telegram `/korekta`, formularz Mini App) nadal obsługuje tylko `Korekta START`, ale ODCZYT jest teraz podłączony do generatora Grafiku - patrz `Status_Akceptacji` niżej. Zmiana statusu jest WCIĄŻ wyłącznie ręczna (edycja komórki w arkuszu), tylko jej SKUTEK jest teraz częściowo automatyczny.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `ID_Wniosku` | UUID (np. `WN-...`) | Klucz wiersza. |
| `ID_Pracownika` | `EMP-NNN` | Odniesienie do Pracownicy. |
| `Typ_Wniosku` | w schemacie: `Urlop Wypoczynkowy` / `Urlop na żądanie` / `Urlop OzN` / `Turnus Rehabilitacyjny` / `e-ZLA` / `Korekta START`; w kodzie zapisywane automatycznie tylko `Korekta START` (inne typy wpisuje się ręcznie w arkuszu) | Rodzaj zgłoszenia. `_getApprovedLeaveMap()` (GrafikGeneratorService.gs) czyta WSZYSTKIE typy oprócz `Korekta START` - `e-ZLA` → dzień `Chorobowe`, każdy inny (w tym `Urlop na żądanie`) → dzień `Urlop`. `Urlop na żądanie` (Art. 167(2) KP) ma DODATKOWO efekt: zatwierdzenie automatycznie przebudowuje grafik tego tygodnia (`onEditWnioski()`, jeśli zainstalowano trigger). |
| `Data_Od` | `YYYY-MM-DD` | Data której dotyczy korekta/wniosek. |
| `Data_Do` | `YYYY-MM-DD` | Przy korekcie START zwykle taka sama jak Data_Od. |
| `Status_Akceptacji` | `Oczekuje` / `Zatwierdzony` / `Odrzucony` | Zapisywane zawsze jako `Oczekuje` przy zgłoszeniu; zmiana statusu jest wyłącznie ręczna. **Tylko `Zatwierdzony`** ma efekt w Grafiku (patrz `Typ_Wniosku` wyżej) - `Oczekuje`/`Odrzucony` są ignorowane przez generator, niezależnie od tego, czy zmiana nastąpiła przed czy po już wygenerowanym grafiku. |
| `Plik_GDrive_URL` | URL lub puste | Miejsce na link do skanu/orzeczenia — nieużywane automatycznie przez kod (pole do ręcznego wypełnienia). |
| `Uwagi` | tekst | Szczegóły zgłoszenia (np. treść korekty, godzina zgłoszona przez pracownika). |

---

## Dyspozycyjność

Zgłoszenia dni wolnych pracownika na dany miesiąc, uwzględniane przy generowaniu Grafiku.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `ID_Dyspozycji` | np. `DYSP-001` | Klucz wiersza. |
| `ID_Pracownika` | `EMP-NNN` | Odniesienie do Pracownicy. |
| `Miesiac` | `YYYY-MM` | Miesiąc, którego dotyczy zgłoszenie. Zgłaszalny tylko w oknie czasowym — patrz `isMonthSelectable()`, `AVAILABILITY_CUTOFF_DAYS = 15` (AvailabilityService.gs). |
| `Dni_Wolne` | lista numerów dni po przecinku, np. `"5,12,19,26"` (wymuszony format tekstowy `@`) | Dni miesiąca zgłoszone jako wolne przez pracownika. Limit liczby dni wyliczany przez `getAvailabilityLimit()` (zależny od `Wymiar_Etatu` i `Stopien_OZN`). Odczyt/zapis: `getEmployeeAvailability()`/`saveEmployeeAvailability()`. Używane przez generator Grafiku do oznaczenia dnia jako `Wolne`. |
| `Data_Aktualizacji` | `YYYY-MM-DD` | Data ostatniego zapisu/edycji zgłoszenia. |

---

## Dni wolne

Dwie niezależne mini-tabele obok siebie w tej samej zakładce.

### Blok "Ustawowe" (kolumny A-C)

Generowany automatycznie dla 3 lat (poprzedni/obecny/kolejny) przez `refreshDniWolneSheet()` (AvailabilityService.gs) — **nadpisywany przy każdym odświeżeniu, nie edytować ręcznie**.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `Data` | `YYYY-MM-DD` | Data święta ustawowego, wyliczana matematycznie (`getPolishHolidaysWithNames`, w tym ruchome: Wielkanoc przez algorytm Gaussa, Poniedziałek Wielkanocny, Zielone Świątki +49 dni, Boże Ciało +60 dni). |
| `Nazwa` | nazwa święta (np. "Boże Narodzenie (1. dz.)") | Informacyjne, widoczne w PDF grafiku. |
| `Rodzaj` | zawsze `Ustawowe` | Stały tekst. |

### Blok "Własne" (kolumny E-G, drugi startColumn=5)

Wpisywany ręcznie przez pracodawcę (lokalne święto, dodatkowy dzień zamknięcia) — odświeżanie automatyczne nigdy tego nie rusza.

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `Data2` | `YYYY-MM-DD` | Data dodatkowego dnia wolnego. |
| `Nazwa2` | tekst | Opis (np. "Wigilia (dodatkowy dzień wolny sklepu)"). |
| `Rodzaj2` | zawsze `Dodatkowe` | Stały tekst. |

Oba bloki razem tworzą pełen zbiór dni wolnych firmy: `getCompanyDaysOffSet()` (AvailabilityService.gs) łączy je i przekazuje do generatora Grafiku oraz generatora PDF. Może też być synchronizowane z Google Wizytówką (`pushDaysOffToGoogleBusinessProfile`/`pullDaysOffFromGoogleBusinessProfile`, BusinessProfileService.gs).

---

## Podstawy prawne

Cztery samodzielne, tytułowane mini-tabele w układzie 2×2 (nie jedna płaska tabela). Odczytywane generycznie przez `_scanPodstawyPrawneBlocks()` (Config.gs) — szuka nagłówka "Klucz" gdziekolwiek w arkuszu, więc pozycja bloku nie ma znaczenia.

Wspólne kolumny każdego bloku:

| Kolumna | Możliwe wartości | Opis / powiązania |
|---|---|---|
| `Zagadnienie` | tekst | Nazwa normy/uprawnienia (np. "Norma dobowa"). |
| `Wartość` | liczba, albo tekst dwuwariantowy (np. `"20/26"`, `"100/50"`), albo `TAK` | Sama wartość liczbowa/logiczna — wymuszony format tekstowy w kolumnie, żeby Arkusze nie próbowały jej sparsować jako datę. Odczyt liczbowy po `Klucz`: `getPodstawaPrawnaNumber(klucz)`. |
| `Podstawa prawna` | odniesienie do artykułu ustawy (np. "Art. 129 §1 KP") | Informacyjne, źródło prawne. |
| `Klucz` | np. `NORMA_DOBOWA_ETAT`, `NORMA_DOBOWA_OZN`, `NORMA_TYGODNIOWA_OZN`, `NORMA_TYGODNIOWA_ETAT`, `LIMIT_TYGODNIOWY_Z_NADGODZINAMI`, `DODATKOWY_URLOP_OZN`, lub puste | Tylko wiersze bezpośrednio używane przez kod mają wypełniony Klucz — to one nadpisują wartości domyślne/ustawieniowe w Config.gs (`getNormaEtatUop`, `getNormaOznUop`, `getNormaOznTygodniowa`, `getNormaTygodniowaEtat`, `getWeeklyOvertimeCap`) i AvailabilityService.gs (`getDodatkowyUrlopOznDni`). Wiersze bez Klucza są czysto informacyjne (w tym dwuwariantowe, np. "Wymiar urlopu" = `"20/26"` - nie da się z nich odczytać jednej liczby, patrz `getPodstawaPrawnaNumber()`). |
| `Jednostka` | tekst (np. "godzin/dobę") | Jednostka miary + dodatkowe warunki. |
| `Uwagi` | tekst | Dodatkowy opis/wyjątki. |

Bloki:
1. **Czas pracy (pełny etat)** — norma dobowa/tygodniowa, odpoczynek dobowy/tygodniowy, przerwa w pracy.
2. **Nadgodziny** — tygodniowy limit z nadgodzinami, roczny limit, dodatek za nadgodziny (100/50%).
3. **Urlop wypoczynkowy** — wymiar urlopu (20/26 dni), przelicznik dnia urlopu, ekwiwalent za niewykorzystany urlop.
4. **Pracownicy z niepełnosprawnością (OzN)** — normy dobowe/tygodniowe wg stopnia, zakaz nadgodzin i pracy nocnej, dodatkowa przerwa, dodatkowy urlop, zwolnienie na turnus rehabilitacyjny.

Poza tabelą, w wierszu 1 (kolumny I-N) znajduje się panel dwóch checkboxów-przycisków: "🔄 Sprawdź aktualizację ustaw" (`sprawdzAktualizacjePodstawPrawnych`, deterministyczne, przez api.sejm.gov.pl) i "🔍 Sugestie AI (Groq)" (`sprawdzNowelizacjeZAI`, doradcze, nic nie nadpisuje). Zainstalowane przez `zainstalujPrzyciskiPodstawPrawnych()` (NarzedziaSerwisowe.gs), obsługiwane triggerem `onEditPodstawyPrawne` (PodstawyPrawneService.gs). AI **nigdy** nie nadpisuje wartości liczbowych w tej zakładce — patrz uzasadnienie w CLAUDE.md.
