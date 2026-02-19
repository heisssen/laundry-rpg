export class LaundryItemSheet extends ItemSheet {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "sheet", "item"],
            template: "systems/laundry-rpg/templates/item/item-sheet.html",
            width: 520,
            height: 500,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
        });
    }

    /** @override */
    getData() {
        const context  = super.getData();
        context.system = context.item.system;
        context.flags  = context.item.flags;
        context.config = CONFIG.LAUNDRY;

        // Roll data from parent actor (for formula enrichment if needed)
        const actor = this.object?.parent ?? null;
        context.rollData = actor ? actor.getRollData() : {};

        return context;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.isEditable) return;
    }
}
