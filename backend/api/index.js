const app = require("../src/app");
const connectDB = require("../src/config/db");

let dbInitPromise = null;

function getMongoHost() {
  const uri = String(process.env.MONGO_URI || "").trim();
  if (!uri) return null;
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const afterAuth = afterScheme.includes("@")
    ? afterScheme.split("@").slice(1).join("@")
    : afterScheme;
  const host = afterAuth.split("/")[0]?.trim() || "";
  return host || null;
}

async function ensureDbConnection() {
  if (!dbInitPromise) {
    dbInitPromise = connectDB({ exitOnError: false }).catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureDbConnection();
    return app(req, res);
  } catch (err) {
    return res.status(500).json({
      error: "Database connection failed",
      details: err.message,
      mongoHost: getMongoHost(),
    });
  }
};
