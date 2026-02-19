import { rollDice } from "../dice.js";

export class LaundryItem extends Item {

    /** @override */
    prepareData() {
        super.prepareData();
    }

    /**
     * Handle item roll — dispatches to the appropriate handler by type.
     */
    async roll({ quick = false } = {}) {
        switch (this.type) {
            case "skill":
                return this._rollSkill({ quick });
            case "weapon":
                return this._rollWeapon({ quick });
            case "spell":
                return this._rollSpell({ quick });
            default:
                return this._postDescription();
        }
    }

    // ─── Skill roll ───────────────────────────────────────────────────────────

    async _rollSkill({ quick = false } = {}) {
        const actor = this.actor;
        if (!actor) return;

        const attrName  = this.system.attribute ?? "mind";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = this.system.training ?? 0;
        const pool      = attrValue + training;

        return rollDice({
            pool,
            flavor: `${this.name} (${attrName.charAt(0).toUpperCase() + attrName.slice(1)} ${attrValue} + Training ${training})`,
            actorId: actor.id,
            focusItemId: this.id
        });
    }

    // ─── Weapon roll ──────────────────────────────────────────────────────────

    async _rollWeapon({ quick = false } = {}) {
        const actor = this.actor;
        if (!actor) return;

        // Look up the linked skill (e.g. "Close Combat" or "Ranged")
        const linkedSkillName = this.system.skill ?? "Close Combat";
        const linkedSkill     = actor.items.find(
            i => i.type === "skill" && i.name === linkedSkillName
        );

        const attrName  = linkedSkill?.system.attribute ?? "body";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = linkedSkill?.system.training ?? 0;
        const pool      = attrValue + training;

        return rollDice({
            pool,
            flavor: `Attack with ${this.name} (${linkedSkillName})`,
            damage: this.system.damage,
            actorId: actor.id,
            focusItemId: linkedSkill?.id
        });
    }

    // ─── Spell roll ───────────────────────────────────────────────────────────

    async _rollSpell({ quick = false } = {}) {
        const actor = this.actor;
        if (!actor) return;

        const magicSkill = actor.items.find(
            i => i.type === "skill" && i.name === "Magic"
        );
        const attrName  = magicSkill?.system.attribute ?? "mind";
        const attrValue = actor.system.attributes[attrName]?.value ?? 1;
        const training  = magicSkill?.system.training ?? 0;
        const pool      = attrValue + training;
        const dn        = this.system.dn ?? 4;
        const complexity = this.system.complexity ?? this.system.level ?? 1;

        return rollDice({
            pool,
            dn,
            complexity,
            flavor: `Cast ${this.name} (Magic — Level ${this.system.level ?? 1}, DN ${dn}:${complexity})`,
            actorId: actor.id,
            focusItemId: magicSkill?.id
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
