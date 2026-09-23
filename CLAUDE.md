# Zasady projektu GAS

## Instrukcje wdrożeniowe:
Po `clasp push --force` (lokalnie) tworzona jest nowa wersja wdrożenia:
   `clasp deploy -d "Wersja z Claude"`
Aktualizacja istniejącego wdrożenia: `clasp deploy -i <DEPLOYMENT_ID>`.

## Odświeżanie sekretu `CLASP_CREDS` (gdy CI zwraca `invalid_grant` / `invalid_rapt`)

Token OAuth w sekrecie `CLASP_CREDS` wygasa i Google odrzuca go błędem
`invalid_grant` / `reauth related error (invalid_rapt)`. To nie błąd kodu —
trzeba odświeżyć sesję i podmienić sekret na GitHubie.

1. Odśwież sesję lokalnie:
   ```bash
   clasp login
   ```
   Otworzy się przeglądarka → zaloguj się i zezwól (jeśli masz problemy: `clasp logout && clasp login`).
2. Wygeneruj świeży sekret (skrypt kopiuje surowy JSON `.clasprc.json` do schowka:
   ```powershell
   powershell scripts/refresh-clasp-secret.ps1
   ```
   (Tworzy też kopię w `%TEMP%\clasp-creds.json` — poza repozytorium.)
3. W GitHub: **Settings → Secrets and variables → Actions → `CLASP_CREDS` → Update** i wklej zawartość schowka (surowy JSON).
4. Uruchom ponownie workflow „Deploy to Google Apps Script".

Uwaga: `clasp login` domyślnie wymaga zgody w przeglądarce — na CI to nie zadziała, dlatego sekret odświeżamy lokalnie i wgrywamy do GitHub.

## Migracja projektu Apps Script (2026-09-15)

Oryginalny projekt (scriptId `11Fo1GRAaernfja_kv_OsG42gOIOnJszxsEnCWF6ipefS_2sxSmCBf0zx`) miał
trwale uszkodzoną autoryzację (Arkusze/UrlFetch/People rzucały "brak uprawnień"
mimo poprawnych scope'ów, bez ekranu zgody, nawet po `revoke` dostępu i zmianach
w Admin Console). Test na zupełnie nowym, pustym projekcie na tym samym koncie
zadziałał bez problemu, co potwierdziło że wina leży w konkretnym projekcie, nie
w koncie/organizacji. Rozwiązanie: przeniesiono cały kod do nowego, standalone
projektu (scriptId `1qRQLX_ljI23OK4-EFg6UYHCngRhvkHT212KH83IYPkluIMasMaYOth-i`,
`.clasp.json` już na niego wskazuje). Arkusz podpięty przez `SPREADSHEET_ID` w
Properties Service + zainstalowany trigger `onOpen` (zamiast zwykłego triggera,
bo to skrypt standalone, nie przypięty) — patrz `podlaczArkuszIZainstalujMenu()` i
`ustawAdresyWebhookaPoMigracji()` w `NarzedziaSerwisowe.gs`. Stary projekt jest
martwy, zostawiony bez zmian.

## Nazewnictwo funkcji

Cały kod (nazwy funkcji, zmiennych) jest po angielsku - **oprócz**
`NarzedziaSerwisowe.gs`, gdzie funkcje mają celowo polskie nazwy
(`sprawdzWszystkieUprawnienia`, `zainstalujAutomatyczneGenerowanieGrafiku`
itd.) - to plik uruchamiany ręcznie z edytora, ma być zrozumiały od razu bez
tłumaczenia.

## Logo w Mini App

Logo pochodzi z Ustawienia!logo (ręczny link, ma pierwszeństwo) albo
automatycznie ze zdjęcia profilowego BOTA Telegram (`getTelegramBotPhotoDataUri`
w TelegramBotTools.gs - pobrane i zakodowane base64 po stronie serwera, token
bota nigdy nie trafia do klienta). Świadomie NIE używamy do tego Google People
API: `clasp push` zawsze usuwał deklarację `enabledAdvancedServices` z
manifestu na serwerze (błąd `Service not found: people v1` przy próbie wgrania
jej wprost - ograniczenie samego clasp), co bez końca psuło logo po każdym
pushu. Telegram Bot API nie ma tego problemu i nie wymaga żadnych dodatkowych
uprawnień Google.

## Zasady kodu:
- Kod serwerowy pisz w `.js` (GAS traktuje je jak `.gs`).
- Pliki widoku twórz w `.html`.

## Źródła prawne (docs/prawo/, 2026-09-16)

Zakładka "Podstawy prawne" (schemat w `DatabaseSetup.gs`) zawiera dane
sprawdzone bezpośrednio w oficjalnych tekstach jednolitych, pobranych przez
`api.sejm.gov.pl` (ten sam system co ISAP, ale bez CAPTCHA na pobieranie PDF):
- `docs/prawo/Kodeks_pracy_Dz.U.2025.277_tekst_jednolity.pdf` (Dz.U. 2025 poz. 277,
  obwieszczenie z 14.02.2025 r.) — normy czasu pracy, nadgodziny, urlopy (Art. 129-172 KP).
- `docs/prawo/Ustawa_o_rehabilitacji_zawodowej_Dz.U.2025.913_tekst_jednolity.pdf`
  (Dz.U. 2025 poz. 913, obwieszczenie z 26.06.2025 r.) — czas pracy i uprawnienia
  OzN (Art. 15-20), w tym norma 7h/35h dla stopnia znacznego/umiarkowanego.

To snapshoty na dzień pobrania - obie ustawy bywają nowelizowane (widoczne były
już nowsze nowelizacje Kodeksu pracy z 2025/2026, nieuwzględnione jeszcze w
tekście jednolitym z lutego 2025), więc wartości w zakładce warto od czasu do
czasu ręcznie zweryfikować na isap.sejm.gov.pl.

## Przebudowa "Podstawy prawne" + automatyczne sprawdzanie (2026-09-17)

Kolumny: `Wartość` jest teraz CELOWO samą liczbą (albo krótkim "20/26" przy
dwóch wariantach) - jednostka/warunki poszły do osobnej kolumny `Jednostka` i
do `Uwagi`. Usunięto `Wartość_liczbowa` (zbędna, skoro `Wartość` sama jest już
liczbą) - `getPodstawaPrawnaNumber()` w `Config.gs` czyta teraz `Wartość` po
dopasowaniu `Klucz`.

Nowy panel w wierszu 1 (kolumny I-N, obok nagłówków A-G): dwa checkboxy
działające jak przyciski - "🔄 Sprawdź aktualizację ustaw" (deterministyczne,
przez `api.sejm.gov.pl`, bez AI - patrz `sprawdzAktualizacjePodstawPrawnych()`
w `PodstawyPrawneService.gs`; jeśli znajdzie sygnały do sprawdzenia, ZAPISUJE
kopię PDF-u aktualnego tekstu jednolitego na Dysku, folder "Kadry - Podstawy
prawne (pobrane)") i "🔍 Sugestie AI (Groq)" (`sprawdzNowelizacjeZAI()`,
WYŁĄCZNIE doradcze - ocenia same urzędowe tytuły nowelizacji, niczego nie
zapisuje w tabeli). Instalacja przycisków: menu ⚙️ System Kadrowy → ⚖️ Podstawy
prawne → 🔘 Zainstaluj przyciski (uruchom RAZ, i ponownie po każdej przebudowie
tej zakładki - `buildSheetFromSchema()` czyści cały arkusz, więc kasuje też
I1:L1).

**Dlaczego AI tu NIE nadpisuje wartości** (pierwotny plan zakładał, że AI
czyta PDF i nadpisuje bezpośrednio - porzucone po testach na żywo 2026-09-17):
Gemini (`aistudio.google.com`) wymagał przedpłaty na koncie ("prepayment
credits are depleted"), żeby klucz API w ogóle odpowiadał, mimo że ten sam
klucz/model działał bez problemu w przeglądarkowym AI Studio Playground -
najwyraźniej REST API i Playground mają osobne pule limitów, a darmowy klucz
programistyczny w praktyce wymagał podpięcia karty. Użytkownik nie chciał
podawać karty, więc przerzucono się na Groq (`console.groq.com/keys`,
`Ustawienia!GROQ_API_KEY`, model `llama-3.3-70b-versatile` przez endpoint
kompatybilny z OpenAI) - realnie darmowy, bez karty (30 zapytań/min, 14 400/
dzień na poziomie organizacji). PROBLEM: Groq nie przyjmuje plików PDF
(inline) ani nie ma wbudowanego wyszukiwania w sieci jak Gemini
`google_search` - nie da się go więc "uziemić" w faktycznej treści ustawy.
Zamiast ryzykować, że model zgaduje konkretne liczby z pamięci treningowej i
nadpisuje dane bezpośrednio używane do wyliczania czasu pracy/wynagrodzeń,
`sprawdzNowelizacjeZAI()` dostaje tylko dobrze ugruntowany, wąski fakt (same
urzędowe tytuły nowelizacji, pobrane deterministycznie z `api.sejm.gov.pl`) i
zwraca zwykły tekst z podpowiedzią co sprawdzić - nigdy JSON, nigdy zapis do
komórek. Jeśli kiedyś pojawi się darmowe (bez przedpłaty) API z natywnym
wsparciem PDF + wyszukiwaniem, można wrócić do automatycznego nadpisywania.

Ważne, sprawdzone bezpośrednio w `api.sejm.gov.pl` przy budowie tej funkcji
(2026-09-17): tekst jednolity ustawy o rehabilitacji zawodowej, na którym
opiera się obecna tabela (Dz.U. 2025 poz. 913), ma tam status
`"wygaśnięcie aktu"` / `inForce: "NOT_IN_FORCE"` z `expirationDate: 2026-07-01`
- czyli już najprawdopodobniej istnieje nowszy tekst jednolity, którego ID nie
udało się w prosty sposób wyprowadzić z samego API. Kodeks pracy (Dz.U. 2025
poz. 277) wciąż formalnie obowiązuje, ale ma już 5 nowelizacji
nieuwzględnionych w tym tekście jednolitym. Warto uruchomić "🔄 Sprawdź
aktualizację ustaw" i ręcznie zweryfikować ustawę o rehabilitacji na
isap.sejm.gov.pl zanim ktoś zaufa normie 7h/35h dla OzN w tej tabeli.

## Siatka 2x2 w "Podstawy prawne" (2026-09-17)

Płaska tabela A-G (19 wierszy) była nieczytelna przy 90% zoomie, więc
`getDatabaseSchema()` w `DatabaseSetup.gs` ma teraz dla tej zakładki `blocks:
[...]` (4 samodzielne, tytułowane mini-tabele) zamiast płaskich
`headers`/`initialData` - osobna ścieżka budowania w `buildBlockGridSheet()`
(wywoływana z `buildSheetFromSchema()` gdy `config.blocks` istnieje) i osobna
ścieżka wstawiania danych w `insertSampleDataIntoActiveSheet()`. Układ:
lewa kolumna A-F = "Czas pracy" (wiersz 3) + "Nadgodziny" (wiersz 11, pod
spodem); prawa kolumna I-N = "Urlop wypoczynkowy" (wiersz 3) + "OzN" (wiersz
9); G-H to pusty odstęp. Wszystkie 4 tabele zaczynają się od wiersza 3 -
wiersz 1 w kolumnach I-N zostaje WYŁĄCZNIE dla panelu przycisków (patrz
sekcja wyżej), więc nic w tym się nie zmieniło i instalator przycisków
(`zainstalujPrzyciskiPodstawPrawnych()`) działa bez modyfikacji. Kolumna
"Kategoria" zniknęła - to teraz tytuł blocku (scalony kolorowy wiersz).
Ujednolicony nowy porządek nagłówków w KAŻDYM bloku: Zagadnienie / Wartość /
Podstawa prawna / Klucz / Jednostka / Uwagi - dopasowany do sztywnych
szerokości, które instalator przycisków wymusza na kolumnach I/J/K/L/N
(200/40/200/40/320) - stąd Klucz (najmniej istotne pole, sam kod) i Wartość
(krótkie liczby) trafiają na węższe kolumny, a Jednostka/Uwagi (długie opisy,
zawijane - `wrapColumns`) na szersze.

**Ważne przy dalszej edycji**: `getPodstawaPrawnaNumber()` (Config.gs) i
`_readPodstawyPrawneRows()` (PodstawyPrawneService.gs) czytają teraz przez
WSPÓLNY, generyczny skaner `_scanPodstawyPrawneBlocks()` (Config.gs) - szuka
nagłówka "Klucz" gdziekolwiek w arkuszu, a towarzyszące kolumny ("Wartość"
itd.) dopasowuje po TEKŚCIE nagłówka w tym samym wierszu, ograniczając się do
CIĄGŁEGO (nieprzerwanego pustą komórką) fragmentu tego wiersza wokół kolumny
Klucza - bez tego ograniczenia dwa bloki w tym samym wierszu (np. "Czas
pracy" i "Urlop wypoczynkowy", oba nagłówki w wierszu 4) łapały nawzajem swoje
kolumny (znalezione i poprawione na lokalnej symulacji w Node przed wgraniem
- `getPodstawaPrawnaNumber('NORMA_DOBOWA_ETAT')` wracało `null` mimo
poprawnych danych w arkuszu). Działa niezależnie od tego, ile bloków jest i
jak są rozmieszczone (w poziomie i/lub w pionie) - jeśli kiedyś dodasz kolejny
blok albo przesuniesz istniejący, NIE trzeba nic poprawiać w Config.gs.

## Przebudowa "Ustawienia" na pasma wierszy (2026-09-17/18)

Ten sam problem co w Podstawy prawne, ale gorszy: jeden wiersz z 22
kolumnami (`NAZWA_FIRMY`, `logo`, ... `KOLOR_TLO`) - przy 90% zoomie trzeba
było przewijać w prawo, żeby zobaczyć wszystko.

Pierwsza wersja tej przebudowy zamieniła układ na klucz-wartość w wierszach
([Nazwa ustawienia, Wartość, Opis] jako osobny wiersz na ustawienie) -
COFNIĘTE tego samego dnia: użytkownik pokazał zrzut ekranu swojego arkusza
(ręcznie już rozbitego na pasma kolumn) i poprosił wprost o UTRZYMANIE
oryginalnego układu kolumnowego (nagłówek = nazwa ustawienia, wartość pod
spodem), tylko w kilku wierszach-pasmach zamiast jednego. Wniosek na
przyszłość: nie zgadywać layoutu ze słownego opisu, gdy użytkownik ma już
żywy przykład w arkuszu - dopytać o zrzut ekranu / link zamiast realizować
description-only.

Finalny układ: `Ustawienia` w `getDatabaseSchema()` (DatabaseSetup.gs) ma
`blocks: [...]` - 7 tytułowanych pasm, jedno pod drugim (kolumny A-D,
maksymalnie 4 szerokości - nigdy więcej): 🏢 Firma, ⏱️ Normy godzin i
nadgodziny, 📅 Generator grafiku, 🔑 Integracje i klucze API, 🎨 Paleta
kolorów, 🗓️ Dni i godziny pracy, 👔 Pracodawcy (Telegram ID). Każdy blok ma
WŁASNY wiersz nagłówka (nazwy ustawień jak wcześniej) i wartość w wierszu
BEZPOŚREDNIO pod spodem (1 wiersz dla pojedynczych ustawień, 7 dla "dni
pracy"/"godziny pracy", dowolnie dla "PRACODAWCY_TELEGRAM_IDS") - DOKŁADNIE
ten sam mechanizm co w oryginalnym schemacie, tylko z kilkoma wierszami
nagłówkowymi zamiast jednego. Krótki opis każdego ustawienia (dawniej tylko
komentarz `//` w kodzie, niewidoczny w arkuszu) jest teraz notatką na komórce
nagłówka (`headerNotes` w `buildBlockGridSheet()`, DatabaseSetup.gs) - mały
czerwony trójkąt, treść po najechaniu, bez zajmowania dodatkowej kolumny. Ten
sam mechanizm `buildBlockGridSheet()`/`insertSampleDataIntoActiveSheet()`, co
dla Podstawy prawne - zero nowego kodu do budowania arkusza (poza obsługą
`headerNotes`, teraz dostępną dla wszystkich schematów blokowych).

**To NIE zmienia orientacji przechowywania danych** (nagłówek nadal = nazwa
ustawienia, jak od początku) - zmienia się tylko to, że nagłówek może leżeć w
DOWOLNYM wierszu, nie tylko w wierszu 1. Dotknięte funkcje odczytu/zapisu:
- `getSettingValue()`/`setSettingValue()` (Config.gs) - teraz przez
  `_findHeaderCell()`: szuka nagłówka o dokładnie takim tekście GDZIEKOLWIEK w
  arkuszu, wartość czyta/zapisuje w wierszu BEZPOŚREDNIO pod nim, w tej samej
  kolumnie.
- Stara `getSettingsColumnIndex()` (zakładała nagłówki wyłącznie w wierszu 1)
  ZOSTAŁA USUNIĘTA - `getWeeklyWorkingHours()`/`setWeeklyWorkingHours()`
  (Config.gs), `getEmployerTelegramIds()` (AuthService.gs) i
  `setEmployerTelegramIds()` (Setup.gs) używają tej samej `_findHeaderCell()`.

## Pracownicy: odczyt po nazwie nagłówka zamiast stałej pozycji (2026-09-22)

Znaleziony realny, żywy błąd: w arkuszu ręcznie dodano kolumnę
`Data_Zatrudnienia` (data zatrudnienia u tego pracodawcy, czysto
informacyjna) między `Imie_Nazwisko` a `Forma_Zatrudnienia`, bez zmiany kodu.
Kod czytał tę zakładkę wyłącznie po STAŁYCH indeksach tablicy
(`data[i][3]`, `sheet.getRange(row, 7)` itd., zgodnie z kolejnością w
`getDatabaseSchema()`), więc wstawienie kolumny po cichu przesunęło o 1
WSZYSTKIE odczyty za `Imie_Nazwisko` - autoryzacja PIN (`isUserAuthorized`,
`authorizeUserWithPin`, `setAwaitingPinStatus`, `registerNewEmployee` w
AuthService.gs), przeliczanie `Suma_Urlopów` (`przeliczSumeUrlopowWszystkichPracownikow`,
trigger `onEditPracownicy` w AvailabilityService.gs - miał wprost zahardkodowane
kolumny F/H/K), lista pracowników w Panelu Pracodawcy (AttendanceService.gs) i
generator Grafiku (`_getAllEmployeesWithChat`, GrafikGeneratorService.gs) -
wszystko zaczęło czytać jedną kolumnę za daleko.

Naprawione tym samym mechanizmem, co wcześniej dla Ustawienia/Podstawy prawne:
`getEmployeesColumnMap(sheet)` (Config.gs) czyta wiersz 1 i zwraca mapę
nazwa_nagłówka -> indeks kolumny; wszystkie powyższe miejsca używają teraz
`data[i][col['Nazwa_Kolumny']]` / `sheet.getRange(row, col['Nazwa'] + 1)`
zamiast liczb. `Data_Zatrudnienia` dodana oficjalnie do schematu
(`getDatabaseSchema()`) na tej samej pozycji, w której już żyje w arkuszu.
Kolejność kolumn w arkuszu może się teraz różnić od kolejności w schemacie
bez ryzyka - dopóki nazwy nagłówków się zgadzają, kod znajdzie właściwą
kolumnę niezależnie od pozycji. `Data_Zatrudnienia` jest WYŁĄCZNIE
informacyjna - `Suma_Urlopów` nadal liczy się z `Staz_Pracy_Lata` (łączny staż
ze WSZYSTKICH pracodawców + edukacja, Art. 155 KP), którego nie da się
wyprowadzić z samej daty zatrudnienia u tego jednego pracodawcy.

**Błąd znaleziony i poprawiony na lokalnej symulacji w Node przed wgraniem**:
`getWeeklyWorkingHours()`/`setWeeklyWorkingHours()` czytały wiersze od
nagłówka aż do `sheet.getLastRow()` (koniec CAŁEGO arkusza), używając
`days.forEach(...return...)` żeby zatrzymać się na pierwszym pustym dniu -
ale `return` w `forEach` tylko pomija JEDEN element, nie przerywa pętli. W
starym, płaskim schemacie to było niegroźne (nic nie było niżej w arkuszu).
W nowym układzie blokowym "dni pracy" ma pod sobą kolejny blok
("👔 Pracodawcy") W TEJ SAMEJ KOLUMNIE A - bez poprawki funkcja wciągała
tytuł blocku i numery Telegram ID jako fałszywe "dni tygodnia". Naprawione
zwykłą pętlą `for` z prawdziwym `break`. Ta sama zasada dotyczy
`setEmployerTelegramIds()` (Setup.gs) - jego `clearContent()` liczy zakres
"do końca arkusza", więc jest bezpieczne TYLKO dopóki "👔 Pracodawcy
(Telegram ID)" jest OSTATNIM blokiem w Ustawienia (ma o tym komentarz przy
kodzie) - gdyby ktoś dodał kolejny blok PONIŻEJ niego w kolumnie A, trzeba by
też jego odczyt przepisać na "stop na pierwszym pustym wierszu", tak jak
zrobiono dla dni pracy/godziny pracy.

## Ustawienia: 3 pasma bez tytułów (2026-09-22)

Użytkownik ręcznie przełożył 7 tytułowanych mini-tabel Ustawień (sekcja
wyżej) na 3 SZEROKIE pasma BEZ kolorowego wiersza tytułowego - wiersz
nagłówka od razu w wierszu 1/7/16, wartość bezpośrednio pod spodem, żeby
zmieścić wszystko bez przewijania w pionie. Kod dogoniony pod tę żywą wersję
(zweryfikowaną odczytem PLIKU przez Google Drive, nie tylko ze zrzutu ekranu
- zrzut ucinał kolumny poza K, więc realny układ trzeba było potwierdzić
inaczej niż "na oko"; użytkownik też ręcznie potwierdził, że
`NORMA_OZN_TYGODNIOWA_UOP` faktycznie zniknęła z arkusza, nie tylko z kadru).

`buildBlockGridSheet()`/`insertSampleDataIntoActiveSheet()` (DatabaseSetup.gs)
dostały nową flagę blocku `noTitle: true` - pomija scalony kolorowy wiersz
tytułowy, `headerRow` = `startRow` zamiast `startRow + 1`, dane zaczynają się
`startRow + 1` zamiast `+ 2`. Domyślne zachowanie (z tytułem) zostało bez
zmian - używa go nadal "Podstawy prawne" (siatka 2x2, patrz sekcja wyżej).
Nowy schemat Ustawień (`getDatabaseSchema()`) ma 3 takie bloki:
- Pasmo 1 (wiersz 1, kolumny A-J): NAZWA_FIRMY, logo, NORMA_ETAT_UOP,
  NORMA_OZN_UOP, MIESIAC_GRAFIKU, WEBHOOK_URL, PRACODAWCY_TELEGRAM_IDS,
  GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID, APPS_SCRIPT_EDITOR_URL.
- Pasmo 2 (wiersz 7, kolumny A-I): dni pracy / godziny pracy (7 wierszy) +
  NADGODZINY, DNI_GRAFIKU, OSTATNI_DZIEN_GRAFIKU i 4 kolory palety -
  jednowartościowe, wypełnione tylko w pierwszym z 7 wierszy danych.
- Pasmo 3 (wiersz 16, kolumny A-E, kolumna C celowo pusta jako odstęp):
  GEMINI_API_KEY, GROQ_API_KEY, BACKUP_CO_DNI, DYSPOZYCYJNOSC.

**Dwie rzeczywiste zmiany w zestawie ustawień, nie tylko układ**:
- Zniknęła kolumna `NORMA_OZN_TYGODNIOWA_UOP` (ręczny override tygodniowej
  normy OzN) - bezpiecznie, bo `getNormaOznTygodniowa()` (Config.gs) i tak ma
  wyższy priorytet dla "Podstawy prawne" (Klucz `NORMA_TYGODNIOWA_OZN`,
  wypełniony) i dopiero potem Ustawienia -> `_findHeaderCell()` po prostu nie
  znajduje nagłówka i funkcja spada na wartość z Podstaw prawnych/domyślną
  35, bez błędu. Użytkownik potwierdził, że faktyczna tygodniowa norma OzN
  liczy się i tak z `Pracownicy!Stopien_OZN` + `Wymiar_Etatu` +
  `Podstawy prawne!NORMA_TYGODNIOWA_OZN`, więc ręczne pole w Ustawieniach
  było zbędnym duplikatem.
- Doszła kolumna `GEMINI_API_KEY` - MARTWA, nieużywana przez żaden kod
  (pozostałość po porzuconej integracji z Gemini, patrz sekcja "Przebudowa
  Podstawy prawne..." wyżej) - zostawiona w schemacie jako pole w arkuszu,
  świadomie bez odczytu w kodzie.

**Prawdziwy bug znaleziony i naprawiony przy tej przebudowie** (nie tylko
kosmetyka): `setEmployerTelegramIds()` (Setup.gs) czyściło listę ID
pracodawców przez `clearContent()` na zakresie "od nagłówka do
`sheet.getLastRow()`" - bezpieczne w STARYM układzie, bo "👔 Pracodawcy" był
tam ostatnim blokiem w kolumnie A. W NOWYM układzie `PRACODAWCY_TELEGRAM_IDS`
siedzi w kolumnie G Pasma 1, a kolumna G Pasma 2 (kilka wierszy niżej) to
`KOLOR_PRACA` - bez poprawki `clearContent()` kasowałoby też nagłówek i
wartość `KOLOR_PRACA` przy każdym dopisaniu nowego ID pracodawcy. Naprawione
tym samym mechanizmem co `getWeeklyWorkingHours()` - pętla `for` z `break` na
pierwszym pustym wierszu zamiast czyszczenia "do końca arkusza". Zweryfikowane
lokalną symulacją w Node (bez GAS) przed wgraniem.