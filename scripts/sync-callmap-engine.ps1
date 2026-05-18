# sync-callmap-engine.ps1
#
# Pulls the latest callmap engine sources + WASM grammars into the
# taskpulse client. Re-run this whenever callmap's core gets a
# meaningful update.
#
# Sources (READ-ONLY for taskpulse):
#   callmap\packages\core\src\*.ts             → client/src/lib/callmap-engine/
#   callmap\packages\desktop\public\*.wasm     → client/public/grammars/
#
# This script:
#   1. Verifies the source directories exist
#   2. Copies each engine file (renames github.ts → engine-github.ts to
#      avoid collision with server/src/lib/github.ts)
#   3. Mirrors the WASM grammars
#   4. Re-emits a SYNC_MANIFEST.md at the destination listing what came from
#      what, with mtimes — gives the next person a diff to look at
#
# Run from anywhere; uses absolute paths.

$ErrorActionPreference = 'Stop'

$CallmapRoot = 'C:\Users\eugin\projects\callmap'
$TaskpulseRoot = 'C:\Users\eugin\projects\taskpulse'

$EngineSrc = Join-Path $CallmapRoot 'packages\core\src'
$EngineDst = Join-Path $TaskpulseRoot 'client\src\lib\callmap-engine'
$WasmSrc = Join-Path $CallmapRoot 'packages\desktop\public'
$WasmDst = Join-Path $TaskpulseRoot 'client\public\grammars'

if (-not (Test-Path $EngineSrc)) { throw "Missing source: $EngineSrc" }
if (-not (Test-Path $WasmSrc)) { throw "Missing source: $WasmSrc" }

New-Item -ItemType Directory -Force -Path $EngineDst | Out-Null
New-Item -ItemType Directory -Force -Path $WasmDst | Out-Null

# Engine file mapping. Most are 1:1 but github.ts gets renamed to avoid
# colliding with the server-side github client.
$EngineMap = [ordered]@{
  'parser.ts'             = 'parser.ts'
  'callgraphBuilder.ts'   = 'callgraphBuilder.ts'
  'diffAnalyzer.ts'       = 'diffAnalyzer.ts'
  'github.ts'             = 'engine-github.ts'
  'graphLayout.ts'        = 'graphLayout.ts'
  'language.ts'           = 'language.ts'
  'types.ts'              = 'types.ts'
  'parseWorker.ts'        = 'parseWorker.ts'
  'parseWorkerClient.ts'  = 'parseWorkerClient.ts'
}

$Manifest = @()
foreach ($entry in $EngineMap.GetEnumerator()) {
  $srcPath = Join-Path $EngineSrc $entry.Key
  $dstPath = Join-Path $EngineDst $entry.Value
  if (-not (Test-Path $srcPath)) {
    Write-Warning "Skipping missing source: $($entry.Key)"
    continue
  }
  Copy-Item -Path $srcPath -Destination $dstPath -Force
  $info = Get-Item $srcPath
  $Manifest += [pscustomobject]@{
    From = $entry.Key
    To   = $entry.Value
    Size = $info.Length
    Mtime = $info.LastWriteTime.ToString('o')
  }
  Write-Host "  engine  $($entry.Key) -> $($entry.Value)"
}

# WASM grammars — mirror as-is.
$WasmFiles = Get-ChildItem -Path $WasmSrc -Filter '*.wasm'
foreach ($wasm in $WasmFiles) {
  $dstPath = Join-Path $WasmDst $wasm.Name
  Copy-Item -Path $wasm.FullName -Destination $dstPath -Force
  $Manifest += [pscustomobject]@{
    From = "desktop\public\$($wasm.Name)"
    To   = "client\public\grammars\$($wasm.Name)"
    Size = $wasm.Length
    Mtime = $wasm.LastWriteTime.ToString('o')
  }
  Write-Host "  wasm    $($wasm.Name) ($([math]::Round($wasm.Length/1KB, 1)) KB)"
}

# Manifest
$manifestPath = Join-Path $EngineDst 'SYNC_MANIFEST.md'
$lines = @(
  '# callmap-engine sync manifest',
  '',
  "Last synced: $((Get-Date).ToString('u'))",
  "From: $CallmapRoot",
  '',
  '| From | To | Size | Mtime |',
  '|------|----|------|-------|'
)
foreach ($row in $Manifest) {
  $lines += "| ``$($row.From)`` | ``$($row.To)`` | $($row.Size) | $($row.Mtime) |"
}
$lines += ''
$lines += 'Run `scripts/sync-callmap-engine.ps1` to refresh.'
$lines -join "`n" | Out-File -FilePath $manifestPath -Encoding utf8 -Force

Write-Host ''
Write-Host "Done. Manifest: $manifestPath" -ForegroundColor Green
