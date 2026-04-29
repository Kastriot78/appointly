const User = require("../models/User");
const { toPublicUser } = require("./userPublic");
const { getEffectiveSubscriptionPayload } = require("./subscriptionEnforcement");

async function userMeResponse(userDoc) {
  if (!userDoc) return null;
  const subscription = await getEffectiveSubscriptionPayload(userDoc);
  return {
    ...toPublicUser(userDoc),
    subscription,
  };
}

async function userMeResponseById(userId) {
  const user = await User.findById(userId);
  return userMeResponse(user);
}

module.exports = { userMeResponse, userMeResponseById };
