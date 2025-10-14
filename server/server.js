const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

// Import configuration and utilities
const config = require("./config");
const database = require("./utils/db");
const fcmService = require("./utils/fcm");
const mqttClient = require("./mqtt/mqttClient");

// Import routes
const telemetryRoutes = require("./routes/telemetry");
const sosRoutes = require("./routes/sos");
const userRoutes = require("./routes/users");
const commandRoutes = require("./routes/commands");

// Import models (to ensure they are registered)
require("./models/User");
require("./models/Telemetry");
require("./models/Event");

const app = express();

// Trust proxy for rate limiting
app.set("trust proxy", 1);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS configuration
app.use(cors(config.cors));

// Compression middleware
app.use(compression());

// Request logging
if (config.isDevelopment()) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: process.env.npm_package_version || "1.0.0",
    services: {
      database: database.isConnected(),
      mqtt: mqttClient.isConnected(),
      fcm: fcmService.isReady(),
    },
  };

  // Check if any critical services are down
  const criticalServices = ["database", "mqtt"];
  const isHealthy = criticalServices.every(
    (service) => healthData.services[service]
  );

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    message: isHealthy
      ? "Smart Stick Cloud API is running"
      : "Some services are unavailable",
    data: healthData,
  });
});

// API info endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Smart Stick Cloud API",
    data: {
      name: "Smart Stick Cloud API",
      version: "1.0.0",
      description: "Cloud backend for Smart Stick mobility device",
      environment: config.nodeEnv,
      endpoints: {
        telemetry: "/api/telemetry",
        sos: "/api/sos",
        users: "/api/users",
        commands: "/api/commands",
      },
      documentation: {
        health: "GET /health",
        api_info: "GET /api",
      },
    },
  });
});

// API routes
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/users", userRoutes);
app.use("/api/commands", commandRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    data: {
      path: req.originalUrl,
      method: req.method,
      available_endpoints: [
        "GET /health",
        "GET /api",
        "POST /api/telemetry",
        "POST /api/sos",
        "POST /api/users/register",
        "POST /api/users/login",
      ],
    },
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  // Don't leak error details in production
  const errorMessage = config.isDevelopment()
    ? error.message
    : "Internal server error";

  const errorDetails = config.isDevelopment()
    ? { stack: error.stack, ...error }
    : {};

  res.status(error.status || 500).json({
    success: false,
    message: errorMessage,
    error: errorDetails,
  });
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Close MQTT connection
    if (mqttClient.isConnected()) {
      console.log("Closing MQTT connection...");
      await mqttClient.disconnect();
    }

    // Close database connection
    if (database.isConnected()) {
      console.log("Closing database connection...");
      await database.disconnect();
    }

    console.log("✅ Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
}

// Handle process signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Initialize services and start server
async function startServer() {
  try {
    console.log("🚀 Starting Smart Stick Cloud API...");
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Node version: ${process.version}`);

    // Connect to database
    await database.connect();

    // Initialize FCM service
    fcmService.initialize();

    // Connect to MQTT broker
    await mqttClient.connect();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(`\n✅ Smart Stick Cloud API is running!`);
      console.log(`🌐 Server: http://localhost:${config.port}`);
      console.log(`📋 Health: http://localhost:${config.port}/health`);
      console.log(`📚 API Info: http://localhost:${config.port}/api`);
      console.log(`📊 MongoDB: ${config.mongoUri}`);
      console.log(`📡 MQTT: ${config.mqtt.brokerUrl}`);
      console.log("\n🎯 Ready to receive data from Smart Stick devices!\n");
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${config.port} is already in use`);
      } else {
        console.error("❌ Server error:", error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;
