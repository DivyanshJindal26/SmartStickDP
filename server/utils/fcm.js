const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const config = require("../config");

class FCMService {
  constructor() {
    this.initialized = false;
    this.app = null;
  }

  /**
   * Initialize Firebase Admin SDK
   */
  initialize() {
    try {
      if (this.initialized) {
        return;
      }

      // Check if service account file exists
      if (
        !config.fcm.serviceAccount ||
        !fs.existsSync(config.fcm.serviceAccount)
      ) {
        console.warn(
          "⚠️ FCM service account file not found. Push notifications will be disabled."
        );
        return;
      }

      // Read service account file
      const serviceAccount = require(path.resolve(config.fcm.serviceAccount));

      // Initialize Firebase Admin
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.initialized = true;
      console.log("✅ Firebase Admin SDK initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Firebase Admin SDK:", error);
    }
  }

  /**
   * Send push notification to a single device
   * @param {string} fcmToken - FCM token of the device
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data payload
   * @returns {Promise<Object>} - Notification result
   */
  async sendNotification(fcmToken, title, body, data = {}) {
    try {
      if (!this.initialized) {
        console.warn("⚠️ FCM not initialized. Skipping notification.");
        return { success: false, error: "FCM not initialized" };
      }

      const message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "smartstick_emergency",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              alert: {
                title,
                body,
              },
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log("✅ FCM notification sent successfully:", response);

      return {
        success: true,
        messageId: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send FCM notification:", error);

      // Handle specific FCM errors
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        return {
          success: false,
          error: "Invalid or expired FCM token",
          shouldRemoveToken: true,
        };
      }

      return {
        success: false,
        error: error.message || "Unknown FCM error",
      };
    }
  }

  /**
   * Send push notification to multiple devices
   * @param {Array<string>} fcmTokens - Array of FCM tokens
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data payload
   * @returns {Promise<Object>} - Notification result
   */
  async sendMulticastNotification(fcmTokens, title, body, data = {}) {
    try {
      if (!this.initialized) {
        console.warn("⚠️ FCM not initialized. Skipping notifications.");
        return { success: false, error: "FCM not initialized" };
      }

      if (!fcmTokens || fcmTokens.length === 0) {
        return { success: false, error: "No FCM tokens provided" };
      }

      const message = {
        tokens: fcmTokens,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "smartstick_emergency",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              alert: {
                title,
                body,
              },
            },
          },
        },
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log(
        `✅ FCM multicast sent: ${response.successCount}/${fcmTokens.length} successful`
      );

      // Log any failures
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`❌ FCM failed for token ${idx}:`, resp.error);
          }
        });
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Failed to send FCM multicast notification:", error);
      return {
        success: false,
        error: error.message || "Unknown FCM error",
      };
    }
  }

  /**
   * Send SOS emergency notification
   * @param {string|Array<string>} fcmTokens - FCM token(s) of emergency contacts
   * @param {string} deviceId - ID of the device that triggered SOS
   * @param {Object} location - GPS coordinates
   * @returns {Promise<Object>} - Notification result
   */
  async sendSOSNotification(fcmTokens, deviceId, location = {}) {
    const title = "🚨 Smart Stick Emergency Alert";
    const body = `Emergency alert from device ${deviceId}. Immediate assistance required.`;

    const data = {
      type: "SOS",
      deviceId,
      latitude: location.lat ? location.lat.toString() : "",
      longitude: location.lon ? location.lon.toString() : "",
      alertType: "emergency",
    };

    if (Array.isArray(fcmTokens)) {
      return await this.sendMulticastNotification(fcmTokens, title, body, data);
    } else {
      return await this.sendNotification(fcmTokens, title, body, data);
    }
  }

  /**
   * Check if FCM is initialized and ready
   * @returns {boolean} - True if FCM is ready
   */
  isReady() {
    return this.initialized;
  }
}

// Create singleton instance
const fcmService = new FCMService();

module.exports = fcmService;
