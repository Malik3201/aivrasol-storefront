# ============================================================================
# AivraSol Storefront SaaS — One-Step Cloudflare Staging Provision & Deploy
# Free-Tier Architecture: Cloudflare Workers + Static Assets + D1 + R2 Standard
# No paid custom domain required — deploys directly to *.workers.dev HTTPS
# ============================================================================
$ErrorActionPreference = "Continue"
$env:CI = "true"

Set-Location (Resolve-Path "$PSScriptRoot\..")

Write-Host "1/6 Checking Cloudflare authentication..." -ForegroundColor Cyan
npx --yes wrangler whoami
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare Wrangler is not authenticated. Please run 'npx wrangler login'."
}

Write-Host "2/6 Building public storefront React client..." -ForegroundColor Cyan
if (-not (Test-Path ".\dist\client\index.html")) {
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed."
  }
} else {
  Write-Host "   dist/client already built; reusing compiled assets." -ForegroundColor Gray
}

Write-Host "3/6 Provisioning or reusing D1 Staging Database (aivrasol-storefront-staging-db)..." -ForegroundColor Cyan
$d1Raw = npx --yes wrangler d1 list --json 2>$null | Out-String
$d1ListJson = @()
if ($d1Raw -and $d1Raw.Trim().StartsWith("[")) {
  $d1ListJson = $d1Raw | ConvertFrom-Json
}
$existingDb = $d1ListJson | Where-Object { $_.name -eq "aivrasol-storefront-staging-db" } | Select-Object -First 1

if (-not $existingDb) {
  npx --yes wrangler d1 create aivrasol-storefront-staging-db
  $d1Raw = npx --yes wrangler d1 list --json 2>$null | Out-String
  if ($d1Raw -and $d1Raw.Trim().StartsWith("[")) {
    $d1ListJson = $d1Raw | ConvertFrom-Json
  }
  $existingDb = $d1ListJson | Where-Object { $_.name -eq "aivrasol-storefront-staging-db" } | Select-Object -First 1
}

if ($existingDb -and $existingDb.uuid) {
  $toml = Get-Content ".\wrangler.toml" -Raw
  $toml = [regex]::Replace(
    $toml,
    '(database_name = "aivrasol-storefront-staging-db"\s+database_id = ")[^"]+(")',
    "`${1}$($existingDb.uuid)`${2}"
  )
  Set-Content ".\wrangler.toml" -Value $toml -NoNewline
  Write-Host "   Bound D1 UUID: $($existingDb.uuid)" -ForegroundColor Green
} else {
  throw "Could not obtain UUID for D1 database 'aivrasol-storefront-staging-db'."
}

Write-Host "4/6 Applying D1 Migrations (0001 + 0002) to remote staging DB..." -ForegroundColor Cyan
npx --yes wrangler d1 migrations apply aivrasol-storefront-staging-db --env staging --remote
if ($LASTEXITCODE -ne 0) {
  throw "D1 remote migrations failed."
}

Write-Host "5/6 Provisioning or reusing R2 Staging Media Bucket (aivrasol-storefront-staging-media)..." -ForegroundColor Cyan
$r2Out = cmd /c "npx --yes wrangler r2 bucket list 2>&1" | Out-String
if ($r2Out -match "Please enable R2" -or $r2Out -match "10042") {
  Write-Warning "R2 is not yet enabled on this Cloudflare account (Code 10042). Please enable R2 Free Tier once in Cloudflare Dashboard -> R2."
} elseif ($r2Out -notmatch "aivrasol-storefront-staging-media") {
  npx --yes wrangler r2 bucket create aivrasol-storefront-staging-media
} else {
  Write-Host "   Reusing existing R2 bucket: aivrasol-storefront-staging-media" -ForegroundColor Green
}

Write-Host "6/6 Deploying Storefront Worker + Static Assets to isolated staging (*.workers.dev)..." -ForegroundColor Cyan
npx --yes wrangler deploy --env staging
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare Worker deployment failed."
}

Write-Host "`nDeployment complete!" -ForegroundColor Green
