const Telemetry = require("../models/Telemetry");
const User = require("../models/User");
const Event = require("../models/Event");
const Validators = require("../utils/validators");

class TelemetryController {
  /**
   * Receive telemetry data from device
   * POST /api/telemetry
   */
  static async receiveTelemetry(req, res) {
    try {
      const {
        deviceId,
        sensors,
        gps,
        timestamp,
        connectivity,
        deviceStatus,
        metadata,
      } = req.body;

      // Create telemetry record
      const telemetry = new Telemetry({
        deviceId: Validators.sanitizeText(deviceId),
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        sensors: sensors || {},
        gps: gps || {},
        connectivity: connectivity || {},
        deviceStatus: deviceStatus || {},
        metadata: metadata || {},
      });

      // Save telemetry data
      await telemetry.save();

      // Update user's device last seen timestamp
      await User.findOneAndUpdate(
        { "devices.deviceId": deviceId },
        {
          $set: { "devices.$.lastSeen": new Date() },
          $setOnInsert: { "devices.$.isActive": true },
        }
      );

      // Check for alerts based on sensor data
      await TelemetryController.checkForAlerts(deviceId, telemetry);

      res.status(201).json({
        success: true,
        message: "Telemetry data received successfully",
        data: {
          id: telemetry._id,
          deviceId: telemetry.deviceId,
          timestamp: telemetry.timestamp,
        },
      });
    } catch (error) {
      console.error("Error receiving telemetry:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Invalid telemetry data",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to process telemetry data",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get telemetry data for a device
   * GET /api/telemetry/:deviceId
   */
  static async getTelemetryByDevice(req, res) {
    try {
      const { deviceId } = req.params;
      const {
        page = 1,
        limit = 50,
        startTime,
        endTime,
        includeGPS = false,
      } = req.query;

      // Validate device access for the authenticated user
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess = user.devices.some(
        (device) => device.deviceId === deviceId
      );
      if (!hasAccess && !user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      // Build query
      const query = { deviceId };

      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      if (includeGPS === "true") {
        query["gps.lat"] = { $exists: true };
        query["gps.lon"] = { $exists: true };
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const telemetryData = await Telemetry.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination
      const totalCount = await Telemetry.countDocuments(query);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: telemetryData,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching telemetry:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch telemetry data",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get latest telemetry for a device
   * GET /api/telemetry/:deviceId/latest
   */
  static async getLatestTelemetry(req, res) {
    try {
      const { deviceId } = req.params;

      // Validate device access for the authenticated user
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess = user.devices.some(
        (device) => device.deviceId === deviceId
      );
      if (!hasAccess && !user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      const latestTelemetry = await Telemetry.getLatestByDevice(deviceId, 1);

      if (!latestTelemetry || latestTelemetry.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No telemetry data found for this device",
        });
      }

      res.json({
        success: true,
        data: latestTelemetry[0],
      });
    } catch (error) {
      console.error("Error fetching latest telemetry:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch latest telemetry",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get telemetry statistics for a device
   * GET /api/telemetry/:deviceId/stats
   */
  static async getTelemetryStats(req, res) {
    try {
      const { deviceId } = req.params;
      const { timeRange = 24 } = req.query; // hours

      // Validate device access for the authenticated user
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess = user.devices.some(
        (device) => device.deviceId === deviceId
      );
      if (!hasAccess && !user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      const stats = await Telemetry.getDeviceStats(
        deviceId,
        parseInt(timeRange)
      );

      if (!stats || stats.length === 0) {
        return res.json({
          success: true,
          data: {
            deviceId,
            timeRange: parseInt(timeRange),
            count: 0,
            avgBattery: null,
            minBattery: null,
            maxBattery: null,
            criticalAlerts: 0,
            firstSeen: null,
            lastSeen: null,
          },
        });
      }

      res.json({
        success: true,
        data: {
          deviceId,
          timeRange: parseInt(timeRange),
          ...stats[0],
        },
      });
    } catch (error) {
      console.error("Error fetching telemetry stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch telemetry statistics",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get GPS track for a device
   * GET /api/telemetry/:deviceId/gps-track
   */
  static async getGPSTrack(req, res) {
    try {
      const { deviceId } = req.params;
      const { startTime, endTime, limit = 1000 } = req.query;

      // Validate device access for the authenticated user
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess = user.devices.some(
        (device) => device.deviceId === deviceId
      );
      if (!hasAccess && !user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      let gpsData;

      if (startTime && endTime) {
        gpsData = await Telemetry.getByTimeRange(
          deviceId,
          new Date(startTime),
          new Date(endTime)
        );
      } else {
        gpsData = await Telemetry.getWithGPS(deviceId, parseInt(limit));
      }

      // Filter and format GPS data
      const gpsTrack = gpsData
        .filter((record) => record.gps && record.gps.lat && record.gps.lon)
        .map((record) => ({
          timestamp: record.timestamp,
          lat: record.gps.lat,
          lon: record.gps.lon,
          altitude: record.gps.altitude,
          accuracy: record.gps.accuracy,
          speed: record.gps.speed,
          heading: record.gps.heading,
        }));

      res.json({
        success: true,
        data: {
          deviceId,
          trackPoints: gpsTrack,
          totalPoints: gpsTrack.length,
        },
      });
    } catch (error) {
      console.error("Error fetching GPS track:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch GPS track",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Check for alerts based on telemetry data
   * @param {string} deviceId - Device ID
   * @param {Object} telemetry - Telemetry data
   */
  static async checkForAlerts(deviceId, telemetry) {
    try {
      const alerts = [];

      // Low battery alert
      if (
        telemetry.sensors?.battery?.level &&
        telemetry.sensors.battery.level < 20
      ) {
        alerts.push({
          type: "LOW_BATTERY",
          severity: telemetry.sensors.battery.level < 10 ? "high" : "medium",
          title: "Low Battery Warning",
          description: `Device ${deviceId} battery level is ${telemetry.sensors.battery.level}%`,
          metadata: {
            alertThreshold: 20,
            alertValue: telemetry.sensors.battery.level,
            sensorData: { batteryLevel: telemetry.sensors.battery.level },
          },
        });
      }

      // Obstacle detection
      const ultrasonicLeft = telemetry.sensors?.ultrasonicLeft;
      const ultrasonicRight = telemetry.sensors?.ultrasonicRight;
      const minDistance = Math.min(
        ultrasonicLeft || 1000,
        ultrasonicRight || 1000
      );

      if (minDistance < 30) {
        alerts.push({
          type: "OBSTACLE_DETECTED",
          severity: minDistance < 15 ? "high" : "medium",
          title: "Obstacle Detected",
          description: `Obstacle detected at ${minDistance}cm from device ${deviceId}`,
          metadata: {
            alertThreshold: 30,
            alertValue: minDistance,
            sensorData: {
              ultrasonicLeft,
              ultrasonicRight,
              minDistance,
            },
          },
        });
      }

      // Fall detection based on IMU data
      if (telemetry.sensors?.IMU?.accelerometer) {
        const { x, y, z } = telemetry.sensors.IMU.accelerometer;
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        if (magnitude > 20) {
          // Threshold for potential fall
          alerts.push({
            type: "FALL_DETECTED",
            severity: "high",
            title: "Potential Fall Detected",
            description: `Sudden impact detected on device ${deviceId}`,
            metadata: {
              alertThreshold: 20,
              alertValue: magnitude,
              sensorData: {
                accelerometer: { x, y, z },
                magnitude,
              },
            },
          });
        }
      }

      // GPS loss detection
      if (!telemetry.gps?.lat || !telemetry.gps?.lon) {
        // Check if previous telemetry had GPS
        const previousTelemetry = await Telemetry.findOne({
          deviceId,
          timestamp: { $lt: telemetry.timestamp },
          "gps.lat": { $exists: true },
          "gps.lon": { $exists: true },
        }).sort({ timestamp: -1 });

        if (previousTelemetry) {
          alerts.push({
            type: "GPS_LOST",
            severity: "medium",
            title: "GPS Signal Lost",
            description: `GPS signal lost for device ${deviceId}`,
            metadata: {
              sensorData: telemetry.gps || {},
            },
          });
        }
      }

      // Create alert events
      for (const alertData of alerts) {
        await Event.create({
          ...alertData,
          deviceId,
          timestamp: telemetry.timestamp,
        });
      }
    } catch (error) {
      console.error("Error checking for alerts:", error);
    }
  }

  /**
   * Delete old telemetry data (admin only)
   * DELETE /api/telemetry/cleanup
   */
  static async cleanupTelemetry(req, res) {
    try {
      const { olderThanDays = 30 } = req.body;

      // Check if user is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required",
        });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

      const result = await Telemetry.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      res.json({
        success: true,
        message: `Cleaned up telemetry data older than ${olderThanDays} days`,
        data: {
          deletedCount: result.deletedCount,
          cutoffDate,
        },
      });
    } catch (error) {
      console.error("Error cleaning up telemetry:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cleanup telemetry data",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = TelemetryController;
