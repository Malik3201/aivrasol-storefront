<#
.SYNOPSIS
  One-command custom domain hookup for the AivraSol pharmacy storefront Worker.

.DESCRIPTION
  After you buy a domain and add it to Cloudflare (Dashboard -> Add a domain, change nameservers),
  run this script once. It will:
    1. Connect  media.<domain>  to the live R2 media bucket (images served by R2 CDN:
       0 Worker requests, 0 D1 reads).
    2. Write the managed blocks in wrangler.toml:
         - Worker custom domains: <domain> and www.<domain>
         - Wildcard route *.<domain>/*  so every pharmacy gets  <slug>.<domain>  automatically
         - PLATFORM_BASE_DOMAIN = <domain>, PUBLIC_MEDIA_BASE_URL = https://media.<domain>
    3. (optional -UpdateExistingStorefronts) move every existing pharmacy's primary_domain to
       <slug>.<domain>  (SEO canonical / sitemap) and bump config_version to refresh caches.
    4. (optional -Deploy) build the client and deploy the Worker.

  Old workers.dev links keep working (/s/<slug>) — nothing breaks for existing users.

.EXAMPLE
  .\scripts\connect-domain.ps1 -Domain mediqoo.pk -ZoneId 0123456789abcdef0123456789abcdef -UpdateExistingStorefronts -Deploy

.NOTES
  Zone ID: Cloudflare Dashboard -> click your domain -> Overview page -> right sidebar "Zone ID".
  Requires a logged-in Wrangler (`npx wrangler login`). Compatible with Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$ZoneId,
  [ValidateSet("staging", "production")][string]$Env = "staging",
  [switch]$SkipMedia,
  [switch]$SkipWildcard,
  [switch]$UpdateExistingStorefronts,
  [switch]$Deploy,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$Domain = $Domain.Trim().ToLower() -replace '^https?://', '' -replace '/.*$', '' -replace '^www\.', ''
if ($Domain -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$') { throw "Invalid domain: $Domain" }
if ($ZoneId -notmatch '^[a-f0-9]{32}$') { throw "Zone ID must be the 32-character hex id from the Cloudflare domain Overview page." }

$mediaHost = "media.$Domain"
$bucket = "aivrasol-storefront-staging-media"
$dbName = "aivrasol-storefront-staging-db"
$envArgs = @()
if ($Env -eq "staging") { $envArgs = @("--env", "staging") }

# --- locate wrangler (local install > npx cache > npx) ---
function Invoke-Wrangler([string[]]$WArgs) {
  $env:WRANGLER_SEND_METRICS = "false"
  $local = Join-Path $root "node_modules\wrangler\bin\wrangler.js"
  $cached = Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "node_modules\wrangler\bin\wrangler.js" } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  $display = "wrangler " + ($WArgs -join " ")
  if ($DryRun) { Write-Host "[dry-run] $display" -ForegroundColor DarkGray; return }
  Write-Host "> $display" -ForegroundColor Cyan
  if (Test-Path $local) { & node $local @WArgs }
  elseif ($cached) { & node $cached @WArgs }
  else { & npx --yes wrangler @WArgs }
  if ($LASTEXITCODE -ne 0) { throw "wrangler failed: $display" }
}

# --- 1. R2 custom domain for media ---
if (-not $SkipMedia) {
  Write-Host "`n[1/4] Connecting https://$mediaHost to R2 bucket '$bucket'..." -ForegroundColor Yellow
  try {
    Invoke-Wrangler @("r2", "bucket", "domain", "add", $bucket, "--domain", $mediaHost, "--zone-id", $ZoneId, "--min-tls", "1.2", "--force")
  } catch {
    Write-Warning "R2 domain step failed (it may already be connected): $($_.Exception.Message)"
  }
}

# --- 2. wrangler.toml managed blocks ---
Write-Host "`n[2/4] Updating wrangler.toml managed blocks for env '$Env'..." -ForegroundColor Yellow
$tomlPath = Join-Path $root "wrangler.toml"
$toml = [System.IO.File]::ReadAllText($tomlPath)

function Set-ManagedBlock([string]$Text, [string]$Name, [string]$Body) {
  $pattern = "(?s)(# >>> managed:$([regex]::Escape($Name))[^\r\n]*\r?\n).*?(# <<< managed:$([regex]::Escape($Name)))"
  if ($Text -notmatch $pattern) { throw "Managed block '$Name' not found in wrangler.toml" }
  $nl = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $bodyText = if ($Body) { ($Body -replace "`r?`n", $nl) + $nl } else { "" }
  return [regex]::Replace($Text, $pattern, { param($m) $m.Groups[1].Value + $bodyText + $m.Groups[2].Value })
}

$routeLines = @(
  "routes = [",
  "  { pattern = `"$Domain`", custom_domain = true },",
  "  { pattern = `"www.$Domain`", custom_domain = true },"
)
if (-not $SkipWildcard) { $routeLines += "  { pattern = `"*.$Domain/*`", zone_name = `"$Domain`" }," }
$routeLines += "]"
$routesBody = $routeLines -join "`n"

$varLines = @("PLATFORM_BASE_DOMAIN = `"$Domain`"")
if (-not $SkipMedia) { $varLines += "PUBLIC_MEDIA_BASE_URL = `"https://$mediaHost`"" }
$varsBody = $varLines -join "`n"

if ($Env -eq "staging") {
  $toml = Set-ManagedBlock $toml "staging-routes" $routesBody
  $toml = Set-ManagedBlock $toml "staging-vars" $varsBody
} else {
  if ($toml -notmatch "# >>> managed:production-routes") {
    # Top-level routes must appear before any [table]; insert right after `workers_dev = true` (first occurrence)
    $toml = [regex]::Replace($toml, "(?m)^(workers_dev = true\r?\n)", "`$1# >>> managed:production-routes (scripts/connect-domain.ps1) — do not edit by hand`n# <<< managed:production-routes`n", 1)
  }
  $toml = Set-ManagedBlock $toml "production-routes" $routesBody
  $toml = Set-ManagedBlock $toml "production-vars" $varsBody
}

if ($DryRun) {
  Write-Host "[dry-run] wrangler.toml would become:" -ForegroundColor DarkGray
  Write-Host $toml
} else {
  [System.IO.File]::WriteAllText($tomlPath, $toml, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "wrangler.toml updated." -ForegroundColor Green
}

# --- 3. existing storefront primary domains ---
if ($UpdateExistingStorefronts) {
  Write-Host "`n[3/4] Moving existing pharmacies to <slug>.$Domain ..." -ForegroundColor Yellow
  $sql = "UPDATE storefronts SET primary_domain = slug || '.$Domain', config_version = config_version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug IS NOT NULL AND slug <> '';"
  Invoke-Wrangler (@("d1", "execute", $dbName, "--remote", "--command", $sql) + $envArgs)
} else {
  Write-Host "`n[3/4] Skipped existing storefront update (add -UpdateExistingStorefronts to move them to <slug>.$Domain)." -ForegroundColor DarkGray
}

# --- 4. deploy ---
if ($Deploy) {
  Write-Host "`n[4/4] Building client and deploying Worker..." -ForegroundColor Yellow
  if (-not $DryRun) {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Client build failed" }
  }
  Invoke-Wrangler (@("deploy") + $envArgs)
} else {
  Write-Host "`n[4/4] Not deployed. Run:  npm run build ; npx wrangler deploy $($envArgs -join ' ')" -ForegroundColor DarkGray
}

Write-Host "`nDONE." -ForegroundColor Green
Write-Host "Main site:        https://$Domain"
Write-Host "Pharmacy sites:   https://<slug>.$Domain"
if (-not $SkipMedia) { Write-Host "Media (R2 CDN):   https://$mediaHost" }
if (-not $SkipWildcard) {
  Write-Host "`nONE manual DNS step for pharmacy subdomains (Cloudflare Dashboard -> $Domain -> DNS -> Add record):" -ForegroundColor Yellow
  Write-Host "  Type: AAAA   Name: *   IPv6: 100::   Proxy: ON (orange cloud)"
  Write-Host "  (Apex, www and media DNS records are created automatically by Cloudflare.)"
}
