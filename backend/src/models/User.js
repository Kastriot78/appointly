const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: {
        values: ["customer", "tenant", "admin", "staff"],
        message: "{VALUE} is not a valid role",
      },
      default: "customer",
    },
    /**
     * When role is `staff` — links to the Staff profile and business for
     * dashboard scoping (denormalized business id avoids a join per request).
     */
    staffProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    staffBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
      },
    ],
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCodeHash: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
    },
    /** New address awaiting verification; login email stays `email` until confirmed. Omit field when none (do not store null — breaks unique index). */
    pendingEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    emailChangeCodeHash: {
      type: String,
      select: false,
    },
    emailChangeExpires: {
      type: Date,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
    },
    /** 2FA (email OTP) — off until the user enables it in profile (any role). */
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    /** Hashed 6-digit code active for either a login challenge or an enable/disable confirmation. */
    twoFactorCodeHash: {
      type: String,
      select: false,
    },
    twoFactorCodeExpires: {
      type: Date,
    },
    /** Purpose of the currently issued code: "login", "enable", "disable". */
    twoFactorCodePurpose: {
      type: String,
      enum: ["login", "enable", "disable"],
    },
    /** Cooldown guard — block repeated code generation from the same account. */
    twoFactorLastSentAt: {
      type: Date,
    },
    /**
     * Billing tier for tenant accounts — limits enforced per business the user owns.
     * Customers / staff: ignored (effective plan comes from business owner for staff).
     */
    subscriptionPlan: {
      type: String,
      enum: ["starter", "professional", "enterprise"],
      default: "starter",
    },
    subscriptionBilling: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    /** Verification attempts against the active code; reset when a new code is issued. */
    twoFactorAttempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

/** Unique only for real strings; sparse alone still indexes explicit `null` (duplicate key across users). */
userSchema.index(
  { pendingEmail: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pendingEmail: { $exists: true, $type: "string", $gt: "" },
    },
  },
);

/**
 * Hash plain passwords only. Skip if already bcrypt (e.g. promoted from PendingRegistration).
 */
function isBcryptHash(value) {
  return (
    typeof value === "string" && value.length >= 59 && value.startsWith("$2")
  );
}

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  if (isBcryptHash(this.password)) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

/**
 * Login: compare candidate password with stored hash.
 * Load user with .select("+password") first.
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * Verify email OTP: compare code, ensure not expired.
 * Load user with .select("+emailVerificationCodeHash +emailVerificationExpires") first.
 */
userSchema.methods.compareEmailVerificationCode =
  function compareEmailVerificationCode(code) {
    if (!this.emailVerificationCodeHash || !this.emailVerificationExpires) {
      return Promise.resolve(false);
    }
    if (Date.now() > this.emailVerificationExpires.getTime()) {
      return Promise.resolve(false);
    }
    return bcrypt.compare(String(code), this.emailVerificationCodeHash);
  };

/** Confirm pending email change (code sent to `pendingEmail`). */
userSchema.methods.compareEmailChangeCode = function compareEmailChangeCode(
  code,
) {
  if (!this.emailChangeCodeHash || !this.emailChangeExpires) {
    return Promise.resolve(false);
  }
  if (Date.now() > this.emailChangeExpires.getTime()) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(String(code), this.emailChangeCodeHash);
};

/**
 * Verify 2FA OTP for the current purpose.
 * Load user with .select("+twoFactorCodeHash +twoFactorCodeExpires +twoFactorCodePurpose +twoFactorAttempts") first.
 */
userSchema.methods.compareTwoFactorCode = function compareTwoFactorCode(
  code,
  purpose,
) {
  if (!this.twoFactorCodeHash || !this.twoFactorCodeExpires) {
    return Promise.resolve(false);
  }
  if (purpose && this.twoFactorCodePurpose !== purpose) {
    return Promise.resolve(false);
  }
  if (Date.now() > this.twoFactorCodeExpires.getTime()) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(String(code), this.twoFactorCodeHash);
};

module.exports = mongoose.model("User", userSchema);
