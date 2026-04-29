/**
 * ISO 4217 codes supported for tenant pricing. Default EUR for legacy rows.
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

function normalizeCurrency(c) {
  const u = String(c || "EUR")
    .trim()
    .toUpperCase();
  return ALLOWED.has(u) ? u : "EUR";
}

/**
 * Format a numeric amount for emails / logs (Intl).
 */
function formatMoneyAmount(amount, currencyCode = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const code = normalizeCurrency(currencyCode);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

module.exports = {
  ALLOWED_CURRENCIES: ALLOWED,
  normalizeCurrency,
  formatMoneyAmount,
};
