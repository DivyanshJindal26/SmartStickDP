const { body, validationResult } = require("express-validator");

class Validators {
  /**
   * Handle validation errors
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }
    next();
  }

  /**
   * User registration validation rules
   */
  static validateUserRegistration() {
    return [
      body("name")
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage("Name must be between 2 and 50 characters"),

      body("email")
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage("Valid email is required"),

      body("password")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
        )
        .withMessage(
          "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character"
        ),

      body("fcmToken")
        .optional()
        .isString()
        .withMessage("FCM token must be a string"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * User login validation rules
   */
  static validateUserLogin() {
    return [
      body("email")
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage("Valid email is required"),

      body("password").notEmpty().withMessage("Password is required"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * Telemetry data validation rules
   */
  static validateTelemetry() {
    return [
      body("deviceId")
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage(
          "Device ID is required and must be less than 50 characters"
        ),

      body("sensors").isObject().withMessage("Sensors data must be an object"),

      body("sensors.ultrasonicLeft")
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage(
          "Ultrasonic left sensor value must be between 0 and 1000 cm"
        ),

      body("sensors.ultrasonicRight")
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage(
          "Ultrasonic right sensor value must be between 0 and 1000 cm"
        ),

      body("sensors.IR")
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage("IR sensor value must be between 0 and 1000 cm"),

      body("sensors.IMU")
        .optional()
        .isObject()
        .withMessage("IMU data must be an object"),

      body("gps")
        .optional()
        .isObject()
        .withMessage("GPS data must be an object"),

      body("gps.lat")
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage("Latitude must be between -90 and 90"),

      body("gps.lon")
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage("Longitude must be between -180 and 180"),

      body("timestamp")
        .optional()
        .isISO8601()
        .withMessage("Timestamp must be a valid ISO 8601 date"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * SOS alert validation rules
   */
  static validateSOS() {
    return [
      body("deviceId")
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage(
          "Device ID is required and must be less than 50 characters"
        ),

      body("gps")
        .optional()
        .isObject()
        .withMessage("GPS data must be an object"),

      body("gps.lat")
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage("Latitude must be between -90 and 90"),

      body("gps.lon")
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage("Longitude must be between -180 and 180"),

      body("metadata")
        .optional()
        .isObject()
        .withMessage("Metadata must be an object"),

      body("timestamp")
        .optional()
        .isISO8601()
        .withMessage("Timestamp must be a valid ISO 8601 date"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * Command validation rules
   */
  static validateCommand() {
    return [
      body("command")
        .trim()
        .isIn([
          "vibrate",
          "beep",
          "led_on",
          "led_off",
          "status_check",
          "reboot",
        ])
        .withMessage(
          "Command must be one of: vibrate, beep, led_on, led_off, status_check, reboot"
        ),

      body("parameters")
        .optional()
        .isObject()
        .withMessage("Parameters must be an object"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * Device ID parameter validation
   */
  static validateDeviceId() {
    return [
      body("deviceId")
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage("Device ID must be between 1 and 50 characters"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * Pagination validation rules
   */
  static validatePagination() {
    return [
      body("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer"),

      body("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100"),

      Validators.handleValidationErrors,
    ];
  }

  /**
   * Generic sanitization for text fields
   * @param {string} value - Value to sanitize
   * @returns {string} - Sanitized value
   */
  static sanitizeText(value) {
    if (typeof value !== "string") return value;
    return value.trim().replace(/[<>]/g, "");
  }

  /**
   * Validate MongoDB ObjectId
   * @param {string} id - ID to validate
   * @returns {boolean} - True if valid ObjectId
   */
  static isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Validate device ID format
   * @param {string} deviceId - Device ID to validate
   * @returns {boolean} - True if valid device ID
   */
  static isValidDeviceId(deviceId) {
    return /^[a-zA-Z0-9_-]+$/.test(deviceId) && deviceId.length <= 50;
  }

  /**
   * Validate GPS coordinates
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {boolean} - True if valid coordinates
   */
  static isValidGPS(lat, lon) {
    return (
      typeof lat === "number" &&
      typeof lon === "number" &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  }
}

module.exports = Validators;
