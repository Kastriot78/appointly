const User = require("../models/User");
const { verifyAuthToken } = require("../utils/jwt");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const token = header.slice(7);
    const decoded = verifyAuthToken(token);
    const user = await User.findById(decoded.sub);
    if (!user || !user.isEmailVerified) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }
    req.user = user;
    req.userId = user._id;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = authenticate;
