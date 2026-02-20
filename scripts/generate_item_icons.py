#!/usr/bin/env python3
"""
Generate Laundry-themed, system-local SVG icons for item sources and write image
paths back to JSON files.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ICONS_ROOT = ROOT / "icons" / "generated"

SOURCES = [
    ("skills.json", "skill"),
    ("talents.json", "talent"),
    ("spells.json", "spell"),
    ("weapons.json", "weapon"),
    ("armour.json", "armour"),
    ("assignments.json", "assignment"),
]

# Dossier / Laundry palette: muted steel + paper + red-stamp accents.
TYPE_COLORS = {
    "skill": ("#283744", "#4e6678"),
    "talent": ("#452f32", "#7a4a4f"),
    "spell": ("#2b3b34", "#5f7566"),
    "weapon": ("#46392c", "#745d42"),
    "armour": ("#31363e", "#5e6671"),
    "assignment": ("#4b4336", "#7a6651"),
    "gear": ("#3c3c3c", "#676767"),
}

STAMP_RED = ["#7a1f22", "#8a2b2f", "#6f2023", "#9a3135"]
PAPER_TONE = ["#e8dfcc", "#e2d8c3", "#ddd2bc", "#d6ccb5"]

TYPE_DEFAULT_SYMBOL = {
    "skill": "book",
    "talent": "star",
    "spell": "rune",
    "weapon": "sword",
    "armour": "shield",
    "assignment": "document",
    "gear": "gear",
}

SKILL_SYMBOL = {
    "academics": "book",
    "athletics": "arrow",
    "awareness": "eye",
    "bureaucracy": "document",
    "close combat": "sword",
    "computers": "chip",
    "dexterity": "hand",
    "engineering": "wrench",
    "fast talk": "handshake",
    "fortitude": "shield",
    "intuition": "orb",
    "magic": "rune",
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

KEYWORD_SYMBOLS = [
    ("ward", "shield"),
    ("geas", "rune"),
    ("binding", "lock"),
    ("banish", "flame"),
    ("detect", "eye"),
    ("projection", "orb"),
    ("gateway", "spiral"),
    ("psychometry", "orb"),
    ("truth", "badge"),
    ("glamour", "mask"),
    ("temperature", "flame"),
    ("energy", "bolt"),
    ("curse", "skull"),
    ("silence", "lock"),
    ("magic", "rune"),
    ("knife", "sword"),
    ("baton", "fist"),
    ("strike", "fist"),
    ("glock", "crosshair"),
    ("taser", "bolt"),
    ("spray", "vial"),
    ("mp5", "crosshair"),
    ("shotgun", "crosshair"),
    ("rifle", "crosshair"),
    ("grenade", "burst"),
    ("kevlar", "shield"),
    ("shield", "shield"),
    ("warded", "rune"),
    ("cop", "badge"),
    ("doctor", "cross"),
    ("engineer", "wrench"),
    ("hacker", "chip"),
    ("friend", "handshake"),
    ("sniper", "crosshair"),
    ("field", "compass"),
]


def _stable_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def slugify(text: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return base or "item"


def hash_suffix(text: str, size: int = 6) -> str:
    return _stable_hash(text)[:size]


def escape_xml(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _paper_for(item_type: str, name: str) -> str:
    digest = _stable_hash(f"paper:{item_type}:{name}")
    idx = int(digest[:2], 16) % len(PAPER_TONE)
    return PAPER_TONE[idx]


def _stamp_for(item_type: str, name: str) -> str:
    digest = _stable_hash(f"stamp:{item_type}:{name}")
    idx = int(digest[:2], 16) % len(STAMP_RED)
    return STAMP_RED[idx]


def _choose_symbol(item_type: str, name: str, system: dict) -> str:
    lowered_name = str(name or "").strip().lower()
    if item_type == "skill":
        return SKILL_SYMBOL.get(lowered_name, TYPE_DEFAULT_SYMBOL["skill"])

    blob = " ".join(
        [
            lowered_name,
            str(system.get("description") or "").lower(),
            str(system.get("traits") or "").lower(),
            str(system.get("school") or "").lower(),
        ]
    )
    for keyword, symbol in KEYWORD_SYMBOLS:
        if keyword in blob:
            return symbol
    return TYPE_DEFAULT_SYMBOL.get(item_type, "gear")


def _symbol_svg(symbol: str, ink: str, fill: str) -> str:
    if symbol == "book":
        return (
            f'<rect x="68" y="78" width="120" height="100" rx="10" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<line x1="128" y1="82" x2="128" y2="174" stroke="{ink}" stroke-width="8" />'
            f'<line x1="80" y1="105" x2="116" y2="105" stroke="{ink}" stroke-width="5" opacity="0.75" />'
            f'<line x1="140" y1="105" x2="176" y2="105" stroke="{ink}" stroke-width="5" opacity="0.75" />'
        )
    if symbol == "eye":
        return (
            f'<path d="M52 128 C76 88 180 88 204 128 C180 168 76 168 52 128 Z" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="128" cy="128" r="26" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="128" cy="128" r="10" fill="{fill}" />'
        )
    if symbol == "document":
        return (
            f'<rect x="76" y="62" width="104" height="132" rx="10" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<line x1="94" y1="104" x2="162" y2="104" stroke="{ink}" stroke-width="7" />'
            f'<line x1="94" y1="126" x2="162" y2="126" stroke="{ink}" stroke-width="7" />'
            f'<line x1="94" y1="148" x2="150" y2="148" stroke="{ink}" stroke-width="7" />'
        )
    if symbol == "sword":
        return (
            f'<path d="M128 52 L148 86 L140 94 L160 164 L128 196 L96 164 L116 94 L108 86 Z" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<rect x="100" y="166" width="56" height="10" rx="4" fill="{ink}" />'
            f'<rect x="122" y="176" width="12" height="24" rx="4" fill="{ink}" />'
        )
    if symbol == "chip":
        pins = "".join(
            [
                f'<line x1="{70 + i*16}" y1="64" x2="{70 + i*16}" y2="48" stroke="{ink}" stroke-width="6" />'
                f'<line x1="{70 + i*16}" y1="208" x2="{70 + i*16}" y2="192" stroke="{ink}" stroke-width="6" />'
                for i in range(8)
            ]
        )
        pins += "".join(
            [
                f'<line x1="64" y1="{70 + i*16}" x2="48" y2="{70 + i*16}" stroke="{ink}" stroke-width="6" />'
                f'<line x1="208" y1="{70 + i*16}" x2="192" y2="{70 + i*16}" stroke="{ink}" stroke-width="6" />'
                for i in range(8)
            ]
        )
        return (
            f'<rect x="64" y="64" width="128" height="128" rx="12" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<rect x="96" y="96" width="64" height="64" rx="6" fill="none" stroke="{ink}" stroke-width="8" />'
            + pins
        )
    if symbol == "hand":
        return (
            f'<rect x="98" y="100" width="60" height="74" rx="16" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<rect x="88" y="84" width="12" height="54" rx="6" fill="{ink}" />'
            f'<rect x="106" y="74" width="12" height="54" rx="6" fill="{ink}" />'
            f'<rect x="124" y="70" width="12" height="54" rx="6" fill="{ink}" />'
            f'<rect x="142" y="76" width="12" height="54" rx="6" fill="{ink}" />'
            f'<rect x="160" y="92" width="12" height="54" rx="6" fill="{ink}" />'
        )
    if symbol == "wrench":
        return (
            f'<circle cx="166" cy="88" r="24" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<rect x="80" y="120" width="94" height="22" rx="11" transform="rotate(-35 127 131)" fill="{ink}" />'
            f'<circle cx="90" cy="172" r="16" fill="none" stroke="{ink}" stroke-width="8" />'
        )
    if symbol == "handshake":
        return (
            f'<path d="M60 138 L96 110 L126 128 L102 154 Z" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<path d="M196 138 L160 110 L130 128 L154 154 Z" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<rect x="106" y="122" width="44" height="20" rx="8" fill="{ink}" />'
        )
    if symbol == "shield":
        return f'<path d="M128 54 L186 76 L176 144 Q164 188 128 208 Q92 188 80 144 L70 76 Z" fill="none" stroke="{ink}" stroke-width="10" />'
    if symbol == "orb":
        return (
            f'<circle cx="128" cy="118" r="54" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<path d="M88 174 Q128 138 168 174" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="110" cy="100" r="10" fill="{fill}" opacity="0.9" />'
        )
    if symbol == "rune":
        return (
            f'<path d="M84 180 L128 72 L172 180" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<line x1="102" y1="138" x2="154" y2="138" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="128" cy="96" r="9" fill="{fill}" />'
        )
    if symbol == "cross":
        return (
            f'<rect x="114" y="76" width="28" height="104" rx="6" fill="{ink}" />'
            f'<rect x="76" y="114" width="104" height="28" rx="6" fill="{ink}" />'
        )
    if symbol == "fist":
        return (
            f'<rect x="88" y="108" width="80" height="60" rx="16" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<rect x="86" y="88" width="18" height="26" rx="6" fill="{ink}" />'
            f'<rect x="106" y="84" width="18" height="30" rx="6" fill="{ink}" />'
            f'<rect x="126" y="84" width="18" height="30" rx="6" fill="{ink}" />'
            f'<rect x="146" y="88" width="18" height="26" rx="6" fill="{ink}" />'
        )
    if symbol == "skull":
        return (
            f'<circle cx="128" cy="110" r="48" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="110" cy="108" r="10" fill="{ink}" />'
            f'<circle cx="146" cy="108" r="10" fill="{ink}" />'
            f'<rect x="106" y="148" width="44" height="24" rx="6" fill="none" stroke="{ink}" stroke-width="8" />'
        )
    if symbol == "badge":
        return (
            f'<path d="M128 64 L146 102 L188 108 L156 136 L164 178 L128 158 L92 178 L100 136 L68 108 L110 102 Z" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<circle cx="128" cy="122" r="12" fill="{fill}" />'
        )
    if symbol == "crosshair":
        return (
            f'<circle cx="128" cy="128" r="56" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="128" cy="128" r="18" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<line x1="128" y1="58" x2="128" y2="86" stroke="{ink}" stroke-width="8" />'
            f'<line x1="128" y1="170" x2="128" y2="198" stroke="{ink}" stroke-width="8" />'
            f'<line x1="58" y1="128" x2="86" y2="128" stroke="{ink}" stroke-width="8" />'
            f'<line x1="170" y1="128" x2="198" y2="128" stroke="{ink}" stroke-width="8" />'
        )
    if symbol == "bolt":
        return f'<path d="M140 54 L86 140 H124 L112 202 L170 114 H132 Z" fill="{ink}" />'
    if symbol == "lock":
        return (
            f'<rect x="78" y="112" width="100" height="84" rx="12" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<path d="M96 112 V92 C96 74 110 60 128 60 C146 60 160 74 160 92 V112" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<circle cx="128" cy="146" r="10" fill="{ink}" />'
        )
    if symbol == "atom":
        return (
            f'<ellipse cx="128" cy="128" rx="58" ry="22" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<ellipse cx="128" cy="128" rx="58" ry="22" transform="rotate(60 128 128)" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<ellipse cx="128" cy="128" rx="58" ry="22" transform="rotate(-60 128 128)" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<circle cx="128" cy="128" r="9" fill="{fill}" />'
        )
    if symbol == "mask":
        return (
            f'<path d="M72 100 Q128 70 184 100 Q176 164 128 188 Q80 164 72 100 Z" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<ellipse cx="108" cy="122" rx="14" ry="9" fill="{ink}" />'
            f'<ellipse cx="148" cy="122" rx="14" ry="9" fill="{ink}" />'
        )
    if symbol == "leaf":
        return (
            f'<path d="M72 160 C84 86 180 72 190 136 C178 210 86 212 72 160 Z" fill="none" stroke="{ink}" stroke-width="10" />'
            f'<path d="M88 170 C110 150 134 130 172 102" fill="none" stroke="{ink}" stroke-width="8" />'
        )
    if symbol == "network":
        return (
            f'<line x1="88" y1="96" x2="168" y2="84" stroke="{ink}" stroke-width="8" />'
            f'<line x1="88" y1="96" x2="112" y2="168" stroke="{ink}" stroke-width="8" />'
            f'<line x1="168" y1="84" x2="160" y2="164" stroke="{ink}" stroke-width="8" />'
            f'<line x1="112" y1="168" x2="160" y2="164" stroke="{ink}" stroke-width="8" />'
            f'<circle cx="88" cy="96" r="10" fill="{fill}" />'
            f'<circle cx="168" cy="84" r="10" fill="{fill}" />'
            f'<circle cx="112" cy="168" r="10" fill="{fill}" />'
            f'<circle cx="160" cy="164" r="10" fill="{fill}" />'
        )
    if symbol == "flame":
        return f'<path d="M130 58 C158 96 174 118 170 146 C166 182 144 202 118 198 C90 194 74 168 78 142 C82 120 98 102 124 82 C120 100 126 114 138 124 C136 102 136 80 130 58 Z" fill="none" stroke="{ink}" stroke-width="8" />'
    if symbol == "vial":
        return (
            f'<rect x="110" y="62" width="36" height="30" rx="6" fill="{ink}" />'
            f'<path d="M108 92 H148 V126 L164 168 Q168 184 152 190 H104 Q88 184 92 168 L108 126 Z" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<path d="M104 154 H152" stroke="{fill}" stroke-width="8" opacity="0.9" />'
        )
    if symbol == "spiral":
        return f'<path d="M128 84 C154 84 170 100 170 122 C170 152 146 170 120 170 C94 170 76 152 76 128 C76 102 96 84 124 84 C146 84 158 98 158 116 C158 138 140 150 124 150 C108 150 98 138 98 126 C98 112 108 102 122 102" fill="none" stroke="{ink}" stroke-width="8" />'
    if symbol == "burst":
        return f'<path d="M128 70 L140 108 L180 96 L154 126 L188 144 L146 148 L152 188 L128 160 L104 188 L110 148 L68 144 L102 126 L76 96 L116 108 Z" fill="none" stroke="{ink}" stroke-width="8" />'
    if symbol == "compass":
        return (
            f'<circle cx="128" cy="128" r="60" fill="none" stroke="{ink}" stroke-width="8" />'
            f'<path d="M150 94 L138 138 L106 150 L118 106 Z" fill="{ink}" />'
            f'<circle cx="128" cy="128" r="8" fill="{fill}" />'
        )
    if symbol == "gear":
        parts = []
        for angle in range(0, 360, 45):
            parts.append(
                f'<rect x="121" y="52" width="14" height="30" rx="4" fill="{ink}" transform="rotate({angle} 128 128)" />'
            )
        parts.append(f'<circle cx="128" cy="128" r="52" fill="none" stroke="{ink}" stroke-width="10" />')
        parts.append(f'<circle cx="128" cy="128" r="18" fill="none" stroke="{ink}" stroke-width="10" />')
        return "".join(parts)
    if symbol == "arrow":
        return (
            f'<path d="M80 168 L176 88" stroke="{ink}" stroke-width="12" stroke-linecap="round" />'
            f'<path d="M150 88 H176 V114" fill="none" stroke="{ink}" stroke-width="12" stroke-linecap="round" />'
            f'<path d="M80 168 H112 V136" fill="none" stroke="{ink}" stroke-width="12" stroke-linecap="round" />'
        )
    if symbol == "star":
        return f'<path d="M128 68 L144 108 L188 108 L152 134 L166 176 L128 150 L90 176 L104 134 L68 108 L112 108 Z" fill="none" stroke="{ink}" stroke-width="8" />'

    return f'<circle cx="128" cy="128" r="48" fill="none" stroke="{ink}" stroke-width="10" />'


def build_svg(name: str, item_type: str, symbol: str) -> str:
    left, right = TYPE_COLORS.get(item_type, ("#2f2f2f", "#666f6f"))
    paper = _paper_for(item_type, name)
    stamp = _stamp_for(item_type, name)
    label = escape_xml(name)

    symbol_markup = _symbol_svg(symbol, ink="#1f1d1a", fill=stamp)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="{label}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{left}" />
      <stop offset="100%" stop-color="{right}" />
    </linearGradient>
    <pattern id="crosshatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#ffffff" stroke-opacity="0.06" stroke-width="2" />
    </pattern>
    <radialGradient id="paperFade" cx="50%" cy="45%" r="58%">
      <stop offset="0%" stop-color="{paper}" stop-opacity="0.94" />
      <stop offset="100%" stop-color="{paper}" stop-opacity="0.38" />
    </radialGradient>
  </defs>

  <rect x="8" y="8" width="240" height="240" rx="24" fill="url(#bg)" stroke="#111" stroke-opacity="0.55" stroke-width="4" />
  <rect x="8" y="8" width="240" height="240" rx="24" fill="url(#crosshatch)" />

  <circle cx="128" cy="128" r="90" fill="url(#paperFade)" />
  <circle cx="128" cy="128" r="82" fill="none" stroke="{stamp}" stroke-width="10" stroke-opacity="0.85" />
  <circle cx="128" cy="128" r="72" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="2" />

  <path d="M128 82 L140 110 L170 112 L146 130 L154 160 L128 146 L102 160 L110 130 L86 112 L116 110 Z" fill="none" stroke="#000" stroke-opacity="0.10" stroke-width="4" />

  {symbol_markup}

  <circle cx="196" cy="58" r="18" fill="{stamp}" fill-opacity="0.22" stroke="{stamp}" stroke-width="2" />
  <line x1="186" y1="58" x2="206" y2="58" stroke="{stamp}" stroke-width="2" />
  <line x1="196" y1="48" x2="196" y2="68" stroke="{stamp}" stroke-width="2" />

  <rect x="14" y="14" width="228" height="228" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.20" stroke-width="2" />
</svg>
"""


def write_json(path: Path, payload: list[dict]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def generate_for_file(file_name: str, item_type: str) -> tuple[int, int]:
    source_path = ROOT / file_name
    if not source_path.exists():
        return 0, 0

    data = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return 0, 0

    out_dir = ICONS_ROOT / f"{item_type}s"
    out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if str(item.get("type") or "").strip() != item_type:
            continue

        system = item.get("system") if isinstance(item.get("system"), dict) else {}
        symbol = _choose_symbol(item_type, name, system)
        slug = slugify(name)
        unique = hash_suffix(f"{item_type}:{name}")
        file_out = out_dir / f"{slug}-{unique}.svg"
        file_out.write_text(build_svg(name, item_type, symbol), encoding="utf-8")

        rel = file_out.relative_to(ROOT).as_posix()
        item["img"] = f"systems/laundry-rpg/{rel}"
        written += 1

    write_json(source_path, data)
    return len(data), written


def generate_type_defaults() -> None:
    defaults_dir = ICONS_ROOT / "_defaults"
    defaults_dir.mkdir(parents=True, exist_ok=True)

    default_types = ["skill", "talent", "assignment", "weapon", "armour", "gear", "spell"]
    for item_type in default_types:
        file_out = defaults_dir / f"{item_type}.svg"
        symbol = TYPE_DEFAULT_SYMBOL.get(item_type, "gear")
        file_out.write_text(build_svg(item_type.capitalize(), item_type, symbol), encoding="utf-8")


def main() -> None:
    total_written = 0
    generate_type_defaults()
    print("wrote defaults in icons/generated/_defaults")

    for file_name, item_type in SOURCES:
        total, written = generate_for_file(file_name, item_type)
        print(f"{file_name}: updated {written}/{total} images")
        total_written += written

    print(f"done: generated/updated {total_written} item icons")


if __name__ == "__main__":
    main()
