#!/usr/bin/env python3
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "system.zip")

# Set to "" for root-level system.json, or "laundry-rpg" for one-folder-deep.
PREFIX = "laundry-rpg"

INCLUDE = [
    "system.json",
    "template.json",
    "module",
    "templates",
    "styles",
    "lang",
    "packs"
]

EXCLUDE_EXTS = {".pdf", ".bak"}


def should_include(path):
    _, ext = os.path.splitext(path)
    return ext.lower() not in EXCLUDE_EXTS


def add_path(zf, path):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return
    if os.path.isdir(full):
        for root, _, files in os.walk(full):
            for name in files:
                file_full = os.path.join(root, name)
                if not should_include(file_full):
                    continue
                rel = os.path.relpath(file_full, ROOT)
                arc = os.path.join(PREFIX, rel) if PREFIX else rel
                zf.write(file_full, arc)
    else:
        if not should_include(full):
            return
        rel = os.path.relpath(full, ROOT)
        arc = os.path.join(PREFIX, rel) if PREFIX else rel
        zf.write(full, arc)


def main():
    if os.path.exists(OUT):
        os.remove(OUT)

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in INCLUDE:
            add_path(zf, item)

    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
