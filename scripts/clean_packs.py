import json
import re
from pathlib import Path

ROOT = Path('/mnt/Data/laundry/laundry-rpg')
PACKS = ROOT / 'packs'
TARGETS = ['spells.db', 'talents.db', 'gear.db']

WS_RE = re.compile(r'\s+')
REQ_RE = re.compile(r'(Requisition\s*DN\s*:\s*[^\s,;]+(?:\s*:\s*[^\s,;]+)?)', re.IGNORECASE)


def clean_text(value: str) -> str:
    if not isinstance(value, str):
        return value
    value = value.replace('\u2019', "'").replace('\u2018', "'").replace('\u2013', '-').replace('\u2014', '-')
    value = WS_RE.sub(' ', value).strip()
    value = value.replace(' ,', ',').replace(' .', '.')
    return value


def squash_requisition(desc: str) -> str:
    if not desc:
        return desc
    matches = REQ_RE.findall(desc)
    if len(matches) <= 1:
        return desc
    first = matches[0]
    desc = REQ_RE.sub('', desc)
    desc = clean_text(desc)
    if desc:
        return f"{first}. {desc}"
    return first


def clean_doc(doc: dict, pack: str) -> dict:
    doc['name'] = clean_text(doc.get('name', ''))
    system = doc.get('system', {})
    for key, val in list(system.items()):
        if isinstance(val, str):
            system[key] = clean_text(val)

    if pack in {'gear.db', 'talents.db'}:
        if 'description' in system:
            system['description'] = squash_requisition(system.get('description', ''))

    if pack == 'spells.db':
        for key in ['castingTime', 'target', 'range', 'duration', 'school', 'description']:
            if key in system:
                system[key] = clean_text(system.get(key, ''))

    doc['system'] = system
    return doc


def process(path: Path):
    lines = [ln for ln in path.read_text(encoding='utf-8').splitlines() if ln.strip()]
    cleaned = []
    for ln in lines:
        doc = json.loads(ln)
        cleaned.append(json.dumps(clean_doc(doc, path.name), ensure_ascii=False))
    path.write_text('\n'.join(cleaned) + '\n', encoding='utf-8')
    return len(lines)


def main():
    for fname in TARGETS:
        count = process(PACKS / fname)
        print(f'cleaned {fname}: {count} entries')


if __name__ == '__main__':
    main()
