const jwt = require("jsonwebtoken");

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error("JWT_SECRET is not set");
  }
  return s;
}

function signAuthToken(payload) {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, getSecret(), { expiresIn });
}

function verifyAuthToken(token) {
  return jwt.verify(token, getSecret());
}

/** Short-lived token scoping a 2FA login challenge — cannot be used as a normal session. */
function signTwoFactorChallenge(payload, expiresInSeconds) {
  return jwt.sign(
    { ...payload, purpose: "2fa_challenge" },
    getSecret(),
    { expiresIn: expiresInSeconds || 600 },
  );
}

function verifyTwoFactorChallenge(token) {
  const decoded = jwt.verify(token, getSecret());
  if (decoded.purpose !== "2fa_challenge") {
    throw new Error("Invalid challenge token");
  }
  return decoded;
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
  signTwoFactorChallenge,
  verifyTwoFactorChallenge,
};
