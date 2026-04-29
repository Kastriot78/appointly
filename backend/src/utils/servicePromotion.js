/**
 * Limited-time sale on a service: original price stays in `price`,
 * `promotion.salePrice` applies only for bookings whose date falls in [validFrom, validTo] (inclusive, YYYY-MM-DD).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ymdPartsToIso(ymd) {
  if (!ymd || ymd.y == null || ymd.m == null || ymd.d == null) return null;
  const m = String(ymd.m).padStart(2, "0");
  const d = String(ymd.d).padStart(2, "0");
  return `${ymd.y}-${m}-${d}`;
}

function isValidIsoDate(s) {
  return typeof s === "string" && ISO_DATE.test(String(s).trim());
}

/**
 * @param {object} service - Service doc or lean { price, promotion? }
 * @param {string} isoDateStr - YYYY-MM-DD (booking local calendar day)
 */
function isPromotionActiveForDate(service, isoDateStr) {
  const p = service?.promotion;
  if (!p || p.salePrice == null) return false;
  const vf = String(p.validFrom || "").trim().slice(0, 10);
  const vt = String(p.validTo || "").trim().slice(0, 10);
  if (!isValidIsoDate(vf) || !isValidIsoDate(vt)) return false;
  const day = String(isoDateStr || "").trim().slice(0, 10);
  if (!isValidIsoDate(day)) return false;
  const base = Number(service.price);
  const sale = Number(p.salePrice);
  if (!Number.isFinite(base) || !Number.isFinite(sale) || sale < 0 || sale >= base) {
    return false;
  }
  return day >= vf && day <= vt;
}

function getEffectivePrice(service, isoDateStr) {
  if (isPromotionActiveForDate(service, isoDateStr)) {
    return Number(service.promotion.salePrice);
  }
  return Number(service.price);
}

/**
 * @param {object} body - { salePrice, validFrom, validTo } or null to clear
 * @param {number} listPrice - service.price (required when setting)
 */
function normalizePromotionInput(body, listPrice) {
  if (body == null || body === false) {
    return { clear: true };
  }
  if (typeof body !== "object") {
    return { error: "Invalid promotion" };
  }
  const salePrice = Number(body.salePrice);
  const validFrom = String(body.validFrom || "").trim().slice(0, 10);
  const validTo = String(body.validTo || "").trim().slice(0, 10);
  if (!isValidIsoDate(validFrom) || !isValidIsoDate(validTo)) {
    return { error: "validFrom and validTo must be YYYY-MM-DD" };
  }
  if (validFrom > validTo) {
    return { error: "End date must be on or after start date" };
  }
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    return { error: "Valid sale price is required" };
  }
  const base = Number(listPrice);
  if (!Number.isFinite(base) || base <= 0) {
    return { error: "Set a list price before adding a promotion" };
  }
  if (salePrice >= base) {
    return { error: "Sale price must be less than the regular price" };
  }
  return {
    value: {
      salePrice: Math.round(salePrice * 100) / 100,
      validFrom,
      validTo,
    },
  };
}

module.exports = {
  ymdPartsToIso,
  isValidIsoDate,
  isPromotionActiveForDate,
  getEffectivePrice,
  normalizePromotionInput,
};
