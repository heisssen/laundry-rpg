#!/usr/bin/env python3
import os
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_SYSTEM = os.path.join(ROOT, "system.zip")
OUT_LOCAL = os.path.join(ROOT, "laundry-rpg.zip")
OUT_SIBLING = os.path.abspath(os.path.join(ROOT, "..", "laundry-rpg.zip"))

# Keep archive paths root-level for direct Foundry package install.
PREFIX = ""

INCLUDE = [
    "system.json",
    "manifest.json",
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


def write_archive(path):
    parent = os.path.dirname(path)
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)
    if os.path.exists(path):
        os.remove(path)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in INCLUDE:
            add_path(zf, item)
    print(f"Wrote {path}")


def main():
    # Emit both canonical release zip and local-update-friendly zips.
    outputs = []
    for candidate in (OUT_SYSTEM, OUT_LOCAL, OUT_SIBLING):
        if candidate not in outputs:
            outputs.append(candidate)

    for output in outputs:
        try:
            write_archive(output)
        except OSError as err:
            # Do not fail the build if sibling destination is not writable.
            print(f"Skipped {output}: {err}")


if __name__ == "__main__":
    main()
