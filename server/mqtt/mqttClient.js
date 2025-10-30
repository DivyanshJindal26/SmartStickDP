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
      // Subscribe to sensor data from Raspberry Pi
      await this.subscribe(
        "smartstick/+/sensors/sonar",
        this.handleSonarData.bind(this)
      );

      await this.subscribe(
        "smartstick/+/sensors/ir",
        this.handleIRData.bind(this)
      );

      await this.subscribe(
        "smartstick/+/sensors/gps",
        this.handleGPSData.bind(this)
      );

      await this.subscribe(
        "smartstick/+/sensors/imu",
        this.handleIMUData.bind(this)
      );

      // Subscribe to all device telemetry (combined data)
      await this.subscribe(
        "smartstick/+/telemetry",
        this.handleTelemetryMessage.bind(this)
      );

      // Subscribe to all SOS alerts from RPi
      await this.subscribe(
        "smartstick/+/sos",
        this.handleSOSMessage.bind(this)
      );

      // Subscribe to device status updates
      await this.subscribe(
        "smartstick/+/status",
        this.handleStatusMessage.bind(this)
      );

      // Subscribe to device responses
      await this.subscribe(
        "smartstick/+/response",
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
   * Handle sonar sensor data from Raspberry Pi
   * @param {string} topic - MQTT topic (smartstick/{deviceId}/sensors/sonar)
   * @param {string} message - Message payload
   */
  async handleSonarData(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const sonarData = JSON.parse(message);

      console.log(`📡 Sonar data from device ${deviceId}:`, sonarData);

      // Expected format: { left: 150, center: 200, right: 180, timestamp: "..." }
      const telemetryData = {
        sensors: {
          ultrasonicLeft: sonarData.left,
          ultrasonicCenter: sonarData.center,
          ultrasonicRight: sonarData.right,
        },
      };

      // Create telemetry record (just store the raw data)
      await this.saveTelemetryData(
        deviceId,
        telemetryData,
        sonarData.timestamp
      );

      console.log(`✅ Sonar data processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling sonar data:", error);
    }
  }

  /**
   * Handle IR sensor data from Raspberry Pi
   * @param {string} topic - MQTT topic (smartstick/{deviceId}/sensors/ir)
   * @param {string} message - Message payload
   */
  async handleIRData(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const irData = JSON.parse(message);

      console.log(`📡 IR sensor data from device ${deviceId}:`, irData);

      // Expected format: { value: 1024, detected: true, timestamp: "..." }
      const telemetryData = {
        sensors: {
          irSensor: irData.value,
          irDetected: irData.detected,
        },
      };

      await this.saveTelemetryData(deviceId, telemetryData, irData.timestamp);

      console.log(`✅ IR data processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling IR data:", error);
    }
  }

  /**
   * Handle GPS data from Raspberry Pi
   * @param {string} topic - MQTT topic (smartstick/{deviceId}/sensors/gps)
   * @param {string} message - Message payload
   */
  async handleGPSData(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const gpsData = JSON.parse(message);

      console.log(`📍 GPS data from device ${deviceId}:`, gpsData);

      // Expected format: { latitude: 37.7749, longitude: -122.4194, altitude: 50, speed: 1.5, timestamp: "..." }
      const telemetryData = {
        gps: {
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          altitude: gpsData.altitude,
          speed: gpsData.speed,
          accuracy: gpsData.accuracy,
          heading: gpsData.heading,
        },
      };

      await this.saveTelemetryData(deviceId, telemetryData, gpsData.timestamp);

      // Update user's device location
      await User.findOneAndUpdate(
        { "devices.deviceId": deviceId },
        {
          $set: {
            "devices.$.lastSeen": new Date(),
            "devices.$.lastLocation": {
              latitude: gpsData.latitude,
              longitude: gpsData.longitude,
            },
          },
        }
      );

      console.log(`✅ GPS data processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling GPS data:", error);
    }
  }

  /**
   * Handle IMU sensor data from Raspberry Pi
   * @param {string} topic - MQTT topic (smartstick/{deviceId}/sensors/imu)
   * @param {string} message - Message payload
   */
  async handleIMUData(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const imuData = JSON.parse(message);

      console.log(`📊 IMU data from device ${deviceId}:`, imuData);

      // Expected format: { acceleration: {x, y, z}, gyroscope: {x, y, z}, magnetometer: {x, y, z}, temperature: 25, timestamp: "..." }
      const telemetryData = {
        sensors: {
          IMU: {
            accelerometer: imuData.acceleration || imuData.accelerometer,
            gyroscope: imuData.gyroscope,
            magnetometer: imuData.magnetometer,
            temperature: imuData.temperature,
          },
        },
      };

      // Just save raw IMU data
      await this.saveTelemetryData(deviceId, telemetryData, imuData.timestamp);

      console.log(`✅ IMU data processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling IMU data:", error);
    }
  }

  /**
   * Save telemetry data to database
   * @param {string} deviceId - Device ID
   * @param {Object} telemetryData - Partial telemetry data
   * @param {string} timestamp - Timestamp from sensor
   */
  async saveTelemetryData(deviceId, telemetryData, timestamp) {
    try {
      // Create or update telemetry record
      const telemetry = new Telemetry({
        deviceId,
        timestamp: timestamp || new Date(),
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
    } catch (error) {
      console.error("❌ Error saving telemetry data:", error);
    }
  }

  /**
   * Handle telemetry messages from devices (combined data)
   * @param {string} topic - MQTT topic
   * @param {string} message - Message payload
   */
  async handleTelemetryMessage(topic, message) {
    try {
      const deviceId = this.extractDeviceId(topic);
      const telemetryData = JSON.parse(message);

      console.log(`📦 Combined telemetry from device ${deviceId}`);

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

      console.log(`🚨 SOS ALERT from device via MQTT: ${deviceId}`);

      // SOS from RPi just indicates button press - no analysis needed
      // Create SOS event
      const sosEvent = await Event.createSOSEvent(deviceId, sosData.gps, {
        emergencyType: "button_press",
        sensorData: sosData.sensors || {},
        timestamp: sosData.timestamp || new Date(),
        trigger: "manual",
      });

      // Find users associated with this device
      const users = await User.findUsersWithFCMByDevice(deviceId);

      if (users.length > 0) {
        // Send FCM notifications to all associated users (mobile app)
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

        // Publish SOS alert to mobile app via MQTT
        await this.publishSOSToMobileApp(deviceId, sosData, users);
      }

      console.log(`✅ SOS alert processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling SOS message:", error);
    }
  }

  /**
   * Publish SOS alert to mobile app via MQTT
   * @param {string} deviceId - Device ID
   * @param {Object} sosData - SOS data from RPi (just button press notification)
   * @param {Array} users - Associated users
   */
  async publishSOSToMobileApp(deviceId, sosData, users) {
    try {
      for (const user of users) {
        // Publish to user-specific topic for mobile app
        const topic = `smartstick/mobile/${user._id}/sos`;

        const sosAlert = {
          type: "SOS_ALERT",
          deviceId,
          userId: user._id,
          timestamp: new Date().toISOString(),
          emergencyType: "button_press",
          trigger: "manual",
          location: sosData.gps || {},
          sensors: sosData.sensors || {},
          userInfo: {
            name: user.name,
            email: user.email,
          },
          emergencyContacts: user.emergencyContacts || [],
          message: `Emergency SOS button pressed on Smart Stick device ${deviceId}`,
        };

        await this.publish(topic, sosAlert, { qos: 2, retain: true });

        console.log(
          `📱 SOS alert published to mobile app for user: ${user._id}`
        );
      }

      // Also publish to general broadcast channel
      const broadcastTopic = `smartstick/mobile/broadcast/sos`;
      await this.publish(
        broadcastTopic,
        {
          type: "SOS_ALERT",
          deviceId,
          timestamp: new Date().toISOString(),
          location: sosData.gps || {},
        },
        { qos: 1 }
      );
    } catch (error) {
      console.error("❌ Error publishing SOS to mobile app:", error);
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
   * Handle obstacle alert from sonar sensors
   * @param {string} deviceId - Device ID
   * @param {number} distance - Minimum distance detected
   * @param {Object} sonarData - Full sonar data
   */
  async handleObstacleAlert(deviceId, distance, sonarData) {
    try {
      // Check if we already have a recent obstacle alert
      const recentAlert = await Event.findOne({
        type: "OBSTACLE_DETECTED",
        deviceId,
        timestamp: { $gte: new Date(Date.now() - 5 * 1000) }, // Last 5 seconds
      });

      if (recentAlert) {
        return; // Don't spam alerts
      }

      // Create obstacle detection event
      await Event.create({
        type: "OBSTACLE_DETECTED",
        deviceId,
        severity: distance < 20 ? "high" : "medium",
        title: "Obstacle Detected",
        description: `Obstacle detected at ${distance}cm from device ${deviceId}`,
        metadata: {
          sensorData: {
            minDistance: distance,
            sonarLeft: sonarData.left,
            sonarCenter: sonarData.center,
            sonarRight: sonarData.right,
          },
          alertValue: distance,
          alertThreshold: 30,
        },
      });

      console.log(
        `⚠️ Obstacle alert created for device ${deviceId}: ${distance}cm`
      );
    } catch (error) {
      console.error("❌ Error handling obstacle alert:", error);
    }
  }

  /**
   * Handle fall detection from IMU
   * @param {string} deviceId - Device ID
   * @param {number} magnitude - Acceleration magnitude
   * @param {Object} imuData - Full IMU data
   */
  async handleFallDetection(deviceId, magnitude, imuData) {
    try {
      console.log(
        `🚨 Fall detected on device ${deviceId}: ${magnitude.toFixed(2)} m/s²`
      );

      // Create fall detection event
      const fallEvent = await Event.create({
        type: "FALL_DETECTED",
        deviceId,
        severity: "critical",
        title: "Fall Detected",
        description: `Sudden impact detected on device ${deviceId} (${magnitude.toFixed(
          2
        )} m/s²)`,
        metadata: {
          sensorData: imuData,
          alertValue: magnitude,
          alertThreshold: 20,
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
          "⚠️ Fall Detected",
          `A fall has been detected on your Smart Stick. Impact: ${magnitude.toFixed(
            1
          )} m/s²`,
          {
            type: "fall_detected",
            deviceId,
            magnitude: magnitude.toString(),
            severity: "critical",
          }
        );
      }

      // Publish fall alert to mobile app
      for (const user of users) {
        const topic = `smartstick/mobile/${user._id}/alert`;
        await this.publish(
          topic,
          {
            type: "FALL_ALERT",
            deviceId,
            userId: user._id,
            timestamp: new Date().toISOString(),
            magnitude,
            imuData,
          },
          { qos: 1 }
        );
      }

      console.log(`✅ Fall detection processed for device: ${deviceId}`);
    } catch (error) {
      console.error("❌ Error handling fall detection:", error);
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
