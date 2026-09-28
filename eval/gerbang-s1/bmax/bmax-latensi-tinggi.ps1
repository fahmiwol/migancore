$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$py = "$d\venv-s1\Scripts\python.exe"
# 1) hentikan run batas-atas (rebutan CPU) — hasil 512-nya sudah tercatat di log
@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*latensi_s1*' }) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
if (Test-Path "$d\log-latensi-s1.txt") { Copy-Item "$d\log-latensi-s1.txt" "$d\log-latensi-s1-rebutan.txt" -Force }
# 2) dua run berurutan, prioritas TINGGI (Ollama tetap jalan dengan prioritas normal): fp32 lalu int8
$env_ = "set HF_HOME=$d\hf-cache`r`nset HF_HUB_OFFLINE=1`r`nset TRANSFORMERS_OFFLINE=1`r`nset USE_TF=0"
$bat = "@echo off`r`n$env_`r`n" +
  "`"$py`" `"$d\latensi_s1.py`" --masukan `"$d\pasangan-latensi.jsonl`" --keluar `"$d\latensi-s1-tinggi-fp32.json`" --n 100 --max-len 256,512,1024 --catatan `"prioritas TINGGI, Ollama jalan (normal) - mendekati menganggur`" > `"$d\log-latensi-tinggi.txt`" 2>&1`r`n" +
  "`"$py`" `"$d\latensi_s1.py`" --masukan `"$d\pasangan-latensi.jsonl`" --keluar `"$d\latensi-s1-tinggi-int8.json`" --n 100 --max-len 256,512,1024 --int8 --catatan `"prioritas TINGGI, int8 dinamis`" >> `"$d\log-latensi-tinggi.txt`" 2>&1`r`n" +
  "echo LATENSI-TINGGI-SELESAI >> `"$d\log-latensi-tinggi.txt`""
Set-Content -Path "$d\jalankan-latensi-tinggi.cmd" -Value $bat -Encoding ASCII
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c `"$d\jalankan-latensi-tinggi.cmd`""; CurrentDirectory = $d }
"mulai pid=$($r.ProcessId)"
# 3) naikkan prioritas proses python latensi begitu muncul (sampai 30 dtk), juga untuk run kedua lewat pengawas di bawah
for ($i = 0; $i -lt 30; $i++) {
  $p = @(Get-Process python -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like '*latensi_s1*' })
  if ($p.Count) { $p | ForEach-Object { $_.PriorityClass = 'High'; "prioritas TINGGI: pid $($_.Id)" }; break }
  Start-Sleep -Seconds 1
}
