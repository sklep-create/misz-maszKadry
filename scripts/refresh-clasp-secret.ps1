# Przygotowanie sekretu CLASP_CREDS dla GitHub Actions (Windows / PowerShell 5.1)
# Użycie:
#   1. clasp login                 # odśwież sesję OAuth (otworzy przeglądarkę)
#   2. powershell refresh-clasp-secret.ps1
# Skrypt skopiuje surowy JSON z C:\Users\<Ty>\.clasprc.json do schowka
# oraz zapisze kopię do clasp-creds.json.
# Wklej to w GitHub:
#   Settings -> Secrets and variables -> Actions -> CLASP_CREDS
# Uwaga: workflow deploy.yml przyjmuje sekret jako SUROWY JSON (JSON.parse).
#         W związku z tym NIE kodujemy base64 - wklejamy po prostu JSON.

$ErrorActionPreference = 'Stop'
$credPath = Join-Path $env:USERPROFILE '.clasprc.json'

if (-not (Test-Path $credPath)) {
    Write-Host "Nie znaleziono: $credPath" -ForegroundColor Red
    Write-Host 'Najpierw wykonaj: clasp login'
    exit 1
}

$raw = Get-Content -Raw -Path $credPath

# Walidacja czy to poprawny JSON
try {
    $null = $raw | ConvertFrom-Json
} catch {
    Write-Host 'Plik nie jest poprawnym JSON. Wygeneruj go ponownie: clasp login' -ForegroundColor Red
    exit 1
}

# Zapisz kopię w katalogu tymczasowym (NIE w repo - żeby sekret nie wyciekł do git)
$outFile = Join-Path $env:TEMP 'clasp-creds.json'
$raw | Set-Content -Path $outFile -Encoding UTF8

# Skopiuj surowy JSON do schowka
$raw | Set-Clipboard

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host 'Gotowe!'
Write-Host "Kopia sekretu        : $outFile"
Write-Host 'Surowy JSON .clasprc.json skopiowany do schowka.'
Write-Host ''
Write-Host 'Wklej go w GitHub:'
Write-Host '  Settings -> Secrets and variables -> Actions -> CLASP_CREDS -> Update'
Write-Host '  (wklej SUROWY JSON, np. zaczynający sie od {"tokens": ...})'
Write-Host ''
Write-Host 'Po wgraniu sekretu uruchom ponownie workflow "Deploy to Google Apps Script".'
Write-Host '==================================================' -ForegroundColor Cyan