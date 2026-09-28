$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$g = "$d\repo-s1\eval\gerbang-s1"
$log = if (Test-Path "$d\log-s1-jawab.txt") { Get-Content "$d\log-s1-jawab.txt" -Encoding UTF8 } else { @() }
$hitung = { param($f) if (Test-Path $f) { (Get-Content $f | Measure-Object -Line).Lines } else { 0 } }
$nL = & $hitung "$g\jawaban-latih-v1.jsonl"
$nU = & $hitung "$g\jawaban-uji2-v1.jsonl"
$hidup = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*gerbang-s1*jawab.mjs*' }).Count
$latihSelesai = [bool]($log | Where-Object { $_ -match '^LATIH-SELESAI kode' })
$ekor = ($log | Select-Object -Last 2) -join ' | '
if ($log | Where-Object { $_ -match '^SELESAI kode' }) { "SELESAI latih $nL · uji2 $nU · $ekor" }
elseif ($hidup -gt 0) { "HIDUP latih $nL$(if ($latihSelesai) { ' (LATIH-SELESAI)' }) · uji2 $nU" }
else { "MATI latih $nL · uji2 $nU · $ekor" }
