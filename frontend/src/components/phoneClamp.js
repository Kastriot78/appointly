import { parsePhoneNumber, validatePhoneNumberLength } from "libphonenumber-js";

/**
 * Kosovo metadata allows up to 12 "possible" NSN digits, so the stock input can
 * still accept junk like +383452569711111. This clamps to a parseable number that
 * is either valid, incomplete (still typing), or at worst an 8-digit invalid
 * pattern — and strips an erroneous national trunk "0" after the country code.
 *
 * @param {string} value - E.164-ish string from react-phone-number-input
 * @param {import('libphonenumber-js').CountryCode} defaultCountry
 */
export function clampPhoneNumber(value, defaultCountry) {
  if (!value || value === "+") return value || "";

  let v = value;

  for (let guard = 0; guard < 24; guard += 1) {
    try {
      const phone = parsePhoneNumber(v, defaultCountry);
      if (!phone) return v;

      let nsn = String(phone.nationalNumber);
      const cc = phone.countryCallingCode;
      const country = phone.country || defaultCountry;

      if (nsn.startsWith("0") && nsn.length > 1) {
        v = `+${cc}${nsn.slice(1)}`;
        continue;
      }

      const lenCheck = validatePhoneNumberLength(nsn, country);
      if (lenCheck === "TOO_LONG") {
        v = trimLastNationalDigit(v);
        continue;
      }

      if (phone.isValid()) return v;

      if (!phone.isPossible()) return v;

      if (nsn.length >= 9) {
        v = trimLastNationalDigit(v);
        continue;
      }

      return v;
    } catch {
      return v;
    }
  }

  return v;
}

function trimLastNationalDigit(e164) {
  try {
    const phone = parsePhoneNumber(e164);
    const nsn = String(phone.nationalNumber);
    if (nsn.length <= 1) return e164;
    return `+${phone.countryCallingCode}${nsn.slice(0, -1)}`;
  } catch {
    return e164;
  }
}
