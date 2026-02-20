export class LaundryCharacterBuilder extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this._assignmentById = new Map();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-character-builder",
            classes: ["laundry-rpg", "character-builder"],
            template: "systems/laundry-rpg/templates/actor/character-builder.html",
            title: "Initialize Agent",
            width: 640,
            height: "auto"
        });
    }

    async getData() {
        const pack = game.packs.get("laundry-rpg.assignments");
        let assignments = [];
        this._assignmentById = new Map();

        if (pack) {
            const docs = await pack.getDocuments();
            assignments = docs
                .map(doc => _toAssignmentData(doc))
                .sort((a, b) => a.name.localeCompare(b.name));

            for (const assignment of assignments) {
                this._assignmentById.set(assignment.id, assignment);
            }
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
        html.find(".builder-confirm").on("click", (ev) => this._onSubmit(ev));
        html.find("form").on("keydown", (ev) => {
            if (ev.key !== "Enter") return;
            ev.preventDefault();
            this._onSubmit(ev);
        });
        html.find(".builder-cancel").on("click", () => this.close());
        html.find("#assignment-select").on("change", (ev) => {
            this._renderAssignmentDetails(ev.currentTarget?.value ?? "");
        });
        html.on("change", ".builder-choice-input", (ev) => this._onChoiceChanged(ev.currentTarget));

        const select = html.find("#assignment-select")[0];
        if (select) this._renderAssignmentDetails(select.value);
    }

    async _onSubmit(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const form = ev.currentTarget?.tagName === "FORM"
            ? ev.currentTarget
            : ev.currentTarget?.closest?.("form");
        if (!form) return;
        const assignmentId = form.querySelector('[name="assignment"]')?.value?.trim();
        if (!assignmentId) {
            ui.notifications.warn("Select an Assignment to initialize this agent.");
            return;
        }

        const assignmentData = this._assignmentById.get(assignmentId);
        if (!assignmentData) {
            ui.notifications.error("Assignment details are unavailable.");
            return;
        }

        const chosenSkills = _uniqueList(
            _readCheckedValues(form, "skill").filter(name => assignmentData.optionalSkills.includes(name))
        );
        const chosenTalents = _uniqueList(
            _readCheckedValues(form, "talent").filter(name => assignmentData.optionalTalents.includes(name))
        );

        if (assignmentData.skillChoiceCount > 0 && chosenSkills.length !== assignmentData.skillChoiceCount) {
            ui.notifications.warn(`Select exactly ${assignmentData.skillChoiceCount} optional skill(s).`);
            return;
        }

        if (assignmentData.talentChoiceCount > 0 && chosenTalents.length !== assignmentData.talentChoiceCount) {
            ui.notifications.warn(`Select exactly ${assignmentData.talentChoiceCount} optional talent(s).`);
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

        await applyAssignmentToActor(this.actor, assignment, {
            chosenSkills,
            chosenTalents
        });
        this.close();
    }

    _renderAssignmentDetails(assignmentId) {
        const root = this.element?.[0];
        if (!root) return;

        const assignment = this._assignmentById.get(assignmentId);

        const setText = (selector, value, fallback = "-") => {
            const el = root.querySelector(selector);
            if (!el) return;
            const text = Array.isArray(value)
                ? _formatList(value)
                : (value ?? "").toString().trim();
            el.textContent = text.length ? text : fallback;
        };

        if (!assignment) {
            setText(".preview-description", "", "Select an assignment to see details.");
            setText(".preview-body", "-");
            setText(".preview-mind", "-");
            setText(".preview-spirit", "-");
            setText(".preview-core-skills", "-");
            setText(".preview-optional-skills", "-");
            setText(".preview-core-talents", "-");
            setText(".preview-optional-talents", "-");
            setText(".preview-equipment", "-");
            this._renderChoiceList("skill", [], 0, "Select an assignment first.");
            this._renderChoiceList("talent", [], 0, "Select an assignment first.");
            this._updateChoiceCounters({ skillChoiceCount: 0, talentChoiceCount: 0 });
            return;
        }

        setText(".preview-description", assignment.description, "No description.");
        setText(".preview-body", assignment.attributes.body);
        setText(".preview-mind", assignment.attributes.mind);
        setText(".preview-spirit", assignment.attributes.spirit);
        setText(".preview-core-skills", assignment.coreSkills);
        setText(".preview-optional-skills", assignment.optionalSkills);
        setText(".preview-core-talents", assignment.coreTalents);
        setText(".preview-optional-talents", assignment.optionalTalents);
        setText(".preview-equipment", assignment.equipment);

        this._renderChoiceList(
            "skill",
            assignment.optionalSkills,
            assignment.skillChoiceCount,
            "No optional skills for this assignment."
        );
        this._renderChoiceList(
            "talent",
            assignment.optionalTalents,
            assignment.talentChoiceCount,
            "No optional talents for this assignment."
        );
        this._updateChoiceCounters(assignment);
    }

    _renderChoiceList(kind, options, choiceCount, emptyMessage) {
        const root = this.element?.[0];
        if (!root) return;

        const listEl = root.querySelector(`.${kind}-choices`);
        const hintEl = root.querySelector(`.${kind}-choice-hint`);
        if (!listEl || !hintEl) return;

        if (!options.length) {
            listEl.innerHTML = `<p class="builder-choice-empty">${_escapeHtml(emptyMessage)}</p>`;
            hintEl.textContent = "No selection required.";
            return;
        }

        hintEl.textContent = choiceCount > 0
            ? `Choose ${choiceCount}.`
            : "Choose any number.";

        listEl.innerHTML = options.map(name => (
            `<label class="builder-choice-option">
                <input class="builder-choice-input" type="checkbox" data-choice-kind="${kind}" value="${_escapeHtml(name)}" />
                <span>${_escapeHtml(name)}</span>
            </label>`
        )).join("");
    }

    _onChoiceChanged(inputEl) {
        if (!inputEl) return;
        const kind = inputEl.dataset?.choiceKind;
        if (!kind) return;

        const assignment = this._getSelectedAssignment();
        if (!assignment) return;

        const choiceCount = kind === "skill"
            ? assignment.skillChoiceCount
            : assignment.talentChoiceCount;

        if (choiceCount > 0) {
            const root = this.element?.[0];
            if (!root) return;
            const checked = root.querySelectorAll(
                `.builder-choice-input[data-choice-kind="${kind}"]:checked`
            );
            if (checked.length > choiceCount) {
                inputEl.checked = false;
                const label = kind === "skill" ? "skills" : "talents";
                ui.notifications.warn(`You can choose only ${choiceCount} ${label}.`);
            }
        }

        this._updateChoiceCounters(assignment);
    }

    _updateChoiceCounters(assignment) {
        const root = this.element?.[0];
        if (!root) return;

        this._updateChoiceCounter(root, "skill", assignment?.skillChoiceCount ?? 0);
        this._updateChoiceCounter(root, "talent", assignment?.talentChoiceCount ?? 0);
    }

    _updateChoiceCounter(root, kind, choiceCount) {
        const counter = root.querySelector(`.${kind}-choice-counter`);
        if (!counter) return;

        const selected = root.querySelectorAll(
            `.builder-choice-input[data-choice-kind="${kind}"]:checked`
        ).length;

        if (choiceCount > 0) {
            counter.textContent = `${selected}/${choiceCount} selected`;
            counter.classList.toggle("is-valid", selected === choiceCount);
            counter.classList.toggle("is-invalid", selected !== choiceCount);
            return;
        }

        counter.textContent = `${selected} selected`;
        counter.classList.remove("is-valid", "is-invalid");
    }

    _getSelectedAssignment() {
        const root = this.element?.[0];
        if (!root) return null;
        const assignmentId = root.querySelector('[name="assignment"]')?.value?.trim();
        if (!assignmentId) return null;
        return this._assignmentById.get(assignmentId) ?? null;
    }
}

async function applyAssignmentToActor(actor, assignment, selected = {}) {
    const sys = assignment.system ?? {};
    const attributes = sys.attributes ?? {};
    const parsed = _parseAssignmentSystem(sys);

    const selectedSkills = Array.isArray(selected.chosenSkills)
        ? selected.chosenSkills
        : [];
    const selectedTalents = Array.isArray(selected.chosenTalents)
        ? selected.chosenTalents
        : [];

    const skillsToAdd = _uniqueList(parsed.coreSkills.concat(selectedSkills));
    const talentsToAdd = _uniqueList(parsed.coreTalents.concat(selectedTalents));

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
        skillsToAdd,
        _stubSkill
    );

    const talents = await _fetchCompendiumItems(
        "laundry-rpg.talents",
        "talent",
        talentsToAdd,
        _stubTalent
    );

    const equipment = await _fetchEquipmentItems(
        parsed.equipment
    );

    const pending = []
        .concat(skills, talents, equipment)
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

function _parseChoiceCount(value) {
    if (value === null || value === undefined || value === "") return null;
    if (Number.isFinite(value)) {
        const n = Math.floor(Number(value));
        return n >= 0 ? n : null;
    }

    const match = String(value).match(/\d+/);
    if (!match) return null;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
}

function _uniqueList(values) {
    const out = [];
    const seen = new Set();

    for (const raw of values ?? []) {
        const value = String(raw ?? "").trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }

    return out;
}

function _parseAssignmentSystem(sys = {}) {
    const listedSkills = _uniqueList(_parseList(sys.coreSkills));
    const parsedCoreSkills = _uniqueList(_parseList(sys.coreSkill));
    const coreSkills = parsedCoreSkills.length
        ? parsedCoreSkills
        : (listedSkills.length ? [listedSkills[0]] : []);

    let optionalSkills = _uniqueList(_parseList(sys.skillOptions));
    if (!optionalSkills.length && listedSkills.length) {
        const coreSet = new Set(coreSkills.map(name => name.toLowerCase()));
        optionalSkills = listedSkills.filter(name => !coreSet.has(name.toLowerCase()));
    }

    const coreTalents = _uniqueList(_parseList(sys.coreTalent));
    const optionalTalents = _uniqueList(_parseList(sys.talents));
    const equipment = _uniqueList(_parseList(sys.equipment));

    const parsedSkillChoices = _parseChoiceCount(
        sys.skillChoiceCount ?? sys.skillChoices ?? sys.skillsToChoose
    );
    const skillChoiceCount = parsedSkillChoices ?? 0;

    const parsedTalentChoices = _parseChoiceCount(
        sys.talentChoiceCount ?? sys.talentChoices ?? sys.talentsToChoose
    );
    const talentChoiceCount = parsedTalentChoices
        ?? (optionalTalents.length ? Math.min(2, optionalTalents.length) : 0);

    return {
        coreSkills,
        optionalSkills,
        coreTalents,
        optionalTalents,
        equipment,
        skillChoiceCount,
        talentChoiceCount
    };
}

function _toAssignmentData(doc) {
    const sys = doc.system ?? {};
    const attrs = sys.attributes ?? {};
    const parsed = _parseAssignmentSystem(sys);

    return {
        id: doc.id,
        name: doc.name,
        description: sys.description ?? "",
        attributes: {
            body: Number(attrs.body ?? 1),
            mind: Number(attrs.mind ?? 1),
            spirit: Number(attrs.spirit ?? 1)
        },
        coreSkills: parsed.coreSkills,
        optionalSkills: parsed.optionalSkills,
        coreTalents: parsed.coreTalents,
        optionalTalents: parsed.optionalTalents,
        equipment: parsed.equipment,
        skillChoiceCount: parsed.skillChoiceCount,
        talentChoiceCount: parsed.talentChoiceCount
    };
}

function _readCheckedValues(form, kind) {
    return Array.from(
        form.querySelectorAll(`.builder-choice-input[data-choice-kind="${kind}"]:checked`)
    ).map(el => String(el.value ?? "").trim()).filter(Boolean);
}

function _formatList(values) {
    const list = Array.isArray(values) ? values.filter(Boolean) : [];
    return list.length ? list.join(", ") : "";
}

function _escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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
        system: { description: "Skill added from Assignment.", attribute: "mind", training: 0, focus: 0 }
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
