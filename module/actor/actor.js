export class LaundryActor extends Actor {

    /** @override */
    prepareData() {
        super.prepareData();
    }

    /** @override */
    prepareBaseData() {
        // No extra base-data overrides needed; template.json handles defaults.
    }

    /** @override */
    prepareDerivedData() {
        const systemData = this.system;

        switch (this.type) {
            case "character":
                this._prepareCharacterData(systemData);
                break;
            case "npc":
                this._prepareNpcData(systemData);
                break;
        }
    }

    // ─── Characters ──────────────────────────────────────────────────────────

    _prepareCharacterData(sys) {
        // Safeguard: Ensure derived keys exist (migrating old actors)
        sys.kpi = Array.isArray(sys.kpi) ? sys.kpi : [];
        sys.derived = sys.derived || {};
        sys.derived.toughness = sys.derived.toughness || { value: 0, max: 0, damage: 0 };
        sys.derived.injuries = sys.derived.injuries || { value: 0, max: 0 };
        sys.derived.adrenaline = sys.derived.adrenaline || { value: 0, max: 0 };
        sys.derived.melee = sys.derived.melee || { value: 0, label: "" };
        sys.derived.accuracy = sys.derived.accuracy || { value: 0, label: "" };
        sys.derived.defence = sys.derived.defence || { value: 0, label: "" };
        sys.derived.armour = sys.derived.armour || { value: 0 };
        sys.derived.initiative = sys.derived.initiative || { value: 0 };
        sys.derived.naturalAwareness = sys.derived.naturalAwareness || { value: 0 };

        const body = sys.attributes.body.value ?? 1;
        const mind = sys.attributes.mind.value ?? 1;
        const spirit = sys.attributes.spirit.value ?? 1;
        const total = body + mind + spirit;
        const closeCombatTraining = this._getSkillTraining("Close Combat");
        const rangedTraining = this._getSkillTraining("Ranged");
        const reflexesTraining = this._getSkillTraining("Reflexes");
        const awarenessTraining = this._getSkillTraining("Awareness");
        const conditionedToFightCount = this._getTalentCount("Conditioned to Fight");
        const combatReadyCount = this._getTalentCount("Combat Ready");

        // Toughness tracks current value via persisted damage while deriving max from attributes.
        const rawToughnessDamage = Number(sys.derived.toughness.damage ?? 0);
        const toughnessDamage = Number.isFinite(rawToughnessDamage)
            ? Math.max(0, Math.trunc(rawToughnessDamage))
            : 0;
        sys.derived.toughness.max = total;
        sys.derived.toughness.damage = Math.min(total, toughnessDamage);
        sys.derived.toughness.value = Math.max(0, total - sys.derived.toughness.damage);

        // Max Injuries = ceil(total / 2)
        sys.derived.injuries.max = Math.ceil(total / 2);
        // Clamp current value
        sys.derived.injuries.value = Math.min(
            sys.derived.injuries.value ?? 0,
            sys.derived.injuries.max
        );

        // Max Adrenaline = ceil(Spirit / 2)
        sys.derived.adrenaline.max = Math.ceil(spirit / 2);
        sys.derived.adrenaline.value = Math.min(
            sys.derived.adrenaline.value ?? 0,
            sys.derived.adrenaline.max
        );

        // Core derived combat and awareness values
        const meleeValue = body + closeCombatTraining;
        const accuracyValue = mind + rangedTraining;
        const defenceValue = body + reflexesTraining;
        const initiativeBaseAttribute = conditionedToFightCount > 0
            ? Math.max(mind, body)
            : mind;
        const initiativeValue = initiativeBaseAttribute
            + awarenessTraining
            + reflexesTraining
            + (combatReadyCount * 2);
        const naturalAwarenessValue = Math.ceil((mind + awarenessTraining) / 2);
        const armourValue = this.items
            .filter(i => i.type === "armour" && i.system?.equipped === true)
            .reduce((sum, i) => sum + (Number(i.system?.protection) || 0), 0);

        sys.derived.melee.value = meleeValue;
        sys.derived.accuracy.value = accuracyValue;
        sys.derived.defence.value = defenceValue;
        sys.derived.initiative.value = initiativeValue;
        sys.derived.naturalAwareness.value = naturalAwarenessValue;
        sys.derived.armour.value = armourValue;

        sys.derived.melee.label = this._getLadderLabel(meleeValue);
        sys.derived.accuracy.label = this._getLadderLabel(accuracyValue);
        sys.derived.defence.label = this._getLadderLabel(defenceValue);

    }

    // ─── NPCs ─────────────────────────────────────────────────────────────────

    _prepareNpcData(sys) {
        // NPCs use the same derived formula as characters.
        this._prepareCharacterData(sys);
    }

    // ─── Assignment application ───────────────────────────────────────────────

    /** @override */
    _onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId);
        if (embeddedName !== "Item") return;
        documents.forEach(doc => {
            if (doc.type === "assignment") this.applyAssignment(doc);
        });
    }

    /**
     * Apply stats and starting items from a dropped Assignment.
     * @param {Item} assignment
     */
    async applyAssignment(assignment) {
        const sys = assignment.system;
        const updateData = {};

        // 1 · Attributes
        if (sys.attributes) {
            updateData["system.attributes.body.value"] = sys.attributes.body;
            updateData["system.attributes.mind.value"] = sys.attributes.mind;
            updateData["system.attributes.spirit.value"] = sys.attributes.spirit;
        }

        // Record the assignment name in Details
        updateData["system.details.assignment"] = assignment.name;

        await this.update(updateData);

        // 2 · Core Skills (look up in compendium first, fall back to stub)
        if (sys.coreSkills) {
            const skillNames = sys.coreSkills.split(",").map(s => s.trim()).filter(Boolean);
            const pack = game.packs.get("laundry-rpg.skills");
            const skillItems = [];

            if (pack) {
                const packContent = await pack.getDocuments();
                for (const name of skillNames) {
                    const found = packContent.find(i => i.name === name);
                    skillItems.push(found
                        ? found.toObject()
                        : _stubSkill(name));
                }
            } else {
                skillNames.forEach(name => skillItems.push(_stubSkill(name)));
            }

            if (skillItems.length) {
                await this.createEmbeddedDocuments("Item", skillItems);
                ui.notifications.info(
                    `Laundry RPG | Added ${skillItems.length} skills from Assignment: ${assignment.name}`
                );
            }
        }

        // 3 · Core Talent(s)
        if (sys.coreTalent) {
            const talentNames = String(sys.coreTalent).split(",").map(t => t.trim()).filter(Boolean);
            const pack = game.packs.get("laundry-rpg.talents");
            const talentItems = [];

            if (pack) {
                const packContent = await pack.getDocuments();
                for (const name of talentNames) {
                    const found = packContent.find(i => i.name === name);
                    talentItems.push(found
                        ? found.toObject()
                        : _stubTalent(name));
                }
            } else {
                talentNames.forEach(name => talentItems.push(_stubTalent(name)));
            }

            if (talentItems.length) {
                await this.createEmbeddedDocuments("Item", talentItems);
                ui.notifications.info(
                    `Laundry RPG | Added ${talentItems.length} core talent(s) from Assignment: ${assignment.name}`
                );
            }
        }

        // 4 · Starting Equipment
        if (sys.equipment) {
            const equipNames = sys.equipment.split(",").map(e => e.trim()).filter(Boolean);
            const equipItems = equipNames.map(name => ({
                name, type: "gear",
                img: "icons/svg/item-bag.svg",
                system: { quantity: 1, weight: 0 }
            }));
            if (equipItems.length) await this.createEmbeddedDocuments("Item", equipItems);
        }
    }

    /** @override */
    getRollData() {
        const data = foundry.utils.deepClone(super.getRollData() ?? {});
        const system = foundry.utils.deepClone(this.system ?? {});
        data.system = system;
        data.derived = foundry.utils.deepClone(system.derived ?? {});
        return data;
    }

    _getSkillTraining(skillName) {
        const skill = this.items.find(i => i.type === "skill" && i.name === skillName);
        return Number(skill?.system?.training ?? 0);
    }

    _getTalentCount(talentName) {
        const wanted = String(talentName ?? "").trim().toLowerCase();
        if (!wanted) return 0;
        return this.items.filter(i =>
            i.type === "talent" && String(i.name ?? "").trim().toLowerCase() === wanted
        ).length;
    }

    _getLadderLabel(value) {
        const ladder = CONFIG.LAUNDRY?.ladder ?? [];
        const hit = ladder.find(step => Number(value) >= Number(step.min));
        return hit?.label ?? "Poor";
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _stubSkill(name) {
    return {
        name, type: "skill",
        img: "icons/svg/book.svg",
        system: { description: "Skill added from Assignment.", attribute: "mind", training: 1, focus: 0 }
    };
}

function _stubTalent(name) {
    return {
        name,
        type: "talent",
        img: "icons/svg/aura.svg",
        system: { requirements: "", description: "Core Talent added from Assignment." }
    };
}
