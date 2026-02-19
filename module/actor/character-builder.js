export class LaundryCharacterBuilder extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-character-builder",
            classes: ["laundry-rpg", "character-builder"],
            template: "systems/laundry-rpg/templates/actor/character-builder.html",
            title: "Initialize Agent",
            width: 520,
            height: "auto"
        });
    }

    async getData() {
        const pack = game.packs.get("laundry-rpg.assignments");
        let assignments = [];

        if (pack) {
            const docs = await pack.getDocuments();
            assignments = docs.map(doc => ({
                id: doc.id,
                name: doc.name,
                description: doc.system?.description ?? "",
                attributes: doc.system?.attributes ?? { body: 1, mind: 1, spirit: 1 },
                coreSkills: doc.system?.coreSkills ?? "",
                coreTalent: doc.system?.coreTalent ?? "",
                talents: doc.system?.talents ?? "",
                equipment: doc.system?.equipment ?? ""
            }));
        }

        return {
            assignments,
            hasAssignments: assignments.length > 0,
            actorName: this.actor?.name ?? "Agent"
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find("form").on("submit", this._onSubmit.bind(this));
        html.find(".builder-cancel").on("click", () => this.close());
        html.find("#assignment-select").on("change", (ev) => this._updatePreview(ev.currentTarget));
        const select = html.find("#assignment-select")[0];
        if (select) this._updatePreview(select);
    }

    async _onSubmit(ev) {
        ev.preventDefault();
        const form = ev.currentTarget;
        const assignmentId = form.querySelector('[name="assignment"]')?.value;
        if (!assignmentId) {
            ui.notifications.warn("Select an Assignment to initialize this agent.");
            return;
        }

        const pack = game.packs.get("laundry-rpg.assignments");
        if (!pack) {
            ui.notifications.error("Assignments compendium not found.");
            return;
        }

        const assignment = await pack.getDocument(assignmentId);
        if (!assignment) {
            ui.notifications.error("Assignment not found in compendium.");
            return;
        }

        const hasExistingAssignment = Boolean(this.actor?.system?.details?.assignment);
        const hasItems = (this.actor?.items?.size ?? 0) > 0;
        if (hasExistingAssignment || hasItems) {
            const confirmed = await Dialog.confirm({
                title: "Re-initialize Agent?",
                content: "<p>This agent already has assignment or item data. Re-initializing will add any missing assignment entries and may alter attributes. Continue?</p>"
            });
            if (!confirmed) return;
        }

        await applyAssignmentToActor(this.actor, assignment);
        this.close();
    }

    _updatePreview(selectEl) {
        if (!selectEl) return;
        const option = selectEl.options[selectEl.selectedIndex];
        const data = option?.dataset ?? {};

        const root = this.element?.[0];
        if (!root) return;

        const setText = (selector, value, fallback = "-") => {
            const el = root.querySelector(selector);
            if (!el) return;
            const text = (value ?? "").toString().trim();
            el.textContent = text.length ? text : fallback;
        };

        setText(".preview-description", data.description, "No description.");
        setText(".preview-body", data.body);
        setText(".preview-mind", data.mind);
        setText(".preview-spirit", data.spirit);
        setText(".preview-coreskills", data.coreskills);
        setText(".preview-coretalent", data.coretalent);
        setText(".preview-talents", data.talents);
        setText(".preview-equipment", data.equipment);
    }
}

async function applyAssignmentToActor(actor, assignment) {
    const sys = assignment.system ?? {};
    const attributes = sys.attributes ?? {};

    await actor.update({
        "system.attributes.body.value": attributes.body ?? 1,
        "system.attributes.mind.value": attributes.mind ?? 1,
        "system.attributes.spirit.value": attributes.spirit ?? 1,
        "system.details.assignment": assignment.name ?? ""
    });

    const existing = new Set(actor.items.map(i => `${i.type}:${i.name.toLowerCase()}`));

    const skills = await _fetchCompendiumItems(
        "laundry-rpg.skills",
        "skill",
        _parseList(sys.coreSkills),
        _stubSkill
    );

    const coreTalents = await _fetchCompendiumItems(
        "laundry-rpg.talents",
        "talent",
        _parseList(sys.coreTalent),
        _stubTalent
    );

    const talents = await _fetchCompendiumItems(
        "laundry-rpg.talents",
        "talent",
        _parseList(sys.talents),
        _stubTalent
    );

    const equipment = await _fetchEquipmentItems(
        _parseList(sys.equipment)
    );

    const pending = []
        .concat(skills, coreTalents, talents, equipment)
        .filter(item => item && !existing.has(`${item.type}:${item.name.toLowerCase()}`));

    const dedupe = new Set();
    const toCreate = pending.filter(item => {
        const key = `${item.type}:${item.name.toLowerCase()}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
    });

    if (toCreate.length) {
        await actor.createEmbeddedDocuments("Item", toCreate);
    }

    ui.notifications.info(`Laundry RPG | Initialized agent as ${assignment.name}`);
}

function _parseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

async function _fetchCompendiumItems(packId, type, names, stubFn) {
    if (!names.length) return [];
    const pack = game.packs.get(packId);
    if (!pack) return names.map(name => stubFn(name, type));

    const index = await pack.getIndex();
    const results = [];

    for (const name of names) {
        const entry = index.find(e => e.name === name);
        if (entry) {
            const doc = await pack.getDocument(entry._id);
            results.push(doc.toObject());
        } else {
            results.push(stubFn(name, type));
        }
    }

    return results;
}

async function _fetchEquipmentItems(names) {
    if (!names.length) return [];
    const packs = [
        game.packs.get("laundry-rpg.weapons"),
        game.packs.get("laundry-rpg.armour"),
        game.packs.get("laundry-rpg.gear")
    ].filter(Boolean);

    const indexes = new Map();
    for (const pack of packs) {
        indexes.set(pack.metadata.id, await pack.getIndex());
    }

    const results = [];
    for (const name of names) {
        let found = null;
        for (const pack of packs) {
            const index = indexes.get(pack.metadata.id) ?? [];
            const entry = index.find(e => e.name === name);
            if (entry) {
                found = (await pack.getDocument(entry._id)).toObject();
                break;
            }
        }

        results.push(found ?? _stubGear(name));
    }

    return results;
}

function _stubSkill(name) {
    return {
        name,
        type: "skill",
        img: "icons/svg/book.svg",
        system: { description: "Skill added from Assignment.", attribute: "mind", training: 1, focus: 0 }
    };
}

function _stubTalent(name) {
    return {
        name,
        type: "talent",
        img: "icons/svg/upgrade.svg",
        system: { description: "Talent added from Assignment.", requirements: "" }
    };
}

function _stubGear(name) {
    return {
        name,
        type: "gear",
        img: "icons/svg/item-bag.svg",
        system: { quantity: 1, weight: 0 }
    };
}
