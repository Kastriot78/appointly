const path = require("path");
const express = require("express");
const helmet = require("helmet");
const mongoose = require("mongoose");
const corsAllow = require("./middleware/corsAllow");
const errorHandler = require("./middleware/errorHandler");
const asyncHandler = require("./utils/asyncHandler");
const seoController = require("./controllers/seo.controller");

const app = express();

function getMongoHost() {
  const uri = String(process.env.MONGO_URI || "").trim();
  if (!uri) return null;
  // mongodb+srv://user:pass@host/db?...
  // mongodb://user:pass@host:port/db?...
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const afterAuth = afterScheme.includes("@")
    ? afterScheme.split("@").slice(1).join("@")
    : afterScheme;
  const host = afterAuth.split("/")[0]?.trim() || "";
  return host || null;
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    // Frontend runs on a different origin in dev (localhost:5173),
    // so static assets from API (localhost:5000) must be embeddable.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(corsAllow);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

function setPublicAssetHeaders(res) {
  const origin = String(res?.req?.headers?.origin || "").trim();
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

/** SEO — same process as API; in production, reverse-proxy these paths or serve from CDN with FRONTEND_URL set. */
app.get("/sitemap.xml", asyncHandler(seoController.getSitemapXml));
app.get("/robots.txt", asyncHandler(seoController.getRobotsTxt));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"), {
    setHeaders: setPublicAssetHeaders,
  }),
);
app.use(
  "/images",
  express.static(path.join(__dirname, "..", "images"), {
    setHeaders: setPublicAssetHeaders,
  }),
);

/** Quick check you’re hitting this API (returns JSON, not HTML). */
app.get("/", (req, res) => {
  const dbName =
    mongoose.connection?.db?.databaseName ||
    mongoose.connection?.name ||
    null;
  const dbHost = getMongoHost();
  res.json({
    ok: true,
    message: "Appointly backend API is running.",
    health: "/api/health",
    db: {
      connected: mongoose.connection?.readyState === 1,
      name: dbName,
      host: dbHost,
    },
  });
});

app.get("/api/health", (req, res) => {
  const dbName =
    mongoose.connection?.db?.databaseName ||
    mongoose.connection?.name ||
    null;
  const dbHost = getMongoHost();
  res.json({
    ok: true,
    service: "appointly-api",
    env: process.env.NODE_ENV || "development",
    uptimeSec: Math.round(process.uptime()),
    db: {
      connected: mongoose.connection?.readyState === 1,
      name: dbName,
      host: dbHost,
    },
  });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/subscription", require("./routes/subscription.routes"));
app.use("/api/categories", require("./routes/category.routes"));
app.use("/api/locations", require("./routes/location.routes"));
app.use("/api/businesses", require("./routes/business.routes"));
app.use("/api/upload", require("./routes/upload.routes"));
app.use("/api/reviews", require("./routes/review.routes"));
app.use("/api/bookings", require("./routes/booking.routes"));
app.use("/api/webhooks", require("./routes/webhook.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/analytics", require("./routes/analytics.routes"));
app.use("/api/newsletter", require("./routes/newsletter.routes"));
app.use("/api/contact", require("./routes/contact.routes"));

// app.use('/api/tenants', require('./routes/tenant.routes'));
// app.use('/api/services', require('./routes/service.routes'));
// app.use('/api/staff', require('./routes/staff.routes'));
// app.use('/api/admin', require('./routes/admin.routes'));

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorHandler);

module.exports = app;

