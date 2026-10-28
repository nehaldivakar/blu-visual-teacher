"""Turns a word the AI wrote ("lion", "Mars", "🌞") into a picture from the offline pack.

The pictures are Microsoft Fluent Emoji (flat style, MIT licence) stored in
frontend/public/pics/<name>.svg. Planets are drawn by the app itself ("planet-mars").
Nothing here calls the network.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

INDEX_FILE = Path(__file__).parent / "pics_index.json"

PLANETS = ("mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto")

# common teaching words -> the picture that shows them best
SYNONYMS = {
    "plant": "potted-plant", "plants": "potted-plant", "tree": "deciduous-tree", "forest": "evergreen-tree",
    "flower": "blossom", "leaf": "leaf-fluttering-in-wind", "leaves": "leaf-fluttering-in-wind",
    "seed": "seedling", "sprout": "seedling", "grass": "herb", "crop": "sheaf-of-rice", "rice": "sheaf-of-rice",
    "water": "droplet", "rain": "cloud-with-rain", "raindrop": "droplet", "snow": "snowflake",
    "ice": "ice", "storm": "cloud-with-lightning-and-rain", "lightning": "high-voltage", "thunder": "cloud-with-lightning",
    "wind": "wind-face", "air": "wind-face", "weather": "sun-behind-rain-cloud", "temperature": "thermometer",
    "heat": "fire", "flame": "fire", "energy": "high-voltage", "electricity": "high-voltage", "power": "high-voltage",
    "ocean": "water-wave", "sea": "water-wave", "river": "water-wave", "wave": "water-wave", "lake": "water-wave",
    "evaporation": "sun", "condensation": "cloud", "precipitation": "cloud-with-rain", "collection": "water-wave",
    "sunlight": "sun", "light": "light-bulb", "bulb": "light-bulb", "idea": "light-bulb",
    "moon": "full-moon", "star": "star", "stars": "night-with-stars", "galaxy": "milky-way", "universe": "milky-way",
    "space": "milky-way", "planet": "ringed-planet", "sky": "night-with-stars", "meteor": "shooting-star",
    "asteroid": "rock", "satellite": "satellite", "astronaut": "rocket", "spaceship": "rocket", "ufo": "flying-saucer",
    "world": "globe-showing-asia-australia", "globe": "globe-showing-asia-australia",
    "mountain": "mountain", "earthquake": "house", "desert": "desert", "island": "desert-island",
    "soil": "brown-mushroom", "rock": "rock", "stone": "rock", "volcano": "volcano",
    "cell": "microbe", "bacteria": "microbe", "germ": "microbe", "virus": "microbe", "germs": "microbe",
    "dna": "dna", "gene": "dna", "genes": "dna", "blood": "drop-of-blood", "heart": "anatomical-heart",
    "brain": "brain", "lungs": "lungs", "lung": "lungs", "bone": "bone", "bones": "bone", "tooth": "tooth",
    "teeth": "tooth", "eye": "eye", "eyes": "eyes", "ear": "ear", "nose": "nose", "muscle": "flexed-biceps",
    "medicine": "pill", "doctor": "stethoscope", "health": "stethoscope", "vaccine": "syringe", "hospital": "hospital",
    "atom": "atom-symbol", "molecule": "atom-symbol", "chemistry": "test-tube", "chemical": "test-tube",
    "experiment": "test-tube", "lab": "alembic", "science": "microscope", "magnet": "magnet", "battery": "battery",
    "computer": "laptop", "laptop": "laptop", "phone": "mobile-phone", "internet": "globe-with-meridians",
    "website": "globe-with-meridians", "web": "globe-with-meridians", "network": "globe-with-meridians",
    "server": "desktop-computer", "database": "card-file-box", "data": "bar-chart", "file": "page-facing-up",
    "code": "laptop", "program": "laptop", "robot": "robot", "ai": "robot", "email": "e-mail", "message": "envelope",
    "money": "money-bag", "rupee": "money-bag", "coin": "coin", "bank": "bank", "shop": "convenience-store",
    "market": "shopping-cart", "price": "label", "chart": "bar-chart", "graph": "chart-increasing",
    "growth": "chart-increasing", "profit": "chart-increasing", "loss": "chart-decreasing", "time": "alarm-clock",
    "clock": "alarm-clock", "history": "scroll", "book": "books", "books": "books", "study": "open-book",
    "school": "school", "student": "graduation-cap", "teacher": "graduation-cap", "exam": "memo", "write": "pencil",
    "math": "abacus", "maths": "abacus", "measure": "straight-ruler", "ruler": "straight-ruler", "weight": "balance-scale",
    "balance": "balance-scale", "law": "balance-scale", "justice": "balance-scale", "tool": "hammer-and-wrench",
    "machine": "gear", "engine": "gear", "car": "automobile", "train": "locomotive", "plane": "airplane",
    "aeroplane": "airplane", "ship": "ship", "boat": "sailboat", "bike": "bicycle", "travel": "airplane",
    "city": "cityscape", "home": "house", "house": "house", "factory": "factory", "farm": "tractor",
    "food": "green-salad", "fruit": "red-apple", "apple": "red-apple", "vegetable": "carrot", "milk": "glass-of-milk",
    "egg": "egg", "sugar": "candy", "glucose": "candy", "oxygen": "wind-face", "carbon dioxide": "fog",
    "pollution": "factory", "recycle": "recycling-symbol", "music": "musical-notes", "art": "artist-palette",
    "sport": "soccer-ball", "game": "video-game", "goal": "bullseye", "target": "bullseye", "win": "trophy",
    "prize": "trophy", "gift": "wrapped-gift", "party": "party-popper", "love": "red-heart", "friend": "handshake",
    "team": "handshake", "family": "house-with-garden", "baby": "baby-bottle", "bird": "bird", "birds": "bird",
    "insect": "honeybee", "bee": "honeybee", "fish": "tropical-fish", "animal": "paw-prints", "animals": "paw-prints",
    "pet": "dog", "puppy": "dog", "kitten": "cat", "dinosaur": "t-rex", "frog": "frog", "caterpillar": "bug",
    "egg cell": "egg", "chicken": "chicken", "hen": "chicken", "cow": "cow", "horse": "horse",
}
STOP = {"a", "an", "the", "of", "and", "big", "small", "little", "baby", "cute", "happy", "wild"}


@lru_cache(maxsize=1)
def _index():
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}, {}, {}
    pics, glyphs = data.get("pics", {}), data.get("glyphs", {})
    by_keyword = {}
    for slug, info in sorted(pics.items(), key=lambda kv: len(kv[0])):   # shorter names win
        for k in info.get("k", []):
            by_keyword.setdefault(k, slug)
    return pics, glyphs, by_keyword


def _singular(w: str) -> str:
    for end, rep in (("ies", "y"), ("ves", "f"), ("es", ""), ("s", "")):
        if w.endswith(end) and len(w) > len(end) + 2:
            return w[: -len(end)] + rep
    return w


def resolve(word) -> str:
    """Returns a picture name, or "" when nothing fits (then no picture is shown)."""
    pics, glyphs, by_keyword = _index()
    raw = str(word or "").strip()
    if not raw or not pics:
        return ""
    if raw in glyphs:                                   # an emoji the model wrote
        return glyphs[raw]
    if raw.rstrip("️") in glyphs:
        return glyphs[raw.rstrip("️")]
    text = re.sub(r"[^a-z0-9 \-]", " ", raw.lower()).strip()
    words = [w for w in text.replace("-", " ").split() if w not in STOP]
    if not words:
        return ""
    phrase = " ".join(words)
    candidates = [phrase, _singular(phrase)]
    if len(words) > 1:
        candidates += [words[-1], _singular(words[-1]), words[0]]
    for c in candidates:
        if c in PLANETS:
            return f"planet-{c}"
        if c == "sun":
            return "sun"
        slug = c.replace(" ", "-")
        if c in SYNONYMS and (SYNONYMS[c] in pics):
            return SYNONYMS[c]
        if slug in pics:
            return slug
        if c in by_keyword:
            return by_keyword[c]
    return ""


def resolve_list(words, n: int) -> list:
    out = [resolve(w) for w in (words or [])][:n]
    return out + [""] * (n - len(out))


if __name__ == "__main__":
    import sys
    for w in sys.argv[1:] or ["lion", "Cats", "Mars", "🌞", "Water cycle", "evaporation", "Server", "the Moon",
                              "galaxy", "Photosynthesis", "elephants", "bacteria"]:
        print(f"{w!r:>16} -> {resolve(w) or '(none)'}")
