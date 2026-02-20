import { LaundryAttackDialog } from "../apps/attack-dialog.js";
import { getWeaponAttackContext, rollDice } from "../dice.js";

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
            focusItemId: this.id,
            rollContext: {
                sourceType: "skill",
                sourceName: this.name,
                attribute: attrName,
                isMagic: String(this.name ?? "").trim().toLowerCase() === "magic",
                isSpell: false
            }
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
        const complexity = 1;

        const attackContext = getWeaponAttackContext({
            actor,
            weapon: this,
            linkedSkillName
        });

        const focusAvailable = Math.max(0, Math.trunc(Number(linkedSkill?.system?.focus ?? 0) || 0));
        const adrenalineAvailable = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value ?? 0) || 0));
        const attackSelection = await LaundryAttackDialog.prompt({
            actor,
            weapon: this,
            attackContext,
            basePool: pool,
            complexity,
            focusAvailable,
            adrenalineAvailable
        });

        if (!attackSelection) return null;

        if (attackSelection.spendFocus) {
            if (!linkedSkill) {
                ui.notifications.warn(game.i18n.localize("LAUNDRY.FocusSkillMissing"));
                return null;
            }

            const currentFocus = Math.max(0, Math.trunc(Number(linkedSkill.system?.focus ?? 0) || 0));
            if (currentFocus <= 0) {
                ui.notifications.warn(game.i18n.localize("LAUNDRY.FocusUnavailableAttack"));
                return null;
            }

            await linkedSkill.update({ "system.focus": currentFocus - 1 });
        }

        if (attackSelection.spendAdrenaline) {
            const currentAdrenaline = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value ?? 0) || 0));
            if (currentAdrenaline <= 0) {
                ui.notifications.warn(game.i18n.localize("LAUNDRY.AdrenalineUnavailable"));
                return null;
            }

            await actor.update({
                "system.derived.adrenaline.value": currentAdrenaline - 1
            });
        }

        const modeLabel = attackContext.isMelee
            ? game.i18n.localize("LAUNDRY.AttackModeMelee")
            : game.i18n.localize("LAUNDRY.AttackModeRanged");

        return rollDice({
            pool: pool + (attackSelection.poolBonus ?? 0),
            dn: attackSelection.dn,
            complexity: attackSelection.complexity ?? complexity,
            flavor: game.i18n.format("LAUNDRY.AttackFlavor", {
                weapon: this.name,
                mode: modeLabel
            }),
            damage: this.system.damage,
            damageBonus: attackSelection.damageBonus ?? 0,
            isWeaponAttack: true,
            actorId: actor.id,
            focusItemId: linkedSkill?.id,
            allowPostRollFocus: false,
            prompt: false,
            targetSnapshot: attackSelection.target ?? null,
            attackMeta: {
                mode: attackContext.isMelee ? "melee" : "ranged",
                hasTarget: Boolean(attackContext.hasTarget),
                attackerRating: attackContext.attackerRating,
                defenceRating: attackContext.defenceRating,
                ladderDelta: attackContext.ladderDelta,
                focusSpentPreRoll: Boolean(attackSelection.spendFocus),
                adrenalineSpentPreRoll: Boolean(attackSelection.spendAdrenaline)
            },
            rollContext: {
                sourceType: "weapon",
                sourceName: this.name,
                skillName: linkedSkillName,
                attribute: attrName,
                attackMode: attackContext.isMelee ? "melee" : "ranged",
                isMagic: false,
                isSpell: false
            }
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
        const dn = Math.max(2, Math.min(6, Math.trunc(Number(this.system.dn ?? 4) || 4)));
        const complexity = Math.max(
            1,
            Math.trunc(Number(this.system.complexity ?? this.system.level ?? 1) || 1)
        );

        return rollDice({
            pool,
            dn,
            complexity,
            flavor: `Cast ${this.name} (Magic — Level ${this.system.level ?? 1}, DN ${dn}:${complexity})`,
            actorId: actor.id,
            focusItemId: magicSkill?.id,
            prompt: false,
            rollContext: {
                sourceType: "spell",
                sourceName: this.name,
                attribute: attrName,
                isMagic: true,
                isSpell: true
            }
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
