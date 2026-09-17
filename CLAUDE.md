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