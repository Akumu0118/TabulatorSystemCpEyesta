# Starts the tabulator in Docker and makes it reachable from the tablets on the event hotspot.
#   powershell -ExecutionPolicy Bypass -File scripts\start-lan.ps1
#
# Event setup: a phone runs a Wi-Fi hotspot (no internet needed). This laptop and the judges'
# tablets join it; this laptop runs the tabulator.
#
# What it does:
#   - finds this laptop's address on the hotspot (Wi-Fi first), fills in .env (secrets on first run)
#   - offers to let the tablets through Windows Firewall (hotspots are usually "Public" networks)
#   - builds and starts the containers, then prints the addresses for the tablets
#   - keeps watching: if the hotspot hands this laptop a new address, it updates the HTTPS
#     certificate, restarts the containers and tells you the new address. Ctrl+C stops watching;
#     the tabulator keeps running.
#
# Options:
#   -Ip 192.168.43.25   use this address instead of detecting one
#   -NoWatch            start and exit, no address watching
#   -SkipFirewall       do not check or offer the firewall rule
param(
  [string]$Ip = '',
  [switch]$NoWatch,
  [switch]$SkipFirewall
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$envPath = Join-Path $root '.env'
$ruleName = 'ICPEP Tabulator'
$virtual = 'vEthernet|WSL|Docker|Loopback|VirtualBox|VMware|Hyper-V|Tailscale|ZeroTier|VPN|TAP-|Bluetooth'

function Test-WiFi($cfg) {
  "$($cfg.InterfaceAlias) $($cfg.InterfaceDescription) $($cfg.NetAdapter.PhysicalMediaType)" -match 'Wi-?Fi|WLAN|Wireless|802\.11'
}

function Get-LanIPs {
  if ($Ip) { return @($Ip) }
  # Interfaces with a gateway are on a real network; the hotspot phone is the gateway even without internet.
  $cfgs = @(Get-NetIPConfiguration | Where-Object {
      $_.IPv4Address -and $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and
      "$($_.InterfaceAlias) $($_.InterfaceDescription)" -notmatch $virtual })
  # Wi-Fi first: the tablets are on the hotspot, and HTTPS can only answer for one address.
  $ips = @($cfgs | Where-Object { Test-WiFi $_ }) + @($cfgs | Where-Object { -not (Test-WiFi $_) }) |
    ForEach-Object { $_.IPv4Address.IPAddress }
  if (-not $ips) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch $virtual } |
      Select-Object -ExpandProperty IPAddress
  }
  @($ips | Where-Object { $_ } | Select-Object -Unique)
}

function Get-WiFiName {
  try {
    $line = netsh wlan show interfaces | Where-Object { $_ -match '^\s*SSID\s*:' } | Select-Object -First 1
    if ($line) { return ($line -split ':', 2)[1].Trim() }
  } catch {}
  ''
}

function New-Secret([int]$bytes = 32) {
  $buf = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  -join ($buf | ForEach-Object { $_.ToString('x2') })
}

if (-not (Test-Path $envPath)) { Copy-Item (Join-Path $root '.env.example') $envPath }
$lines = [Collections.Generic.List[string]](Get-Content $envPath)

function Get-Value($key) {
  $line = $lines | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if ($line) { $line.Substring($key.Length + 1) } else { '' }
}
function Set-Value($key, $value) {
  $i = $lines.FindIndex([Predicate[string]] { param($l) $l -match "^$key=" })
  if ($i -ge 0) { $lines[$i] = "$key=$value" } else { $lines.Add("$key=$value") }
}
function Save-Env { [IO.File]::WriteAllLines($envPath, $lines, (New-Object Text.UTF8Encoding $false)) }

function Set-LanEnv($ips) {
  $ips = @($ips) # one address arrives as a plain string; [0] would then be its first character
  Set-Value 'HOST_LAN_IP' ($ips -join ',')
  # HTTPS certificates are issued by the proxy for exactly these addresses (no internet needed).
  $sites = @("https://localhost:$httpsPort") + ($ips | ForEach-Object { "https://${_}:$httpsPort" })
  Set-Value 'CADDY_SITES' ($sites -join ', ')
  # Tablets open the app by IP, which carries no server name, so HTTPS answers for the first address.
  Set-Value 'TLS_DEFAULT_SNI' $(if ($ips) { $ips[0] } else { 'localhost' })
  Save-Env
}

function Invoke-Compose([string[]]$composeArgs) {
  # Docker prints progress on stderr; Windows PowerShell 5.1 would treat that as an error under 'Stop'.
  $ErrorActionPreference = 'Continue'
  # Out-Host: show the output without it becoming part of this function's return value.
  & docker compose @composeArgs | Out-Host
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $code
}

function Write-Addresses($primary) {
  Write-Host ''
  Write-Host '  ----------------------------------------------------------------' -ForegroundColor Cyan
  Write-Host "  Tablet address:  $primary" -ForegroundColor Cyan
  Write-Host "    First time on a tablet:  http://${primary}:$port/setup" -ForegroundColor Cyan
  Write-Host "    Then the app:            https://${primary}:$httpsPort" -ForegroundColor Cyan
  Write-Host "    (without the setup:      http://${primary}:$port)" -ForegroundColor Cyan
  Write-Host '  ----------------------------------------------------------------' -ForegroundColor Cyan
}

function Write-Moved($old, $new) {
  Write-Host ''
  Write-Warning "This laptop's address changed: it was $old, it is now $new."
  Write-Host '  Tablets opened on the old address cannot reach the tabulator until they move:' -ForegroundColor Yellow
  Write-Host "  on each tablet tap 'Laptop address changed?' and type $new." -ForegroundColor Yellow
  Write-Host '  Their unsent sheets, drafts and login come along.' -ForegroundColor Yellow
}

# ---- Docker must be running ----
$ErrorActionPreference = 'Continue'
docker info *> $null
$dockerOk = $LASTEXITCODE -eq 0
$ErrorActionPreference = 'Stop'
if (-not $dockerOk) { throw 'Docker is not running. Start Docker Desktop, wait until it says "Engine running", then run this again.' }

# ---- .env ----
if (-not (Get-Value 'DJANGO_SECRET_KEY')) { Set-Value 'DJANGO_SECRET_KEY' (New-Secret 48) }
if (-not (Get-Value 'POSTGRES_PASSWORD')) { Set-Value 'POSTGRES_PASSWORD' (New-Secret 24) }
$port = Get-Value 'APP_PORT'; if (-not $port) { $port = '8000'; Set-Value 'APP_PORT' $port }
$httpsPort = Get-Value 'HTTPS_PORT'; if (-not $httpsPort) { $httpsPort = '8443'; Set-Value 'HTTPS_PORT' $httpsPort }

$previous = ((Get-Value 'HOST_LAN_IP') -split ',')[0]
$ips = @(Get-LanIPs)
$ssid = Get-WiFiName
if ($ssid) { Write-Host "Wi-Fi: connected to '$ssid'." }
if (-not $ips) {
  Write-Warning 'This laptop is not on a network. Join the hotspot first; the tabulator still starts for this laptop only.'
}
Set-LanEnv $ips
$primary = if ($ips) { $ips[0] } else { '' }

# ---- Windows Firewall: let the tablets in on any network type ----
if (-not $SkipFirewall) {
  $rule = $null
  try { $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Select-Object -First 1 } catch {}
  $ok = $false
  if ($rule) {
    $ports = @(($rule | Get-NetFirewallPortFilter).LocalPort)
    $ok = $rule.Enabled -eq 'True' -and $rule.Profile -eq 'Any' -and ($ports -contains $port) -and ($ports -contains $httpsPort)
  }
  if (-not $ok) {
    Write-Host ''
    Write-Host 'Windows Firewall may block the tablets. Phone hotspots are usually treated as "Public" networks.'
    $answer = Read-Host "Allow ports $port and $httpsPort for the tabulator now? Needs administrator approval. [Y/n]"
    if ($answer -notmatch '^(n|no)$') {
      $cmd = "Remove-NetFirewallRule -DisplayName '$ruleName' -ErrorAction SilentlyContinue; " +
        "New-NetFirewallRule -DisplayName '$ruleName' -Description 'Lets judges'' tablets reach the tabulator on the event hotspot' " +
        "-Direction Inbound -Protocol TCP -LocalPort $port,$httpsPort -Action Allow -Profile Any | Out-Null"
      try {
        Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $cmd
        Write-Host 'Firewall rule added.' -ForegroundColor Green
      } catch {
        Write-Warning 'Firewall rule not added (administrator approval was declined). Tablets may not connect.'
      }
    }
  }
}

# ---- start ----
$code = Invoke-Compose @('up', '-d', '--build')
if ($code -ne 0) { throw "docker compose failed (exit $code). See the output above." }

Write-Host 'Waiting for the app to become healthy...'
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $healthy = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if (-not $healthy) { Write-Warning 'App did not answer yet. Check: docker compose logs web' }

Write-Host ''
Write-Host 'ICPEP Tabulator is running.' -ForegroundColor Green
Write-Host "  On this laptop: http://localhost:$port"
if ($primary) { Write-Addresses $primary }
if ($previous -and $primary -and $previous -ne $primary) { Write-Moved $previous $primary }
Write-Host ''
Write-Host 'Event-day reminders: keep this laptop plugged in and set to never sleep, keep the hotspot'
Write-Host 'phone charging with its hotspot auto-off disabled, and turn off mobile data on the tablets.'

if ($NoWatch) { return }

# ---- watch the address for the rest of the event ----
Write-Host ''
Write-Host 'Watching this laptop''s address. Leave this window open; Ctrl+C stops watching (the tabulator keeps running).'
$offline = $false
while ($true) {
  Start-Sleep -Seconds 15
  $now = @(Get-LanIPs)
  if (-not $now) {
    if (-not $offline) {
      Write-Warning "$(Get-Date -Format HH:mm) Lost the hotspot. Tablets keep their scores and send them when this laptop is back."
      try { [Console]::Beep(660, 400) } catch {}
      $offline = $true
    }
    continue
  }
  if ($offline) { Write-Host "$(Get-Date -Format HH:mm) Back on the network." -ForegroundColor Green; $offline = $false }
  if ($now[0] -eq $primary) { continue }

  $old = $primary
  $primary = $now[0]
  Write-Host ''
  Write-Host "$(Get-Date -Format HH:mm) New address $primary (was $(if ($old) { $old } else { 'none' })). Updating the certificate and restarting..." -ForegroundColor Yellow
  Set-LanEnv $now
  $code = Invoke-Compose @('up', '-d')
  if ($code -ne 0) { Write-Warning "docker compose failed (exit $code). Run this script again." }
  try { [Console]::Beep(880, 300); [Console]::Beep(880, 300) } catch {}
  Write-Addresses $primary
  if ($old) { Write-Moved $old $primary }
}
