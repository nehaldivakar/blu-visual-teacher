"""Quick check of the fast Indian-language voices. Run with venv-parler active:
    python test_fast_voice.py
It writes test_fast_<lang>.wav files in this folder and prints how long each took."""
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
SAMPLES = {
    "kn": "ವೃತ್ತವು ಒಂದು ದುಂಡನೆಯ ಆಕಾರ.",
    "ta": "வட்டம் ஒரு வட்டமான வடிவம்.",
    "ml": "വൃത്തം ഒരു ഉരുണ്ട ആകൃതിയാണ്.",
    "te": "వృత్తం ఒక గుండ్రని ఆకారం.",
}
for lang, text in SAMPLES.items():
    req = HERE / f"test_req_{lang}.json"
    req.write_text(json.dumps({"segments": [{"name": f"test_fast_{lang}", "text": text}], "lang": lang,
                               "voice": "fast", "speed": 1.0, "out_dir": str(HERE)}, ensure_ascii=False),
                   encoding="utf-8")
    start = time.time()
    r = subprocess.run([sys.executable, str(HERE / "workers" / "parler_worker.py"), str(req)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    req.unlink()
    ok = (HERE / f"test_fast_{lang}.wav").exists() and r.returncode == 0
    print(f"{lang}: {'OK' if ok else 'FAILED'} in {time.time() - start:.1f}s")
    if not ok:
        print((r.stdout + r.stderr)[-600:])
