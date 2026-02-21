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
        const initiativeValue = mind + awarenessTraining + reflexesTraining;
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
        sys.npc = foundry.utils.mergeObject({
            mode: "lite",
            class: "elite",
            mobSize: 1,
            trackInjuries: false,
            fastDamage: true,
            archetype: "",
            defeated: false,
            quickActions: []
        }, sys.npc ?? {}, { inplace: false, overwrite: false });
        sys.npc.mobSize = Math.max(1, Math.trunc(Number(sys.npc.mobSize) || 1));
        sys.npc.mode = String(sys.npc.mode ?? "lite");
        sys.npc.class = String(sys.npc.class ?? "elite");
        sys.npc.trackInjuries = Boolean(sys.npc.trackInjuries);
        sys.npc.fastDamage = Boolean(sys.npc.fastDamage);
        sys.npc.archetype = String(sys.npc.archetype ?? "");
        sys.npc.defeated = Boolean(sys.npc.defeated);
        sys.npc.quickActions = Array.isArray(sys.npc.quickActions) ? sys.npc.quickActions : [];

        // NPCs derive core combat values from the same baseline as characters.
        this._prepareCharacterData(sys);

        if (!sys.npc.trackInjuries) {
            sys.derived.injuries.max = 0;
            sys.derived.injuries.value = 0;
        }

        if (sys.npc.class === "minion") {
            sys.derived.adrenaline.max = 0;
            sys.derived.adrenaline.value = 0;
            if (sys.derived.toughness.max > 2) {
                sys.derived.toughness.max = Math.max(1, Math.ceil(sys.derived.toughness.max / 2));
                sys.derived.toughness.value = Math.min(sys.derived.toughness.value, sys.derived.toughness.max);
                sys.derived.toughness.damage = Math.max(0, sys.derived.toughness.max - sys.derived.toughness.value);
            }
        } else if (sys.npc.class === "boss") {
            sys.derived.adrenaline.max = Math.max(sys.derived.adrenaline.max, 2);
            sys.derived.adrenaline.value = Math.min(sys.derived.adrenaline.max, Math.max(1, sys.derived.adrenaline.value));
        }

        if (sys.npc.defeated) {
            sys.derived.toughness.value = 0;
            sys.derived.toughness.damage = Math.max(0, sys.derived.toughness.max);
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
