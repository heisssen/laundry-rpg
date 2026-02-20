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
        owner: ""
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
            owner: ""
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

    return {
        index,
        id: String(asObject.id ?? "") || _makeId(),
        text: String(asObject.text ?? ""),
        status,
        horizon,
        priority,
        dueDate,
        progress,
        owner: String(asObject.owner ?? "")
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
