#Requires -Version 5.1
<#
.SYNOPSIS
  Passe Hyperion Orbit en HTTPS (https://hyperion-orbit.duckdns.org) via Caddy.

.DESCRIPTION
  1. Vérifie que DuckDNS résout vers ce PC (ou affiche l'écart).
  2. Installe Caddy (winget, sinon téléchargement direct).
  3. Ouvre les ports 80/443 dans le pare-feu Windows.
  4. Démarre le serveur de jeu (port 8080) si besoin.
  5. Lance Caddy avec le Caddyfile du projet (certificat Let's Encrypt auto).

  Le port 8080 n'a plus besoin d'être exposé sur ta box : seuls 80 + 443
  doivent être redirigés vers ce PC. L'URL finale n'a plus de ":8080".
#>
param(
  [string]$Domain = "hyperion-orbit.duckdns.org",
  [int]$GamePort = 8080,
  [string]$Email = ""
)

$ErrorActionPreference = "Stop"
$GameDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $GameDir

function Write-Step([string]$msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

Write-Step "1/5 - Domaine DuckDNS ($Domain)"
try {
  $resolved = @(Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop |
    Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress)
  Write-Host "DNS $Domain -> $($resolved -join ', ')"
} catch {
  Write-Warning "DNS illisible pour $Domain : $_"
  Write-Warning "Vérifie que le domaine existe sur https://www.duckdns.org et que l'IP est à jour."
}
try {
  $pub = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10).Trim()
  Write-Host "IP publique de ce PC (approx) : $pub"
  if ($resolved -and ($resolved -notcontains $pub)) {
    Write-Warning "Le DNS ($($resolved -join ',')) ne pointe PAS vers ton IP publique ($pub)."
    Write-Warning "Mets à jour DuckDNS AVANT de continuer, sinon Let's Encrypt échouera."
  }
} catch { Write-Warning "IP publique illisible : $_" }

Write-Step "2/5 - Caddy"
$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installation de Caddy via winget..."
    winget install --id CaddyServer.Caddy -e --silent --accept-package-agreements --accept-source-agreements
    $caddy = Get-Command caddy -ErrorAction SilentlyContinue
  }
  if (-not $caddy) {
    Write-Warning "Installe Caddy à la main : https://caddyserver.com/download"
    Write-Warning "puis relance ce script."
    exit 1
  }
}
& caddy version

if ($Email -ne "") {
  $cf = Get-Content -LiteralPath (Join-Path $GameDir "Caddyfile") -Raw
  $cf = $cf -replace "email\s+\S+", "email $Email"
  Set-Content -LiteralPath (Join-Path $GameDir "Caddyfile") -Value $cf -Encoding UTF8
  Write-Host "Email Let's Encrypt : $Email"
} else {
  Write-Warning "Pense à mettre ton email dans le Caddyfile (bloc global 'email ...')."
}

Write-Step "3/5 - Pare-feu Windows (80 + 443 entrants)"
try {
  foreach ($p in @(80, 443)) {
    $name = "Hyperion Orbit HTTPS ($p)"
    if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
      Write-Host "Règle ajoutée : $name"
    } else { Write-Host "Règle déjà là : $name" }
  }
} catch { Write-Warning "Pare-feu : $_ (lance le script en admin pour cette étape)." }

Write-Step "4/5 - Serveur de jeu (port $GamePort)"
$probe = Test-NetConnection -ComputerName "127.0.0.1" -Port $GamePort -WarningAction SilentlyContinue
if ($probe.TcpTestSucceeded) {
  Write-Host "Quelque chose écoute déjà sur 127.0.0.1:$GamePort (probablement le jeu). OK."
} else {
  Write-Host "Démarrage du serveur multi en arrière-plan..."
  Start-Process -FilePath "node" -ArgumentList "SCRIPTS/MULTI_SERVER.js", "--port=$GamePort" -WorkingDirectory $GameDir
  Start-Sleep -Seconds 3
}

Write-Step "5/5 - Caddy (frontal HTTPS)"
Write-Host "Caddyfile : $(Join-Path $GameDir 'Caddyfile')"
Write-Host "URL finale : https://$Domain  (le :8080 disparaît)"
Write-Host ""
Write-Host "Rappel box : redirige 80/TCP + 443/TCP vers ce PC, et FERME le 8080 exposé." -ForegroundColor Yellow
& caddy run --config (Join-Path $GameDir "Caddyfile") --adapter caddyfile
