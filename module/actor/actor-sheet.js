import { rollDice } from "../dice.js";
import { LaundryCharacterBuilder } from "./character-builder.js";
import {
    KPI_HORIZONS,
    KPI_PRIORITIES,
    KPI_STATUSES,
    createNewKpi,
    normalizeKpiEntries,
    summarizeKpiEntries
} from "../utils/kpi.js";
import {
    describeTalentPrerequisiteResult,
    evaluateTalentPrerequisites
} from "../utils/talent-prerequisites.js";

const KPI_STATUS_CSS = {
    open: "kpi-open",
    completed: "kpi-completed",
    failed: "kpi-failed"
};

export class LaundryActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "sheet", "actor"],
            template: "systems/laundry-rpg/templates/actor/actor-sheet.html",
            width: 720,
            height: 720,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "dossier" }],
            dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        const actorData = context.actor?.system ?? {};
        const items = Array.isArray(context.items)
            ? context.items
            : this.actor.items.contents.map(i => i.toObject());

        context.system = actorData;
        context.flags  = context.actor.flags;

        // Pass system config to templates (used by {{selectOptions}})
        context.config = CONFIG.LAUNDRY;

        // Sort items by type for convenience
        context.skills     = items.filter(i => i.type === "skill");
        context.talents    = items
            .filter(i => i.type === "talent")
            .map(item => {
                const prereq = evaluateTalentPrerequisites(this.actor, item);
                const status = prereq.status;
                const statusLabel = status === "unmet"
                    ? game.i18n.localize("LAUNDRY.PrereqUnmet")
                    : (status === "review"
                        ? game.i18n.localize("LAUNDRY.PrereqReview")
                        : game.i18n.localize("LAUNDRY.PrereqMet"));
                return {
                    ...item,
                    prereqStatus: status,
                    prereqStatusLabel: statusLabel,
                    prereqSummary: describeTalentPrerequisiteResult(prereq),
                    prereqUnmet: prereq.unmet,
                    prereqManual: prereq.manual,
                    prereqCss: `talent-prereq-${status}`
                };
            });
        context.gear       = items
            .filter(i => ["gear", "weapon", "armour"].includes(i.type))
            .sort((a, b) => a.name.localeCompare(b.name));
        context.spells     = items.filter(i => i.type === "spell");
        context.weapons    = items.filter(i => i.type === "weapon");
        context.armour     = items.filter(i => i.type === "armour");
        context.miscGear   = items.filter(i => i.type === "gear");
        const normalizedKpi = normalizeKpiEntries(actorData.kpi);
        const kpiSummary = summarizeKpiEntries(normalizedKpi);
        context.kpiSummary = kpiSummary;
        context.kpiOptions = {
            horizons: KPI_HORIZONS.map(option => ({
                key: option.key,
                label: game.i18n.localize(option.labelKey)
            })),
            priorities: KPI_PRIORITIES.map(option => ({
                key: option.key,
                label: game.i18n.localize(option.labelKey)
            })),
            statuses: KPI_STATUSES.map(option => ({
                key: option.key,
                label: game.i18n.localize(option.labelKey)
            }))
        };
        context.kpiGroups = KPI_HORIZONS.map(group => ({
            key: group.key,
            label: game.i18n.localize(group.labelKey),
            entries: normalizedKpi
                .filter(entry => entry.horizon === group.key)
                .map(entry => ({
                    ...entry,
                    statusCss: KPI_STATUS_CSS[entry.status] ?? "kpi-open",
                    resolved: entry.status === "completed" || entry.status === "failed"
                }))
        }));

        const skillItemsByName = new Map(context.skills.map(s => [s.name, s]));
        const skillDefs = CONFIG.LAUNDRY.skills ?? [];
        context.skillRows = skillDefs.map(def => {
            const item = skillItemsByName.get(def.name);
            const attribute = item?.system?.attribute ?? def.attribute ?? "mind";
            const attrValue = actorData.attributes?.[attribute]?.value ?? 1;
            const training = item?.system?.training ?? 0;
            const focus = item?.system?.focus ?? 0;
            return {
                name: def.name,
                itemId: item?._id ?? null,
                attribute,
                attributeLabel: CONFIG.LAUNDRY.attributes?.[attribute]?.label ?? attribute,
                attrValue,
                training,
                focus,
                level: attrValue + training,
                trained: training > 0
            };
        });

        // The Ladder combat ratings now come from Actor derived data.
        context.ladder = {
            melee: actorData.derived?.melee?.label ?? "Poor",
            accuracy: actorData.derived?.accuracy?.label ?? "Poor",
            defence: actorData.derived?.defence?.label ?? "Poor"
        };

        // NPC-only extras
        context.isNpc       = context.actor.type === "npc";
        context.isCharacter = context.actor.type === "character";
        context.hasAssignment = !!actorData.details?.assignment;

        const activeCombatant = game.combat?.combatant ?? null;
        const isActorTurn = Boolean(activeCombatant?.actor?.id === this.actor.id);
        context.combat = {
            isActorTurn,
            canEndTurn: isActorTurn && Boolean(game.user?.isGM || activeCombatant?.actor?.isOwner)
        };

        return context;
    }

    // ─── Ladder helpers ───────────────────────────────────────────────────────

    _getSkillTraining(items, skillName) {
        if (!items) return 0;
        const skill = items.find(i => i.type === "skill" && i.name === skillName);
        return skill ? (skill.system.training ?? 0) : 0;
    }

    _getLadderRating(attribute, training) {
        const total   = (attribute ?? 1) + (training ?? 0);
        const ladder  = CONFIG.LAUNDRY.ladder;
        const matched = ladder.find(entry => total >= entry.min);
        return matched ? matched.label : "Poor";
    }

    // ─── Listeners ────────────────────────────────────────────────────────────

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Render only for owners
        if (!this.isEditable) return;

        // Item creation
        html.find(".item-create").click(this._onItemCreate.bind(this));
        html.find(".skill-adjust").click(this._onSkillAdjust.bind(this));
        html.find(".skill-attr").change(this._onSkillAttributeChange.bind(this));
        html.find(".inv-tab").click(this._onInventoryTab.bind(this));
        html.find(".inv-search").on("input", this._onInventorySearch.bind(this));
        html.find(".init-agent").click(this._onInitAgent.bind(this));
        html.find(".end-turn").click(this._onEndTurn.bind(this));
        html.find(".bio-autofill").click(this._onBioAutofill.bind(this));
        html.find(".kpi-add").click(this._onKpiAdd.bind(this));
        html.find(".kpi-delete").click(this._onKpiDelete.bind(this));
        html.on("change", ".kpi-field", (ev) => this._onKpiFieldChange(ev));

        // Item editing
        html.find(".item-edit").click(ev => {
            const li   = ev.currentTarget.closest(".item");
            const item = this.actor.items.get(li.dataset.itemId);
            item?.sheet.render(true);
        });

        // Item deletion
        html.find(".item-delete").click(async ev => {
            const li   = ev.currentTarget.closest(".item");
            const item = this.actor.items.get(li.dataset.itemId);
            if (!item) return;
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("LAUNDRY.DeleteItem"),
                content: `<p>${game.i18n.format("LAUNDRY.DeleteItemConfirm", { name: item.name })}</p>`
            });
            if (confirmed) {
                await this.actor.deleteEmbeddedDocuments("Item", [li.dataset.itemId]);
                li.remove();
            }
        });

        // Equip toggle (weapons / armour)
        html.find(".item-equip").click(ev => {
            const li   = ev.currentTarget.closest(".item");
            const item = this.actor.items.get(li.dataset.itemId);
            if (!item) return;
            item.update({ "system.equipped": !item.system.equipped });
        });

        // Rollable items and attributes
        html.find(".rollable").click(this._onRoll.bind(this));
    }

    // ─── Item creation ────────────────────────────────────────────────────────

    async _onItemCreate(ev) {
        ev.preventDefault();
        const header = ev.currentTarget;
        const type   = header.dataset.type;
        const name   = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        const data   = foundry.utils.deepClone(header.dataset);
        delete data.type;

        return Item.create({ name, type, system: data }, { parent: this.actor });
    }

    // ─── Rolling ──────────────────────────────────────────────────────────────

    async _onRoll(ev) {
        ev.preventDefault();
        const el      = ev.currentTarget;
        const dataset = el.dataset;

        // Skill / item roll
        if (dataset.rollType === "item") {
            const li   = el.closest(".item");
            const item = this.actor.items.get(li?.dataset.itemId);
            if (item) return item.roll();
            return;
        }

        if (dataset.rollType === "skill") {
            const skillName = dataset.skillName;
            const attribute = dataset.attribute ?? "mind";
            let skillItem = this.actor.items.find(i => i.type === "skill" && i.name === skillName);

            if (!skillItem && this.actor.isOwner) {
                skillItem = await this._getOrCreateSkillItem(skillName, attribute);
            }
            if (skillItem) return skillItem.roll();

            const attrVal = this.actor.system.attributes?.[attribute]?.value ?? 1;
            return rollDice({
                pool: attrVal,
                complexity: 1,
                flavor: `${skillName} (${attribute.charAt(0).toUpperCase() + attribute.slice(1)} ${attrVal})`,
                actorId: this.actor.id
            });
        }

        // Attribute roll (data-roll-type="attribute" data-attribute="body")
        if (dataset.rollType === "attribute") {
            const attrName = dataset.attribute;
            const attrVal  = this.actor.system.attributes[attrName]?.value ?? 1;
            return rollDice({
                pool:   attrVal,
                complexity: 1,
                actorId: this.actor.id,
                flavor: game.i18n.format("LAUNDRY.RollingAttribute", {
                    attribute: attrName.charAt(0).toUpperCase() + attrName.slice(1)
                })
            });
        }
    }

    _onInventoryTab(ev) {
        ev.preventDefault();
        const tab = ev.currentTarget.dataset.invTab ?? "all";
        const tabs = this.element.find(".inv-tab");
        tabs.removeClass("active");
        ev.currentTarget.classList.add("active");
        this._applyInventoryFilters();
    }

    _onInventorySearch(ev) {
        ev.preventDefault();
        this._applyInventoryFilters();
    }

    _applyInventoryFilters() {
        const activeTab = this.element.find(".inv-tab.active").data("invTab") ?? "all";
        const query = (this.element.find(".inv-search").val() ?? "").toString().trim().toLowerCase();
        const rows = this.element.find(".inv-row");
        rows.each((_, row) => {
            row.classList.remove("inv-hidden", "inv-search-hidden");
            const kind = row.dataset.invType ?? "all";
            const name = (row.querySelector(".item-name")?.textContent ?? "").toLowerCase();
            if (activeTab !== "all" && kind !== activeTab) row.classList.add("inv-hidden");
            if (query && !name.includes(query)) row.classList.add("inv-search-hidden");
        });
    }

    async _onSkillAdjust(ev) {
        ev.preventDefault();
        const btn = ev.currentTarget;
        const skillName = btn.dataset.skillName;
        const attribute = btn.dataset.attribute ?? "mind";
        const stat = btn.dataset.stat;
        const delta = Number(btn.dataset.delta ?? 0);
        if (!skillName || !stat || !["training", "focus"].includes(stat) || !delta) return;

        const skill = await this._getOrCreateSkillItem(skillName, attribute);
        const current = Number(skill.system?.[stat] ?? 0);
        const next = Math.max(0, Math.min(6, current + delta));
        if (next === current) return;

        await skill.update({ [`system.${stat}`]: next });
        this.render(false);
    }

    async _onSkillAttributeChange(ev) {
        const select = ev.currentTarget;
        const skillName = select.dataset.skillName;
        const attribute = select.value;
        if (!skillName || !attribute) return;

        const skill = await this._getOrCreateSkillItem(skillName, attribute);
        if ((skill.system?.attribute ?? "mind") === attribute) return;

        await skill.update({ "system.attribute": attribute });
        this.render(false);
    }

    async _getOrCreateSkillItem(skillName, attribute) {
        const existing = this.actor.items.find(i => i.type === "skill" && i.name === skillName);
        if (existing) return existing;

        const created = await this.actor.createEmbeddedDocuments("Item", [{
            name: skillName,
            type: "skill",
            img: "icons/svg/book.svg",
            system: {
                attribute,
                training: 0,
                focus: 0,
                description: ""
            }
        }]);
        return created?.[0] ?? this.actor.items.find(i => i.type === "skill" && i.name === skillName);
    }

    _onInitAgent(ev) {
        ev.preventDefault();
        if (!this.actor.isOwner) return;
        const existing = Object.values(ui.windows).find(app =>
            app instanceof LaundryCharacterBuilder
            && app.actor?.id === this.actor.id
            && app.rendered
        );
        if (existing) {
            existing.bringToTop();
            return;
        }
        const builder = new LaundryCharacterBuilder(this.actor);
        builder.render(true);
    }

    async _onEndTurn(ev) {
        ev.preventDefault();
        const combat = game.combat;
        if (!combat || !combat.combatant) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.NoActiveCombat"));
            return;
        }

        const activeCombatant = combat.combatant;
        if (activeCombatant.actor?.id !== this.actor.id) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.NotYourTurn"));
            return;
        }

        const canControl = game.user?.isGM || activeCombatant.actor?.isOwner;
        if (!canControl) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.NotYourTurn"));
            return;
        }

        await combat.nextTurn();
    }

    async _onBioAutofill(ev) {
        ev.preventDefault();
        const profile = this.actor.system?.details?.profile ?? {};
        const actorName = this.actor.name ?? "Unnamed Agent";
        const assignment = String(this.actor.system?.details?.assignment ?? "").trim();
        const lines = [];

        const codename = String(profile.codename ?? "").trim();
        lines.push(codename ? `${actorName} (${codename}) serves with The Laundry.` : `${actorName} serves with The Laundry.`);

        const background = String(profile.background ?? "").trim();
        const coverIdentity = String(profile.coverIdentity ?? "").trim();
        const shortGoal = String(profile.shortGoal ?? "").trim();
        const longGoal = String(profile.longGoal ?? "").trim();
        const notableIncident = String(profile.notableIncident ?? "").trim();
        const notes = String(profile.personalNotes ?? "").trim();

        if (assignment) lines.push(`Current assignment: ${assignment}.`);
        if (background) lines.push(`Background: ${background}.`);
        if (coverIdentity) lines.push(`Cover identity: ${coverIdentity}.`);
        if (shortGoal) lines.push(`Short-term objective: ${shortGoal}.`);
        if (longGoal) lines.push(`Long-term objective: ${longGoal}.`);
        if (notableIncident) lines.push(`Notable incident: ${notableIncident}.`);
        if (notes) lines.push(`Additional notes: ${notes}.`);

        const html = lines
            .map(line => `<p>${foundry.utils.escapeHTML(line)}</p>`)
            .join("");
        await this.actor.update({ "system.biography": html });
    }

    async _onKpiAdd(ev) {
        ev.preventDefault();
        const requested = String(ev.currentTarget?.dataset?.kpiHorizon ?? "short");
        const horizon = KPI_HORIZONS.some(option => option.key === requested)
            ? requested
            : "short";
        const kpis = this._getActorKpis();
        kpis.push(createNewKpi(horizon));
        await this.actor.update({ "system.kpi": kpis });
    }

    async _onKpiDelete(ev) {
        ev.preventDefault();
        const index = Number(ev.currentTarget.dataset.kpiIndex);
        if (!Number.isInteger(index) || index < 0) return;
        const kpis = this._getActorKpis();
        if (index >= kpis.length) return;
        kpis.splice(index, 1);
        await this.actor.update({ "system.kpi": kpis });
    }

    async _onKpiFieldChange(ev) {
        const index = Number(ev.currentTarget.dataset.kpiIndex);
        const key = String(ev.currentTarget.dataset.kpiKey ?? "");
        if (!Number.isInteger(index) || index < 0) return;
        const kpis = this._getActorKpis();
        if (!kpis[index]) return;

        switch (key) {
            case "text":
                kpis[index].text = String(ev.currentTarget.value ?? "");
                break;
            case "owner":
                kpis[index].owner = String(ev.currentTarget.value ?? "");
                break;
            case "horizon": {
                const value = String(ev.currentTarget.value ?? "");
                if (KPI_HORIZONS.some(option => option.key === value)) {
                    kpis[index].horizon = value;
                }
                break;
            }
            case "priority": {
                const value = String(ev.currentTarget.value ?? "");
                if (KPI_PRIORITIES.some(option => option.key === value)) {
                    kpis[index].priority = value;
                }
                break;
            }
            case "status": {
                const value = String(ev.currentTarget.value ?? "");
                if (KPI_STATUSES.some(option => option.key === value)) {
                    kpis[index].status = value;
                    if (value === "completed") kpis[index].progress = 100;
                }
                break;
            }
            case "progress": {
                const value = Number(ev.currentTarget.value ?? 0);
                const progress = Number.isFinite(value)
                    ? Math.max(0, Math.min(100, Math.trunc(value)))
                    : 0;
                kpis[index].progress = progress;
                if (progress >= 100 && kpis[index].status === "open") {
                    kpis[index].status = "completed";
                }
                break;
            }
            case "dueDate": {
                const value = String(ev.currentTarget.value ?? "").trim();
                kpis[index].dueDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
                break;
            }
            default:
                return;
        }

        await this.actor.update({ "system.kpi": kpis });
    }

    _getActorKpis() {
        return normalizeKpiEntries(this.actor.system?.kpi).map(entry => ({
            id: entry.id,
            text: entry.text,
            status: entry.status,
            horizon: entry.horizon,
            priority: entry.priority,
            dueDate: entry.dueDate,
            progress: entry.progress,
            owner: entry.owner
        }));
    }

    // ─── Drag & Drop: Assignment ───────────────────────────────────────────────

    /** @override */
    async _onDropItem(event, data) {
        if (!this.actor.isOwner) return false;

        const item     = await Item.implementation.fromDropData(data);
        const itemData = item.toObject();

        if (itemData.type === "assignment") {
            return this._applyAssignment(itemData);
        }

        if (itemData.type === "talent") {
            const prereq = evaluateTalentPrerequisites(this.actor, itemData);
            if (!prereq.enforceMet) {
                const details = describeTalentPrerequisiteResult(prereq);
                if (!game.user?.isGM) {
                    ui.notifications.warn(game.i18n.format("LAUNDRY.TalentPrereqBlocked", {
                        talent: itemData.name
                    }));
                    ui.notifications.warn(details);
                    return false;
                }

                const override = await Dialog.confirm({
                    title: game.i18n.localize("LAUNDRY.TalentPrereqOverrideTitle"),
                    content: `<p>${game.i18n.format("LAUNDRY.TalentPrereqOverrideBody", {
                        talent: itemData.name
                    })}</p><p>${details}</p>`
                });
                if (!override) return false;
            }
        }

        return super._onDropItem(event, data);
    }

    async _applyAssignment(assignmentData) {
        const sys = assignmentData.system;

        // Attributes
        await this.actor.update({
            "system.attributes.body.value":   sys.attributes.body,
            "system.attributes.mind.value":   sys.attributes.mind,
            "system.attributes.spirit.value": sys.attributes.spirit,
            "system.details.assignment":      assignmentData.name
        });

        // Skills
        const skillNames = typeof sys.coreSkills === "string"
            ? sys.coreSkills.split(",").map(s => s.trim()).filter(Boolean)
            : (Array.isArray(sys.coreSkills) ? sys.coreSkills : []);

        const existingSkillNames = new Set(this.actor.items
            .filter(i => i.type === "skill")
            .map(i => i.name));
        for (const skillName of skillNames) {
            if (existingSkillNames.has(skillName)) continue;
            const pack  = game.packs.get("laundry-rpg.skills");
            let skillItem = null;

            if (pack) {
                const index = await pack.getIndex();
                const entry = index.find(e => e.name === skillName);
                if (entry) skillItem = (await pack.getDocument(entry._id)).toObject();
            }

            skillItem ??= {
                name: skillName, type: "skill",
                img: "icons/svg/book.svg",
                system: { training: 1, focus: 0, attribute: "mind" }
            };

            await this.actor.createEmbeddedDocuments("Item", [skillItem]);
            existingSkillNames.add(skillName);
        }

        // Equipment
        if (sys.equipment) {
            const equipList = sys.equipment.split(",").map(s => s.trim()).filter(Boolean);
            const existingGear = new Set(this.actor.items
                .filter(i => ["gear", "weapon", "armour"].includes(i.type))
                .map(i => i.name.toLowerCase()));
            const items = equipList
                .filter(name => !existingGear.has(name.toLowerCase()))
                .map(name => ({
                name, type: "gear",
                img: "icons/svg/item-bag.svg",
                system: { quantity: 1, weight: 0 }
                }));
            if (items.length) await this.actor.createEmbeddedDocuments("Item", items);
        }

        ui.notifications.info(`Laundry RPG | Applied Assignment: ${assignmentData.name}`);
    }
}
