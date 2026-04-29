const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

/**
 * Holds signup data until email is verified. No User row exists until then.
 */
const pendingRegistrationSchema = new mongoose.Schema(
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
        values: ["customer", "tenant", "admin"],
        message: "{VALUE} is not a valid role",
      },
      default: "customer",
    },
    emailVerificationCodeHash: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
    },
  },
  { timestamps: true },
);

pendingRegistrationSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  if (isBcryptHash(this.password)) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

function isBcryptHash(value) {
  return (
    typeof value === "string" &&
    value.length >= 59 &&
    value.startsWith("$2")
  );
}

pendingRegistrationSchema.methods.compareEmailVerificationCode = function (
  code,
) {
  if (!this.emailVerificationCodeHash || !this.emailVerificationExpires) {
    return Promise.resolve(false);
  }
  if (Date.now() > this.emailVerificationExpires.getTime()) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(String(code), this.emailVerificationCodeHash);
};

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);
