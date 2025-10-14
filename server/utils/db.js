const mongoose = require("mongoose");
const config = require("../config");

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      // Mongoose connection options
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      };

      this.connection = await mongoose.connect(config.mongoUri, options);

      console.log("✅ MongoDB connected successfully");

      // Handle connection events
      mongoose.connection.on("error", (err) => {
        console.error("❌ MongoDB connection error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("⚠️ MongoDB disconnected");
      });

      mongoose.connection.on("reconnected", () => {
        console.log("🔄 MongoDB reconnected");
      });

      return this.connection;
    } catch (error) {
      console.error("❌ MongoDB connection failed:", error);
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        console.log("✅ MongoDB disconnected successfully");
      }
    } catch (error) {
      console.error("❌ Error disconnecting from MongoDB:", error);
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  getConnection() {
    return this.connection;
  }
}

// Create singleton instance
const database = new Database();

module.exports = database;
