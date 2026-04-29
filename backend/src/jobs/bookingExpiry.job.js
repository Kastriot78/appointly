const cron = require("node-cron");
const Booking = require("../models/Booking");

/**
 * Marks pending_confirmation holds as expired after confirmationExpiresAt passes.
 */
function startBookingExpiryJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const r = await Booking.updateMany(
        {
          status: "pending_confirmation",
          confirmationExpiresAt: { $lt: new Date() },
        },
        { $set: { status: "expired", confirmationExpiresAt: null } },
      );
      if (r.modifiedCount > 0) {
        console.log(`[booking-expiry] Expired ${r.modifiedCount} pending hold(s)`);
      }
    } catch (e) {
      console.error("[booking-expiry]", e.message);
    }
  });
}

module.exports = { startBookingExpiryJob };
