const User = require("../models/User");
const Business = require("../models/Business");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const ClosingDay = require("../models/ClosingDay");
const Coupon = require("../models/Coupon");
const EmailBroadcast = require("../models/EmailBroadcast");
const Notification = require("../models/Notification");
const PendingRegistration = require("../models/PendingRegistration");
const NewsletterSubscription = require("../models/NewsletterSubscription");

/**
 * Permanently remove the user and related data. `confirmEmail` must match the
 * account login email (case-insensitive). No Mongo transaction — keeps
 * standalone/dev MongoDB working without a replica set.
 */
async function deleteAccountForUser(userId, confirmEmail) {
  const normalized = String(confirmEmail || "").trim().toLowerCase();
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      message: "Confirmation email is required",
    };
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }
  if (normalized !== user.email) {
    return {
      ok: false,
      status: 400,
      message: "Email does not match your account",
    };
  }
  if (user.role === "admin") {
    const count = await User.countDocuments({ role: "admin" });
    if (count <= 1) {
      return {
        ok: false,
        status: 400,
        message: "Cannot delete the only admin account.",
      };
    }
  }

  if (user.role === "staff") {
    if (user.staffProfile) {
      await Staff.findByIdAndUpdate(user.staffProfile, {
        $set: { linkedUser: null },
        $unset: { dashboardInviteToken: "", dashboardInviteExpires: "" },
      });
    }
    await Notification.deleteMany({ recipient: userId });
    await User.updateMany(
      { favorites: userId },
      { $pull: { favorites: userId } },
    );
    await PendingRegistration.deleteMany({ email: user.email });
    await NewsletterSubscription.deleteMany({ email: user.email });
    const delStaff = await User.deleteOne({ _id: userId });
    if (delStaff.deletedCount !== 1) {
      return {
        ok: false,
        status: 500,
        message: "Could not delete account. Please try again or contact support.",
      };
    }
    return { ok: true };
  }

  const businessRows = await Business.find({ owner: userId }).select("_id").lean();
  const businessIds = businessRows.map((b) => b._id);

  await Notification.deleteMany({
    $or: [{ recipient: userId }, { business: { $in: businessIds } }],
  });

  for (const bid of businessIds) {
    await Booking.deleteMany({ business: bid });
    await Review.deleteMany({ business: bid });
    await Service.deleteMany({ business: bid });
    await Staff.deleteMany({ business: bid });
    await ClosingDay.deleteMany({ business: bid });
    await Coupon.deleteMany({ business: bid });
    await EmailBroadcast.deleteMany({ business: bid });
  }

  await Business.deleteMany({ owner: userId });

  await Booking.deleteMany({ customer: userId });
  await Review.deleteMany({ customer: userId });
  await Notification.deleteMany({ recipient: userId });

  await User.updateMany({ favorites: userId }, { $pull: { favorites: userId } });

  await PendingRegistration.deleteMany({ email: user.email });
  await NewsletterSubscription.deleteMany({ email: user.email });

  const del = await User.deleteOne({ _id: userId });
  if (del.deletedCount !== 1) {
    return {
      ok: false,
      status: 500,
      message: "Could not delete account. Please try again or contact support.",
    };
  }

  return { ok: true };
}

module.exports = { deleteAccountForUser };
