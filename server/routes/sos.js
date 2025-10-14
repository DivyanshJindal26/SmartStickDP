const express = require("express");
const SOSController = require("../controllers/sosController");
const AuthUtils = require("../utils/auth");
const Validators = require("../utils/validators");

const router = express.Router();

// POST /api/sos - Receive SOS alert from device (no auth required for devices)
router.post("/", Validators.validateSOS(), SOSController.receiveSOS);

// GET /api/sos - Get SOS events for user's devices (requires auth)
router.get("/", AuthUtils.authenticateToken, SOSController.getSOSEvents);

// GET /api/sos/stats - Get SOS statistics (requires auth)
router.get("/stats", AuthUtils.authenticateToken, SOSController.getSOSStats);

// GET /api/sos/:eventId - Get specific SOS event details (requires auth)
router.get("/:eventId", AuthUtils.authenticateToken, SOSController.getSOSEvent);

// POST /api/sos/:eventId/acknowledge - Acknowledge SOS event (requires auth)
router.post(
  "/:eventId/acknowledge",
  AuthUtils.authenticateToken,
  SOSController.acknowledgeSOS
);

// POST /api/sos/:eventId/resolve - Resolve SOS event (requires auth)
router.post(
  "/:eventId/resolve",
  AuthUtils.authenticateToken,
  SOSController.resolveSOS
);

// POST /api/sos/:eventId/escalate - Escalate SOS event (requires auth)
router.post(
  "/:eventId/escalate",
  AuthUtils.authenticateToken,
  SOSController.escalateSOS
);

module.exports = router;
