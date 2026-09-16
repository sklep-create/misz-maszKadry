/**
 * Spójna paleta 4 kolorów całego projektu (PDF grafiku + Mini App),
 * wyliczana z jednego koloru bazowego (Ustawienia!KOLOR_MARKA):
 *   KOLOR_MARKA - wpisywany ręcznie (marka firmy, akcent w Mini App, baner PDF)
 *   KOLOR_PRACA - wyliczany, triada +120° (sukces/praca, przycisk START)
 *   KOLOR_UWAGA - wyliczany, triada +240° (uwaga/święto, przycisk STOP)
 *   KOLOR_TLO   - wyliczany, ten sam odcień co MARKA, mocno rozjaśniony/odbarwiony
 * Priorytet: harmonia wizualna (rotacja odcienia HSL, stałe nasycenie/jasność
 * między MARKA/PRACA/UWAGA), nie dosłowne znaczenie kolorów.
 */

const DEFAULT_THEME_COLORS = {
  MARKA: '#2EA6FF',
  PRACA: '#31C46C',
  UWAGA: '#FF5A5F',
  TLO: '#F2F2F2'
};

/**
 * Wylicza KOLOR_PRACA / KOLOR_UWAGA / KOLOR_TLO z KOLOR_MARKA i zapisuje je
 * w arkuszu Ustawienia. Uruchamiane ręcznie z menu po zmianie koloru bazowego.
 */
function wygenerujPaletKolorow() {
  const ui = SpreadsheetApp.getUi();
  const raw = (getSettingValue('KOLOR_MARKA') || '').toString().trim();
  const hex = raw.startsWith('#') ? raw : '#' + raw;

  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    const msg = '❌ Ustawienia!KOLOR_MARKA musi być poprawnym kolorem hex, np. #2EA6FF.';
    try { ui.alert(msg); } catch (e) { /* brak UI */ }
    return msg;
  }

  const hsl = _hexToHsl(hex);
  const praca = _hslToHex(hsl.h + 120, hsl.s, hsl.l);
  const uwaga = _hslToHex(hsl.h + 240, Math.min(hsl.s + 10, 100), hsl.l);
  const tlo = _hslToHex(hsl.h, Math.max(hsl.s - 60, 5), 95);

  setSettingValue('KOLOR_MARKA', hex.toUpperCase());
  setSettingValue('KOLOR_PRACA', praca.toUpperCase());
  setSettingValue('KOLOR_UWAGA', uwaga.toUpperCase());
  setSettingValue('KOLOR_TLO', tlo.toUpperCase());

  const msg = '✅ Wygenerowano paletę z ' + hex.toUpperCase() + ':\n' +
    'Praca: ' + praca.toUpperCase() + '\n' +
    'Uwaga: ' + uwaga.toUpperCase() + '\n' +
    'Tło: ' + tlo.toUpperCase();
  Logger.log(msg);
  try { ui.alert(msg); } catch (e) { /* brak UI (np. wywołanie spoza edytora) */ }
  return msg;
}

/** Kolor z Ustawień dla danej roli (MARKA/PRACA/UWAGA/TLO), z bezpiecznym domyślnym. */
function getThemeColor(role) {
  const value = (getSettingValue('KOLOR_' + role) || '').toString().trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase();
  return DEFAULT_THEME_COLORS[role] || '#888888';
}

/** Cały motyw naraz - wygodne dla szablonów HTML (MiniApp, PDF). */
function getThemeColors() {
  return {
    marka: getThemeColor('MARKA'),
    praca: getThemeColor('PRACA'),
    uwaga: getThemeColor('UWAGA'),
    tlo: getThemeColor('TLO')
  };
}

/** Czarny albo biały tekst - który czytelniej wypadnie na danym tle. */
function getContrastingTextColor(hex) {
  const rgb = _hexToRgb(hex);
  if (!rgb) return '#000000';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

// --- Konwersje kolorów (HEX <-> RGB <-> HSL) ---

function _hexToRgb(hex) {
  const clean = (hex || '').toString().replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function _hexToHsl(hex) {
  const rgb = _hexToRgb(hex);
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return { h: h, s: s * 100, l: l * 100 };
}

function _hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = function (v) {
    const s = Math.round((v + m) * 255).toString(16);
    return s.length === 1 ? '0' + s : s;
  };

  return '#' + toHex(r) + toHex(g) + toHex(b);
}
