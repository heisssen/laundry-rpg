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


def _stable_id(item_type: str, name: str, size: int = 16) -> str:
    seed = f"{item_type}:{name}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:size]


def _normalize_item(item: dict) -> dict:
    item_type = item["type"]
    item_name = item["name"]
    out = {
        "_id": item.get("_id") or _stable_id(item_type, item_name),
        "name": item_name,
        "type": item_type,
        "img": item.get("img", "icons/svg/item-bag.svg"),
        "system": item.get("system", {}),
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
    docs = []
    for name, attribute in SKILLS:
        docs.append(
            {
                "_id": _stable_id("skill", name),
                "name": name,
                "type": "skill",
                "img": "icons/svg/book.svg",
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
    }

    for filename, docs in outputs.items():
        _write_jsonl(PACKS / filename, docs)
        print(f"wrote {filename}: {len(docs)}")


if __name__ == "__main__":
    main()
