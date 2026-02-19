import { rollDice } from "../dice.js";

export class LaundryActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "sheet", "actor"],
            template: "systems/laundry-rpg/templates/actor/actor-sheet.html",
            width: 640,
            height: 680,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }],
            dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        const actorData = context.actor.system;

        context.system = actorData;
        context.flags  = context.actor.flags;

        // Pass system config to templates (used by {{selectOptions}})
        context.config = CONFIG.LAUNDRY;

        // Sort items by type for convenience
        context.skills     = context.items.filter(i => i.type === "skill");
        context.talents    = context.items.filter(i => i.type === "talent");
        context.gear       = context.items.filter(i => ["gear", "weapon", "armour"].includes(i.type));
        context.spells     = context.items.filter(i => i.type === "spell");

        // The Ladder combat ratings
        context.ladder = {
            melee:    this._getLadderRating(
                actorData.attributes.body.value,
                this._getSkillTraining(context.items, "Close Combat")
            ),
            accuracy: this._getLadderRating(
                actorData.attributes.body.value,
                this._getSkillTraining(context.items, "Ranged Combat")
            ),
            defence:  this._getLadderRating(
                actorData.attributes.body.value,
                this._getSkillTraining(context.items, "Reflexes")
            )
        };

        // NPC-only extras
        context.isNpc       = context.actor.type === "npc";
        context.isCharacter = context.actor.type === "character";

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
                title: "Delete Item",
                content: `<p>Delete <strong>${item.name}</strong>?</p>`
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

    _onRoll(ev) {
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

        // Attribute roll (data-roll-type="attribute" data-attribute="body")
        if (dataset.rollType === "attribute") {
            const attrName = dataset.attribute;
            const attrVal  = this.actor.system.attributes[attrName]?.value ?? 1;
            return rollDice({
                pool:   attrVal,
                focus:  0,
                flavor: `Rolling ${attrName.charAt(0).toUpperCase() + attrName.slice(1)}`
            });
        }
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

        for (const skillName of skillNames) {
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
        }

        // Equipment
        if (sys.equipment) {
            const equipList = sys.equipment.split(",").map(s => s.trim()).filter(Boolean);
            const items = equipList.map(name => ({
                name, type: "gear",
                img: "icons/svg/item-bag.svg",
                system: { quantity: 1, weight: 0 }
            }));
            if (items.length) await this.actor.createEmbeddedDocuments("Item", items);
        }

        ui.notifications.info(`Laundry RPG | Applied Assignment: ${assignmentData.name}`);
    }
}
