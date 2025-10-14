const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [50, "Name cannot exceed 50 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
    },

    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },

    devices: [
      {
        deviceId: {
          type: String,
          required: true,
          trim: true,
        },
        name: {
          type: String,
          default: "Smart Stick",
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        lastSeen: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    fcmToken: {
      type: String,
      default: null,
    },

    emergencyContacts: [
      {
        name: {
          type: String,
          required: true,
        },
        phone: {
          type: String,
          required: true,
        },
        email: {
          type: String,
          required: false,
        },
        relationship: {
          type: String,
          enum: ["family", "friend", "caregiver", "medical", "other"],
          default: "other",
        },
      },
    ],

    isAdmin: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    preferences: {
      notifications: {
        sos: { type: Boolean, default: true },
        deviceOffline: { type: Boolean, default: true },
        lowBattery: { type: Boolean, default: true },
      },
      language: {
        type: String,
        default: "en",
        enum: ["en", "es", "fr", "de", "it"],
      },
      timezone: {
        type: String,
        default: "UTC",
      },
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    accountLocked: {
      type: Boolean,
      default: false,
    },

    lockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ "devices.deviceId": 1 });
userSchema.index({ fcmToken: 1 });

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("passwordHash")) return next();

  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.passwordHash, 12);
    this.passwordHash = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // After 5 attempts, lock account for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
      accountLocked: true,
    };
  }

  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { lockUntil: 1 },
    $set: {
      loginAttempts: 0,
      accountLocked: false,
      lastLogin: new Date(),
    },
  });
};

// Instance method to add device
userSchema.methods.addDevice = function (deviceId, deviceName = "Smart Stick") {
  // Check if device already exists
  const existingDevice = this.devices.find(
    (device) => device.deviceId === deviceId
  );
  if (existingDevice) {
    existingDevice.isActive = true;
    existingDevice.lastSeen = new Date();
    return this.save();
  }

  this.devices.push({
    deviceId,
    name: deviceName,
    isActive: true,
    addedAt: new Date(),
    lastSeen: new Date(),
  });

  return this.save();
};

// Instance method to remove device
userSchema.methods.removeDevice = function (deviceId) {
  this.devices = this.devices.filter((device) => device.deviceId !== deviceId);
  return this.save();
};

// Instance method to update device last seen
userSchema.methods.updateDeviceLastSeen = function (deviceId) {
  const device = this.devices.find((device) => device.deviceId === deviceId);
  if (device) {
    device.lastSeen = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to find user by device ID
userSchema.statics.findByDeviceId = function (deviceId) {
  return this.findOne({ "devices.deviceId": deviceId, isActive: true });
};

// Static method to find users with FCM tokens for a device
userSchema.statics.findUsersWithFCMByDevice = function (deviceId) {
  return this.find({
    "devices.deviceId": deviceId,
    fcmToken: { $exists: true, $ne: null },
    isActive: true,
  });
};

const User = mongoose.model("User", userSchema);

module.exports = User;
