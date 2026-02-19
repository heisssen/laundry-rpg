import { rollDice } from "../dice.js";

export class LaundryItem extends Item {
    /** @override */
    prepareData() {
        super.prepareData();
    }

    async roll() {
        // Basic roll behavior for items
        // If it's a skill, we roll Attribute + Skill Level

        if (this.type === 'skill') {
            const actor = this.actor;
            if (!actor) return;

            const attrName = this.system.attribute;
            const attrValue = actor.system.attributes[attrName]?.value || 0;
            const skillName = this.name;
            const training = this.system.training;
            const focus = this.system.focus;

            const pool = attrValue + training;

            // Call the dice roller
            await rollDice({
                pool: pool,
                focus: focus,
                flavor: `Rolling ${skillName} (${attrName.capitalize()})`
            });
        } else {
            // Just post description to chat for now?
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `<h3>${this.name}</h3>${this.system.description || ""}`
            });
        }
    }
}
