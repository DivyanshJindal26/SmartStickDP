# 🚀 Smart Stick Cloud Backend - Complete Setup Guide

This guide will walk you through setting up the Smart Stick Cloud Backend from scratch.

## 📋 Prerequisites

Before starting, ensure you have:

- **Docker Desktop** installed (recommended) OR **Node.js 18+**
- **Git** for cloning repositories
- **Text editor** (VS Code, Notepad++, etc.)
- **Firebase account** (free)

## 🔥 Step 1: Firebase Setup (Required for Push Notifications)

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** or **"Add project"**
3. Enter project name: `smartstick-app` (or your preferred name)
4. Disable Google Analytics (not needed for this project)
5. Click **"Create project"**

### 1.2 Enable Firebase Cloud Messaging (FCM)

1. In your Firebase project, go to **Project Settings** (gear icon)
2. Click on **"Cloud Messaging"** tab
3. Note: FCM is enabled by default in new projects

### 1.3 Generate Service Account Key

1. In Firebase Console, go to **Project Settings** → **Service Accounts**
2. Click **"Generate new private key"**
3. Click **"Generate key"** - this downloads a JSON file
4. **IMPORTANT**: Save this file as you'll need it in Step 3

## 📁 Step 2: Project Setup

### 2.1 Navigate to Project Directory

```bash
# Navigate to your project
cd c:\Users\divya\OneDrive\Desktop\DJ\DP\cloudServer\smartstick-cloud
```

### 2.2 Create Required Directories and Files

```bash
# Create secrets directory (if not exists)
mkdir secrets

# Create environment file
copy server\.env.example server\.env
```

## 🔐 Step 3: Configure Secrets and Environment

### 3.1 Add Firebase Service Account

1. Copy the Firebase service account JSON file you downloaded in Step 1.3
2. Rename it to: `firebase-service-account.json`
3. Place it in: `secrets/firebase-service-account.json`

**Example Firebase service account structure:**

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project-id.iam.gserviceaccount.com"
}
```

### 3.2 Configure Environment Variables

Edit `server\.env` file with your configuration:

```bash
# Server Configuration
NODE_ENV=development
PORT=8080

# Database Configuration
MONGO_URI=mongodb://mongo:27017/smartstickdb

# JWT Configuration (CHANGE THESE!)
JWT_SECRET=your_super_strong_secret_key_min_32_chars_2024!
JWT_EXPIRES_IN=24h

# MQTT Configuration
MQTT_BROKER_URL=mqtt://mosquitto:1883

# Firebase Cloud Messaging
FCM_SERVICE_ACCOUNT=/app/secrets/firebase-service-account.json

# Admin Configuration
ADMIN_EMAIL=admin@smartstick.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**🔑 IMPORTANT Security Notes:**

- **JWT_SECRET**: Use a strong, random secret (minimum 32 characters)
- **ADMIN_EMAIL**: Change to your actual admin email
- **Never commit secrets to version control**

## 🐳 Step 4: Run with Docker (Recommended)

### 4.1 Start All Services

```bash
# Navigate to project directory
cd c:\Users\divya\OneDrive\Desktop\DJ\DP\cloudServer\smartstick-cloud

# Start all services in background
docker-compose up -d --build
```

### 4.2 Monitor Startup

```bash
# Watch logs to ensure everything starts correctly
docker-compose logs -f

# Check individual service logs
docker-compose logs api
docker-compose logs mongo
docker-compose logs mosquitto
```

### 4.3 Verify Services are Running

```bash
# Check service status
docker-compose ps
```

You should see all services as "Up":

```
    Name                   Command               State                    Ports
-----------------------------------------------------------------------------------------
smartstick-api         docker-entrypoint.sh node ...   Up      0.0.0.0:8080->8080/tcp
smartstick-mongo       docker-entrypoint.sh mongod     Up      0.0.0.0:27017->27017/tcp
smartstick-mosquitto   /docker-entrypoint.sh /usr ...   Up      0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp
smartstick-mongo-express   tini -- /docker-entrypoint ...   Up      0.0.0.0:8081->8081/tcp
```

## ✅ Step 5: Verify Installation

### 5.1 Test API Health

Open your browser or use curl:

```bash
# Test health endpoint
curl http://localhost:8080/health
```

Expected response:

```json
{
  "success": true,
  "message": "Smart Stick Cloud API is running",
  "data": {
    "status": "healthy",
    "services": {
      "database": true,
      "mqtt": true,
      "fcm": true
    }
  }
}
```

### 5.2 Test API Info

```bash
curl http://localhost:8080/api
```

### 5.3 Access Web Interfaces

- **API Health**: http://localhost:8080/health
- **API Info**: http://localhost:8080/api
- **MongoDB Admin**: http://localhost:8081
  - Username: `admin`
  - Password: `admin123`

## 🧪 Step 6: Test Core Functionality

### 6.1 Test Telemetry Endpoint

```bash
curl -X POST http://localhost:8080/api/telemetry \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"test-stick-001\",
    \"sensors\": {
      \"ultrasonicLeft\": 45,
      \"ultrasonicRight\": 67,
      \"IR\": 23,
      \"battery\": {
        \"level\": 78,
        \"voltage\": 3.6,
        \"charging\": false
      }
    },
    \"gps\": {
      \"lat\": 40.7128,
      \"lon\": -74.0060,
      \"accuracy\": 5
    }
  }"
```

### 6.2 Test SOS Alert

```bash
curl -X POST http://localhost:8080/api/sos \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"test-stick-001\",
    \"gps\": {
      \"lat\": 40.7128,
      \"lon\": -74.0060
    },
    \"metadata\": {
      \"emergencyType\": \"manual\"
    }
  }"
```

### 6.3 Test User Registration

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test User\",
    \"email\": \"test@example.com\",
    \"password\": \"TestPassword123!\"
  }"
```

## 🔧 Step 7: Development Setup (Optional)

If you want to run locally without Docker:

### 7.1 Install Dependencies

```bash
cd server
npm install
```

### 7.2 Start Local Services

You'll need to install and start MongoDB and Mosquitto locally:

```bash
# Install MongoDB Community Edition
# Install Mosquitto MQTT Broker

# Update .env file for local development
# MONGO_URI=mongodb://localhost:27017/smartstickdb
# MQTT_BROKER_URL=mqtt://localhost:1883
```

### 7.3 Start Development Server

```bash
npm run dev
```

## 📱 Step 8: Mobile App Integration

### 8.1 Get Firebase Configuration

1. In Firebase Console, go to **Project Settings**
2. Click **"Add app"** → **Android** or **iOS**
3. Follow the setup to get `google-services.json` (Android) or `GoogleService-Info.plist` (iOS)
4. Add these files to your mobile app project

### 8.2 API Endpoints for Mobile App

Base URL: `http://localhost:8080/api` (or your production URL)

Key endpoints:

- `POST /users/register` - User signup
- `POST /users/login` - Get JWT token
- `POST /users/devices` - Add device to account
- `GET /sos` - Get SOS events
- `POST /commands/:deviceId` - Send commands to device

## 🦯 Step 9: Raspberry Pi Integration

### 9.1 Python Script Example for RPi

```python
import requests
import json
import time

API_BASE = "http://your-server:8080/api"
DEVICE_ID = "stick-001"

def send_telemetry(sensor_data):
    payload = {
        "deviceId": DEVICE_ID,
        "sensors": sensor_data,
        "timestamp": time.time()
    }

    response = requests.post(
        f"{API_BASE}/telemetry",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    return response.status_code == 201

def send_sos_alert(gps_data):
    payload = {
        "deviceId": DEVICE_ID,
        "gps": gps_data,
        "metadata": {"emergencyType": "automatic"}
    }

    response = requests.post(
        f"{API_BASE}/sos",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    return response.status_code == 201

# Usage
sensor_data = {
    "ultrasonicLeft": 45,
    "ultrasonicRight": 67,
    "battery": {"level": 78}
}

send_telemetry(sensor_data)
```

## 🛠️ Troubleshooting

### Common Issues:

1. **Docker services won't start:**

   ```bash
   # Check if ports are already in use
   netstat -an | findstr :8080
   netstat -an | findstr :27017
   netstat -an | findstr :1883
   ```

2. **FCM not working:**

   - Verify `firebase-service-account.json` is valid JSON
   - Check file path in docker-compose.yml
   - Ensure Firebase project has FCM enabled

3. **MongoDB connection issues:**

   ```bash
   # Check MongoDB logs
   docker-compose logs mongo
   ```

4. **MQTT connection failed:**
   ```bash
   # Check Mosquitto logs
   docker-compose logs mosquitto
   ```

### Useful Commands:

```bash
# Restart all services
docker-compose restart

# Rebuild and restart
docker-compose down
docker-compose up --build

# View logs for specific service
docker-compose logs -f api

# Access container shell
docker-compose exec api sh
docker-compose exec mongo mongosh
```

## 🎯 Next Steps

1. **Deploy to Production**: Use cloud providers like AWS, Google Cloud, or DigitalOcean
2. **SSL/TLS**: Add reverse proxy with SSL certificates
3. **Monitoring**: Set up logging and monitoring tools
4. **Backup**: Configure database backups
5. **Scaling**: Use container orchestration for high availability

## 📞 Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify all environment variables are set correctly
3. Ensure Firebase service account file is valid
4. Test individual endpoints with curl

Your Smart Stick Cloud Backend is now ready to support visually impaired users with real-time device monitoring and emergency alerts! 🦯✨
