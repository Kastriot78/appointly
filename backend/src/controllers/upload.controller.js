const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const multer = require("multer");
const { uploadImageFile } = require("../services/cloudinary.service");

/** Same folder as create-business uploads — served at /images/businesses/ */
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
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
    const safe = allowed.includes(ext) ? ext : ".jpg";
    cb(
      null,
      `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safe}`,
    );
  },
});

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

async function uploadBusinessImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const url = await uploadImageFile(req.file, "appointly/businesses/misc");
  res.json({ url });
}

module.exports = {
  uploadMiddleware: upload.single("file"),
  uploadBusinessImage,
};
