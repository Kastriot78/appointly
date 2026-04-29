const Business = require("../models/Business");
const { getPublicSiteBase } = require("../utils/sitePublicUrl");

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * GET /sitemap.xml — public booking URLs for active, approved businesses.
 */
async function getSitemapXml(req, res) {
  const base = getPublicSiteBase();
  const rows = await Business.find({
    isActive: true,
    isApproved: { $ne: false },
    slug: { $exists: true, $nin: [null, ""] },
  })
    .select("slug updatedAt")
    .sort({ slug: 1 })
    .lean();

  const staticUrls = [
    { loc: `${base}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${base}/book`, priority: "0.9", changefreq: "daily" },
  ];

  const businessUrls = [];
  for (const b of rows) {
    const slug = String(b.slug || "").trim();
    if (!slug) continue;
    const loc = `${base}/book/${encodeURIComponent(slug)}`;
    const lastmod =
      b.updatedAt instanceof Date
        ? b.updatedAt.toISOString().split("T")[0]
        : null;
    businessUrls.push({
      loc,
      lastmod,
      priority: "0.8",
      changefreq: "weekly",
    });
  }

  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const u of [...staticUrls, ...businessUrls]) {
    parts.push("<url>");
    parts.push(`<loc>${escapeXml(u.loc)}</loc>`);
    if (u.lastmod) {
      parts.push(`<lastmod>${escapeXml(u.lastmod)}</lastmod>`);
    }
    parts.push(`<changefreq>${u.changefreq}</changefreq>`);
    parts.push(`<priority>${u.priority}</priority>`);
    parts.push("</url>");
  }

  parts.push("</urlset>");

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(parts.join(""));
}

/**
 * GET /robots.txt — allow crawlers; point to sitemap on the same public origin.
 */
function getRobotsTxt(req, res) {
  const base = getPublicSiteBase();
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  res.type("text/plain; charset=utf-8");
  res.send(body);
}

module.exports = {
  getSitemapXml,
  getRobotsTxt,
};
