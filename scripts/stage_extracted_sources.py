#!/usr/bin/env python3
import argparse
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE_ROOT = ROOT / "sources" / "extraction"
RAW_DIR = PIPELINE_ROOT / "raw"
NORMALIZED_DIR = PIPELINE_ROOT / "normalized"
REVIEWED_DIR = PIPELINE_ROOT / "reviewed"
TARGET_FILES = ("gear.json", "enemies.json")
SOURCE_PAGE_PATTERN = re.compile(r"\bp\.?\s*(\d+(?:\s*-\s*\d+)?)\b", re.IGNORECASE)


def _read_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def _extract_source_page(source: str, fallback: str = "") -> str:
    match = SOURCE_PAGE_PATTERN.search(str(source or ""))
    if match:
        return f"p.{match.group(1).replace(' ', '')}"
    return str(fallback or "").strip()


def _clean_tags(values, defaults=None):
    source = values if isinstance(values, list) else []
    default_values = defaults if isinstance(defaults, list) else []
    tags = []
    seen = set()
    for raw in [*source, *default_values]:
        value = str(raw or "").strip()
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(value)
    return tags


def _normalize_gear(entries):
    out = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        row = copy.deepcopy(entry)
        row["type"] = "gear"
        row["img"] = str(row.get("img") or "systems/laundry-rpg/icons/generated/_defaults/gear.svg")
        system = row.get("system") if isinstance(row.get("system"), dict) else {}
        row["system"] = system

        name = str(row.get("name") or "").strip() or "Unknown Gear"
        row["name"] = name
        category = str(system.get("category") or "Field Gear").strip()
        system["category"] = category

        req = system.get("requisition") if isinstance(system.get("requisition"), dict) else {}
        system["requisition"] = req
        req["id"] = str(req.get("id") or "").strip()
        req["dn"] = max(2, int(req.get("dn", 4) or 4))
        req["complexity"] = max(1, int(req.get("complexity", 1) or 1))
        req["requirements"] = str(req.get("requirements") or "").strip()
        req["source"] = str(req.get("source") or "").strip()
        req["sourcePage"] = str(req.get("sourcePage") or "").strip() or _extract_source_page(req["source"], fallback="p.unknown")

        system["quantity"] = max(0, int(system.get("quantity", 1) or 1))
        system["weight"] = max(0, int(system.get("weight", 0) or 0))
        system["description"] = str(system.get("description") or "").strip()
        system["tags"] = _clean_tags(system.get("tags"), defaults=[
            "gear",
            "requisition",
            category
        ])
        system["searchKeywords"] = _clean_tags(system.get("searchKeywords"), defaults=[
            name,
            category,
            req["sourcePage"],
            req["source"]
        ])

        out.append(row)

    out.sort(key=lambda item: (
        str(item.get("system", {}).get("category", "")).casefold(),
        str(item.get("name", "")).casefold()
    ))
    return out


def _normalize_enemies(entries):
    out = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        row = copy.deepcopy(entry)
        name = str(row.get("name") or "").strip() or "Unknown Enemy"
        row["name"] = name
        row["id"] = str(row.get("id") or "").strip().lower() or name.lower().replace(" ", "-")
        row["category"] = str(row.get("category") or "Bestiary").strip()
        row["source"] = str(row.get("source") or "").strip()
        row["sourcePage"] = str(row.get("sourcePage") or "").strip() or _extract_source_page(
            row["source"],
            fallback="system-preset"
        )
        row["npcClass"] = str(row.get("npcClass") or "elite").strip().lower()
        row["mode"] = str(row.get("mode") or "lite").strip().lower()
        row["threat"] = str(row.get("threat") or "minor").strip().lower()
        row["mobSize"] = max(1, int(row.get("mobSize", 1) or 1))
        row["fastDamage"] = bool(row.get("fastDamage", True))
        row["trackInjuries"] = bool(row.get("trackInjuries", False))

        attrs = row.get("attributes") if isinstance(row.get("attributes"), dict) else {}
        row["attributes"] = {
            "body": max(1, int(attrs.get("body", 1) or 1)),
            "mind": max(1, int(attrs.get("mind", 1) or 1)),
            "spirit": max(1, int(attrs.get("spirit", 1) or 1))
        }

        skill_training = row.get("skillTraining") if isinstance(row.get("skillTraining"), dict) else {}
        row["skillTraining"] = {
            str(key).strip(): max(0, int(value or 0))
            for key, value in skill_training.items()
            if str(key).strip()
        }

        actions = row.get("quickActions") if isinstance(row.get("quickActions"), list) else []
        normalized_actions = []
        for action in actions:
            if not isinstance(action, dict):
                continue
            normalized_actions.append({
                "name": str(action.get("name") or "Action").strip(),
                "kind": str(action.get("kind") or "attack").strip().lower(),
                "pool": max(0, int(action.get("pool", 0) or 0)),
                "dn": max(2, min(6, int(action.get("dn", 4) or 4))),
                "complexity": max(1, int(action.get("complexity", 1) or 1)),
                "damage": str(action.get("damage") or "").strip(),
                "traits": str(action.get("traits") or "").strip(),
                "isMagic": bool(action.get("isMagic", False))
            })
        row["quickActions"] = normalized_actions
        row["tags"] = _clean_tags(row.get("tags"), defaults=[
            "enemy",
            row["category"],
            row["threat"],
            row["npcClass"]
        ])

        out.append(row)

    out.sort(key=lambda item: (str(item.get("category", "")).casefold(), str(item.get("name", "")).casefold()))
    return out


def _normalize(filename: str, entries):
    if filename == "gear.json":
        return _normalize_gear(entries)
    if filename == "enemies.json":
        return _normalize_enemies(entries)
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage extracted compendium sources into raw/normalized/reviewed workflow.")
    parser.add_argument("--promote", action="store_true", help="Copy normalized payload into reviewed stage.")
    parser.add_argument("--sync-root", action="store_true", help="Overwrite root JSON files with reviewed payload.")
    args = parser.parse_args()

    for filename in TARGET_FILES:
        root_path = ROOT / filename
        if not root_path.exists():
            print(f"skip {filename}: source file not found")
            continue
        raw_entries = _read_json(root_path)
        normalized_entries = _normalize(filename, raw_entries)

        _write_json(RAW_DIR / filename, raw_entries)
        _write_json(NORMALIZED_DIR / filename, normalized_entries)

        reviewed_path = REVIEWED_DIR / filename
        if args.promote or (not reviewed_path.exists()):
            _write_json(reviewed_path, normalized_entries)
            reviewed_entries = normalized_entries
        else:
            reviewed_entries = _read_json(reviewed_path)

        if args.sync_root:
            _write_json(root_path, reviewed_entries)

        print(f"staged {filename}: raw={len(raw_entries)} normalized={len(normalized_entries)} reviewed={len(reviewed_entries)}")


if __name__ == "__main__":
    main()
