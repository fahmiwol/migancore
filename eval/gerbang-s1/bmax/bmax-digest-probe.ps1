$ProgressPreference = 'SilentlyContinue'
# GERBANG-S1 (tinjauan putaran 4, SF8): BACA-SAJA — digest model dasar dan model probe G dari Ollama lokal Bmax (/api/tags).
# Tidak memuat model, tidak menjalankan generasi. Dijalankan SESUDAH run jawaban T2 selesai (Bmax tidak diganggu), dan
# hasilnya dipatok sebagai PROBE_DIGEST_PIN di eval/gerbang-s1/inti-s1.mjs SEBELUM patok-s1 --kunci.
#   node flywheel/bmax.mjs --berkas eval/gerbang-s1/bmax/bmax-digest-probe.ps1
$lain = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'jawab\.mjs|pg-berpasangan|latih_s1|skor_s1|latensi_s1|latensi-probe|ukur-jujur2' })
if ($lain.Count -gt 0) { 'ada proses pengukuran berjalan - berhenti (tidak mengganggu Bmax)'; exit 1 }
try { $t = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 20 } catch { "tags gagal: $($_.Exception.Message)"; exit 1 }
foreach ($nama in @('qwen3:4b-instruct-2507-q4_K_M', 'migancore:0.4-qwen3')) {
  $m = $t.models | Where-Object { $_.name -eq $nama }
  if ($m) { "$nama $($m.digest) $($m.modified_at)" } else { "$nama TIDAK ADA" }
}
