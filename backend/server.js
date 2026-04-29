require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startBookingExpiryJob } = require('./src/jobs/bookingExpiry.job');
const { startReviewRequestJob } = require('./src/jobs/reviewRequest.job');
const { startReminderJob } = require('./src/jobs/reminder.job');
const { startTenantDigestJob } = require('./src/jobs/tenantDigest.job');

require('./src/models/User');
require('./src/models/PendingRegistration');
require('./src/models/Category');
require('./src/models/Business');
require('./src/models/Service');
require('./src/models/Staff');
require('./src/models/Booking');
require('./src/models/ClosingDay');
require('./src/models/EmailBroadcast');
require('./src/models/Review');
require('./src/models/Notification');
require('./src/models/WebhookEndpoint');

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    startBookingExpiryJob();
    startReviewRequestJob();
    startReminderJob();
    startTenantDigestJob();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });