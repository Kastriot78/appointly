/**
 * Keep in sync with `backend/src/utils/currency.js` (allowed codes + defaults).
 */
const ALLOWED = new Set([
  "EUR",
  "USD",
  "CHF",
  "TRY",
  "GBP",
  "ALL",
  "MKD",
  "BGN",
  "RSD",
  "BAM",
  "PLN",
  "HUF",
  "SEK",
  "NOK",
  "DKK",
  "RON",
  "CZK",
  "AUD",
  "CAD",
  "JPY",
  "CNY",
  "INR",
]);

export function normalizeCurrency(c) {
  const u = String(c || "EUR")
    .trim()
    .toUpperCase();
  return ALLOWED.has(u) ? u : "EUR";
}

export function formatMoneyAmount(amount, currencyCode = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const code = normalizeCurrency(currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

/**
 * Compact display: omit “.00” when the amount is a whole number.
 */
export function formatMoneyCompact(amount, currencyCode = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) {
    return formatMoneyAmount(0, currencyCode);
  }
  const code = normalizeCurrency(currencyCode);
  try {
    const opts = Number.isInteger(n)
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      ...opts,
    }).format(n);
  } catch {
    return `${code} ${Number.isInteger(n) ? n : n.toFixed(2)}`;
  }
}

/** Dropdown options for business currency (value = ISO code). */
export const CURRENCY_OPTIONS = [
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "CHF", label: "CHF — Swiss Franc" },
  { value: "TRY", label: "TRY — Turkish Lira" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "ALL", label: "ALL — Albanian Lek" },
  { value: "MKD", label: "MKD — Macedonian Denar" },
  { value: "BGN", label: "BGN — Bulgarian Lev" },
  { value: "RSD", label: "RSD — Serbian Dinar" },
  { value: "BAM", label: "BAM — Convertible Mark" },
  { value: "PLN", label: "PLN — Polish Złoty" },
  { value: "HUF", label: "HUF — Hungarian Forint" },
  { value: "SEK", label: "SEK — Swedish Krona" },
  { value: "NOK", label: "NOK — Norwegian Krone" },
  { value: "DKK", label: "DKK — Danish Krone" },
  { value: "RON", label: "RON — Romanian Leu" },
  { value: "CZK", label: "CZK — Czech Koruna" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "INR", label: "INR — Indian Rupee" },
];
