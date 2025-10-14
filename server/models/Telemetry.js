const mongoose = require("mongoose");

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: [true, "Device ID is required"],
      trim: true,
      maxlength: [50, "Device ID cannot exceed 50 characters"],
    },

    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },

    sensors: {
      ultrasonicLeft: {
        type: Number,
        min: [0, "Ultrasonic left sensor value cannot be negative"],
        max: [1000, "Ultrasonic left sensor value cannot exceed 1000 cm"],
      },

      ultrasonicRight: {
        type: Number,
        min: [0, "Ultrasonic right sensor value cannot be negative"],
        max: [1000, "Ultrasonic right sensor value cannot exceed 1000 cm"],
      },

      IR: {
        type: Number,
        min: [0, "IR sensor value cannot be negative"],
        max: [1000, "IR sensor value cannot exceed 1000 cm"],
      },

      IMU: {
        accelerometer: {
          x: { type: Number },
          y: { type: Number },
          z: { type: Number },
        },
        gyroscope: {
          x: { type: Number },
          y: { type: Number },
          z: { type: Number },
        },
        magnetometer: {
          x: { type: Number },
          y: { type: Number },
          z: { type: Number },
        },
        temperature: { type: Number },
      },

      battery: {
        level: {
          type: Number,
          min: [0, "Battery level cannot be negative"],
          max: [100, "Battery level cannot exceed 100%"],
        },
        voltage: { type: Number },
        charging: { type: Boolean, default: false },
      },

      environment: {
        temperature: { type: Number },
        humidity: { type: Number },
        pressure: { type: Number },
        lightLevel: { type: Number },
      },
    },

    gps: {
      lat: {
        type: Number,
        min: [-90, "Latitude must be between -90 and 90"],
        max: [90, "Latitude must be between -90 and 90"],
      },

      lon: {
        type: Number,
        min: [-180, "Longitude must be between -180 and 180"],
        max: [180, "Longitude must be between -180 and 180"],
      },

      altitude: { type: Number },
      accuracy: { type: Number },
      speed: { type: Number },
      heading: { type: Number },
      satellites: { type: Number },
    },

    connectivity: {
      wifi: {
        connected: { type: Boolean, default: false },
        ssid: { type: String },
        signalStrength: { type: Number },
      },
      cellular: {
        connected: { type: Boolean, default: false },
        signalStrength: { type: Number },
        carrier: { type: String },
      },
      bluetooth: {
        connected: { type: Boolean, default: false },
        pairedDevices: { type: Number, default: 0 },
      },
    },

    deviceStatus: {
      uptime: { type: Number }, // in seconds
      memoryUsage: { type: Number }, // in MB
      cpuUsage: { type: Number }, // in percentage
      diskSpace: { type: Number }, // in MB
      systemLoad: { type: Number },
    },

    metadata: {
      version: { type: String }, // firmware version
      model: { type: String },
      serialNumber: { type: String },
      configuration: { type: Map, of: String },
    },

    alerts: [
      {
        type: {
          type: String,
          enum: [
            "obstacle_detected",
            "low_battery",
            "gps_lost",
            "sensor_malfunction",
            "fall_detected",
            "maintenance_required",
          ],
          required: true,
        },
        severity: {
          type: String,
          enum: ["low", "medium", "high", "critical"],
          default: "medium",
        },
        message: { type: String },
        timestamp: { type: Date, default: Date.now },
        acknowledged: { type: Boolean, default: false },
      },
    ],

    processed: {
      type: Boolean,
      default: false,
    },

    processingErrors: [
      {
        error: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
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
telemetrySchema.index({ deviceId: 1, timestamp: -1 });
telemetrySchema.index({ timestamp: -1 });
telemetrySchema.index({ "gps.lat": 1, "gps.lon": 1 });
telemetrySchema.index({ processed: 1 });
telemetrySchema.index({ "alerts.type": 1, "alerts.acknowledged": 1 });

// TTL index to automatically delete old telemetry data after 30 days
telemetrySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// Virtual for GPS coordinates as GeoJSON
telemetrySchema.virtual("location").get(function () {
  if (this.gps && this.gps.lat !== undefined && this.gps.lon !== undefined) {
    return {
      type: "Point",
      coordinates: [this.gps.lon, this.gps.lat],
    };
  }
  return null;
});

// Instance method to check if device has critical alerts
telemetrySchema.methods.hasCriticalAlerts = function () {
  return this.alerts.some(
    (alert) => alert.severity === "critical" && !alert.acknowledged
  );
};

// Instance method to get unacknowledged alerts
telemetrySchema.methods.getUnacknowledgedAlerts = function () {
  return this.alerts.filter((alert) => !alert.acknowledged);
};

// Instance method to acknowledge an alert
telemetrySchema.methods.acknowledgeAlert = function (alertId) {
  const alert = this.alerts.id(alertId);
  if (alert) {
    alert.acknowledged = true;
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to get latest telemetry for a device
telemetrySchema.statics.getLatestByDevice = function (deviceId, limit = 1) {
  return this.find({ deviceId }).sort({ timestamp: -1 }).limit(limit);
};

// Static method to get telemetry within a time range
telemetrySchema.statics.getByTimeRange = function (
  deviceId,
  startTime,
  endTime
) {
  return this.find({
    deviceId,
    timestamp: {
      $gte: startTime,
      $lte: endTime,
    },
  }).sort({ timestamp: -1 });
};

// Static method to get telemetry with GPS data
telemetrySchema.statics.getWithGPS = function (deviceId, limit = 100) {
  return this.find({
    deviceId,
    "gps.lat": { $exists: true },
    "gps.lon": { $exists: true },
  })
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to get devices with low battery
telemetrySchema.statics.getLowBatteryDevices = function (threshold = 20) {
  return this.aggregate([
    {
      $match: {
        "sensors.battery.level": { $lt: threshold },
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // last hour
      },
    },
    {
      $group: {
        _id: "$deviceId",
        latestBattery: { $first: "$sensors.battery.level" },
        latestTimestamp: { $first: "$timestamp" },
      },
    },
  ]);
};

// Static method to get summary statistics for a device
telemetrySchema.statics.getDeviceStats = function (deviceId, timeRange = 24) {
  const since = new Date(Date.now() - timeRange * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        deviceId,
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$deviceId",
        count: { $sum: 1 },
        avgBattery: { $avg: "$sensors.battery.level" },
        minBattery: { $min: "$sensors.battery.level" },
        maxBattery: { $max: "$sensors.battery.level" },
        criticalAlerts: {
          $sum: {
            $size: {
              $filter: {
                input: "$alerts",
                cond: { $eq: ["$$this.severity", "critical"] },
              },
            },
          },
        },
        firstSeen: { $min: "$timestamp" },
        lastSeen: { $max: "$timestamp" },
      },
    },
  ]);
};

const Telemetry = mongoose.model("Telemetry", telemetrySchema);

module.exports = Telemetry;
