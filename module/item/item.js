import { rollDice } from "../dice.js";

export class LaundryItem extends Item {

    /** @override */
    prepareData() {
        super.prepareData();
    }

    /**
     * Handle item roll — dispatches to the appropriate handler by type.
     */
    async roll() {
        switch (this.type) {
            case "skill":
                return this._rollSkill();
            case "weapon":
                return this._rollWeapon();
            case "spell":
                return this._rollSpell();
            default:
                return this._postDescription();
        }
    }

    // ─── Skill roll ───────────────────────────────────────────────────────────

    async _rollSkill() {
        const actor = this.actor;
        if (!actor) return;

        const attrName  = this.system.attribute ?? "mind";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = this.system.training ?? 0;
        const focus     = this.system.focus     ?? 0;
        const pool      = attrValue + training;

        return rollDice({
            pool,
            focus,
            flavor: `${this.name} (${attrName.charAt(0).toUpperCase() + attrName.slice(1)} ${attrValue} + Training ${training})`
        });
    }

    // ─── Weapon roll ──────────────────────────────────────────────────────────

    async _rollWeapon() {
        const actor = this.actor;
        if (!actor) return;

        // Look up the linked skill (e.g. "Close Combat" or "Ranged Combat")
        const linkedSkillName = this.system.skill ?? "Close Combat";
        const linkedSkill     = actor.items.find(
            i => i.type === "skill" && i.name === linkedSkillName
        );

        const attrName  = linkedSkill?.system.attribute ?? "body";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = linkedSkill?.system.training ?? 0;
        const focus     = linkedSkill?.system.focus     ?? 0;
        const pool      = attrValue + training;

        return rollDice({
            pool,
            focus,
            flavor: `Attack with ${this.name} (${linkedSkillName})`,
            damage: this.system.damage
        });
    }

    // ─── Spell roll ───────────────────────────────────────────────────────────

    async _rollSpell() {
        const actor = this.actor;
        if (!actor) return;

        const magicSkill = actor.items.find(
            i => i.type === "skill" && i.name === "Magic"
        );
        const attrName  = magicSkill?.system.attribute ?? "mind";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = magicSkill?.system.training ?? 0;
        const focus     = magicSkill?.system.focus     ?? 0;
        const pool      = attrValue + training;

        return rollDice({
            pool,
            focus,
            flavor: `Cast ${this.name} (Magic — Level ${this.system.level ?? 1}, Cost: ${this.system.cost || "—"})`
        });
    }

    // ─── Description post ─────────────────────────────────────────────────────

    async _postDescription() {
        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<h3>${this.name}</h3>${this.system.description ?? ""}`
        });
    }
}
