const User = require("../models/User");
const AuthUtils = require("../utils/auth");
const Validators = require("../utils/validators");
const config = require("../config");

class UserController {
  /**
   * Register a new user
   * POST /api/users/register
   */
  static async register(req, res) {
    try {
      const { name, email, password, fcmToken } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User already exists with this email",
        });
      }

      // Create new user
      const user = new User({
        name: Validators.sanitizeText(name),
        email: email.toLowerCase(),
        passwordHash: password, // Will be hashed by the pre-save middleware
        fcmToken: fcmToken || null,
        isAdmin: email.toLowerCase() === config.admin.email.toLowerCase(),
      });

      await user.save();

      // Generate JWT token
      const token = AuthUtils.generateToken({
        userId: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
      });

      // Remove sensitive data from response
      const userResponse = user.toJSON();
      delete userResponse.passwordHash;

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user: userResponse,
          token,
          expiresIn: config.jwt.expiresIn,
        },
      });
    } catch (error) {
      console.error("Error registering user:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "User already exists with this email",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to register user",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * User login
   * POST /api/users/login
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({
        email: email.toLowerCase(),
        isActive: true,
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message:
            "Account is temporarily locked due to too many failed login attempts",
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        // Increment login attempts
        await user.incLoginAttempts();

        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Reset login attempts on successful login
      await user.resetLoginAttempts();

      // Generate JWT token
      const token = AuthUtils.generateToken({
        userId: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
      });

      // Update FCM token if provided
      if (req.body.fcmToken && req.body.fcmToken !== user.fcmToken) {
        user.fcmToken = req.body.fcmToken;
        await user.save();
      }

      // Remove sensitive data from response
      const userResponse = user.toJSON();
      delete userResponse.passwordHash;

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: userResponse,
          token,
          expiresIn: config.jwt.expiresIn,
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({
        success: false,
        message: "Login failed",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get user profile
   * GET /api/users/profile
   */
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.userId).select("-passwordHash");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user profile",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  static async updateProfile(req, res) {
    try {
      const { name, fcmToken, emergencyContacts, preferences } = req.body;

      const updateData = {};

      if (name) updateData.name = Validators.sanitizeText(name);
      if (fcmToken !== undefined) updateData.fcmToken = fcmToken;
      if (emergencyContacts) updateData.emergencyContacts = emergencyContacts;
      if (preferences) updateData.preferences = preferences;

      const user = await User.findByIdAndUpdate(req.user.userId, updateData, {
        new: true,
        runValidators: true,
      }).select("-passwordHash");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("Error updating user profile:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Change password
   * PUT /api/users/change-password
   */
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Update password
      user.passwordHash = newPassword; // Will be hashed by pre-save middleware
      await user.save();

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Error changing password:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to change password",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Add device to user account
   * POST /api/users/devices
   */
  static async addDevice(req, res) {
    try {
      const { deviceId, deviceName } = req.body;

      if (!deviceId || !Validators.isValidDeviceId(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Valid device ID is required",
        });
      }

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if device is already associated with another user
      const existingUser = await User.findByDeviceId(deviceId);
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(409).json({
          success: false,
          message: "Device is already associated with another user",
        });
      }

      // Add device to user
      await user.addDevice(
        Validators.sanitizeText(deviceId),
        deviceName ? Validators.sanitizeText(deviceName) : "Smart Stick"
      );

      res.status(201).json({
        success: true,
        message: "Device added successfully",
        data: {
          deviceId,
          deviceName: deviceName || "Smart Stick",
        },
      });
    } catch (error) {
      console.error("Error adding device:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add device",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Remove device from user account
   * DELETE /api/users/devices/:deviceId
   */
  static async removeDevice(req, res) {
    try {
      const { deviceId } = req.params;

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if user has this device
      const hasDevice = user.devices.some(
        (device) => device.deviceId === deviceId
      );
      if (!hasDevice) {
        return res.status(404).json({
          success: false,
          message: "Device not found in user account",
        });
      }

      // Remove device
      await user.removeDevice(deviceId);

      res.json({
        success: true,
        message: "Device removed successfully",
        data: { deviceId },
      });
    } catch (error) {
      console.error("Error removing device:", error);
      res.status(500).json({
        success: false,
        message: "Failed to remove device",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get user's devices
   * GET /api/users/devices
   */
  static async getDevices(req, res) {
    try {
      const user = await User.findById(req.user.userId).select("devices");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        data: user.devices,
      });
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch devices",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Update emergency contacts
   * PUT /api/users/emergency-contacts
   */
  static async updateEmergencyContacts(req, res) {
    try {
      const { emergencyContacts } = req.body;

      if (!Array.isArray(emergencyContacts)) {
        return res.status(400).json({
          success: false,
          message: "Emergency contacts must be an array",
        });
      }

      // Validate emergency contacts
      for (const contact of emergencyContacts) {
        if (!contact.name || !contact.phone) {
          return res.status(400).json({
            success: false,
            message: "Each emergency contact must have name and phone",
          });
        }
      }

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { emergencyContacts },
        { new: true, runValidators: true }
      ).select("-passwordHash");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Emergency contacts updated successfully",
        data: user.emergencyContacts,
      });
    } catch (error) {
      console.error("Error updating emergency contacts:", error);

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: Object.values(error.errors).map((err) => err.message),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update emergency contacts",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Deactivate user account
   * DELETE /api/users/account
   */
  static async deactivateAccount(req, res) {
    try {
      const { password } = req.body;

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Verify password for account deactivation
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Password is incorrect",
        });
      }

      // Deactivate account
      user.isActive = false;
      user.fcmToken = null; // Remove FCM token
      await user.save();

      res.json({
        success: true,
        message: "Account deactivated successfully",
      });
    } catch (error) {
      console.error("Error deactivating account:", error);
      res.status(500).json({
        success: false,
        message: "Failed to deactivate account",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  /**
   * Get all users (admin only)
   * GET /api/users
   */
  static async getAllUsers(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin access required",
        });
      }

      const { page = 1, limit = 20, search } = req.query;

      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const users = await User.find(query)
        .select("-passwordHash")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalCount = await User.countDocuments(query);
      const totalPages = Math.ceil(totalCount / parseInt(limit));

      res.json({
        success: true,
        data: users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}

module.exports = UserController;
