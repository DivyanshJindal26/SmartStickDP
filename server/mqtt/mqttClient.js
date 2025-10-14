const mqtt = require("mqtt");
const config = require("../config");
const Event = require("../models/Event");
const Telemetry = require("../models/Telemetry");
const User = require("../models/User");
const fcmService = require("../utils/fcm");

class MQTTClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.subscriptions = new Set();
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * Initialize MQTT client and connect to broker
   */
  async connect() {
    try {
      console.log(`🔌 Connecting to MQTT broker: ${config.mqtt.brokerUrl}`);

      this.client = mqtt.connect(config.mqtt.brokerUrl, {
        clientId: config.mqtt.clientId,
        ...config.mqtt.options,
      });

      this.setupEventHandlers();

      return new Promise((resolve, reject) => {
        this.client.on("connect", () => {
          console.log("✅ MQTT client connected successfully");
          this.connected = true;
          this.reconnectAttempts = 0;
          this.setupSubscriptions();
          resolve();
        });

        this.client.on("error", (error) => {
          console.error("❌ MQTT connection error:", error);
          reject(error);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error("MQTT connection timeout"));
          }
        }, 30000);
      });
    } catch (error) {
      console.error("❌ Failed to initialize MQTT client:", error);
      throw error;
    }
  }

  /**
   * Setup MQTT event handlers
   */
  setupEventHandlers() {
    this.client.on("connect", () => {
      console.log("✅ MQTT connected");
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on("disconnect", () => {
      console.warn("⚠️ MQTT disconnected");
      this.connected = false;
    });

    this.client.on("reconnect", () => {
      this.reconnectAttempts++;
      console.log(
        `🔄 MQTT reconnecting... (attempt ${this.reconnectAttempts})`
      );

      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        console.error("❌ Max MQTT reconnection attempts reached");
        this.client.end();
      }
    });

    this.client.on("error", (error) => {
      console.error("❌ MQTT error:", error);
    });

    this.client.on("offline", () => {
      console.warn("⚠️ MQTT client offline");
      this.connected = false;
    });

    this.client.on("message", this.handleMessage.bind(this));
  }

  /**
   * Setup default MQTT subscriptions
   */
  async setupSubscriptions() {
    try {
      // Subscribe to all device telemetry
      await this.subscribe(
        "stick/+/telemetry",
        this.handleTelemetryMessage.bind(this)
      );

      // Subscribe to all SOS alerts
      await this.subscribe("stick/+/sos", this.handleSOSMessage.bind(this));

      // Subscribe to device status updates
      await this.subscribe(
        "stick/+/status",
        this.handleStatusMessage.bind(this)
      );

      // Subscribe to device responses
      await this.subscribe(
        "stick/+/response",
        this.handleResponseMessage.bind(this)
      );

      console.log("✅ MQTT subscriptions setup complete");
    } catch (error) {
      console.error("❌ Failed to setup MQTT subscriptions:", error);
    }
  }

  /**
   * Subscribe to a topic with message handler
   * @param {string} topic - MQTT topic
   * @param {Function} handler - Message handler function
   */
  async subscribe(topic, handler = null) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("MQTT client not connected"));
        return;
      }

      this.client.subscribe(topic, (error) => {
        if (error) {
          console.error(`❌ Failed to subscribe to ${topic}:`, error);
          reject(error);
        } else {
          console.log(`✅ Subscribed to MQTT topic: ${topic}`);
          this.subscriptions.add(topic);

          if (handler) {
            this.messageHandlers.set(topic, handler);
          }

          resolve();
        }
      });
    });
  }

  /**
   * Publish message to MQTT topic
   * @param {string} topic - MQTT topic
   * @param {Object|string} message - Message payload
   * @param {Object} options - MQTT publish options
   */
  async publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("MQTT client not connected"));
        return;
      }

      const payload =
        typeof message === "string" ? message : JSON.stringify(message);

      this.client.publish(topic, payload, { qos: 1, ...options }, (error) => {
        if (error) {
          console.error(`❌ Failed to publish to ${topic}:`, error);
          reject(error);
        } else {
          console.log(`✅ Published to MQTT topic: ${topic}`);
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming MQTT messages
   * @param {string} topic - MQTT topic
   * @param {Buffer} message - Message payload
   */
  async handleMessage(topic, message) {
    try {
      const messageStr = message.toString();
      console.log(`📥 MQTT message received on ${topic}:`, messageStr);

      // Find specific handler for this topic pattern
      for (const [pattern, handler] of this.messageHandlers) {
        if (this.topicMatches(topic, pattern)) {
          await handler(topic, messageStr);
          return;
        }
      }

      // Default handling if no specific handler found
      console.log(`⚠️ No handler found for MQTT topic: ${topic}`);
    } catch (error) {
      console.error("❌ Error handling MQTT message:", error);
    }
  }

  /**
   * Handle telemetry messages from devices
   * @param {string} topic - MQTT topic
   * @param {string} message - Message payload
   */
  async handleTelemetryMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const telemetryData = JSON.parse(message);

      // Create telemetry record
      const telemetry = new Telemetry({
        deviceId,
        timestamp: telemetryData.timestamp || new Date(),
        sensors: telemetryData.sensors || {},
        gps: telemetryData.gps || {},
        connectivity: telemetryData.connectivity || {},
        deviceStatus: telemetryData.deviceStatus || {},
        metadata: telemetryData.metadata || {},
      });

      await telemetry.save();

      // Update user's device last seen
      await User.findOneAndUpdate(
        { "devices.deviceId": deviceId },
        {
          $set: { "devices.$.lastSeen": new Date() },
          $setOnInsert: { "devices.$.isActive": true },
        }
      );

      // Check for low battery alert
      if (telemetryData.sensors?.battery?.level < 20) {
        await this.handleLowBatteryAlert(
          deviceId,
          telemetryData.sensors.battery.level
        );
      }

      // Check for critical sensor readings
      await this.checkCriticalSensorReadings(deviceId, telemetryData);

      console.log(`✅ Telemetry processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling telemetry message:", error);
    }
  }

  /**
   * Handle SOS messages from devices
   * @param {string} topic - MQTT topic
   * @param {string} message - Message payload
   */
  async handleSOSMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const sosData = JSON.parse(message);

      console.log(`🚨 SOS ALERT from device: ${deviceId}`);

      // Create SOS event
      const sosEvent = await Event.createSOSEvent(deviceId, sosData.gps, {
        emergencyType: sosData.type || "manual",
        sensorData: sosData.sensors || {},
        timestamp: sosData.timestamp || new Date(),
      });

      // Find users associated with this device
      const users = await User.findUsersWithFCMByDevice(deviceId);

      if (users.length > 0) {
        // Send FCM notifications to all associated users
        const fcmTokens = users
          .map((user) => user.fcmToken)
          .filter((token) => token);

        if (fcmTokens.length > 0) {
          const fcmResult = await fcmService.sendSOSNotification(
            fcmTokens,
            deviceId,
            sosData.gps
          );

          // Update event with notification status
          sosEvent.notifications.fcmSent = fcmResult.success;
          sosEvent.notifications.fcmTimestamp = new Date();
          if (fcmResult.success) {
            sosEvent.notifications.fcmResponse = JSON.stringify(fcmResult);
          } else {
            sosEvent.notifications.fcmError = fcmResult.error;
          }
          await sosEvent.save();
        }
      }

      console.log(`✅ SOS alert processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling SOS message:", error);
    }
  }

  /**
   * Handle device status messages
   * @param {string} topic - MQTT topic
   * @param {string} message - Message payload
   */
  async handleStatusMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const statusData = JSON.parse(message);

      console.log(`📊 Status update from device: ${deviceId}`, statusData);

      // Create status event
      await Event.create({
        type: statusData.online ? "DEVICE_ONLINE" : "DEVICE_OFFLINE",
        deviceId,
        severity: statusData.online ? "low" : "medium",
        title: `Device ${statusData.online ? "Online" : "Offline"}`,
        description: `Device ${deviceId} is now ${
          statusData.online ? "online" : "offline"
        }`,
        metadata: {
          deviceStatus: statusData,
          additionalData: new Map(Object.entries(statusData)),
        },
      });

      // Update user's device status
      await User.findOneAndUpdate(
        { "devices.deviceId": deviceId },
        {
          $set: {
            "devices.$.lastSeen": new Date(),
            "devices.$.isActive": statusData.online,
          },
        }
      );
    } catch (error) {
      console.error("❌ Error handling status message:", error);
    }
  }

  /**
   * Handle device response messages
   * @param {string} topic - MQTT topic
   * @param {string} message - Message payload
   */
  async handleResponseMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const responseData = JSON.parse(message);

      console.log(`📬 Response from device: ${deviceId}`, responseData);

      // Create command response event
      await Event.create({
        type: "COMMAND_RECEIVED",
        deviceId,
        severity: "low",
        title: "Command Response",
        description: `Device ${deviceId} responded to command`,
        metadata: {
          command: responseData.command,
          commandResponse: responseData.response || responseData.status,
          additionalData: new Map(Object.entries(responseData)),
        },
      });
    } catch (error) {
      console.error("❌ Error handling response message:", error);
    }
  }

  /**
   * Send command to device via MQTT
   * @param {string} deviceId - Device ID
   * @param {string} command - Command to send
   * @param {Object} parameters - Command parameters
   */
  async sendCommand(deviceId, command, parameters = {}) {
    try {
      const topic = `stick/${deviceId}/command`;
      const commandMessage = {
        command,
        parameters,
        timestamp: new Date().toISOString(),
        messageId: this.generateMessageId(),
      };

      await this.publish(topic, commandMessage);

      // Create command sent event
      await Event.create({
        type: "COMMAND_SENT",
        deviceId,
        severity: "low",
        title: "Command Sent",
        description: `Command '${command}' sent to device ${deviceId}`,
        metadata: {
          command,
          commandParameters: new Map(Object.entries(parameters)),
          additionalData: new Map(Object.entries(commandMessage)),
        },
      });

      console.log(`✅ Command sent to device ${deviceId}: ${command}`);
      return { success: true, messageId: commandMessage.messageId };
    } catch (error) {
      console.error(`❌ Failed to send command to device ${deviceId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle low battery alert
   * @param {string} deviceId - Device ID
   * @param {number} batteryLevel - Battery level percentage
   */
  async handleLowBatteryAlert(deviceId, batteryLevel) {
    try {
      // Check if we already have a recent low battery alert
      const recentAlert = await Event.findOne({
        type: "LOW_BATTERY",
        deviceId,
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      });

      if (recentAlert) {
        return; // Don't spam alerts
      }

      // Create low battery event
      await Event.create({
        type: "LOW_BATTERY",
        deviceId,
        severity: batteryLevel < 10 ? "high" : "medium",
        title: "Low Battery Warning",
        description: `Device ${deviceId} battery level is ${batteryLevel}%`,
        metadata: {
          alertThreshold: 20,
          alertValue: batteryLevel,
          sensorData: { batteryLevel },
        },
      });

      // Send notification to users
      const users = await User.findUsersWithFCMByDevice(deviceId);
      const fcmTokens = users
        .map((user) => user.fcmToken)
        .filter((token) => token);

      if (fcmTokens.length > 0) {
        await fcmService.sendMulticastNotification(
          fcmTokens,
          "Low Battery Warning",
          `Your Smart Stick battery is at ${batteryLevel}%. Please charge soon.`,
          {
            type: "low_battery",
            deviceId,
            batteryLevel: batteryLevel.toString(),
          }
        );
      }
    } catch (error) {
      console.error("❌ Error handling low battery alert:", error);
    }
  }

  /**
   * Check for critical sensor readings and create alerts
   * @param {string} deviceId - Device ID
   * @param {Object} telemetryData - Telemetry data
   */
  async checkCriticalSensorReadings(deviceId, telemetryData) {
    try {
      const alerts = [];

      // Check for obstacles (close proximity readings)
      if (
        telemetryData.sensors?.ultrasonicLeft < 30 ||
        telemetryData.sensors?.ultrasonicRight < 30
      ) {
        alerts.push({
          type: "OBSTACLE_DETECTED",
          severity: "medium",
          title: "Obstacle Detected",
          description: `Obstacle detected near device ${deviceId}`,
          metadata: {
            sensorData: telemetryData.sensors,
            alertValue: Math.min(
              telemetryData.sensors.ultrasonicLeft || 1000,
              telemetryData.sensors.ultrasonicRight || 1000
            ),
            alertThreshold: 30,
          },
        });
      }

      // Check for fall detection (if IMU data suggests sudden impact)
      if (telemetryData.sensors?.IMU?.accelerometer) {
        const { x, y, z } = telemetryData.sensors.IMU.accelerometer;
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        if (magnitude > 20) {
          // Threshold for potential fall
          alerts.push({
            type: "FALL_DETECTED",
            severity: "high",
            title: "Potential Fall Detected",
            description: `Sudden impact detected on device ${deviceId}`,
            metadata: {
              sensorData: telemetryData.sensors,
              alertValue: magnitude,
              alertThreshold: 20,
            },
          });
        }
      }

      // Create alert events
      for (const alert of alerts) {
        await Event.create({
          ...alert,
          deviceId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("❌ Error checking critical sensor readings:", error);
    }
  }

  /**
   * Extract device ID from MQTT topic
   * @param {string} topic - MQTT topic
   * @returns {string} - Device ID
   */
  extractDeviceId(topic) {
    const parts = topic.split("/");
    return parts[1]; // assuming format: stick/{deviceId}/{messageType}
  }

  /**
   * Check if topic matches pattern (supports + wildcard)
   * @param {string} topic - Actual topic
   * @param {string} pattern - Topic pattern with wildcards
   * @returns {boolean} - True if matches
   */
  topicMatches(topic, pattern) {
    const topicParts = topic.split("/");
    const patternParts = pattern.split("/");

    if (topicParts.length !== patternParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== "+" && patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate unique message ID
   * @returns {string} - Unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect() {
    if (this.client) {
      this.client.end();
      this.connected = false;
      console.log("✅ MQTT client disconnected");
    }
  }

  /**
   * Check if MQTT client is connected
   * @returns {boolean} - Connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get connection status and statistics
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      connected: this.connected,
      subscriptions: Array.from(this.subscriptions),
      reconnectAttempts: this.reconnectAttempts,
      clientId: config.mqtt.clientId,
    };
  }
}

// Create singleton instance
const mqttClient = new MQTTClient();

module.exports = mqttClient;
