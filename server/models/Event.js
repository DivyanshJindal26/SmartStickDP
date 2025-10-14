const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "Event type is required"],
      enum: [
        "SOS",
        "ALERT",
        "DEVICE_ONLINE",
        "DEVICE_OFFLINE",
        "LOW_BATTERY",
        "FALL_DETECTED",
        "OBSTACLE_DETECTED",
        "GPS_LOST",
        "MAINTENANCE_REQUIRED",
        "USER_LOGIN",
        "USER_LOGOUT",
        "COMMAND_SENT",
        "COMMAND_RECEIVED",
        "SYSTEM_ERROR",
      ],
    },

    deviceId: {
      type: String,
      required: [true, "Device ID is required"],
      trim: true,
      maxlength: [50, "Device ID cannot exceed 50 characters"],
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Some events might not be user-specific
    },

    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    status: {
      type: String,
      enum: ["active", "acknowledged", "resolved", "ignored"],
      default: "active",
    },

    title: {
      type: String,
      required: [true, "Event title is required"],
      maxlength: [100, "Title cannot exceed 100 characters"],
    },

    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (coords) {
            return (
              coords.length === 2 &&
              coords[0] >= -180 &&
              coords[0] <= 180 && // longitude
              coords[1] >= -90 &&
              coords[1] <= 90
            ); // latitude
          },
          message: "Invalid coordinates",
        },
      },
    },

    metadata: {
      // SOS specific data
      emergencyType: {
        type: String,
        enum: ["fall", "medical", "panic", "obstacle", "manual", "automatic"],
      },

      // Sensor data at the time of event
      sensorData: {
        ultrasonicLeft: { type: Number },
        ultrasonicRight: { type: Number },
        IR: { type: Number },
        batteryLevel: { type: Number },
        gpsAccuracy: { type: Number },
      },

      // Device status
      deviceStatus: {
        uptime: { type: Number },
        memoryUsage: { type: Number },
        temperature: { type: Number },
      },

      // User action data
      userAgent: { type: String },
      ipAddress: { type: String },

      // Command related data
      command: { type: String },
      commandParameters: { type: Map, of: String },
      commandResponse: { type: String },

      // Alert specific data
      alertThreshold: { type: Number },
      alertValue: { type: Number },

      // System error data
      errorCode: { type: String },
      errorMessage: { type: String },
      stackTrace: { type: String },

      // Additional flexible metadata
      additionalData: { type: Map, of: mongoose.Schema.Types.Mixed },
    },

    notifications: {
      fcmSent: {
        type: Boolean,
        default: false,
      },
      fcmTimestamp: { type: Date },
      fcmResponse: { type: String },
      fcmError: { type: String },

      emailSent: {
        type: Boolean,
        default: false,
      },
      emailTimestamp: { type: Date },
      emailError: { type: String },

      smsSent: {
        type: Boolean,
        default: false,
      },
      smsTimestamp: { type: Date },
      smsError: { type: String },
    },

    resolution: {
      resolvedAt: { type: Date },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      resolutionNote: {
        type: String,
        maxlength: [500, "Resolution note cannot exceed 500 characters"],
      },
      resolutionActions: [
        {
          action: { type: String },
          timestamp: { type: Date, default: Date.now },
          performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        },
      ],
    },

    escalation: {
      escalated: {
        type: Boolean,
        default: false,
      },
      escalatedAt: { type: Date },
      escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      escalationReason: { type: String },
      escalationLevel: {
        type: Number,
        min: 1,
        max: 5,
        default: 1,
      },
    },

    acknowledgments: [
      {
        acknowledgedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        acknowledgedAt: {
          type: Date,
          default: Date.now,
        },
        note: { type: String },
      },
    ],

    relatedEvents: [
      {
        eventId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Event",
        },
        relationship: {
          type: String,
          enum: [
            "duplicate",
            "related",
            "caused_by",
            "causes",
            "follows",
            "precedes",
          ],
        },
      },
    ],

    archived: {
      type: Boolean,
      default: false,
    },

    archivedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for better query performance
eventSchema.index({ deviceId: 1, timestamp: -1 });
eventSchema.index({ type: 1, timestamp: -1 });
eventSchema.index({ userId: 1, timestamp: -1 });
eventSchema.index({ severity: 1, status: 1 });
eventSchema.index({ status: 1, timestamp: -1 });
eventSchema.index({ location: "2dsphere" }); // For geospatial queries
eventSchema.index({ archived: 1 });

// TTL index to automatically delete old resolved events after 90 days
eventSchema.index(
  { "resolution.resolvedAt": 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { "resolution.resolvedAt": { $exists: true } },
  }
);

// Virtual for checking if event is acknowledged
eventSchema.virtual("isAcknowledged").get(function () {
  return this.acknowledgments && this.acknowledgments.length > 0;
});

// Virtual for checking if event is resolved
eventSchema.virtual("isResolved").get(function () {
  return (
    this.status === "resolved" && this.resolution && this.resolution.resolvedAt
  );
});

// Virtual for event age in minutes
eventSchema.virtual("ageInMinutes").get(function () {
  return Math.floor((Date.now() - this.timestamp.getTime()) / (1000 * 60));
});

// Instance method to acknowledge event
eventSchema.methods.acknowledge = function (userId, note = "") {
  if (!this.isAcknowledged) {
    this.acknowledgments.push({
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
      note,
    });

    if (this.status === "active") {
      this.status = "acknowledged";
    }
  }
  return this.save();
};

// Instance method to resolve event
eventSchema.methods.resolve = function (
  userId,
  resolutionNote = "",
  actions = []
) {
  this.status = "resolved";
  this.resolution = {
    resolvedAt: new Date(),
    resolvedBy: userId,
    resolutionNote,
    resolutionActions: actions.map((action) => ({
      action,
      timestamp: new Date(),
      performedBy: userId,
    })),
  };
  return this.save();
};

// Instance method to escalate event
eventSchema.methods.escalate = function (escalatedTo, reason = "", level = 1) {
  this.escalation = {
    escalated: true,
    escalatedAt: new Date(),
    escalatedTo,
    escalationReason: reason,
    escalationLevel: Math.min(level, 5),
  };
  return this.save();
};

// Instance method to archive event
eventSchema.methods.archive = function () {
  this.archived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Static method to create SOS event
eventSchema.statics.createSOSEvent = function (
  deviceId,
  location = null,
  metadata = {}
) {
  const eventData = {
    type: "SOS",
    deviceId,
    severity: "critical",
    title: "🚨 Emergency Alert",
    description: `SOS alert triggered from device ${deviceId}`,
    metadata: {
      emergencyType: metadata.emergencyType || "manual",
      ...metadata,
    },
  };

  if (location && location.lat && location.lon) {
    eventData.location = {
      type: "Point",
      coordinates: [location.lon, location.lat],
    };
  }

  return this.create(eventData);
};

// Static method to get active events for a device
eventSchema.statics.getActiveByDevice = function (deviceId) {
  return this.find({
    deviceId,
    status: { $in: ["active", "acknowledged"] },
    archived: false,
  }).sort({ timestamp: -1 });
};

// Static method to get events by type and time range
eventSchema.statics.getByTypeAndTimeRange = function (
  type,
  startTime,
  endTime,
  deviceId = null
) {
  const query = {
    type,
    timestamp: {
      $gte: startTime,
      $lte: endTime,
    },
  };

  if (deviceId) {
    query.deviceId = deviceId;
  }

  return this.find(query).sort({ timestamp: -1 });
};

// Static method to get critical unresolved events
eventSchema.statics.getCriticalUnresolved = function () {
  return this.find({
    severity: "critical",
    status: { $in: ["active", "acknowledged"] },
    archived: false,
  }).sort({ timestamp: -1 });
};

// Static method to get event statistics
eventSchema.statics.getStatistics = function (timeRange = 24, deviceId = null) {
  const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  const matchQuery = { timestamp: { $gte: since } };

  if (deviceId) {
    matchQuery.deviceId = deviceId;
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        critical: {
          $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
        },
        unresolved: {
          $sum: {
            $cond: [{ $in: ["$status", ["active", "acknowledged"]] }, 1, 0],
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
