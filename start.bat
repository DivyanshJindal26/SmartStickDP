@echo off
echo.
echo ================================
echo Smart Stick Cloud Backend Setup
echo ================================
echo.

REM Check if Docker is running
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not running
    echo Please install Docker Desktop and try again
    pause
    exit /b 1
)

echo [1/4] Checking project structure...
if not exist "docker-compose.yml" (
    echo ERROR: docker-compose.yml not found
    echo Make sure you're in the smartstick-cloud directory
    pause
    exit /b 1
)

echo [2/4] Checking environment file...
if not exist "server\.env" (
    echo Creating .env file from template...
    copy "server\.env.example" "server\.env"
    echo.
    echo IMPORTANT: Edit server\.env and set your JWT_SECRET!
    echo Example: JWT_SECRET=your_super_strong_secret_key_min_32_chars_2024!
    echo.
)

echo [3/4] Checking Firebase service account...
if not exist "secrets\firebase-service-account.json" (
    echo.
    echo WARNING: Firebase service account not found!
    echo You need to:
    echo 1. Go to https://console.firebase.google.com/
    echo 2. Create a project or select existing one
    echo 3. Go to Project Settings ^> Service Accounts
    echo 4. Click "Generate new private key"
    echo 5. Save the file as: secrets\firebase-service-account.json
    echo.
    echo For now, we'll use a dummy file to prevent startup errors...
    copy "secrets\firebase-service-account.json.template" "secrets\firebase-service-account.json"
    echo.
)

echo [4/4] Starting services...
echo This may take a few minutes on first run...
echo.

docker-compose up --build

echo.
echo Setup complete! Your Smart Stick Cloud Backend should be running.
echo.
echo Test it at: http://localhost:7284/health
echo.
pause