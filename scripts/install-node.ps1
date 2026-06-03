# Downloads and silently installs the current Node.js LTS (x64) if winget is unavailable.
$ErrorActionPreference = 'Stop'

function Write-Log($msg) {
    Write-Host $msg
}

try {
    Write-Log "Fetching Node.js LTS version from nodejs.org..."
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $lts = @($index | Where-Object { $_.lts -ne $false })[0]
    if (-not $lts) { throw 'Could not determine LTS version' }

    $ver = $lts.version.TrimStart('v')
    $msiName = "node-v$ver-x64.msi"
    $msiUrl = "https://nodejs.org/dist/v$ver/$msiName"
    $msiPath = Join-Path $env:TEMP $msiName

    Write-Log "Downloading $msiUrl"
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing

    Write-Log "Installing (silent). This may take a minute..."
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @(
        '/i', "`"$msiPath`"", '/qn', 'ADDLOCAL=ALL'
    ) -Wait -PassThru

    if ($proc.ExitCode -ne 0) {
        throw "msiexec exited with code $($proc.ExitCode). Try running Install wow_metrics.bat as Administrator."
    }

    $nodeDir = Join-Path ${env:ProgramFiles} 'nodejs'
    if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
        throw "Install finished but node.exe not found in $nodeDir"
    }

    Write-Log "Node.js $ver installed to $nodeDir"
    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
