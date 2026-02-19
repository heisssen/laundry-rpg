export class LaundryActor extends Actor {
    /** @override */
    prepareData() {
        // Prepare data for the actor. Data preparation involves three steps:
        // 1. Prepare data for the specific actor type (e.g. character, npc, etc.)
        // 2. Prepare embedded documents (e.g. items, active effects, etc.)
        // 3. Prepare derived data (e.g. calculate ability scores, etc.)
        super.prepareData();
    }

    /** @override */
    prepareBaseData() {
        // Data modifications in this step occur before processing embedded
        // documents or derived data.
    }

    /** @override */
    prepareDerivedData() {
        const actorData = this;
        const systemData = actorData.system;
        const flags = actorData.flags.laundry || {};

        // Make separate methods for each Actor type (character, npc, etc.) to keep
        // things organized.
        this._prepareCharacterData(actorData);
    }

    /**
     * Prepare Character type specific data
     */
    _prepareCharacterData(actorData) {
        if (actorData.type !== 'character') return;

        // Make shortcuts to attributes
        const systemData = actorData.system;
        const body = systemData.attributes.body.value;
        const mind = systemData.attributes.mind.value;
        const spirit = systemData.attributes.spirit.value;

        // Calculate Derived Stats
        // Toughness: Body + Mind + Spirit
        systemData.derived.toughness.value = body + mind + spirit;

        // Injuries: (Body + Mind + Spirit) / 2, rounded up
        systemData.derived.injuries.max = Math.ceil((body + mind + spirit) / 2);

        // Adrenaline: Spirit / 2, rounded up
        systemData.derived.adrenaline.max = Math.ceil(spirit / 2);

        // Luck: Currently 0 max as per base rules (team resource), but we initialize it
        // systemData.derived.luck.max = 0; 
    }
    /** @override */
    _onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
        super._onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId);

        if (embeddedName !== "Item") return;

        documents.forEach(doc => {
            if (doc.type === "assignment") {
                this.applyAssignment(doc);
            }
        });
    }

    /**
     * Apply the stats and items from an Assignment to the Actor
     * @param {Item} assignment 
     */
    async applyAssignment(assignment) {
        const assignmentData = assignment.system;
        const updateData = {};

        // 1. Apply Attributes
        // If the actor is still at default (1), simply set them.
        // Otherwise, we might want to ask? For now, we overwrite.
        if (assignmentData.attributes) {
            updateData["system.attributes.body.value"] = assignmentData.attributes.body;
            updateData["system.attributes.mind.value"] = assignmentData.attributes.mind;
            updateData["system.attributes.spirit.value"] = assignmentData.attributes.spirit;
        }

        // Apply the update to the Actor
        await this.update(updateData);

        // 2. Add Core Skills
        if (assignmentData.coreSkills) {
            const skillNames = assignmentData.coreSkills.split(',').map(s => s.trim());
            const pack = game.packs.get("laundry-rpg.skills");
            const skillItems = [];

            if (pack) {
                // We need to load the pack content to match names
                // Note: getDocuments() is async
                const packContent = await pack.getDocuments();

                for (const skillName of skillNames) {
                    const existingSkill = packContent.find(i => i.name === skillName);
                    if (existingSkill) {
                        // Create a copy of the skill data
                        const skillData = existingSkill.toObject();
                        skillItems.push(skillData);
                    } else {
                        // Create a placeholder skill if not found in compendium
                        skillItems.push({
                            name: skillName,
                            type: "skill",
                            img: "icons/svg/book.svg",
                            system: {
                                description: "Skill added from Assignment.",
                                attribute: "mind" // Default
                            }
                        });
                    }
                }
            } else {
                // Fallback if pack is missing
                for (const skillName of skillNames) {
                    skillItems.push({
                        name: skillName,
                        type: "skill",
                        img: "icons/svg/book.svg"
                    });
                }
            }

            if (skillItems.length > 0) {
                await this.createEmbeddedDocuments("Item", skillItems);
                ui.notifications.info(`Added ${skillItems.length} skills from Assignment: ${assignment.name}`);
            }
        }

        // 3. Add Equipment (as simple items for now)
        if (assignmentData.equipment) {
            const equipmentNames = assignmentData.equipment.split(',').map(e => e.trim());
            const equipmentItems = equipmentNames.map(name => ({
                name: name,
                type: "gear",
                img: "icons/svg/item-bag.svg",
                system: {
                    quantity: 1
                }
            }));

            if (equipmentItems.length > 0) {
                await this.createEmbeddedDocuments("Item", equipmentItems);
            }
        }
    }
}
