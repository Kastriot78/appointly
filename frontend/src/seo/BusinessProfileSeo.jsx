import { Helmet } from "react-helmet-async";
import {
  buildLocalBusinessJsonLd,
  plainDescription,
} from "./businessJsonLd";
import { getPublicAppOrigin, getPublicBookingPageUrl } from "../utils/publicAppUrl";

/**
 * Per-business public booking page: title, description, canonical, Open Graph,
 * Twitter Card, and JSON-LD (LocalBusiness).
 */
export default function BusinessProfileSeo({ business, slug }) {
  const origin = getPublicAppOrigin();
  const canonical =
    getPublicBookingPageUrl(slug) ||
    (origin && slug ? `${origin}/book/${encodeURIComponent(String(slug).trim())}` : "");

  if (!business || !canonical) {
    return (
      <Helmet>
        <title>Book online — Appointly</title>
      </Helmet>
    );
  }

  const title = `${business.name} — Book online | Appointly`;
  const desc =
    plainDescription(
      business.description ||
        `Book an appointment at ${business.name}. ${business.category ? `${business.category}. ` : ""}View services and available times.`,
      160,
    );

  const ogImage = business.cover || business.logo || "";
  const jsonLd = buildLocalBusinessJsonLd({
    business,
    canonicalUrl: canonical,
    categorySlug: business.categorySlug || "",
  });

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Appointly" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={canonical} />
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={desc} />
      {ogImage ? <meta name="twitter:image" content={ogImage} /> : null}

      {jsonLd ? (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      ) : null}
    </Helmet>
  );
}
