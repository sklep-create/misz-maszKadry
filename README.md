# Misz-MaszKadry - System Zarządzania Kadrą i Ewidencją Czasu Pracy

System do zarządzania pracownikami, rejestracji czasu pracy i zarządzania wnioskami urlopowymi za pomocą:
- **Bota Telegram** - interfejs dla pracowników (START/STOP, wnioski)
- **Google Sheets** - baza danych i raportowanie
- **Google Apps Script** - backend i logika biznesowa

## 🚀 Szybki Start

### 1. Setup w Google Sheets
```
1. Otwórz Google Sheets
2. Przejdź do: Extensions → Apps Script
3. Skopiuj wszystkie pliki z folderu src/
4. ⚙️ System Kadrowy → 🚀 Wygeneruj bazę danych
```

### 2. Konfiguracja bezpieczeństwa
```
1. ⚙️ System Kadrowy → 🔐 Inicjalizuj sekretne dane
2. Wklej token bota Telegram
3. ⚙️ System Kadrowy → 📡 Ustaw Deployment ID dla Webhook'a
4. Wklej link do wdrożenia Apps Script
5. Kliknij „Tak" na pytanie *Czy chcesz teraz skonfigurować webhook Telegrama?*
   (webhook można też skonfigurować później: ⚙️ System Kadrowy → 🔗 Skonfiguruj Telegram Webhook)
```

### 3. Synchronizacja z GitHub (opcjonalne)

#### Instalacja CLASP:
```bash
# 1. Zainstaluj Node.js ze strony nodejs.org
# 2. Zainstaluj clasp
npm install -g @google/clasp

# 3. Login do Google
clasp login

# 4. Clone projektu z Apps Script (z Script ID)
clasp clone YOUR_SCRIPT_ID

# 5. Po zmianach w kodzie - push do Apps Script
clasp push
```

#### Automatyczny Deploy (GitHub Actions):
1. Zaloguj `clasp` lokalnie:
   ```bash
   clasp login
   ```
   Jeśli używasz własnego klienta OAuth, najpierw wykonaj pełne logowanie, np.:
   ```bash
   clasp login --creds client_secret.json
   ```
2. Dodaj do GitHub Secrets:
   - `CLASP_CREDS` - pełną zawartość zalogowanego pliku `.clasprc.json` wygenerowanego po `clasp login` (surowy JSON albo base64)
   - nie wklejaj samego pliku `client_secret.json` / konfiguracji OAuth — to nie wystarczy do deployu w CI
   - `TELEGRAM_TOKEN` (opcjonalnie) - token bota Telegram; jeśli go dodasz, webhook będzie konfigurowany **automatycznie po każdym deployu**
3. Push do `main` → automatyczny deploy na Apps Script

## 📁 Struktura Plików

```
misz-maszKadry/
├── src/                          # Pliki Apps Script
│   ├── Config.gs                # Konfiguracja (token, URLs)
│   ├── AuthService.gs           # Autoryzacja użytkowników
│   ├── TimeTrackerService.gs    # Rejestracja czasu pracy
│   ├── TelegramBot.gs           # Obsługa wiadomości z Telegram
│   ├── Setup.gs                 # Menu i setup bazy danych
│   ├── DatabaseSetup.gs         # Generator struktur tabel
│   ├── Reminders.gs             # Automatyczne przypomnienia
│   ├── ApiWindows.gs            # Endpoint HTTP dla Dashboardu
│   ├── LeaveApprovalService.gs  # [TODO] Workflow akceptacji urlopów
│   └── appsscript.json          # Manifest Apps Script
├── .clasp.json                   # Konfiguracja CLASP
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions deployment
├── .gitignore
└── README.md
```

## 🔧 Dostępne Menu

**⚙️ System Kadrowy:**
- 🔐 Inicjalizuj sekretne dane (PIERWSZE URUCHOMIENIE)
- 🔍 Status konfiguracji
- 🚀 Wygeneruj bazę danych (Pierwsze uruchomienie)
- 🔗 Skonfiguruj Telegram Webhook
- 🔔 Uruchom sprawdzanie braku START

## 📊 Baza Danych

### Tabele w Google Sheets:
- **Ustawienia** - PIN, normy pracy, konfiguracja
- **Pracownicy** - Lista pracowników, ChatID, forma zatrudnienia
- **Grafik** - Planowany czas pracy
- **Ewidencja** - Faktyczne START/STOP
- **Wnioski** - Urlopy, korekty, e-ZLA

## 🤖 Telegram Bot

Pracownik wysyła do bota:
- `/pin [KOD]` - Autoryzacja
- `▶️ START` - Początek pracy
- `⏹️ STOP` - Koniec pracy
- `✏️ Zgłoś Korektę` - Wniosek o korektę czasu
- `📅 Swój Grafik` - Wyświetlenie grafiku

## 🔐 Bezpieczeństwo

✅ Token Telegrama przechowywany w **Properties Service** (nie w kodzie)
✅ Webhook URL przechowywany w **Properties Service** (nie w kodzie)
✅ PIN autoryzacji w Google Sheets
✅ Brak danych wrażliwych w repozytorium

## 📋 Todo

- [ ] 📊 Dashboard React - aplikacja webowa dla pracodawcy
- [ ] 📝 Workflow akceptacji urlopów - zatwierdzanie wniosków
- [ ] 📧 Powiadomienia email dla pracodawcy
- [ ] 📱 Aplikacja mobilna

## 📄 Licencja

MIT License - Copyright (c) 2026 sklep-create
