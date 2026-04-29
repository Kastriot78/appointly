/**
 * Map internal category slug to schema.org @type (LocalBusiness family).
 */
export function categorySlugToSchemaType(categorySlug) {
  const s = String(categorySlug || "").toLowerCase();
  if (
    s.includes("barber") ||
    s.includes("hair") ||
    s.includes("salon") ||
    s.includes("nail")
  ) {
    return "HairSalon";
  }
  if (s.includes("dent") || s.includes("dental") || s.includes("clinic")) {
    return "MedicalClinic";
  }
  if (s.includes("spa") || s.includes("beauty") || s.includes("massage")) {
    return "HealthAndBeautyBusiness";
  }
  if (s.includes("gym") || s.includes("fitness")) {
    return "ExerciseGym";
  }
  return "LocalBusiness";
}

/**
 * Strip and truncate plain text for meta / JSON-LD.
 */
export function plainDescription(text, maxLen = 160) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Build schema.org LocalBusiness JSON-LD object.
 */
export function buildLocalBusinessJsonLd({
  business,
  canonicalUrl,
  categorySlug,
}) {
  if (!business || !canonicalUrl) return null;

  const schemaType = categorySlugToSchemaType(categorySlug);
  const images = [];
  if (business.cover) images.push(business.cover);
  if (business.logo && business.logo !== business.cover) {
    images.push(business.logo);
  }
  if (business.gallery?.length) {
    for (const g of business.gallery.slice(0, 4)) {
      if (g.url && !images.includes(g.url)) images.push(g.url);
    }
  }

  const obj = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: business.name,
    description: plainDescription(business.description, 500) || undefined,
    url: canonicalUrl,
    image: images.length ? images : undefined,
    telephone: business.phone?.trim() || undefined,
    email: business.email?.trim() || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: business.address?.trim() || undefined,
      addressLocality: business.area?.trim() || undefined,
    },
  };

  if (business.coordinates?.lat != null && business.coordinates?.lng != null) {
    obj.geo = {
      "@type": "GeoCoordinates",
      latitude: business.coordinates.lat,
      longitude: business.coordinates.lng,
    };
  }

  const rating = Number(business.rating);
  const rc = Number(business.reviewCount);
  if (Number.isFinite(rating) && rating > 0 && Number.isFinite(rc) && rc > 0) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round(rating * 10) / 10,
      reviewCount: rc,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const priceRange =
    business.services?.length
      ? (() => {
          const prices = business.services
            .map((s) => Number(s.price))
            .filter((n) => Number.isFinite(n) && n >= 0);
          if (!prices.length) return undefined;
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          const cur = business.currency || "EUR";
          return min === max
            ? `${cur} ${min}`
            : `${cur} ${min}–${max}`;
        })()
      : undefined;
  if (priceRange) obj.priceRange = priceRange;

  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined) delete obj[k];
  });
  if (obj.address) {
    const a = obj.address;
    Object.keys(a).forEach((k) => {
      if (a[k] === undefined) delete a[k];
    });
    if (Object.keys(a).length <= 1) {
      delete obj.address;
    }
  }

  return obj;
}
