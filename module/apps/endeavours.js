const APP_API = foundry.applications?.api ?? {};
const BaseApplication = APP_API.ApplicationV2 ?? Application;
const HandlebarsMixin = APP_API.HandlebarsApplicationMixin ?? (Base => Base);
const ENDEAVOUR_FLAG_SCOPE = "laundry-rpg";
const ENDEAVOUR_FLAG_KEY = "endeavours";

const ENDEAVOUR_CHOICES = [
    { id: "sick-leave-infirmary", label: "Sick Leave / Infirmary Shift" },
    { id: "training-course", label: "Training Course" },
    { id: "filing-paperwork", label: "Filing Paperwork" },
    { id: "family-vacation", label: "Family Vacation" },
    { id: "moonlighting", label: "Moonlighting" },
    { id: "performance-review", label: "Performance Review" },
    { id: "teambuilding", label: "Teambuilding" }
];

export class EndeavoursApp extends HandlebarsMixin(BaseApplication) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
            id: "laundry-endeavours",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-endeavours"],
            tag: "section",
            window: { title: "Endeavours - Downtime Activities" },
            position: { width: 600, height: "auto" }
        },
        { inplace: false }
    );

    static PARTS = {
        body: {
            template: "systems/laundry-rpg/templates/apps/endeavours.html"
        }
    };

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions ?? {}, {
            id: "laundry-endeavours",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-endeavours"],
            template: "systems/laundry-rpg/templates/apps/endeavours.html",
            title: "Endeavours - Downtime Activities",
            width: 600,
            height: "auto",
            resizable: true
        });
    }

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor ?? null;
        this._selectedEndeavour = ENDEAVOUR_CHOICES[0]?.id ?? "sick-leave-infirmary";
        this._selectedSkill = "";
        this._trainingStat = "training";
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
        const skills = _collectActorSkills(this.actor);
        if (!this._selectedSkill && skills.length) this._selectedSkill = skills[0].name;

        return {
            actorName: this.actor?.name ?? "Unknown Agent",
            endeavours: ENDEAVOUR_CHOICES.map(entry => ({
                ...entry,
                selected: entry.id === this._selectedEndeavour
            })),
            skills: skills.map(entry => ({
                ...entry,
                selected: entry.name === this._selectedSkill
            })),
            trainingStatOptions: [
                { id: "training", label: "Training", selected: this._trainingStat === "training" },
                { id: "focus", label: "Focus", selected: this._trainingStat === "focus" }
            ],
            isTrainingCourse: this._selectedEndeavour === "training-course"
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
        if (root.dataset?.laundryEndeavoursBound === "true") return;
        if (root.dataset) root.dataset.laundryEndeavoursBound = "true";

        root.querySelector('[name="endeavourId"]')?.addEventListener("change", async (ev) => {
            this._selectedEndeavour = String(ev.currentTarget?.value ?? "").trim();
            await _rerenderApp(this);
        });

        root.querySelector('[name="skillName"]')?.addEventListener("change", (ev) => {
            this._selectedSkill = String(ev.currentTarget?.value ?? "").trim();
        });

        root.querySelector('[name="trainingStat"]')?.addEventListener("change", (ev) => {
            this._trainingStat = String(ev.currentTarget?.value ?? "training").trim().toLowerCase();
        });

        root.querySelectorAll('[data-action="submit-endeavour"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._resolveSelectedEndeavour();
            });
        });
    }

    async _resolveSelectedEndeavour() {
        if (!this.actor) return;
        if (!(game.user?.isGM || this.actor.isOwner)) {
            ui.notifications.warn("Only the GM or actor owner can resolve downtime activities.");
            return;
        }

        switch (this._selectedEndeavour) {
            case "sick-leave-infirmary":
                await this._resolveSickLeaveOrInfirmaryShift();
                break;
            case "training-course":
                await this._resolveTrainingCourse();
                break;
            case "filing-paperwork":
                await this._resolveFilingPaperwork();
                break;
            case "family-vacation":
                await this._resolveFamilyVacation();
                break;
            case "moonlighting":
                await this._resolveMoonlighting();
                break;
            case "performance-review":
                await this._resolvePerformanceReview();
                break;
            case "teambuilding":
                await this._resolveTeambuilding();
                break;
            default:
                ui.notifications.warn("Unsupported Endeavour selection.");
                break;
        }
    }

    async _resolveSickLeaveOrInfirmaryShift() {
        const injuriesBefore = Math.max(0, Math.trunc(Number(this.actor.system?.derived?.injuries?.value) || 0));
        const injuriesAfter = Math.max(0, injuriesBefore - 1);
        if (injuriesAfter !== injuriesBefore) {
            await this.actor.update({ "system.derived.injuries.value": injuriesAfter });
        }

        const removedEffect = await _removeOneInjuryEffect(this.actor);
        await _patchEndeavourFlags(this.actor, {
            last_downtime_action: "sick-leave-infirmary",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const extra = removedEffect ? ` Removed effect: ${foundry.utils.escapeHTML(removedEffect.name)}.` : "";
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-endeavour-card">
                    <strong>DOWNTIME CLEARANCE MEMO // MEDICAL & PSYCHOLOGICAL</strong>
                    <p>Agent ${safeName} has been cleared by medical.</p>
                    <p>Injury Track: ${injuriesBefore} -> ${injuriesAfter}.${extra}</p>
                </div>`
        });

        ui.notifications.info(`${this.actor.name}: medical clearance logged.`);
    }

    async _resolveTrainingCourse() {
        const skillName = String(this._selectedSkill ?? "").trim();
        if (!skillName) {
            ui.notifications.warn("Select a skill for Training Course.");
            return;
        }

        const stat = this._trainingStat === "focus" ? "focus" : "training";
        const xpBefore = Math.max(0, Math.trunc(Number(this.actor.system?.details?.xp?.unspent) || 0));
        if (xpBefore < 5) {
            ui.notifications.warn("Training Course requires at least 5 unspent XP.");
            return;
        }

        const skill = await _getOrCreateSkill(this.actor, skillName);
        const current = Math.max(0, Math.trunc(Number(skill.system?.[stat]) || 0));
        const next = current + 1;
        await skill.update({ [`system.${stat}`]: next });
        await this.actor.update({ "system.details.xp.unspent": xpBefore - 5 });

        await _patchEndeavourFlags(this.actor, {
            training_refund_pending: true,
            training_refund_amount: 1,
            training_refund_skill: skillName,
            training_refund_stat: stat,
            last_downtime_action: "training-course",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const safeSkill = foundry.utils.escapeHTML(skillName);
        const safeStat = stat === "focus" ? "Focus" : "Training";
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-endeavour-card">
                    <strong>TRAINING COURSE COMPLETION FORM</strong>
                    <p>Agent ${safeName} attended compulsory instruction.</p>
                    <p>${safeSkill}: ${safeStat} ${current} -> ${next}</p>
                    <p>XP Debited: 5 (unspent ${xpBefore} -> ${xpBefore - 5})</p>
                    <p>Flagged for post-course refund on passing: +1 XP.</p>
                </div>`
        });

        ui.notifications.info(`${this.actor.name}: training course logged.`);
    }

    async _resolveFilingPaperwork() {
        await _patchEndeavourFlags(this.actor, {
            paperwork_bonus: true,
            last_downtime_action: "filing-paperwork",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-endeavour-card">
                    <strong>PAPERWORK TRIAGE CERTIFICATE</strong>
                    <p>Agent ${safeName} has processed backlog requisition files.</p>
                    <p>Mechanical result: <code>flags.laundry-rpg.endeavours.paperwork_bonus = true</code>.</p>
                    <p>Next Requisition Support test gains +1 automatic success, then the bonus is consumed.</p>
                </div>`
        });
        ui.notifications.info(`${this.actor.name}: paperwork bonus queued.`);
    }

    async _resolveFamilyVacation() {
        await _patchEndeavourFlags(this.actor, {
            vacation_adrenaline: true,
            last_downtime_action: "family-vacation",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-endeavour-card">
                    <strong>LEAVE REQUEST // FAMILY VACATION</strong>
                    <p>Agent ${safeName} has completed Family Vacation paperwork.</p>
                    <p>Mechanical result: <code>flags.laundry-rpg.endeavours.vacation_adrenaline = true</code>.</p>
                    <p>At next mission start, gain +1 Adrenaline above normal maximum (one-time).</p>
                </div>`
        });
        ui.notifications.info(`${this.actor.name}: vacation adrenaline queued.`);
    }

    async _resolveMoonlighting() {
        await _patchEndeavourFlags(this.actor, {
            moonlighting_exhaustion: true,
            last_downtime_action: "moonlighting",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="laundry-endeavour-card">
                    <strong>UNDECLARED SECOND EMPLOYMENT NOTICE</strong>
                    <p>Agent ${safeName} accepted additional civilian work.</p>
                    <p>Mechanical result: <code>flags.laundry-rpg.endeavours.moonlighting_exhaustion = true</code>.</p>
                    <p>At next mission start, Weakened will be applied automatically.</p>
                </div>`
        });
        ui.notifications.info(`${this.actor.name}: moonlighting exhaustion queued.`);
    }

    async _resolvePerformanceReview() {
        const mind = Math.max(1, Math.trunc(Number(this.actor.system?.attributes?.mind?.value) || 1));
        const bureaucracy = this.actor.items.find(item =>
            item.type === "skill" && String(item.name ?? "").toLowerCase() === "bureaucracy"
        );
        const training = Math.max(0, Math.trunc(Number(bureaucracy?.system?.training) || 0));
        const pool = Math.max(1, mind + training);
        const dn = 4;
        const complexity = 2;

        const roll = new Roll(`${pool}d6`);
        await roll.evaluate();
        const dice = _extractRollDieValues(roll);
        const successes = dice.filter(value => value >= dn).length;
        const passed = successes >= complexity;

        await _patchEndeavourFlags(this.actor, {
            performance_xp: passed,
            last_downtime_action: "performance-review",
            last_downtime_at: Date.now()
        });

        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const gmWhisper = game.users
            .filter(user => user.isGM && user.active)
            .map(user => user.id);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            whisper: gmWhisper,
            content: `
                <div class="laundry-endeavour-card ${passed ? "laundry-endeavour-pass" : "laundry-endeavour-fail"}">
                    <strong>PERFORMANCE REVIEW DOSSIER</strong>
                    <p>Agent ${safeName}: Mind (Bureaucracy) ${pool}d6 vs DN ${dn}:${complexity}</p>
                    <p>Dice: ${dice.join(", ") || "-"} | Successes: ${successes}</p>
                    <p>Result: <strong>${passed ? "PASSED" : "FAILED"}</strong></p>
                    <p>${passed
                        ? "GM note: +1 XP if this agent meets KPI on the next mission."
                        : "No KPI XP rider generated."}</p>
                </div>`,
            rolls: [roll],
            sound: CONFIG.sounds?.dice
        });

        ui.notifications.info(`${this.actor.name}: performance review ${passed ? "passed" : "failed"}.`);
    }

    async _resolveTeambuilding() {
        const safeName = foundry.utils.escapeHTML(this.actor.name ?? "Agent");
        const gmWhisper = game.users
            .filter(user => user.isGM && user.active)
            .map(user => user.id);

        await _patchEndeavourFlags(this.actor, {
            last_downtime_action: "teambuilding",
            last_downtime_at: Date.now()
        });

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            whisper: gmWhisper,
            content: `
                <div class="laundry-endeavour-card">
                    <strong>TEAMBUILDING ACTIVITY LOG</strong>
                    <p>Agent ${safeName} took the team to the pub. Restore 1 point of Party Luck!</p>
                </div>`
        });

        ui.notifications.info(`${this.actor.name}: teambuilding note sent to GM.`);
    }
}

export async function openEndeavoursApp(actor) {
    if (!actor) return null;
    const existing = Object.values(ui.windows ?? {}).find(app =>
        app instanceof EndeavoursApp && app.rendered && app.actor?.id === actor.id
    );
    if (existing) {
        existing.bringToTop?.();
        return existing;
    }
    const app = new EndeavoursApp(actor);
    await app.render(true);
    return app;
}

export async function applyMissionStartEndeavourEffects() {
    if (!game.user?.isGM) return;
    const actors = game.actors
        .filter(actor => actor.type === "character");

    for (const actor of actors) {
        const flags = actor.getFlag(ENDEAVOUR_FLAG_SCOPE, ENDEAVOUR_FLAG_KEY) ?? {};
        if (!flags.vacation_adrenaline && !flags.moonlighting_exhaustion) continue;

        const updates = {};
        const notes = [];

        if (flags.vacation_adrenaline) {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.max) || 0));
            const boosted = Math.max(0, Math.min(max + 1, current + 1));
            if (boosted !== current) updates["system.derived.adrenaline.value"] = boosted;
            notes.push(`Vacation bonus applied: Adrenaline ${current} -> ${boosted}.`);
            flags.vacation_adrenaline = false;
        }

        if (flags.moonlighting_exhaustion) {
            await game.laundry?.applyCondition?.(actor, "weakened", {
                durationRounds: 0,
                source: "endeavour-moonlighting",
                suppressChat: true
            });
            notes.push("Moonlighting exhaustion applied: Weakened.");
            flags.moonlighting_exhaustion = false;
        }

        if (Object.keys(updates).length) {
            await actor.update(updates);
        }
        await actor.setFlag(ENDEAVOUR_FLAG_SCOPE, ENDEAVOUR_FLAG_KEY, flags);

        if (notes.length) {
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<p><strong>${foundry.utils.escapeHTML(actor.name ?? "Agent")}</strong>: ${foundry.utils.escapeHTML(notes.join(" "))}</p>`
            });
        }
    }
}

async function _patchEndeavourFlags(actor, patch = {}) {
    const current = actor.getFlag(ENDEAVOUR_FLAG_SCOPE, ENDEAVOUR_FLAG_KEY) ?? {};
    await actor.setFlag(ENDEAVOUR_FLAG_SCOPE, ENDEAVOUR_FLAG_KEY, {
        ...current,
        ...patch
    });
}

function _collectActorSkills(actor) {
    return Array.from(actor?.items ?? [])
        .filter(item => item.type === "skill")
        .map(item => ({ id: item.id, name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function _getOrCreateSkill(actor, skillName) {
    const existing = actor.items.find(item =>
        item.type === "skill" && String(item.name ?? "").toLowerCase() === String(skillName ?? "").toLowerCase()
    );
    if (existing) return existing;

    const skillDef = (CONFIG.LAUNDRY?.skills ?? []).find(entry =>
        String(entry?.name ?? "").toLowerCase() === String(skillName ?? "").toLowerCase()
    );
    const attribute = String(skillDef?.attribute ?? "mind").toLowerCase();
    const created = await actor.createEmbeddedDocuments("Item", [{
        name: skillName,
        type: "skill",
        img: "systems/laundry-rpg/icons/generated/_defaults/skill.svg",
        system: {
            attribute,
            training: 0,
            focus: 0,
            description: "Created by Endeavours automation."
        }
    }]);
    return created?.[0] ?? null;
}

async function _removeOneInjuryEffect(actor) {
    const injuryEffects = Array.from(actor.effects ?? [])
        .filter(effect => {
            const outcomeFlag = effect.getFlag?.("laundry-rpg", "outcomeEffect") ?? {};
            if (String(outcomeFlag?.type ?? "").toLowerCase() === "injury") return true;
            const name = String(effect.name ?? "").toLowerCase();
            return /\binjury\b|\bwound\b/.test(name);
        })
        .sort((a, b) => {
            const atA = Number(a.getFlag?.("laundry-rpg", "outcomeEffect")?.appliedAt ?? 0) || 0;
            const atB = Number(b.getFlag?.("laundry-rpg", "outcomeEffect")?.appliedAt ?? 0) || 0;
            return atA - atB;
        });
    const first = injuryEffects[0];
    if (!first) return null;
    await actor.deleteEmbeddedDocuments("ActiveEffect", [first.id]);
    return { id: first.id, name: first.name };
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

