#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FIX_MODE = process.argv.includes("--fix");
const EXTRACTION_ROOT = path.join(ROOT, "sources", "extraction");
const EXTRACTION_STAGES = ["reviewed", "normalized", "raw"];

const SOURCES = {
    skills: "skills.json",
    talents: "talents.json",
    assignments: "assignments.json",
    weapons: "weapons.json",
    spells: "spells.json",
    armour: "armour.json",
    gear: "gear.json",
    enemies: "enemies.json"
};

function readJson(filename) {
    const fullPath = resolveSourcePath(filename);
    const payload = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(payload);
}

function resolveSourcePath(filename) {
    for (const stage of EXTRACTION_STAGES) {
        const stagedPath = path.join(EXTRACTION_ROOT, stage, filename);
        if (fs.existsSync(stagedPath)) return stagedPath;
    }
    return path.join(ROOT, filename);
}

function writeJson(filename, value) {
    const fullPath = path.join(ROOT, filename);
    const payload = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(fullPath, payload, "utf8");
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function splitCsv(value) {
    if (!value) return [];
    return String(value)
        .split(",")
        .map(entry => entry.trim())
        .filter(Boolean);
}

function dedupe(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}

function collectDuplicateNames(entries) {
    const seen = new Set();
    const dupes = new Set();
    for (const entry of entries) {
        const name = String(entry?.name ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) dupes.add(name);
        seen.add(key);
    }
    return Array.from(dupes).sort((a, b) => a.localeCompare(b));
}

function assertArray(name, value, errors) {
    if (!Array.isArray(value)) {
        errors.push(`${name} must be an array.`);
        return [];
    }
    return value;
}

function main() {
    const errors = [];
    const warnings = [];
    let touched = false;

    const skills = assertArray("skills.json", readJson(SOURCES.skills), errors);
    const talents = assertArray("talents.json", readJson(SOURCES.talents), errors);
    const assignments = assertArray("assignments.json", readJson(SOURCES.assignments), errors);
    const weapons = assertArray("weapons.json", readJson(SOURCES.weapons), errors);
    const spells = assertArray("spells.json", readJson(SOURCES.spells), errors);
    const armour = assertArray("armour.json", readJson(SOURCES.armour), errors);
    const gear = assertArray("gear.json", readJson(SOURCES.gear), errors);
    const enemies = assertArray("enemies.json", readJson(SOURCES.enemies), errors);

    const skillNames = new Set();
    for (const skill of skills) {
        const name = String(skill?.name ?? "").trim();
        const attribute = String(skill?.system?.attribute ?? "").trim().toLowerCase();
        if (!name) errors.push("Skill with empty name detected.");
        if (!["body", "mind", "spirit"].includes(attribute)) {
            errors.push(`Skill "${name || "<unnamed>"}" has invalid attribute "${attribute}".`);
        }
        skillNames.add(name.toLowerCase());
    }

    const talentNames = new Set();
    for (const talent of talents) {
        const name = String(talent?.name ?? "").trim();
        if (!name) errors.push("Talent with empty name detected.");
        talentNames.add(name.toLowerCase());
    }

    for (const assignment of assignments) {
        const name = String(assignment?.name ?? "").trim() || "<unnamed assignment>";
        const system = assignment?.system ?? {};
        const listedSkills = dedupe([
            ...splitCsv(system.coreSkill),
            ...splitCsv(system.skillOptions),
            ...splitCsv(system.coreSkills)
        ]);
        const unknownSkills = listedSkills.filter(skillName => !skillNames.has(skillName.toLowerCase()));
        if (unknownSkills.length) {
            errors.push(`${name} has unknown skills: ${unknownSkills.join(", ")}.`);
        }

        const listedTalents = dedupe([
            ...splitCsv(system.coreTalent),
            ...splitCsv(system.talents)
        ]);
        const unknownTalents = listedTalents.filter(talentName => !talentNames.has(talentName.toLowerCase()));
        if (unknownTalents.length) {
            errors.push(`${name} has unknown talents: ${unknownTalents.join(", ")}.`);
        }
    }

    for (const weapon of weapons) {
        const name = String(weapon?.name ?? "").trim() || "<unnamed weapon>";
        const system = weapon?.system ?? {};
        const damage = String(system.damage ?? "").trim();
        if (!damage) errors.push(`Weapon "${name}" has empty damage formula.`);

        const ammo = Number(system.ammo ?? 0);
        const ammoMax = Number(system.ammoMax ?? 0);
        const areaDistance = Number(system.areaDistance ?? 2);
        const nextAmmo = Number.isFinite(ammo) ? Math.max(0, Math.trunc(ammo)) : 0;
        const nextAmmoMax = Number.isFinite(ammoMax) ? Math.max(0, Math.trunc(ammoMax)) : 0;
        const nextArea = Number.isFinite(areaDistance) ? Math.max(1, Math.trunc(areaDistance)) : 2;

        if ((nextAmmo !== ammo || nextAmmoMax !== ammoMax || nextArea !== areaDistance) && FIX_MODE) {
            weapon.system = weapon.system ?? {};
            weapon.system.ammo = nextAmmo;
            weapon.system.ammoMax = nextAmmoMax;
            weapon.system.areaDistance = nextArea;
            touched = true;
        } else if (!Number.isFinite(ammo) || !Number.isFinite(ammoMax) || !Number.isFinite(areaDistance)) {
            errors.push(`Weapon "${name}" has non-numeric ammo/area values.`);
        }
    }

    for (const spell of spells) {
        const name = String(spell?.name ?? "").trim() || "<unnamed spell>";
        const system = spell?.system ?? {};
        const dn = Number(system.dn ?? 4);
        const complexity = Number(system.complexity ?? 1);
        const nextDn = Number.isFinite(dn) ? Math.max(2, Math.min(6, Math.trunc(dn))) : 4;
        const nextComplexity = Number.isFinite(complexity) ? Math.max(1, Math.trunc(complexity)) : 1;

        if ((nextDn !== dn || nextComplexity !== complexity) && FIX_MODE) {
            spell.system = spell.system ?? {};
            spell.system.dn = nextDn;
            spell.system.complexity = nextComplexity;
            touched = true;
        } else {
            if (!Number.isFinite(dn) || dn < 2 || dn > 6) {
                errors.push(`Spell "${name}" has invalid DN ${dn}.`);
            }
            if (!Number.isFinite(complexity) || complexity < 1) {
                errors.push(`Spell "${name}" has invalid Complexity ${complexity}.`);
            }
        }
    }

    for (const piece of armour) {
        const name = String(piece?.name ?? "").trim() || "<unnamed armour>";
        const protection = Number(piece?.system?.protection ?? 0);
        if (!Number.isFinite(protection) || protection < 0) {
            errors.push(`Armour "${name}" has invalid protection value.`);
        }
    }

    for (const item of gear) {
        const name = String(item?.name ?? "").trim() || "<unnamed gear>";
        const qty = Number(item?.system?.quantity ?? 1);
        const weight = Number(item?.system?.weight ?? 0);
        const category = String(item?.system?.category ?? "").trim();
        const tags = item?.system?.tags;
        const sourcePage = String(item?.system?.requisition?.sourcePage ?? "").trim();
        if (!Number.isFinite(qty) || qty < 0) {
            errors.push(`Gear "${name}" has invalid quantity.`);
        }
        if (!Number.isFinite(weight) || weight < 0) {
            errors.push(`Gear "${name}" has invalid weight.`);
        }
        if (!category) {
            errors.push(`Gear "${name}" must define system.category.`);
        }
        if (!Array.isArray(tags) || !tags.length) {
            errors.push(`Gear "${name}" must define system.tags.`);
        }
        if (!sourcePage) {
            errors.push(`Gear "${name}" must define requisition.sourcePage.`);
        }
        if (String(item?.type ?? "").trim().toLowerCase() !== "gear") {
            errors.push(`Gear entry "${name}" must have type \"gear\".`);
        }
    }

    for (const enemy of enemies) {
        const name = String(enemy?.name ?? "").trim() || "<unnamed enemy>";
        const body = Number(enemy?.attributes?.body ?? 0);
        const mind = Number(enemy?.attributes?.mind ?? 0);
        const spirit = Number(enemy?.attributes?.spirit ?? 0);
        const sourcePage = String(enemy?.sourcePage ?? "").trim();
        const tags = enemy?.tags;
        if (!Number.isFinite(body) || body < 1 || !Number.isFinite(mind) || mind < 1 || !Number.isFinite(spirit) || spirit < 1) {
            errors.push(`Enemy "${name}" has invalid attribute values.`);
        }
        if (!Array.isArray(enemy?.quickActions)) {
            errors.push(`Enemy "${name}" must declare quickActions array.`);
        } else {
            if (!enemy.quickActions.length) {
                errors.push(`Enemy "${name}" must include at least one quickAction.`);
            }
            for (const action of enemy.quickActions) {
                const actionName = String(action?.name ?? "").trim();
                const actionKind = String(action?.kind ?? "").trim().toLowerCase();
                const loweredActionName = actionName.toLowerCase();
                if (!actionName) {
                    errors.push(`Enemy "${name}" has a quickAction without a name.`);
                }
                if (["action", "attack action", "spell action", "test action", "new action"].includes(loweredActionName)) {
                    errors.push(`Enemy "${name}" has placeholder quickAction name "${actionName}".`);
                }
                if (!["attack", "spell", "test"].includes(actionKind)) {
                    errors.push(`Enemy "${name}" has invalid quickAction kind "${actionKind}".`);
                }
            }
        }
        if (!sourcePage) {
            errors.push(`Enemy "${name}" must define sourcePage.`);
        }
        if (!Array.isArray(tags) || !tags.length) {
            errors.push(`Enemy "${name}" must define tags.`);
        }
    }

    const duplicateChecks = [
        ["skills.json", skills],
        ["talents.json", talents],
        ["assignments.json", assignments],
        ["weapons.json", weapons],
        ["spells.json", spells],
        ["armour.json", armour],
        ["gear.json", gear],
        ["enemies.json", enemies]
    ];
    for (const [filename, entries] of duplicateChecks) {
        const dupes = collectDuplicateNames(asArray(entries));
        if (dupes.length) errors.push(`${filename} has duplicate names: ${dupes.join(", ")}.`);
    }

    if (FIX_MODE && touched) {
        writeJson(SOURCES.weapons, weapons);
        writeJson(SOURCES.spells, spells);
        warnings.push("Applied normalizations to weapons.json and spells.json.");
    }

    if (warnings.length) {
        for (const warning of warnings) console.warn(`[WARN] ${warning}`);
    }

    if (errors.length) {
        console.error("Compendium QA failed:");
        for (const error of errors) console.error(` - ${error}`);
        process.exit(1);
    }

    console.log("Compendium QA passed.");
}

main();
