import json
import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

HACKATHON_DIR = Path(r"C:\hackathon")
BACKEND_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BACKEND_DIR.parent / "output" / "lessons"
PAUSE_SECONDS = 0.6      # silence after every scene
THINK_SECONDS = 3.0      # quiz: time to think before the answer is spoken

# English + Hindi: Kokoro (fast). Other Indian languages: Indic Parler-TTS (slower).
# (language, voice) -> (Kokoro voice, Kokoro language). The h* voices give Indian-accented English.
KOKORO_VOICES = {
    ("en", "female"): ("hf_alpha", "en-us"),
    ("en", "male"): ("hm_omega", "en-us"),
    ("hi", "female"): ("hf_alpha", "hi"),
    ("hi", "male"): ("hm_omega", "hi"),
}
PARLER_LANGS = {"kn", "ml", "ta", "te"}
PARLER_PY = HACKATHON_DIR / "venv-parler" / "Scripts" / "python.exe"
PARLER_WORKER = BACKEND_DIR / "workers" / "parler_worker.py"

_kokoro = None


def worker_env():
    env = os.environ.copy()
    env["HF_HUB_OFFLINE"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env.pop("HF_TOKEN", None)
    return env


def get_kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(str(HACKATHON_DIR / "kokoro-v1.0.onnx"),
                         str(HACKATHON_DIR / "voices-v1.0.bin"))
    return _kokoro


def segments_for(lesson: dict):
    """Every piece of speech in the lesson: one per scene, plus the answer for a quiz."""
    segs = []
    for i, scene in enumerate(lesson["scenes"]):
        segs.append((f"s{i}", scene["narration"]))
        if scene.get("type") == "quiz" and scene.get("answer_narration"):
            segs.append((f"s{i}_a", scene["answer_narration"]))
    return segs


def kokoro_clips(segs, language, voice, speed, clip_dir, progress):
    kv, lang = KOKORO_VOICES.get((language, voice)) or KOKORO_VOICES[(language, "female")]
    kokoro = get_kokoro()
    for k, (name, text) in enumerate(segs):
        progress(k, len(segs))
        samples, sr = kokoro.create(text, voice=kv, speed=float(speed), lang=lang)
        sf.write(clip_dir / f"{name}.wav", samples.astype(np.float32), sr)


def parler_clips(segs, language, voice, speed, clip_dir, progress):
    req = clip_dir.parent / "parler_request.json"
    req.write_text(json.dumps({
        "segments": [{"name": n, "text": t} for n, t in segs],
        "lang": language, "voice": voice, "speed": speed, "out_dir": str(clip_dir),
    }, ensure_ascii=False), encoding="utf-8")

    proc = subprocess.Popen([str(PARLER_PY), str(PARLER_WORKER), str(req)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace", env=worker_env())
    tail = []
    for line in proc.stdout:
        line = line.strip()
        tail = (tail + [line])[-15:]
        if line.startswith("PROGRESS"):
            _, i, n = line.split()
            progress(int(i), int(n))
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("Indian-language voice failed: " + " | ".join(tail[-5:]))


def synthesize_lesson(lesson: dict, lesson_id: str, progress=None, only=None,
                      voice: str = "female", speed: float = 1.0) -> dict:
    """Make the voice-over and the timing. `only` = re-voice just that scene (edit mode)."""
    progress = progress or (lambda i, n: None)
    out_dir = OUTPUT_DIR / lesson_id
    clip_dir = out_dir / "clips"
    clip_dir.mkdir(parents=True, exist_ok=True)

    language = lesson["language"]
    segs = segments_for(lesson)
    if only is None:
        todo = segs
    else:   # the edited scene, plus any clip that is missing for some reason
        todo = [(n, t) for n, t in segs
                if n in (f"s{only}", f"s{only}_a") or not (clip_dir / f"{n}.wav").exists()]

    if todo:
        if language in PARLER_LANGS:
            parler_clips(todo, language, voice, speed, clip_dir, progress)
        else:
            kokoro_clips(todo, language, voice, speed, clip_dir, progress)

    clips = {}
    for name, _ in segs:
        samples, sr = sf.read(clip_dir / f"{name}.wav", dtype="float32")
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        clips[name] = (samples, sr)
    sample_rate = clips[segs[0][0]][1]
    silence = lambda sec: np.zeros(int(sec * sample_rate), dtype=np.float32)

    # The key rule: each scene lasts as long as its audio, plus a short pause.
    pieces, scenes_timing, t = [], [], 0.0
    for i, scene in enumerate(lesson["scenes"]):
        main, _ = clips[f"s{i}"]
        pieces.append(main)
        spoken = len(main) / sample_rate
        entry = {"index": i, "start": round(t, 3)}
        if f"s{i}_a" in clips:              # quiz: question, thinking pause, answer
            answer, _ = clips[f"s{i}_a"]
            pieces += [silence(THINK_SECONDS), answer]
            entry["think"] = THINK_SECONDS
            entry["reveal_at"] = round(spoken + THINK_SECONDS, 3)
            spoken += THINK_SECONDS + len(answer) / sample_rate
        pieces.append(silence(PAUSE_SECONDS))
        entry["audio_duration"] = round(spoken, 3)
        entry["duration"] = round(spoken + PAUSE_SECONDS, 3)
        scenes_timing.append(entry)
        t += spoken + PAUSE_SECONDS

    sf.write(out_dir / "narration.wav", np.concatenate(pieces), sample_rate)
    timing = {"total": round(t, 3), "scenes": scenes_timing}
    (out_dir / "timing.json").write_text(json.dumps(timing, indent=2), encoding="utf-8")
    (out_dir / "lesson.json").write_text(json.dumps(lesson, indent=2, ensure_ascii=False),
                                         encoding="utf-8")
    return timing


if __name__ == "__main__":
    sample = BACKEND_DIR / "sample_lessons" / "python_loop.json"
    lesson = json.loads(sample.read_text(encoding="utf-8"))
    print(json.dumps(synthesize_lesson(lesson, "sample-en"), indent=2))
