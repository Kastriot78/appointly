const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const multer = require("multer");

/** Stored under backend/images/businesses — served at GET /images/businesses/:file */
const UPLOAD_DIR = path.join(__dirname, "..", "..", "images", "businesses");
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), "appointly", "images", "businesses");

function isServerlessRuntime() {
  const cwd = String(process.cwd() || "");
  return (
    String(process.env.VERCEL || "").trim() === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.LAMBDA_TASK_ROOT) ||
    cwd.startsWith("/var/task")
  );
}

const useServerlessStorage = isServerlessRuntime();

const diskStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    const targetDir = useServerlessStorage ? TMP_UPLOAD_DIR : UPLOAD_DIR;
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    } catch (err) {
      err.statusCode = 500;
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
    const safe = allowed.includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safe}`);
  },
});

/**
 * Vercel/Lambda filesystem under /var/task is read-only. Use memory storage there
 * so multipart parsing does not fail and business creation can continue.
 */
const storage = useServerlessStorage ? multer.memoryStorage() : diskStorage;

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
