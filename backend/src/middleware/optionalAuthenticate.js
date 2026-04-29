const User = require("../models/User");
const { verifyAuthToken } = require("../utils/jwt");

/**
 * Sets req.user / req.userId when a valid Bearer token is present.
 * Does not fail when missing or invalid token (guest flow).
 */
async function optionalAuthenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return next();
    }
    const token = header.slice(7);
    const decoded = verifyAuthToken(token);
    const user = await User.findById(decoded.sub);
    if (user && user.isEmailVerified) {
      req.user = user;
      req.userId = user._id;
    }
    next();
  } catch {
    next();
  }
}

module.exports = optionalAuthenticate;
