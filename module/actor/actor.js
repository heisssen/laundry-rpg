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
        sys.derived = sys.derived || {};
        sys.derived.toughness = sys.derived.toughness || { value: 0 };
        sys.derived.injuries = sys.derived.injuries || { value: 0, max: 0 };
        sys.derived.adrenaline = sys.derived.adrenaline || { value: 0, max: 0 };

        const body = sys.attributes.body.value ?? 1;
        const mind = sys.attributes.mind.value ?? 1;
        const spirit = sys.attributes.spirit.value ?? 1;
        const total = body + mind + spirit;

        // Toughness = Body + Mind + Spirit
        sys.derived.toughness.value = total;

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

        // 3 · Starting Equipment
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
        const data = super.getRollData();
        return data;
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
