import copy
import json
import re
import subprocess
from pathlib import Path

from tts import HACKATHON_DIR, worker_env

INDIC_PY = HACKATHON_DIR / "venv-indic" / "Scripts" / "python.exe"
WORKER = Path(__file__).resolve().parent / "workers" / "translate_worker.py"

LANG_CODES = {"hi": "hin_Deva", "kn": "kan_Knda", "ml": "mal_Mlym",
              "ta": "tam_Taml", "te": "tel_Telu"}

# Set to False if a voice reads the English terms badly; translation then works as before.
PROTECT_TERMS = True

# diagram labels / options that look like code (i = 0, print(), <h1>, x_1 ...) stay in English
CODE_LIKE = re.compile(r"[=(){}\[\]<>_/\\*+;\"'`#]|\d")

# words students usually say in English, whatever language they speak
# (everyday words like "list" or "if" are only kept when they appear in the lesson's code)
GLOSSARY = {
    "loop", "loops", "function", "functions", "variable", "variables", "array", "arrays",
    "integer", "boolean", "python", "java", "javascript", "html", "css", "sql", "api",
    "server", "browser", "database", "algorithm", "compiler", "internet", "website", "app",
    "email", "url", "wifi", "bluetooth", "cpu", "gpu", "ram", "rom", "dna", "rna", "upi",
    "npci", "atm", "otp", "git", "github", "linux", "android", "pixel", "router",
}
# common English words that should still be translated, even if they appear in code
STOP = {"for", "and", "the", "not", "in", "is", "or", "as", "def", "return", "true", "false",
        "none", "break", "then", "this", "that", "all", "any", "one", "two", "new", "with",
        "from", "import", "to", "of", "a", "an", "it", "on", "at", "by", "be", "do"}
# ACRONYMS (UPI, CPU), words with digits (H2O, mp4), camelCase (getName)
SHAPE = re.compile(r"\b([A-Z]{2,6}s?|[A-Za-z]+\d+\w*|[a-z]+[A-Z]\w*)\b")
WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


# words drawn on shape scenes; the renderer uses these English names unless translated ones exist
SHAPE_NAMES = {"circle": "Circle", "square": "Square", "rectangle": "Rectangle",
               "triangle": "Triangle", "polygon": "Polygon"}
PART_LABELS = {
    "circle": {"center": "Centre", "radius": "Radius", "diameter": "Diameter",
               "circumference": "Circumference", "area": "Area"},
    "square": {"sides": "4 equal sides", "corners": "4 right angles", "diagonal": "Diagonal",
               "perimeter": "Perimeter", "area": "Area"},
    "rectangle": {"length": "Length", "width": "Width", "corners": "4 right angles",
                  "diagonal": "Diagonal", "perimeter": "Perimeter", "area": "Area"},
    "triangle": {"sides": "3 sides", "angles": "3 angles", "base": "Base", "height": "Height",
                 "area": "Area"},
    "polygon": {"sides": "sides", "corners": "corners", "perimeter": "Perimeter"},
}


PART_DEFS = {
    "circle": {
        "center": "the middle point of the circle",
        "radius": "a line from the centre to the edge",
        "diameter": "a line from edge to edge through the centre",
        "circumference": "the distance all the way around",
        "area": "the space inside the circle"
    },
    "square": {
        "sides": "all four sides are the same length",
        "corners": "square corners, like the corner of a book",
        "diagonal": "a line from one corner to the opposite corner",
        "perimeter": "the distance around the edge",
        "area": "the space inside the square"
    },
    "rectangle": {
        "length": "the longer side",
        "width": "the shorter side",
        "corners": "square corners, like the corner of a book",
        "diagonal": "a line from one corner to the opposite corner",
        "perimeter": "the distance around the edge",
        "area": "the space inside the rectangle"
    },
    "triangle": {
        "sides": "three straight sides",
        "angles": "the three angles always add up to 180°",
        "base": "the side it sits on",
        "height": "straight up from the base to the top corner",
        "area": "the space inside the triangle"
    },
    "polygon": {
        "sides": "straight edges",
        "corners": "where two sides meet",
        "perimeter": "the distance around the edge"
    }
}


def code_words(lesson: dict) -> set:
    words = set()
    for scene in lesson["scenes"]:
        for w in WORD.findall(scene.get("code") or ""):
            if len(w) >= 3 and w.lower() not in STOP:
                words.add(w)
    return words


def terms_in(text: str, from_code: set) -> list:
    found = {m.group(1) for m in SHAPE.finditer(text)}
    for w in WORD.findall(text):
        low = w.lower()
        if low in STOP:
            continue
        if low in GLOSSARY or w in from_code:
            found.add(w)
    return sorted(found)


def translate_lesson(lesson: dict, language: str, work_dir: Path) -> dict:
    if language == "en":
        return lesson
    lesson = copy.deepcopy(lesson)
    from_code = code_words(lesson)
    texts, setters = [], []

    def add(text, setter):
        if text and str(text).strip():
            texts.append(text)
            setters.append(setter)

    add(lesson["title"], lambda v: lesson.__setitem__("title", v))
    for scene in lesson["scenes"]:
        # keep the English lines for dual captions
        scene["narration_en"] = scene["narration"]
        if scene.get("answer_narration"):
            scene["answer_narration_en"] = scene["answer_narration"]
        for key in ("heading", "narration", "answer_narration"):
            if scene.get(key):
                add(scene[key], lambda v, s=scene, k=key: s.__setitem__(k, v))
        if scene.get("center") and not CODE_LIKE.search(scene["center"]):
            add(scene["center"], lambda v, s=scene: s.__setitem__("center", v))
        if scene.get("type") == "shape" and scene.get("shape") in PART_LABELS:
            names = dict(PART_LABELS[scene["shape"]], _shape=SHAPE_NAMES[scene["shape"]])
            names.update({f"_def_{k}": v for k, v in PART_DEFS.get(scene["shape"], {}).items()})
            scene["labels"] = {}
            for key, english in names.items():
                scene["labels"][key] = english
                add(english, lambda v, s=scene, k=key: s["labels"].__setitem__(k, v))
        for term in scene.get("terms") or []:          # equation: translate meanings, never symbols
            if term.get("meaning"):
                add(term["meaning"], lambda v, t=term: t.__setitem__("meaning", v))
        for list_key in ("items", "details", "options"):
            for j, value in enumerate(scene.get(list_key) or []):
                if value and not CODE_LIKE.search(value):
                    add(value, lambda v, s=scene, k=list_key, j=j: s[k].__setitem__(j, v))
        # scene["code"] and scene["icons"] are never translated

    protect = [terms_in(t, from_code) for t in texts] if PROTECT_TERMS else None

    work_dir.mkdir(parents=True, exist_ok=True)
    req = work_dir / "translate_request.json"
    out = work_dir / "translate_result.json"
    req.write_text(json.dumps({"texts": texts, "tgt_lang": LANG_CODES[language],
                               "protect": protect}, ensure_ascii=False), encoding="utf-8")

    result = subprocess.run([str(INDIC_PY), str(WORKER), str(req), str(out)],
                            capture_output=True, text=True, encoding="utf-8",
                            errors="replace", env=worker_env(), timeout=900)
    if result.returncode != 0:
        raise RuntimeError("Translation failed: " + result.stderr[-400:])

    translated = json.loads(out.read_text(encoding="utf-8"))["texts"]
    for setter, value in zip(setters, translated):
        setter(value)
    lesson["language"] = language
    return lesson
