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
TARGET_FILES = (
    "gear.json",
    "enemies.json",
    "servant.json",
    "servant-npcs.json",
    "servant-tables.json",
)
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


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold())
    return slug.strip("-")


def _normalize_npc_actions(values, fallback_pool: int = 1):
    actions = values if isinstance(values, list) else []
    normalized_actions = []
    for action in actions:
        if not isinstance(action, dict):
            continue
        kind = str(action.get("kind") or "attack").strip().lower()
        if kind not in {"attack", "spell", "test"}:
            kind = "attack"
        action_name = str(
            action.get("name")
            or action.get("label")
            or action.get("title")
            or ""
        ).strip()
        if not action_name:
            action_name = {
                "attack": "Signature Attack",
                "spell": "Occult Effect",
                "test": "Pressure Test"
            }.get(kind, "Signature Action")
        normalized_actions.append({
            "name": action_name,
            "kind": kind,
            "pool": max(0, int(action.get("pool", fallback_pool) or fallback_pool)),
            "dn": max(2, min(6, int(action.get("dn", 4) or 4))),
            "complexity": max(1, int(action.get("complexity", 1) or 1)),
            "damage": str(action.get("damage") or "").strip(),
            "traits": str(action.get("traits") or "").strip(),
            "isMagic": bool(action.get("isMagic", False) or kind == "spell")
        })
    if not normalized_actions:
        normalized_actions.append({
            "name": "Signature Attack",
            "kind": "attack",
            "pool": max(1, int(fallback_pool or 1)),
            "dn": 4,
            "complexity": 1,
            "damage": "",
            "traits": "",
            "isMagic": False
        })
    return normalized_actions


def _parse_table_range(value, fallback: int = 1) -> tuple[int, int]:
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


def _normalize_gear(entries):
    out = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        row = copy.deepcopy(entry)
        row["type"] = "gear"
        row["img"] = str(row.get("img") or "systems/laundry-rpg/icons/generated/_defaults/gear.webp")
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

        row["quickActions"] = _normalize_npc_actions(row.get("quickActions"), fallback_pool=row["attributes"]["body"])
        row["tags"] = _clean_tags(row.get("tags"), defaults=[
            "enemy",
            row["category"],
            row["threat"],
            row["npcClass"]
        ])

        out.append(row)

    out.sort(key=lambda item: (str(item.get("category", "")).casefold(), str(item.get("name", "")).casefold()))
    return out


def _normalize_servant(entries):
    out = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        content = str(entry.get("content") or "").strip()
        if not name or not content:
            continue
        out.append({
            "name": name,
            "content": content
        })
    return out


def _normalize_servant_npcs(entries):
    out = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        row = copy.deepcopy(entry)
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        row["name"] = name
        row["id"] = str(row.get("id") or "").strip().lower() or _slugify(name)
        row["role"] = str(row.get("role") or "npc").strip().lower()
        row["category"] = str(row.get("category") or "Servant Cases").strip()
        row["source"] = str(row.get("source") or "A Man of the People (2E)").strip()
        row["sourcePage"] = str(row.get("sourcePage") or "").strip() or _extract_source_page(
            row["source"],
            fallback="p.4-26"
        )
        row["npcClass"] = str(row.get("npcClass") or "elite").strip().lower()
        row["mode"] = str(row.get("mode") or "lite").strip().lower()
        row["threat"] = str(row.get("threat") or "minor").strip().lower()
        row["mobSize"] = max(1, int(row.get("mobSize", 1) or 1))
        row["fastDamage"] = bool(row.get("fastDamage", True))
        row["trackInjuries"] = bool(row.get("trackInjuries", False))
        row["description"] = str(row.get("description") or "").strip()
        row["img"] = str(row.get("img") or "").strip() or "icons/svg/mystery-man.svg"

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

        row["quickActions"] = _normalize_npc_actions(row.get("quickActions"), fallback_pool=row["attributes"]["body"])
        row["tags"] = _clean_tags(row.get("tags"), defaults=[
            "servant-case",
            row["category"],
            row["role"]
        ])
        out.append(row)

    out.sort(key=lambda item: (str(item.get("role", "")).casefold(), str(item.get("name", "")).casefold()))
    return out


def _normalize_servant_tables(entries):
    out = []
    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        row = copy.deepcopy(entry)
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        row["name"] = name
        row["id"] = str(row.get("id") or "").strip() or _slugify(name)
        row["description"] = str(row.get("description") or "").strip()
        row["source"] = str(row.get("source") or "A Man of the People (2E)").strip()
        row["sourcePage"] = str(row.get("sourcePage") or "").strip() or _extract_source_page(
            row["source"],
            fallback="p.4-26"
        )
        row["tags"] = _clean_tags(row.get("tags"), defaults=["servant-case", "table"])

        results = row.get("results") if isinstance(row.get("results"), list) else []
        normalized_results = []
        next_range = 1
        max_range = 1
        for raw in results:
            if isinstance(raw, dict):
                text = str(raw.get("text") or "").strip()
                if not text:
                    continue
                low, high = _parse_table_range(raw.get("range"), fallback=next_range)
                result_img = str(raw.get("img") or "icons/svg/d20-grey.svg").strip() or "icons/svg/d20-grey.svg"
                normalized_results.append({
                    "range": [low, high],
                    "text": text,
                    "weight": max(1, int(raw.get("weight", 1) or 1)),
                    "img": result_img
                })
                next_range = high + 1
                max_range = max(max_range, high)
                continue

            text = str(raw or "").strip()
            if not text:
                continue
            low, high = next_range, next_range
            normalized_results.append({
                "range": [low, high],
                "text": text,
                "weight": 1,
                "img": "icons/svg/d20-grey.svg"
            })
            next_range = high + 1
            max_range = max(max_range, high)

        if not normalized_results:
            continue
        row["results"] = normalized_results
        row["formula"] = str(row.get("formula") or "").strip() or f"1d{max_range}"
        row["replacement"] = bool(row.get("replacement", True))
        row["displayRoll"] = bool(row.get("displayRoll", True))
        row["sort"] = int(row.get("sort", idx * 1000) or idx * 1000)
        out.append(row)
    return out


def _normalize(filename: str, entries):
    if filename == "gear.json":
        return _normalize_gear(entries)
    if filename == "enemies.json":
        return _normalize_enemies(entries)
    if filename == "servant.json":
        return _normalize_servant(entries)
    if filename == "servant-npcs.json":
        return _normalize_servant_npcs(entries)
    if filename == "servant-tables.json":
        return _normalize_servant_tables(entries)
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
