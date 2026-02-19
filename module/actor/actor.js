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
}
