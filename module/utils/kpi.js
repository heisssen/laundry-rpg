export const KPI_HORIZONS = [
    { key: "short", labelKey: "LAUNDRY.KPIShortTerm" },
    { key: "long", labelKey: "LAUNDRY.KPILongTerm" },
    { key: "bureau", labelKey: "LAUNDRY.KPIBureaucracy" }
];

export const KPI_PRIORITIES = [
    { key: "low", labelKey: "LAUNDRY.KPIPriorityLow" },
    { key: "normal", labelKey: "LAUNDRY.KPIPriorityNormal" },
    { key: "high", labelKey: "LAUNDRY.KPIPriorityHigh" },
    { key: "critical", labelKey: "LAUNDRY.KPIPriorityCritical" }
];

export const KPI_STATUSES = [
    { key: "open", labelKey: "LAUNDRY.KPIStatusOpen" },
    { key: "completed", labelKey: "LAUNDRY.KPIStatusCompleted" },
    { key: "failed", labelKey: "LAUNDRY.KPIStatusFailed" }
];

// Operative's Handbook p.28-29:
// - Short-Term KPI completion: +1 XP, recover 1 team Luck.
// - Long-Term KPI completion: +10 XP, refill team Luck to maximum.
// Bureau KPI is a system-specific extension; it uses short-term reward defaults.
export const KPI_REWARD_RULES = Object.freeze({
    completed: Object.freeze({
        short: Object.freeze({ xp: 1, luck: "plus1" }),
        long: Object.freeze({ xp: 10, luck: "refill" }),
        bureau: Object.freeze({ xp: 1, luck: "plus1" })
    }),
    failed: Object.freeze({
        short: Object.freeze({ xp: 0, luck: "none" }),
        long: Object.freeze({ xp: 0, luck: "none" }),
        bureau: Object.freeze({ xp: 0, luck: "none" })
    })
});

export function normalizeKpiEntries(rawEntries = []) {
    const source = Array.isArray(rawEntries) ? rawEntries : [];
    return source.map((entry, index) => _normalizeKpiEntry(entry, index));
}

export function summarizeKpiEntries(entries = []) {
    const normalized = normalizeKpiEntries(entries);
    return {
        total: normalized.length,
        open: normalized.filter(k => k.status === "open").length,
        completed: normalized.filter(k => k.status === "completed").length,
        failed: normalized.filter(k => k.status === "failed").length,
        short: normalized.filter(k => k.horizon === "short").length,
        long: normalized.filter(k => k.horizon === "long").length,
        bureau: normalized.filter(k => k.horizon === "bureau").length
    };
}

export function createNewKpi(horizon = "short") {
    const safeHorizon = _isValidHorizon(horizon) ? horizon : "short";
    return {
        id: _makeId(),
        text: "",
        status: "open",
        horizon: safeHorizon,
        priority: "normal",
        dueDate: "",
        progress: 0,
        owner: "",
        closedAt: 0,
        closedBy: "",
        rewardedXp: 0,
        rewardLuckMode: "none"
    };
}

export function getKpiReward({ horizon = "short", status = "open" } = {}) {
    const safeStatus = _isValidStatus(String(status ?? "")) ? String(status ?? "") : "open";
    if (safeStatus === "open") return { xp: 0, luck: "none" };
    const safeHorizon = _isValidHorizon(String(horizon ?? "")) ? String(horizon ?? "") : "short";
    const row = KPI_REWARD_RULES[safeStatus] ?? KPI_REWARD_RULES.failed;
    return row[safeHorizon] ?? { xp: 0, luck: "none" };
}

export function closeKpiAtIndex(rawEntries = [], {
    index = -1,
    status = "completed",
    userId = "",
    closedAt = Date.now()
} = {}) {
    const normalized = normalizeKpiEntries(rawEntries);
    if (!Number.isInteger(index) || index < 0 || index >= normalized.length) {
        return { entries: normalized, changed: false, reward: { xp: 0, luck: "none" }, entry: null };
    }

    const safeStatus = status === "failed" ? "failed" : "completed";
    const target = normalized[index];
    if (!target || target.status !== "open") {
        return { entries: normalized, changed: false, reward: { xp: 0, luck: "none" }, entry: target ?? null };
    }

    const reward = getKpiReward({ horizon: target.horizon, status: safeStatus });
    const nextEntries = normalized.map((entry, idx) => {
        if (idx !== index) return _stripKpiIndex(entry);
        const baseProgress = Math.max(0, Math.min(100, Math.trunc(Number(entry.progress) || 0)));
        return {
            ..._stripKpiIndex(entry),
            status: safeStatus,
            progress: safeStatus === "completed" ? 100 : Math.min(baseProgress, 99),
            closedAt: Math.max(0, Math.trunc(Number(closedAt) || Date.now())),
            closedBy: String(userId ?? "").trim(),
            rewardedXp: Math.max(0, Math.trunc(Number(reward.xp) || 0)),
            rewardLuckMode: String(reward.luck ?? "none")
        };
    });

    return {
        entries: nextEntries,
        changed: true,
        reward: {
            xp: Math.max(0, Math.trunc(Number(reward.xp) || 0)),
            luck: String(reward.luck ?? "none")
        },
        entry: nextEntries[index]
    };
}

function _normalizeKpiEntry(entry, index) {
    if (typeof entry === "string") {
        return {
            index,
            id: _makeId(),
            text: entry,
            status: "open",
            horizon: "short",
            priority: "normal",
            dueDate: "",
            progress: 0,
            owner: "",
            closedAt: 0,
            closedBy: "",
            rewardedXp: 0,
            rewardLuckMode: "none"
        };
    }

    const asObject = entry && typeof entry === "object" ? entry : {};
    const rawStatus = String(asObject.status ?? "open");
    const status = _isValidStatus(rawStatus) ? rawStatus : "open";
    const rawHorizon = String(asObject.horizon ?? "short");
    const horizon = _isValidHorizon(rawHorizon) ? rawHorizon : "short";
    const rawPriority = String(asObject.priority ?? "normal");
    const priority = _isValidPriority(rawPriority) ? rawPriority : "normal";
    const rawProgress = Number(asObject.progress ?? 0);
    const progress = Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(100, Math.trunc(rawProgress)))
        : (status === "completed" ? 100 : 0);
    const dueDate = _normalizeIsoDate(asObject.dueDate ?? "");
    const closedAt = Math.max(0, Math.trunc(Number(asObject.closedAt) || 0));
    const closedBy = String(asObject.closedBy ?? "").trim();
    const rewardedXp = Math.max(0, Math.trunc(Number(asObject.rewardedXp) || 0));
    const rewardLuckModeRaw = String(asObject.rewardLuckMode ?? "none").trim().toLowerCase();
    const rewardLuckMode = ["none", "plus1", "refill"].includes(rewardLuckModeRaw)
        ? rewardLuckModeRaw
        : "none";

    return {
        index,
        id: String(asObject.id ?? "") || _makeId(),
        text: String(asObject.text ?? ""),
        status,
        horizon,
        priority,
        dueDate,
        progress,
        owner: String(asObject.owner ?? ""),
        closedAt,
        closedBy,
        rewardedXp,
        rewardLuckMode
    };
}

function _stripKpiIndex(entry) {
    if (!entry || typeof entry !== "object") return createNewKpi("short");
    return {
        id: String(entry.id ?? "") || _makeId(),
        text: String(entry.text ?? ""),
        status: _isValidStatus(String(entry.status ?? "open")) ? String(entry.status ?? "open") : "open",
        horizon: _isValidHorizon(String(entry.horizon ?? "short")) ? String(entry.horizon ?? "short") : "short",
        priority: _isValidPriority(String(entry.priority ?? "normal")) ? String(entry.priority ?? "normal") : "normal",
        dueDate: _normalizeIsoDate(entry.dueDate ?? ""),
        progress: Math.max(0, Math.min(100, Math.trunc(Number(entry.progress) || 0))),
        owner: String(entry.owner ?? ""),
        closedAt: Math.max(0, Math.trunc(Number(entry.closedAt) || 0)),
        closedBy: String(entry.closedBy ?? "").trim(),
        rewardedXp: Math.max(0, Math.trunc(Number(entry.rewardedXp) || 0)),
        rewardLuckMode: ["none", "plus1", "refill"].includes(String(entry.rewardLuckMode ?? "").toLowerCase())
            ? String(entry.rewardLuckMode ?? "").toLowerCase()
            : "none"
    };
}

function _isValidHorizon(value) {
    return KPI_HORIZONS.some(opt => opt.key === value);
}

function _isValidPriority(value) {
    return KPI_PRIORITIES.some(opt => opt.key === value);
}

function _isValidStatus(value) {
    return KPI_STATUSES.some(opt => opt.key === value);
}

function _normalizeIsoDate(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return "";
}

function _makeId() {
    if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID(16);
    return Math.random().toString(36).slice(2, 10);
}
