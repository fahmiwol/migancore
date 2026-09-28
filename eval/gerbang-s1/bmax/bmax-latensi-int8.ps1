$ProgressPreference = 'SilentlyContinue'
$d = '.-pelari'
$py = "$d\venv-s1\Scripts\python.exe"
if (Test-Path "$d\latensi-s1-tinggi-int8.json") { 'int8 sudah ada'; exit 1 }
$bat = "@echo off`r`nset HF_HOME=$d\hf-cache`r`nset HF_HUB_OFFLINE=1`r`nset TRANSFORMERS_OFFLINE=1`r`nset USE_TF=0`r`n" +
  "`"$py`" `"$d\latensi_s1.py`" --masukan `"$d\pasangan-latensi.jsonl`" --keluar `"$d\latensi-s1-tinggi-int8.json`" --n 100 --max-len 256,512,1024 --int8 --catatan `"prioritas TINGGI, int8 dinamis FFN, Ollama jalan (normal)`" > `"$d\log-latensi-int8.txt`" 2>&1`r`n" +
  "echo INT8-SELESAI >> `"$d\log-latensi-int8.txt`""
Set-Content -Path "$d\jalankan-latensi-int8.cmd" -Value $bat -Encoding ASCII
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c `"$d\jalankan-latensi-int8.cmd`""; CurrentDirectory = $d }
"mulai pid=$($r.ProcessId)"
for ($i = 0; $i -lt 30; $i++) {
  $p = @(Get-Process python -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like '*latensi_s1*' })
  if ($p.Count) { $p | ForEach-Object { $_.PriorityClass = 'High'; "prioritas TINGGI: pid $($_.Id)" }; break }
  Start-Sleep -Seconds 1
}
