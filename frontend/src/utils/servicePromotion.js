/** Mirrors backend `servicePromotion` rules for display-only (booking date vs promotion window). */

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @returns {null | { basePrice: number, salePrice: number, percentOff: number, validFrom: string, validTo: string }}
 */
export function getPromotionView(service, refDateIso) {
  if (!service?.promotion) return null;
  const p = service.promotion;
  const sale = Number(p.salePrice);
  const vf = String(p.validFrom || "").slice(0, 10);
  const vt = String(p.validTo || "").slice(0, 10);
  const day = String(refDateIso || "").slice(0, 10);
  if (!vf || !vt || day < vf || day > vt) return null;
  const base = Number(service.price);
  if (!Number.isFinite(base) || !Number.isFinite(sale) || sale < 0 || sale >= base) {
    return null;
  }
  const percentOff = Math.round(((base - sale) / base) * 100);
  return {
    basePrice: base,
    salePrice: sale,
    percentOff,
    validFrom: vf,
    validTo: vt,
  };
}

export function getEffectivePriceForUi(service, isoDateStr) {
  const v = getPromotionView(service, isoDateStr);
  if (v) return v.salePrice;
  return Number(service.price);
}
