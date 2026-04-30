const mongoose = require("mongoose");
const User = require("../models/User");
const Category = require("../models/Category");
const Business = require("../models/Business");
const Service = require("../models/Service");
const Staff = require("../models/Staff");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Notification = require("../models/Notification");

const DEFAULT_CATEGORIES = [
  { slug: "barber", name: "Barber & Hair", iconKey: "barber", sortOrder: 0 },
  { slug: "dental", name: "Dental", iconKey: "dental", sortOrder: 1 },
  { slug: "fitness", name: "Fitness & Gym", iconKey: "fitness", sortOrder: 2 },
  { slug: "auto", name: "Auto Service", iconKey: "auto", sortOrder: 3 },
  { slug: "spa", name: "Spa & Wellness", iconKey: "spa", sortOrder: 4 },
  { slug: "tutoring", name: "Tutoring", iconKey: "tutoring", sortOrder: 5 },
  { slug: "other", name: "Other", iconKey: "other", sortOrder: 6 },
];

async function seedCategoriesIfEmpty() {
  const n = await Category.countDocuments();
  if (n > 0) return;
  await Category.insertMany(DEFAULT_CATEGORIES);
  console.log("Default categories seeded");
}

async function migratePendingEmailIndex() {
  const col = User.collection;
  await col.dropIndex("pendingEmail_1").catch(() => {});
  await col.updateMany(
    { pendingEmail: null },
    { $unset: { pendingEmail: "" } },
  );
  await User.syncIndexes();
}

/** Legacy reviews may omit `staff`; partial unique index uses `{ staff: null }` only (no `$exists: false`). */
async function normalizeReviewStaffField() {
  const col = Review.collection;
  const res = await col.updateMany(
    { staff: { $exists: false } },
    { $set: { staff: null } },
  );
  if (res.modifiedCount > 0) {
    console.log(`Reviews: set staff=null on ${res.modifiedCount} legacy document(s)`);
  }
}

const connectDB = async ({ exitOnError = true } = {}) => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    await migratePendingEmailIndex();
    console.log("User indexes synced");
    await Category.syncIndexes();
    await seedCategoriesIfEmpty();
    await Business.syncIndexes();
    await Service.syncIndexes();
    await Staff.syncIndexes();
    await Booking.syncIndexes();
    await normalizeReviewStaffField();
    await Review.syncIndexes();
    await Notification.syncIndexes();
    console.log("Business-related indexes synced");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    if (exitOnError) {
      process.exit(1);
    }
    throw err;
  }
};

module.exports = connectDB;
