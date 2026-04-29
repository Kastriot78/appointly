function parseAllowedOrigins() {
  const values = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ];
  return new Set(
    values
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .map((v) => v.replace(/\/+$/, "")),
  );
}

/**
 * Explicit CORS with env allowlist.
 * - Browser requests with disallowed Origin are rejected.
 * - Non-browser requests (no Origin header) are allowed.
 */
function corsAllow(req, res, next) {
  const origin = String(req.headers.origin || "").trim();
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const allowedOrigins = parseAllowedOrigins();

  if (origin) {
    if (!allowedOrigins.has(normalizedOrigin)) {
      return res.status(403).json({ message: "CORS origin is not allowed" });
    }
    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, X-Workspace-Id, Cache-Control, Pragma",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (String(process.env.CORS_ALLOW_CREDENTIALS || "").toLowerCase() === "true") {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

module.exports = corsAllow;
