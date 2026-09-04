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

## Zasady kodu:
- Kod serwerowy pisz w `.js` (GAS traktuje je jak `.gs`).
- Pliki widoku twórz w `.html`.