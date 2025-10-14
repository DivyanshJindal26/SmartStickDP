const request = require("supertest");
const app = require("../server");

describe("Smart Stick API", () => {
  describe("Health Check", () => {
    it("should return health status", async () => {
      const res = await request(app).get("/health").expect(200);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty(
        "message",
        "Smart Stick Cloud API is running"
      );
      expect(res.body.data).toHaveProperty("status", "healthy");
    });
  });

  describe("API Info", () => {
    it("should return API information", async () => {
      const res = await request(app).get("/api").expect(200);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body.data).toHaveProperty("name", "Smart Stick Cloud API");
      expect(res.body.data).toHaveProperty("version");
      expect(res.body.data).toHaveProperty("endpoints");
    });
  });

  describe("Telemetry Endpoint", () => {
    it("should accept telemetry data", async () => {
      const telemetryData = {
        deviceId: "test-device-001",
        sensors: {
          ultrasonicLeft: 150,
          ultrasonicRight: 200,
          IR: 100,
          battery: {
            level: 85,
            voltage: 3.7,
            charging: false,
          },
        },
        gps: {
          lat: 40.7128,
          lon: -74.006,
          accuracy: 5,
        },
        timestamp: new Date().toISOString(),
      };

      const res = await request(app)
        .post("/api/telemetry")
        .send(telemetryData)
        .expect(201);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty(
        "message",
        "Telemetry data received successfully"
      );
      expect(res.body.data).toHaveProperty("deviceId", telemetryData.deviceId);
    });

    it("should validate telemetry data", async () => {
      const invalidTelemetryData = {
        // Missing deviceId
        sensors: {
          ultrasonicLeft: 150,
        },
      };

      const res = await request(app)
        .post("/api/telemetry")
        .send(invalidTelemetryData)
        .expect(400);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message", "Validation failed");
    });
  });

  describe("SOS Endpoint", () => {
    it("should accept SOS alerts", async () => {
      const sosData = {
        deviceId: "test-device-001",
        gps: {
          lat: 40.7128,
          lon: -74.006,
        },
        metadata: {
          emergencyType: "manual",
        },
        timestamp: new Date().toISOString(),
      };

      const res = await request(app).post("/api/sos").send(sosData).expect(201);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty(
        "message",
        "SOS alert processed successfully"
      );
      expect(res.body.data).toHaveProperty("deviceId", sosData.deviceId);
    });

    it("should validate SOS data", async () => {
      const invalidSOSData = {
        // Missing deviceId
        gps: {
          lat: 40.7128,
          lon: -74.006,
        },
      };

      const res = await request(app)
        .post("/api/sos")
        .send(invalidSOSData)
        .expect(400);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message", "Validation failed");
    });
  });

  describe("User Registration", () => {
    it("should register a new user", async () => {
      const userData = {
        name: "Test User",
        email: `test${Date.now()}@example.com`,
        password: "TestPassword123!",
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(userData)
        .expect(201);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty(
        "message",
        "User registered successfully"
      );
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.user).toHaveProperty("email", userData.email);
    });

    it("should validate user registration data", async () => {
      const invalidUserData = {
        name: "Test User",
        email: "invalid-email",
        password: "123", // Too short
      };

      const res = await request(app)
        .post("/api/users/register")
        .send(invalidUserData)
        .expect(400);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message", "Validation failed");
    });
  });

  describe("Protected Routes", () => {
    it("should require authentication for protected routes", async () => {
      const res = await request(app).get("/api/users/profile").expect(401);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message", "Access token required");
    });

    it("should reject invalid tokens", async () => {
      const res = await request(app)
        .get("/api/users/profile")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      expect(res.body).toHaveProperty("success", false);
      expect(res.body).toHaveProperty("message", "Invalid token");
    });
  });
});

// Helper function to create test user and get token
async function createTestUserAndGetToken() {
  const userData = {
    name: "Test User",
    email: `test${Date.now()}@example.com`,
    password: "TestPassword123!",
  };

  const res = await request(app).post("/api/users/register").send(userData);

  return res.body.data.token;
}

module.exports = { createTestUserAndGetToken };
