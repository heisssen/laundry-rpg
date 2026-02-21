#!/usr/bin/env python3
"""
Generate painterly, system-local WEBP icons and write image paths back to JSON files.
The visual style is dark/noir with distressed highlights to match Laundry mood.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ICONS_ROOT = ROOT / "icons" / "generated"
EXTRACTION_ROOT = ROOT / "sources" / "extraction"
EXTRACTION_STAGES = ("reviewed", "normalized", "raw")
ICON_SIZE = 512

SOURCES = [
    ("skills.json", "skill"),
    ("talents.json", "talent"),
    ("spells.json", "spell"),
    ("weapons.json", "weapon"),
    ("armour.json", "armour"),
    ("gear.json", "gear"),
    ("assignments.json", "assignment"),
    ("enemies.json", "enemy"),
]

TYPE_DIR = {
    "skill": "skills",
    "talent": "talents",
    "spell": "spells",
    "weapon": "weapons",
    "armour": "armours",
    "gear": "gear",
    "assignment": "assignments",
    "enemy": "enemies",
}

TYPE_DEFAULT_MOTIF = {
    "skill": "badge",
    "talent": "badge",
    "spell": "rune_circle",
    "weapon": "pistol",
    "armour": "shield",
    "gear": "gadget",
    "assignment": "document",
    "enemy": "skull",
}

TYPE_PALETTES = {
    key: {
        "bg1": "#fcf5e5",
        "bg2": "#f4eade",
        "bg3": "#e8d8b8",
        "metal_shadow": "#4d443e",
        "metal": "#6b5e54",
        "metal_mid": "#8f7f70",
        "metal_light": "#b8a898",
        "outline": "#2c2622",
        "accent": "#9a3d44",
        "smoke": "#a3b8b4",
    } for key in [
        "skill", "talent", "spell", "weapon", "armour", "gear", "assignment", "enemy"
    ]
}

SKILL_MOTIFS = {
    "academics": "book",
    "athletics": "fist",
    "awareness": "eye",
    "bureaucracy": "document",
    "close combat": "knife",
    "computers": "chip",
    "dexterity": "hand",
    "engineering": "wrench",
    "fast talk": "mask",
    "fortitude": "shield",
    "intuition": "eye",
    "magic": "rune_circle",
    "medicine": "cross",
    "might": "fist",
    "occult": "skull",
    "presence": "badge",
    "ranged": "crosshair",
    "reflexes": "bolt",
    "resolve": "lock",
    "science": "atom",
    "stealth": "mask",
    "survival": "leaf",
    "technology": "network",
    "zeal": "flame",
}

KEYWORD_MOTIFS = [
    ("glock", "pistol"),
    ("pistol", "pistol"),
    ("gun", "pistol"),
    ("shotgun", "rifle"),
    ("rifle", "rifle"),
    ("mp5", "rifle"),
    ("sniper", "rifle"),
    ("knife", "knife"),
    ("blade", "knife"),
    ("baton", "baton"),
    ("taser", "taser"),
    ("spray", "spray"),
    ("grenade", "grenade"),
    ("ward", "rune_circle"),
    ("geas", "rune_circle"),
    ("binding", "rune_circle"),
    ("magic", "rune_circle"),
    ("summon", "rune_circle"),
    ("gateway", "rune_circle"),
    ("projection", "orb"),
    ("psychometry", "orb"),
    ("prognost", "orb"),
    ("energy", "bolt"),
    ("temperature", "flame"),
    ("exorc", "flame"),
    ("banish", "flame"),
    ("truth", "badge"),
    ("silence", "lock"),
    ("curse", "skull"),
    ("glamour", "mask"),
    ("detect", "eye"),
    ("smart car", "vehicle"),
    ("violin", "violin"),
    ("gravedust", "vial"),
    ("hand of glory", "hand"),
    ("necronomiphone", "phone"),
    ("tape", "tape"),
    ("smart card", "card"),
    ("thaumometer", "scanner"),
    ("resonator", "scanner"),
    ("scanner", "scanner"),
    ("microdrone", "drone"),
    ("locator bugs", "bug"),
    ("laser microphone", "scanner"),
    ("fibre optic", "scanner"),
    ("keystroke", "chip"),
    ("nausea flash", "grenade"),
    ("book", "book"),
    ("archive", "book"),
    ("clerk", "document"),
    ("analyst", "document"),
    ("research", "document"),
    ("investigator", "badge"),
    ("liaison", "badge"),
    ("officer", "badge"),
    ("support", "chip"),
    ("it", "chip"),
    ("medic", "cross"),
    ("wrangler", "skull"),
    ("exorcist", "flame"),
    ("demonolog", "rune_circle"),
    ("forensics", "eye"),
    ("laundry", "document"),
    ("cop", "badge"),
    ("fire", "flame"),
    ("reload", "pistol"),
    ("shot", "crosshair"),
    ("aim", "crosshair"),
    ("disguise", "mask"),
    ("vision", "eye"),
    ("sense", "eye"),
    ("voice", "mask"),
    ("grip", "hand"),
    ("knowledge", "book"),
    ("sorcery", "rune_circle"),
    ("magician", "rune_circle"),
    ("combat", "knife"),
    ("driving", "vehicle"),
    ("tech", "chip"),
    ("tinkerer", "wrench"),
    ("coordinator", "badge"),
]

ENEMY_MOTIFS = [
    ("shoggoth", "tentacle"),
    ("elder thing", "tentacle"),
    ("cthonian", "tentacle"),
    ("ghost", "orb"),
    ("psychic", "orb"),
    ("poltergeist", "orb"),
    ("succub", "mask"),
    ("zombie", "skull"),
    ("cult", "mask"),
    ("security", "crosshair"),
    ("field agent", "badge"),
    ("civilian", "eye"),
    ("creature", "skull"),
    ("aberration", "tentacle"),
]

EXACT_NAME_MOTIFS = {
    "erich zann violin": "violin",
    "enhanced smart car": "vehicle",
    "necronomiphone": "phone",
    "smart card": "card",
    "locator bugs": "bug",
    "microdrone": "drone",
    "gravedust rig": "vial",
    "thaumometer": "scanner",
    "tillinghast resonator": "scanner",
    "t-ray scanner": "scanner",
    "fibre optic probe": "scanner",
    "laser microphone": "scanner",
    "keystroke logger": "chip",
    "3-w laser": "scanner",
    "warding tape (class 3)": "tape",
    "warding tape (class 4)": "tape",
    "hand of glory (class 1/4)": "hand",
    "hand of glory (class 2-3)": "hand",
    "personal wards (class 1-2)": "rune_circle",
    "personal wards (class 3)": "rune_circle",
    "personal wards (class 4)": "rune_circle",
}


def _stable_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def slugify(text: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return base or "item"


def hash_suffix(text: str, size: int = 6) -> str:
    return _stable_hash(text)[:size]


def _rng_for(item_type: str, name: str) -> random.Random:
    digest = _stable_hash(f"{item_type}:{name}")
    return random.Random(int(digest[:16], 16))


def _rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    r, g, b = ImageColor.getrgb(hex_color)
    return r, g, b, max(0, min(255, int(alpha)))


def _palette_for(item_type: str) -> dict[str, str]:
    return TYPE_PALETTES.get(item_type, TYPE_PALETTES["gear"])


def _iter_source_paths(file_name: str) -> list[Path]:
    paths: list[Path] = []
    for stage in EXTRACTION_STAGES:
        candidate = EXTRACTION_ROOT / stage / file_name
        if candidate.exists():
            paths.append(candidate)
    candidate = ROOT / file_name
    if candidate.exists():
        paths.append(candidate)
    return paths


def _is_expected_record(item: dict, item_type: str) -> bool:
    if item_type == "enemy":
        return "attributes" in item and "quickActions" in item
    return str(item.get("type") or "").strip().lower() == item_type


def write_json(path: Path, payload: list[dict]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _clear_generated_dirs() -> None:
    dirs = set(TYPE_DIR.values()) | {"_defaults"}
    for sub in dirs:
        path = ICONS_ROOT / sub
        path.mkdir(parents=True, exist_ok=True)
        for file_path in path.glob("*"):
            if file_path.is_file() and file_path.suffix.lower() in {".webp", ".png", ".svg"}:
                file_path.unlink()


def _compose_rotated_sprite(
    layer: Image.Image,
    sprite: Image.Image,
    center: tuple[float, float],
    angle: float = 0.0,
    scale: float = 1.0,
) -> None:
    working = sprite
    if abs(scale - 1.0) > 1e-6:
        width = max(16, int(sprite.width * scale))
        height = max(16, int(sprite.height * scale))
        working = working.resize((width, height), Image.Resampling.LANCZOS)
    if abs(angle) > 1e-3:
        working = working.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)

    x = int(round(center[0] - working.width / 2))
    y = int(round(center[1] - working.height / 2))
    layer.alpha_composite(working, (x, y))


def _paint_background(canvas: Image.Image, palette: dict[str, str], rng: random.Random) -> None:
    size = canvas.width

    angle = rng.randint(-25, 25)
    linear_mask = Image.linear_gradient("L").resize((size, size), Image.Resampling.BICUBIC)
    linear_mask = linear_mask.rotate(angle, expand=False)

    bg_a = Image.new("RGBA", (size, size), _rgba(palette["bg1"]))
    bg_b = Image.new("RGBA", (size, size), _rgba(palette["bg2"]))
    base = Image.composite(bg_b, bg_a, linear_mask)
    canvas.alpha_composite(base)

    radial = Image.radial_gradient("L").resize((size, size), Image.Resampling.BICUBIC)
    radial = ImageOps.invert(radial)
    glow_mask = radial.point(lambda p: int(p * 0.72))
    glow = Image.new("RGBA", (size, size), _rgba(palette["bg3"], 145))
    canvas.paste(glow, (0, 0), glow_mask)

    smoke_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    smoke_draw = ImageDraw.Draw(smoke_layer)
    smoke_color = _rgba(palette["smoke"], 28)

    for _ in range(18):
        rx = rng.randint(size // 9, size // 3)
        ry = rng.randint(size // 10, size // 3)
        cx = rng.randint(-rx // 2, size + rx // 2)
        cy = rng.randint(-ry // 2, size + ry // 2)
        smoke_draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=smoke_color)

    smoke_layer = smoke_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.04))
    canvas.alpha_composite(smoke_layer)

    vignette_mask = Image.new("L", (size, size), 255)
    vd = ImageDraw.Draw(vignette_mask)
    margin = int(size * 0.075)
    vd.ellipse((margin, margin, size - margin, size - margin), fill=130)
    vignette_mask = vignette_mask.filter(ImageFilter.GaussianBlur(radius=size * 0.09))

    vignette = Image.new("RGBA", (size, size), (0, 0, 0, 185))
    canvas.paste(vignette, (0, 0), vignette_mask)


def _add_global_grit(canvas: Image.Image, palette: dict[str, str], rng: random.Random) -> None:
    size = canvas.width

    grime = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grime)
    for _ in range(950):
        x = rng.randint(0, size - 1)
        y = rng.randint(0, size - 1)
        r = rng.randint(1, 3)
        alpha = rng.randint(8, 28)
        color = _rgba(palette["outline"], alpha)
        gd.ellipse((x - r, y - r, x + r, y + r), fill=color)

    for _ in range(24):
        rx = rng.randint(size // 30, size // 14)
        ry = rng.randint(size // 30, size // 12)
        cx = rng.randint(0, size)
        cy = rng.randint(0, size)
        tone = _rgba(palette["metal_shadow"], rng.randint(25, 55))
        gd.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=tone)

    grime = grime.filter(ImageFilter.GaussianBlur(radius=1.1))
    canvas.alpha_composite(grime)


def _base_subject_layer(size: int = ICON_SIZE) -> Image.Image:
    return Image.new("RGBA", (size, size), (0, 0, 0, 0))


def _draw_rune_scratches(sprite: Image.Image, color: tuple[int, int, int, int], rng: random.Random) -> None:
    d = ImageDraw.Draw(sprite)
    width, height = sprite.size
    y = int(height * 0.35)
    x0 = int(width * 0.46)
    for _ in range(8):
        x = x0 + rng.randint(-22, 160)
        h = rng.randint(8, 24)
        d.line((x, y, x + rng.randint(-8, 8), y + h), fill=color, width=rng.randint(2, 4))


def _motif_pistol(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 430), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    metal = _rgba(palette["metal"], 255)
    mid = _rgba(palette["metal_mid"], 255)
    light = _rgba(palette["metal_light"], 255)
    dark = _rgba(palette["metal_shadow"], 255)

    d.rounded_rectangle((70, 108, 560, 202), radius=24, fill=outline)
    d.rounded_rectangle((78, 116, 552, 196), radius=20, fill=mid)
    d.rounded_rectangle((90, 128, 530, 186), radius=16, fill=metal)

    d.rounded_rectangle((126, 186, 462, 280), radius=26, fill=outline)
    d.rounded_rectangle((136, 194, 454, 272), radius=22, fill=mid)
    d.rounded_rectangle((150, 206, 442, 264), radius=18, fill=metal)

    d.polygon([(188, 248), (328, 250), (282, 404), (118, 390)], fill=outline)
    d.polygon([(198, 258), (316, 260), (274, 392), (132, 382)], fill=mid)
    d.polygon([(210, 266), (304, 270), (266, 384), (146, 374)], fill=metal)

    d.rounded_rectangle((478, 126, 590, 190), radius=20, fill=outline)
    d.rounded_rectangle((490, 136, 582, 182), radius=16, fill=dark)
    d.ellipse((540, 142, 578, 178), fill=outline)
    d.ellipse((548, 148, 574, 174), fill=dark)

    d.rounded_rectangle((260, 260, 368, 334), radius=24, fill=outline)
    d.rounded_rectangle((272, 272, 356, 324), radius=20, fill=dark)
    d.rounded_rectangle((292, 274, 326, 334), radius=12, fill=mid)

    d.rounded_rectangle((112, 188, 152, 224), radius=9, fill=light)
    d.rounded_rectangle((198, 324, 240, 350), radius=9, fill=light)

    _draw_rune_scratches(sprite, _rgba(palette["accent"], 210), rng)

    return sprite, -17.0 + rng.uniform(-4.0, 3.5), 0.98


def _motif_rifle(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (700, 310), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    metal = _rgba(palette["metal"], 255)
    mid = _rgba(palette["metal_mid"], 255)
    light = _rgba(palette["metal_light"], 255)
    dark = _rgba(palette["metal_shadow"], 255)

    d.rounded_rectangle((60, 132, 646, 188), radius=18, fill=outline)
    d.rounded_rectangle((70, 140, 638, 180), radius=14, fill=mid)
    d.rounded_rectangle((84, 146, 626, 174), radius=12, fill=metal)

    d.rounded_rectangle((90, 118, 182, 146), radius=10, fill=outline)
    d.rounded_rectangle((98, 124, 176, 142), radius=8, fill=dark)

    d.polygon([(190, 178), (320, 178), (294, 278), (136, 272)], fill=outline)
    d.polygon([(202, 186), (310, 186), (286, 266), (148, 260)], fill=mid)
    d.polygon([(212, 194), (300, 194), (278, 258), (162, 254)], fill=metal)

    d.rounded_rectangle((332, 174, 392, 238), radius=12, fill=outline)
    d.rounded_rectangle((342, 182, 382, 230), radius=10, fill=dark)

    d.rounded_rectangle((470, 116, 576, 146), radius=10, fill=outline)
    d.rounded_rectangle((478, 122, 568, 142), radius=8, fill=dark)

    d.rounded_rectangle((620, 140, 684, 168), radius=8, fill=outline)
    d.rounded_rectangle((628, 144, 676, 164), radius=6, fill=dark)

    for i in range(7):
        x = 228 + i * 38
        d.line((x, 152, x + 18, 152), fill=light, width=3)

    return sprite, -12.0 + rng.uniform(-3.0, 3.0), 0.98


def _motif_knife(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 420), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    metal = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal_shadow"], 255)
    accent = _rgba(palette["accent"], 230)

    blade = [(82, 210), (342, 96), (452, 118), (198, 244)]
    d.polygon(blade, fill=outline)
    blade_inner = [(98, 208), (342, 112), (430, 128), (204, 234)]
    d.polygon(blade_inner, fill=metal)

    d.polygon([(190, 240), (340, 284), (292, 370), (138, 316)], fill=outline)
    d.polygon([(200, 246), (328, 282), (286, 358), (150, 314)], fill=dark)

    d.rounded_rectangle((188, 234, 238, 260), radius=8, fill=accent)
    d.line((114, 214, 352, 122), fill=_rgba("#e7dcc4", 130), width=3)

    return sprite, -24.0 + rng.uniform(-4.0, 4.0), 1.0


def _motif_baton(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (580, 360), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 235)
    metal = _rgba(palette["metal"], 255)
    mid = _rgba(palette["metal_mid"], 255)

    d.rounded_rectangle((82, 152, 500, 214), radius=24, fill=outline)
    d.rounded_rectangle((94, 162, 488, 204), radius=20, fill=mid)
    d.rounded_rectangle((110, 170, 476, 196), radius=14, fill=metal)

    d.rounded_rectangle((430, 150, 520, 216), radius=16, fill=outline)
    d.rounded_rectangle((440, 160, 510, 206), radius=12, fill=mid)
    for i in range(4):
        x = 148 + i * 56
        d.rounded_rectangle((x, 164, x + 22, 202), radius=5, fill=_rgba(palette["metal_light"], 180))

    return sprite, -19.0 + rng.uniform(-3.0, 3.0), 1.0


def _motif_taser(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite, angle, scale = _motif_pistol(palette, rng)
    d = ImageDraw.Draw(sprite)
    bolt = _rgba(palette["accent"], 230)
    d.polygon([(430, 154), (452, 154), (440, 178), (460, 178), (430, 214), (438, 188), (418, 188)], fill=bolt)
    return sprite, angle, scale


def _motif_spray(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (460, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)
    smoke = _rgba(palette["smoke"], 110)

    d.rounded_rectangle((170, 56, 292, 118), radius=18, fill=outline)
    d.rounded_rectangle((184, 66, 280, 110), radius=14, fill=dark)

    d.rounded_rectangle((126, 104, 338, 412), radius=44, fill=outline)
    d.rounded_rectangle((142, 120, 322, 398), radius=36, fill=body)
    d.rounded_rectangle((156, 144, 306, 376), radius=32, fill=dark)

    d.rounded_rectangle((174, 210, 290, 232), radius=8, fill=_rgba(palette["accent"], 190))
    d.rounded_rectangle((174, 252, 290, 274), radius=8, fill=_rgba(palette["accent"], 170))

    for i in range(6):
        cx = 280 + i * 20
        cy = 88 - i * 10
        r = 32 + i * 3
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=smoke)

    return sprite, 14.0 + rng.uniform(-3.0, 3.0), 1.0


def _motif_grenade(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (460, 500), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((166, 76, 292, 146), radius=16, fill=outline)
    d.rounded_rectangle((176, 86, 282, 138), radius=12, fill=dark)

    d.rounded_rectangle((126, 132, 334, 392), radius=104, fill=outline)
    d.rounded_rectangle((138, 146, 322, 378), radius=94, fill=body)
    d.rounded_rectangle((152, 160, 308, 364), radius=86, fill=dark)

    for i in range(6):
        y = 190 + i * 28
        d.rounded_rectangle((172, y, 288, y + 12), radius=4, fill=_rgba(palette["metal_light"], 180))

    d.polygon([(282, 108), (360, 78), (392, 104), (314, 136)], fill=outline)
    d.polygon([(290, 110), (358, 84), (384, 104), (316, 130)], fill=dark)

    return sprite, -8.0 + rng.uniform(-4.0, 4.0), 1.0


def _motif_shield(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 240)
    body = _rgba(palette["metal_mid"], 255)
    core = _rgba(palette["metal"], 255)

    outer = [(260, 54), (434, 126), (390, 402), (260, 552), (130, 402), (86, 126)]
    inner = [(260, 78), (412, 142), (374, 390), (260, 524), (146, 390), (108, 142)]
    core_shape = [(260, 108), (388, 156), (356, 372), (260, 488), (164, 372), (132, 156)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=body)
    d.polygon(core_shape, fill=core)

    d.line((260, 120, 260, 474), fill=_rgba(palette["metal_light"], 180), width=8)
    d.line((170, 212, 352, 212), fill=_rgba(palette["accent"], 190), width=8)

    return sprite, rng.uniform(-5.0, 5.0), 1.0


def _motif_vest(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (540, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 240)
    body = _rgba(palette["metal_mid"], 255)
    core = _rgba(palette["metal"], 255)

    outer = [(120, 88), (208, 88), (252, 152), (286, 152), (332, 88), (420, 88), (458, 170), (436, 520), (104, 520), (82, 170)]
    inner = [(140, 106), (214, 106), (250, 164), (288, 164), (326, 106), (400, 106), (434, 178), (414, 500), (126, 500), (106, 178)]
    core_shape = [(162, 126), (222, 126), (258, 182), (280, 182), (318, 126), (378, 126), (404, 186), (386, 478), (154, 478), (136, 186)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=body)
    d.polygon(core_shape, fill=core)

    d.rounded_rectangle((204, 228, 336, 252), radius=8, fill=_rgba(palette["accent"], 190))
    d.rounded_rectangle((194, 280, 346, 304), radius=8, fill=_rgba(palette["metal_light"], 170))

    return sprite, rng.uniform(-4.0, 4.0), 1.0


def _motif_document(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (500, 580), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 238)
    paper = _rgba("#d8ccb0", 230)
    ink = _rgba(palette["metal_shadow"], 220)

    d.rounded_rectangle((98, 72, 412, 508), radius=26, fill=outline)
    d.rounded_rectangle((110, 86, 398, 494), radius=20, fill=paper)
    d.polygon([(326, 86), (398, 86), (398, 164)], fill=_rgba("#c7b58f", 215))

    for i in range(9):
        y = 154 + i * 34
        left = 150
        right = 362 - (18 if i % 3 == 0 else 0)
        d.rounded_rectangle((left, y, right, y + 8), radius=4, fill=ink)

    d.ellipse((156, 438, 246, 482), outline=_rgba(palette["accent"], 230), width=7)
    d.line((176, 460, 228, 460), fill=_rgba(palette["accent"], 230), width=5)

    return sprite, -8.0 + rng.uniform(-3.0, 3.0), 1.0


def _motif_book(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 235)
    cover = _rgba(palette["metal_mid"], 255)
    spine = _rgba(palette["metal"], 255)
    edge = _rgba("#d2c4a5", 220)

    d.polygon([(84, 148), (302, 112), (542, 160), (328, 204)], fill=outline)
    d.polygon([(96, 160), (302, 126), (530, 170), (326, 214)], fill=cover)
    d.polygon([(328, 204), (542, 160), (542, 388), (328, 434)], fill=outline)
    d.polygon([(326, 216), (530, 172), (530, 378), (326, 422)], fill=spine)
    d.polygon([(84, 148), (328, 204), (326, 434), (84, 380)], fill=outline)
    d.polygon([(96, 160), (316, 212), (314, 422), (96, 370)], fill=cover)

    for i in range(6):
        x = 134 + i * 30
        d.line((x, 168, x + 204, 214), fill=edge, width=2)

    d.rounded_rectangle((236, 246, 398, 292), radius=12, outline=_rgba(palette["accent"], 210), width=5)

    return sprite, -14.0 + rng.uniform(-2.0, 2.5), 0.95


def _motif_badge(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 238)
    core = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)
    accent = _rgba(palette["accent"], 230)

    outer = [(260, 66), (318, 176), (440, 196), (352, 278), (374, 402), (260, 346), (146, 402), (168, 278), (80, 196), (202, 176)]
    inner = [(260, 92), (308, 186), (412, 202), (336, 274), (354, 382), (260, 336), (166, 382), (184, 274), (108, 202), (212, 186)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=core)
    d.ellipse((206, 200, 314, 308), fill=dark, outline=accent, width=6)
    d.ellipse((234, 228, 286, 280), fill=accent)

    return sprite, rng.uniform(-5.0, 5.0), 1.02


def _motif_chip(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 238)
    core = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)
    accent = _rgba(palette["accent"], 210)

    d.rounded_rectangle((110, 110, 450, 450), radius=28, fill=outline)
    d.rounded_rectangle((124, 124, 436, 436), radius=22, fill=core)
    d.rounded_rectangle((176, 176, 384, 384), radius=18, fill=dark)

    for i in range(10):
        x = 142 + i * 28
        d.rounded_rectangle((x, 76, x + 10, 120), radius=3, fill=accent)
        d.rounded_rectangle((x, 440, x + 10, 484), radius=3, fill=accent)
        y = 142 + i * 28
        d.rounded_rectangle((76, y, 120, y + 10), radius=3, fill=accent)
        d.rounded_rectangle((440, y, 484, y + 10), radius=3, fill=accent)

    d.rounded_rectangle((230, 230, 330, 330), radius=12, outline=accent, width=6)

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_wrench(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 235)
    metal = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.ellipse((314, 104, 490, 280), fill=outline)
    d.ellipse((340, 130, 464, 254), fill=dark)
    d.polygon([(354, 104), (428, 132), (404, 170), (332, 142)], fill=dark)

    d.polygon([(98, 372), (166, 304), (372, 508), (304, 576)], fill=outline)
    d.polygon([(112, 372), (166, 320), (356, 510), (304, 562)], fill=metal)

    d.ellipse((70, 410, 176, 516), fill=outline)
    d.ellipse((94, 434, 152, 492), fill=dark)

    return sprite, -18.0 + rng.uniform(-6.0, 6.0), 0.95


def _motif_hand(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 236)
    skin = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((146, 208, 374, 468), radius=46, fill=outline)
    d.rounded_rectangle((160, 222, 360, 454), radius=38, fill=skin)
    d.rounded_rectangle((174, 236, 346, 442), radius=34, fill=dark)

    finger_x = [146, 188, 230, 272, 314]
    finger_h = [166, 184, 196, 182, 166]
    for x, h in zip(finger_x, finger_h):
        d.rounded_rectangle((x, h, x + 54, 262), radius=18, fill=outline)
        d.rounded_rectangle((x + 8, h + 10, x + 46, 254), radius=14, fill=skin)

    d.rounded_rectangle((110, 246, 166, 366), radius=18, fill=outline)
    d.rounded_rectangle((118, 256, 158, 356), radius=14, fill=skin)

    return sprite, -9.0 + rng.uniform(-5.0, 5.0), 1.0


def _motif_eye(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (580, 420), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 238)
    iris = _rgba(palette["accent"], 220)
    dark = _rgba(palette["metal"], 255)

    d.polygon([(70, 210), (168, 118), (412, 118), (510, 210), (412, 302), (168, 302)], fill=outline)
    d.polygon([(98, 210), (178, 138), (402, 138), (482, 210), (402, 282), (178, 282)], fill=_rgba(palette["metal_mid"], 255))

    d.ellipse((210, 138, 370, 298), fill=dark)
    d.ellipse((242, 170, 338, 266), fill=iris)
    d.ellipse((274, 202, 306, 234), fill=dark)

    return sprite, rng.uniform(-5.0, 5.0), 1.0


def _motif_cross(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (500, 500), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 238)
    core = _rgba(palette["accent"], 220)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((212, 84, 288, 414), radius=20, fill=outline)
    d.rounded_rectangle((88, 208, 412, 286), radius=20, fill=outline)
    d.rounded_rectangle((224, 98, 276, 400), radius=14, fill=core)
    d.rounded_rectangle((102, 220, 398, 274), radius=14, fill=core)
    d.ellipse((228, 224, 272, 268), fill=dark)

    return sprite, rng.uniform(-4.0, 4.0), 1.0


def _motif_skull(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 236)
    bone = _rgba("#d8c8a5", 232)
    dark = _rgba(palette["metal"], 255)

    d.ellipse((96, 70, 424, 396), fill=outline)
    d.ellipse((116, 92, 404, 376), fill=bone)

    d.rounded_rectangle((154, 286, 366, 470), radius=44, fill=outline)
    d.rounded_rectangle((170, 302, 350, 454), radius=34, fill=bone)

    d.ellipse((170, 172, 244, 248), fill=dark)
    d.ellipse((276, 172, 350, 248), fill=dark)
    d.polygon([(260, 244), (278, 286), (242, 286)], fill=dark)

    for i in range(6):
        x = 188 + i * 26
        d.rounded_rectangle((x, 364, x + 14, 430), radius=4, fill=dark)

    d.line((172, 136, 220, 180), fill=_rgba(palette["metal_shadow"], 165), width=4)

    return sprite, rng.uniform(-6.0, 6.0), 1.0


def _motif_mask(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outline = _rgba(palette["outline"], 238)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    outer = [(92, 176), (186, 102), (374, 102), (468, 176), (434, 360), (126, 360)]
    inner = [(116, 186), (196, 120), (364, 120), (444, 186), (416, 342), (144, 342)]
    core = [(136, 198), (206, 134), (354, 134), (424, 198), (398, 328), (162, 328)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=body)
    d.polygon(core, fill=dark)

    d.ellipse((186, 206, 252, 258), fill=_rgba(palette["accent"], 185))
    d.ellipse((308, 206, 374, 258), fill=_rgba(palette["accent"], 185))

    return sprite, rng.uniform(-9.0, 9.0), 1.0


def _motif_rune_circle(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    accent = _rgba(palette["accent"], 220)
    core = _rgba(palette["metal_mid"], 255)

    d.ellipse((70, 70, 550, 550), outline=outer, width=12)
    d.ellipse((118, 118, 502, 502), outline=accent, width=8)
    d.ellipse((168, 168, 452, 452), outline=outer, width=6)

    for i in range(12):
        angle = math.radians(i * 30 + rng.uniform(-5.0, 5.0))
        r0 = 222
        r1 = 258
        cx = 310
        cy = 310
        x0 = cx + math.cos(angle) * r0
        y0 = cy + math.sin(angle) * r0
        x1 = cx + math.cos(angle) * r1
        y1 = cy + math.sin(angle) * r1
        d.line((x0, y0, x1, y1), fill=outer, width=6)

    for i in range(9):
        angle = math.radians(i * 40 + 12)
        r = 190
        x = 310 + math.cos(angle) * r
        y = 310 + math.sin(angle) * r
        d.polygon(
            [(x - 12, y), (x, y - 12), (x + 12, y), (x, y + 12)],
            fill=accent,
        )

    d.ellipse((236, 236, 384, 384), fill=core, outline=outer, width=6)

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_orb(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    orb = _rgba(palette["metal_mid"], 255)
    glow = _rgba(palette["accent"], 210)
    dark = _rgba(palette["metal"], 255)

    for i in range(6):
        r = 184 + i * 12
        alpha = max(24, 110 - i * 14)
        d.ellipse((280 - r, 282 - r, 280 + r, 282 + r), fill=_rgba(palette["smoke"], alpha))

    d.ellipse((126, 128, 434, 436), fill=outer)
    d.ellipse((146, 148, 414, 416), fill=orb)
    d.ellipse((176, 178, 384, 386), fill=dark)

    d.ellipse((206, 206, 354, 354), fill=glow)
    d.ellipse((242, 244, 316, 318), fill=dark)
    d.rounded_rectangle((228, 442, 332, 482), radius=14, fill=outer)

    return sprite, rng.uniform(-4.0, 4.0), 1.0


def _motif_flame(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 238)
    fire = _rgba(palette["accent"], 220)
    dark = _rgba(palette["metal"], 255)

    outer_path = [(262, 70), (356, 212), (386, 316), (332, 456), (262, 540), (180, 450), (140, 318), (170, 218)]
    inner_path = [(262, 124), (334, 226), (350, 316), (310, 424), (258, 488), (206, 420), (174, 316), (194, 230)]
    core_path = [(262, 176), (310, 260), (316, 326), (282, 400), (258, 430), (226, 384), (216, 320), (228, 256)]

    d.polygon(outer_path, fill=outer)
    d.polygon(inner_path, fill=fire)
    d.polygon(core_path, fill=dark)

    return sprite, rng.uniform(-7.0, 7.0), 1.0


def _motif_vial(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (460, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 238)
    glass = _rgba(palette["metal_mid"], 240)
    fluid = _rgba(palette["accent"], 220)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((168, 80, 292, 158), radius=14, fill=outer)
    d.rounded_rectangle((178, 90, 282, 150), radius=10, fill=dark)

    d.polygon([(140, 154), (320, 154), (356, 478), (104, 478)], fill=outer)
    d.polygon([(156, 168), (304, 168), (332, 460), (128, 460)], fill=glass)
    d.polygon([(142, 338), (318, 338), (332, 460), (128, 460)], fill=fluid)

    d.line((168, 198, 238, 438), fill=_rgba("#ffffff", 96), width=6)

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_vehicle(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (660, 420), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((90, 182, 570, 312), radius=38, fill=outer)
    d.rounded_rectangle((108, 196, 552, 298), radius=30, fill=body)

    roof = [(178, 196), (268, 122), (412, 122), (500, 196)]
    roof_in = [(196, 196), (276, 138), (404, 138), (482, 196)]
    d.polygon(roof, fill=outer)
    d.polygon(roof_in, fill=dark)

    for cx in (214, 450):
        d.ellipse((cx - 64, 248, cx + 64, 376), fill=outer)
        d.ellipse((cx - 44, 268, cx + 44, 356), fill=dark)

    d.rounded_rectangle((290, 212, 370, 244), radius=10, fill=_rgba(palette["accent"], 180))

    return sprite, -3.0 + rng.uniform(-3.0, 3.0), 0.98


def _motif_violin(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (500, 660), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    wood = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)
    accent = _rgba(palette["accent"], 220)

    d.ellipse((132, 180, 368, 392), fill=outer)
    d.ellipse((142, 188, 358, 384), fill=wood)
    d.ellipse((158, 296, 342, 500), fill=outer)
    d.ellipse((168, 304, 332, 490), fill=wood)

    d.rounded_rectangle((224, 68, 276, 228), radius=16, fill=outer)
    d.rounded_rectangle((234, 84, 266, 220), radius=12, fill=dark)

    d.rounded_rectangle((208, 498, 292, 544), radius=14, fill=dark)
    d.line((208, 246, 292, 246), fill=accent, width=5)
    d.line((208, 272, 292, 272), fill=accent, width=5)
    for x in (232, 246, 260, 274):
        d.line((x, 90, x, 518), fill=_rgba("#d8d0bf", 190), width=2)

    return sprite, -9.0 + rng.uniform(-3.0, 3.0), 0.98


def _motif_drone(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((248, 248, 372, 372), radius=26, fill=outer)
    d.rounded_rectangle((262, 262, 358, 358), radius=20, fill=body)

    arms = [
        (190, 190, 272, 272),
        (348, 190, 430, 272),
        (190, 348, 272, 430),
        (348, 348, 430, 430),
    ]
    for x0, y0, x1, y1 in arms:
        d.rounded_rectangle((x0, y0, x1, y1), radius=22, fill=outer)
        d.rounded_rectangle((x0 + 10, y0 + 10, x1 - 10, y1 - 10), radius=16, fill=dark)

    d.line((272, 272, 248, 248), fill=outer, width=16)
    d.line((348, 272, 372, 248), fill=outer, width=16)
    d.line((272, 348, 248, 372), fill=outer, width=16)
    d.line((348, 348, 372, 372), fill=outer, width=16)

    return sprite, rng.uniform(-9.0, 9.0), 1.0


def _motif_tape(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    ring = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.ellipse((92, 92, 468, 468), fill=outer)
    d.ellipse((128, 128, 432, 432), fill=ring)
    d.ellipse((188, 188, 372, 372), fill=dark)

    d.arc((76, 76, 452, 452), start=216, end=330, fill=_rgba(palette["accent"], 220), width=18)
    d.rounded_rectangle((336, 122, 426, 176), radius=14, fill=outer)

    return sprite, -12.0 + rng.uniform(-4.0, 4.0), 1.0


def _motif_phone(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (420, 660), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((82, 62, 338, 598), radius=48, fill=outer)
    d.rounded_rectangle((98, 80, 322, 582), radius=36, fill=body)
    d.rounded_rectangle((116, 136, 304, 496), radius=24, fill=dark)

    d.rounded_rectangle((176, 102, 244, 114), radius=6, fill=_rgba("#d7ceb8", 180))
    d.ellipse((196, 522, 224, 550), fill=_rgba(palette["accent"], 180))

    return sprite, -6.0 + rng.uniform(-3.0, 3.0), 1.0


def _motif_card(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 420), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    card = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((88, 92, 532, 332), radius=28, fill=outer)
    d.rounded_rectangle((102, 106, 518, 318), radius=20, fill=card)

    d.rounded_rectangle((122, 132, 496, 178), radius=10, fill=dark)
    d.rounded_rectangle((146, 216, 254, 282), radius=10, fill=_rgba(palette["accent"], 190))
    d.rounded_rectangle((276, 220, 486, 238), radius=8, fill=dark)
    d.rounded_rectangle((276, 254, 456, 272), radius=8, fill=dark)

    return sprite, -13.0 + rng.uniform(-3.0, 3.0), 1.0


def _motif_scanner(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)
    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)
    accent = _rgba(palette["accent"], 210)

    d.rounded_rectangle((96, 72, 464, 548), radius=44, fill=outer)
    d.rounded_rectangle((112, 90, 448, 532), radius=34, fill=body)
    d.rounded_rectangle((138, 132, 422, 362), radius=24, fill=dark)

    d.ellipse((198, 188, 362, 352), fill=_rgba(palette["metal_light"], 190), outline=accent, width=6)
    d.ellipse((232, 224, 328, 320), fill=dark)

    for i in range(4):
        y = 396 + i * 32
        d.rounded_rectangle((166, y, 394, y + 16), radius=6, fill=_rgba(palette["metal_shadow"], 180))

    return sprite, rng.uniform(-5.0, 5.0), 1.0


def _motif_fist(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    return _motif_hand(palette, rng)


def _motif_crosshair(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 236)
    accent = _rgba(palette["accent"], 220)

    d.ellipse((86, 86, 474, 474), outline=outline, width=14)
    d.ellipse((170, 170, 390, 390), outline=outline, width=10)
    d.ellipse((238, 238, 322, 322), fill=_rgba(palette["metal"], 255), outline=accent, width=6)

    d.line((280, 52, 280, 178), fill=outline, width=10)
    d.line((280, 382, 280, 508), fill=outline, width=10)
    d.line((52, 280, 178, 280), fill=outline, width=10)
    d.line((382, 280, 508, 280), fill=outline, width=10)

    return sprite, rng.uniform(-4.0, 4.0), 1.0


def _motif_leaf(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 236)
    leaf = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    shape = [(126, 426), (108, 300), (166, 176), (286, 104), (390, 146), (428, 262), (398, 406), (282, 516)]
    inner = [(142, 410), (128, 304), (176, 196), (286, 126), (374, 162), (406, 264), (378, 394), (282, 492)]
    core = [(160, 392), (152, 308), (190, 218), (286, 152), (356, 178), (382, 266), (360, 382), (286, 462)]

    d.polygon(shape, fill=outline)
    d.polygon(inner, fill=leaf)
    d.polygon(core, fill=dark)

    d.line((176, 386, 340, 220), fill=_rgba(palette["accent"], 205), width=6)

    return sprite, -14.0 + rng.uniform(-4.0, 4.0), 1.0


def _motif_network(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    node = _rgba(palette["outline"], 236)
    edge = _rgba(palette["accent"], 180)
    core = _rgba(palette["metal"], 255)

    points = [(154, 198), (314, 128), (472, 214), (422, 418), (236, 466), (126, 330)]
    lines = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0), (0, 3), (1, 4)]

    for a, b in lines:
        d.line((*points[a], *points[b]), fill=edge, width=10)

    for x, y in points:
        d.ellipse((x - 36, y - 36, x + 36, y + 36), fill=node)
        d.ellipse((x - 20, y - 20, x + 20, y + 20), fill=core)

    return sprite, rng.uniform(-7.0, 7.0), 1.0


def _motif_bolt(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (460, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 238)
    bolt = _rgba(palette["accent"], 220)

    outer = [(250, 64), (138, 296), (232, 296), (184, 546), (326, 264), (232, 264)]
    inner = [(246, 104), (164, 278), (254, 278), (216, 486), (300, 284), (218, 284)]

    d.polygon(outer, fill=outline)
    d.polygon(inner, fill=bolt)

    return sprite, rng.uniform(-6.0, 6.0), 1.0


def _motif_lock(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (520, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outline = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.rounded_rectangle((106, 256, 414, 528), radius=36, fill=outline)
    d.rounded_rectangle((124, 276, 396, 510), radius=28, fill=body)
    d.rounded_rectangle((154, 306, 366, 488), radius=22, fill=dark)

    d.arc((148, 92, 372, 324), start=198, end=342, fill=outline, width=24)
    d.arc((168, 116, 352, 300), start=202, end=338, fill=_rgba(palette["metal_light"], 190), width=14)

    d.ellipse((232, 352, 288, 408), fill=_rgba(palette["accent"], 210))

    return sprite, rng.uniform(-5.0, 5.0), 1.0


def _motif_atom(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    ring = _rgba(palette["outline"], 232)
    nucleus = _rgba(palette["accent"], 220)
    dark = _rgba(palette["metal"], 255)

    d.ellipse((120, 246, 500, 374), outline=ring, width=10)
    d.ellipse((120, 246, 500, 374), outline=ring, width=10)

    orbit1 = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(orbit1)
    od.ellipse((120, 246, 500, 374), outline=ring, width=10)
    orbit1 = orbit1.rotate(60, resample=Image.Resampling.BICUBIC)
    sprite.alpha_composite(orbit1)

    orbit2 = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    od2 = ImageDraw.Draw(orbit2)
    od2.ellipse((120, 246, 500, 374), outline=ring, width=10)
    orbit2 = orbit2.rotate(-60, resample=Image.Resampling.BICUBIC)
    sprite.alpha_composite(orbit2)

    d.ellipse((254, 254, 366, 366), fill=dark)
    d.ellipse((278, 278, 342, 342), fill=nucleus)

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_bug(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (560, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    d.ellipse((176, 156, 384, 430), fill=outer)
    d.ellipse((194, 174, 366, 412), fill=body)
    d.ellipse((220, 224, 340, 396), fill=dark)

    d.ellipse((208, 94, 352, 210), fill=outer)
    d.ellipse((222, 108, 338, 196), fill=dark)

    legs = [
        (188, 230, 90, 200),
        (186, 280, 74, 280),
        (186, 332, 90, 360),
        (372, 230, 470, 200),
        (374, 280, 486, 280),
        (374, 332, 470, 360),
    ]
    for x0, y0, x1, y1 in legs:
        d.line((x0, y0, x1, y1), fill=outer, width=10)

    d.line((238, 98, 184, 44), fill=outer, width=8)
    d.line((322, 98, 376, 44), fill=outer, width=8)

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_tentacle(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    sprite = Image.new("RGBA", (620, 620), (0, 0, 0, 0))
    d = ImageDraw.Draw(sprite)

    outer = _rgba(palette["outline"], 236)
    body = _rgba(palette["metal_mid"], 255)
    dark = _rgba(palette["metal"], 255)

    for offset in (-110, -30, 40, 120):
        points = []
        for t in range(0, 9):
            y = 560 - t * 58
            x = 310 + offset + int(math.sin((t + offset / 45) * 0.75) * 58)
            points.append((x, y))

        for i in range(len(points) - 1):
            x0, y0 = points[i]
            x1, y1 = points[i + 1]
            width = max(12, 36 - i * 3)
            d.line((x0, y0, x1, y1), fill=outer, width=width)
            d.line((x0 + 2, y0 + 2, x1 + 2, y1 + 2), fill=body, width=max(8, width - 10))

        tip_x, tip_y = points[-1]
        d.ellipse((tip_x - 18, tip_y - 18, tip_x + 18, tip_y + 18), fill=dark)

    for _ in range(11):
        x = rng.randint(170, 450)
        y = rng.randint(170, 470)
        r = rng.randint(7, 14)
        d.ellipse((x - r, y - r, x + r, y + r), fill=_rgba(palette["accent"], 176))

    return sprite, rng.uniform(-8.0, 8.0), 1.0


def _motif_gadget(palette: dict[str, str], rng: random.Random) -> tuple[Image.Image, float, float]:
    return _motif_scanner(palette, rng)


MOTIF_RENDERERS = {
    "pistol": _motif_pistol,
    "rifle": _motif_rifle,
    "knife": _motif_knife,
    "baton": _motif_baton,
    "taser": _motif_taser,
    "spray": _motif_spray,
    "grenade": _motif_grenade,
    "shield": _motif_shield,
    "vest": _motif_vest,
    "document": _motif_document,
    "book": _motif_book,
    "badge": _motif_badge,
    "chip": _motif_chip,
    "wrench": _motif_wrench,
    "hand": _motif_hand,
    "eye": _motif_eye,
    "cross": _motif_cross,
    "skull": _motif_skull,
    "mask": _motif_mask,
    "rune_circle": _motif_rune_circle,
    "orb": _motif_orb,
    "flame": _motif_flame,
    "vial": _motif_vial,
    "vehicle": _motif_vehicle,
    "violin": _motif_violin,
    "drone": _motif_drone,
    "tape": _motif_tape,
    "phone": _motif_phone,
    "card": _motif_card,
    "scanner": _motif_scanner,
    "gadget": _motif_gadget,
    "fist": _motif_fist,
    "crosshair": _motif_crosshair,
    "leaf": _motif_leaf,
    "network": _motif_network,
    "bolt": _motif_bolt,
    "lock": _motif_lock,
    "atom": _motif_atom,
    "bug": _motif_bug,
    "tentacle": _motif_tentacle,
}


def _choose_motif(item_type: str, name: str, system: dict) -> str:
    lowered_name = str(name or "").strip().lower()
    if lowered_name in EXACT_NAME_MOTIFS:
        return EXACT_NAME_MOTIFS[lowered_name]

    if item_type == "skill":
        return SKILL_MOTIFS.get(lowered_name, TYPE_DEFAULT_MOTIF["skill"])

    if item_type == "enemy":
        blob = " ".join(
            [
                lowered_name,
                str(system.get("category") or "").lower(),
                str(system.get("threat") or "").lower(),
                str(system.get("npcClass") or "").lower(),
                " ".join(str(tag or "").lower() for tag in (system.get("tags") or [])),
            ]
        )
        for keyword, motif in ENEMY_MOTIFS:
            if keyword in blob:
                return motif
        npc_class = str(system.get("npcClass") or "").strip().lower()
        threat = str(system.get("threat") or "").strip().lower()
        if npc_class == "boss" or threat in {"extreme", "major"}:
            return "tentacle"
        if npc_class == "minion":
            return "mask"
        return TYPE_DEFAULT_MOTIF["enemy"]

    blob = " ".join(
        [
            lowered_name,
            str(system.get("description") or "").lower(),
            str(system.get("traits") or "").lower(),
            str(system.get("school") or "").lower(),
            str(system.get("category") or "").lower(),
        ]
    )

    if "unarmed" in blob or "strike" in blob:
        return "fist"
    if item_type == "armour":
        if "shield" in blob:
            return "shield"
        if "ward" in blob:
            return "rune_circle"
        return "vest"

    for keyword, motif in KEYWORD_MOTIFS:
        if keyword in blob:
            return motif

    return TYPE_DEFAULT_MOTIF.get(item_type, "gadget")


def _add_subject_effects(
    canvas: Image.Image,
    subject: Image.Image,
    palette: dict[str, str],
    rng: random.Random,
    motif: str,
) -> None:
    alpha = subject.split()[-1]

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_color = Image.new("RGBA", canvas.size, (0, 0, 0, 195))
    shadow_mask = alpha.filter(ImageFilter.GaussianBlur(radius=18))
    shifted_shadow = ImageChops.offset(shadow_mask, rng.randint(10, 20), rng.randint(12, 24))
    shadow.paste(shadow_color, (0, 0), shifted_shadow)
    canvas.alpha_composite(shadow)

    ring_outer = alpha.filter(ImageFilter.MaxFilter(11))
    ring = ImageChops.subtract(ring_outer, alpha)
    rim = Image.new("RGBA", canvas.size, _rgba(palette["outline"], 96))
    canvas.paste(rim, (0, 0), ring)

    canvas.alpha_composite(subject)
    lit_subject = ImageEnhance.Brightness(subject).enhance(1.42)
    canvas.alpha_composite(lit_subject)

    distress = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(distress)
    bbox = alpha.getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        width = x1 - x0
        height = y1 - y0

        for _ in range(72):
            x = rng.randint(x0, x1)
            y = rng.randint(y0, y1)
            r = rng.randint(1, 3)
            dd.ellipse((x - r, y - r, x + r, y + r), fill=_rgba(palette["metal_shadow"], rng.randint(45, 95)))

        scratches = 10 if motif in {"pistol", "rifle", "knife", "baton", "taser"} else 6
        for _ in range(scratches):
            sx = rng.randint(x0 + 10, x1 - 10)
            sy = rng.randint(y0 + 10, y1 - 10)
            ex = sx + rng.randint(-45, 45)
            ey = sy + rng.randint(-18, 18)
            dd.line((sx, sy, ex, ey), fill=_rgba(palette["accent"], rng.randint(120, 200)), width=rng.randint(2, 4))

        if motif in {"pistol", "rifle", "spray"}:
            muzzle_x = x1 + rng.randint(-10, 40)
            muzzle_y = y0 + rng.randint(10, 80)
            smoke = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            sd = ImageDraw.Draw(smoke)
            for i in range(6):
                rad = rng.randint(24, 52) + i * 8
                sd.ellipse(
                    (
                        muzzle_x + i * 8 - rad,
                        muzzle_y - i * 14 - rad,
                        muzzle_x + i * 8 + rad,
                        muzzle_y - i * 14 + rad,
                    ),
                    fill=_rgba(palette["smoke"], max(22, 110 - i * 12)),
                )
            smoke = smoke.filter(ImageFilter.GaussianBlur(radius=6.0))
            canvas.alpha_composite(smoke)

        if motif in {"rune_circle", "orb", "flame", "tentacle", "skull"}:
            aura = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
            ad = ImageDraw.Draw(aura)
            for _ in range(22):
                cx = rng.randint(x0 - 20, x1 + 20)
                cy = rng.randint(y0 - 20, y1 + 20)
                r = rng.randint(4, 10)
                ad.ellipse((cx - r, cy - r, cx + r, cy + r), fill=_rgba(palette["accent"], rng.randint(70, 140)))
            aura = aura.filter(ImageFilter.GaussianBlur(radius=2.4))
            canvas.alpha_composite(aura)

    distress = distress.filter(ImageFilter.GaussianBlur(radius=0.8))
    canvas.alpha_composite(distress)


def _render_motif(motif: str, palette: dict[str, str], rng: random.Random) -> Image.Image:
    renderer = MOTIF_RENDERERS.get(motif, _motif_gadget)
    sprite, angle, scale = renderer(palette, rng)

    subject = _base_subject_layer()
    _compose_rotated_sprite(
        subject,
        sprite,
        center=(ICON_SIZE * 0.5 + rng.uniform(-16.0, 16.0), ICON_SIZE * 0.54 + rng.uniform(-12.0, 12.0)),
        angle=angle,
        scale=scale,
    )
    return subject


def _paint_subject_texture(subject: Image.Image, palette: dict[str, str], rng: random.Random) -> None:
    alpha = subject.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        return

    x0, y0, x1, y1 = bbox
    width, height = subject.size

    texture = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(texture)

    for _ in range(110):
        cx = rng.randint(x0, x1)
        cy = rng.randint(y0, y1)
        rx = rng.randint(8, 28)
        ry = rng.randint(6, 22)
        tone = _rgba(palette["metal_shadow"], rng.randint(26, 52))
        td.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=tone)

    for _ in range(80):
        cx = rng.randint(x0, x1)
        cy = rng.randint(y0, y1)
        rx = rng.randint(8, 24)
        ry = rng.randint(6, 20)
        tone = _rgba(palette["metal_light"], rng.randint(16, 40))
        td.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=tone)

    for _ in range(32):
        sx = rng.randint(x0, x1)
        sy = rng.randint(y0, y1)
        ex = sx + rng.randint(-60, 60)
        ey = sy + rng.randint(-24, 24)
        td.line((sx, sy, ex, ey), fill=_rgba(palette["accent"], rng.randint(34, 76)), width=rng.randint(2, 3))

    texture = texture.filter(ImageFilter.GaussianBlur(radius=2.1))
    subject.paste(texture, (0, 0), alpha)

    top_grad = Image.linear_gradient("L").resize((width, height), Image.Resampling.BICUBIC).rotate(35, expand=False)
    highlight_mask = ImageChops.multiply(alpha, top_grad).point(lambda p: int(p * 0.40))
    highlight = Image.new("RGBA", subject.size, _rgba(palette["outline"], 122))
    subject.paste(highlight, (0, 0), highlight_mask)

    low_grad = ImageOps.invert(top_grad)
    shadow_mask = ImageChops.multiply(alpha, low_grad).point(lambda p: int(p * 0.35))
    shade = Image.new("RGBA", subject.size, _rgba(palette["metal_shadow"], 58))
    subject.paste(shade, (0, 0), shadow_mask)

    lift_mask = alpha.point(lambda p: int(p * 0.28))
    lift = Image.new("RGBA", subject.size, _rgba(palette["metal_light"], 56))
    subject.paste(lift, (0, 0), lift_mask)


def build_icon(name: str, item_type: str, motif: str) -> Image.Image:
    rng = _rng_for(item_type, name)
    palette = _palette_for(item_type)

    canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    _paint_background(canvas, palette, rng)

    subject = _render_motif(motif, palette, rng)
    _add_subject_effects(canvas, subject, palette, rng, motif)
    _add_global_grit(canvas, palette, rng)

    return canvas


def _save_icon(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=88, method=4)


def generate_for_file(source_path: Path, item_type: str) -> tuple[int, int]:
    data = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return 0, 0

    out_dir = ICONS_ROOT / TYPE_DIR.get(item_type, f"{item_type}s")
    out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for item in data:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if not _is_expected_record(item, item_type):
            continue

        system = item.get("system") if isinstance(item.get("system"), dict) else {}
        if item_type == "enemy":
            system = {
                **system,
                "category": item.get("category"),
                "threat": item.get("threat"),
                "npcClass": item.get("npcClass"),
                "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
            }

        motif = _choose_motif(item_type, name, system)
        image = build_icon(name, item_type, motif)

        slug = slugify(name)
        unique = hash_suffix(f"{item_type}:{name}")
        file_out = out_dir / f"{slug}-{unique}.webp"
        _save_icon(image, file_out)

        rel = file_out.relative_to(ROOT).as_posix()
        item["img"] = f"systems/laundry-rpg/{rel}"
        written += 1

    write_json(source_path, data)
    return len(data), written


def generate_type_defaults() -> None:
    defaults_dir = ICONS_ROOT / "_defaults"
    defaults_dir.mkdir(parents=True, exist_ok=True)

    defaults = [
        ("skill", "Skill", "badge"),
        ("talent", "Talent", "badge"),
        ("assignment", "Assignment", "document"),
        ("weapon", "Weapon", "pistol"),
        ("armour", "Armour", "shield"),
        ("gear", "Gear", "gadget"),
        ("spell", "Spell", "rune_circle"),
    ]

    for item_type, name, motif in defaults:
        file_out = defaults_dir / f"{item_type}.webp"
        image = build_icon(name, item_type, motif)
        _save_icon(image, file_out)


def main() -> None:
    _clear_generated_dirs()
    generate_type_defaults()
    print("wrote defaults in icons/generated/_defaults")

    total_written = 0
    for file_name, item_type in SOURCES:
        source_paths = _iter_source_paths(file_name)
        if not source_paths:
            print(f"{file_name}: source not found")
            continue

        for source_path in source_paths:
            total, written = generate_for_file(source_path, item_type)
            rel = source_path.relative_to(ROOT).as_posix()
            print(f"{rel}: updated {written}/{total} images")
            total_written += written

    print(f"done: generated/updated {total_written} item icons")


if __name__ == "__main__":
    main()
