const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

/** Stored under backend/images/businesses — served at GET /images/businesses/:file */
const UPLOAD_DIR = path.join(__dirname, "..", "..", "images", "businesses");

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
    const safe = allowed.includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      const err = new Error("Only image files are allowed");
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * Always attach multer for POST /businesses. Multer skips non-multipart requests
 * (JSON body stays from express.json()). If we skip multer manually, req.body
 * never gets set for multipart and createBusiness fails.
 */
const businessCreateUpload = upload.fields([
  { name: "logo", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

module.exports = businessCreateUpload;
