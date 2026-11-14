@echo off
echo ========================================================
echo AivraSol Central Medicine Image Collector - Setup
echo ========================================================
echo.
echo 1. Create Scheduled Task (Runs every 2 hours)
echo 2. Run Single Discovery Batch Now
echo 3. Check Scheduled Task Status
echo 4. Stop / Remove Scheduled Task
echo 5. Import Pilot Master Catalog Medicines (50 items)
echo 6. Auto-Populate Full Master Catalog Queue (41,441 items)
echo.
set /p choice="Enter choice (1-6): "

if "%choice%"=="1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0schedule-collector.ps1" -Action create
) else if "%choice%"=="2" (
    powershell -ExecutionPolicy Bypass -File "%~dp0schedule-collector.ps1" -Action run-once
) else if "%choice%"=="3" (
    powershell -ExecutionPolicy Bypass -File "%~dp0schedule-collector.ps1" -Action status
) else if "%choice%"=="4" (
    powershell -ExecutionPolicy Bypass -File "%~dp0schedule-collector.ps1" -Action delete
) else if "%choice%"=="5" (
    node "%~dp0..\..\..\aivrasol-pos\node_modules\tsx\dist\cli.mjs" "%~dp0collector.ts" --import --max 50
) else if "%choice%"=="6" (
    node "%~dp0..\..\..\aivrasol-pos\node_modules\tsx\dist\cli.mjs" "%~dp0collector.ts" --import-all
) else (
    echo Invalid choice.
)

pause
