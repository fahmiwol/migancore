$p = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' })
foreach ($x in $p) { "hentikan pid $($x.ProcessId) $($x.Name)"; Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
"sisa proses latensi: " + @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' }).Count
"run jawab masih hidup: " + @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*gerbang-s1*jawab.mjs*' }).Count
$h = Join-Path $env:USERPROFILE '.cache\huggingface\hub\models--convaiinnovations--laya'
$uk = (Get-ChildItem $h -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
"cache bawaan (unduhan keliru) ukuran: $uk B"
$b = '.-pelari\hf-cache\hub\models--convaiinnovations--laya'
if (Test-Path "$b\refs\main") { "cache sah refs/main = " + (Get-Content "$b\refs\main") }
Get-ChildItem "$b\snapshots" -Directory -ErrorAction SilentlyContinue | ForEach-Object { "cache sah snapshot " + $_.Name }
