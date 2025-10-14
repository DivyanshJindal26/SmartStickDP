const express = require("express");
const TelemetryController = require("../controllers/telemetryController");
const AuthUtils = require("../utils/auth");
const Validators = require("../utils/validators");

const router = express.Router();

// POST /api/telemetry - Receive telemetry data from device (no auth required for devices)
router.post(
  "/",
  Validators.validateTelemetry(),
  TelemetryController.receiveTelemetry
);

// GET /api/telemetry/:deviceId - Get telemetry data for a device (requires auth)
router.get(
  "/:deviceId",
  AuthUtils.authenticateToken,
  TelemetryController.getTelemetryByDevice
);

// GET /api/telemetry/:deviceId/latest - Get latest telemetry for a device (requires auth)
router.get(
  "/:deviceId/latest",
  AuthUtils.authenticateToken,
  TelemetryController.getLatestTelemetry
);

// GET /api/telemetry/:deviceId/stats - Get telemetry statistics for a device (requires auth)
router.get(
  "/:deviceId/stats",
  AuthUtils.authenticateToken,
  TelemetryController.getTelemetryStats
);

// GET /api/telemetry/:deviceId/gps-track - Get GPS track for a device (requires auth)
router.get(
  "/:deviceId/gps-track",
  AuthUtils.authenticateToken,
  TelemetryController.getGPSTrack
);

// DELETE /api/telemetry/cleanup - Clean up old telemetry data (admin only)
router.delete(
  "/cleanup",
  AuthUtils.authenticateToken,
  AuthUtils.requireAdmin,
  TelemetryController.cleanupTelemetry
);

module.exports = router;
