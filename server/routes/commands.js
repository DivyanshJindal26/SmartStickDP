const express = require("express");
const CommandController = require("../controllers/commandController");
const AuthUtils = require("../utils/auth");
const Validators = require("../utils/validators");

const router = express.Router();

// GET /api/commands/available - Get available commands and their descriptions
router.get(
  "/available",
  AuthUtils.authenticateToken,
  CommandController.getAvailableCommands
);

// POST /api/commands/bulk - Send bulk commands to multiple devices (admin only)
router.post(
  "/bulk",
  AuthUtils.authenticateToken,
  AuthUtils.requireAdmin,
  CommandController.sendBulkCommands
);

// POST /api/commands/:deviceId - Send command to device (requires auth)
router.post(
  "/:deviceId",
  AuthUtils.authenticateToken,
  Validators.validateCommand(),
  CommandController.sendCommand
);

// GET /api/commands/:deviceId/history - Get command history for a device (requires auth)
router.get(
  "/:deviceId/history",
  AuthUtils.authenticateToken,
  CommandController.getCommandHistory
);

// POST /api/commands/:deviceId/emergency - Send emergency commands (requires auth)
router.post(
  "/:deviceId/emergency",
  AuthUtils.authenticateToken,
  CommandController.sendEmergencyCommands
);

// POST /api/commands/:deviceId/status - Get device status via command (requires auth)
router.post(
  "/:deviceId/status",
  AuthUtils.authenticateToken,
  CommandController.getDeviceStatus
);

module.exports = router;
