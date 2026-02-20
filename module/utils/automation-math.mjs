const PSYCHOLOGICAL_INJURY_PATTERN = /\b(psychological|phobia|shocked|confused|existential dread|reality denial|traumatised|hallucinations|broken mind|mental|mind)\b/i;
const PHYSICAL_INJURY_PATTERN = /\b(physical|injury|wound|arm wound|leg wound|head wound|internal injury|brain injury|broken arm|broken leg|bleeding|stunned|incapacitated)\b/i;

function _toInt(value, fallback = 0) {
    const parsed = Math.trunc(Number(value) || 0);
    if (Number.isFinite(parsed)) return parsed;
    return Math.trunc(Number(fallback) || 0);
}

function _clampInt(value, min, max) {
    const n = _toInt(value, min);
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function _normalizeSpace(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function _normalizeToken(value) {
    return _normalizeSpace(value).toLowerCase();
}

function _normalizeTag(value) {
    return _normalizeSpace(value)
        .replace(/[^\w\- ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function _dedupeTags(values = []) {
    const seen = new Set();
    const tags = [];
    for (const raw of values) {
        const tag = _normalizeTag(raw);
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }
    return tags;
}

function _sanitizeModifierChange(change = {}) {
    const src = change && typeof change === "object" ? change : {};
    return {
        key: _normalizeSpace(src.key),
        mode: _normalizeSpace(src.mode || "ADD").toUpperCase(),
        value: _normalizeSpace(src.value),
        priority: _toInt(src.priority, 20)
    };
}

function _binomialTailProbability(pool, required, successChance) {
    if (required <= 0) return 1;
    if (required > pool) return 0;
    if (successChance <= 0) return 0;
    if (successChance >= 1) return 1;

    const p = Math.max(0, Math.min(1, Number(successChance) || 0));
    const q = 1 - p;
    let term = q ** pool; // P(X = 0)
    let total = required === 0 ? term : 0;

    for (let k = 0; k < pool; k += 1) {
        const multiplier = ((pool - k) / (k + 1)) * (p / q);
        term *= multiplier;
        if (k + 1 >= required) total += term;
    }
    return Math.max(0, Math.min(1, total));
}

export function sanitizePositiveInt(value, fallback = 0) {
    const number = _toInt(value, fallback);
    if (number > 0) return number;
    return Math.max(0, _toInt(fallback, 0));
}

export function perDieSuccessChance(dn = 4) {
    const clampedDn = _clampInt(dn, 2, 6);
    return Math.max(0, Math.min(1, (7 - clampedDn) / 6));
}

export function calculateSupportSuccessChance({
    pool = 1,
    dn = 4,
    complexity = 1,
    bonusSuccesses = 0
} = {}) {
    const safePool = Math.max(1, _toInt(pool, 1));
    const safeComplexity = Math.max(1, _toInt(complexity, 1));
    const safeBonus = Math.max(0, _toInt(bonusSuccesses, 0));
    const required = Math.max(0, safeComplexity - safeBonus);
    const p = perDieSuccessChance(dn);
    return _binomialTailProbability(safePool, required, p);
}

export function buildSupportForecast({
    pool = 1,
    dn = 4,
    complexity = 1,
    bonusSuccesses = 0
} = {}) {
    const safePool = Math.max(1, _toInt(pool, 1));
    const safeDn = _clampInt(dn, 2, 6);
    const safeComplexity = Math.max(1, _toInt(complexity, 1));
    const safeBonus = Math.max(0, _toInt(bonusSuccesses, 0));
    const perDie = perDieSuccessChance(safeDn);
    const required = Math.max(0, safeComplexity - safeBonus);
    const chance = calculateSupportSuccessChance({
        pool: safePool,
        dn: safeDn,
        complexity: safeComplexity,
        bonusSuccesses: safeBonus
    });

    return {
        pool: safePool,
        dn: safeDn,
        complexity: safeComplexity,
        bonusSuccesses: safeBonus,
        requiredSuccesses: required,
        requiredWithoutBonus: safeComplexity,
        perDieSuccessChance: perDie,
        expectedSuccesses: (safePool * perDie) + safeBonus,
        chance
    };
}

export function buildGearBundleRequest(lines = []) {
    const rows = Array.isArray(lines) ? lines : [];
    if (!rows.length) return null;

    const totalQty = rows.reduce((sum, entry) => sum + sanitizePositiveInt(entry.quantity, 0), 0);
    const lineCount = rows.length;
    const maxDn = rows.reduce((max, entry) => Math.max(max, Math.max(2, _toInt(entry.dn, 4))), 2);
    const baseComplexity = rows.reduce((sum, entry) => {
        const qty = sanitizePositiveInt(entry.quantity, 0);
        const complexity = Math.max(1, _toInt(entry.complexity, 1));
        return sum + (complexity * qty);
    }, 0);

    const breadthPenalty = Math.max(0, lineCount - 1);
    const volumePenalty = Math.max(0, Math.floor(Math.max(0, totalQty - 1) / 3));
    const dnEscalation = Math.max(0, Math.floor(Math.max(0, lineCount - 1) / 2));

    const dn = Math.min(6, maxDn + dnEscalation);
    const complexity = Math.max(1, baseComplexity + breadthPenalty + volumePenalty);
    const requirements = Array.from(new Set(rows
        .map(entry => _normalizeSpace(entry.requirements))
        .filter(Boolean)))
        .join("; ");

    return {
        id: rows.map(entry => String(entry.id ?? "")).filter(Boolean).join("+"),
        name: lineCount === 1
            ? `${_normalizeSpace(rows[0].name)} ×${sanitizePositiveInt(rows[0].quantity, 1)}`
            : `Requisition Bundle (${lineCount} lines)`,
        category: "Gear Requisition Bundle",
        dn,
        complexity,
        requirements,
        summary: `Bundle requisition across ${lineCount} line(s), ${totalQty} total item(s). Complexity = base (${baseComplexity}) + breadth (${breadthPenalty}) + volume (${volumePenalty}).`,
        source: "Operative's Handbook pp.124-132 (bundle requisition automation).",
        lineCount,
        totalQty,
        lines: rows
    };
}

export function calculateGrantedQuantity({
    existingQuantity = 0,
    templateQuantity = 1,
    requestedQuantity = 1,
    overrideExistingQuantity = false
} = {}) {
    const safeExisting = Math.max(0, _toInt(existingQuantity, 0));
    const safeTemplate = Math.max(1, _toInt(templateQuantity, 1));
    const safeRequested = sanitizePositiveInt(requestedQuantity, 1);
    const addedQuantity = overrideExistingQuantity
        ? safeRequested
        : (safeTemplate * safeRequested);
    return {
        addedQuantity,
        nextQuantity: safeExisting + addedQuantity
    };
}

export function computeInjuryTrackUpdate({
    current = 0,
    max = 0,
    delta = 1
} = {}) {
    const safeMax = Math.max(0, _toInt(max, 0));
    if (safeMax <= 0) {
        return {
            before: 0,
            after: 0,
            max: 0,
            changed: false,
            atCap: true
        };
    }

    const before = _clampInt(current, 0, safeMax);
    const after = _clampInt(before + _toInt(delta, 0), 0, safeMax);
    return {
        before,
        after,
        max: safeMax,
        changed: after !== before,
        atCap: after >= safeMax
    };
}

export function classifyCriticalInjuryType({
    effectType = "",
    name = "",
    outcomeText = "",
    statusId = "",
    tableName = ""
} = {}) {
    const type = _normalizeToken(effectType);
    if (type === "mishap") return "psychological";

    const combined = _normalizeSpace([name, outcomeText, statusId, tableName].join(" "));
    if (!combined) return "physical";
    if (PSYCHOLOGICAL_INJURY_PATTERN.test(combined)) return "psychological";
    if (PHYSICAL_INJURY_PATTERN.test(combined)) return "physical";
    return "physical";
}

export function buildOutcomeFingerprint({
    effectType = "",
    effectName = "",
    outcomeText = "",
    statusId = "",
    sourceTag = "",
    tableName = "",
    modifierChanges = []
} = {}) {
    const normalizedChanges = (Array.isArray(modifierChanges) ? modifierChanges : [])
        .map(_sanitizeModifierChange)
        .sort((a, b) => {
            const keyA = `${a.key}|${a.mode}|${a.value}|${a.priority}`;
            const keyB = `${b.key}|${b.mode}|${b.value}|${b.priority}`;
            return keyA.localeCompare(keyB);
        })
        .map(change => `${_normalizeToken(change.key)}:${_normalizeToken(change.mode)}:${_normalizeToken(change.value)}:${change.priority}`)
        .join(",");

    return [
        _normalizeToken(effectType),
        _normalizeToken(effectName),
        _normalizeToken(outcomeText),
        _normalizeToken(statusId),
        _normalizeToken(sourceTag),
        _normalizeToken(tableName),
        normalizedChanges
    ].join("|");
}

export function normalizeSearchTags(values = [], fallback = []) {
    const base = Array.isArray(values) ? values : [values];
    const defaults = Array.isArray(fallback) ? fallback : [fallback];
    return _dedupeTags([...base, ...defaults]);
}
