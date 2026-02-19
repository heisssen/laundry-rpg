#!/usr/bin/env python3
import json
import secrets
import string
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "packs"

ID_ALPHABET = string.ascii_lowercase + string.digits

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


def _new_id(size: int = 16) -> str:
    return "".join(secrets.choice(ID_ALPHABET) for _ in range(size))


def _normalize_item(item: dict) -> dict:
    out = {
        "_id": _new_id(),
        "name": item["name"],
        "type": item["type"],
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


def build_assignments() -> list[dict]:
    source = "assignments.json" if (ROOT / "assignments.json").exists() else "assigments.json"
    data = _read_source(source)
    return [_normalize_item(item) for item in data]


def build_talents() -> list[dict]:
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
                "_id": _new_id(),
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
    outputs = {
        "assignments.db": build_assignments(),
        "talents.db": build_talents(),
        "weapons.db": build_weapons(),
        "armour.db": build_armour(),
        "skills.db": build_skills(),
    }

    for filename, docs in outputs.items():
        _write_jsonl(PACKS / filename, docs)
        print(f"wrote {filename}: {len(docs)}")


if __name__ == "__main__":
    main()
