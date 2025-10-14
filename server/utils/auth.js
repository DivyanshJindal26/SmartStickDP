const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");

class AuthUtils {
  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} - True if passwords match
   */
  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   * @param {Object} payload - User data to encode
   * @returns {string} - JWT token
   */
  static generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: "smartstick-api",
      audience: "smartstick-app",
    });
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} - Decoded payload
   */
  static verifyToken(token) {
    return jwt.verify(token, config.jwt.secret, {
      issuer: "smartstick-api",
      audience: "smartstick-app",
    });
  }

  /**
   * Middleware to authenticate JWT tokens
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    try {
      const decoded = AuthUtils.verifyToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      console.error("JWT verification error:", error);

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired",
        });
      } else if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Token verification failed",
        });
      }
    }
  }

  /**
   * Middleware to check if user is admin
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }
    next();
  }

  /**
   * Generate a secure random string
   * @param {number} length - Length of the string
   * @returns {string} - Random string
   */
  static generateSecureRandom(length = 32) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

module.exports = AuthUtils;
