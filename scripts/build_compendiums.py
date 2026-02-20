import re
import json
import subprocess
from pathlib import Path

ROOT = Path('/mnt/Data/laundry/laundry-rpg')
PDF_CANDIDATES = [
    ROOT / "The Laundry Roleplaying Game - Operative's Handbook.pdf",
    ROOT / "The Laundry Roleplaying Game - Operative's Handbook_compressed.pdf"
]
TXT_PATH = ROOT / 'tmp' / 'pdfs' / 'handbook.txt'

PACKS_DIR = ROOT / 'packs'
PACKS_DIR.mkdir(exist_ok=True)

SKIP_UPPER = {
    'SKILL LIST', 'SKILLS', 'FOCUS', 'TRAINING', 'TALENTS', 'REQUIREMENTS',
    'COMMON SPELLS', 'SPELLS SUMMARY', 'SPELLS', 'THE LADDER', 'ASSIGNMENT',
    'WEAPON TABLE', 'WEAPONS AND ARMOUR', 'BODY ARMOUR', 'RANGED WEAPONS',
    'MELEE WEAPONS', 'DAMAGE', 'ARMOUR', 'TRAITS', 'RANGE'
}

SKILLS_DEFAULTS = [
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


def ensure_text():
    if TXT_PATH.exists():
        return
    TXT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf_path = next((p for p in PDF_CANDIDATES if p.exists()), None)
    if pdf_path is None:
        candidates = "\n".join(str(p) for p in PDF_CANDIDATES)
        raise FileNotFoundError(f"Could not find source PDF. Looked for:\n{candidates}")
    subprocess.run([
        'pdftotext', '-layout', str(pdf_path), str(TXT_PATH)
    ], check=True)


def load_lines():
    ensure_text()
    return TXT_PATH.read_text(encoding='utf-8', errors='ignore').splitlines()


def title_case(name: str) -> str:
    return ' '.join([w.capitalize() if w.isupper() else w.capitalize() for w in name.split()])


def split_cols(line: str):
    return [c for c in re.split(r"\s{2,}", line.strip()) if c]


def unique_preserve(items):
    seen = set()
    out = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def clean_csv_list(value: str):
    parts = []
    for raw in re.split(r",", value or ""):
        cleaned = raw.strip().rstrip('*').strip()
        if cleaned:
            parts.append(cleaned)
    return unique_preserve(parts)


def extract_talents(lines):
    talents = {}
    for i, line in enumerate(lines):
        if 'REQUIREMENTS:' in line:
            req = line.split('REQUIREMENTS:', 1)[1].strip()
            if not req and i + 1 < len(lines):
                req = lines[i + 1].strip()
            name = None
            for j in range(i - 1, max(i - 6, -1), -1):
                cand = lines[j].strip()
                if not cand:
                    continue
                if cand.isupper() and cand not in SKIP_UPPER:
                    name = title_case(cand)
                    break
            if not name:
                continue
            if name in talents:
                continue

            desc = ''
            for k in range(i + 1, min(i + 6, len(lines))):
                d = lines[k].strip()
                if not d:
                    continue
                if d.isupper():
                    break
                if 'REQUIREMENTS:' in d:
                    break
                desc = d
                break

            talents[name] = {
                'requirements': req,
                'description': desc
            }
    return talents


def extract_assignments(lines):
    assignments = []
    for i, line in enumerate(lines):
        if 'Body' in line and 'Mind' in line and 'Spirit' in line:
            if not re.search(r"Body\s+Mind\s+Spirit", line):
                continue
            if i + 1 >= len(lines):
                continue
            nums = re.findall(r"\d+", lines[i + 1])
            if len(nums) != 3:
                continue

            name = None
            for j in range(i - 1, max(i - 10, -1), -1):
                cand = lines[j].strip()
                if not cand:
                    continue
                if 'DEPARTMENT' in cand.upper():
                    continue
                if cand.isupper() and cand in SKIP_UPPER:
                    continue
                if any(ch.isalpha() for ch in cand):
                    name = cand
                    break
            if not name:
                continue

            core_skill = ''
            skills_list = ''
            skill_xp = 0
            core_talent = ''
            talents = ''
            talent_choices = 0
            equipment = ''

            for k in range(i + 1, min(i + 30, len(lines))):
                l = lines[k].strip()
                if not l:
                    continue
                if l.startswith('Core Skill:'):
                    core_skill = l.split('Core Skill:', 1)[1].strip()
                else:
                    skill_match = re.match(r"Skills\s*\((\d+)\s*XP\):\s*(.*)", l)
                    talent_match = re.match(r"Talents\s*\(Choose\s*(\d+)\):\s*(.*)", l)

                    if skill_match:
                        skill_xp = int(skill_match.group(1))
                        skills_list = skill_match.group(2).strip()
                        for m in range(k + 1, min(k + 5, len(lines))):
                            ml = lines[m].strip()
                            if not ml:
                                continue
                            if any(ml.startswith(x) for x in ['Core Talent:', 'Talents (Choose', 'Equipment:']):
                                break
                            skills_list += ' ' + ml
                        continue

                    if l.startswith('Core Talent:'):
                        core_talent = l.split('Core Talent:', 1)[1].strip()
                        continue

                    if talent_match:
                        talent_choices = int(talent_match.group(1))
                        talents = talent_match.group(2).strip()
                        for m in range(k + 1, min(k + 5, len(lines))):
                            ml = lines[m].strip()
                            if not ml:
                                continue
                            if ml.startswith('Equipment:'):
                                break
                            talents += ' ' + ml
                        continue

                    if l.startswith('Talents (Choose'):
                        talents = l.split(':', 1)[1].strip()
                        for m in range(k + 1, min(k + 5, len(lines))):
                            ml = lines[m].strip()
                            if not ml:
                                continue
                            if any(ml.startswith(x) for x in ['Core Talent:', 'Talents (Choose', 'Equipment:']):
                                break
                            talents += ' ' + ml
                        continue

                    if l.startswith('Equipment:'):
                        equipment = l.split('Equipment:', 1)[1].strip()
                        break

            core_skill_list = clean_csv_list(core_skill)
            core_skill_name = core_skill_list[0] if core_skill_list else ''
            skill_options = clean_csv_list(skills_list)
            if core_skill_name:
                skill_options = [s for s in skill_options if s.casefold() != core_skill_name.casefold()]
            combined_skills = ', '.join(unique_preserve(core_skill_list + skill_options))
            talents_clean = clean_csv_list(talents)

            assignments.append({
                'name': name,
                'attributes': {
                    'body': int(nums[0]),
                    'mind': int(nums[1]),
                    'spirit': int(nums[2])
                },
                'coreSkill': core_skill_name,
                'skillOptions': ', '.join(skill_options),
                'skillXP': skill_xp,
                'talentChoices': talent_choices,
                'coreSkills': combined_skills,
                'coreTalent': core_talent,
                'talents': ', '.join(talents_clean),
                'equipment': ', '.join(clean_csv_list(equipment))
            })

    uniq = {}
    for a in assignments:
        if a['name'] not in uniq:
            uniq[a['name']] = a
    return list(uniq.values())


def extract_spell_names(lines):
    start = None
    for i, line in enumerate(lines):
        if 'SPELLS SUMMARY' in line:
            start = i
            break
    if start is None:
        return []
    names = []
    for line in lines[start+1:]:
        if 'COMMON SPELLS' in line:
            break
        s = line.strip()
        if not s or s.startswith('SPELL'):
            continue
        cols = split_cols(s)
        if not cols:
            continue
        name = cols[0].strip()
        if name and name not in names:
            names.append(name)
    return names


def extract_spells(lines):
    spell_names = extract_spell_names(lines)
    spell_entries = []

    upper_lines = [l.strip().upper() for l in lines]

    current_group = ''
    group_indices = {}
    for i, line in enumerate(lines):
        s = line.strip()
        if s.isupper() and 5 < len(s) <= 40 and 'SPELLS' not in s:
            if any(x in s for x in ['PROTECTION', 'CONTROL', 'DIVINATION', 'ENFORCEMENT', 'PERCEPTION', 'DEFENCE', 'DEFENSE']):
                current_group = title_case(s)
            group_indices[i] = current_group

    for name in spell_names:
        up = name.upper()
        try:
            idx = upper_lines.index(up)
        except ValueError:
            idx = None
        dn = 4
        complexity = 1
        casting = ''
        target = ''
        range_ = ''
        duration = ''
        school = ''
        if idx is not None:
            for gi in sorted(group_indices.keys()):
                if gi <= idx:
                    school = group_indices[gi]
                else:
                    break

            for j in range(idx, min(idx + 40, len(lines))):
                l = lines[j].strip()
                if l.startswith('DN:'):
                    dn_part = l.split('DN:', 1)[1].strip()
                    m = re.match(r"(\d+):(\w+)", dn_part)
                    if m:
                        dn = int(m.group(1))
                        comp = m.group(2)
                        if comp.isdigit():
                            complexity = int(comp)
                        else:
                            complexity = 1
                    else:
                        m = re.match(r"(\d+)", dn_part)
                        if m:
                            dn = int(m.group(1))
                elif l.startswith('Casting Time:'):
                    casting = l.split('Casting Time:', 1)[1].strip()
                elif l.startswith('Target:'):
                    target = l.split('Target:', 1)[1].strip()
                elif l.startswith('Range:'):
                    range_ = l.split('Range:', 1)[1].strip()
                elif l.startswith('Duration:'):
                    duration = l.split('Duration:', 1)[1].strip()

        spell_entries.append({
            'name': name,
            'system': {
                'level': 1,
                'dn': dn,
                'complexity': complexity,
                'castingTime': casting,
                'target': target,
                'range': range_,
                'duration': duration,
                'school': school,
                'description': ''
            }
        })

    return spell_entries


def extract_weapon_table(lines):
    start = None
    for i, line in enumerate(lines):
        if line.strip().upper() == 'WEAPON TABLE':
            start = i
            break
    if start is None:
        return []

    weapons = []
    current = None

    for line in lines[start+1:]:
        s = line.rstrip()
        if not s.strip():
            if current:
                weapons.append(current)
                current = None
            if len(weapons) > 0:
                break
            continue

        cols = split_cols(s)
        if len(cols) >= 3:
            if current:
                weapons.append(current)
            name = cols[0]
            req = cols[1]
            damage = cols[2]
            traits = cols[3] if len(cols) >= 4 else ''
            current = {
                'name': name,
                'req': req,
                'damage': damage,
                'traits': traits
            }
        else:
            if current is None:
                continue
            if s.strip().startswith('('):
                current['name'] = f"{current['name']} {s.strip()}"
            else:
                current['traits'] = (current['traits'] + ' ' + s.strip()).strip()

    if current:
        weapons.append(current)

    return weapons


def extract_armour_table(lines):
    start = None
    for i, line in enumerate(lines):
        if re.search(r"TYPE\s+REQ\.\s+PREREQ\.\s+ARMOUR", line):
            start = i
            break
    if start is None:
        return []

    armours = []
    pending_name = []

    i = start + 1
    while i < len(lines):
        s = lines[i].rstrip()
        if 'DISGUISED PISTOL' in s.upper():
            break
        if not s.strip():
            pending_name = []
            i += 1
            continue

        if re.search(r"\d+:\d", s):
            cols = split_cols(s)
            name_part = ''
            req = ''
            prereq = ''
            armour_val = ''

            if cols:
                if re.match(r"\d+:\d", cols[0]):
                    req = cols[0]
                    prereq = cols[1] if len(cols) > 1 else ''
                    armour_val = cols[2] if len(cols) > 2 else ''
                else:
                    name_part = cols[0]
                    req = cols[1] if len(cols) > 1 else ''
                    prereq = cols[2] if len(cols) > 2 else ''
                    armour_val = cols[3] if len(cols) > 3 else ''

            name_bits = pending_name[:]
            if name_part:
                name_bits.append(name_part)

            if i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                cols_next = split_cols(nxt)
                if cols_next and len(cols_next[0]) <= 20 and not re.search(r"\d", cols_next[0]):
                    if cols_next[0] not in ['REQ.', 'ARMOUR']:
                        name_bits.append(cols_next[0])
                        i += 1

            name = ' '.join([b.strip() for b in name_bits if b.strip()])

            if not armour_val:
                m = re.search(r"(\d)\s*$", s)
                if m:
                    armour_val = m.group(1)

            armours.append({
                'name': name,
                'req': req,
                'prereq': prereq,
                'armour': armour_val
            })
            pending_name = []
            i += 1
            continue

        cols = split_cols(s)
        if cols:
            first = cols[0]
            if any(ch.isalpha() for ch in first) and len(first) <= 20:
                pending_name.append(first)

        i += 1

    return armours


def extract_gear(lines, existing_names):
    gear = []
    for i, line in enumerate(lines):
        if 'REQUISITION' in line and 'DN' in line:
            req = line.strip()
            name = None
            for j in range(i - 1, max(i - 6, -1), -1):
                cand = lines[j].strip()
                if not cand:
                    continue
                if cand in SKIP_UPPER:
                    continue
                if any(ch.isalpha() for ch in cand):
                    name = title_case(cand)
                    break
            if not name:
                continue
            if name in existing_names:
                continue

            requirements = ''
            if i + 1 < len(lines) and 'REQUIREMENTS:' in lines[i + 1]:
                requirements = lines[i + 1].split('REQUIREMENTS:', 1)[1].strip()

            gear.append({
                'name': name,
                'req': req.replace('REQUISITION', 'Requisition'),
                'requirements': requirements
            })
    uniq = {}
    for g in gear:
        if g['name'] not in uniq:
            uniq[g['name']] = g
    return list(uniq.values())


def write_pack(path, items):
    lines = [json.dumps(item, ensure_ascii=True) for item in items]
    path.write_text("\n".join(lines), encoding='utf-8')


def new_id(n=16):
    import random, string
    return ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def build():
    lines = load_lines()

    talents = extract_talents(lines)
    assignments = extract_assignments(lines)
    spells = extract_spells(lines)
    weapon_table = extract_weapon_table(lines)
    armour_table = extract_armour_table(lines)

    weapon_names = {w['name'] for w in weapon_table}
    armour_names = {a['name'] for a in armour_table}
    gear = extract_gear(lines, existing_names=weapon_names | armour_names)

    # Skills pack
    skill_items = []
    for name, attr in SKILLS_DEFAULTS:
        skill_items.append({
            '_id': new_id(),
            'name': name,
            'type': 'skill',
            'img': 'icons/svg/book.svg',
            'system': {
                'attribute': attr,
                'training': 0,
                'focus': 0,
                'description': ''
            },
            'effects': [],
            'flags': {}
        })

    # Talents pack
    talent_items = []
    for name, data in talents.items():
        desc = data.get('description') or ''
        req = data.get('requirements') or ''
        talent_items.append({
            '_id': new_id(),
            'name': name,
            'type': 'talent',
            'img': 'icons/svg/aura.svg',
            'system': {
                'requirements': req,
                'description': desc
            },
            'effects': [],
            'flags': {}
        })

    # Assignments pack
    assignment_items = []
    for a in assignments:
        assignment_items.append({
            '_id': new_id(),
            'name': a['name'],
            'type': 'assignment',
            'img': 'icons/svg/mystery-man.svg',
            'system': {
                'attributes': a['attributes'],
                'coreSkills': a['coreSkills'],
                'coreTalent': a['coreTalent'],
                'talents': a['talents'],
                'equipment': a['equipment'],
                'description': ''
            },
            'effects': [],
            'flags': {}
        })

    # Spells pack
    spell_items = []
    for s in spells:
        spell_items.append({
            '_id': new_id(),
            'name': s['name'],
            'type': 'spell',
            'img': 'icons/svg/book.svg',
            'system': s['system'],
            'effects': [],
            'flags': {}
        })

    # Weapons pack
    weapon_items = []
    for w in weapon_table:
        traits = w.get('traits', '').replace('  ', ' ').strip()
        damage = w.get('damage', '').replace(' ', '')
        skill = 'Ranged' if any(t in traits for t in ['Range', 'Thrown', 'Blast', 'Spread']) else 'Close Combat'
        weapon_items.append({
            '_id': new_id(),
            'name': w['name'],
            'type': 'weapon',
            'img': 'icons/svg/sword.svg',
            'system': {
                'damage': damage,
                'range': '',
                'skill': skill,
                'traits': traits,
                'equipped': False,
                'description': f"Requisition DN: {w.get('req', '').strip()}"
            },
            'effects': [],
            'flags': {}
        })

    # Armour pack
    armour_items = []
    for a in armour_table:
        armour_items.append({
            '_id': new_id(),
            'name': a['name'],
            'type': 'armour',
            'img': 'icons/svg/shield.svg',
            'system': {
                'protection': int(a.get('armour', '0') or 0),
                'traits': a.get('prereq', ''),
                'equipped': False,
                'description': f"Requisition DN: {a.get('req', '').strip()}"
            },
            'effects': [],
            'flags': {}
        })

    # Gear pack
    gear_items = []
    for g in gear:
        desc = g.get('req', '')
        if g.get('requirements'):
            desc = f"{desc}. Requirements: {g['requirements']}"
        gear_items.append({
            '_id': new_id(),
            'name': g['name'],
            'type': 'gear',
            'img': 'icons/svg/item-bag.svg',
            'system': {
                'quantity': 1,
                'weight': 0,
                'description': desc
            },
            'effects': [],
            'flags': {}
        })

    write_pack(PACKS_DIR / 'skills.db', skill_items)
    write_pack(PACKS_DIR / 'talents.db', talent_items)
    write_pack(PACKS_DIR / 'assignments.db', assignment_items)
    write_pack(PACKS_DIR / 'spells.db', spell_items)
    write_pack(PACKS_DIR / 'weapons.db', weapon_items)
    write_pack(PACKS_DIR / 'armour.db', armour_items)
    write_pack(PACKS_DIR / 'gear.db', gear_items)

    print('Compendiums generated:',
          f"skills={len(skill_items)} talents={len(talent_items)} assignments={len(assignment_items)}",
          f"spells={len(spell_items)} weapons={len(weapon_items)} armour={len(armour_items)} gear={len(gear_items)}")


if __name__ == '__main__':
    build()
