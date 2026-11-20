# Starts the tabulator in Docker and makes it reachable from other devices on the LAN.
#   powershell -ExecutionPolicy Bypass -File scripts\start-lan.ps1
# Detects this PC's LAN IP, creates/updates .env (generating secrets on first run),
# builds and starts the containers, then prints the address judges should open.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$envPath = Join-Path $root '.env'

function Get-LanIPs {
  # Interfaces with a default gateway are the ones other devices can reach.
  $ips = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address.IPAddress }
  if (-not $ips) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback|VirtualBox|VMware' } |
      Select-Object -ExpandProperty IPAddress
  }
  @($ips | Where-Object { $_ } | Select-Object -Unique)
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

if (-not (Get-Value 'DJANGO_SECRET_KEY')) { Set-Value 'DJANGO_SECRET_KEY' (New-Secret 48) }
if (-not (Get-Value 'POSTGRES_PASSWORD')) { Set-Value 'POSTGRES_PASSWORD' (New-Secret 24) }
$ips = Get-LanIPs
Set-Value 'HOST_LAN_IP' ($ips -join ',')
$port = Get-Value 'APP_PORT'; if (-not $port) { $port = '8000'; Set-Value 'APP_PORT' $port }
$httpsPort = Get-Value 'HTTPS_PORT'; if (-not $httpsPort) { $httpsPort = '8443'; Set-Value 'HTTPS_PORT' $httpsPort }
# HTTPS certificates are issued by the proxy for exactly these addresses (no internet needed).
$sites = @('https://localhost:8443') + ($ips | ForEach-Object { "https://${_}:8443" })
Set-Value 'CADDY_SITES' ($sites -join ', ')
Set-Value 'TLS_DEFAULT_SNI' $(if ($ips) { $ips[0] } else { 'localhost' })
[IO.File]::WriteAllLines($envPath, $lines, (New-Object Text.UTF8Encoding $false))

# Docker prints progress on stderr; Windows PowerShell 5.1 would treat that as an error under 'Stop'.
$ErrorActionPreference = 'Continue'
docker compose up -d --build
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { throw "docker compose failed (exit $code). See the output above." }

Write-Host 'Waiting for the app to become healthy...'
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if (-not $ok) { Write-Warning 'App did not answer yet. Check: docker compose logs web' }

Write-Host ''
Write-Host 'ICPEP Tabulator is running.' -ForegroundColor Green
Write-Host "  On this computer: http://localhost:$port"
if ($ips) {
  $ips | ForEach-Object {
    Write-Host "  Judges on the same Wi-Fi/LAN: http://${_}:$port" -ForegroundColor Cyan
    Write-Host "  One-time phone setup (works offline after): http://${_}:$port/setup" -ForegroundColor Cyan
  }
}
else { Write-Warning 'No LAN address found. Connect this computer to the event Wi-Fi and run again.' }
Write-Host ''
Write-Host 'If other devices cannot connect, allow both ports through Windows Firewall (run as Administrator):'
Write-Host "  New-NetFirewallRule -DisplayName 'ICPEP Tabulator' -Direction Inbound -Protocol TCP -LocalPort $port,$httpsPort -Action Allow -Profile Private,Domain"
Write-Host 'and make sure the Wi-Fi network is set to Private, not Public.'
