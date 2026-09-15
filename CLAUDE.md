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
bo to skrypt standalone, nie przypięty) — patrz `migrationInitialSetup()` i
`migrationSetWebhookUrls()` w `Diagnostics.gs`. Stary projekt jest martwy,
zostawiony bez zmian.

## Google People API (logo w Mini App) - ograniczenie clasp

`clasp push` **zawsze usuwa** deklarację `enabledAdvancedServices` (People API)
z manifestu na serwerze, nawet jeśli `appsscript.json` w repo ją zawiera —
próba wgrania jej wprost kończy się błędem `Service not found: people v1`. To
ograniczenie clasp, nie Google (przez UI edytora działa bez problemu).

**Po KAŻDYM `clasp push` do tego projektu** trzeba ręcznie dodać usługę w
edytorze Apps Script: **Usługi → + → Google People API (wersja v1,
identyfikator `People`) → Dodaj**. Bez tego logo w Mini App (i funkcje
`getGoogleAccountPhotoUrl`/`debugGoogleAccountPhoto`) rzucają
`ReferenceError: People is not defined`. `appsscript.json` w repo celowo
zawiera pełną deklarację (dokumentuje docelowy stan), mimo że push i tak ją
zignoruje/usunie.

## Zasady kodu:
- Kod serwerowy pisz w `.js` (GAS traktuje je jak `.gs`).
- Pliki widoku twórz w `.html`.