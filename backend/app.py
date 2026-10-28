import socket
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from tts import OUTPUT_DIR
from pipeline import ID_RE, JOBS, list_lessons, start_edit, start_job, start_revoice
import notes as notes_store

app = FastAPI(title="Blu Visual Teacher")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=OUTPUT_DIR), name="files")

MAX_TOPIC = 1000
Language = Literal["en", "hi", "kn", "ml", "ta", "te"]
Voice = Literal["female", "male", "fast"]   # fast = quick voice for kn/ml/ta/te
SPEEDS = (0.85, 1.0, 1.15)


def _speed(value: float) -> float:
    return min(SPEEDS, key=lambda s: abs(s - value))     # snap to slow / normal / fast


def _check_id(lesson_id: str):
    if not ID_RE.match(lesson_id) or not (OUTPUT_DIR / lesson_id).is_dir():
        raise HTTPException(404, "Lesson not found.")


class GenerateRequest(BaseModel):
    topic: str
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    language: Language = "en"
    length: Literal["short", "medium", "long"] = "medium"
    voice: Voice = "female"
    speed: float = 1.0
    quiz: bool = True
    notes_id: Optional[str] = None      # explain the topic from the learner's uploaded PDF


class RevoiceRequest(BaseModel):
    lesson_id: str
    language: Language
    voice: Optional[Voice] = None
    speed: Optional[float] = None


class SceneEdit(BaseModel):
    heading: Optional[str] = None
    narration: Optional[str] = None
    answer_narration: Optional[str] = None
    center: Optional[str] = None
    items: Optional[List[str]] = None
    details: Optional[List[str]] = None
    options: Optional[List[str]] = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/generate")
def generate(req: GenerateRequest):
    topic = " ".join(req.topic.split())          # tidy spaces and new lines
    if len(topic) < 3:
        raise HTTPException(400, "Please type a topic (at least 3 characters).")
    if len(topic) > MAX_TOPIC:
        raise HTTPException(400, f"That question is too long. Please keep it under {MAX_TOPIC} characters.")
    try:
        return start_job(topic, req.level, req.language, req.length,
                         req.voice, _speed(req.speed), req.quiz, req.notes_id or None)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/notes")
async def upload_notes(request: Request, name: str = "notes.pdf"):
    """The PDF arrives as the raw request body (no extra upload library needed)."""
    data = await request.body()
    try:
        return notes_store.save_pdf(data, name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/notes/{notes_id}")
def get_notes(notes_id: str):
    record = notes_store.load(notes_id)
    if not record:
        raise HTTPException(404, "Notes not found.")
    return notes_store.public(record)


@app.post("/api/revoice")
def revoice(req: RevoiceRequest):
    _check_id(req.lesson_id)
    try:
        return start_revoice(req.lesson_id, req.language, req.voice,
                             None if req.speed is None else _speed(req.speed))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/lessons/{lesson_id}/scenes/{index}")
def edit_scene(lesson_id: str, index: int, edit: SceneEdit):
    _check_id(lesson_id)
    try:
        return start_edit(lesson_id, index, edit.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/lessons")
def lessons():
    return list_lessons()


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "job not found")
    return JOBS[job_id]


def _lan_ips():
    """This laptop's addresses on the local network (works offline, e.g. on a phone hotspot)."""
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.254.254.254", 1))          # no packet is sent; this just picks a route
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    good = [ip for ip in ips if not ip.startswith(("127.", "169.254.", "0."))]
    # usual home / hotspot ranges first
    return sorted(good, key=lambda ip: (not ip.startswith(("192.168.", "10.", "172.")), ip))


@app.get("/api/share/{lesson_id}")
def share(lesson_id: str, port: int = 5173):
    _check_id(lesson_id)
    urls = [f"http://{ip}:{port}/?lesson={lesson_id}" for ip in _lan_ips()]
    svg = None
    if urls:
        try:
            import qrcode
            import qrcode.image.svg
            img = qrcode.make(urls[0], image_factory=qrcode.image.svg.SvgPathImage, box_size=12)
            raw = img.to_string()
            svg = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        except ImportError:
            svg = None
    return {"urls": urls, "svg": svg}
