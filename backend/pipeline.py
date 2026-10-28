import hashlib
import json
import re
import threading
import time
import traceback
import uuid

from planner import plan_lesson
from translate import translate_lesson
from tts import OUTPUT_DIR, synthesize_lesson
from export import export_mp4
from pics import resolve
from notes import find_passages

JOBS = {}
_run_lock = threading.Lock()   # one job at a time (CPU laptop)
ID_RE = re.compile(r"^[a-z0-9-]{3,120}$")


def lesson_id_for(topic, level, language, length, voice="female", speed=1.0, quiz=True, notes_id=None):
    key = f"{topic.strip().lower()}|{level}|{language}|{length}|{voice}|{speed}|{quiz}"
    if notes_id:                       # the same question about different notes is a different lesson
        key += f"|notes:{notes_id}"
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:40] or "lesson"
    return f"{slug}-{language}-{hashlib.md5(key.encode()).hexdigest()[:8]}"


def _read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _new_job(kind, lesson_id, language):
    job = {"id": uuid.uuid4().hex[:10], "kind": kind, "lesson_id": lesson_id,
           "language": language, "status": "queued", "stage": "Waiting", "detail": "",
           "timings": {}, "fallback": False, "cached": False, "error": None}
    JOBS[job["id"]] = job
    return job


def _is_done(lesson_id):
    d = OUTPUT_DIR / lesson_id
    job = _read_json(d / "job.json", {})
    return (d / "lesson.mp4").exists() and not job.get("fallback")


def _stage(job, name, fn):
    job["stage"] = name
    job["detail"] = ""
    t0 = time.time()
    result = fn()
    job["timings"][name] = round(time.time() - t0, 1)
    return result


def _progress(job):
    def report(i, n):
        job["detail"] = f"part {min(i + 1, n)} of {n}"
    return report


def _finish(job, lesson_dir):
    _write_json(lesson_dir / "job.json", {k: job[k] for k in ("timings", "fallback")})
    meta = _read_json(lesson_dir / "meta.json", {})
    timing = _read_json(lesson_dir / "timing.json", {})
    meta.update(total=timing.get("total"), updated=time.time())
    _write_json(lesson_dir / "meta.json", meta)
    job.update(status="done", stage="Done", detail="")


def _run(job, work):
    with _run_lock:
        try:
            job["status"] = "running"
            work()
        except Exception as e:
            traceback.print_exc()
            job.update(status="error", error=str(e)[:300])


def _voice_and_translate(job, lesson_en, meta, lesson_dir):
    """Shared by generate and re-voice: translate, speak, export."""
    _write_json(lesson_dir / "lesson_en.json", lesson_en)
    language = meta["language"]
    lesson = lesson_en
    if language != "en":
        lesson = _stage(job, "Translating", lambda: translate_lesson(lesson_en, language, lesson_dir))
    lesson["language"] = language
    _stage(job, "Narration", lambda: synthesize_lesson(
        lesson, job["lesson_id"], _progress(job), voice=meta["voice"], speed=meta["speed"]))
    _stage(job, "Exporting MP4", lambda: export_mp4(job["lesson_id"]))
    _finish(job, lesson_dir)


# ---------------------------------------------------------------- new lesson
def start_job(topic, level, language, length, voice="female", speed=1.0, quiz=True, notes_id=None):
    lesson_id = lesson_id_for(topic, level, language, length, voice, speed, quiz, notes_id)
    job = _new_job("generate", lesson_id, language)
    notes = find_passages(notes_id, topic) if notes_id else None
    if notes_id and notes is None:
        raise ValueError("Those notes were not found. Please upload the PDF again.")
    if notes:
        job["notes"] = {"name": notes["name"], "pages": notes["pages"], "found": notes["found"],
                        "question": notes.get("question")}
    if _is_done(lesson_id):
        job.update(status="done", stage="Loaded from cache", cached=True)
        return job

    def work():
        lesson_dir = OUTPUT_DIR / lesson_id
        lesson_dir.mkdir(parents=True, exist_ok=True)
        meta = {"topic": topic, "level": level, "language": language, "length": length,
                "voice": voice, "speed": speed, "quiz": quiz, "created": time.time()}
        if notes:
            meta.update(notes_id=notes_id, notes=job["notes"])
        _write_json(lesson_dir / "meta.json", meta)
        planned = _stage(job, "Planning lesson", lambda: plan_lesson(topic, level, length, quiz, notes))
        job["fallback"] = planned["fallback"]
        if notes and notes["found"] and not planned["fallback"]:
            planned["lesson"]["source"] = job["notes"]       # shown under the player: "From your notes"
        _voice_and_translate(job, planned["lesson"], meta, lesson_dir)

    threading.Thread(target=_run, args=(job, work), daemon=True).start()
    return job


# ---------------------------------------------------------------- same lesson, another language
def start_revoice(source_id, language, voice=None, speed=None):
    src_dir = OUTPUT_DIR / source_id
    meta = _read_json(src_dir / "meta.json")
    lesson_en = _read_json(src_dir / "lesson_en.json")
    if lesson_en is None:            # lessons made before this feature
        lesson = _read_json(src_dir / "lesson.json")
        if lesson and lesson.get("language", "en") == "en":
            lesson_en = lesson
    if not meta or not lesson_en:
        raise ValueError("This lesson cannot be re-voiced (it was made with an older version).")

    meta = dict(meta, language=language, voice=voice or meta.get("voice", "female"),
                speed=speed if speed is not None else meta.get("speed", 1.0),
                created=time.time(), source=source_id)
    lesson_id = lesson_id_for(meta["topic"], meta["level"], language, meta["length"],
                              meta["voice"], meta["speed"], meta.get("quiz", True), meta.get("notes_id"))
    job = _new_job("revoice", lesson_id, language)
    if _is_done(lesson_id):
        job.update(status="done", stage="Loaded from cache", cached=True)
        return job

    def work():
        lesson_dir = OUTPUT_DIR / lesson_id
        lesson_dir.mkdir(parents=True, exist_ok=True)
        _write_json(lesson_dir / "meta.json", meta)
        _voice_and_translate(job, json.loads(json.dumps(lesson_en)), meta, lesson_dir)

    threading.Thread(target=_run, args=(job, work), daemon=True).start()
    return job


# ---------------------------------------------------------------- teacher edits one scene
EDITABLE = {"heading": 80, "narration": 320, "answer_narration": 320, "center": 30}
EDITABLE_LISTS = {"items": 40, "details": 80, "options": 60}


def start_edit(lesson_id, index, changes: dict):
    lesson_dir = OUTPUT_DIR / lesson_id
    lesson = _read_json(lesson_dir / "lesson.json")
    if not lesson or not (0 <= index < len(lesson["scenes"])):
        raise ValueError("Scene not found.")
    scene = lesson["scenes"][index]

    for key, limit in EDITABLE.items():
        if key in changes and key in scene:
            value = str(changes[key]).strip()[:limit]
            if key in ("narration", "answer_narration") and len(value) < 10:
                raise ValueError("Narration must be at least 10 characters.")
            if value:
                scene[key] = value
    for key, limit in EDITABLE_LISTS.items():
        if key in changes and key in scene:
            values = [str(v).strip()[:limit] for v in changes[key] if str(v).strip()]
            if key == "options" and len(values) != 3:
                raise ValueError("A quiz needs exactly 3 options.")
            if key == "items" and scene.get("type") == "chart" and len(values) != len(scene.get("numbers", [])):
                raise ValueError("A chart needs one label per number.")
            low = 1 if scene.get("type") == "picture" else 2
            if key == "items" and not (low <= len(values) <= 6):
                raise ValueError(f"This scene needs {low} to 6 items.")
            if key == "items" and lesson.get("language", "en") == "en" and "pics" in scene:
                old = dict(zip(scene.get("items", []), scene["pics"]))
                scene["pics"] = [old.get(v) or resolve(v) for v in values]
            scene[key] = values
    # an edited Indian-language line no longer matches its old English caption
    if lesson.get("language", "en") != "en":
        for key in ("narration", "answer_narration"):
            if key in changes:
                scene.pop(f"{key}_en", None)
    # keep parallel lists the same length as the items
    for key in ("details", "icons", "pics"):
        if key in scene and "items" in scene:
            scene[key] = (scene[key] + [""] * 6)[:len(scene["items"])]

    meta = _read_json(lesson_dir / "meta.json", {})
    job = _new_job("edit", lesson_id, lesson.get("language", "en"))

    def work():
        if lesson.get("language", "en") == "en":   # English edits also update the re-voice source
            _write_json(lesson_dir / "lesson_en.json", lesson)
        _stage(job, "Narration", lambda: synthesize_lesson(
            lesson, lesson_id, _progress(job), only=index,
            voice=meta.get("voice", "female"), speed=meta.get("speed", 1.0)))
        _stage(job, "Exporting MP4", lambda: export_mp4(lesson_id))
        _finish(job, lesson_dir)

    threading.Thread(target=_run, args=(job, work), daemon=True).start()
    return job


# ---------------------------------------------------------------- library
def list_lessons():
    items = []
    if not OUTPUT_DIR.exists():
        return items
    for d in OUTPUT_DIR.iterdir():
        if not d.is_dir() or not (d / "lesson.mp4").exists():
            continue
        lesson = _read_json(d / "lesson.json", {})
        meta = _read_json(d / "meta.json", {})
        timing = _read_json(d / "timing.json", {})
        if not lesson:
            continue
        items.append({
            "lesson_id": d.name,
            "title": lesson.get("title", d.name),
            "topic": meta.get("topic", lesson.get("title", "")),
            "language": lesson.get("language", meta.get("language", "en")),
            "level": meta.get("level", lesson.get("level", "")),
            "voice": meta.get("voice", ""),
            "scenes": len(lesson.get("scenes", [])),
            "total": timing.get("total"),
            "quiz": any(s.get("type") == "quiz" for s in lesson.get("scenes", [])),
            "created": meta.get("updated") or meta.get("created") or d.stat().st_mtime,
            "can_revoice": bool(meta) and ((d / "lesson_en.json").exists()
                                          or lesson.get("language", "en") == "en"),
        })
    items.sort(key=lambda x: x["created"], reverse=True)
    return items
