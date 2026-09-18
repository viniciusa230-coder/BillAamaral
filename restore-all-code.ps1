$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$archiveDir = Join-Path $root "archives"
$parts = Get-ChildItem -LiteralPath $archiveDir -File "LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part*" | Sort-Object Name

if ($parts.Count -ne 6) {
  throw "Esperadas 6 partes do arquivo historico; encontradas $($parts.Count)."
}

$b64 = ($parts | ForEach-Object { (Get-Content -LiteralPath $_.FullName -Raw).Trim() }) -join ""
$tempArchive = Join-Path $env:TEMP "LicitaGestao_Todo_Codigo_Historico.tar.xz"
[IO.File]::WriteAllBytes($tempArchive, [Convert]::FromBase64String($b64))

$dest = Join-Path $root "_historico_extraido"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest | Out-Null

tar -xJf $tempArchive -C $dest

foreach ($name in @("versions","prototypes","legacy")) {
  $src = Join-Path $dest $name
  if (Test-Path $src) {
    $target = Join-Path $root $name
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Copy-Item $src $target -Recurse -Force
  }
}

Write-Host "Codigo historico restaurado em versions/, prototypes/ e legacy/." -ForegroundColor Green
