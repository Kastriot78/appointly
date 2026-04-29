/**
 * Shared Appointly HTML email shell (Poppins, card table, header, footer).
 * Inner content stays per-template; only the wrapper is shared.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → safe paragraphs (split on blank lines). */
function descriptionToHtmlParagraphs(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const inner = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px 0;font-family:'Poppins',sans-serif;font-size:14px;font-weight:400;color:#202124;line-height:1.65;">${inner}</p>`;
    })
    .join("");
}

/**
 * Primary CTA — gradient bar (matches advanced template style).
 * @param {string} href — already-safe or will be escaped
 * @param {string} label
 */
function buildGradientCtaHtml(href, label) {
  const h = escapeHtml(String(href || "").trim());
  const l = escapeHtml(String(label || "Open").trim());
  if (!h) return "";
  return `
    <div style="margin-top:22px;background:linear-gradient(90deg,#6366f1 0%,#4f46e5 50%,#4338ca 100%);border-radius:8px;">
      <a href="${h}" target="_blank" rel="noopener noreferrer"
        style="display:block;text-decoration:none;border-radius:8px;">
        <table border="0" cellpadding="0" cellspacing="0" align="center" style="width:100%;">
          <tr>
            <td style="padding:12px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" style="width:100%;min-width:280px;">
                <tr>
                  <td align="left" style="font-family:'Poppins',sans-serif;font-size:14px;font-weight:600;color:#fff;">
                    ${l}
                  </td>
                  <td align="right" style="padding-left:10px;font-size:14px;color:#fff;">→</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </a>
    </div>`;
}

const BODY_FONT =
  "font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

/**
 * Full HTML document wrapper.
 * @param {object} p
 * @param {string} p.headerSubtitle — top-right label (business name, “Your account”, etc.)
 * @param {string|null} [p.headline] — large title; omit with null/false
 * @param {string} p.contentHtml — main body (must be safe HTML from escaped inputs)
 * @param {string} [p.signOffLine] default “Thank you,”
 * @param {string} [p.signOffName] default “The Appointly Team”
 * @param {string} p.footerHtml — small disclaimer (escaped fragments only)
 */
function buildAppointlyEmailDocument(p) {
  const headerSubtitle = escapeHtml(
    String(p.headerSubtitle != null ? p.headerSubtitle : "Appointly").trim() ||
      "Appointly",
  );
  const headlineRaw = p.headline != null && p.headline !== false ? String(p.headline).trim() : "";
  const headlineBlock = headlineRaw
    ? `<p class="appointly-email-headline" style="${BODY_FONT};color:#202124;margin:0 0 8px 0;font-size:28px;font-weight:600;line-height:1.2;text-align:left;">${escapeHtml(headlineRaw)}</p>`
    : "";

  const signOffLine = escapeHtml(
    String(p.signOffLine != null ? p.signOffLine : "Thank you,").trim(),
  );
  const signOffName = escapeHtml(
    String(p.signOffName != null ? p.signOffName : "The Appointly Team").trim(),
  );

  const footerHtml = p.footerHtml || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet"/>
  <style type="text/css">
    /* Desktop: two columns — widths here (not inline) so mobile can override to 100% */
    .email-main-card { table-layout: fixed; }
    .email-header-stack-l { width: 42%; }
    .email-header-stack-r { width: 58%; }
    @media only screen and (max-width: 600px) {
      .email-outer-wrap { padding: 12px !important; }
      .email-pad-header-l { padding: 15px 20px 6px 20px !important; }
      .email-pad-header-r { padding: 0 20px 15px 20px !important; }
      .email-pad-main { padding: 16px 20px !important; }
      .email-pad-signoff { padding-left: 20px !important; padding-right: 20px !important; }
      .email-divider-rule { margin-left: 20px !important; margin-right: 20px !important; }
      .email-pad-footer { padding-left: 20px !important; padding-right: 20px !important; }
      .appointly-email-headline { font-size: 25px !important; line-height: 1.2 !important; }
      /* Stacked header: each row full width (no 58% column) */
      .email-main-card { table-layout: auto !important; width: 100% !important; }
      .email-header-stack-l,
      .email-header-stack-r {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 100% !important;
        box-sizing: border-box !important;
      }
      .email-header-stack-r { text-align: left !important; }
      .email-header-subtitle {
        text-align: left !important;
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body style="margin:0;background-color:#F5F5F5;">
  <div class="email-outer-wrap" style="max-width:640px;margin:0 auto;padding:20px;">
    <table class="email-main-card" width="100%" style="background-color:#FFFFFF;border-collapse:collapse;border-radius:10px;">
      <tr>
        <td class="email-pad-header-l email-header-stack-l" style="text-align:left;padding:15px 8px 15px 40px;vertical-align:middle;">
          <span style="${BODY_FONT};font-size:20px;font-weight:700;color:#4f46e5;letter-spacing:-0.02em;">Appointly</span>
        </td>
        <td class="email-pad-header-r email-header-stack-r" style="text-align:right;padding:15px 40px 15px 8px;vertical-align:middle;">
          <p class="email-header-subtitle" style="${BODY_FONT};color:#494949;font-size:12px;font-weight:500;line-height:1.45;margin:0;word-break:break-word;overflow-wrap:anywhere;max-width:100%;">${headerSubtitle}</p>
        </td>
      </tr>
      <tr>
        <td colspan="2"><div style="text-align:center;border-top:1px solid rgba(79,70,229,0.08);"></div></td>
      </tr>
      <tr>
        <td class="email-pad-main" colspan="2" style="padding:20px 40px;">
          ${headlineBlock}
          <div style="${BODY_FONT};color:#334155;font-size:14px;line-height:1.6;">
            ${p.contentHtml || ""}
          </div>
        </td>
      </tr>
      <tr>
        <td class="email-pad-signoff" align="left" style="padding-left:40px;padding-right:40px;padding-bottom:20px;width:100%;">
          <p style="font-style:italic;margin:0 0 6px 0;font-size:14px;${BODY_FONT};font-weight:400;color:#1E2023;">${signOffLine}</p>
          <p style="font-style:italic;margin:0;font-size:16px;${BODY_FONT};font-weight:700;color:#1E2023;">${signOffName}</p>
        </td>
      </tr>
      <tr>
        <td colspan="2"><div class="email-divider-rule" style="text-align:center;margin:0 40px;border-top:1px solid rgba(79,70,229,0.08);"></div></td>
      </tr>
      <tr>
        <td class="email-pad-footer" colspan="2" style="padding:10px 40px 20px 40px;">
          ${footerHtml}
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/** Default footer paragraph (escaped). */
function footerParagraph(text) {
  const t = escapeHtml(String(text || "").trim());
  if (!t) return "";
  return `<p style="margin:0;font-size:12px;${BODY_FONT};font-weight:400;color:#64748b;line-height:1.5;">${t}</p>`;
}

module.exports = {
  escapeHtml,
  descriptionToHtmlParagraphs,
  buildGradientCtaHtml,
  buildAppointlyEmailDocument,
  footerParagraph,
};
