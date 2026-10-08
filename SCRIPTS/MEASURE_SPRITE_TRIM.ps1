# Mesure le contenu visible (pixels non transparents) de la 1re frame de
# chaque sprite et génère QUEST/SPRITE_TRIM.js.
# Sert à normaliser les vignettes sur le contenu réel, pas sur le canvas
# (ex : Streuner = 73x49 visibles sur 109x96).
# Usage : powershell -ExecutionPolicy Bypass -File SCRIPTS/MEASURE_SPRITE_TRIM.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = Get-Location }

$code = @"
using System.Drawing;
public static class TrimMeasure {
  public static string Box(string path) {
    try {
      using (var bmp = new Bitmap(path)) {
        int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
        for (int y = 0; y < bmp.Height; y += 2) {
          for (int x = 0; x < bmp.Width; x += 2) {
            if ((bmp.GetPixel(x, y).A) > 10) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return "0x0";
        return (maxX-minX+1).ToString() + "x" + (maxY-minY+1).ToString();
      }
    } catch { return "ERR"; }
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

# Dossiers + frame affichée dans les quêtes (1re frame, ou ACTIVE.png pour les portails).
$singles = @(
  "ASSETS/STANDARD_PORTAL/ACTIVE.png",
  "ASSETS/PIRATES_PORTAL/ACTIVE.png",
  "ASSETS/ALPHA_PORTAL/ACTIVE.png",
  "ASSETS/BETA_PORTAL/ACTIVE.png",
  "ASSETS/GAMMA_PORTAL/ACTIVE.png",
  "ASSETS/DELTA_PORTAL/ACTIVE.png",
  "ASSETS/EPSILON_PORTAL/ACTIVE.png",
  "ASSETS/ZETA_PORTAL/ACTIVE.png",
  "ASSETS/QUEST_BUTTON/1.png"
)
$entries = @()
foreach ($rel in $singles) {
  $full = Join-Path $root $rel
  if (!(Test-Path -LiteralPath $full)) { continue }
  $box = [TrimMeasure]::Box($full)
  if ($box -in @("ERR", "VIDE", "0x0")) { continue }
  $tmp = $rel -replace "/", "\"
  $parentDir = Split-Path -Parent $tmp
  $dir = $parentDir -replace "\\", "/"
  $wh = $box -split "x"
  $entries += "  `"$dir`": [$($wh[0]), $($wh[1])],"
}
foreach ($base in @("NPC/NPC_SPRITES", "ASSETS/COLLECTABLES", "SHIP/SHIP_SPRITES", "PET/PET_SPRITES", "DRONE/DRONE_SPRITES")) {
  $abs = Join-Path $root $base
  if (!(Test-Path -LiteralPath $abs)) { continue }
  foreach ($d in (Get-ChildItem -LiteralPath $abs -Directory | Sort-Object Name)) {
    $frame = Join-Path $d.FullName "1.png"
    if (!(Test-Path -LiteralPath $frame)) {
      $frame = Get-ChildItem -LiteralPath $d.FullName -Filter "*.png" | Sort-Object Name | Select-Object -First 1 -ExpandProperty FullName
      if (!$frame) { continue }
    }
    $box = [TrimMeasure]::Box($frame)
    if ($box -in @("ERR", "VIDE", "0x0")) { continue }
    $wh = $box -split "x"
    $key = "$base/$($d.Name)"
    $entries += "  `"$key`": [$($wh[0]), $($wh[1])],"
  }
}
$js = "// Genere par SCRIPTS/MEASURE_SPRITE_TRIM.ps1 - NE PAS EDITER A LA MAIN.`n"
$js += "// Contenu visible (l x h) de la frame affichee, pour normaliser les vignettes.`n"
$js += "export const SPRITE_TRIM = {`n" + ($entries -join "`n") + "`n};`n"
$out = Join-Path $root "QUEST/SPRITE_TRIM.js"
Set-Content -LiteralPath $out -Value $js -Encoding UTF8
Write-Output "Ecrit $out ($($entries.Count) entrees)"
