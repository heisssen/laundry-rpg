const DEFAULT_SKILLS = [
    "Academics",
    "Athletics",
    "Awareness",
    "Bureaucracy",
    "Close Combat",
    "Computers",
    "Dexterity",
    "Engineering",
    "Fast Talk",
    "Fortitude",
    "Intuition",
    "Magic",
    "Medicine",
    "Might",
    "Occult",
    "Presence",
    "Ranged",
    "Reflexes",
    "Resolve",
    "Science",
    "Stealth",
    "Survival",
    "Technology",
    "Zeal"
];

const ATTRIBUTE_LABELS = {
    body: "Body",
    mind: "Mind",
    spirit: "Spirit"
};

export function evaluateTalentPrerequisites(actor, talentLike) {
    const requirementText = _normalizeText(_getRequirementText(talentLike));
    if (!requirementText || requirementText.toLowerCase() === "none") {
        return {
            requirementText: requirementText || "None",
            status: "met",
            enforceMet: true,
            unmet: [],
            manual: [],
            checks: []
        };
    }

    const context = _buildActorContext(actor, talentLike);
    const clauses = _splitClauses(requirementText);
    const checks = [];
    for (const clause of clauses) {
        checks.push(..._evaluateClause(clause, context));
    }

    const unmet = checks
        .filter(check => check.enforce && !check.passed)
        .map(check => check.label);
    const manual = checks
        .filter(check => check.manual)
        .map(check => check.label);
    const status = unmet.length
        ? "unmet"
        : (manual.length ? "review" : "met");

    return {
        requirementText,
        status,
        enforceMet: unmet.length === 0,
        unmet,
        manual,
        checks
    };
}

export function describeTalentPrerequisiteResult(result, i18n = globalThis.game?.i18n) {
    if (!result) return "";
    const unmet = Array.isArray(result.unmet) ? result.unmet : [];
    const manual = Array.isArray(result.manual) ? result.manual : [];
    if (!unmet.length && !manual.length) {
        return i18n?.localize?.("LAUNDRY.PrereqMet") ?? "Prerequisites met";
    }

    const parts = [];
    if (unmet.length) {
        const unmetLabel = i18n?.localize?.("LAUNDRY.PrereqUnmetLabel") ?? "Unmet";
        parts.push(`${unmetLabel}: ${unmet.join("; ")}`);
    }
    if (manual.length) {
        const reviewLabel = i18n?.localize?.("LAUNDRY.PrereqReviewLabel") ?? "Review";
        parts.push(`${reviewLabel}: ${manual.join("; ")}`);
    }
    return parts.join(" | ");
}

function _getRequirementText(talentLike) {
    if (!talentLike) return "";
    const system = talentLike.system ?? {};
    return String(system.requirements ?? "");
}

function _buildActorContext(actor, talentLike) {
    const attributeValues = {
        body: _asInt(actor?.system?.attributes?.body?.value, 0),
        mind: _asInt(actor?.system?.attributes?.mind?.value, 0),
        spirit: _asInt(actor?.system?.attributes?.spirit?.value, 0)
    };

    const skillMap = new Map();
    const talentSet = new Set();
    const gearNames = new Set();
    const weaponRows = [];

    for (const item of actor?.items ?? []) {
        const type = String(item.type ?? "");
        const name = _normalizeText(item.name);
        const key = name.toLowerCase();
        if (type === "skill") {
            skillMap.set(key, {
                name,
                training: _asInt(item.system?.training, 0),
                focus: _asInt(item.system?.focus, 0)
            });
        } else if (type === "talent") {
            talentSet.add(key);
        } else if (type === "weapon") {
            const rangeText = _normalizeText(item.system?.range);
            const traitsText = _normalizeText(item.system?.traits);
            const linkedSkill = _normalizeText(item.system?.skill);
            weaponRows.push({
                name,
                rangeText: rangeText.toLowerCase(),
                traitsText: traitsText.toLowerCase(),
                linkedSkill: linkedSkill.toLowerCase()
            });
            gearNames.add(key);
        } else if (type === "gear" || type === "armour") {
            gearNames.add(key);
        }
    }

    return {
        attributeValues,
        skillMap,
        talentSet,
        gearNames,
        weaponRows,
        skillNames: _knownSkillNames(),
        knownTalentNames: _knownTalentNames(),
        selfTalentKey: _normalizeText(talentLike?.name).toLowerCase()
    };
}

function _evaluateClause(rawClause, context) {
    const clause = _cleanupClause(rawClause);
    if (!clause) return [];
    if (clause.toLowerCase() === "none") {
        return [{ label: "None", enforce: false, manual: false, passed: true }];
    }

    const attributeMatch = clause.match(/^(Body|Mind|Spirit)\s*\((\d+)\)$/i);
    if (attributeMatch) {
        const attrKey = String(attributeMatch[1]).toLowerCase();
        const min = _asInt(attributeMatch[2], 0);
        const actual = _asInt(context.attributeValues[attrKey], 0);
        const attrLabel = ATTRIBUTE_LABELS[attrKey] ?? attrKey;
        return [{
            label: `${attrLabel} ${min}+`,
            enforce: true,
            manual: false,
            passed: actual >= min
        }];
    }

    const tfAnd = clause.match(/^Training\s*\((\d+)\)\s+and\s+Focus\s*\((\d+)\)\s+in\s+(.+)$/i);
    if (tfAnd) {
        return _evaluateTrainingFocusDual({
            trainingMin: _asInt(tfAnd[1], 0),
            focusMin: _asInt(tfAnd[2], 0),
            targetText: tfAnd[3],
            mode: "and",
            context
        });
    }

    const ftAnd = clause.match(/^Focus\s*\((\d+)\)\s+and\s+Training\s*\((\d+)\)\s+in\s+(.+)$/i);
    if (ftAnd) {
        return _evaluateTrainingFocusDual({
            trainingMin: _asInt(ftAnd[2], 0),
            focusMin: _asInt(ftAnd[1], 0),
            targetText: ftAnd[3],
            mode: "and",
            context
        });
    }

    const tfOr = clause.match(/^Training\s*\((\d+)\)\s+or\s+Focus\s*\((\d+)\)\s+in\s+(.+)$/i);
    if (tfOr) {
        return _evaluateTrainingFocusDual({
            trainingMin: _asInt(tfOr[1], 0),
            focusMin: _asInt(tfOr[2], 0),
            targetText: tfOr[3],
            mode: "or",
            context
        });
    }

    const trainingOnly = clause.match(/^Training\s*\((\d+)\)\s+in\s+(.+)$/i);
    if (trainingOnly) {
        return _evaluateSingleTrack({
            track: "training",
            min: _asInt(trainingOnly[1], 0),
            targetText: trainingOnly[2],
            context
        });
    }

    const focusOnly = clause.match(/^Focus\s*\((\d+)\)\s+in\s+(.+)$/i);
    if (focusOnly) {
        return _evaluateSingleTrack({
            track: "focus",
            min: _asInt(focusOnly[1], 0),
            targetText: focusOnly[2],
            context
        });
    }

    const gearCheck = _evaluateGearOrTraitClause(clause, context);
    if (gearCheck) return [gearCheck];

    const talentCheck = _evaluateTalentDependencyClause(clause, context);
    if (talentCheck) return [talentCheck];

    const manualCheck = _evaluateManualClause(clause, context);
    if (manualCheck) return [manualCheck];

    return [{
        label: clause,
        enforce: false,
        manual: true,
        passed: true
    }];
}

function _evaluateTrainingFocusDual({ trainingMin, focusMin, targetText, mode, context }) {
    const parsed = _parseSkillTargets(targetText, context);
    if (!parsed.skills.length) {
        return [{ label: _cleanupClause(targetText), enforce: false, manual: true, passed: true }];
    }

    const checkSkill = (skillName) => {
        const row = context.skillMap.get(skillName.toLowerCase());
        const training = _asInt(row?.training, 0);
        const focus = _asInt(row?.focus, 0);
        if (mode === "or") return training >= trainingMin || focus >= focusMin;
        return training >= trainingMin && focus >= focusMin;
    };
    const passed = parsed.mode === "any"
        ? parsed.skills.some(checkSkill)
        : parsed.skills.every(checkSkill);
    const operator = mode === "or" ? "or" : "and";
    const label = `Training ${trainingMin}+ ${operator} Focus ${focusMin}+ in ${parsed.skills.join(parsed.mode === "any" ? " or " : " and ")}`;
    const checks = [{
        label,
        enforce: true,
        manual: false,
        passed
    }];
    for (const extra of parsed.extras) {
        checks.push(..._evaluateClause(extra, context));
    }
    return checks;
}

function _evaluateSingleTrack({ track, min, targetText, context }) {
    const parsed = _parseSkillTargets(targetText, context);
    if (!parsed.skills.length) {
        return [{ label: _cleanupClause(targetText), enforce: false, manual: true, passed: true }];
    }

    const checkSkill = (skillName) => {
        const row = context.skillMap.get(skillName.toLowerCase());
        const value = _asInt(row?.[track], 0);
        return value >= min;
    };
    const passed = parsed.mode === "any"
        ? parsed.skills.some(checkSkill)
        : parsed.skills.every(checkSkill);
    const trackLabel = track === "focus" ? "Focus" : "Training";
    const label = `${trackLabel} ${min}+ in ${parsed.skills.join(parsed.mode === "any" ? " or " : " and ")}`;
    const checks = [{
        label,
        enforce: true,
        manual: false,
        passed
    }];
    for (const extra of parsed.extras) {
        checks.push(..._evaluateClause(extra, context));
    }
    return checks;
}

function _evaluateGearOrTraitClause(clause, context) {
    const normalized = clause.toLowerCase();
    if (/^a?\s*ranged weapon\.?$/.test(normalized)) {
        return {
            label: "Ranged weapon",
            enforce: true,
            manual: false,
            passed: context.weaponRows.some(row =>
                row.linkedSkill === "ranged"
                || (!row.rangeText.includes("close") && row.rangeText.length > 0)
            )
        };
    }

    if (/^a?\s*crushing weapon\.?$/.test(normalized)) {
        return {
            label: "Crushing weapon",
            enforce: true,
            manual: false,
            passed: context.weaponRows.some(row => row.traitsText.includes("crushing"))
        };
    }

    if (/^a?\s*slashing weapon\.?$/.test(normalized)) {
        return {
            label: "Slashing weapon",
            enforce: true,
            manual: false,
            passed: context.weaponRows.some(row => row.traitsText.includes("slashing"))
        };
    }

    if (/^disguise kit\.?$/.test(normalized)) {
        return {
            label: "Disguise Kit",
            enforce: true,
            manual: false,
            passed: context.gearNames.has("disguise kit")
        };
    }

    return null;
}

function _evaluateTalentDependencyClause(clause, context) {
    const normalized = clause.toLowerCase();
    if (normalized && normalized === context.selfTalentKey) return null;
    if (normalized === "licence" || normalized === "license") {
        const hasLicence = context.talentSet.has("licence") || context.talentSet.has("license");
        return {
            label: "Licence Talent",
            enforce: true,
            manual: false,
            passed: hasLicence
        };
    }

    if (context.talentSet.has(normalized)) {
        return {
            label: clause,
            enforce: true,
            manual: false,
            passed: true
        };
    }

    if (context.knownTalentNames.has(normalized)) {
        return {
            label: clause,
            enforce: true,
            manual: false,
            passed: false
        };
    }

    return null;
}

function _evaluateManualClause(clause) {
    const normalized = clause.toLowerCase();
    if (normalized.includes("military background")) {
        return {
            label: "Military background",
            enforce: false,
            manual: true,
            passed: true
        };
    }
    if (normalized.includes("suitable tools and supplies")) {
        return {
            label: "Suitable tools and supplies",
            enforce: false,
            manual: true,
            passed: true
        };
    }
    return null;
}

function _parseSkillTargets(rawTargetText, context) {
    const cleaned = _cleanupClause(rawTargetText).replace(/\.$/, "");
    const segments = cleaned.split(",").map(part => _cleanupClause(part)).filter(Boolean);
    if (!segments.length) return { mode: "all", skills: [], extras: [] };

    let main = segments[0].replace(/\beither\b/gi, "");
    main = main.replace(/\bskill\b/gi, "").trim();
    const mode = /\bor\b/i.test(main) ? "any" : "all";
    const tokens = main
        .split(/\s+\bor\b\s+|\s+\band\b\s+/i)
        .map(part => _cleanupClause(part))
        .filter(Boolean);

    const skills = [];
    for (const token of tokens) {
        const canonical = _canonicalSkillName(token, context.skillNames);
        if (canonical) skills.push(canonical);
    }

    return {
        mode,
        skills: _unique(skills),
        extras: segments.slice(1)
    };
}

function _canonicalSkillName(token, knownSkills) {
    const normalized = _normalizeText(token).toLowerCase();
    if (!normalized) return null;
    if (normalized === "close combat") return "Close Combat";
    if (normalized === "ranged") return "Ranged";

    const hit = knownSkills.find(skill => skill.toLowerCase() === normalized);
    if (hit) return hit;

    const titleCase = normalized
        .split(" ")
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    const titleHit = knownSkills.find(skill => skill.toLowerCase() === titleCase.toLowerCase());
    return titleHit ?? null;
}

function _knownSkillNames() {
    const configured = globalThis.CONFIG?.LAUNDRY?.skills;
    if (Array.isArray(configured) && configured.length) {
        return configured.map(row => String(row.name ?? "").trim()).filter(Boolean);
    }
    return DEFAULT_SKILLS.slice();
}

function _knownTalentNames() {
    const cached = globalThis.game?.laundry?.talentNames;
    if (cached instanceof Set) return cached;
    return new Set();
}

function _splitClauses(text) {
    return _normalizeText(text)
        .split(",")
        .map(clause => _cleanupClause(clause))
        .filter(Boolean);
}

function _cleanupClause(value) {
    return _normalizeText(value).replace(/^and\s+/i, "").trim();
}

function _normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function _asInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
}

function _unique(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const key = String(value ?? "").toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
}
