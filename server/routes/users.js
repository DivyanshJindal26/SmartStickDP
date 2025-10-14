const express = require("express");
const UserController = require("../controllers/userController");
const AuthUtils = require("../utils/auth");
const Validators = require("../utils/validators");

const router = express.Router();

// POST /api/users/register - Register a new user
router.post(
  "/register",
  Validators.validateUserRegistration(),
  UserController.register
);

// POST /api/users/login - User login
router.post("/login", Validators.validateUserLogin(), UserController.login);

// GET /api/users/profile - Get user profile (requires auth)
router.get("/profile", AuthUtils.authenticateToken, UserController.getProfile);

// PUT /api/users/profile - Update user profile (requires auth)
router.put(
  "/profile",
  AuthUtils.authenticateToken,
  UserController.updateProfile
);

// PUT /api/users/change-password - Change password (requires auth)
router.put(
  "/change-password",
  AuthUtils.authenticateToken,
  UserController.changePassword
);

// GET /api/users/devices - Get user's devices (requires auth)
router.get("/devices", AuthUtils.authenticateToken, UserController.getDevices);

// POST /api/users/devices - Add device to user account (requires auth)
router.post(
  "/devices",
  AuthUtils.authenticateToken,
  Validators.validateDeviceId(),
  UserController.addDevice
);

// DELETE /api/users/devices/:deviceId - Remove device from user account (requires auth)
router.delete(
  "/devices/:deviceId",
  AuthUtils.authenticateToken,
  UserController.removeDevice
);

// PUT /api/users/emergency-contacts - Update emergency contacts (requires auth)
router.put(
  "/emergency-contacts",
  AuthUtils.authenticateToken,
  UserController.updateEmergencyContacts
);

// DELETE /api/users/account - Deactivate user account (requires auth)
router.delete(
  "/account",
  AuthUtils.authenticateToken,
  UserController.deactivateAccount
);

// GET /api/users - Get all users (admin only)
router.get(
  "/",
  AuthUtils.authenticateToken,
  AuthUtils.requireAdmin,
  UserController.getAllUsers
);

module.exports = router;
