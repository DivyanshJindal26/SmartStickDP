const Event = require("../models/Event");
const User = require("../models/User");
const fcmService = require("../utils/fcm");
const Validators = require("../utils/validators");

class SOSController {
  /**
   * Receive SOS alert from device
   * POST /api/sos
   */
  static async receiveSOS(req, res) {
    try {
      const { deviceId, gps, metadata, timestamp } = req.body;

      console.log(`🚨 SOS ALERT received from device: ${deviceId}`);

      // Create SOS event
      const sosEvent = await Event.createSOSEvent(
        Validators.sanitizeText(deviceId),
        gps,
        {
          emergencyType: metadata?.emergencyType || "manual",
          sensorData: metadata?.sensorData || {},
          timestamp: timestamp || new Date(),
          ...metadata,
        }
      );

      // Find all users associated with this device
      const users = await User.findUsersWithFCMByDevice(deviceId);

      if (users.length === 0) {
        console.warn(`⚠️ No users found for device ${deviceId}`);
        return res.status(200).json({
          success: true,
          message: "SOS alert received but no users to notify",
          data: {
            eventId: sosEvent._id,
            deviceId,
            timestamp: sosEvent.timestamp,
          },
        });
      }

      // Send FCM notifications to all associated users
      const fcmTokens = users
        .map((user) => user.fcmToken)
        .filter((token) => token);

      if (fcmTokens.length > 0) {
        const fcmResult = await fcmService.sendSOSNotification(
          fcmTokens,
          deviceId,
          gps
        );

        // Update event with notification status
        sosEvent.notifications.fcmSent = fcmResult.success;
        sosEvent.notifications.fcmTimestamp = new Date();

        if (fcmResult.success) {
          sosEvent.notifications.fcmResponse = JSON.stringify(fcmResult);
          console.log(
            `✅ SOS notifications sent successfully: ${fcmResult.successCount}/${fcmTokens.length}`
          );
        } else {
          sosEvent.notifications.fcmError = fcmResult.error;
          console.error(
            `❌ Failed to send SOS notifications: ${fcmResult.error}`
          );
        }

        await sosEvent.save();
      }

      // Log emergency contacts for manual notification if needed
      const emergencyContacts = users.reduce((contacts, user) => {
        return contacts.concat(user.emergencyContacts || []);
      }, []);

      if (emergencyContacts.length > 0) {
        console.log(
          `📞 Emergency contacts available for device ${deviceId}:`,
          emergencyContacts.map((contact) => ({
            name: contact.name,
            phone: contact.phone,
          }))
        );
      }

      res.status(201).json({
        success: true,
        message: "SOS alert processed successfully",
        data: {
          eventId: sosEvent._id,
          deviceId,
          timestamp: sosEvent.timestamp,
          notificationsSent: fcmTokens.length,
          emergencyContactsAvailable: emergencyContacts.length,
        },
      });
    } catch (error) {
      console.error("Error processing SOS alert:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Invalid SOS data",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to process SOS alert",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get SOS events for user's devices
   * GET /api/sos
   */
  static async getSOSEvents(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        deviceId,
        startTime,
        endTime,
      } = req.query;

      // Get user's devices
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const userDeviceIds = user.devices.map((device) => device.deviceId);

      // Build query
      const query = {
        type: "SOS",
      };

      // Filter by user's devices unless admin
      if (!user.isAdmin) {
        query.deviceId = { $in: userDeviceIds };
      }

      // Apply additional filters
      if (deviceId) {
        query.deviceId = deviceId;
      }

      if (status) {
        query.status = status;
      }

      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sosEvents = await Event.find(query)
        .populate("userId", "name email")
        .populate("resolution.resolvedBy", "name email")
        .populate("acknowledgments.acknowledgedBy", "name email")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination
      const totalCount = await Event.countDocuments(query);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: sosEvents,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching SOS events:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch SOS events",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get specific SOS event details
   * GET /api/sos/:eventId
   */
  static async getSOSEvent(req, res) {
    try {
      const { eventId } = req.params;

      if (!Validators.isValidObjectId(eventId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      const sosEvent = await Event.findById(eventId)
        .populate("userId", "name email")
        .populate("resolution.resolvedBy", "name email")
        .populate("acknowledgments.acknowledgedBy", "name email")
        .lean();

      if (!sosEvent) {
        return res.status(404).json({
          success: false,
          message: "SOS event not found",
        });
      }

      if (sosEvent.type !== "SOS") {
        return res.status(400).json({
          success: false,
          message: "Event is not an SOS alert",
        });
      }

      // Check if user has access to this device
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess =
        user.devices.some((device) => device.deviceId === sosEvent.deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this SOS event",
        });
      }

      res.json({
        success: true,
        data: sosEvent,
      });
    } catch (error) {
      console.error("Error fetching SOS event:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch SOS event",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Acknowledge SOS event
   * POST /api/sos/:eventId/acknowledge
   */
  static async acknowledgeSOS(req, res) {
    try {
      const { eventId } = req.params;
      const { note = "" } = req.body;

      if (!Validators.isValidObjectId(eventId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      const sosEvent = await Event.findById(eventId);

      if (!sosEvent) {
        return res.status(404).json({
          success: false,
          message: "SOS event not found",
        });
      }

      if (sosEvent.type !== "SOS") {
        return res.status(400).json({
          success: false,
          message: "Event is not an SOS alert",
        });
      }

      // Check if user has access to this device
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess =
        user.devices.some((device) => device.deviceId === sosEvent.deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this SOS event",
        });
      }

      // Acknowledge the event
      await sosEvent.acknowledge(
        req.user.userId,
        Validators.sanitizeText(note)
      );

      res.json({
        success: true,
        message: "SOS event acknowledged successfully",
        data: {
          eventId: sosEvent._id,
          acknowledgedAt: new Date(),
          acknowledgedBy: req.user.userId,
        },
      });
    } catch (error) {
      console.error("Error acknowledging SOS event:", error);
      res.status(500).json({
        success: false,
        message: "Failed to acknowledge SOS event",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Resolve SOS event
   * POST /api/sos/:eventId/resolve
   */
  static async resolveSOS(req, res) {
    try {
      const { eventId } = req.params;
      const { resolutionNote = "", actions = [] } = req.body;

      if (!Validators.isValidObjectId(eventId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      const sosEvent = await Event.findById(eventId);

      if (!sosEvent) {
        return res.status(404).json({
          success: false,
          message: "SOS event not found",
        });
      }

      if (sosEvent.type !== "SOS") {
        return res.status(400).json({
          success: false,
          message: "Event is not an SOS alert",
        });
      }

      // Check if user has access to this device
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess =
        user.devices.some((device) => device.deviceId === sosEvent.deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this SOS event",
        });
      }

      // Resolve the event
      await sosEvent.resolve(
        req.user.userId,
        Validators.sanitizeText(resolutionNote),
        actions.map((action) => Validators.sanitizeText(action))
      );

      res.json({
        success: true,
        message: "SOS event resolved successfully",
        data: {
          eventId: sosEvent._id,
          resolvedAt: new Date(),
          resolvedBy: req.user.userId,
        },
      });
    } catch (error) {
      console.error("Error resolving SOS event:", error);
      res.status(500).json({
        success: false,
        message: "Failed to resolve SOS event",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get SOS statistics
   * GET /api/sos/stats
   */
  static async getSOSStats(req, res) {
    try {
      const { timeRange = 24, deviceId } = req.query; // hours

      // Get user's devices
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const userDeviceIds = user.devices.map((device) => device.deviceId);

      // Build query
      const since = new Date(Date.now() - parseInt(timeRange) * 60 * 60 * 1000);
      const matchQuery = {
        type: "SOS",
        timestamp: { $gte: since },
      };

      // Filter by user's devices unless admin
      if (!user.isAdmin) {
        matchQuery.deviceId = { $in: userDeviceIds };
      }

      // Apply device filter if specified
      if (deviceId) {
        matchQuery.deviceId = deviceId;
      }

      const stats = await Event.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalSOS: { $sum: 1 },
            critical: {
              $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
            },
            acknowledged: {
              $sum: {
                $cond: [{ $gt: [{ $size: "$acknowledgments" }, 0] }, 1, 0],
              },
            },
            resolved: {
              $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
            },
            avgResponseTime: {
              $avg: {
                $subtract: [
                  {
                    $ifNull: [
                      { $arrayElemAt: ["$acknowledgments.acknowledgedAt", 0] },
                      "$timestamp",
                    ],
                  },
                  "$timestamp",
                ],
              },
            },
          },
        },
      ]);

      const deviceStats = await Event.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: "$deviceId",
            count: { $sum: 1 },
            lastSOS: { $max: "$timestamp" },
          },
        },
        { $sort: { count: -1 } },
      ]);

      const result =
        stats.length > 0
          ? stats[0]
          : {
              totalSOS: 0,
              critical: 0,
              acknowledged: 0,
              resolved: 0,
              avgResponseTime: 0,
            };

      res.json({
        success: true,
        data: {
          timeRange: parseInt(timeRange),
          summary: {
            ...result,
            avgResponseTimeMinutes: result.avgResponseTime
              ? Math.round(result.avgResponseTime / (1000 * 60))
              : 0,
          },
          deviceBreakdown: deviceStats,
        },
      });
    } catch (error) {
      console.error("Error fetching SOS statistics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch SOS statistics",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Escalate SOS event
   * POST /api/sos/:eventId/escalate
   */
  static async escalateSOS(req, res) {
    try {
      const { eventId } = req.params;
      const { escalatedTo, reason = "", level = 1 } = req.body;

      if (!Validators.isValidObjectId(eventId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid event ID",
        });
      }

      if (escalatedTo && !Validators.isValidObjectId(escalatedTo)) {
        return res.status(400).json({
          success: false,
          message: "Invalid escalatedTo user ID",
        });
      }

      const sosEvent = await Event.findById(eventId);

      if (!sosEvent) {
        return res.status(404).json({
          success: false,
          message: "SOS event not found",
        });
      }

      if (sosEvent.type !== "SOS") {
        return res.status(400).json({
          success: false,
          message: "Event is not an SOS alert",
        });
      }

      // Check if user has admin access or owns the device
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const hasAccess =
        user.devices.some((device) => device.deviceId === sosEvent.deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this SOS event",
        });
      }

      // Escalate the event
      await sosEvent.escalate(
        escalatedTo,
        Validators.sanitizeText(reason),
        parseInt(level)
      );

      res.json({
        success: true,
        message: "SOS event escalated successfully",
        data: {
          eventId: sosEvent._id,
          escalatedAt: new Date(),
          escalatedTo,
          escalationLevel: parseInt(level),
        },
      });
    } catch (error) {
      console.error("Error escalating SOS event:", error);
      res.status(500).json({
        success: false,
        message: "Failed to escalate SOS event",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = SOSController;
