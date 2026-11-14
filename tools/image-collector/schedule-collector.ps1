# ============================================================================
# AivraSol Medicine Image Collector — Windows Task Scheduler Automation
# Automatically runs the local medicine image collector at configured intervals
# ============================================================================

param (
    [string]$Action = "status", # "create", "start", "stop", "delete", "status", "run-once"
    [int]$IntervalHours = 2
)

$TaskName = "AivraSol-Medicine-Image-Collector"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = (Get-Command node.exe).Source
$TsxCandidate = "$ScriptDir\..\..\node_modules\tsx\dist\cli.mjs"
if (-not (Test-Path $TsxCandidate)) {
    $TsxCandidate = "$ScriptDir\..\..\..\aivrasol-pos\node_modules\tsx\dist\cli.mjs"
}
$TsxPath = if (Test-Path $TsxCandidate) { (Resolve-Path $TsxCandidate).Path } else { $TsxCandidate }
$CollectorScript = "$ScriptDir\collector.ts"

$CommandString = "`"$NodeExe`" `"$TsxPath`" `"$CollectorScript`""

switch ($Action.ToLower()) {
    "create" {
        Write-Host "Creating Windows Scheduled Task: $TaskName..." -ForegroundColor Cyan
        $SchCmd = "schtasks.exe /create /tn `"$TaskName`" /tr `"$CommandString`" /sc HOURLY /mo $IntervalHours /ru `"$env:USERNAME`" /f"
        Invoke-Expression $SchCmd
        Write-Host "Task created successfully. Runs every $IntervalHours hour(s)." -ForegroundColor Green
    }
    "start" {
        Write-Host "Starting Windows Scheduled Task: $TaskName..." -ForegroundColor Cyan
        schtasks.exe /run /tn $TaskName
    }
    "stop" {
        Write-Host "Ending Windows Scheduled Task: $TaskName..." -ForegroundColor Yellow
        schtasks.exe /end /tn $TaskName
    }
    "delete" {
        Write-Host "Removing Windows Scheduled Task: $TaskName..." -ForegroundColor Red
        schtasks.exe /delete /tn $TaskName /f
    }
    "run-once" {
        Write-Host "Running collector session directly..." -ForegroundColor Green
        Set-Location $ScriptDir
        & $NodeExe "$TsxPath" "$CollectorScript"
    }
    Default {
        Write-Host "Checking Scheduled Task Status: $TaskName..." -ForegroundColor Cyan
        schtasks.exe /query /tn $TaskName /fo LIST /v 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Task '$TaskName' is not yet installed." -ForegroundColor Yellow
            Write-Host "Run with -Action create to schedule it." -ForegroundColor Gray
        }
    }
}

