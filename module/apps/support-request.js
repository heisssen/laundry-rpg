import { DEPARTMENT_SUPPORT_TABLE } from "../utils/supervisors-guide-data.js";

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
            window: { title: "Departmental Requisition Support" },
            position: { width: 520, height: "auto" }
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
            title: "Departmental Requisition Support",
            width: 520,
            height: "auto",
            resizable: true
        });
    }

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor ?? null;
        this._selectedDepartment = DEPARTMENT_SUPPORT_TABLE[0]?.id ?? "";
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
        const departments = DEPARTMENT_SUPPORT_TABLE.map(entry => ({
            ...entry,
            selected: entry.id === this._selectedDepartment
        }));
        const selected = departments.find(entry => entry.id === this._selectedDepartment) ?? departments[0] ?? null;
        return {
            actorName: this.actor?.name ?? "Unknown Agent",
            departments,
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

        const department = DEPARTMENT_SUPPORT_TABLE.find(entry => entry.id === this._selectedDepartment) ?? null;
        if (!department) {
            ui.notifications.warn("Select a department first.");
            return;
        }

        const mind = Math.max(1, Math.trunc(Number(this.actor.system?.attributes?.mind?.value) || 1));
        const bureaucracy = this.actor.items.find(item =>
            item.type === "skill" && String(item.name ?? "").toLowerCase() === "bureaucracy"
        );
        const training = Math.max(0, Math.trunc(Number(bureaucracy?.system?.training) || 0));
        const pool = Math.max(1, mind + training);

        const roll = new Roll(`${pool}d6`);
        await roll.evaluate();
        const dieResults = _extractRollDieValues(roll);
        const successes = dieResults.filter(value => value >= department.dn).length;
        const endeavourFlags = this.actor.getFlag(FLAG_SCOPE, ENDEAVOURS_FLAG) ?? {};
        const consumedPaperworkBonus = Boolean(endeavourFlags?.paperwork_bonus);
        const totalSuccesses = successes + (consumedPaperworkBonus ? 1 : 0);
        const approved = totalSuccesses >= department.complexity;

        const updatedFlags = {
            ...endeavourFlags,
            paperwork_bonus: false,
            last_support_request: {
                at: Date.now(),
                departmentId: department.id,
                departmentName: department.name,
                dn: department.dn,
                complexity: department.complexity,
                pool,
                roll: dieResults,
                successes,
                bonusSuccess: consumedPaperworkBonus ? 1 : 0,
                totalSuccesses,
                approved
            }
        };
        await this.actor.setFlag(FLAG_SCOPE, ENDEAVOURS_FLAG, updatedFlags);

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const safeDepartment = foundry.utils.escapeHTML(department.name);
        const safeSummary = foundry.utils.escapeHTML(department.summary);
        const rollText = dieResults.join(", ") || "-";
        const verdict = approved ? "APPROVED" : "DENIED";
        const verdictClass = approved ? "laundry-support-approved" : "laundry-support-denied";
        const freeSuccessText = consumedPaperworkBonus
            ? "Filing Paperwork bonus consumed: +1 automatic success."
            : "No Filing Paperwork bonus available.";

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-support-card ${verdictClass}">
                    <strong>DEPARTMENTAL SUPPORT REQUEST: ${safeDepartment}</strong>
                    <p><strong>Requester:</strong> ${safeName}</p>
                    <p><strong>Test:</strong> Mind (Bureaucracy) DN ${department.dn}:${department.complexity}</p>
                    <p><strong>Pool:</strong> ${pool}d6 (${rollText})</p>
                    <p><strong>Successes:</strong> ${successes}${consumedPaperworkBonus ? " + 1 paperwork bonus" : ""} = ${totalSuccesses}</p>
                    <p><strong>Outcome:</strong> ${verdict}</p>
                    <p><strong>Department Effect:</strong> ${safeSummary}</p>
                    <p>${foundry.utils.escapeHTML(freeSuccessText)}</p>
                </div>`,
            rolls: [roll],
            sound: CONFIG.sounds?.dice
        });

        ui.notifications.info(`${department.name}: ${approved ? "support approved." : "support denied."}`);
        await _rerenderApp(this);
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
