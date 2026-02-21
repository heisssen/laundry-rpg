import {
    describeTalentPrerequisiteResult,
    evaluateTalentPrerequisites
} from "../utils/talent-prerequisites.js";

export class LaundryCharacterBuilder extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this._assignmentById = new Map();
        this._talentByName = new Map();
        this.creationMode = options.creationMode || "assignment";
    }

    static async create(actor, options = {}) {
        let creationMode = options.creationMode;
        if (!creationMode) {
            creationMode = await new Promise(resolve => {
                new Dialog({
                    title: "Character Creation Method",
                    content: "<p>Choose your character creation method:</p>",
                    buttons: {
                        assignment: {
                            label: "Assignment-based",
                            callback: () => resolve("assignment")
                        },
                        custom: {
                            label: "Custom (40 XP)",
                            callback: () => resolve("custom")
                        }
                    },
                    default: "assignment",
                    close: () => resolve(null)
                }).render(true);
            });
        }

        if (!creationMode) {
            return null; // User closed the dialog
        }

        return new LaundryCharacterBuilder(actor, { ...options, creationMode });
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-character-builder",
            classes: ["laundry-rpg", "character-builder", "laundry-dialog"],
            title: "Form 2B: Agent Requisition",
            width: 960,
            height: 860,
            resizable: true
        });
    }

    get template() {
        if (this.creationMode === 'custom') {
            return 'systems/laundry-rpg/templates/actor/custom-character-builder.html';
        }
        return 'systems/laundry-rpg/templates/actor/character-builder.html';
    }

    async getData() {
        if (this.creationMode === 'custom') {
            const data = await this._getCustomData();
            this.skills = data.skills;
            this.talents = data.talents;
            return data;
        }
        return this._getAssignmentData();
    }

    async _getAssignmentData() {
        const pack = game.packs.get("laundry-rpg.assignments");
        const talentsPack = game.packs.get("laundry-rpg.talents");
        let assignments = [];
        this._assignmentById = new Map();
        this._talentByName = new Map();

        if (pack) {
            const docs = await pack.getDocuments();
            assignments = docs
                .map(doc => _toAssignmentData(doc))
                .sort((a, b) => a.name.localeCompare(b.name));

            for (const assignment of assignments) {
                this._assignmentById.set(assignment.id, assignment);
            }
        }

        if (talentsPack) {
            const talentDocs = await talentsPack.getDocuments();
            for (const doc of talentDocs) {
                const key = String(doc?.name ?? "").trim().toLowerCase();
                if (!key) continue;
                this._talentByName.set(key, {
                    name: doc.name,
                    requirements: String(doc.system?.requirements ?? "")
                });
            }
        }

        const profile = _normalizeProfileDraft(this.actor?.system?.details?.profile);
        const existingBiography = _stripHtml(this.actor?.system?.biography ?? "");
        if (!profile.preview) {
            profile.preview = existingBiography || _buildBiographyDraftText({
                actorName: this.actor?.name ?? "Agent",
                assignmentName: "",
                profile
            });
        }

        return {
            assignments,
            hasAssignments: assignments.length > 0,
            actorName: this.actor?.name ?? "Agent",
            profile
        };
    }

    async _getCustomData() {
        const skillsPack = game.packs.get("laundry-rpg.skills");
        const talentsPack = game.packs.get("laundry-rpg.talents");
        let skills = [];
        let talents = [];

        if (skillsPack) {
            skills = (await skillsPack.getDocuments()).map(doc => doc.toObject());
        }

        if (talentsPack) {
            talents = (await talentsPack.getDocuments()).map(doc => doc.toObject());
        }

        return {
            actorName: this.actor?.name ?? "Agent",
            skills,
            talents,
            initialXp: 40
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (this.creationMode === 'custom') {
            this._activateCustomListeners(html);
        } else {
            this._activateAssignmentListeners(html);
        }
    }

    _activateAssignmentListeners(html) {
        html.find("form").on("submit", this._onSubmit.bind(this));
        html.find(".builder-confirm").on("click", (ev) => this._onSubmit(ev));
        html.find("form").on("keydown", (ev) => {
            if (ev.key !== "Enter") return;
            if (ev.target?.tagName === "TEXTAREA") return;
            ev.preventDefault();
            this._onSubmit(ev);
        });
        html.find(".builder-cancel").on("click", () => this.close());
        html.find("#assignment-select").on("change", (ev) => {
            this._renderAssignmentDetails(ev.currentTarget?.value ?? "");
        });
        html.on("click", ".builder-tab-btn", (ev) => this._onBuilderTabClick(ev));
        html.on("change", ".builder-choice-input", (ev) => this._onChoiceChanged(ev.currentTarget));
        html.on("change", ".skill-allocation-input", (ev) => this._onSkillAllocationChanged(ev.currentTarget));
        html.find(".apply-skill-preset").on("click", (ev) => this._onApplySkillPreset(ev));
        html.find(".builder-generate-bio").on("click", (ev) => this._onGenerateBiographyDraft(ev));

        const select = html.find("#assignment-select")[0];
        if (select) this._renderAssignmentDetails(select.value);
        this._setBuilderTab("requisition", { force: true });
        this._syncBuilderTabState(this._getSelectedAssignment());
    }

    _activateCustomListeners(html) {
        this.customBuild = {
            attributes: {
                body: 1,
                mind: 1,
                spirit: 1
            },
            skills: this.skills.reduce((obj, skill) => {
                obj[skill.name] = { training: 0, focus: 0 };
                return obj;
            }, {}),
            talents: [], // [talentName]
            xp: 40
        };

        this._renderCustomBuilder(html);

        html.find('.builder-confirm').on('click', (ev) => this._onCustomSubmit(ev));
        html.find('.builder-cancel').on('click', () => this.close());
        html.on('click', '.increase-attr', (ev) => this._onIncreaseAttribute(ev));
        html.on('click', '.decrease-attr', (ev) => this._onDecreaseAttribute(ev));
        html.on('click', '.increase-skill', (ev) => this._onIncreaseSkill(ev));
        html.on('click', '.decrease-skill', (ev) => this._onDecreaseSkill(ev));
        html.on('click', '.buy-talent', (ev) => this._onBuyTalent(ev));
    }

    _renderCustomBuilder(html) {
        // Render attributes
        const attributesHtml = Object.keys(this.customBuild.attributes).map(attrName => {
            const attrValue = this.customBuild.attributes[attrName];
            return `
                <div class="attribute-allocation-row" data-attribute="${attrName}">
                    <span class="attribute-name">${attrName.charAt(0).toUpperCase() + attrName.slice(1)}</span>
                    <input type="number" class="attribute-value" value="${attrValue}" disabled />
                    <div class="attribute-controls">
                        <button type="button" class="increase-attr" data-attribute="${attrName}" ${attrValue >= 4 ? 'disabled' : ''}>+</button>
                        <button type="button" class="decrease-attr" data-attribute="${attrName}" ${attrValue <= 1 ? 'disabled' : ''}>-</button>
                    </div>
                </div>
            `;
        }).join('');
        html.find('.attribute-allocation-grid').html(attributesHtml);

        // Render skills
        const skillsHtml = this.skills.map(skill => {
            const skillData = this.customBuild.skills[skill.name] || { training: 0, focus: 0 };
            return `
                <div class="skill-allocation-row" data-skill-name="${skill.name}">
                    <span class="skill-name">${skill.name}</span>
                    <div class="skill-controls">
                        <span>Training: ${skillData.training}</span>
                        <button type="button" class="increase-skill" data-skill-name="${skill.name}" data-type="training" ${skillData.training >= 4 ? 'disabled' : ''}>+</button>
                        <button type="button" class="decrease-skill" data-skill-name="${skill.name}" data-type="training" ${skillData.training <= 0 ? 'disabled' : ''}>-</button>
                    </div>
                    <div class="skill-controls">
                        <span>Focus: ${skillData.focus}</span>
                        <button type="button" class="increase-skill" data-skill-name="${skill.name}" data-type="focus" ${skillData.focus >= 4 ? 'disabled' : ''}>+</button>
                        <button type="button" class="decrease-skill" data-skill-name="${skill.name}" data-type="focus" ${skillData.focus <= 0 ? 'disabled' : ''}>-</button>
                    </div>
                </div>
            `;
        }).join('');
        html.find('.skill-allocation-list').html(skillsHtml);

        // Render talents
        const talentsHtml = this.talents.map(talent => {
            const isBought = this.customBuild.talents.includes(talent.name);
            return `
                <div class="talent-allocation-row" data-talent-name="${talent.name}">
                    <span class="talent-name">${talent.name}</span>
                    <div class="talent-controls">
                        <button type="button" class="buy-talent" data-talent-name="${talent.name}" ${isBought ? 'disabled' : ''}>
                            ${isBought ? 'Bought' : 'Buy (4 XP)'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        html.find('.talent-allocation-list').html(talentsHtml);

        // Render XP
        html.find('.xp-value').text(this.customBuild.xp);
    }

    _onBuyTalent(ev) {
        const talentName = ev.currentTarget.dataset.talentName;
        if (this.customBuild.talents.includes(talentName)) return;

        const cost = 4;
        if (this.customBuild.xp < cost) {
            ui.notifications.warn("Not enough XP!");
            return;
        }

        this.customBuild.talents.push(talentName);
        this.customBuild.xp -= cost;
        this._renderCustomBuilder(this.element);
    }


    _onIncreaseSkill(ev) {
        const skillName = ev.currentTarget.dataset.skillName;
        const type = ev.currentTarget.dataset.type;
        const skillData = this.customBuild.skills[skillName];
        const currentValue = skillData[type];
        if (currentValue >= 4) return;

        const cost = _calculateSkillCost(currentValue + 1, currentValue);
        if (this.customBuild.xp < cost) {
            ui.notifications.warn("Not enough XP!");
            return;
        }

        skillData[type]++;
        this.customBuild.xp -= cost;
        this._renderCustomBuilder(this.element);
    }

    _onDecreaseSkill(ev) {
        const skillName = ev.currentTarget.dataset.skillName;
        const type = ev.currentTarget.dataset.type;
        const skillData = this.customBuild.skills[skillName];
        const currentValue = skillData[type];
        if (currentValue <= 0) return;

        const cost = _calculateSkillCost(currentValue, currentValue - 1);
        skillData[type]--;
        this.customBuild.xp += cost;
        this._renderCustomBuilder(this.element);
    }

    _getAttributeCost(currentValue) {
        if (currentValue === 1) return 3;
        if (currentValue === 2) return 5;
        if (currentValue === 3) return 10;
        return Infinity; // Cannot increase past 4
    }

    _onIncreaseAttribute(ev) {
        const attrName = ev.currentTarget.dataset.attribute;
        const currentValue = this.customBuild.attributes[attrName];
        if (currentValue >= 4) return;

        const cost = this._getAttributeCost(currentValue);
        if (this.customBuild.xp < cost) {
            ui.notifications.warn("Not enough XP!");
            return;
        }

        this.customBuild.attributes[attrName]++;
        this.customBuild.xp -= cost;
        this._renderCustomBuilder(this.element);
    }

    _onDecreaseAttribute(ev) {
        const attrName = ev.currentTarget.dataset.attribute;
        const currentValue = this.customBuild.attributes[attrName];
        if (currentValue <= 1) return;

        const cost = this._getAttributeCost(currentValue - 1);
        this.customBuild.attributes[attrName]--;
        this.customBuild.xp += cost;
        this._renderCustomBuilder(this.element);
    }

    async _onCustomSubmit(ev) {
        const hasItems = (this.actor?.items?.size ?? 0) > 0;
        if (hasItems) {
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("LAUNDRY.ReinitializeTitle"),
                content: `<p>${game.i18n.localize("LAUNDRY.ReinitializeBody")}</p>`,
                classes: ["laundry-rpg", "laundry-dialog"]
            });
            if (!confirmed) return;
        }

        await this._applyCustomBuildToActor();
        this.close();
    }

    async _applyCustomBuildToActor() {
        const build = this.customBuild;
        const actor = this.actor;

        // Update attributes
        await actor.update({
            'system.attributes.body.value': build.attributes.body,
            'system.attributes.mind.value': build.attributes.mind,
            'system.attributes.spirit.value': build.attributes.spirit,
        });

        const itemsToAdd = [];

        // Skills
        const skillNames = Object.keys(build.skills).filter(
            (skillName) => build.skills[skillName].training > 0 || build.skills[skillName].focus > 0
        );
        if (skillNames.length > 0) {
            const skillItems = await _fetchCompendiumItems('laundry-rpg.skills', 'skill', skillNames, _stubSkill);
            for (const item of skillItems) {
                const skillData = build.skills[item.name];
                item.system.training = skillData.training;
                item.system.focus = skillData.focus;
                itemsToAdd.push(item);
            }
        }

        // Talents
        if (build.talents.length > 0) {
            const talentItems = await _fetchCompendiumItems('laundry-rpg.talents', 'talent', build.talents, _stubTalent);
            itemsToAdd.push(...talentItems);
        }
        
        if (itemsToAdd.length > 0) {
            await actor.createEmbeddedDocuments('Item', itemsToAdd);
        }

        ui.notifications.info(game.i18n.format("LAUNDRY.AgentInitialized", { assignment: "Custom Build" }));
    }

    _onBuilderTabClick(ev) {
        ev.preventDefault();
        const tab = String(ev.currentTarget?.dataset?.builderTab ?? "").trim();
        this._setBuilderTab(tab);
    }

    _setBuilderTab(tab, { force = false } = {}) {
        const root = this.element?.[0];
        if (!root) return;

        const allowed = new Set(["requisition", "training", "dossier"]);
        const requested = allowed.has(tab) ? tab : "requisition";
        const btn = root.querySelector(`.builder-tab-btn[data-builder-tab="${requested}"]`);
        const resolved = (!force && btn?.disabled) ? "requisition" : requested;

        root.dataset.builderTab = resolved;
        for (const button of root.querySelectorAll(".builder-tab-btn")) {
            button.classList.toggle("active", button.dataset.builderTab === resolved);
        }
        for (const panel of root.querySelectorAll(".builder-tab-panel")) {
            panel.classList.toggle("active", panel.dataset.builderTab === resolved);
        }
    }

    _syncBuilderTabState(assignment) {
        const root = this.element?.[0];
        if (!root) return;

        const hasAssignment = Boolean(assignment);
        for (const button of root.querySelectorAll('.builder-tab-btn[data-builder-tab]')) {
            const tab = String(button.dataset.builderTab ?? "");
            if (tab === "requisition") {
                button.disabled = false;
                button.classList.remove("is-locked");
                continue;
            }
            button.disabled = !hasAssignment;
            button.classList.toggle("is-locked", !hasAssignment);
        }

        if (!hasAssignment) {
            this._setBuilderTab("requisition", { force: true });
        } else {
            const current = String(root.dataset.builderTab ?? "requisition");
            this._setBuilderTab(current, { force: true });
        }
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

        const chosenTalents = _uniqueList(
            _readCheckedValues(form, "talent").filter(name => assignmentData.optionalTalents.includes(name))
        );
        const skillAllocations = this._readSkillAllocations(form, assignmentData);
        const profileDraft = this._readProfileDraft(form);
        const biographyDraft = String(form.querySelector('[name="bioPreview"]')?.value ?? "").trim();
        const applyBiography = Boolean(form.querySelector('[name="applyBiography"]')?.checked);
        const overwriteBiography = Boolean(form.querySelector('[name="overwriteBiography"]')?.checked);
        const xpBudget = Number(assignmentData.skillXpBudget ?? 12);
        const usedXp = _calculateSkillXpUsage(skillAllocations, assignmentData);
        if (usedXp > xpBudget) {
            ui.notifications.warn(game.i18n.format("LAUNDRY.SkillXpExceeded", {
                used: usedXp,
                max: xpBudget
            }));
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
                content: `<p>${game.i18n.localize("LAUNDRY.ReinitializeBody")}</p>`,
                classes: ["laundry-rpg", "laundry-dialog"]
            });
            if (!confirmed) return;
        }

        await applyAssignmentToActor(this.actor, assignment, {
            chosenTalents,
            skillAllocations,
            profileDraft,
            biographyDraft,
            applyBiography,
            overwriteBiography
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
            this._renderChoiceList("talent", [], 0, game.i18n.localize("LAUNDRY.SelectAssignmentFirst"));
            this._updateChoiceCounters({ skillChoiceCount: 0, talentChoiceCount: 0 });
            this._renderSkillAllocation(null);
            this._syncBuilderTabState(null);
            this._updateBiographyDraftFromSelection({ force: false });
            this._refreshTalentPrerequisites();
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
            "talent",
            assignment.optionalTalents,
            assignment.talentChoiceCount,
            game.i18n.localize("LAUNDRY.NoOptionalTalents")
        );
        this._updateChoiceCounters(assignment);
        this._renderSkillAllocation(assignment);
        this._syncBuilderTabState(assignment);
        this._updateBiographyDraftFromSelection({ force: false });
        this._refreshTalentPrerequisites();
    }

    _renderChoiceList(kind, options, choiceCount, emptyMessage) {
        const root = this.element?.[0];
        if (!root) return;

        const listEl = root.querySelector(`.${kind}-choices`);
        const hintEl = root.querySelector(`.${kind}-choice-hint`);
        if (!listEl) return;

        if (!options.length) {
            listEl.innerHTML = `<p class="builder-choice-empty">${_escapeHtml(emptyMessage)}</p>`;
            if (hintEl) hintEl.textContent = game.i18n.localize("LAUNDRY.NoSelectionRequired");
            return;
        }

        if (hintEl) {
            hintEl.textContent = choiceCount > 0
                ? game.i18n.format("LAUNDRY.ChooseN", { count: choiceCount })
                : game.i18n.localize("LAUNDRY.ChooseAny");
        }

        const assignment = this._getSelectedAssignment();
        const form = root.querySelector("form");
        const mockActor = kind === "talent"
            ? this._buildMockActor(assignment, form)
            : null;

        listEl.innerHTML = options.map(name => {
            if (kind !== "talent") {
                return `<label class="builder-choice-option">
                    <input class="builder-choice-input" type="checkbox" data-choice-kind="${kind}" value="${_escapeHtml(name)}" />
                    <span>${_escapeHtml(name)}</span>
                </label>`;
            }

            const talentMeta = this._talentByName.get(String(name).toLowerCase()) ?? {
                name,
                requirements: ""
            };
            const prereq = evaluateTalentPrerequisites(mockActor, {
                name: talentMeta.name,
                type: "talent",
                system: {
                    requirements: talentMeta.requirements
                }
            });
            const statusLabel = prereq.status === "unmet"
                ? game.i18n.localize("LAUNDRY.PrereqUnmetLabel")
                : (prereq.status === "review"
                    ? game.i18n.localize("LAUNDRY.PrereqReviewLabel")
                    : game.i18n.localize("LAUNDRY.PrereqMetLabel"));
            const badgeClass = `talent-prereq-badge talent-prereq-${prereq.status}`;
            return `<label class="builder-choice-option builder-choice-option-talent" title="${_escapeHtml(describeTalentPrerequisiteResult(prereq))}">
                <input class="builder-choice-input" type="checkbox" data-choice-kind="${kind}" value="${_escapeHtml(name)}" />
                <span class="builder-choice-title">${_escapeHtml(name)}</span>
                <span class="${badgeClass}">${_escapeHtml(statusLabel)}</span>
            </label>`;
        }).join("");
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
        this._refreshTalentPrerequisites();
    }

    _onApplySkillPreset(ev) {
        ev.preventDefault();
        const assignment = this._getSelectedAssignment();
        if (!assignment) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.SelectAssignmentFirst"));
            return;
        }

        const root = this.element?.[0];
        const form = root?.querySelector("form");
        if (!form) return;

        const mode = String(form.querySelector(".skill-preset-select")?.value ?? "manual");
        if (mode === "manual") return;

        const rows = Array.from(form.querySelectorAll(".skill-allocation-row"));
        if (!rows.length) return;

        for (const row of rows) {
            const baseTraining = Number(row.dataset.baseTraining ?? 0);
            const baseFocus = Number(row.dataset.baseFocus ?? 0);
            const trainingInput = row.querySelector('input[data-track="training"]');
            const focusInput = row.querySelector('input[data-track="focus"]');
            if (trainingInput) trainingInput.value = String(_clampLevel(baseTraining, baseTraining, 4));
            if (focusInput) focusInput.value = String(_clampLevel(baseFocus, baseFocus, 4));
        }

        const orderedTracks = this._buildSkillPresetTracks(rows, mode);
        const budget = Math.max(0, Number(assignment.skillXpBudget ?? 12));
        let used = _calculateSkillXpUsage(this._readSkillAllocations(form, assignment), assignment);

        let changed = false;
        while (used < budget) {
            let progressed = false;

            for (const input of orderedTracks) {
                const min = Number(input.min ?? 0);
                const max = Number(input.max ?? 4);
                const current = _clampLevel(input.value, min, max);
                if (current >= max) continue;

                input.value = String(current + 1);
                const nextUsed = _calculateSkillXpUsage(this._readSkillAllocations(form, assignment), assignment);
                if (nextUsed <= budget) {
                    used = nextUsed;
                    changed = true;
                    progressed = true;
                } else {
                    input.value = String(current);
                }

                if (used >= budget) break;
            }

            if (!progressed) break;
        }

        this._updateSkillXpCounter(assignment);
        this._refreshTalentPrerequisites();
        if (changed) {
            ui.notifications.info(game.i18n.localize("LAUNDRY.SkillPresetApplied"));
        }
    }

    _buildSkillPresetTracks(rows, mode) {
        const withMeta = rows.map((row, index) => {
            const skillName = String(row.dataset.skillName ?? "");
            const lowered = skillName.toLowerCase();
            const core = Number(row.dataset.baseTraining ?? 0) > 0;
            let priority = index + 1;

            if (mode === "focused") {
                const combatOrder = [
                    "close combat",
                    "ranged",
                    "awareness",
                    "reflexes",
                    "athletics",
                    "stealth"
                ];
                const ix = combatOrder.indexOf(lowered);
                priority = ix >= 0 ? ix : (core ? 20 + index : 40 + index);
            } else if (mode === "bureau") {
                const bureauOrder = [
                    "bureaucracy",
                    "academics",
                    "computers",
                    "science",
                    "occult",
                    "awareness",
                    "reflexes"
                ];
                const ix = bureauOrder.indexOf(lowered);
                priority = ix >= 0 ? ix : (core ? 20 + index : 40 + index);
            } else {
                priority = core ? index : 30 + index;
            }

            return {
                row,
                priority
            };
        }).sort((a, b) => a.priority - b.priority);

        if (mode === "balanced") {
            const training = withMeta
                .map(meta => meta.row.querySelector('input[data-track="training"]'))
                .filter(Boolean);
            const focus = withMeta
                .map(meta => meta.row.querySelector('input[data-track="focus"]'))
                .filter(Boolean);
            return training.concat(focus);
        }

        const tracks = [];
        for (const meta of withMeta) {
            const training = meta.row.querySelector('input[data-track="training"]');
            const focus = meta.row.querySelector('input[data-track="focus"]');
            if (training) tracks.push(training);
            if (focus) tracks.push(focus);
        }
        return tracks;
    }

    _onGenerateBiographyDraft(ev) {
        ev.preventDefault();
        this._updateBiographyDraftFromSelection({ force: true });
    }

    _updateBiographyDraftFromSelection({ force = false } = {}) {
        const root = this.element?.[0];
        const form = root?.querySelector("form");
        if (!form) return;

        const preview = form.querySelector('[name="bioPreview"]');
        if (!preview) return;
        if (!force && String(preview.value ?? "").trim()) return;

        const assignment = this._getSelectedAssignment();
        const profile = this._readProfileDraft(form);
        preview.value = _buildBiographyDraftText({
            actorName: this.actor?.name ?? "Agent",
            assignmentName: assignment?.name ?? "",
            profile
        });
    }

    _readProfileDraft(form) {
        return _normalizeProfileDraft({
            codename: form?.querySelector('[name="bioCodename"]')?.value,
            background: form?.querySelector('[name="bioBackground"]')?.value,
            coverIdentity: form?.querySelector('[name="bioCoverIdentity"]')?.value,
            shortGoal: form?.querySelector('[name="bioShortGoal"]')?.value,
            longGoal: form?.querySelector('[name="bioLongGoal"]')?.value,
            notableIncident: form?.querySelector('[name="bioNotableIncident"]')?.value,
            personalNotes: form?.querySelector('[name="bioNotes"]')?.value,
            preview: form?.querySelector('[name="bioPreview"]')?.value
        });
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
        if (!assignment) return [];
        return _uniqueList(assignment.coreSkills.concat(assignment.optionalSkills));
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
        if (used <= budget) {
            this._refreshTalentPrerequisites();
            return;
        }

        let value = Number(inputEl.value ?? min);
        while (value > min && used > budget) {
            value -= 1;
            inputEl.value = String(value);
            allocations = this._readSkillAllocations(this.element?.find("form")[0], assignment);
            used = _calculateSkillXpUsage(allocations, assignment);
        }

        this._updateSkillXpCounter(assignment);
        this._refreshTalentPrerequisites();
        ui.notifications.warn(game.i18n.format("LAUNDRY.SkillXpExceeded", {
            used,
            max: budget
        }));
    }

    _buildMockActor(assignment, form) {
        const sourceItems = Array.from(this.actor?.items ?? []);
        const mockActor = {
            system: foundry.utils.deepClone(this.actor?.system ?? {}),
            items: sourceItems.map(item => (
                typeof item?.toObject === "function"
                    ? item.toObject()
                    : foundry.utils.deepClone(item)
            ))
        };

        if (!assignment || !form) return mockActor;

        mockActor.system = mockActor.system ?? {};
        mockActor.system.attributes = mockActor.system.attributes ?? {
            body: { value: 1 },
            mind: { value: 1 },
            spirit: { value: 1 }
        };
        mockActor.system.attributes.body = mockActor.system.attributes.body ?? { value: 1 };
        mockActor.system.attributes.mind = mockActor.system.attributes.mind ?? { value: 1 };
        mockActor.system.attributes.spirit = mockActor.system.attributes.spirit ?? { value: 1 };
        mockActor.system.attributes.body.value = Number(assignment.attributes?.body ?? 1);
        mockActor.system.attributes.mind.value = Number(assignment.attributes?.mind ?? 1);
        mockActor.system.attributes.spirit.value = Number(assignment.attributes?.spirit ?? 1);

        const allocations = this._readSkillAllocations(form, assignment);
        const draftSkills = this._getAllocatableSkills(assignment);
        const coreSkillSet = new Set(
            (assignment.coreSkills ?? []).map(name => String(name).trim().toLowerCase())
        );

        for (const skillName of draftSkills) {
            const key = String(skillName ?? "").trim().toLowerCase();
            if (!key) continue;

            const isCoreSkill = coreSkillSet.has(key);
            const alloc = allocations[key] || {
                training: isCoreSkill ? 1 : 0,
                focus: isCoreSkill ? 1 : 0
            };

            mockActor.items.push({
                type: "skill",
                name: skillName,
                system: {
                    training: Number(alloc.training ?? 0),
                    focus: Number(alloc.focus ?? 0)
                }
            });
        }

        const chosenTalents = _readCheckedValues(form, "talent");
        const allTalents = _uniqueList((assignment.coreTalents ?? []).concat(chosenTalents));
        for (const talentName of allTalents) {
            mockActor.items.push({
                type: "talent",
                name: talentName
            });
        }

        return mockActor;
    }

    _refreshTalentPrerequisites() {
        const root = this.element?.[0];
        const form = root?.querySelector("form");
        const assignment = this._getSelectedAssignment();
        if (!form || !assignment) return;

        const mockActor = this._buildMockActor(assignment, form);
        const talentLabels = root.querySelectorAll(".builder-choice-option-talent");

        for (const label of talentLabels) {
            const input = label.querySelector("input");
            if (!input) continue;

            const talentName = String(input.value ?? "").trim();
            if (!talentName) continue;

            const talentMeta = this._talentByName.get(talentName.toLowerCase()) ?? {
                name: talentName,
                requirements: ""
            };

            const prereq = evaluateTalentPrerequisites(mockActor, {
                name: talentMeta.name,
                type: "talent",
                system: { requirements: talentMeta.requirements }
            });

            const badge = label.querySelector(".talent-prereq-badge");
            if (badge) {
                const statusLabel = prereq.status === "unmet"
                    ? game.i18n.localize("LAUNDRY.PrereqUnmetLabel")
                    : (prereq.status === "review"
                        ? game.i18n.localize("LAUNDRY.PrereqReviewLabel")
                        : game.i18n.localize("LAUNDRY.PrereqMetLabel"));
                badge.className = `talent-prereq-badge talent-prereq-${prereq.status}`;
                badge.textContent = statusLabel;
            }

            label.title = describeTalentPrerequisiteResult(prereq);
        }
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

export async function applyAssignmentToActor(actor, assignment, selected = {}) {
    const sys = assignment.system ?? {};
    const attributes = sys.attributes ?? {};
    const parsed = _parseAssignmentSystem(sys);
    const profileDraft = _normalizeProfileDraft(selected.profileDraft);
    const applyBiography = Boolean(selected.applyBiography);
    const overwriteBiography = Boolean(selected.overwriteBiography);
    const biographyDraft = String(selected.biographyDraft ?? "").trim();

    const selectedTalents = _uniqueList(Array.isArray(selected.chosenTalents) ? selected.chosenTalents : [])
        .filter(name => parsed.optionalTalents.some(opt => opt.toLowerCase() === name.toLowerCase()));
    const skillAllocations = _normalizeSkillAllocations(selected.skillAllocations);

    const skillPool = parsed.coreSkills.concat(parsed.optionalSkills);
    const allocatedSkillNames = Object.values(skillAllocations).map(entry => entry.name);
    const skillsToAdd = _uniqueList(skillPool.concat(allocatedSkillNames));
    const talentsToAdd = _uniqueList(parsed.coreTalents.concat(selectedTalents));
    const desiredSkillLevels = _buildDesiredSkillLevels(skillsToAdd, parsed, skillAllocations);
    const actorUpdate = {
        "system.attributes.body.value": attributes.body ?? 1,
        "system.attributes.mind.value": attributes.mind ?? 1,
        "system.attributes.spirit.value": attributes.spirit ?? 1,
        "system.details.assignment": assignment.name ?? "",
        "system.details.profile": {
            codename: profileDraft.codename,
            background: profileDraft.background,
            coverIdentity: profileDraft.coverIdentity,
            shortGoal: profileDraft.shortGoal,
            longGoal: profileDraft.longGoal,
            notableIncident: profileDraft.notableIncident,
            personalNotes: profileDraft.personalNotes
        }
    };

    if (applyBiography) {
        const currentBio = String(actor.system?.biography ?? "").trim();
        if (overwriteBiography || !currentBio) {
            const draftText = biographyDraft || _buildBiographyDraftText({
                actorName: actor.name,
                assignmentName: assignment.name ?? "",
                profile: profileDraft
            });
            actorUpdate["system.biography"] = _biographyTextToHtml(draftText);
        }
    }

    await actor.update(actorUpdate);

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
    const skillCreates = [];
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

        skillCreates.push(cloned);
    }

    if (skillCreates.length) {
        const createdSkills = await actor.createEmbeddedDocuments("Item", skillCreates);
        for (const created of createdSkills ?? []) {
            existingByTypeAndName.set(`skill:${created.name.toLowerCase()}`, created);
        }
    }
    if (skillUpdates.length) {
        await actor.updateEmbeddedDocuments("Item", skillUpdates);
    }

    const nonSkillPending = [];
    const gearQuantityUpdates = [];
    const skippedTalents = [];

    for (const talentItem of talents) {
        if (!talentItem) continue;
        const key = `${talentItem.type}:${talentItem.name.toLowerCase()}`;
        if (existingByTypeAndName.has(key)) continue;

        const prereq = evaluateTalentPrerequisites(actor, talentItem);
        if (!prereq.enforceMet) {
            skippedTalents.push(`${talentItem.name}: ${describeTalentPrerequisiteResult(prereq)}`);
            continue;
        }

        nonSkillPending.push(talentItem);
    }

    for (const item of equipment) {
        if (!item) continue;
        const key = `${item.type}:${item.name.toLowerCase()}`;
        const existing = existingByTypeAndName.get(key);
        if (existing) {
            if (item.type === "gear") {
                const currentQty = Math.max(0, Math.trunc(Number(existing.system?.quantity) || 0));
                const addQty = Math.max(1, Math.trunc(Number(item.system?.quantity) || 1));
                const nextQty = currentQty + addQty;
                if (nextQty !== currentQty) {
                    gearQuantityUpdates.push({
                        _id: existing.id,
                        "system.quantity": nextQty
                    });
                }
            }
            continue;
        }
        nonSkillPending.push(item);
    }

    const dedupe = new Set();
    const toCreate = nonSkillPending.filter(item => {
        const key = `${item.type}:${item.name.toLowerCase()}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
    });

    if (toCreate.length) {
        await actor.createEmbeddedDocuments("Item", toCreate);
    }
    if (gearQuantityUpdates.length) {
        await actor.updateEmbeddedDocuments("Item", gearQuantityUpdates);
    }
    if (skippedTalents.length) {
        const details = skippedTalents.slice(0, 3).join(" | ");
        ui.notifications.warn(game.i18n.format("LAUNDRY.TalentPrereqSkipped", {
            count: skippedTalents.length,
            details
        }));
        console.warn("Laundry RPG | Skipped talents due to unmet prerequisites:", skippedTalents);
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
        img: "systems/laundry-rpg/icons/generated/_defaults/skill.webp",
        system: { description: "Skill added from Assignment.", attribute: "mind", training: 0, focus: 0 }
    };
}

function _stubTalent(name) {
    return {
        name,
        type: "talent",
        img: "systems/laundry-rpg/icons/generated/_defaults/talent.webp",
        system: { description: "Talent added from Assignment.", requirements: "" }
    };
}

function _stubGear(name) {
    return {
        name,
        type: "gear",
        img: "systems/laundry-rpg/icons/generated/_defaults/gear.webp",
        system: { quantity: 1, weight: 0 }
    };
}

function _findCompendiumMatch(index, name) {
    const normalized = String(name ?? "").trim().toLowerCase();
    if (!normalized) return null;
    const exact = index.find(e => String(e?.name ?? "").trim().toLowerCase() === normalized);
    if (exact) return exact;
    return index.find(e => String(e?.name ?? "").trim().toLowerCase().includes(normalized)) ?? null;
}

function _stripHtml(value) {
    return String(value ?? "").replace(/(<([^>]+)>)/gi, "").trim();
}

function _normalizeProfileDraft(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
        codename: String(source.codename ?? "").trim(),
        background: String(source.background ?? "").trim(),
        coverIdentity: String(source.coverIdentity ?? "").trim(),
        shortGoal: String(source.shortGoal ?? "").trim(),
        longGoal: String(source.longGoal ?? "").trim(),
        notableIncident: String(source.notableIncident ?? "").trim(),
        personalNotes: String(source.personalNotes ?? "").trim(),
        preview: String(source.preview ?? "").trim()
    };
}

function _buildBiographyDraftText({ actorName = "", assignmentName = "", profile = {} } = {}) {
    const safeProfile = _normalizeProfileDraft(profile);
    const lines = [];
    const displayName = actorName || "Unnamed Agent";
    const codename = safeProfile.codename
        ? `${displayName} (${safeProfile.codename})`
        : displayName;

    lines.push(`${codename} serves with The Laundry.`);
    if (assignmentName) {
        lines.push(`Current assignment: ${assignmentName}.`);
    }
    if (safeProfile.background) {
        lines.push(`Background: ${safeProfile.background}.`);
    }
    if (safeProfile.coverIdentity) {
        lines.push(`Cover identity: ${safeProfile.coverIdentity}.`);
    }
    if (safeProfile.shortGoal) {
        lines.push(`Short-term objective: ${safeProfile.shortGoal}.`);
    }
    if (safeProfile.longGoal) {
        lines.push(`Long-term objective: ${safeProfile.longGoal}.`);
    }
    if (safeProfile.notableIncident) {
        lines.push(`Notable incident: ${safeProfile.notableIncident}.`);
    }
    if (safeProfile.personalNotes) {
        lines.push(`Additional notes: ${safeProfile.personalNotes}.`);
    }
    if (!lines.length) return "";
    return lines.join("\n");
}

function _biographyTextToHtml(text) {
    const normalized = String(text ?? "").trim();
    if (!normalized) return "";
    const safe = _escapeHtml(normalized);
    return safe
        .split(/\n{2,}/)
        .map(block => `<p>${block.replace(/\n/g, "<br />")}</p>`)
        .join("");
}
