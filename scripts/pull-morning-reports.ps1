# pull-morning-reports.ps1
# Copies the 4 daily cron outputs from Google Drive Desktop (G:\My Drive\...)
# into taskpulse/data/reports/<bucket>/<KL-date>-<category>.md so they render
# in the taskpulse Reports tab.
#
# Schedules: Windows Task Scheduler fires this daily at 5:30 AM KL local time.
# On-demand: run the script manually any time.
#
# Why this exists: the Claude routines run in a cloud sandbox that can't write
# to local disk and whose `date` returns UTC. This script bridges that gap by
# reading from the synced Drive folder and renaming with the correct KL date.

$ErrorActionPreference = 'Continue'
$today = (Get-Date).ToUniversalTime().AddHours(8).ToString('yyyy-MM-dd')
$reportsRoot = 'C:\Users\eugin\projects\taskpulse\data\reports'
$logFile = Join-Path $PSScriptRoot 'pull-morning-reports.log'

function Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line
  Write-Output $line
}

# (drive folder, glob, taskpulse bucket, category)
$sources = @(
  @{ Folder='G:\My Drive\ClaudeAgentOutput\Output\StockReport';     Pattern='Stock-Report-*.md';   Bucket='stocks';     Category='stock-analysis' },
  @{ Folder='G:\My Drive\ClaudeAgentOutput\Output\ResearchReport';  Pattern='Tech-Radar-*.md';     Bucket='tech-radar'; Category='tech-radar' },
  @{ Folder='G:\My Drive\ClaudeAgentOutput\Output\ResearchReport';  Pattern='Dev-Gig-Report-*.md'; Bucket='dev-gig';    Category='dev-gig' },
  @{ Folder='G:\My Drive\ClaudeAgentOutput\Output\MorningSnapshot'; Pattern='morning-*.md';        Bucket='morning';    Category='morning-snapshot' }
)

Log "=== run start (KL today=$today) ==="

foreach ($src in $sources) {
  if (-not (Test-Path $src.Folder)) {
    Log ("SKIP {0}: source folder missing (Drive sync may not be ready yet)" -f $src.Category)
    continue
  }
  # Find the most-recently-modified file matching the glob. The cron's
  # filename uses UTC date so "Stock-Report-2026-05-16.md" can actually be
  # today's KL morning run — we don't trust the filename; we trust mtime.
  $file = Get-ChildItem -Path $src.Folder -Filter $src.Pattern -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending |
          Select-Object -First 1
  if (-not $file) {
    Log ("SKIP {0}: no matching file in Drive folder" -f $src.Category)
    continue
  }
  # Sanity: ignore stale files (>30h old) — means today's cron didn't run.
  $ageHours = ((Get-Date) - $file.LastWriteTime).TotalHours
  if ($ageHours -gt 30) {
    Log ("SKIP {0}: most recent file is {1:n1}h old (cron may have failed)" -f $src.Category, $ageHours)
    continue
  }
  # Destination
  $bucketDir = Join-Path $reportsRoot $src.Bucket
  if (-not (Test-Path $bucketDir)) { New-Item -ItemType Directory -Path $bucketDir | Out-Null }
  $destFile = Join-Path $bucketDir ("{0}-{1}.md" -f $today, $src.Category)

  # If destination already exists with same content, skip (idempotent).
  if (Test-Path $destFile) {
    $srcHash  = (Get-FileHash -Algorithm SHA1 -Path $file.FullName).Hash
    $destHash = (Get-FileHash -Algorithm SHA1 -Path $destFile).Hash
    if ($srcHash -eq $destHash) {
      Log ("SKIP {0}: already up to date at {1}" -f $src.Category, $destFile)
      continue
    }
  }

  try {
    Copy-Item -Path $file.FullName -Destination $destFile -Force
    Log ("OK   {0}: {1} -> {2} ({3:n0} bytes)" -f $src.Category, $file.Name, (Split-Path -Leaf $destFile), $file.Length)
  } catch {
    Log ("FAIL {0}: {1}" -f $src.Category, $_.Exception.Message)
  }
}

Log "=== run end ==="
