require("dotenv").config();

const config = {
  // Server Configuration
  port: process.env.PORT || 7284,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database Configuration
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/smartstickdb",

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || "fallback_secret_change_this",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  },

  // MQTT Configuration
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || "mqtt://localhost:1884",
    clientId: `smartstick-server-${Math.random().toString(16).substr(2, 8)}`,
    options: {
      keepalive: 60,
      connectTimeout: 30 * 1000,
      reconnectPeriod: 1000,
      clean: true,
      encoding: "utf8",
    },
  },

  // Firebase Configuration
  fcm: {
    serviceAccount: process.env.FCM_SERVICE_ACCOUNT,
  },

  // Admin Configuration
  admin: {
    email: process.env.ADMIN_EMAIL || "admin@smartstick.com",
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },

  // Development mode check
  isDevelopment: () => config.nodeEnv === "development",
  isProduction: () => config.nodeEnv === "production",
};

module.exports = config;
