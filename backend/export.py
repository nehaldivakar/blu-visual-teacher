import json
import math
import subprocess
import sys
import time

from tts import OUTPUT_DIR

FRONTEND_URL = "http://localhost:5173"
FPS = 20


def srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(lesson: dict, timing: dict, path) -> None:
    """Captions file. Indian-language lessons also get the English line underneath."""
    cues = []
    for scene, st in zip(lesson["scenes"], timing["scenes"]):
        start = st["start"]
        if "reveal_at" in st:     # quiz: question, then the answer after the thinking pause
            q_end = start + st["reveal_at"] - st.get("think", 3.0)
            cues.append((start, q_end, scene["narration"], scene.get("narration_en")))
            cues.append((start + st["reveal_at"], start + st["audio_duration"],
                         scene.get("answer_narration", ""), scene.get("answer_narration_en")))
        else:
            cues.append((start, start + st["audio_duration"], scene["narration"],
                         scene.get("narration_en")))
    blocks = []
    for n, (a, b, text, en) in enumerate(cues, 1):
        lines = text + (f"\n{en}" if en else "")
        blocks.append(f"{n}\n{srt_time(a)} --> {srt_time(b)}\n{lines}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


def export_mp4(lesson_id: str, fps: int = FPS):
    from playwright.sync_api import sync_playwright

    lesson_dir = OUTPUT_DIR / lesson_id
    lesson = json.loads((lesson_dir / "lesson.json").read_text(encoding="utf-8"))
    timing = json.loads((lesson_dir / "timing.json").read_text(encoding="utf-8"))
    write_srt(lesson, timing, lesson_dir / "captions.srt")

    out_path = lesson_dir / "lesson.mp4"
    tmp_path = lesson_dir / "lesson.tmp.mp4"     # never leave a half-written MP4 behind
    n_frames = math.ceil(timing["total"] * fps)

    ffmpeg_cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
        "-i", str(lesson_dir / "narration.wav"),
        "-vf", "scale=1280:720",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-shortest", "-movflags", "+faststart",
        str(tmp_path),
    ]
    ffmpeg = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

    start = time.time()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto(f"{FRONTEND_URL}/?lesson={lesson_id}&export=1&v={int(start)}")

            # 1) wait until the page has loaded the lesson and can jump to any time
            page.wait_for_function(
                "window.__ready === true && typeof window.__seek === 'function'",
                timeout=60_000)

            # 2) visit every scene once so each script's font is loaded before recording
            for st in timing["scenes"]:
                page.evaluate("t => window.__seek(t)", st["start"] + 1.0)
                page.evaluate("() => document.fonts.ready.then(() => true)")
            page.wait_for_timeout(300)

            # 3) record: jump to each exact time and take a picture
            for f in range(n_frames):
                page.evaluate("t => window.__seek(t)", f / fps)
                ffmpeg.stdin.write(page.screenshot(type="jpeg", quality=90))
                if f % fps == 0:
                    print(f"\rframe {f}/{n_frames}", end="", flush=True)
            browser.close()
    finally:
        ffmpeg.stdin.close()
        ffmpeg.wait()

    if ffmpeg.returncode != 0:
        raise RuntimeError("ffmpeg failed")
    tmp_path.replace(out_path)
    print(f"\nExported {out_path} in {time.time() - start:.1f}s")
    return out_path


if __name__ == "__main__":
    export_mp4(sys.argv[1] if len(sys.argv) > 1 else "sample-en")
