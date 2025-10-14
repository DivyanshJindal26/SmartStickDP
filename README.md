# Smart Stick Cloud Backend

A complete, production-ready cloud backend for the Smart Stick mobility device - designed to help visually impaired users navigate safely through real-time sensor data, GPS tracking, and emergency alerts.

## 🎯 Overview

This cloud backend serves as the central hub connecting Smart Stick devices (Raspberry Pi + Arduino) with mobile applications, providing:

- **Real-time telemetry** processing from device sensors
- **Emergency SOS alerts** with instant notifications
- **Device command execution** via MQTT
- **User management** with JWT authentication
- **Data persistence** with MongoDB
- **Push notifications** via Firebase Cloud Messaging

## 🏗️ System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Smart Stick   │────▶│  Cloud Backend  │◀────│   Mobile App    │
│  (RPi+Arduino)  │     │                 │     │   (Flutter)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │                        │
        │                        ▼                        │
        │              ┌─────────────────┐                │
        │              │    Services     │                │
        │              │  ┌───────────┐  │                │
        │              │  │ MongoDB   │  │                │
        │              │  │ Mosquitto │  │                │
        │              │  │ Firebase  │  │                │
        │              │  └───────────┘  │                │
        │              └─────────────────┘                │
        │                                                 │
        └─────────────── MQTT Topics ────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Firebase project with FCM enabled

### 1. Clone Repository

```bash
git clone <repository-url>
cd smartstick-cloud
```

### 2. Setup Firebase

1. Create Firebase project at https://console.firebase.google.com/
2. Generate service account key
3. Save as `secrets/firebase-service-account.json`

```bash
mkdir secrets
# Place your firebase-service-account.json here
```

### 3. Configure Environment

```bash
cp server/.env.example server/.env
# Edit server/.env with your configuration
```

### 4. Start Services

```bash
# Start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 5. Verify Installation

- **API Health**: http://localhost:8080/health
- **API Info**: http://localhost:8080/api
- **MongoDB Admin**: http://localhost:8081 (admin/admin123)

## 📡 API Endpoints

### Core Endpoints

| Method | Endpoint              | Description          | Auth |
| ------ | --------------------- | -------------------- | ---- |
| `GET`  | `/health`             | Service health check | No   |
| `GET`  | `/api`                | API information      | No   |
| `POST` | `/api/telemetry`      | Receive device data  | No   |
| `POST` | `/api/sos`            | Emergency alerts     | No   |
| `POST` | `/api/users/register` | User registration    | No   |
| `POST` | `/api/users/login`    | User login           | No   |

### Protected Endpoints (Require JWT)

| Method | Endpoint                   | Description          |
| ------ | -------------------------- | -------------------- |
| `GET`  | `/api/users/profile`       | Get user profile     |
| `POST` | `/api/commands/:deviceId`  | Send device command  |
| `GET`  | `/api/sos`                 | Get SOS events       |
| `GET`  | `/api/telemetry/:deviceId` | Get device telemetry |

## 📊 MQTT Communication

### Topics

**Device → Cloud:**

- `stick/{deviceId}/telemetry` - Sensor readings
- `stick/{deviceId}/sos` - Emergency alerts
- `stick/{deviceId}/status` - Device status

**Cloud → Device:**

- `stick/{deviceId}/command` - Control commands

### Available Commands

- `vibrate` - Haptic feedback
- `beep` - Audio alerts
- `led_on/led_off` - Visual indicators
- `status_check` - Device diagnostics
- `reboot` - Device restart

## 🧪 Testing the API

### Send Telemetry Data

```bash
curl -X POST http://localhost:8080/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "stick-001",
    "sensors": {
      "ultrasonicLeft": 45,
      "ultrasonicRight": 67,
      "IR": 23,
      "battery": {"level": 78, "voltage": 3.6}
    },
    "gps": {"lat": 40.7128, "lon": -74.0060}
  }'
```

### Trigger SOS Alert

```bash
curl -X POST http://localhost:8080/api/sos \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "stick-001",
    "gps": {"lat": 40.7128, "lon": -74.0060},
    "metadata": {"emergencyType": "manual"}
  }'
```

### Register User & Send Command

```bash
# Register user
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'

# Login and get token
TOKEN=$(curl -X POST http://localhost:8080/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "SecurePass123!"}' \
  | jq -r '.data.token')

# Send device command
curl -X POST http://localhost:8080/api/commands/stick-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command": "vibrate", "parameters": {"intensity": "high"}}'
```

## 🔧 Development

### Local Development

```bash
cd server
npm install
npm run dev
```

### Testing

```bash
npm test
npm run test:watch
```

### Project Structure

```
smartstick-cloud/
├── docker-compose.yml          # Container orchestration
├── mosquitto/
│   └── mosquitto.conf         # MQTT broker config
└── server/
    ├── server.js              # Main application
    ├── package.json           # Dependencies
    ├── config/                # Configuration
    ├── routes/                # API routes
    ├── controllers/           # Business logic
    ├── models/                # Database schemas
    ├── mqtt/                  # MQTT client
    ├── utils/                 # Utilities (auth, FCM, etc.)
    └── tests/                 # Test suites
```

## 📚 MongoDB Schemas

### User

- Personal info, devices, emergency contacts
- JWT authentication, account security

### Telemetry

- Sensor readings, GPS data, battery status
- Device connectivity, alerts

### Event

- SOS alerts, device status, commands
- Acknowledgments, resolutions

## 🔒 Security Features

- **JWT Authentication** for API access
- **Rate Limiting** (100 requests/15min)
- **Input Validation** with express-validator
- **Password Hashing** with bcrypt
- **Account Lockout** after failed attempts
- **CORS Protection** and Security Headers

## 📈 Production Deployment

### Docker Compose (Recommended)

```bash
# Production deployment
docker-compose up -d --build

# Monitor services
docker-compose logs -f

# Scale API instances
docker-compose up -d --scale api=3
```

### Environment Configuration

Key environment variables:

```bash
NODE_ENV=production
JWT_SECRET=your_strong_secret
MONGO_URI=mongodb://mongo:27017/smartstickdb
MQTT_BROKER_URL=mqtt://mosquitto:1883
FCM_SERVICE_ACCOUNT=/app/secrets/firebase-service-account.json
```

### Production Security Checklist

- [ ] Change default MongoDB credentials
- [ ] Configure MQTT authentication
- [ ] Set strong JWT secret
- [ ] Enable SSL/TLS with reverse proxy
- [ ] Configure proper CORS origins
- [ ] Set up monitoring and logging

## 🏥 Health Monitoring

The `/health` endpoint provides comprehensive service status:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": {
      "database": true,
      "mqtt": true,
      "fcm": true
    },
    "uptime": 3600,
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

## 🤝 Integration Guide

### For Mobile App Developers

1. **User Registration/Login** → Get JWT token
2. **Add Device** → Associate device with user account
3. **Real-time Updates** → Subscribe to FCM notifications
4. **Send Commands** → Control device via authenticated API calls

### For Device Developers (Raspberry Pi)

1. **Send Telemetry** → POST to `/api/telemetry` every 5-10 seconds
2. **SOS Alerts** → POST to `/api/sos` for emergencies
3. **MQTT Subscribe** → Listen to `stick/{deviceId}/command` topic
4. **Status Updates** → Publish to `stick/{deviceId}/status`

## 📞 Support & Contributing

- **Issues**: Create GitHub issue for bugs/features
- **Documentation**: See `server/README.md` for detailed docs
- **Contributing**: Fork → Feature branch → Pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Smart Stick Cloud Backend** - Empowering safe navigation for the visually impaired through IoT and cloud technology. 🦯✨
