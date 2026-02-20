export class LaundryCharacterBuilder extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this._assignmentById = new Map();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-character-builder",
            classes: ["laundry-rpg", "character-builder", "laundry-dialog"],
            template: "systems/laundry-rpg/templates/actor/character-builder.html",
            title: "Form 2B: Agent Requisition",
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
        html.on("change", ".skill-allocation-input", (ev) => this._onSkillAllocationChanged(ev.currentTarget));

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
            ui.notifications.warn(game.i18n.localize("LAUNDRY.SelectAssignmentWarning"));
            return;
        }

        const assignmentData = this._assignmentById.get(assignmentId);
        if (!assignmentData) {
            ui.notifications.error(game.i18n.localize("LAUNDRY.AssignmentUnavailable"));
            return;
        }

        const chosenSkills = _uniqueList(
            _readCheckedValues(form, "skill").filter(name => assignmentData.optionalSkills.includes(name))
        );
        const chosenTalents = _uniqueList(
            _readCheckedValues(form, "talent").filter(name => assignmentData.optionalTalents.includes(name))
        );
        const skillAllocations = this._readSkillAllocations(form, assignmentData);
        const xpBudget = Number(assignmentData.skillXpBudget ?? 12);
        const usedXp = _calculateSkillXpUsage(skillAllocations, assignmentData);
        if (usedXp > xpBudget) {
            ui.notifications.warn(game.i18n.format("LAUNDRY.SkillXpExceeded", {
                used: usedXp,
                max: xpBudget
            }));
            return;
        }

        if (assignmentData.skillChoiceCount > 0 && chosenSkills.length !== assignmentData.skillChoiceCount) {
            ui.notifications.warn(game.i18n.format("LAUNDRY.SelectExactSkills", { count: assignmentData.skillChoiceCount }));
            return;
        }

        if (assignmentData.talentChoiceCount > 0 && chosenTalents.length !== assignmentData.talentChoiceCount) {
            ui.notifications.warn(game.i18n.format("LAUNDRY.SelectExactTalents", { count: assignmentData.talentChoiceCount }));
            return;
        }

        const pack = game.packs.get("laundry-rpg.assignments");
        if (!pack) {
            ui.notifications.error(game.i18n.localize("LAUNDRY.AssignmentsMissing"));
            return;
        }

        const assignment = await pack.getDocument(assignmentId);
        if (!assignment) {
            ui.notifications.error(game.i18n.localize("LAUNDRY.AssignmentNotFound"));
            return;
        }

        const hasExistingAssignment = Boolean(this.actor?.system?.details?.assignment);
        const hasItems = (this.actor?.items?.size ?? 0) > 0;
        if (hasExistingAssignment || hasItems) {
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("LAUNDRY.ReinitializeTitle"),
                content: `<p>${game.i18n.localize("LAUNDRY.ReinitializeBody")}</p>`
            });
            if (!confirmed) return;
        }

        await applyAssignmentToActor(this.actor, assignment, {
            chosenSkills,
            chosenTalents,
            skillAllocations
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
            setText(".preview-description", "", game.i18n.localize("LAUNDRY.SelectAssignmentDetails"));
            setText(".preview-body", "-");
            setText(".preview-mind", "-");
            setText(".preview-spirit", "-");
            setText(".preview-core-skills", "-");
            setText(".preview-optional-skills", "-");
            setText(".preview-core-talents", "-");
            setText(".preview-optional-talents", "-");
            setText(".preview-equipment", "-");
            this._renderChoiceList("skill", [], 0, game.i18n.localize("LAUNDRY.SelectAssignmentFirst"));
            this._renderChoiceList("talent", [], 0, game.i18n.localize("LAUNDRY.SelectAssignmentFirst"));
            this._updateChoiceCounters({ skillChoiceCount: 0, talentChoiceCount: 0 });
            this._renderSkillAllocation(null);
            return;
        }

        setText(".preview-description", assignment.description, game.i18n.localize("LAUNDRY.NoDescription"));
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
            game.i18n.localize("LAUNDRY.NoOptionalSkills")
        );
        this._renderChoiceList(
            "talent",
            assignment.optionalTalents,
            assignment.talentChoiceCount,
            game.i18n.localize("LAUNDRY.NoOptionalTalents")
        );
        this._updateChoiceCounters(assignment);
        this._renderSkillAllocation(assignment);
    }

    _renderChoiceList(kind, options, choiceCount, emptyMessage) {
        const root = this.element?.[0];
        if (!root) return;

        const listEl = root.querySelector(`.${kind}-choices`);
        const hintEl = root.querySelector(`.${kind}-choice-hint`);
        if (!listEl || !hintEl) return;

        if (!options.length) {
            listEl.innerHTML = `<p class="builder-choice-empty">${_escapeHtml(emptyMessage)}</p>`;
            hintEl.textContent = game.i18n.localize("LAUNDRY.NoSelectionRequired");
            return;
        }

        hintEl.textContent = choiceCount > 0
            ? game.i18n.format("LAUNDRY.ChooseN", { count: choiceCount })
            : game.i18n.localize("LAUNDRY.ChooseAny");

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
                const isSkill = kind === "skill";
                ui.notifications.warn(isSkill
                    ? game.i18n.format("LAUNDRY.SelectExactSkills", { count: choiceCount })
                    : game.i18n.format("LAUNDRY.SelectExactTalents", { count: choiceCount }));
            }
        }

        this._updateChoiceCounters(assignment);
        if (kind === "skill") this._renderSkillAllocation(assignment);
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

    _renderSkillAllocation(assignment) {
        const root = this.element?.[0];
        if (!root) return;

        const listEl = root.querySelector(".skill-allocation-list");
        const counterEl = root.querySelector(".skill-xp-counter");
        if (!listEl || !counterEl) return;

        if (!assignment) {
            counterEl.textContent = game.i18n.format("LAUNDRY.SkillXpCounter", { used: 0, max: 0 });
            counterEl.classList.remove("is-valid", "is-invalid");
            listEl.innerHTML = `<p class="builder-choice-empty">${_escapeHtml(game.i18n.localize("LAUNDRY.SelectAssignmentFirst"))}</p>`;
            return;
        }

        const skills = this._getAllocatableSkills(assignment);
        if (!skills.length) {
            counterEl.textContent = game.i18n.format("LAUNDRY.SkillXpCounter", {
                used: 0,
                max: Number(assignment.skillXpBudget ?? 0)
            });
            counterEl.classList.remove("is-valid", "is-invalid");
            listEl.innerHTML = `<p class="builder-choice-empty">${_escapeHtml(game.i18n.localize("LAUNDRY.NoOptionalSkills"))}</p>`;
            return;
        }

        const previous = this._captureCurrentSkillAllocations(root);
        listEl.innerHTML = skills.map((skillName) => {
            const core = assignment.coreSkills.some(s => s.toLowerCase() === skillName.toLowerCase());
            const baseTraining = core ? 1 : 0;
            const baseFocus = core ? 1 : 0;
            const prev = previous.get(skillName.toLowerCase()) ?? {};
            const training = _clampLevel(prev.training ?? baseTraining, baseTraining, 4);
            const focus = _clampLevel(prev.focus ?? baseFocus, baseFocus, 4);
            return `
                <div class="skill-allocation-row" data-skill-name="${_escapeHtml(skillName)}" data-base-training="${baseTraining}" data-base-focus="${baseFocus}">
                    <div class="skill-name">
                        <span>${_escapeHtml(skillName)}</span>
                        ${core ? `<small>${_escapeHtml(game.i18n.localize("LAUNDRY.CoreSkillBase"))}</small>` : ""}
                    </div>
                    <label>${_escapeHtml(game.i18n.localize("LAUNDRY.Training"))}
                        <input type="number" class="skill-allocation-input" data-skill-name="${_escapeHtml(skillName)}" data-track="training" min="${baseTraining}" max="4" value="${training}" />
                    </label>
                    <label>${_escapeHtml(game.i18n.localize("LAUNDRY.Focus"))}
                        <input type="number" class="skill-allocation-input" data-skill-name="${_escapeHtml(skillName)}" data-track="focus" min="${baseFocus}" max="4" value="${focus}" />
                    </label>
                    <span class="skill-allocation-cost">0 XP</span>
                </div>`;
        }).join("");

        this._updateSkillXpCounter(assignment);
    }

    _captureCurrentSkillAllocations(root) {
        const rows = root.querySelectorAll(".skill-allocation-row");
        const out = new Map();
        for (const row of rows) {
            const skillName = String(row.dataset.skillName ?? "").trim().toLowerCase();
            if (!skillName) continue;
            const trainingInput = row.querySelector('input[data-track="training"]');
            const focusInput = row.querySelector('input[data-track="focus"]');
            out.set(skillName, {
                training: Number(trainingInput?.value ?? 0),
                focus: Number(focusInput?.value ?? 0)
            });
        }
        return out;
    }

    _getAllocatableSkills(assignment) {
        const root = this.element?.[0];
        if (!assignment) return [];
        if (assignment.skillChoiceCount <= 0) {
            return _uniqueList(assignment.coreSkills.concat(assignment.optionalSkills));
        }

        const form = root?.querySelector("form");
        const selectedOptional = form
            ? _readCheckedValues(form, "skill").filter(name => assignment.optionalSkills.includes(name))
            : [];
        return _uniqueList(assignment.coreSkills.concat(selectedOptional));
    }

    _onSkillAllocationChanged(inputEl) {
        if (!inputEl) return;
        const row = inputEl.closest(".skill-allocation-row");
        if (!row) return;

        const min = Number(inputEl.min ?? 0);
        const max = Number(inputEl.max ?? 4);
        inputEl.value = String(_clampLevel(inputEl.value, min, max));

        const assignment = this._getSelectedAssignment();
        if (!assignment) return;

        const budget = Number(assignment.skillXpBudget ?? 12);
        this._updateSkillXpCounter(assignment);

        let allocations = this._readSkillAllocations(this.element?.find("form")[0], assignment);
        let used = _calculateSkillXpUsage(allocations, assignment);
        if (used <= budget) return;

        let value = Number(inputEl.value ?? min);
        while (value > min && used > budget) {
            value -= 1;
            inputEl.value = String(value);
            allocations = this._readSkillAllocations(this.element?.find("form")[0], assignment);
            used = _calculateSkillXpUsage(allocations, assignment);
        }

        this._updateSkillXpCounter(assignment);
        ui.notifications.warn(game.i18n.format("LAUNDRY.SkillXpExceeded", {
            used,
            max: budget
        }));
    }

    _updateSkillXpCounter(assignment) {
        const root = this.element?.[0];
        if (!root || !assignment) return;
        const counterEl = root.querySelector(".skill-xp-counter");
        if (!counterEl) return;

        const allocations = this._readSkillAllocations(root.querySelector("form"), assignment);
        const used = _calculateSkillXpUsage(allocations, assignment);
        const budget = Number(assignment.skillXpBudget ?? 12);
        counterEl.textContent = game.i18n.format("LAUNDRY.SkillXpCounter", { used, max: budget });
        counterEl.classList.toggle("is-valid", used <= budget);
        counterEl.classList.toggle("is-invalid", used > budget);

        const rows = root.querySelectorAll(".skill-allocation-row");
        for (const row of rows) {
            const key = String(row.dataset.skillName ?? "").trim().toLowerCase();
            const allocation = allocations[key];
            if (!allocation) continue;
            const rowCost = _calculateSkillCost(allocation.training, allocation.baseTraining)
                + _calculateSkillCost(allocation.focus, allocation.baseFocus);
            const costEl = row.querySelector(".skill-allocation-cost");
            if (costEl) costEl.textContent = game.i18n.format("LAUNDRY.SkillXpRowCost", { cost: rowCost });
        }
    }

    _readSkillAllocations(form, assignment) {
        if (!form || !assignment) return {};
        const rows = form.querySelectorAll(".skill-allocation-row");
        const allocations = {};

        for (const row of rows) {
            const rawName = String(row.dataset.skillName ?? "").trim();
            if (!rawName) continue;
            const key = rawName.toLowerCase();
            const baseTraining = Number(row.dataset.baseTraining ?? 0);
            const baseFocus = Number(row.dataset.baseFocus ?? 0);
            const trainingInput = row.querySelector('input[data-track="training"]');
            const focusInput = row.querySelector('input[data-track="focus"]');
            const training = _clampLevel(trainingInput?.value ?? baseTraining, baseTraining, 4);
            const focus = _clampLevel(focusInput?.value ?? baseFocus, baseFocus, 4);
            allocations[key] = {
                name: rawName,
                training,
                focus,
                baseTraining,
                baseFocus
            };
        }

        return allocations;
    }
}

async function applyAssignmentToActor(actor, assignment, selected = {}) {
    const sys = assignment.system ?? {};
    const attributes = sys.attributes ?? {};
    const parsed = _parseAssignmentSystem(sys);

    const selectedSkills = _uniqueList(Array.isArray(selected.chosenSkills) ? selected.chosenSkills : [])
        .filter(name => parsed.optionalSkills.some(opt => opt.toLowerCase() === name.toLowerCase()));
    const selectedTalents = _uniqueList(Array.isArray(selected.chosenTalents) ? selected.chosenTalents : [])
        .filter(name => parsed.optionalTalents.some(opt => opt.toLowerCase() === name.toLowerCase()));
    const skillAllocations = _normalizeSkillAllocations(selected.skillAllocations);

    const skillPool = parsed.skillChoiceCount > 0
        ? parsed.coreSkills.concat(selectedSkills)
        : parsed.coreSkills.concat(parsed.optionalSkills);
    const allocatedSkillNames = Object.values(skillAllocations).map(entry => entry.name);
    const skillsToAdd = _uniqueList(skillPool.concat(allocatedSkillNames));
    const talentsToAdd = _uniqueList(parsed.coreTalents.concat(selectedTalents));
    const desiredSkillLevels = _buildDesiredSkillLevels(skillsToAdd, parsed, skillAllocations);

    await actor.update({
        "system.attributes.body.value": attributes.body ?? 1,
        "system.attributes.mind.value": attributes.mind ?? 1,
        "system.attributes.spirit.value": attributes.spirit ?? 1,
        "system.details.assignment": assignment.name ?? ""
    });

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

    const existingByTypeAndName = new Map(
        actor.items.map(item => [`${item.type}:${item.name.toLowerCase()}`, item])
    );
    const pending = [];
    const skillUpdates = [];

    for (const skillData of skills) {
        if (!skillData) continue;
        const cloned = foundry.utils.deepClone(skillData);
        const skillKey = String(cloned.name ?? "").trim().toLowerCase();
        if (!skillKey) continue;

        const desired = desiredSkillLevels.get(skillKey);
        if (desired) {
            cloned.system = cloned.system ?? {};
            cloned.system.training = desired.training;
            cloned.system.focus = desired.focus;
        }

        const existing = existingByTypeAndName.get(`skill:${skillKey}`);
        if (existing) {
            const update = { _id: existing.id };
            let changed = false;
            const desiredTraining = Number(cloned.system?.training ?? 0);
            const desiredFocus = Number(cloned.system?.focus ?? 0);
            if (Number(existing.system?.training ?? 0) !== desiredTraining) {
                update["system.training"] = desiredTraining;
                changed = true;
            }
            if (Number(existing.system?.focus ?? 0) !== desiredFocus) {
                update["system.focus"] = desiredFocus;
                changed = true;
            }
            if (changed) skillUpdates.push(update);
            continue;
        }

        pending.push(cloned);
    }

    for (const item of talents.concat(equipment)) {
        if (!item) continue;
        const key = `${item.type}:${item.name.toLowerCase()}`;
        if (existingByTypeAndName.has(key)) continue;
        pending.push(item);
    }

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
    if (skillUpdates.length) {
        await actor.updateEmbeddedDocuments("Item", skillUpdates);
    }

    ui.notifications.info(game.i18n.format("LAUNDRY.AgentInitialized", { assignment: assignment.name }));
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

function _clampLevel(value, min = 0, max = 4) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, Math.trunc(num)));
}

function _skillLevelCost(level) {
    const safe = Math.max(0, Math.trunc(Number(level) || 0));
    return (safe * (safe + 1)) / 2;
}

function _calculateSkillCost(level, baseLevel = 0) {
    const current = Math.max(0, _clampLevel(level, 0, 4));
    const base = Math.max(0, Math.min(current, _clampLevel(baseLevel, 0, 4)));
    return _skillLevelCost(current) - _skillLevelCost(base);
}

function _calculateSkillXpUsage(skillAllocations, assignment) {
    const coreSet = new Set((assignment?.coreSkills ?? []).map(name => String(name).toLowerCase()));
    let total = 0;

    for (const allocation of Object.values(skillAllocations ?? {})) {
        const nameKey = String(allocation?.name ?? "").trim().toLowerCase();
        if (!nameKey) continue;
        const isCore = coreSet.has(nameKey);
        const baseTraining = _clampLevel(allocation.baseTraining ?? (isCore ? 1 : 0), 0, 4);
        const baseFocus = _clampLevel(allocation.baseFocus ?? (isCore ? 1 : 0), 0, 4);
        const training = _clampLevel(allocation.training ?? baseTraining, baseTraining, 4);
        const focus = _clampLevel(allocation.focus ?? baseFocus, baseFocus, 4);
        total += _calculateSkillCost(training, baseTraining) + _calculateSkillCost(focus, baseFocus);
    }

    return total;
}

function _normalizeSkillAllocations(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;

    for (const [key, raw] of Object.entries(input)) {
        const name = String(raw?.name ?? key ?? "").trim();
        if (!name) continue;
        const baseTraining = _clampLevel(raw?.baseTraining ?? 0, 0, 4);
        const baseFocus = _clampLevel(raw?.baseFocus ?? 0, 0, 4);
        out[name.toLowerCase()] = {
            name,
            baseTraining,
            baseFocus,
            training: _clampLevel(raw?.training ?? baseTraining, baseTraining, 4),
            focus: _clampLevel(raw?.focus ?? baseFocus, baseFocus, 4)
        };
    }

    return out;
}

function _buildDesiredSkillLevels(skillNames, assignmentData, allocations) {
    const coreSet = new Set((assignmentData?.coreSkills ?? []).map(name => String(name).toLowerCase()));
    const normalized = _normalizeSkillAllocations(allocations);
    const out = new Map();

    for (const name of _uniqueList(skillNames)) {
        const key = name.toLowerCase();
        const isCore = coreSet.has(key);
        const baseTraining = isCore ? 1 : 0;
        const baseFocus = isCore ? 1 : 0;
        const allocation = normalized[key] ?? {
            name,
            baseTraining,
            baseFocus,
            training: baseTraining,
            focus: baseFocus
        };

        out.set(key, {
            name,
            training: _clampLevel(allocation.training, baseTraining, 4),
            focus: _clampLevel(allocation.focus, baseFocus, 4)
        });
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
    const parsedSkillXp = Number(sys.skillXP ?? sys.skillXp ?? sys.skillPoints ?? 0);
    const skillXpBudget = Number.isFinite(parsedSkillXp) && parsedSkillXp > 0
        ? Math.max(0, Math.trunc(parsedSkillXp))
        : 12;

    return {
        coreSkills,
        optionalSkills,
        coreTalents,
        optionalTalents,
        equipment,
        skillChoiceCount,
        talentChoiceCount,
        skillXpBudget
    };
}

function _toAssignmentData(doc) {
    const sys = doc.system ?? {};
    const attrs = sys.attributes ?? {};
    const parsed = _parseAssignmentSystem(sys);

    return {
        id: doc.id,
        name: doc.name,
        description: _stripHtml(sys.description ?? ""),
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
        talentChoiceCount: parsed.talentChoiceCount,
        skillXpBudget: parsed.skillXpBudget
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
        const entry = _findCompendiumMatch(index, name);
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
            const entry = _findCompendiumMatch(index, name);
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

function _findCompendiumMatch(index, name) {
    const normalized = String(name ?? "").trim().toLowerCase();
    if (!normalized) return null;
    return index.find(e =>
        String(e?.name ?? "").toLowerCase().includes(normalized)
    ) ?? null;
}

function _stripHtml(value) {
    return String(value ?? "").replace(/(<([^>]+)>)/gi, "").trim();
}
