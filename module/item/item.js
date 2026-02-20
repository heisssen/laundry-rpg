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
        const traitProfile = _extractWeaponTraits(this.system?.traits);
        const ammoMax = Math.max(0, Math.trunc(Number(this.system?.ammoMax) || 0));
        const ammoCurrent = Math.max(0, Math.trunc(Number(this.system?.ammo) || 0));
        const usesAmmo = ammoMax > 0;

        if (usesAmmo && ammoCurrent <= 0 && traitProfile.reload) {
            const reloadConfirmed = await Dialog.confirm({
                title: "Reload Required",
                content: `<p><strong>${foundry.utils.escapeHTML(this.name ?? "Weapon")}</strong> is empty. Spend 1 Action to reload to ${ammoMax}?</p>`,
                classes: ["laundry-rpg", "laundry-dialog"]
            });
            if (reloadConfirmed) {
                const actionSpentForReload = await game.laundry?.consumeCombatAction?.(actor, { warn: true });
                if (actionSpentForReload === false) return null;
                await this.update({ "system.ammo": ammoMax });
                ui.notifications.info(`${this.name}: reloaded to ${ammoMax}.`);
            }
            return null;
        }

        if (usesAmmo && ammoCurrent <= 0) {
            ui.notifications.warn(`${this.name}: no ammunition remaining.`);
            return null;
        }

        const attackContext = getWeaponAttackContext({
            actor,
            weapon: this,
            linkedSkillName
        });
        let ammoRemaining = usesAmmo ? ammoCurrent : null;

        const adrenalineAvailable = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value ?? 0) || 0));
        const attackSelection = await LaundryAttackDialog.prompt({
            actor,
            weapon: this,
            attackContext,
            basePool: pool,
            complexity,
            traitProfile,
            ammo: {
                usesAmmo,
                current: ammoCurrent,
                max: ammoMax
            },
            adrenalineAvailable
        });

        if (!attackSelection) return null;

        const spendAdrenaline = Boolean(attackSelection.spendAdrenaline);
        const currentAdrenaline = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value ?? 0) || 0));
        if (spendAdrenaline && currentAdrenaline <= 0) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.AdrenalineUnavailable"));
            return null;
        }

        const ammoSpent = usesAmmo
            ? Math.max(1, Math.trunc(Number(attackSelection.ammoCost ?? 1) || 1))
            : 0;
        const latestAmmo = usesAmmo ? Math.max(0, Math.trunc(Number(this.system?.ammo) || 0)) : 0;
        if (usesAmmo && latestAmmo < ammoSpent) {
            ui.notifications.warn(`${this.name}: insufficient ammo for ${String(attackSelection.fireMode ?? "selected mode")}.`);
            return null;
        }

        let areaTemplateInfo = null;
        if (Boolean(attackSelection.areaMode) && Boolean(attackSelection.placeAreaTemplate)) {
            areaTemplateInfo = await _placeAreaTemplate({
                actor,
                targetSnapshot: attackSelection.target ?? null,
                distance: Math.max(1, Math.trunc(Number(attackSelection.areaTemplateDistance) || 1))
            });
        }

        const actionSpent = await game.laundry?.consumeCombatAction?.(actor, { warn: true });
        if (actionSpent === false) return null;

        if (spendAdrenaline) {
            await actor.update({
                "system.derived.adrenaline.value": currentAdrenaline - 1
            });
        }

        if (usesAmmo) {
            ammoRemaining = Math.max(0, latestAmmo - ammoSpent);
            await this.update({ "system.ammo": ammoRemaining });
            if (ammoRemaining <= 0 && traitProfile.reload) {
                ui.notifications.info(`${this.name}: magazine empty. Reload required.`);
            }
        }

        const modeLabel = attackContext.isMelee
            ? game.i18n.localize("LAUNDRY.AttackModeMelee")
            : game.i18n.localize("LAUNDRY.AttackModeRanged");

        return rollDice({
            pool: pool + (attackSelection.poolBonus ?? 0),
            dn: attackSelection.dn,
            complexity: Math.max(1, Number(attackSelection.complexity ?? complexity) + Math.max(0, Math.trunc(Number(attackSelection.complexityBonus ?? 0) || 0))),
            flavor: game.i18n.format("LAUNDRY.AttackFlavor", {
                weapon: this.name,
                mode: modeLabel
            }),
            damage: this.system.damage,
            damageBonus: 0,
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
                defencePenalty: attackContext.defencePenalty ?? 0,
                weaponTraits: String(this.system?.traits ?? ""),
                fireMode: String(attackSelection.fireMode ?? "single"),
                suppressiveMode: Boolean(attackSelection.suppressiveMode),
                areaMode: Boolean(attackSelection.areaMode),
                areaTemplateId: areaTemplateInfo?.templateId ?? null,
                areaTemplateSceneId: areaTemplateInfo?.sceneId ?? null,
                areaTemplateDistance: areaTemplateInfo?.distance ?? null,
                ammoSpent,
                ammoRemaining,
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
        const actionSpent = await game.laundry?.consumeCombatAction?.(actor, { warn: true });
        if (actionSpent === false) return null;

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

function _extractWeaponTraits(rawTraits) {
    const raw = String(rawTraits ?? "").trim().toLowerCase();
    const tokens = raw
        .split(/[,\n;]+/g)
        .map(entry => entry.trim())
        .filter(Boolean);
    const blob = tokens.join(" ");
    const has = (word) => tokens.includes(word) || new RegExp(`\\b${word}\\b`).test(blob);

    return {
        burst: has("burst"),
        automatic: has("automatic") || has("auto"),
        suppressive: has("suppressive"),
        area: has("area") || has("blast") || has("spread"),
        reload: has("reload")
    };
}

async function _placeAreaTemplate({ actor, targetSnapshot = null, distance = 1 } = {}) {
    if (!canvas?.scene) return null;
    const safeDistance = Math.max(1, Math.trunc(Number(distance) || 1));
    const origin = _resolveTemplateOrigin(actor, targetSnapshot);
    if (!origin) return null;

    const templateData = {
        t: "circle",
        user: game.user?.id ?? null,
        distance: safeDistance,
        direction: 0,
        x: origin.x,
        y: origin.y,
        fillColor: game.user?.color ?? "#8b0000",
        flags: {
            "laundry-rpg": {
                source: "area-attack",
                actorId: actor?.id ?? null
            }
        }
    };

    const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    const template = created?.[0] ?? null;
    if (!template) return null;

    return {
        templateId: template.id,
        sceneId: canvas.scene.id,
        distance: safeDistance
    };
}

function _resolveTemplateOrigin(actor, targetSnapshot) {
    const targetTokenId = String(targetSnapshot?.tokenId ?? "").trim();
    const targetToken = targetTokenId ? canvas.tokens?.get(targetTokenId) ?? null : null;
    if (targetToken?.center) return { x: targetToken.center.x, y: targetToken.center.y };

    const actorToken = canvas.tokens?.placeables?.find(token => token.actor?.id === actor?.id) ?? null;
    if (actorToken?.center) return { x: actorToken.center.x, y: actorToken.center.y };

    return null;
}
