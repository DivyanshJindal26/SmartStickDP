# Smart Stick Cloud Backend

A complete, production-ready cloud backend for the Smart Stick mobility device project. This backend provides real-time communication, data storage, and notification services for visually impaired users using smart mobility sticks.

## 🏗️ Architecture

```
┌─────────────┐    HTTP/MQTT     ┌─────────────┐    MQTT/HTTP    ┌─────────────┐
│  Raspberry  │ ────────────────▶│   Cloud     │◀──────────────  │   Mobile    │
│     Pi      │                  │  Backend    │                 │     App     │
│  (Device)   │                  │             │                 │             │
└─────────────┘                  └─────────────┘                 └─────────────┘
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │     Services        │
                              │ ┌─────────────────┐ │
                              │ │   MongoDB       │ │
                              │ │   (Data Store)  │ │
                              │ └─────────────────┘ │
                              │ ┌─────────────────┐ │
                              │ │   Mosquitto     │ │
                              │ │   (MQTT Broker) │ │
                              │ └─────────────────┘ │
                              │ ┌─────────────────┐ │
                              │ │   Firebase FCM  │ │
                              │ │ (Notifications) │ │
                              │ └─────────────────┘ │
                              └─────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **Node.js 18+** (for local development)
- **Firebase Service Account** (for push notifications)

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd smartstick-cloud

# Create environment file
cp server/.env.example server/.env

# Edit the environment variables
nano server/.env
```

### 2. Firebase Setup (Required for FCM)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Generate a service account key:
   - Project Settings → Service Accounts → Generate New Private Key
4. Save the JSON file as `secrets/firebase-service-account.json`

```bash
# Create secrets directory
mkdir secrets

# Place your Firebase service account JSON file here
cp path/to/your/firebase-service-account.json secrets/firebase-service-account.json
```

### 3. Run with Docker (Recommended)

```bash
# Start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 4. Verify Installation

Once running, check these URLs:

- **API Health**: http://localhost:8080/health
- **API Info**: http://localhost:8080/api
- **MongoDB Admin**: http://localhost:8081 (admin/admin123)
- **MQTT**: `mqtt://localhost:1883`

## 📡 API Endpoints

### Health & Info

- `GET /health` - Service health check
- `GET /api` - API information and endpoints

### Telemetry (Device → Cloud)

- `POST /api/telemetry` - Receive sensor data from device
- `GET /api/telemetry/:deviceId` - Get telemetry history (Auth required)
- `GET /api/telemetry/:deviceId/latest` - Get latest readings (Auth required)
- `GET /api/telemetry/:deviceId/stats` - Get device statistics (Auth required)
- `GET /api/telemetry/:deviceId/gps-track` - Get GPS track (Auth required)

### SOS Alerts (Emergency)

- `POST /api/sos` - Receive SOS alert from device
- `GET /api/sos` - Get SOS events (Auth required)
- `GET /api/sos/stats` - Get SOS statistics (Auth required)
- `POST /api/sos/:eventId/acknowledge` - Acknowledge SOS (Auth required)
- `POST /api/sos/:eventId/resolve` - Resolve SOS (Auth required)

### User Management

- `POST /api/users/register` - Register new user
- `POST /api/users/login` - User login
- `GET /api/users/profile` - Get user profile (Auth required)
- `PUT /api/users/profile` - Update profile (Auth required)
- `POST /api/users/devices` - Add device to account (Auth required)
- `DELETE /api/users/devices/:deviceId` - Remove device (Auth required)

### Device Commands (Cloud → Device)

- `POST /api/commands/:deviceId` - Send command to device (Auth required)
- `GET /api/commands/:deviceId/history` - Get command history (Auth required)
- `POST /api/commands/:deviceId/emergency` - Send emergency commands (Auth required)
- `GET /api/commands/available` - List available commands (Auth required)

## 📊 MQTT Topics

### Device → Cloud

- `stick/{deviceId}/telemetry` - Sensor readings and GPS data
- `stick/{deviceId}/sos` - Emergency alerts
- `stick/{deviceId}/status` - Device online/offline status
- `stick/{deviceId}/response` - Command responses

### Cloud → Device

- `stick/{deviceId}/command` - Control commands (vibrate, beep, LED, etc.)

## 🧪 Example Usage

### Send Telemetry Data (from Raspberry Pi)

```bash
curl -X POST http://localhost:8080/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "stick-001",
    "sensors": {
      "ultrasonicLeft": 45,
      "ultrasonicRight": 67,
      "IR": 23,
      "battery": {
        "level": 78,
        "voltage": 3.6,
        "charging": false
      }
    },
    "gps": {
      "lat": 40.7128,
      "lon": -74.0060,
      "accuracy": 5
    }
  }'
```

### Trigger SOS Alert

```bash
curl -X POST http://localhost:8080/api/sos \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "stick-001",
    "gps": {
      "lat": 40.7128,
      "lon": -74.0060
    },
    "metadata": {
      "emergencyType": "manual"
    }
  }'
```

### Register User

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePassword123!",
    "fcmToken": "firebase-fcm-token-here"
  }'
```

### Send Command to Device

```bash
# First login to get JWT token
TOKEN=$(curl -X POST http://localhost:8080/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "SecurePassword123!"}' \
  | jq -r '.data.token')

# Send vibrate command
curl -X POST http://localhost:8080/api/commands/stick-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "command": "vibrate",
    "parameters": {
      "intensity": "high",
      "duration": 5
    }
  }'
```

## 🔧 Development

### Local Development (without Docker)

1. **Install Dependencies**

```bash
cd server
npm install
```

2. **Start MongoDB and Mosquitto locally**

```bash
# MongoDB (default port 27017)
mongod

# Mosquitto (default port 1883)
mosquitto -c mosquitto/mosquitto.conf
```

3. **Start Development Server**

```bash
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Environment Variables

Copy `server/.env.example` to `server/.env` and configure:

```bash
# Server Configuration
NODE_ENV=development
PORT=8080

# Database
MONGO_URI=mongodb://localhost:27017/smartstickdb

# Authentication
JWT_SECRET=your_super_strong_secret_key
JWT_EXPIRES_IN=24h

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883

# Firebase Cloud Messaging
FCM_SERVICE_ACCOUNT=./secrets/firebase-service-account.json

# Admin User
ADMIN_EMAIL=admin@smartstick.com
```

## 🔒 Security Features

- **JWT Authentication** for API access
- **Rate Limiting** to prevent abuse
- **Input Validation** and sanitization
- **Helmet.js** security headers
- **CORS** configuration
- **Account Lockout** after failed login attempts

## 📈 Monitoring & Logging

- **Health Check** endpoint for monitoring
- **Structured Logging** with Morgan
- **Error Handling** with stack traces in development
- **Graceful Shutdown** handling

## 🐳 Production Deployment

### Docker Compose (Recommended)

```bash
# Production deployment
docker-compose -f docker-compose.yml up -d

# Check logs
docker-compose logs -f api

# Scale API instances
docker-compose up -d --scale api=3
```

### Security Considerations for Production

1. **Change Default Passwords**

   - MongoDB admin credentials
   - Mongo Express credentials

2. **Secure MQTT**

   - Disable anonymous access in `mosquitto.conf`
   - Add authentication and ACL rules

3. **Environment Variables**

   - Use strong JWT secret
   - Configure proper CORS origins
   - Set appropriate rate limits

4. **SSL/TLS**
   - Use reverse proxy (nginx/traefik) with SSL
   - Enable MQTT over TLS

## 📝 Available Commands

The API supports these device commands:

- `vibrate` - Activate vibration motor
- `beep` - Sound buzzer/beeper
- `led_on` - Turn on LED indicators
- `led_off` - Turn off LED indicators
- `status_check` - Request device status
- `reboot` - Restart device (use with caution)

Each command accepts optional parameters for customization.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For questions and support:

- Create an issue in the repository
- Email: support@smartstick.com

---

**Smart Stick Cloud Backend** - Empowering mobility for the visually impaired through technology. 🦯✨
