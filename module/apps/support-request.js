import {
    DEPARTMENT_SUPPORT_TABLE,
    GEAR_REQUISITION_TABLE
} from "../utils/supervisors-guide-data.js";
import {
    buildGearBundleRequest,
    buildSupportForecast,
    calculateGrantedQuantity,
    classifyCriticalInjuryType,
    computeInjuryTrackUpdate,
    sanitizePositiveInt
} from "../utils/automation-math.mjs";

const APP_API = foundry.applications?.api ?? {};
const BaseApplication = APP_API.ApplicationV2 ?? Application;
const HandlebarsMixin = APP_API.HandlebarsApplicationMixin ?? (Base => Base);
const FLAG_SCOPE = "laundry-rpg";
const ENDEAVOURS_FLAG = "endeavours";
const DIFFICULTY_FLAG_PREFIX = "flags.laundry-rpg.modifiers.difficulty.";
const REQUISITION_COMPENDIUM_PACKS = [
    "laundry-rpg.gear",
    "laundry-rpg.weapons",
    "laundry-rpg.armour",
    "laundry-rpg.all-items"
];
const LEGACY_CRITICAL_INJURY_PATTERN = /\b(injury|wound|arm wound|leg wound|head wound|internal injury|brain injury|broken arm|broken leg|phobia|shocked|confused|existential dread|reality denial|traumatised|hallucinations|broken mind)\b/i;

export class LaundrySupportRequestApp extends HandlebarsMixin(BaseApplication) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
            id: "laundry-support-request",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-support-request"],
            tag: "section",
            window: { title: "Requisition & Support" },
            position: { width: 620, height: "auto" }
        },
        { inplace: false }
    );

    static PARTS = {
        body: {
            template: "systems/laundry-rpg/templates/apps/support-request.html"
        }
    };

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions ?? {}, {
            id: "laundry-support-request",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-support-request"],
            template: "systems/laundry-rpg/templates/apps/support-request.html",
            title: "Requisition & Support",
            width: 620,
            height: "auto",
            resizable: true
        });
    }

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor ?? null;
        this._requestType = "department";
        this._selectedDepartment = DEPARTMENT_SUPPORT_TABLE[0]?.id ?? "";
        this._selectedGear = GEAR_REQUISITION_TABLE[0]?.id ?? "";
        this._requestMethod = "paperwork";
        this._pendingGearQty = 1;
        this._requestedGearQty = {};
        this._actionsAbortController = null;
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
        this._normalizeSelections();

        const requestTypes = [
            { id: "department", label: "Department Support", selected: this._requestType === "department" },
            { id: "gear", label: "Gear Requisition", selected: this._requestType === "gear" }
        ];

        const departments = DEPARTMENT_SUPPORT_TABLE.map(entry => ({
            ...entry,
            selected: entry.id === this._selectedDepartment
        }));
        const selectedDepartment = departments.find(entry => entry.id === this._selectedDepartment) ?? departments[0] ?? null;

        const gearRows = GEAR_REQUISITION_TABLE.map(entry => ({
            ...entry,
            selected: entry.id === this._selectedGear
        }));
        const gearCategories = Array.from(new Set(gearRows.map(entry => entry.category))).map(category => ({
            name: category,
            entries: gearRows.filter(entry => entry.category === category)
        }));

        const requestedGearLines = _resolveRequestedGearLines(this._requestedGearQty);
        const gearBundle = buildGearBundleRequest(requestedGearLines);
        const methodOptions = [
            { id: "paperwork", label: "Paperwork // Mind (Bureaucracy)", selected: this._requestMethod === "paperwork" },
            { id: "in-person", label: "In-Person // Mind (Presence)", selected: this._requestMethod === "in-person" }
        ];

        const showPreview = this._requestType === "gear"
            ? Boolean(gearBundle)
            : Boolean(selectedDepartment);
        const preview = this._requestType === "gear"
            ? gearBundle
            : selectedDepartment;

        const endeavourFlags = this.actor?.getFlag(FLAG_SCOPE, ENDEAVOURS_FLAG) ?? {};
        const paperworkBonus = Boolean(endeavourFlags?.paperwork_bonus);
        const previewDn = Math.max(2, Math.trunc(Number(preview?.dn) || 4));
        const previewComplexity = Math.max(1, Math.trunc(Number(preview?.complexity) || 1));
        const forecast = showPreview
            ? _buildSupportRequestForecast({
                actor: this.actor,
                skillName: this._resolveTestSkillName(),
                dn: previewDn,
                complexity: previewComplexity,
                paperworkBonus
            })
            : null;

        const criticalInjuries = _collectActiveCriticalInjuries(this.actor);
        const physicalCriticalInjuries = criticalInjuries.filter(entry => entry.injuryType === "physical");
        const psychologicalCriticalInjuries = criticalInjuries.filter(entry => entry.injuryType === "psychological");

        return {
            actorName: this.actor?.name ?? "Unknown Agent",
            requestTypes,
            requestType: this._requestType,
            showMethodSelector: this._requestType === "gear",
            methodOptions,
            departments,
            selectedDepartmentId: this._selectedDepartment,
            gearCategories,
            gearRows,
            pendingGearQty: sanitizePositiveInt(this._pendingGearQty, 1),
            hasRequestedGear: requestedGearLines.length > 0,
            requestedGearLines,
            showPreview,
            previewIsBundle: this._requestType === "gear" && Boolean(gearBundle),
            previewName: preview?.name ?? "",
            previewDn,
            previewComplexity,
            previewRequirements: String(preview?.requirements ?? "").trim(),
            previewSummary: String(preview?.summary ?? "").trim(),
            previewSource: String(preview?.source ?? "").trim(),
            bundleLineCount: Math.max(0, Math.trunc(Number(gearBundle?.lineCount) || 0)),
            bundleTotalQty: Math.max(0, Math.trunc(Number(gearBundle?.totalQty) || 0)),
            hasForecast: Boolean(forecast),
            forecastSkillName: String(forecast?.skillName ?? ""),
            forecastPool: Math.max(0, Math.trunc(Number(forecast?.pool) || 0)),
            forecastRequiredSuccesses: Math.max(0, Math.trunc(Number(forecast?.requiredSuccesses) || 0)),
            forecastRequiredWithoutBonus: Math.max(0, Math.trunc(Number(forecast?.requiredWithoutBonus) || 0)),
            forecastExpectedSuccesses: _formatDecimal(forecast?.expectedSuccesses, 2),
            forecastChancePct: _formatPercent(forecast?.chance),
            forecastPerDieChancePct: _formatPercent(forecast?.perDieSuccessChance),
            forecastPaperworkBonus: paperworkBonus,
            hasCriticalInjuries: criticalInjuries.length > 0,
            hasPhysicalCriticalInjuries: physicalCriticalInjuries.length > 0,
            hasPsychologicalCriticalInjuries: psychologicalCriticalInjuries.length > 0,
            criticalInjuries,
            physicalCriticalInjuries,
            psychologicalCriticalInjuries
        };
    }

    async _onRender(context, options) {
        if (super._onRender) await super._onRender(context, options);
        this._activateActions();
    }

    activateListeners(html) {
        super.activateListeners?.(html);
        this._activateActions(html?.[0] ?? html);
    }

    _activateActions(rootElement = null) {
        const root = rootElement ?? _resolveApplicationRoot(this);
        if (!root) return;

        this._actionsAbortController?.abort();
        this._actionsAbortController = new AbortController();
        const listenerOptions = { signal: this._actionsAbortController.signal };

        root.querySelector('[name="departmentId"]')?.addEventListener("change", async (ev) => {
            this._selectedDepartment = String(ev.currentTarget?.value ?? "").trim();
            await _rerenderApp(this);
        }, listenerOptions);

        root.querySelector('[name="requestType"]')?.addEventListener("change", async (ev) => {
            const next = String(ev.currentTarget?.value ?? "").trim().toLowerCase();
            this._requestType = next === "gear" ? "gear" : "department";
            await _rerenderApp(this);
        }, listenerOptions);

        root.querySelectorAll(".request-type-select").forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                const next = String(ev.currentTarget?.dataset?.requestType ?? "").trim().toLowerCase();
                this._requestType = next === "gear" ? "gear" : "department";
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll(".department-select-card").forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                const next = String(ev.currentTarget?.dataset?.departmentId ?? "").trim();
                if (!next || next === this._selectedDepartment) return;
                this._selectedDepartment = next;
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll(".gear-select-card").forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                const next = String(ev.currentTarget?.dataset?.gearId ?? "").trim();
                if (!next) return;
                this._selectedGear = next;
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelector('[name="gearId"]')?.addEventListener("change", (ev) => {
            this._selectedGear = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="pendingGearQty"]')?.addEventListener("input", (ev) => {
            this._pendingGearQty = sanitizePositiveInt(ev.currentTarget?.value, 1);
        }, listenerOptions);

        root.querySelector('[name="requestMethod"]')?.addEventListener("change", (ev) => {
            const next = String(ev.currentTarget?.value ?? "").trim().toLowerCase();
            this._requestMethod = next === "in-person" ? "in-person" : "paperwork";
        }, listenerOptions);

        root.querySelectorAll("[data-gear-qty-for]").forEach(input => {
            input.addEventListener("change", async (ev) => {
                const gearId = String(ev.currentTarget?.dataset?.gearQtyFor ?? "").trim();
                const qty = sanitizePositiveInt(ev.currentTarget?.value, 1);
                this._setRequestedGearQuantity(gearId, qty);
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll('[data-action="add-gear-line"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                this._addSelectedGearLine();
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll('[data-action="remove-gear-line"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                const gearId = String(ev.currentTarget?.dataset?.gearId ?? "").trim();
                this._setRequestedGearQuantity(gearId, 0);
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll('[data-action="clear-gear-lines"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                this._requestedGearQty = {};
                await _rerenderApp(this);
            }, listenerOptions);
        });

        root.querySelectorAll('[data-action="request-support"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._onRequestSupport();
            }, listenerOptions);
        });

        root.querySelectorAll('[data-action="heal-critical-injury"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                const injuryKind = String(ev.currentTarget?.dataset?.injuryKind ?? "any").trim().toLowerCase();
                await this._healOneCriticalInjury(injuryKind);
            }, listenerOptions);
        });
    }

    _normalizeSelections() {
        const hasDepartment = DEPARTMENT_SUPPORT_TABLE.some(entry => entry.id === this._selectedDepartment);
        if (!hasDepartment) this._selectedDepartment = DEPARTMENT_SUPPORT_TABLE[0]?.id ?? "";

        const hasGear = GEAR_REQUISITION_TABLE.some(entry => entry.id === this._selectedGear);
        if (!hasGear) this._selectedGear = GEAR_REQUISITION_TABLE[0]?.id ?? "";

        const normalized = {};
        for (const entry of GEAR_REQUISITION_TABLE) {
            const qty = sanitizePositiveInt(this._requestedGearQty?.[entry.id], 0);
            if (qty > 0) normalized[entry.id] = qty;
        }
        this._requestedGearQty = normalized;
        this._pendingGearQty = sanitizePositiveInt(this._pendingGearQty, 1);
    }

    _addSelectedGearLine() {
        const gearId = String(this._selectedGear ?? "").trim();
        if (!gearId) return;
        const existing = sanitizePositiveInt(this._requestedGearQty?.[gearId], 0);
        const next = existing + sanitizePositiveInt(this._pendingGearQty, 1);
        this._setRequestedGearQuantity(gearId, next);
        this._pendingGearQty = 1;
    }

    _setRequestedGearQuantity(gearId, quantity) {
        const id = String(gearId ?? "").trim();
        if (!id) return;
        const qty = sanitizePositiveInt(quantity, 0);
        if (qty <= 0) {
            delete this._requestedGearQty[id];
            return;
        }
        this._requestedGearQty[id] = qty;
    }

    async _healOneCriticalInjury(kind = "any") {
        if (!this.actor) return;
        if (!(game.user?.isGM || this.actor.isOwner)) {
            ui.notifications.warn("Only the GM or actor owner can clear critical injuries.");
            return;
        }

        const injuries = _collectActiveCriticalInjuries(this.actor, { kind });
        if (!injuries.length) {
            ui.notifications.warn("No matching critical injuries were found.");
            return;
        }

        const target = injuries
            .slice()
            .sort((a, b) => {
                if (a.appliedAt && b.appliedAt) return a.appliedAt - b.appliedAt;
                if (a.appliedAt) return -1;
                if (b.appliedAt) return 1;
                return a.name.localeCompare(b.name);
            })[0];
        if (!target?.id) {
            ui.notifications.warn("No removable injury effect was found.");
            return;
        }

        const maxTrack = Math.max(0, Math.trunc(Number(this.actor.system?.derived?.injuries?.max) || 0));
        const currentTrack = Math.max(0, Math.trunc(Number(this.actor.system?.derived?.injuries?.value) || 0));
        const trackState = computeInjuryTrackUpdate({
            current: currentTrack,
            max: maxTrack,
            delta: -1
        });

        await this.actor.deleteEmbeddedDocuments("ActiveEffect", [target.id]);
        if (trackState.changed) {
            await this.actor.update({ "system.derived.injuries.value": trackState.after });
        }

        const label = target.injuryType === "psychological" ? "psychological" : "physical";
        ui.notifications.info(`${this.actor.name}: healed ${label} injury "${target.name}".`);
        await _rerenderApp(this);
    }

    async _onRequestSupport() {
        if (!this.actor) return;
        if (!(game.user?.isGM || this.actor.isOwner)) {
            ui.notifications.warn("Only the GM or actor owner can request departmental support.");
            return;
        }

        const request = this._resolveActiveRequest();
        if (!request) {
            ui.notifications.warn(this._requestType === "gear"
                ? "Add at least one requisition line first."
                : "Select a support line first.");
            return;
        }

        const requestEntry = request.entry;
        const testSkill = this._resolveTestSkillName();
        const testMethodLabel = this._requestType === "gear"
            ? (this._requestMethod === "in-person" ? "In-Person Requisition" : "Paperwork Requisition")
            : "Department Support Request";

        const pool = _resolveSupportRollPool(this.actor, testSkill);

        const roll = new Roll(`${pool}d6`);
        await roll.evaluate();
        const dieResults = _extractRollDieValues(roll);
        const successes = dieResults.filter(value => value >= requestEntry.dn).length;

        const endeavourFlags = this.actor.getFlag(FLAG_SCOPE, ENDEAVOURS_FLAG) ?? {};
        const consumedPaperworkBonus = Boolean(endeavourFlags?.paperwork_bonus);
        const totalSuccesses = successes + (consumedPaperworkBonus ? 1 : 0);
        const approved = totalSuccesses >= requestEntry.complexity;

        const grantedItems = approved && request.isGear
            ? await _fulfilGearBundleRequisition(this.actor, request.lines)
            : [];

        const updatedFlags = {
            ...endeavourFlags,
            paperwork_bonus: false,
            last_support_request: {
                at: Date.now(),
                requestType: this._requestType,
                requestId: requestEntry.id,
                requestName: requestEntry.name,
                category: requestEntry.category ?? "Department Support",
                dn: requestEntry.dn,
                complexity: requestEntry.complexity,
                testSkill,
                testMethodLabel,
                pool,
                roll: dieResults,
                successes,
                bonusSuccess: consumedPaperworkBonus ? 1 : 0,
                totalSuccesses,
                approved,
                requirements: requestEntry.requirements ?? "",
                source: requestEntry.source ?? "",
                lines: request.lines.map(line => ({
                    id: line.id,
                    name: line.name,
                    quantity: line.quantity,
                    dn: line.dn,
                    complexity: line.complexity
                })),
                grantedItems
            }
        };
        await this.actor.setFlag(FLAG_SCOPE, ENDEAVOURS_FLAG, updatedFlags);

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const safeRequestName = foundry.utils.escapeHTML(requestEntry.name);
        const safeSummary = foundry.utils.escapeHTML(requestEntry.summary ?? "");
        const safeCategory = foundry.utils.escapeHTML(requestEntry.category ?? "Department Support");
        const safeRequirements = foundry.utils.escapeHTML(requestEntry.requirements ?? "");
        const safeSource = foundry.utils.escapeHTML(requestEntry.source ?? "");
        const safeMethod = foundry.utils.escapeHTML(testMethodLabel);
        const safeTestSkill = foundry.utils.escapeHTML(testSkill);
        const verdict = approved ? "APPROVED" : "DENIED";
        const verdictClass = approved ? "laundry-support-approved" : "laundry-support-denied";
        const freeSuccessText = consumedPaperworkBonus
            ? "Filing Paperwork bonus consumed: +1 automatic success."
            : "No Filing Paperwork bonus available.";
        const heading = this._requestType === "gear"
            ? "GEAR REQUISITION ORDER"
            : "DEPARTMENTAL SUPPORT REQUEST";

        const safeLines = request.lines.map(line => {
            const lineName = foundry.utils.escapeHTML(line.name);
            return `<li>${lineName} ×${line.quantity} (DN ${line.dn}:${line.complexity})</li>`;
        }).join("");

        const safeGranted = grantedItems
            .map(name => `<li>${foundry.utils.escapeHTML(name)}</li>`)
            .join("");
        const safeRequirementsRow = safeRequirements || "None";
        const issuedSection = safeGranted
            ? `<div class="laundry-chat-section"><div class="laundry-chat-section-title">Issued</div><ul class="laundry-chat-list">${safeGranted}</ul></div>`
            : (approved && request.isGear
                ? `<div class="laundry-chat-note">Issued: No matching inventory items found; bundle logged for GM handling.</div>`
                : "");
        const diceSection = _renderSupportRollSection({
            dice: dieResults,
            dn: requestEntry.dn,
            complexity: requestEntry.complexity,
            successes,
            totalSuccesses,
            approved,
            bonusSuccesses: consumedPaperworkBonus ? 1 : 0
        });

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-chat-card laundry-bureau-card laundry-support-card ${verdictClass}">
                    <div class="laundry-chat-header">
                        <div class="laundry-chat-title">
                            <strong>${heading}: ${safeRequestName}</strong>
                            <span class="laundry-chat-subtitle">${safeCategory}</span>
                        </div>
                        <span class="laundry-chat-stamp">${verdict}</span>
                    </div>
                    <div class="laundry-chat-meta">Mind (${safeTestSkill}) DN ${requestEntry.dn}:${requestEntry.complexity} // Pool ${pool}d6</div>
                    ${diceSection}
                    <div class="laundry-chat-rows">
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Requester</span><span class="laundry-chat-value">${safeName}</span></div>
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Method</span><span class="laundry-chat-value">${safeMethod}</span></div>
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Successes</span><span class="laundry-chat-value">${successes}${consumedPaperworkBonus ? " + 1 paperwork bonus" : ""} = ${totalSuccesses}</span></div>
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Requirements</span><span class="laundry-chat-value">${safeRequirementsRow}</span></div>
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Effect</span><span class="laundry-chat-value">${safeSummary}</span></div>
                    </div>
                    ${safeLines ? `<div class="laundry-chat-section"><div class="laundry-chat-section-title">Requested Bundle</div><ul class="laundry-chat-list">${safeLines}</ul></div>` : ""}
                    ${issuedSection}
                    <div class="laundry-chat-note">${foundry.utils.escapeHTML(freeSuccessText)}</div>
                    ${safeSource ? `<p class="laundry-chat-reference">${safeSource}</p>` : ""}
                </div>`,
            rolls: [roll],
            sound: CONFIG.sounds?.dice
        });

        if (approved && this._requestType === "gear") {
            this._requestedGearQty = {};
        }

        const notificationTarget = requestEntry.name || "Support Request";
        ui.notifications.info(`${notificationTarget}: ${approved ? "approved." : "denied."}`);
        await _rerenderApp(this);
    }

    _resolveActiveRequest() {
        if (this._requestType === "gear") {
            const lines = _resolveRequestedGearLines(this._requestedGearQty);
            const aggregate = buildGearBundleRequest(lines);
            if (!aggregate) return null;
            return {
                isGear: true,
                entry: aggregate,
                lines
            };
        }

        const entry = DEPARTMENT_SUPPORT_TABLE.find(row => row.id === this._selectedDepartment)
            ?? DEPARTMENT_SUPPORT_TABLE[0]
            ?? null;
        if (!entry) return null;
        return {
            isGear: false,
            entry,
            lines: []
        };
    }

    _resolveTestSkillName() {
        if (this._requestType === "gear" && this._requestMethod === "in-person") {
            return "Presence";
        }
        return "Bureaucracy";
    }

    async close(options = {}) {
        this._actionsAbortController?.abort();
        this._actionsAbortController = null;
        return super.close(options);
    }
}

export async function openSupportRequestApp(actor) {
    if (!actor) return null;
    const existing = Object.values(ui.windows ?? {}).find(app =>
        app instanceof LaundrySupportRequestApp && app.rendered && app.actor?.id === actor.id
    );
    if (existing) {
        existing.bringToTop?.();
        return existing;
    }
    const app = new LaundrySupportRequestApp(actor);
    await app.render(true);
    return app;
}

function _extractRollDieValues(roll) {
    const values = [];
    for (const term of roll?.terms ?? []) {
        if (!Array.isArray(term?.results)) continue;
        for (const result of term.results) {
            const value = Math.trunc(Number(result?.result) || 0);
            if (value > 0) values.push(value);
        }
    }
    return values;
}

function _renderSupportRollSection({
    dice = [],
    dn = 4,
    complexity = 1,
    successes = 0,
    totalSuccesses = 0,
    approved = false,
    bonusSuccesses = 0
} = {}) {
    const rawDice = Array.isArray(dice) ? dice : [];
    if (!rawDice.length) return "";

    const safeDn = Math.max(2, Math.trunc(Number(dn) || 4));
    const safeComplexity = Math.max(1, Math.trunc(Number(complexity) || 1));
    const safeSuccesses = Math.max(0, Math.trunc(Number(successes) || 0));
    const safeTotalSuccesses = Math.max(0, Math.trunc(Number(totalSuccesses) || 0));
    const safeBonus = Math.max(0, Math.trunc(Number(bonusSuccesses) || 0));
    const criticals = rawDice.filter(value => Math.trunc(Number(value) || 0) === 6).length;
    const complications = rawDice.filter(value => Math.trunc(Number(value) || 0) === 1).length;
    const safeCriticalLabel = _escapeHtml(game.i18n?.localize?.("LAUNDRY.Criticals") ?? "Criticals");
    const safeComplicationLabel = _escapeHtml(game.i18n?.localize?.("LAUNDRY.Complications") ?? "Complications");
    const safeNaturalSix = _escapeHtml(game.i18n?.localize?.("LAUNDRY.NaturalSix") ?? "Natural Six");
    const safeNaturalOne = _escapeHtml(game.i18n?.localize?.("LAUNDRY.NaturalOne") ?? "Natural One");

    const diceHtml = rawDice.map((value, index) => {
        const dieValue = Math.max(1, Math.min(6, Math.trunc(Number(value) || 0)));
        const isCritical = dieValue === 6;
        const isComplication = dieValue === 1;
        const classes = [
            "roll",
            "die",
            "d6",
            "laundry-die",
            dieValue >= safeDn ? "success" : "failure",
            isCritical ? "die-critical" : "",
            isComplication ? "die-complication" : ""
        ].filter(Boolean).join(" ");
        const marker = isCritical
            ? `<span class="die-marker marker-critical" title="${safeNaturalSix}">*</span>`
            : (isComplication
                ? `<span class="die-marker marker-complication" title="${safeNaturalOne}">!</span>`
                : "");
        return `<li class="${classes}" data-die-index="${index}">${dieValue}${marker}</li>`;
    }).join("");

    const successSuffix = safeBonus > 0
        ? ` (${safeSuccesses} + ${safeBonus} bonus)`
        : "";
    const outcomeLabel = approved ? "Support Check Passed" : "Support Check Failed";
    const outcomeClass = approved ? "outcome-success" : "outcome-failure";

    return `
        <div class="laundry-dice-roll laundry-support-roll">
            <ol class="dice-rolls">${diceHtml}</ol>
            <div class="dice-roll-summary">
                <span class="crit-summary">${safeCriticalLabel}: ${criticals}</span>
                <span class="comp-summary">${safeComplicationLabel}: ${complications}</span>
            </div>
            <div class="dice-outcome ${outcomeClass}">
                <strong>${outcomeLabel}</strong>
                <span class="success-count">(Successes: ${safeTotalSuccesses}/${safeComplexity}${successSuffix})</span>
            </div>
        </div>`;
}

function _escapeHtml(value) {
    const escape = foundry.utils?.escapeHTML;
    return typeof escape === "function"
        ? escape(String(value ?? ""))
        : String(value ?? "");
}

function _buildSupportRequestForecast({
    actor,
    skillName = "",
    dn = 4,
    complexity = 1,
    paperworkBonus = false
} = {}) {
    const pool = _resolveSupportRollPool(actor, skillName);
    const forecast = buildSupportForecast({
        pool,
        dn,
        complexity,
        bonusSuccesses: paperworkBonus ? 1 : 0
    });
    return {
        ...forecast,
        skillName: String(skillName ?? "").trim()
    };
}

function _resolveSupportRollPool(actor, skillName = "") {
    if (!actor) return 1;
    const safeSkill = String(skillName ?? "").trim().toLowerCase();
    const mind = Math.max(1, Math.trunc(Number(actor.system?.attributes?.mind?.value) || 1));
    if (!safeSkill) return mind;

    const skillItem = Array.from(actor.items ?? []).find(item =>
        item.type === "skill" && String(item.name ?? "").trim().toLowerCase() === safeSkill
    );
    const training = Math.max(0, Math.trunc(Number(skillItem?.system?.training) || 0));
    return Math.max(1, mind + training);
}

function _formatPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.0";
    const pct = Math.max(0, Math.min(1, n)) * 100;
    return pct.toFixed(1);
}

function _formatDecimal(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.00";
    return n.toFixed(Math.max(0, Math.trunc(Number(digits) || 0)));
}

function _resolveRequestedGearLines(quantityMap = {}) {
    const raw = quantityMap && typeof quantityMap === "object" ? quantityMap : {};
    const lines = [];
    for (const entry of GEAR_REQUISITION_TABLE) {
        const qty = sanitizePositiveInt(raw[entry.id], 0);
        if (qty <= 0) continue;
        lines.push({
            ...entry,
            quantity: qty,
            lineComplexity: Math.max(1, Math.trunc(Number(entry.complexity) || 1)) * qty
        });
    }
    return lines;
}

function _collectActiveCriticalInjuries(actor, { kind = "any" } = {}) {
    const normalizedKind = String(kind ?? "any").trim().toLowerCase();
    const entries = [];
    for (const effect of actor?.effects ?? []) {
        const outcome = effect.getFlag?.("laundry-rpg", "outcomeEffect") ?? {};
        const type = String(outcome?.type ?? "").trim().toLowerCase();
        const effectName = String(effect?.name ?? "").trim();
        const outcomeText = String(outcome?.outcomeText ?? "").trim();
        const combined = `${effectName} ${outcomeText}`.trim();
        const hasDifficultyModifiers = Array.isArray(effect?.changes)
            && effect.changes.some(change => String(change?.key ?? "").trim().toLowerCase().startsWith(DIFFICULTY_FLAG_PREFIX));

        const isInjury = type === "injury"
            || LEGACY_CRITICAL_INJURY_PATTERN.test(combined)
            || hasDifficultyModifiers;
        if (!isInjury) continue;

        const injuryType = classifyCriticalInjuryType({
            effectType: type || "injury",
            name: effectName,
            outcomeText,
            statusId: String(outcome?.statusId ?? ""),
            tableName: String(outcome?.tableName ?? "")
        });
        if (normalizedKind === "physical" && injuryType !== "physical") continue;
        if (normalizedKind === "psychological" && injuryType !== "psychological") continue;

        entries.push({
            id: effect.id,
            name: effectName || "Critical Injury",
            statusId: String(outcome?.statusId ?? "").trim(),
            tableName: String(outcome?.tableName ?? "").trim(),
            appliedAt: Math.max(0, Math.trunc(Number(outcome?.appliedAt) || 0)),
            injuryType
        });
    }

    entries.sort((a, b) => {
        if (a.appliedAt && b.appliedAt) return b.appliedAt - a.appliedAt;
        if (a.appliedAt) return -1;
        if (b.appliedAt) return 1;
        return a.name.localeCompare(b.name);
    });

    return entries;
}

async function _fulfilGearBundleRequisition(actor, lines = []) {
    if (!actor) return [];
    const rows = Array.isArray(lines) ? lines : [];
    if (!rows.length) return [];

    const granted = [];
    const compendiumCache = new Map();

    for (const line of rows) {
        const quantity = sanitizePositiveInt(line?.quantity, 0);
        if (quantity <= 0) continue;

        const template = await _resolveCompendiumTemplateByName(String(line?.name ?? ""), compendiumCache);
        if (template) {
            const itemType = String(template?.type ?? "").trim().toLowerCase();
            if (itemType === "gear") {
                await _grantGearQuantity(actor, template, quantity);
                granted.push(`${template.name} ×${quantity}`);
                continue;
            }

            const base = _sanitizeItemDocumentForCreate(template);
            if (base) {
                const docs = [];
                for (let idx = 0; idx < quantity; idx += 1) {
                    docs.push(foundry.utils.deepClone(base));
                }
                await actor.createEmbeddedDocuments("Item", docs);
                granted.push(`${base.name} ×${quantity}`);
                continue;
            }
        }

        const fallback = _buildFallbackGearItemData(line, quantity);
        await _grantGearQuantity(actor, fallback, quantity, { overrideExistingQuantity: true });
        granted.push(`${fallback.name} ×${quantity}`);
    }

    return granted;
}

function _sanitizeItemDocumentForCreate(documentData) {
    if (!documentData || typeof documentData !== "object") return null;
    const clone = foundry.utils.deepClone(documentData);
    delete clone._id;
    delete clone._stats;
    delete clone.folder;
    delete clone.sort;
    delete clone.ownership;
    delete clone.flags?.core;
    if (!clone.name || !clone.type) return null;
    return clone;
}

async function _grantGearQuantity(actor, itemData, quantity, { overrideExistingQuantity = false } = {}) {
    const doc = _sanitizeItemDocumentForCreate(itemData);
    if (!doc) return null;

    const safeQuantity = sanitizePositiveInt(quantity, 1);
    const name = String(doc.name ?? "").trim();
    const normalizedName = _normalizeName(name);
    const existing = Array.from(actor.items ?? []).find(item =>
        item.type === "gear" && _normalizeName(item.name ?? "") === normalizedName
    );

    const baseQty = sanitizePositiveInt(doc?.system?.quantity, 1);

    if (existing) {
        const currentQty = sanitizePositiveInt(existing.system?.quantity, 0);
        const quantityResult = calculateGrantedQuantity({
            existingQuantity: currentQty,
            templateQuantity: baseQty,
            requestedQuantity: safeQuantity,
            overrideExistingQuantity
        });
        await existing.update({
            "system.quantity": quantityResult.nextQuantity
        });
        return existing;
    }

    const quantityResult = calculateGrantedQuantity({
        existingQuantity: 0,
        templateQuantity: baseQty,
        requestedQuantity: safeQuantity,
        overrideExistingQuantity
    });

    doc.type = "gear";
    doc.img = String(doc.img ?? "").trim() || "systems/laundry-rpg/icons/generated/_defaults/gear.webp";
    doc.system = {
        ...(doc.system ?? {}),
        quantity: quantityResult.addedQuantity,
        weight: Math.max(0, Number(doc?.system?.weight ?? 0) || 0)
    };

    const created = await actor.createEmbeddedDocuments("Item", [doc]);
    return created?.[0] ?? null;
}

function _buildFallbackGearItemData(line, quantity) {
    const name = String(line?.name ?? "Requisition Item").trim() || "Requisition Item";
    const summary = String(line?.summary ?? "").trim();
    const requirements = String(line?.requirements ?? "").trim();
    const source = String(line?.source ?? "").trim();
    const descriptionParts = [
        summary,
        requirements ? `Requirements: ${requirements}` : "",
        source ? `Source: ${source}` : ""
    ].filter(Boolean);

    return {
        name,
        type: "gear",
        img: "systems/laundry-rpg/icons/generated/_defaults/gear.webp",
        system: {
            description: descriptionParts.join("\n"),
            quantity: sanitizePositiveInt(quantity, 1),
            weight: 0
        }
    };
}

async function _resolveCompendiumTemplateByName(itemName, cache = new Map()) {
    const normalized = _normalizeName(itemName);
    if (!normalized) return null;

    for (const packId of REQUISITION_COMPENDIUM_PACKS) {
        const pack = game.packs?.get(packId) ?? null;
        if (!pack) continue;

        let index = cache.get(packId) ?? null;
        if (!index) {
            index = await pack.getIndex();
            cache.set(packId, index);
        }

        const exact = index.find(entry => _normalizeName(entry?.name ?? "") === normalized) ?? null;
        let picked = exact;
        if (!picked) {
            const scored = index
                .map(entry => ({
                    entry,
                    score: _nameTokenScore(normalized, _normalizeName(entry?.name ?? ""))
                }))
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score);
            picked = scored[0]?.entry ?? null;
        }
        if (!picked?._id) continue;

        const doc = await pack.getDocument(picked._id);
        if (!doc) continue;
        return doc.toObject();
    }

    return null;
}

function _normalizeName(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function _nameTokenScore(left, right) {
    const leftName = String(left ?? "").trim();
    const rightName = String(right ?? "").trim();
    if (!leftName || !rightName) return 0;
    if (leftName.includes(rightName) || rightName.includes(leftName)) return 1;

    const leftParts = new Set(leftName.split(" ").filter(Boolean));
    const rightParts = new Set(rightName.split(" ").filter(Boolean));
    if (!leftParts.size || !rightParts.size) return 0;

    let overlap = 0;
    for (const token of leftParts) {
        if (rightParts.has(token)) overlap += 1;
    }

    return overlap >= 2 ? overlap : 0;
}

function _resolveApplicationRoot(app) {
    const element = app?.element ?? null;
    if (!element) return null;
    if (element instanceof HTMLElement) return element;
    if (Array.isArray(element) || typeof element.length === "number") return element[0] ?? null;
    return null;
}

async function _rerenderApp(app) {
    if (!app?.render) return;
    try {
        await app.render({ force: true });
    } catch (_err) {
        await app.render(true);
    }
}
