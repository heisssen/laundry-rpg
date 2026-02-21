#!/usr/bin/env python3
import json
import hashlib
import copy
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"
EXTRACTION_ROOT = ROOT / "sources" / "extraction"
EXTRACTION_STAGES = ("reviewed", "normalized", "raw")
SOURCE_PAGE_PATTERN = re.compile(r"\bp\.?\s*(\d+(?:\s*-\s*\d+)?)\b", re.IGNORECASE)
ROMAN_PATTERN = re.compile(r"^[IVXLCDM]+$", re.IGNORECASE)

SKILLS = [
    ("Academics", "mind"),
    ("Athletics", "body"),
    ("Awareness", "mind"),
    ("Bureaucracy", "mind"),
    ("Close Combat", "body"),
    ("Computers", "mind"),
    ("Dexterity", "body"),
    ("Engineering", "mind"),
    ("Fast Talk", "spirit"),
    ("Fortitude", "body"),
    ("Intuition", "mind"),
    ("Magic", "mind"),
    ("Medicine", "mind"),
    ("Might", "body"),
    ("Occult", "mind"),
    ("Presence", "spirit"),
    ("Ranged", "body"),
    ("Reflexes", "body"),
    ("Resolve", "spirit"),
    ("Science", "mind"),
    ("Stealth", "body"),
    ("Survival", "mind"),
    ("Technology", "mind"),
    ("Zeal", "spirit"),
]

DEFAULT_ICON_BY_TYPE = {
    "skill": "systems/laundry-rpg/icons/generated/_defaults/skill.webp",
    "talent": "systems/laundry-rpg/icons/generated/_defaults/talent.webp",
    "assignment": "systems/laundry-rpg/icons/generated/_defaults/assignment.webp",
    "weapon": "systems/laundry-rpg/icons/generated/_defaults/weapon.webp",
    "armour": "systems/laundry-rpg/icons/generated/_defaults/armour.webp",
    "gear": "systems/laundry-rpg/icons/generated/_defaults/gear.webp",
    "spell": "systems/laundry-rpg/icons/generated/_defaults/spell.webp"
}

DEFAULT_CATEGORY_BY_TYPE = {
    "skill": "Core Skills",
    "talent": "Talents",
    "assignment": "Assignments",
    "weapon": "Weapons",
    "armour": "Armour",
    "gear": "Gear",
    "spell": "Spells",
}

SKILL_ATTRIBUTE_BY_NAME = {name.casefold(): attr for name, attr in SKILLS}


def _stable_id(item_type: str, name: str, size: int = 16) -> str:
    seed = f"{item_type}:{name}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:size]


def _resolve_source_path(name: str) -> Path:
    for stage in EXTRACTION_STAGES:
        candidate = EXTRACTION_ROOT / stage / name
        if candidate.exists():
            return candidate
    candidate = ROOT / name
    if candidate.exists():
        return candidate
    raise FileNotFoundError(f"Source not found: {name}")


def _extract_source_page(text: str, fallback: str = "") -> str:
    match = SOURCE_PAGE_PATTERN.search(str(text or ""))
    if match:
        return f"p.{match.group(1).replace(' ', '')}"
    return str(fallback or "").strip()


def _normalize_tags(values, fallback=None) -> list[str]:
    source_values = values if isinstance(values, list) else []
    fallback_values = fallback if isinstance(fallback, list) else []
    tags: list[str] = []
    seen: set[str] = set()
    for raw in [*source_values, *fallback_values]:
        tag = str(raw or "").strip()
        if not tag:
            continue
        key = tag.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)
    return tags


def _normalize_search_terms(values) -> list[str]:
    source_values = values if isinstance(values, list) else []
    terms: list[str] = []
    seen: set[str] = set()
    for raw in source_values:
        term = str(raw or "").strip()
        if not term:
            continue
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term)
    return terms


def _gear_icon_for_category(category: str, fallback: str) -> str:
    lowered = str(category or "").casefold()
    if "spy" in lowered:
        return fallback
    if "occult" in lowered:
        return fallback
    return fallback


def _enemy_icon(entry: dict) -> str:
    explicit = str(entry.get("img") or "").strip()
    if explicit:
        return explicit
    npc_class = str(entry.get("npcClass") or "elite").strip().lower()
    threat = str(entry.get("threat") or "minor").strip().lower()
    if npc_class == "boss" or threat in {"extreme", "major"}:
        return "icons/svg/skull.svg"
    if npc_class == "minion" and threat == "minor":
        return "icons/svg/mystery-man.svg"
    return "icons/svg/target.svg"


def _normalize_display_name(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return ""

    acronyms = {
        "NPC", "GM", "DN", "ADR", "BAU", "IT", "UK", "US", "EU",
        "MP5", "L115A3", "COWEU", "DNA", "CPU", "API"
    }

    parts = re.split(r"(\W+)", text)
    out: list[str] = []
    for token in parts:
        if not token:
            continue
        if not re.search(r"[A-Za-z]", token):
            out.append(token)
            continue
        if token.upper() in acronyms:
            out.append(token.upper())
            continue
        if any(char.isdigit() for char in token):
            out.append(token.upper())
            continue
        if ROMAN_PATTERN.fullmatch(token):
            out.append(token.upper())
            continue
        if token.isupper() and len(token) > 3:
            out.append(token.title())
            continue
        out.append(token)
    return "".join(out)


def _build_item_search_terms(item_type: str, item_name: str, system: dict) -> list[str]:
    values = [
        item_name,
        item_type,
        system.get("category"),
        system.get("sourcePage"),
        system.get("school"),
        system.get("skill"),
        system.get("range"),
    ]
    values.extend(system.get("tags", []))
    requisition = system.get("requisition") if isinstance(system.get("requisition"), dict) else {}
    values.extend([
        requisition.get("source"),
        requisition.get("sourcePage"),
    ])
    return _normalize_search_terms(values)


def _normalize_item(item: dict) -> dict:
    item_type = item["type"]
    item_name = _normalize_display_name(item["name"])
    normalized_system = _normalize_system(item_type, item.get("system", {}))
    image = str(item.get("img") or "").strip() or DEFAULT_ICON_BY_TYPE.get(
        item_type,
        "systems/laundry-rpg/icons/generated/_defaults/gear.webp"
    )
    if item_type == "gear":
        image = _gear_icon_for_category(normalized_system.get("category"), image)
    search_terms = _build_item_search_terms(item_type, item_name, normalized_system)
    source_flags = item.get("flags") if isinstance(item.get("flags"), dict) else {}
    flags = copy.deepcopy(source_flags)
    laundry_flags = flags.get("laundry-rpg") if isinstance(flags.get("laundry-rpg"), dict) else {}
    flags["laundry-rpg"] = {
        **laundry_flags,
        "category": normalized_system.get("category", DEFAULT_CATEGORY_BY_TYPE.get(item_type, item_type.title())),
        "tags": normalized_system.get("tags", []),
        "searchTerms": search_terms
    }
    out = {
        "_id": item.get("_id") or _stable_id(item_type, item_name),
        "name": item_name,
        "type": item_type,
        "img": image,
        "system": normalized_system,
        "effects": [],
        "flags": flags,
    }
    return out


def _write_jsonl(path: Path, docs: list[dict]) -> None:
    PACKS.mkdir(parents=True, exist_ok=True)
    payload = "\n".join(json.dumps(doc, ensure_ascii=False) for doc in docs) + "\n"
    path.write_text(payload, encoding="utf-8")


def _read_source(name: str) -> list[dict]:
    source_path = _resolve_source_path(name)
    with source_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_system(item_type: str, system: dict) -> dict:
    src = system if isinstance(system, dict) else {}
    out = json.loads(json.dumps(src))

    if item_type == "skill":
        out["attribute"] = str(out.get("attribute") or "mind").lower()
        if out["attribute"] not in {"body", "mind", "spirit"}:
            out["attribute"] = "mind"
        out["training"] = max(0, int(out.get("training", 0) or 0))
        out["focus"] = max(0, int(out.get("focus", 0) or 0))
        out["description"] = str(out.get("description") or "").strip()
    elif item_type == "talent":
        out["requirements"] = str(out.get("requirements") or "None").strip() or "None"
        out["description"] = str(out.get("description") or "").strip()
    elif item_type == "assignment":
        attrs = out.get("attributes", {}) if isinstance(out.get("attributes"), dict) else {}
        raw_skill_xp = out.get("skillXP", 12)
        raw_talent_choices = out.get("talentChoices", 2)
        out["attributes"] = {
            "body": int(attrs.get("body", 1) or 1),
            "mind": int(attrs.get("mind", 1) or 1),
            "spirit": int(attrs.get("spirit", 1) or 1)
        }
        out["skillXP"] = max(0, int(12 if raw_skill_xp in (None, "") else raw_skill_xp))
        out["talentChoices"] = max(0, int(2 if raw_talent_choices in (None, "") else raw_talent_choices))
        for key in ("description", "coreSkills", "coreSkill", "skillOptions", "coreTalent", "talents", "equipment"):
            out[key] = str(out.get(key) or "").strip()
    elif item_type == "weapon":
        out["description"] = str(out.get("description") or "").strip()
        out["damage"] = str(out.get("damage") or "1d6").strip()
        out["range"] = str(out.get("range") or "Close").strip()
        out["skill"] = str(out.get("skill") or "Close Combat").strip()
        out["traits"] = str(out.get("traits") or "").strip()
        out["ammo"] = max(0, int(out.get("ammo", 0) or 0))
        out["ammoMax"] = max(0, int(out.get("ammoMax", 0) or 0))
        out["areaDistance"] = max(1, int(out.get("areaDistance", 2) or 2))
        out["equipped"] = bool(out.get("equipped", False))
    elif item_type == "armour":
        out["description"] = str(out.get("description") or "").strip()
        out["protection"] = max(0, int(out.get("protection", 0) or 0))
        out["traits"] = str(out.get("traits") or "").strip()
        out["equipped"] = bool(out.get("equipped", False))
    elif item_type == "gear":
        out["description"] = str(out.get("description") or "").strip()
        out["quantity"] = max(0, int(out.get("quantity", 1) or 1))
        out["weight"] = max(0, int(out.get("weight", 0) or 0))
        requisition = out.get("requisition") if isinstance(out.get("requisition"), dict) else {}
        requisition["id"] = str(requisition.get("id") or "").strip()
        requisition["dn"] = max(2, min(6, int(requisition.get("dn", 4) or 4)))
        requisition["complexity"] = max(1, int(requisition.get("complexity", 1) or 1))
        requisition["requirements"] = str(requisition.get("requirements") or "").strip()
        requisition["source"] = str(requisition.get("source") or "").strip()
        requisition["sourcePage"] = str(requisition.get("sourcePage") or "").strip() or _extract_source_page(
            requisition["source"],
            fallback=str(out.get("sourcePage") or "")
        )
        out["requisition"] = requisition
        if requisition["sourcePage"]:
            out["sourcePage"] = requisition["sourcePage"]
    elif item_type == "spell":
        out["description"] = str(out.get("description") or "").strip()
        out["level"] = max(1, int(out.get("level", 1) or 1))
        out["castingTime"] = str(out.get("castingTime") or "").strip()
        out["dn"] = max(2, min(6, int(out.get("dn", 4) or 4)))
        out["complexity"] = max(1, int(out.get("complexity", out["level"]) or out["level"]))
        out["target"] = str(out.get("target") or "").strip()
        out["range"] = str(out.get("range") or "").strip()
        out["duration"] = str(out.get("duration") or "").strip()
        out["school"] = str(out.get("school") or "").strip()
        if not out.get("category") and out["school"]:
            out["category"] = f"Spells // {out['school']}"

    default_category = DEFAULT_CATEGORY_BY_TYPE.get(item_type, item_type.title())
    out["category"] = str(out.get("category") or default_category).strip() or default_category
    if "sourcePage" in out:
        out["sourcePage"] = str(out.get("sourcePage") or "").strip()
    tags = _normalize_tags(out.get("tags"), fallback=[item_type, out["category"]])
    out["tags"] = tags
    out["searchKeywords"] = _normalize_search_terms(out.get("searchKeywords") or [])

    return out


def _parse_csv(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        parts = value
    else:
        parts = str(value).split(",")
    return [str(part).strip() for part in parts if str(part).strip()]


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold())
    return slug.strip("-")


def _unique_preserve(values: list[str]) -> list[str]:
    out = []
    seen = set()
    for value in values:
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def _dupe_values(values: list[str]) -> list[str]:
    seen = set()
    dupes = set()
    for value in values:
        key = value.casefold()
        if key in seen:
            dupes.add(value)
            continue
        seen.add(key)
    return sorted(dupes)


def _validate_assignments(assignments: list[dict], talents: list[dict]) -> None:
    skill_names = {name for name, _ in SKILLS}
    talent_names = {item.get("name", "") for item in talents}
    errors: list[str] = []

    for assignment in assignments:
        assignment_name = assignment.get("name", "<unnamed assignment>")
        system = assignment.get("system", {})

        listed_skills = _parse_csv(system.get("coreSkills"))
        parsed_skills = _parse_csv(system.get("coreSkill")) + _parse_csv(system.get("skillOptions"))

        listed_skill_dupes = _dupe_values(listed_skills)
        if listed_skill_dupes:
            errors.append(f"{assignment_name}: duplicate skills in coreSkills: {', '.join(listed_skill_dupes)}")

        parsed_skill_dupes = _dupe_values(parsed_skills)
        if parsed_skill_dupes:
            errors.append(f"{assignment_name}: duplicate skills in coreSkill/skillOptions: {', '.join(parsed_skill_dupes)}")

        if listed_skills and parsed_skills:
            listed_set = {skill.casefold() for skill in listed_skills}
            parsed_set = {skill.casefold() for skill in parsed_skills}
            if listed_set != parsed_set:
                errors.append(f"{assignment_name}: coreSkills differs from coreSkill/skillOptions")

        all_skills = _unique_preserve(parsed_skills if parsed_skills else listed_skills)

        unknown_skills = sorted({skill for skill in all_skills if skill not in skill_names})
        if unknown_skills:
            errors.append(f"{assignment_name}: unknown skills: {', '.join(unknown_skills)}")

        listed_talents = _parse_csv(system.get("coreTalent")) + _parse_csv(system.get("talents"))
        talent_dupes = _dupe_values(listed_talents)
        if talent_dupes:
            errors.append(f"{assignment_name}: duplicate talents: {', '.join(talent_dupes)}")

        unknown_talents = sorted({talent for talent in listed_talents if talent not in talent_names})
        if unknown_talents:
            errors.append(f"{assignment_name}: unknown talents: {', '.join(unknown_talents)}")

    if errors:
        details = "\n - ".join(errors)
        raise ValueError(f"Assignment source validation failed:\n - {details}")


def build_assignments(data: list[dict] | None = None) -> list[dict]:
    if data is None:
        source = "assignments.json" if (ROOT / "assignments.json").exists() else "assigments.json"
        data = _read_source(source)
    return [_normalize_item(item) for item in data]


def build_talents(data: list[dict] | None = None) -> list[dict]:
    if data is None:
        data = _read_source("talents.json")
    return [_normalize_item(item) for item in data]


def build_weapons() -> list[dict]:
    data = _read_source("weapons.json")
    return [_normalize_item(item) for item in data]


def build_armour() -> list[dict]:
    data = _read_source("armour.json")
    return [_normalize_item(item) for item in data]


def build_skills() -> list[dict]:
    skills_path = ROOT / "skills.json"
    if skills_path.exists():
        data = _read_source("skills.json")
        return [_normalize_item(item) for item in data]

    docs = []
    for name, attribute in SKILLS:
        docs.append(
            {
                "_id": _stable_id("skill", name),
                "name": name,
                "type": "skill",
                "img": DEFAULT_ICON_BY_TYPE["skill"],
                "system": {
                    "description": "",
                    "attribute": attribute,
                    "training": 0,
                    "focus": 0,
                },
                "effects": [],
                "flags": {},
            }
        )
    return docs


def build_spells() -> list[dict]:
    try:
        _resolve_source_path("spells.json")
    except FileNotFoundError:
        return []
    data = _read_source("spells.json")
    return [_normalize_item(item) for item in data]


def build_gear() -> list[dict]:
    try:
        _resolve_source_path("gear.json")
    except FileNotFoundError:
        return []
    data = _read_source("gear.json")
    return [_normalize_item(item) for item in data]


def build_assignment_issued_gear(
    assignments: list[dict],
    existing_collections: list[list[dict]] | None = None
) -> list[dict]:
    existing_collections = existing_collections or []
    existing_names: set[str] = set()
    for collection in existing_collections:
        for item in collection:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            existing_names.add(name.casefold())

    issued_index: dict[str, dict[str, object]] = {}
    for assignment in assignments:
        assignment_name = str(assignment.get("name") or "").strip()
        system = assignment.get("system") if isinstance(assignment.get("system"), dict) else {}
        equipment_items = _parse_csv(system.get("equipment")) if isinstance(system, dict) else []

        for raw_name in equipment_items:
            key = raw_name.casefold()
            if not key:
                continue
            entry = issued_index.get(key)
            if not entry:
                entry = {
                    "name": raw_name,
                    "assignments": set()
                }
                issued_index[key] = entry
            if assignment_name:
                entry["assignments"].add(assignment_name)

    docs: list[dict] = []
    for key in sorted(issued_index.keys()):
        if key in existing_names:
            continue

        entry = issued_index[key]
        name = str(entry.get("name") or "").strip()
        if not name:
            continue

        assignment_names = sorted(str(v).strip() for v in entry.get("assignments", set()) if str(v).strip())
        preview_assignments = assignment_names[:4]
        preview_text = ", ".join(preview_assignments)
        if len(assignment_names) > 4:
            preview_text = f"{preview_text}, +{len(assignment_names) - 4} more"

        description = "Standard issue equipment granted during assignment-based character generation."
        if preview_text:
            description = f"{description} Commonly issued by: {preview_text}."

        docs.append(_normalize_item({
            "name": name,
            "type": "gear",
            "img": DEFAULT_ICON_BY_TYPE["gear"],
            "system": {
                "quantity": 1,
                "weight": 0,
                "description": description,
                "category": "Issued Equipment",
                "requisition": {
                    "id": f"issued-{_slugify(name)}",
                    "dn": 2,
                    "complexity": 1,
                    "requirements": "Laundry assignment",
                    "source": "Assignment starter equipment",
                    "sourcePage": "generated"
                },
                "tags": [
                    "gear",
                    "issued",
                    "assignment loadout",
                    "Issued Equipment"
                ],
                "searchKeywords": [name, "Issued Equipment", "assignment loadout", *assignment_names]
            }
        }))

    return docs


def _normalize_enemy_action(action: dict | None = None, enemy_name: str = "") -> dict:
    src = action if isinstance(action, dict) else {}
    kind_raw = str(src.get("kind") or "attack").strip().lower()
    kind = kind_raw if kind_raw in {"attack", "spell", "test"} else "attack"
    raw_name = str(src.get("name") or src.get("label") or src.get("title") or "").strip()
    fallback_name = {
        "attack": "Signature Attack",
        "spell": "Occult Effect",
        "test": "Pressure Test"
    }.get(kind, "Signature Action")
    resolved_name = _normalize_display_name(raw_name) or fallback_name
    if enemy_name and resolved_name == fallback_name:
        resolved_name = f"{_normalize_display_name(enemy_name)} {fallback_name}"
    return {
        "id": _stable_id("npc-action", f"{resolved_name}:{kind}", size=12),
        "name": resolved_name,
        "kind": kind,
        "pool": max(0, int(src.get("pool", 0) or 0)),
        "dn": max(2, min(6, int(src.get("dn", 4) or 4))),
        "complexity": max(1, int(src.get("complexity", 1) or 1)),
        "damage": str(src.get("damage") or "").strip(),
        "traits": str(src.get("traits") or "").strip(),
        "isMagic": bool(src.get("isMagic", False) or kind == "spell")
    }


def _parse_rolltable_range(value, fallback: int = 1) -> tuple[int, int]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        low = max(1, int(value[0] or fallback))
        high = max(low, int(value[1] or low))
        return low, high

    token = str(value or "").strip()
    if not token:
        safe = max(1, int(fallback or 1))
        return safe, safe
    if "-" in token:
        left, right = token.split("-", 1)
        low = max(1, int(left.strip() or fallback))
        high = max(low, int(right.strip() or low))
        return low, high
    if token.endswith("+"):
        low = max(1, int(token[:-1].strip() or fallback))
        return low, low
    safe = max(1, int(token))
    return safe, safe


def _build_enemy_skill_items(preset_id: str, skill_training: dict | None) -> list[dict]:
    src = skill_training if isinstance(skill_training, dict) else {}
    docs: list[dict] = []
    for skill_name, raw_training in src.items():
        name = _normalize_display_name(str(skill_name or "").strip())
        if not name:
            continue
        attribute = SKILL_ATTRIBUTE_BY_NAME.get(name.casefold(), "mind")
        docs.append({
            "_id": _stable_id("enemy-skill", f"{preset_id}:{name}"),
            "name": name,
            "type": "skill",
            "img": DEFAULT_ICON_BY_TYPE["skill"],
            "system": {
                "description": "",
                "attribute": attribute,
                "training": max(0, int(raw_training or 0)),
                "focus": 0
            },
            "effects": [],
            "flags": {}
        })
    return docs


def build_enemies() -> list[dict]:
    try:
        _resolve_source_path("enemies.json")
    except FileNotFoundError:
        return []
    data = _read_source("enemies.json")
    docs: list[dict] = []

    for entry in data:
        if not isinstance(entry, dict):
            continue
        preset_id = str(entry.get("id") or "").strip().lower()
        name = _normalize_display_name(str(entry.get("name") or "").strip())
        if not name:
            continue
        attrs = entry.get("attributes") if isinstance(entry.get("attributes"), dict) else {}
        body = max(1, int(attrs.get("body", 1) or 1))
        mind = max(1, int(attrs.get("mind", 1) or 1))
        spirit = max(1, int(attrs.get("spirit", 1) or 1))
        actions = entry.get("quickActions") if isinstance(entry.get("quickActions"), list) else []
        normalized_actions = [_normalize_enemy_action(action, enemy_name=name) for action in actions]
        if not normalized_actions:
            normalized_actions = [_normalize_enemy_action({
                "name": "Signature Attack",
                "kind": "attack",
                "pool": body,
                "dn": 4,
                "complexity": 1,
                "damage": "",
                "traits": "",
                "isMagic": False
            }, enemy_name=name)]
        source = str(entry.get("source") or "").strip()
        source_page = str(entry.get("sourcePage") or "").strip() or _extract_source_page(source, fallback="system-preset")
        category = str(entry.get("category") or "Bestiary").strip()
        tags = _normalize_tags(entry.get("tags"), fallback=[
            "enemy",
            category,
            str(entry.get("threat") or "minor").strip(),
            str(entry.get("npcClass") or "elite").strip()
        ])
        search_terms = _normalize_search_terms([
            name,
            category,
            source,
            source_page,
            *tags
        ])

        docs.append({
            "_id": _stable_id("enemy", preset_id or name),
            "name": name,
            "type": "npc",
            "img": _enemy_icon(entry),
            "system": {
                "attributes": {
                    "body": {"value": body},
                    "mind": {"value": mind},
                    "spirit": {"value": spirit}
                },
                "category": category,
                "tags": tags,
                "sourcePage": source_page,
                "kpi": [],
                "derived": {
                    "toughness": {"value": 0, "max": 0, "damage": 0},
                    "injuries": {"value": 0, "max": 0},
                    "adrenaline": {"value": 0, "max": 0},
                    "melee": {"value": 0, "label": ""},
                    "accuracy": {"value": 0, "label": ""},
                    "defence": {"value": 0, "label": ""},
                    "armour": {"value": 0},
                    "initiative": {"value": 0},
                    "naturalAwareness": {"value": 0}
                },
                "details": {
                    "assignment": "",
                    "department": "",
                    "clearance": "UNCLASSIFIED",
                    "profile": {
                        "codename": "",
                        "background": "",
                        "coverIdentity": "",
                        "shortGoal": "",
                        "longGoal": "",
                        "notableIncident": "",
                        "personalNotes": ""
                    },
                    "xp": {"value": 0, "unspent": 0}
                },
                "threat": str(entry.get("threat") or "minor"),
                "npc": {
                    "mode": str(entry.get("mode") or "lite"),
                    "class": str(entry.get("npcClass") or "elite"),
                    "mobSize": max(1, int(entry.get("mobSize", 1) or 1)),
                    "trackInjuries": bool(entry.get("trackInjuries", False)),
                    "fastDamage": bool(entry.get("fastDamage", True)),
                    "archetype": preset_id,
                    "defeated": False,
                    "quickActions": normalized_actions
                }
            },
            "items": _build_enemy_skill_items(preset_id or name, entry.get("skillTraining")),
            "effects": [],
            "folder": None,
            "sort": 0,
            "ownership": {"default": 2},
            "flags": {
                "laundry-rpg": {
                    "npcPresetId": preset_id,
                    "source": source,
                    "sourcePage": source_page,
                    "category": category,
                    "tags": tags,
                    "searchTerms": search_terms
                }
            },
            "prototypeToken": {
                "name": name,
                "actorLink": False,
                "disposition": -1,
                "displayName": 20,
                "displayBars": 20
            }
        })

    return docs


def build_servant_npcs() -> list[dict]:
    try:
        _resolve_source_path("servant-npcs.json")
    except FileNotFoundError:
        return []
    data = _read_source("servant-npcs.json")
    docs: list[dict] = []

    for entry in data:
        if not isinstance(entry, dict):
            continue

        name = _normalize_display_name(str(entry.get("name") or "").strip())
        if not name:
            continue
        npc_id = str(entry.get("id") or "").strip().lower() or _slugify(name)

        attrs = entry.get("attributes") if isinstance(entry.get("attributes"), dict) else {}
        body = max(1, int(attrs.get("body", 1) or 1))
        mind = max(1, int(attrs.get("mind", 1) or 1))
        spirit = max(1, int(attrs.get("spirit", 1) or 1))

        actions = entry.get("quickActions") if isinstance(entry.get("quickActions"), list) else []
        normalized_actions = [_normalize_enemy_action(action, enemy_name=name) for action in actions]
        if not normalized_actions:
            normalized_actions = [_normalize_enemy_action({
                "name": "Signature Attack",
                "kind": "attack",
                "pool": body,
                "dn": 4,
                "complexity": 1,
                "damage": "",
                "traits": "",
                "isMagic": False
            }, enemy_name=name)]

        source = str(entry.get("source") or "A Man of the People (2E)").strip()
        source_page = str(entry.get("sourcePage") or "").strip() or _extract_source_page(source, fallback="p.4-26")
        category = str(entry.get("category") or "Servant Cases").strip() or "Servant Cases"
        role = str(entry.get("role") or "npc").strip()
        tags = _normalize_tags(entry.get("tags"), fallback=[
            "enemy",
            "servant-case",
            category,
            role
        ])
        search_terms = _normalize_search_terms([
            name,
            category,
            role,
            source,
            source_page,
            *tags
        ])
        skill_training = entry.get("skillTraining") if isinstance(entry.get("skillTraining"), dict) else {}
        normalized_skill_training = {
            str(key).strip(): max(0, int(value or 0))
            for key, value in skill_training.items()
            if str(key).strip()
        }
        description = str(entry.get("description") or "").strip()

        docs.append({
            "_id": _stable_id("servant-npc", npc_id or name),
            "name": name,
            "type": "npc",
            "img": _enemy_icon(entry),
            "system": {
                "attributes": {
                    "body": {"value": body},
                    "mind": {"value": mind},
                    "spirit": {"value": spirit}
                },
                "category": category,
                "tags": tags,
                "sourcePage": source_page,
                "kpi": [],
                "derived": {
                    "toughness": {"value": 0, "max": 0, "damage": 0},
                    "injuries": {"value": 0, "max": 0},
                    "adrenaline": {"value": 0, "max": 0},
                    "melee": {"value": 0, "label": ""},
                    "accuracy": {"value": 0, "label": ""},
                    "defence": {"value": 0, "label": ""},
                    "armour": {"value": 0},
                    "initiative": {"value": 0},
                    "naturalAwareness": {"value": 0}
                },
                "details": {
                    "assignment": "",
                    "department": "",
                    "clearance": "UNCLASSIFIED",
                    "profile": {
                        "codename": "",
                        "background": "",
                        "coverIdentity": "",
                        "shortGoal": "",
                        "longGoal": "",
                        "notableIncident": "",
                        "personalNotes": description
                    },
                    "xp": {"value": 0, "unspent": 0}
                },
                "threat": str(entry.get("threat") or "minor"),
                "npc": {
                    "mode": str(entry.get("mode") or "lite"),
                    "class": str(entry.get("npcClass") or "elite"),
                    "mobSize": max(1, int(entry.get("mobSize", 1) or 1)),
                    "trackInjuries": bool(entry.get("trackInjuries", False)),
                    "fastDamage": bool(entry.get("fastDamage", True)),
                    "archetype": npc_id,
                    "defeated": False,
                    "quickActions": normalized_actions
                }
            },
            "items": _build_enemy_skill_items(npc_id or name, normalized_skill_training),
            "effects": [],
            "folder": None,
            "sort": 0,
            "ownership": {"default": 2},
            "flags": {
                "laundry-rpg": {
                    "npcPresetId": npc_id,
                    "source": source,
                    "sourcePage": source_page,
                    "category": category,
                    "tags": tags,
                    "searchTerms": search_terms,
                    "servantCase": "a-man-of-the-people"
                }
            },
            "prototypeToken": {
                "name": name,
                "actorLink": False,
                "disposition": -1,
                "displayName": 20,
                "displayBars": 20
            }
        })

    docs.sort(key=lambda item: (str(item.get("name", "")).casefold(), str(item.get("_id", ""))))
    return docs


def build_servant_tables() -> list[dict]:
    try:
        _resolve_source_path("servant-tables.json")
    except FileNotFoundError:
        return []

    data = _read_source("servant-tables.json")
    if not isinstance(data, list):
        return []

    docs: list[dict] = []
    for idx, entry in enumerate(data):
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        table_id = str(entry.get("id") or "").strip() or _slugify(name)
        source = str(entry.get("source") or "A Man of the People (2E)").strip()
        source_page = str(entry.get("sourcePage") or "").strip() or _extract_source_page(source, fallback="p.4-26")
        tags = _normalize_tags(entry.get("tags"), fallback=["servant-case", "table"])

        raw_results = entry.get("results") if isinstance(entry.get("results"), list) else []
        rows = []
        next_range = 1
        max_range = 1
        for result_index, raw in enumerate(raw_results):
            if isinstance(raw, dict):
                text = str(raw.get("text") or "").strip()
                if not text:
                    continue
                low, high = _parse_rolltable_range(raw.get("range"), fallback=next_range)
                weight = max(1, int(raw.get("weight", 1) or 1))
                img = str(raw.get("img") or "icons/svg/d20-grey.svg").strip() or "icons/svg/d20-grey.svg"
            else:
                text = str(raw or "").strip()
                if not text:
                    continue
                low, high = next_range, next_range
                weight = 1
                img = "icons/svg/d20-grey.svg"

            next_range = high + 1
            max_range = max(max_range, high)
            rows.append({
                "_id": _stable_id("servant-table-result", f"{table_id}:{result_index}:{text}", size=16),
                "type": 0,
                "text": text,
                "img": img,
                "weight": weight,
                "range": [low, high],
                "drawn": False,
                "documentCollection": None,
                "documentId": None,
                "flags": {}
            })

        if not rows:
            continue

        formula = str(entry.get("formula") or "").strip() or f"1d{max_range}"
        docs.append({
            "_id": _stable_id("servant-table", table_id),
            "name": name,
            "description": str(entry.get("description") or "").strip(),
            "results": rows,
            "formula": formula,
            "replacement": bool(entry.get("replacement", True)),
            "displayRoll": bool(entry.get("displayRoll", True)),
            "folder": None,
            "sort": int(entry.get("sort", idx * 1000) or idx * 1000),
            "ownership": {"default": 2},
            "flags": {
                "laundry-rpg": {
                    "source": source,
                    "sourcePage": source_page,
                    "tags": tags,
                    "servantCase": "a-man-of-the-people"
                }
            }
        })

    return docs


def build_all_items(item_collections: list[list[dict]]) -> list[dict]:
    docs: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for collection in item_collections:
        for item in collection:
            item_type = str(item.get("type") or "").strip().lower()
            item_name = str(item.get("name") or "").strip()
            if not item_type or not item_name:
                continue
            key = (item_type, item_name.casefold())
            if key in seen:
                continue
            seen.add(key)
            docs.append(copy.deepcopy(item))
    return docs


def _build_journal_from_source(source_name: str, id_prefix: str = "rule") -> list[dict]:
    path = ROOT / source_name
    if not path.exists():
        return []

    data = _read_source(source_name)
    if not isinstance(data, list):
        return []

    docs: list[dict] = []
    for idx, entry in enumerate(data):
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        content = str(entry.get("content") or "").strip()
        page_id = _stable_id(f"{id_prefix}-page", name)
        docs.append({
            "_id": _stable_id(id_prefix, name),
            "name": name,
            "pages": [
                {
                    "_id": page_id,
                    "name": name,
                    "type": "text",
                    "text": {
                        "format": 1,
                        "content": content
                    },
                    "title": {
                        "show": True,
                        "level": 1
                    },
                    "sort": 0,
                    "flags": {}
                }
            ],
            "folder": None,
            "sort": idx * 1000,
            "ownership": {"default": 2},
            "flags": {}
        })

    return docs


def build_rules_journal() -> list[dict]:
    return _build_journal_from_source("gm.json", id_prefix="rule")


def build_servant_journal() -> list[dict]:
    return _build_journal_from_source("servant.json", id_prefix="servant")


def build_macros() -> list[dict]:
    path = ROOT / "macros.json"
    if not path.exists():
        return []
    data = _read_source("macros.json")
    if not isinstance(data, list):
        return []

    docs: list[dict] = []
    for idx, entry in enumerate(data):
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        docs.append({
            "_id": str(entry.get("_id") or _stable_id("macro", name)),
            "name": name,
            "type": str(entry.get("type") or "script"),
            "scope": str(entry.get("scope") or "global"),
            "img": str(entry.get("img") or "icons/svg/dice-target.svg"),
            "command": str(entry.get("command") or "").rstrip(),
            "folder": entry.get("folder"),
            "ownership": entry.get("ownership", {"default": 2}),
            "flags": entry.get("flags", {}),
            "sort": int(entry.get("sort", idx * 1000) or 0)
        })
    return docs


def main() -> None:
    assignment_source = "assignments.json" if (ROOT / "assignments.json").exists() else "assigments.json"
    assignments_data = _read_source(assignment_source)
    talents_data = _read_source("talents.json")
    _validate_assignments(assignments_data, talents_data)

    assignments = build_assignments(assignments_data)
    talents = build_talents(talents_data)
    weapons = build_weapons()
    armour = build_armour()
    skills = build_skills()
    spells = build_spells()
    gear = build_gear()
    issued_gear = build_assignment_issued_gear(assignments, [weapons, armour, gear])
    if issued_gear:
        gear = build_all_items([gear, issued_gear])
    enemies = build_enemies()
    all_items = build_all_items([
        skills,
        talents,
        assignments,
        weapons,
        armour,
        spells,
        gear
    ])

    outputs = {
        "assignments.db": assignments,
        "talents.db": talents,
        "weapons.db": weapons,
        "armour.db": armour,
        "skills.db": skills,
        "spells.db": spells,
        "gear.db": gear,
        "all-items.db": all_items,
        "enemies.db": enemies,
        "rules.db": build_rules_journal(),
        "servant.db": build_servant_journal(),
        "servant-npcs.db": build_servant_npcs(),
        "servant-tables.db": build_servant_tables(),
        "macros.db": build_macros(),
    }

    for filename, docs in outputs.items():
        _write_jsonl(PACKS / filename, docs)
        print(f"wrote {filename}: {len(docs)}")


if __name__ == "__main__":
    main()
