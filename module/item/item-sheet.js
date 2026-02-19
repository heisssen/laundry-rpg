export class LaundryItemSheet extends ItemSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "sheet", "item"],
            template: "systems/laundry-rpg/templates/item/item-sheet.html",
            width: 520,
            height: 480,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        const itemData = context.item;

        context.rollData = {};
        let actor = this.object?.parent ?? null;
        if (actor) {
            context.rollData = actor.getRollData();
        }

        context.system = itemData.system;
        context.flags = itemData.flags;

        return context;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        if (!this.options.editable) return;
        // Listeners for item sheet only events
    }
}
