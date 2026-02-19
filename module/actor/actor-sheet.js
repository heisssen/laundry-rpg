import { rollDice } from "../dice.js";

export class LaundryActorSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "sheet", "actor"],
            template: "systems/laundry-rpg/templates/actor/actor-sheet.html",
            width: 600,
            height: 600,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        const actorData = context.actor.system;

        context.system = actorData;
        context.flags = context.actor.flags;

        // Add lookup tables for The Ladder
        context.ladder = {
            melee: this._getLadderRating(actorData.attributes.body.value, this._getSkillTotal(context.items, "Close Combat")),
            accuracy: this._getLadderRating(actorData.attributes.mind.value, this._getSkillTotal(context.items, "Ranged Combat")),
            defence: this._getLadderRating(actorData.attributes.body.value, this._getSkillTotal(context.items, "Reflexes"))
        };

        return context;
    }

    _getSkillTotal(items, skillName) {
        if (!items) return 0;
        const skill = items.find(i => i.type === 'skill' && i.name === skillName);
        return skill ? skill.system.training : 0;
    }

    _getLadderRating(attribute, training) {
        const total = attribute + training;
        if (total >= 12) return "Unprecedented";
        if (total >= 10) return "Extraordinary";
        if (total >= 8) return "Superb";
        if (total >= 6) return "Great";
        if (total >= 4) return "Good";
        if (total >= 2) return "Average";
        return "Poor";
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        // Add Inventory Item
        html.find('.item-create').click(this._onItemCreate.bind(this));

        // Edit Inventory Item
        html.find('.item-edit').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.sheet.render(true);
        });

        // Delete Inventory Item
        html.find('.item-delete').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
            li.slideUp(200, () => this.render(false));
        });

        // Rollable attributes
        html.find('.rollable').click(this._onRoll.bind(this));
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        const type = header.dataset.type; // skill, gear, etc.
        const data = duplicate(header.dataset);
        const name = `New ${type.capitalize()}`;
        const itemData = {
            name: name,
            type: type,
            system: data
        };
        delete itemData.system["type"];
        return await Item.create(itemData, { parent: this.actor });
    }

    _onRoll(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const dataset = element.dataset;

        if (dataset.rollType) {
            if (dataset.rollType == 'item') {
                const itemId = element.closest('.item').dataset.itemId;
                const item = this.actor.items.get(itemId);
                if (item) return item.roll();
            }
        }

        // Handle attribute rolls or custom rolls
        // For now, let's assume skills are rolled via the item.roll() method, 
        // but attributes might be rolled directly?
        // In Laundry, it's usually Attribute + Skill.
        // So we might need a generic roll dialog here.
    }
}
