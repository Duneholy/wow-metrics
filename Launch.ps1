Add-Type -AssemblyName PresentationFramework

$cwd = $PSScriptRoot
if (-not $cwd) { $cwd = (Get-Location).Path }

$bgPath = Join-Path $cwd "loading-bg.png"

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="wow_metrics" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        WindowStartupLocation="CenterScreen" Width="340" Height="170" ShowInTaskbar="True">
    <Border BorderBrush="#3c321d" BorderThickness="2" CornerRadius="10">
        <Border.Background>
            <ImageBrush ImageSource="$bgPath" Stretch="UniformToFill" />
        </Border.Background>
        <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center">
            <TextBlock Text="wow_metrics" Foreground="#d1b46b" FontSize="26" FontWeight="Bold" HorizontalAlignment="Center" Margin="0,0,0,8">
                <TextBlock.Effect>
                    <DropShadowEffect Color="Black" BlurRadius="4" ShadowDepth="2" Opacity="0.8" />
                </TextBlock.Effect>
            </TextBlock>
            <TextBlock Text="Starting servers... Please wait" Foreground="#f8f4e4" FontSize="14" HorizontalAlignment="Center" Margin="0,0,0,15">
                <TextBlock.Effect>
                    <DropShadowEffect Color="Black" BlurRadius="3" ShadowDepth="1" Opacity="0.8" />
                </TextBlock.Effect>
            </TextBlock>
            <Border BorderBrush="#3c321d" BorderThickness="1" CornerRadius="4">
                <ProgressBar IsIndeterminate="True" Width="260" Height="8" Foreground="#0070dd" Background="#111111" BorderThickness="0" />
            </Border>
            <TextBlock Text="1.2 © Yury Mikhno" Foreground="#8a9096" FontSize="11" HorizontalAlignment="Center" Margin="0,15,0,0">
                <TextBlock.Effect>
                    <DropShadowEffect Color="Black" BlurRadius="2" ShadowDepth="1" Opacity="0.8" />
                </TextBlock.Effect>
            </TextBlock>
        </StackPanel>
    </Border>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader([xml]$xaml))
$window = [System.Windows.Markup.XamlReader]::Load($reader)


$backendDir = Join-Path $cwd "backend"
$frontendDir = Join-Path $cwd "frontend"

if (-not (Test-Path $backendDir)) {
    [System.Windows.MessageBox]::Show("ERROR: backend folder not found!`n`nDid you run this directly from inside the .rar archive?`nYou MUST extract the archive to a folder before running.", "wow_metrics - Error", 0, 16)
    Exit
}

# Kill leftover node processes to free ports
cmd.exe /c "taskkill /F /IM node.exe /T 2>nul"
Start-Sleep -Seconds 2

# Start servers using absolute paths as working directories and log output
Start-Process "cmd.exe" -ArgumentList "/c npm run dev > backend_log.txt 2>&1" -WindowStyle Hidden -WorkingDirectory $backendDir
Start-Process "cmd.exe" -ArgumentList "/c npm run dev > frontend_log.txt 2>&1" -WindowStyle Hidden -WorkingDirectory $frontendDir

$script:ticks = 0

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
    $script:ticks++
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 5173)
        if ($tcp.Connected) {
            $tcp.Close()
            Start-Process "http://127.0.0.1:5173"
            $window.Close()
            return
        }
    } catch {}

    try {
        $tcp6 = New-Object System.Net.Sockets.TcpClient("[::1]", 5173)
        if ($tcp6.Connected) {
            $tcp6.Close()
            Start-Process "http://localhost:5173"
            $window.Close()
            return
        }
    } catch {}

    if ($script:ticks -gt 60) {
        $window.Close()
    }
})
$timer.Start()

$window.ShowDialog() | Out-Null
