#!/usr/bin/env python3
import json
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"

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
    "skill": "systems/laundry-rpg/icons/generated/_defaults/skill.svg",
    "talent": "systems/laundry-rpg/icons/generated/_defaults/talent.svg",
    "assignment": "systems/laundry-rpg/icons/generated/_defaults/assignment.svg",
    "weapon": "systems/laundry-rpg/icons/generated/_defaults/weapon.svg",
    "armour": "systems/laundry-rpg/icons/generated/_defaults/armour.svg",
    "gear": "systems/laundry-rpg/icons/generated/_defaults/gear.svg",
    "spell": "systems/laundry-rpg/icons/generated/_defaults/spell.svg"
}


def _stable_id(item_type: str, name: str, size: int = 16) -> str:
    seed = f"{item_type}:{name}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:size]


def _normalize_item(item: dict) -> dict:
    item_type = item["type"]
    item_name = item["name"]
    image = str(item.get("img") or "").strip() or DEFAULT_ICON_BY_TYPE.get(
        item_type,
        "systems/laundry-rpg/icons/generated/_defaults/gear.svg"
    )
    out = {
        "_id": item.get("_id") or _stable_id(item_type, item_name),
        "name": item_name,
        "type": item_type,
        "img": image,
        "system": _normalize_system(item_type, item.get("system", {})),
        "effects": [],
        "flags": {},
    }
    return out


def _write_jsonl(path: Path, docs: list[dict]) -> None:
    PACKS.mkdir(parents=True, exist_ok=True)
    payload = "\n".join(json.dumps(doc, ensure_ascii=False) for doc in docs) + "\n"
    path.write_text(payload, encoding="utf-8")


def _read_source(name: str) -> list[dict]:
    with (ROOT / name).open("r", encoding="utf-8") as f:
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
        out["equipped"] = bool(out.get("equipped", False))
    elif item_type == "armour":
        out["description"] = str(out.get("description") or "").strip()
        out["protection"] = max(0, int(out.get("protection", 0) or 0))
        out["traits"] = str(out.get("traits") or "").strip()
        out["equipped"] = bool(out.get("equipped", False))
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

    return out


def _parse_csv(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        parts = value
    else:
        parts = str(value).split(",")
    return [str(part).strip() for part in parts if str(part).strip()]


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
    path = ROOT / "spells.json"
    if not path.exists():
        return []
    data = _read_source("spells.json")
    return [_normalize_item(item) for item in data]


def build_rules_journal() -> list[dict]:
    path = ROOT / "gm.json"
    if not path.exists():
        return []

    data = _read_source("gm.json")
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
        page_id = _stable_id("rule-page", name)
        docs.append({
            "_id": _stable_id("rule", name),
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


def main() -> None:
    assignment_source = "assignments.json" if (ROOT / "assignments.json").exists() else "assigments.json"
    assignments_data = _read_source(assignment_source)
    talents_data = _read_source("talents.json")
    _validate_assignments(assignments_data, talents_data)

    outputs = {
        "assignments.db": build_assignments(assignments_data),
        "talents.db": build_talents(talents_data),
        "weapons.db": build_weapons(),
        "armour.db": build_armour(),
        "skills.db": build_skills(),
        "spells.db": build_spells(),
        "rules.db": build_rules_journal(),
    }

    for filename, docs in outputs.items():
        _write_jsonl(PACKS / filename, docs)
        print(f"wrote {filename}: {len(docs)}")


if __name__ == "__main__":
    main()
