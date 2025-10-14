const mqttClient = require("../mqtt/mqttClient");
const Event = require("../models/Event");
const User = require("../models/User");
const Validators = require("../utils/validators");

class CommandController {
  /**
   * Send command to device
   * POST /api/commands/:deviceId
   */
  static async sendCommand(req, res) {
    try {
      const { deviceId } = req.params;
      const { command, parameters = {} } = req.body;

      // Validate device ID
      if (!Validators.isValidDeviceId(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID format",
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
        user.devices.some((device) => device.deviceId === deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      // Validate command
      const validCommands = [
        "vibrate",
        "beep",
        "led_on",
        "led_off",
        "status_check",
        "reboot",
      ];
      if (!validCommands.includes(command)) {
        return res.status(400).json({
          success: false,
          message: `Invalid command. Valid commands: ${validCommands.join(
            ", "
          )}`,
        });
      }

      // Check MQTT connection
      if (!mqttClient.isConnected()) {
        return res.status(503).json({
          success: false,
          message: "MQTT service unavailable",
        });
      }

      // Sanitize parameters
      const sanitizedParameters = {};
      for (const [key, value] of Object.entries(parameters)) {
        if (typeof value === "string") {
          sanitizedParameters[key] = Validators.sanitizeText(value);
        } else {
          sanitizedParameters[key] = value;
        }
      }

      // Send command via MQTT
      const result = await mqttClient.sendCommand(
        deviceId,
        command,
        sanitizedParameters
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to send command to device",
          error: result.error,
        });
      }

      // Log command in events
      await Event.create({
        type: "COMMAND_SENT",
        deviceId,
        userId: req.user.userId,
        severity: "low",
        title: "Command Sent",
        description: `Command '${command}' sent to device ${deviceId}`,
        metadata: {
          command,
          commandParameters: new Map(Object.entries(sanitizedParameters)),
          sentBy: req.user.userId,
          messageId: result.messageId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Command sent successfully",
        data: {
          deviceId,
          command,
          parameters: sanitizedParameters,
          messageId: result.messageId,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error("Error sending command:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send command",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get command history for a device
   * GET /api/commands/:deviceId/history
   */
  static async getCommandHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const { page = 1, limit = 20, startTime, endTime } = req.query;

      // Validate device ID
      if (!Validators.isValidDeviceId(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID format",
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
        user.devices.some((device) => device.deviceId === deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      // Build query
      const query = {
        deviceId,
        type: { $in: ["COMMAND_SENT", "COMMAND_RECEIVED"] },
      };

      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const commands = await Event.find(query)
        .populate("userId", "name email")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination
      const totalCount = await Event.countDocuments(query);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: commands,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching command history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch command history",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Send emergency commands (vibrate + beep + LED)
   * POST /api/commands/:deviceId/emergency
   */
  static async sendEmergencyCommands(req, res) {
    try {
      const { deviceId } = req.params;
      const { intensity = "high", duration = 10 } = req.body;

      // Validate device ID
      if (!Validators.isValidDeviceId(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID format",
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
        user.devices.some((device) => device.deviceId === deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      // Check MQTT connection
      if (!mqttClient.isConnected()) {
        return res.status(503).json({
          success: false,
          message: "MQTT service unavailable",
        });
      }

      const results = [];
      const commands = [
        { command: "led_on", parameters: { pattern: "emergency", duration } },
        { command: "vibrate", parameters: { intensity, duration } },
        { command: "beep", parameters: { pattern: "emergency", duration } },
      ];

      // Send multiple commands
      for (const { command, parameters } of commands) {
        try {
          const result = await mqttClient.sendCommand(
            deviceId,
            command,
            parameters
          );
          results.push({
            command,
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          });

          // Log each command
          await Event.create({
            type: "COMMAND_SENT",
            deviceId,
            userId: req.user.userId,
            severity: "high",
            title: "Emergency Command Sent",
            description: `Emergency command '${command}' sent to device ${deviceId}`,
            metadata: {
              command,
              commandParameters: new Map(Object.entries(parameters)),
              sentBy: req.user.userId,
              messageId: result.messageId,
              emergencySequence: true,
            },
          });
        } catch (error) {
          results.push({
            command,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      res.status(successCount > 0 ? 200 : 500).json({
        success: successCount > 0,
        message: `Emergency commands sent: ${successCount}/${commands.length} successful`,
        data: {
          deviceId,
          commands: results,
          successCount,
          totalCommands: commands.length,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error("Error sending emergency commands:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send emergency commands",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get device status via command
   * POST /api/commands/:deviceId/status
   */
  static async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;

      // Validate device ID
      if (!Validators.isValidDeviceId(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID format",
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
        user.devices.some((device) => device.deviceId === deviceId) ||
        user.isAdmin;
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this device",
        });
      }

      // Check MQTT connection
      if (!mqttClient.isConnected()) {
        return res.status(503).json({
          success: false,
          message: "MQTT service unavailable",
        });
      }

      // Send status check command
      const result = await mqttClient.sendCommand(deviceId, "status_check", {
        requestId: `status_${Date.now()}`,
        requestedBy: req.user.userId,
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Failed to request device status",
          error: result.error,
        });
      }

      // Log status request
      await Event.create({
        type: "COMMAND_SENT",
        deviceId,
        userId: req.user.userId,
        severity: "low",
        title: "Status Check Requested",
        description: `Status check requested for device ${deviceId}`,
        metadata: {
          command: "status_check",
          sentBy: req.user.userId,
          messageId: result.messageId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Status check command sent. Device will respond via MQTT.",
        data: {
          deviceId,
          messageId: result.messageId,
          timestamp: new Date(),
          note: "Check device events for the response",
        },
      });
    } catch (error) {
      console.error("Error requesting device status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to request device status",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Send bulk commands to multiple devices (admin only)
   * POST /api/commands/bulk
   */
  static async sendBulkCommands(req, res) {
    try {
      const { deviceIds, command, parameters = {} } = req.body;

      // Check admin access
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required for bulk commands",
        });
      }

      // Validate input
      if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Device IDs array is required",
        });
      }

      const validCommands = [
        "vibrate",
        "beep",
        "led_on",
        "led_off",
        "status_check",
        "reboot",
      ];
      if (!validCommands.includes(command)) {
        return res.status(400).json({
          success: false,
          message: `Invalid command. Valid commands: ${validCommands.join(
            ", "
          )}`,
        });
      }

      // Check MQTT connection
      if (!mqttClient.isConnected()) {
        return res.status(503).json({
          success: false,
          message: "MQTT service unavailable",
        });
      }

      const results = [];

      // Send command to each device
      for (const deviceId of deviceIds) {
        try {
          if (!Validators.isValidDeviceId(deviceId)) {
            results.push({
              deviceId,
              success: false,
              error: "Invalid device ID format",
            });
            continue;
          }

          const result = await mqttClient.sendCommand(
            deviceId,
            command,
            parameters
          );
          results.push({
            deviceId,
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          });

          // Log command for each device
          if (result.success) {
            await Event.create({
              type: "COMMAND_SENT",
              deviceId,
              userId: req.user.userId,
              severity: "low",
              title: "Bulk Command Sent",
              description: `Bulk command '${command}' sent to device ${deviceId}`,
              metadata: {
                command,
                commandParameters: new Map(Object.entries(parameters)),
                sentBy: req.user.userId,
                messageId: result.messageId,
                bulkOperation: true,
              },
            });
          }
        } catch (error) {
          results.push({
            deviceId,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      res.status(successCount > 0 ? 200 : 500).json({
        success: successCount > 0,
        message: `Bulk commands sent: ${successCount}/${deviceIds.length} successful`,
        data: {
          command,
          parameters,
          results,
          successCount,
          totalDevices: deviceIds.length,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error("Error sending bulk commands:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send bulk commands",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get available commands and their descriptions
   * GET /api/commands/available
   */
  static async getAvailableCommands(req, res) {
    try {
      const commands = [
        {
          command: "vibrate",
          description: "Activate vibration motor",
          parameters: [
            {
              name: "intensity",
              type: "string",
              options: ["low", "medium", "high"],
              default: "medium",
            },
            {
              name: "duration",
              type: "number",
              description: "Duration in seconds",
              default: 3,
            },
          ],
        },
        {
          command: "beep",
          description: "Activate buzzer/beeper",
          parameters: [
            {
              name: "pattern",
              type: "string",
              options: ["single", "double", "emergency"],
              default: "single",
            },
            {
              name: "duration",
              type: "number",
              description: "Duration in seconds",
              default: 2,
            },
          ],
        },
        {
          command: "led_on",
          description: "Turn on LED indicators",
          parameters: [
            {
              name: "pattern",
              type: "string",
              options: ["solid", "blink", "emergency"],
              default: "solid",
            },
            {
              name: "color",
              type: "string",
              options: ["red", "green", "blue", "white"],
              default: "white",
            },
            {
              name: "duration",
              type: "number",
              description: "Duration in seconds (0 = indefinite)",
              default: 0,
            },
          ],
        },
        {
          command: "led_off",
          description: "Turn off LED indicators",
          parameters: [],
        },
        {
          command: "status_check",
          description: "Request device status update",
          parameters: [],
        },
        {
          command: "reboot",
          description: "Restart the device (use with caution)",
          parameters: [
            {
              name: "delay",
              type: "number",
              description: "Delay before reboot in seconds",
              default: 5,
            },
          ],
        },
      ];

      res.json({
        success: true,
        data: {
          commands,
          totalCommands: commands.length,
          note: "All parameters are optional and have default values",
        },
      });
    } catch (error) {
      console.error("Error fetching available commands:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch available commands",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = CommandController;
