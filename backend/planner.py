import json
import time
from pathlib import Path
import math
import re
from typing import Dict, List, Literal, Optional

import requests
from pydantic import BaseModel, Field, ValidationError, model_validator

from pics import resolve, resolve_list

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "qwen3:4b"
SAMPLE = Path(__file__).parent / "sample_lessons" / "python_loop.json"

SCENE_COUNTS = {"short": (3, 4), "medium": (4, 5), "long": (5, 6)}
MAX_ATTEMPTS = 3
LAYOUTS = ("flow", "cycle", "hub", "compare", "layers", "timeline")
SHAPES = ("circle", "square", "rectangle", "triangle", "polygon")
# the parts of each shape that the renderer knows how to draw, in teaching order
SHAPE_PARTS = {
    "circle": ["center", "radius", "diameter", "circumference", "area"],
    "square": ["sides", "corners", "diagonal", "perimeter", "area"],
    "rectangle": ["length", "width", "corners", "diagonal", "perimeter", "area"],
    "triangle": ["sides", "angles", "base", "height", "area"],
    "polygon": ["sides", "corners", "perimeter"],
}
LEVEL_STYLE = {
    "beginner": ("Explain like you are talking to a curious young child: very simple everyday words, "
                 "short sentences, friendly comparisons (pizza, toys, a ball, water). Avoid jargon; if a "
                 "word is needed, say what it means."),
    "intermediate": ("Explain for a school student: clear, correct terms with a short meaning for each, "
                     "and simple formulas where they help."),
    "advanced": ("Explain for an advanced learner: precise scientific and technical terminology, standard "
                 "notation, units and the governing equations or formulas."),
}


class Scene(BaseModel):
    type: Literal["title_card", "diagram", "code_walkthrough", "quiz", "shape", "equation", "chart", "picture"]
    heading: str = Field(min_length=2, max_length=80)
    narration: str = Field(min_length=10, max_length=320)
    layout: Optional[Literal["flow", "cycle", "hub", "compare", "layers", "timeline"]] = None
    items: Optional[List[str]] = None
    details: Optional[List[str]] = None
    icons: Optional[List[str]] = None
    pics: Optional[List[str]] = None             # picture names from the offline pack, one per item ("" = none)
    center: Optional[str] = None
    code: Optional[str] = None
    highlight_lines: Optional[List[int]] = None
    options: Optional[List[str]] = None          # quiz only
    answer: Optional[int] = None                 # quiz only: index of the right option
    answer_narration: Optional[str] = None       # quiz only: spoken after the thinking pause
    shape: Optional[str] = None                  # shape only: circle, square, rectangle, triangle, polygon
    parts: Optional[List[str]] = None            # shape only: which parts to draw, in order
    values: Optional[Dict[str, str]] = None      # shape only: e.g. {"radius": "3 cm"}
    sides: Optional[int] = None                  # polygon only
    equation: Optional[str] = None               # equation only: "F = m × a", "2H2 + O2 -> 2H2O"
    terms: Optional[List[Dict[str, str]]] = None # equation only: [{"symbol": "F", "meaning": "force"}]
    numbers: Optional[List[float]] = None        # chart only: one number per item
    unit: Optional[str] = None                   # chart only
    kind: Optional[Literal["bar", "line", "pie"]] = None   # chart only

    @model_validator(mode="after")
    def check_fields(self):
        if self.type == "diagram":
            if not self.items or not (2 <= len(self.items) <= 6):
                raise ValueError("diagram needs 2-6 items")
            self.items = [i[:40] for i in self.items]
            self.layout = self.layout or "flow"
            for key in ("details", "icons", "pics"):
                values = getattr(self, key)
                if values is not None and len(values) != len(self.items):
                    setattr(self, key, None)
        if self.type == "code_walkthrough":
            if not self.code:
                raise ValueError("code_walkthrough needs code")
            n = len(self.code.split("\n"))
            if n > 10:
                raise ValueError("code too long")
            hl = [x for x in (self.highlight_lines or []) if 1 <= x <= n]
            self.highlight_lines = hl or [1]
        if self.type == "shape":
            if self.shape not in SHAPES or not self.parts:
                raise ValueError("shape needs a known shape and parts")
        if self.type == "equation":
            if not self.equation or not self.terms:
                raise ValueError("equation needs an equation and terms")
        if self.type == "picture":
            if not self.items or not (1 <= len(self.items) <= 9) or not self.pics or len(self.pics) != len(self.items):
                raise ValueError("picture needs 1-9 items with pictures")
            if self.details is not None and len(self.details) != len(self.items):
                self.details = None
        if self.type == "chart":
            if not self.items or not self.numbers or len(self.items) != len(self.numbers):
                raise ValueError("chart needs items and numbers")
        if self.type == "quiz":
            if not self.options or len(self.options) != 3:
                raise ValueError("quiz needs 3 options")
            if self.answer not in (0, 1, 2) or not self.answer_narration:
                raise ValueError("quiz needs an answer")
        return self


class Lesson(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    level: str
    language: str = "en"
    scenes: List[Scene] = Field(min_length=2, max_length=7)   # up to 6 + the quiz


SYSTEM_PROMPT = """You are an expert teacher who explains ideas visually, one small step per scene.
Return ONLY a JSON object, no other text. Example with 5 scenes:
{
  "title": "How a web page loads",
  "level": "beginner",
  "scenes": [
    {"type": "title_card", "heading": "How does a web page load?",
     "narration": "When you type a web address, several things happen in order. Let's follow them step by step."},
    {"type": "diagram", "heading": "Step 1: Find and ask the server",
     "narration": "The browser asks DNS for the server address, then requests the page from that server.",
     "layout": "flow", "items": ["Browser", "DNS lookup", "Server"], "details": ["You type the address", "Finds the server's IP", "Sends back the files"], "pictures": ["laptop", "book", "server"]},
    {"type": "diagram", "heading": "Step 2: What a page is made of",
     "narration": "A page has four main parts: HTML for structure, CSS for style, JavaScript for behaviour, and images.",
     "layout": "hub", "center": "Web page", "items": ["HTML", "CSS", "JavaScript", "Images"], "details": ["Structure", "Style", "Behaviour", "Pictures"], "pictures": ["brick", "paintbrush", "gear", "framed picture"]},
    {"type": "code_walkthrough", "heading": "Step 3: Read the HTML",
     "narration": "The HTML arrives as text. The browser reads each tag, top to bottom.",
     "code": "<h1>Hello</h1>\\n<p>Welcome!</p>", "highlight_lines": [1, 2]},
    {"type": "diagram", "heading": "Step 4: Static vs dynamic pages",
     "narration": "A static page is the same for everyone, while a dynamic page is built for each visitor.",
     "layout": "compare", "items": ["Static page", "Dynamic page"], "details": ["Same content for every visitor.", "Built fresh for each visitor."], "pictures": ["page", "lightning"]}
  ]
}
Rules:
- The "scenes" array MUST contain the number of scenes the user asks for. Teach ONE idea per scene.
- The first scene is always a title_card that asks or states the topic.
- Every "diagram" has a "layout". Pick the one that matches the idea:
  "flow" = steps that happen in order, A then B then C.
  "cycle" = steps that repeat in a loop (water cycle, heartbeat, seasons, life cycle). Set "center" to the cycle's name (max 3 words).
  "hub" = one main idea with 3-6 parts or types around it. Set "center" to the main idea (max 3 words).
  "compare" = ONLY when contrasting 2 or 3 different things (A vs B). "details" holds one short sentence about each.
  "layers" = stacked levels from top to bottom (layers of the earth, network layers, food pyramid).
- items are 2-6 SHORT labels (max 4 words each). "details" has one short phrase per item (max 8 words). "pictures" has one simple English noun per item that can be drawn (lion, sun, laptop, droplet, heart, rocket).
- Use different layouts across the lesson when they fit the content.
- Special scene types. Use them whenever the topic fits; the app draws them exactly:
  {"type": "shape", "heading": "Step 1: Parts of a circle", "narration": "...", "shape": "circle", "parts": ["center", "radius", "diameter", "circumference", "area"], "values": {"radius": "3 cm"}}
    shape is one of circle, square, rectangle, triangle, polygon (polygon also needs "sides": 5 to 10).
    parts for circle: center, radius, diameter, circumference, area. square: sides, corners, diagonal, perimeter, area.
    rectangle: length, width, corners, diagonal, perimeter, area. triangle: sides, angles, base, height, area. polygon: sides, corners, perimeter.
    Use one shape scene per shape for geometry and maths topics, and explain each part in the narration in the same order.
  {"type": "equation", "heading": "Step 2: Newton's second law", "narration": "...", "equation": "F = m × a", "terms": [{"symbol": "F", "meaning": "force in newtons"}, {"symbol": "m", "meaning": "mass in kg"}, {"symbol": "a", "meaning": "acceleration"}]}
    Use for formulas, laws and chemical reactions (write chemicals like H2O, CO2 and arrows as ->). Each symbol must appear in the equation.
  {"type": "chart", "kind": "bar", "heading": "Step 3: Planet sizes", "narration": "...", "items": ["Mercury", "Earth", "Jupiter"], "numbers": [4879, 12742, 139820], "unit": "km"}
    kind: "bar" to compare amounts, "line" for change over time (items are years or stages, in order), "pie" for parts of a whole (percentages).
    Use a chart ONLY with real, well-known numbers. Never invent data.
  {"type": "picture", "heading": "Step 4: Big cats", "narration": "...", "items": ["Lion", "Tiger", "Leopard"], "details": ["Lives in groups", "Has stripes", "Has spots"], "pictures": ["lion", "tiger", "leopard"]}
    Shows big animated pictures. Use it for anything the learner should SEE: animals, birds, sea life, plants, planets
    and space (sun, moon, earth, mars, saturn, comet, galaxy), body parts, weather, foods, vehicles and objects.
    1-6 items; "pictures" are simple English nouns. For the solar system include "sun" first, then the planets.
  "layout": "timeline" in a diagram = events in time order; items are dates or stages, details say what happened.
- Use "code_walkthrough" only for programming, markup or query topics (Python, HTML, CSS, SQL, etc.). Keep code to 2-6 lines per scene.
- EVERY scene must have a "narration" field: 1-2 short spoken sentences (max 35 words) in the style the user asks for, explaining the visual in the same order.
- Headings after the first scene start with "Step N:".
- If the question is long, advanced or open-ended (for example a research or design question), pick its core ideas and teach those clearly at the given level. Explain the building blocks and the main approach; never claim something is proven or solved when it is not.
- The title must be short (max 8 words), even if the question is long.
- Never include anything except the JSON."""


def ask_ollama(messages: list, num_ctx: int = 6144) -> tuple:
    r = requests.post(OLLAMA_URL, timeout=180, json={
        "model": MODEL,
        "messages": messages,
        "format": "json",
        "stream": False,
        "think": False,
        "options": {"temperature": 0.4, "num_ctx": num_ctx},
    })
    r.raise_for_status()
    content = r.json()["message"]["content"]
    return json.loads(content), content


def _guess_layout(text: str, n_items: int) -> str:
    text = text.lower()
    if "cycle" in text or "repeat" in text:
        return "cycle"
    if (" vs" in text or "versus" in text or "difference" in text or "compare" in text) and n_items <= 3:
        return "compare"
    if "layer" in text or "level" in text:
        return "layers"
    if "parts of" in text or "types of" in text or "made of" in text:
        return "hub"
    return "flow"


def _clean_icon(value) -> str:
    icon = str(value or "").strip()
    # keep only short emoji/symbols, never letters (a translated word is not an icon)
    return icon if 0 < len(icon) <= 4 and not any(ch.isalnum() for ch in icon) else ""


def _repair_diagram(s: dict, scene: dict) -> None:
    labels, details, icons = [], [], []
    for x in s.get("items") or []:
        if isinstance(x, dict):   # model sometimes sends {"label": ..., "detail": ..., "icon": ...}
            label = x.get("label") or x.get("name") or x.get("title") or x.get("text") or ""
            detail = x.get("detail") or x.get("description") or ""
            icon = x.get("icon") or x.get("emoji") or ""
        else:
            label, detail, icon = x, "", ""
        label = str(label).strip()[:40]
        if label:
            labels.append(label)
            details.append(str(detail).strip()[:80])
            icons.append(icon)
    extra_details, extra_icons = s.get("details") or [], s.get("icons") or []
    for k in range(len(labels)):
        if not details[k] and k < len(extra_details):
            details[k] = str(extra_details[k]).strip()[:80]
        if not icons[k] and k < len(extra_icons):
            icons[k] = extra_icons[k]
    labels, details = labels[:6], details[:6]
    pics = _pictures(dict(s, icons=icons), labels)
    icons = [_clean_icon(i) for i in icons[:6]]

    if len(labels) < 2:
        scene["type"] = "title_card"
        return
    layout = str(s.get("layout") or "").strip().lower()
    if layout not in LAYOUTS:
        layout = _guess_layout(f"{scene['heading']} {scene['narration']}", len(labels))
    if layout == "compare" and len(labels) > 3:
        layout = "flow"

    scene["layout"] = layout
    scene["items"] = labels
    if any(details):
        scene["details"] = details
    if any(icons):
        scene["icons"] = icons
    if any(pics):
        scene["pics"] = pics
    if layout in ("cycle", "hub"):
        center = str(s.get("center") or "").strip()
        if center:
            scene["center"] = center[:30]


def _pictures(s: dict, labels: list) -> list:
    """One picture per item: the model's picture word, else its emoji, else the label itself."""
    words = s.get("pictures") or s.get("images") or s.get("pics") or []
    icons = s.get("icons") or []
    out = []
    for k, label in enumerate(labels):
        pic = ""
        for cand in (words[k] if k < len(words) else "", icons[k] if k < len(icons) else "", label):
            pic = resolve(cand) if isinstance(cand, str) else ""
            if pic:
                break
        out.append(pic)
    return out


def _repair_picture(s: dict, scene: dict) -> None:
    labels, details = [], []
    for x in s.get("items") or []:
        if isinstance(x, dict):
            label = x.get("label") or x.get("name") or x.get("title") or ""
            detail = x.get("detail") or x.get("description") or ""
        else:
            label, detail = x, ""
        label = str(label).strip()[:40]
        if label:
            labels.append(label)
            details.append(str(detail).strip()[:80])
    extra = s.get("details") or []
    details = [d or (str(extra[k]).strip()[:80] if k < len(extra) else "") for k, d in enumerate(details)]
    pics = _pictures(s, labels)
    keep = [k for k, p in enumerate(pics) if p][:9]   # up to 9 for the solar system
    if not keep:                                   # nothing drawable: show it as a normal diagram instead
        scene["type"] = "diagram"
        _repair_diagram(s, scene)
        return
    scene["items"] = [labels[k] for k in keep]
    scene["pics"] = [pics[k] for k in keep]
    if any(details[k] for k in keep):
        scene["details"] = [details[k] for k in keep]


def _num(x):
    try:
        v = float(str(x).replace(",", "").strip())
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _repair_shape(s: dict, scene: dict) -> None:
    shape = str(s.get("shape") or "").strip().lower()
    aliases = {"oval": "circle", "rect": "rectangle", "pentagon": "polygon", "hexagon": "polygon",
               "octagon": "polygon", "heptagon": "polygon"}
    default_sides = {"pentagon": 5, "hexagon": 6, "heptagon": 7, "octagon": 8}
    sides = s.get("sides") or default_sides.get(shape)
    shape = aliases.get(shape, shape)
    if shape not in SHAPES:
        scene["type"] = "title_card"
        return
    allowed = SHAPE_PARTS[shape]
    parts = [str(p).strip().lower() for p in (s.get("parts") or [])]
    parts = [p for i, p in enumerate(parts) if p in allowed and p not in parts[:i]]
    scene["shape"] = shape
    scene["parts"] = parts or allowed
    values = s.get("values") if isinstance(s.get("values"), dict) else {}
    scene["values"] = {str(k).lower()[:20]: str(v)[:16] for k, v in values.items() if str(v).strip()}
    if not scene["values"]:
        scene.pop("values")
    if shape == "polygon":
        n = int(_num(sides) or 6)
        scene["sides"] = min(10, max(3, n))


def _repair_equation(s: dict, scene: dict) -> None:
    eq = str(s.get("equation") or s.get("formula") or "").strip()[:80]
    terms = []
    for t in s.get("terms") or []:
        if isinstance(t, dict):
            sym = str(t.get("symbol") or t.get("term") or "").strip()[:12]
            meaning = str(t.get("meaning") or t.get("description") or "").strip()[:50]
        elif isinstance(t, str) and ":" in t:
            sym, meaning = (x.strip() for x in t.split(":", 1))
        else:
            continue
        if sym and meaning and sym in eq and sym not in [x["symbol"] for x in terms]:
            terms.append({"symbol": sym, "meaning": meaning})
    if not eq or not terms:
        scene["type"] = "title_card"
        return
    scene["equation"] = eq
    scene["terms"] = terms[:6]


def _repair_chart(s: dict, scene: dict) -> None:
    items = [str(x).strip()[:24] for x in (s.get("items") or s.get("labels") or [])]
    numbers = [_num(x) for x in (s.get("numbers") or s.get("values") or [])]
    pairs = [(i, n) for i, n in zip(items, numbers) if i and n is not None and n >= 0][:8]
    if len(pairs) < 2:
        scene["type"] = "title_card"
        return
    scene["items"] = [p[0] for p in pairs]
    scene["numbers"] = [p[1] for p in pairs]
    unit = str(s.get("unit") or "").strip()[:16]
    if unit:
        scene["unit"] = unit
    kind = str(s.get("kind") or s.get("chart_type") or s.get("chart") or "bar").strip().lower()
    scene["kind"] = kind if kind in ("bar", "line", "pie") else "bar"


NARRATION_KEYS = ("narration", "narrator", "voiceover", "voice_over", "script", "speech",
                  "spoken_text", "text", "description", "explanation", "content", "summary")
HEADING_KEYS = ("heading", "title", "name", "step")


def _first_text(s: dict, keys) -> str:
    for k in keys:
        v = s.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _narration_from_visual(scene: dict, s: dict) -> str:
    """Last resort: speak the diagram itself when the model forgot the narration."""
    heading = scene["heading"].split(":", 1)[-1].strip()
    items = [x for x in (s.get("items") or []) if isinstance(x, str) and x.strip()]
    details = s.get("details") or []
    if not items:
        return ""
    parts = []
    for k, item in enumerate(items[:6]):
        detail = details[k] if k < len(details) and isinstance(details[k], str) else ""
        parts.append(f"{item}, {detail.strip()}" if detail.strip() else item)
    return f"{heading}. " + "; ".join(parts) + "."


def repair(raw: dict) -> dict:
    """Fix small mistakes from the small model instead of rejecting the lesson."""
    if not isinstance(raw, dict):
        return {"title": "Lesson", "scenes": []}
    if not any(k in raw for k in ("scenes", "steps", "slides")) and len(raw) == 1 \
            and isinstance(next(iter(raw.values())), dict):
        raw = next(iter(raw.values()))          # model wrapped it like {"lesson": {...}}
    scenes_in = raw.get("scenes") or raw.get("steps") or raw.get("slides") or []
    fixed = []
    for s in scenes_in:
        if not isinstance(s, dict):
            continue
        t = s.get("type") or s.get("scene_type") or s.get("kind")
        if t in ("image", "images", "pictures", "illustration", "gallery"):
            t = "picture"
        if t not in ("title_card", "diagram", "code_walkthrough", "shape", "equation", "chart", "picture"):
            t = ("shape" if s.get("shape") else "equation" if s.get("equation") else
                 "chart" if s.get("numbers") else "diagram" if s.get("items") else
                 "code_walkthrough" if s.get("code") else "title_card")
        heading = _first_text(s, HEADING_KEYS) or str(raw.get("title") or "Lesson")
        scene = {"type": t, "heading": heading[:80], "narration": ""}
        narration = _first_text(s, NARRATION_KEYS)
        if narration == scene["heading"]:
            narration = ""
        if len(narration) < 10:
            narration = _narration_from_visual(scene, s)
            scene["_auto"] = True         # filled in later by fill_narration()
        if len(narration) < 10:
            continue
        if len(narration) > 320:
            cut = narration[:320]
            dot = cut.rfind(".")
            narration = cut[:dot + 1] if dot > 100 else cut
        scene["narration"] = narration
        if t == "diagram":
            _repair_diagram(s, scene)
        if t == "shape":
            _repair_shape(s, scene)
        if t == "equation":
            _repair_equation(s, scene)
        if t == "chart":
            _repair_chart(s, scene)
        if t == "picture":
            _repair_picture(s, scene)
        if t == "code_walkthrough":
            code = s.get("code")
            if isinstance(code, list):
                code = "\n".join(map(str, code))
            code = str(code or "").strip("\n")
            if code.strip():
                scene["code"] = "\n".join(code.split("\n")[:10])
                scene["highlight_lines"] = [int(x) for x in (s.get("highlight_lines") or [])
                                            if str(x).isdigit()]
            else:
                scene["type"] = "title_card"
        fixed.append(scene)
    title = str(raw.get("title") or (fixed[0]["heading"] if fixed else "Lesson"))[:80]
    return {"title": title, "scenes": fixed[:6]}


RAW_LOG = Path(__file__).parent / "last_plan_raw.json"

NARRATION_PROMPT = """You write the spoken narration for scenes of a short visual lesson.
Return ONLY JSON like {"narrations": ["...", "..."]} with exactly one string per scene, in the same order.
Each narration is 1-2 natural spoken sentences (max 35 words) for the given level.
Explain what the visual shows, in the same order as its items. Do not just read out the labels."""


def fill_narration(fixed: dict, topic: str, level: str) -> None:
    """Second small call: write natural narration for scenes where the model left it out."""
    todo = [sc for sc in fixed["scenes"] if sc.pop("_auto", False)]
    if not todo:
        return
    visuals = [{k: sc[k] for k in ("heading", "layout", "items", "details", "center", "code", "shape",
                                   "parts", "values", "equation", "terms", "numbers", "unit", "kind") if k in sc}
               for sc in todo]
    try:
        raw, _ = ask_ollama([
            {"role": "system", "content": NARRATION_PROMPT},
            {"role": "user", "content": (f"Topic: {topic}\nLevel: {level}\n"
                                         f"Style: {LEVEL_STYLE.get(level, LEVEL_STYLE['beginner'])}\n"
                                         f"Scenes ({len(todo)}):\n{json.dumps(visuals, ensure_ascii=False)}")},
        ])
        lines = raw.get("narrations") if isinstance(raw, dict) else None
        if not isinstance(lines, list):
            return
        for sc, line in zip(todo, lines):
            line = str(line or "").strip()
            if 10 <= len(line) <= 320:
                sc["narration"] = line
        print(f"Filled narration for {len(todo)} scene(s)")
    except (ValueError, KeyError, TypeError, requests.RequestException) as e:
        print(f"Narration fill failed, keeping simple narration: {str(e)[:200]}")


QUIZ_PROMPT = """You write ONE multiple-choice question that checks the main idea of a short lesson.
Return ONLY JSON: {"question": "...", "options": ["...", "...", "..."], "answer": 0, "explanation": "..."}
- Exactly 3 short options (max 8 words each). Only one is correct. "answer" is the index (0, 1 or 2) of the correct option.
- Put the correct option in a random position, not always first.
- The question must be answerable from the lesson. The explanation is one short sentence saying why the answer is right."""
LETTERS = "ABC"


def make_quiz(lesson: dict, topic: str, level: str):
    """Extra small call: a quiz question for the end of the lesson. Returns a scene or None."""
    summary = [{"heading": s["heading"], "narration": s["narration"]} for s in lesson["scenes"]]
    try:
        raw, _ = ask_ollama([
            {"role": "system", "content": QUIZ_PROMPT},
            {"role": "user", "content": (f"Topic: {topic}\nLevel: {level}\n"
                                         f"Lesson:\n{json.dumps(summary, ensure_ascii=False)}")},
        ])
        question = str(raw.get("question") or "").strip()
        options = [str(o).strip()[:60] for o in (raw.get("options") or []) if str(o).strip()][:3]
        answer = raw.get("answer")
        if isinstance(answer, str):
            a = answer.strip().upper()
            answer = LETTERS.index(a[0]) if a[:1] in LETTERS else int(a) if a.isdigit() else None
        explanation = str(raw.get("explanation") or "").strip()
        if not (8 <= len(question) <= 220) or len(options) != 3 or answer not in (0, 1, 2):
            print("Quiz skipped: the model's question did not pass checks")
            return None
        spoken = f"The answer is {LETTERS[answer]}: {options[answer]}. {explanation}".strip()[:320]
        scene = {"type": "quiz", "heading": "Quick check", "narration": question,
                 "options": options, "answer": answer, "answer_narration": spoken}
        return Scene.model_validate(scene).model_dump(exclude_none=True)
    except (ValidationError, ValueError, KeyError, TypeError, AttributeError,
            requests.RequestException) as e:
        print(f"Quiz skipped: {str(e)[:200]}")
        return None


def _with_quiz(lesson: dict, topic: str, level: str, quiz: bool) -> dict:
    if quiz:
        q = make_quiz(lesson, topic, level)
        if q:
            lesson["scenes"].append(q)
    return lesson


GEOMETRY_RE = re.compile(r"\b(circle|square|rectangle|triangle|polygon|pentagon|hexagon|octagon|radius|"
                         r"diameter|perimeter|area|shape|shapes|geometry|angle|angles)\b", re.I)
FORMULA_RE = re.compile(r"\b(formula|equation|law|laws|theorem|reaction|reactions|photosynthesis|"
                        r"respiration|newton|ohm|einstein|velocity|acceleration|force|energy|chemical|"
                        r"pythagoras|ratio|speed)\b|=", re.I)


VISUAL_RE = re.compile(r"\b(animal|animals|mammal|bird|birds|insect|fish|reptile|pet|wild|zoo|jungle|forest|"
                       r"cat|cats|dog|dogs|lion|tiger|elephant|plant|plants|tree|flower|fruit|vegetable|food|"
                       r"planet|planets|solar|space|sun|moon|star|stars|galaxy|universe|astronomy|celestial|"
                       r"body|organ|organs|weather|season|seasons|vehicle|transport|habitat|ocean|sea)\b", re.I)
STATS_RE = re.compile(r"\b(statistic|statistics|data|population|percentage|percent|survey|growth|trend|"
                      r"share|distribution|graph|chart|gdp|economy|average|mean|median)\b", re.I)


def topic_hints(topic: str) -> str:
    hints = []
    if VISUAL_RE.search(topic):
        hints.append("Show the real things with \"picture\" scenes (animals, plants, planets, objects).")
    if STATS_RE.search(topic):
        hints.append("Show real, well-known numbers in \"chart\" scenes (bar, line or pie).")
    if GEOMETRY_RE.search(topic):
        hints.append("This is a geometry topic: use \"shape\" scenes to draw each shape and its parts.")
    if FORMULA_RE.search(topic):
        hints.append("Show the key formula, law or reaction in an \"equation\" scene with every symbol explained.")
    return " ".join(hints)


def notes_prompt(notes) -> str:
    """The learner's own notes, given to the model as the source for the lesson."""
    if not notes or not notes.get("found"):
        return ""
    if notes.get("question"):
        return (f"\nThe learner wants QUESTION {notes['question']} from their PDF \"{notes['name']}\" explained. "
                f"Here it is:\n<<<\n{notes['text']}\n>>>\n"
                "Make the lesson about THIS question: the title card states what the question asks, then teach "
                "the idea it needs, then answer or solve it step by step (use equation, shape or chart scenes "
                "when it has a formula, a shape or numbers), and end with the final answer.\n")
    return (f"\nSource notes from the learner's PDF \"{notes['name']}\":\n<<<\n{notes['text']}\n>>>\n"
            "Teach the topic FROM THESE NOTES: use their definitions, facts, numbers, steps and examples, "
            "in simple words for the level. Do not contradict the notes. If they do not cover something, "
            "keep it short and general.\n")


def plan_lesson(topic: str, level: str = "beginner", length: str = "medium", quiz: bool = True,
                notes: dict = None) -> dict:
    n_min, n_max = SCENE_COUNTS.get(length, (4, 5))
    start = time.time()
    ctx = 8192 if notes and notes.get("found") else 6144
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": (f"Topic: {topic}\nLevel: {level}\n"
                                     f"Style: {LEVEL_STYLE.get(level, LEVEL_STYLE['beginner'])}\n"
                                     f"{topic_hints(topic)}\n"
                                     f"{notes_prompt(notes)}"
                                     f"Make exactly {n_max} scenes.")},
    ]
    best = None   # best real lesson so far (better than the unrelated sample)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        content = None
        try:
            raw, content = ask_ollama(messages, ctx)
            RAW_LOG.write_text(content, encoding="utf-8")      # for debugging
            fixed = repair(raw)
            fill_narration(fixed, topic, level)
            fixed["level"] = level
            fixed["language"] = "en"
            lesson = Lesson.model_validate(fixed).model_dump(exclude_none=True)
            n = len(lesson["scenes"])
            if best is None or n > len(best["scenes"]):
                best = lesson
            if n >= n_min:
                print(f"Planner OK on attempt {attempt} ({n} scenes) in {time.time() - start:.1f}s")
                return {"lesson": _with_quiz(lesson, topic, level, quiz), "fallback": False}
            print(f"Planner attempt {attempt}: only {n} scenes, asking again")
            problem = f"You made only {n} usable scenes."
        except (ValidationError, ValueError, KeyError, TypeError, requests.RequestException) as e:
            print(f"Planner attempt {attempt} failed: {str(e)[:300]}")
            problem = "Your JSON did not follow the format."
            if isinstance(e, requests.RequestException):
                continue            # Ollama problem, just try again
        # tell the model exactly what to fix before the next try
        if content:
            messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": (
            f"{problem} Return the full JSON again with exactly {n_max} scenes. "
            f"EVERY scene must have \"type\", \"heading\" and \"narration\" "
            f"(1-2 spoken sentences). Diagrams also need \"layout\" and \"items\". "
            f"Split the topic into smaller steps and keep code to 2-6 lines per scene.")})

    if best is not None:
        print(f"Planner using best attempt ({len(best['scenes'])} scenes)")
        return {"lesson": _with_quiz(best, topic, level, quiz), "fallback": False}
    lesson = json.loads(SAMPLE.read_text(encoding="utf-8"))
    return {"lesson": lesson, "fallback": True}


if __name__ == "__main__":
    import sys
    topic = " ".join(sys.argv[1:]) or "How does photosynthesis work?"
    result = plan_lesson(topic)
    print(json.dumps(result, indent=2, ensure_ascii=False))
