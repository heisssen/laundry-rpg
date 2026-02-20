import {
    DEPARTMENT_SUPPORT_TABLE,
    GEAR_REQUISITION_TABLE
} from "../utils/supervisors-guide-data.js";

const APP_API = foundry.applications?.api ?? {};
const BaseApplication = APP_API.ApplicationV2 ?? Application;
const HandlebarsMixin = APP_API.HandlebarsApplicationMixin ?? (Base => Base);
const FLAG_SCOPE = "laundry-rpg";
const ENDEAVOURS_FLAG = "endeavours";

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
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
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
        const selectedGear = gearRows.find(entry => entry.id === this._selectedGear) ?? gearRows[0] ?? null;

        const gearCategories = Array.from(new Set(gearRows.map(entry => entry.category))).map(category => ({
            name: category,
            entries: gearRows.filter(entry => entry.category === category)
        }));

        const selected = this._requestType === "gear" ? selectedGear : selectedDepartment;
        const methodOptions = [
            { id: "paperwork", label: "Paperwork // Mind (Bureaucracy)", selected: this._requestMethod === "paperwork" },
            { id: "in-person", label: "In-Person // Mind (Presence)", selected: this._requestMethod === "in-person" }
        ];

        return {
            actorName: this.actor?.name ?? "Unknown Agent",
            requestTypes,
            requestType: this._requestType,
            showMethodSelector: this._requestType === "gear",
            methodOptions,
            departments,
            gearCategories,
            selected
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
        if (root.dataset?.laundrySupportBound === "true") return;
        if (root.dataset) root.dataset.laundrySupportBound = "true";

        const select = root.querySelector('[name="departmentId"]');
        if (select) {
            select.addEventListener("change", async (ev) => {
                this._selectedDepartment = String(ev.currentTarget?.value ?? "").trim();
                await _rerenderApp(this);
            });
        }

        const requestType = root.querySelector('[name="requestType"]');
        if (requestType) {
            requestType.addEventListener("change", async (ev) => {
                const next = String(ev.currentTarget?.value ?? "").trim().toLowerCase();
                this._requestType = next === "gear" ? "gear" : "department";
                await _rerenderApp(this);
            });
        }

        const gearSelect = root.querySelector('[name="gearId"]');
        if (gearSelect) {
            gearSelect.addEventListener("change", async (ev) => {
                this._selectedGear = String(ev.currentTarget?.value ?? "").trim();
                await _rerenderApp(this);
            });
        }

        const methodSelect = root.querySelector('[name="requestMethod"]');
        if (methodSelect) {
            methodSelect.addEventListener("change", (ev) => {
                const next = String(ev.currentTarget?.value ?? "").trim().toLowerCase();
                this._requestMethod = next === "in-person" ? "in-person" : "paperwork";
            });
        }

        root.querySelectorAll('[data-action="request-support"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._onRequestSupport();
            });
        });
    }

    async _onRequestSupport() {
        if (!this.actor) return;
        if (!(game.user?.isGM || this.actor.isOwner)) {
            ui.notifications.warn("Only the GM or actor owner can request departmental support.");
            return;
        }

        const requestEntry = this._resolveSelectedEntry();
        if (!requestEntry) {
            ui.notifications.warn("Select a support line first.");
            return;
        }

        const testSkill = this._resolveTestSkillName();
        const testMethodLabel = this._requestType === "gear"
            ? (this._requestMethod === "in-person" ? "In-Person Requisition" : "Paperwork Requisition")
            : "Department Support Request";

        const mind = Math.max(1, Math.trunc(Number(this.actor.system?.attributes?.mind?.value) || 1));
        const skillItem = this.actor.items.find(item =>
            item.type === "skill" && String(item.name ?? "").toLowerCase() === testSkill.toLowerCase()
        );
        const training = Math.max(0, Math.trunc(Number(skillItem?.system?.training) || 0));
        const pool = Math.max(1, mind + training);

        const roll = new Roll(`${pool}d6`);
        await roll.evaluate();
        const dieResults = _extractRollDieValues(roll);
        const successes = dieResults.filter(value => value >= requestEntry.dn).length;
        const endeavourFlags = this.actor.getFlag(FLAG_SCOPE, ENDEAVOURS_FLAG) ?? {};
        const consumedPaperworkBonus = Boolean(endeavourFlags?.paperwork_bonus);
        const totalSuccesses = successes + (consumedPaperworkBonus ? 1 : 0);
        const approved = totalSuccesses >= requestEntry.complexity;

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
                source: requestEntry.source ?? ""
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
        const rollText = dieResults.join(", ") || "-";
        const verdict = approved ? "APPROVED" : "DENIED";
        const verdictClass = approved ? "laundry-support-approved" : "laundry-support-denied";
        const freeSuccessText = consumedPaperworkBonus
            ? "Filing Paperwork bonus consumed: +1 automatic success."
            : "No Filing Paperwork bonus available.";
        const heading = this._requestType === "gear"
            ? "GEAR REQUISITION ORDER"
            : "DEPARTMENTAL SUPPORT REQUEST";

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-bureau-card laundry-support-card ${verdictClass}">
                    <div class="laundry-card-header">
                        <strong>${heading}: ${safeRequestName}</strong>
                        <span class="laundry-card-stamp">${verdict}</span>
                    </div>
                    <div class="laundry-card-body">
                        <p><strong>Requester:</strong> ${safeName}</p>
                        <p><strong>Line:</strong> ${safeCategory}</p>
                        <p><strong>Method:</strong> ${safeMethod}</p>
                        <p><strong>Test:</strong> Mind (${safeTestSkill}) DN ${requestEntry.dn}:${requestEntry.complexity}</p>
                        <p><strong>Pool:</strong> ${pool}d6 (${rollText})</p>
                        <p><strong>Successes:</strong> ${successes}${consumedPaperworkBonus ? " + 1 paperwork bonus" : ""} = ${totalSuccesses}</p>
                        ${safeRequirements ? `<p><strong>Requirements:</strong> ${safeRequirements}</p>` : ""}
                        <p><strong>Effect:</strong> ${safeSummary}</p>
                        <p>${foundry.utils.escapeHTML(freeSuccessText)}</p>
                        ${safeSource ? `<p class="laundry-card-reference">${safeSource}</p>` : ""}
                    </div>
                </div>`,
            rolls: [roll],
            sound: CONFIG.sounds?.dice
        });

        ui.notifications.info(`${requestEntry.name}: ${approved ? "approved." : "denied."}`);
        await _rerenderApp(this);
    }

    _resolveSelectedEntry() {
        if (this._requestType === "gear") {
            return GEAR_REQUISITION_TABLE.find(entry => entry.id === this._selectedGear) ?? GEAR_REQUISITION_TABLE[0] ?? null;
        }
        return DEPARTMENT_SUPPORT_TABLE.find(entry => entry.id === this._selectedDepartment) ?? DEPARTMENT_SUPPORT_TABLE[0] ?? null;
    }

    _resolveTestSkillName() {
        if (this._requestType === "gear" && this._requestMethod === "in-person") {
            return "Presence";
        }
        return "Bureaucracy";
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
