/**
 * Weryfikuje initData z Telegram Mini App zgodnie ze specyfikacją Telegrama.
 * @param {string} initData Zakodowane dane Telegram Web App (query string).
 * @param {string} botToken Token bota Telegram.
 * @returns {{ok: boolean, error?: string, userId?: string, user?: Object}}
 */
function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    return { ok: false, error: "Invalid initData" };
  }

  try {
    const data = parseInitDataToObject(initData);
    const receivedHash = (data.hash || "").toLowerCase();

    if (!receivedHash) {
      return { ok: false, error: "Invalid initData" };
    }

    delete data.hash;

    const dataCheckString = Object.keys(data)
      .sort()
      .map(key => `${key}=${data[key]}`)
      .join("\n");

    const secretKey = Utilities.computeHmacSha256Signature(botToken, "WebAppData");
    const calculatedHash = bytesToHexString(
      Utilities.computeHmacSha256Signature(dataCheckString, secretKey)
    );

    if (calculatedHash !== receivedHash) {
      return { ok: false, error: "Invalid initData" };
    }

    let user = null;
    if (data.user) {
      user = JSON.parse(data.user);
    }

    if (!user || !user.id) {
      return { ok: false, error: "Invalid initData" };
    }

    return {
      ok: true,
      userId: user.id.toString(),
      user: user
    };
  } catch (err) {
    Logger.log("Błąd verifyTelegramInitData: " + err.toString());
    return { ok: false, error: "Invalid initData" };
  }
}

/**
 * Parsuje initData (query string) do obiektu.
 * @param {string} initData
 * @returns {Object}
 */
function parseInitDataToObject(initData) {
  const result = {};
  const pairs = initData.split("&");

  pairs.forEach(pair => {
    if (!pair) return;
    const separatorIndex = pair.indexOf("=");
    const key = separatorIndex >= 0 ? pair.substring(0, separatorIndex) : pair;
    const value = separatorIndex >= 0 ? pair.substring(separatorIndex + 1) : "";
    const decodedKey = decodeURIComponent(key.replace(/\+/g, "%20"));
    const decodedValue = decodeURIComponent(value.replace(/\+/g, "%20"));
    result[decodedKey] = decodedValue;
  });

  return result;
}

/**
 * Konwersja tablicy bajtów na zapis hex (małe litery).
 * @param {number[]} bytes
 * @returns {string}
 */
function bytesToHexString(bytes) {
  return bytes.map(byte => {
    const normalizedByte = (byte < 0) ? byte + 256 : byte;
    return ("0" + normalizedByte.toString(16)).slice(-2);
  }).join("");
}
