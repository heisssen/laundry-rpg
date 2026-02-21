const APP_API = foundry.applications?.api ?? {};
const BaseApplication = APP_API.ApplicationV2 ?? Application;
const HandlebarsMixin = APP_API.HandlebarsApplicationMixin ?? (Base => Base);

const FLAG_SCOPE = "laundry-rpg";
const FLAG_KEY = "endeavours";

const ENDEAVOUR_CHOICES = [
    { id: "asset-cultivation", label: "Asset Cultivation" },
    { id: "business-as-usual", label: "Business As Usual" },
    { id: "compassionate-leave", label: "Compassionate Leave" },
    { id: "cover-up", label: "Cover Up" },
    { id: "dating-scene", label: "Dating Scene" },
    { id: "deep-research", label: "Deep Research" },
    { id: "false-identity", label: "False Identity" },
    { id: "family-vacation", label: "Family Vacation" },
    { id: "filing-paperwork", label: "Filing Paperwork" },
    { id: "hidden-agenda", label: "Hidden Agenda" },
    { id: "hobbies-and-interests", label: "Hobbies and Interests" },
    { id: "infirmary-shift", label: "Infirmary Shift" },
    { id: "long-term-planning", label: "Long-Term Planning" },
    { id: "moonlighting", label: "Moonlighting" },
    { id: "office-politics", label: "Office Politics" },
    { id: "overseas-conference", label: "Overseas Conference" },
    { id: "overtime", label: "Overtime" },
    { id: "performance-review", label: "Performance Review" },
    { id: "repair-equipment", label: "Repair Equipment" },
    { id: "research-and-development", label: "Research and Development" },
    { id: "role-transfer", label: "Role Transfer" },
    { id: "sick-leave", label: "Sick Leave" },
    { id: "teambuilding", label: "Teambuilding" },
    { id: "training-course", label: "Training Course" },
    { id: "writing-memoirs", label: "Writing Memoirs" }
];

const ENDEAVOUR_SUMMARY = {
    "asset-cultivation": "DN 4:3 Mind (Fast Talk) or Spirit (Resolve) to recruit an asset.",
    "business-as-usual": "Mark BAU complete to avoid departmental friction.",
    "compassionate-leave": "If every surviving PC chooses this, team Luck maximum increases by 1.",
    "cover-up": "If every team member chooses this, reduce Threat by 1.",
    "dating-scene": "Set social/charmed resilience benefits for next mission.",
    "deep-research": "DN 4:3 Mind (Academics) to secure Forgotten Knowledge-style lead.",
    "false-identity": "DN 4:3 Mind (Fast Talk) to avoid suspicion while undercover.",
    "family-vacation": "Gain +1 bonus Adrenaline at next mission start.",
    "filing-paperwork": "Next Requisition Support check gains +1 automatic success.",
    "hidden-agenda": "DN 4:3 Body (Stealth) to avoid coworker suspicion.",
    "hobbies-and-interests": "Choose a skill for one free reroll next mission.",
    "infirmary-shift": "DN 5:1 Spirit (Presence) or Mind (Medicine), heal allies on Sick Leave.",
    "long-term-planning": "Flag boosted rerolls with Luck/Backup Plan/Project Planning.",
    "moonlighting": "Gain disposable income, start next mission Weakened.",
    "office-politics": "Declare in-group faction stance for future interactions.",
    "overseas-conference": "DN 5:2 Mind (Intuition) to gain extra intel from attendees.",
    "overtime": "Choose department for interaction/requisition Advantage next mission.",
    "performance-review": "DN 4:2 Mind (Bureaucracy), grant +1 XP KPI rider on success.",
    "repair-equipment": "DN 5:1 Mind (Computers/Technology/Engineering) to repair kit.",
    "research-and-development": "Mark custom R&D project progression.",
    "role-transfer": "Record assignment transfer request for GM processing.",
    "sick-leave": "Remove 1 Injury space.",
    "teambuilding": "Restore 1 Party Luck (up to max).",
    "training-course": "Spend 5 XP, increase Training/Focus by 1, pending +1 XP refund flag.",
    "writing-memoirs": "Flag Last Stand maximise-successes effect for future missions."
};

const APPROACH_OPTIONS = {
    "asset-cultivation": [
        { id: "fast-talk", label: "Mind (Fast Talk)", attribute: "mind", skill: "Fast Talk" },
        { id: "resolve", label: "Spirit (Resolve)", attribute: "spirit", skill: "Resolve" }
    ],
    "infirmary-shift": [
        { id: "presence", label: "Spirit (Presence) - Psychological care", attribute: "spirit", skill: "Presence" },
        { id: "medicine", label: "Mind (Medicine) - Physical care", attribute: "mind", skill: "Medicine" }
    ],
    "repair-equipment": [
        { id: "computers", label: "Mind (Computers)", attribute: "mind", skill: "Computers" },
        { id: "technology", label: "Mind (Technology)", attribute: "mind", skill: "Technology" },
        { id: "engineering", label: "Mind (Engineering)", attribute: "mind", skill: "Engineering" }
    ]
};

export class EndeavoursApp extends HandlebarsMixin(BaseApplication) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
            id: "laundry-endeavours",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-endeavours"],
            tag: "section",
            window: { title: "Endeavours - Downtime Activities" },
            position: { width: 640, height: "auto" }
        },
        { inplace: false }
    );

    static PARTS = {
        body: {
            template: "systems/laundry-rpg/templates/apps/endeavours.html"
        }
    };

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions ?? {}, {
            id: "laundry-endeavours",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-endeavours"],
            template: "systems/laundry-rpg/templates/apps/endeavours.html",
            title: "Endeavours - Downtime Activities",
            width: 640,
            height: "auto",
            resizable: true
        });
    }

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor ?? null;
        this._selectedEndeavour = "sick-leave";
        this._selectedSkill = "";
        this._trainingStat = "training";
        this._selectedApproach = "";
        this._selectedTargetActorId = "";
        this._departmentName = "";
        this._factionName = "";
        this._travelAbroad = false;
        this._actionsAbortController = null;
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
        const skills = _collectActorSkills(this.actor);
        if (!this._selectedSkill && skills.length) this._selectedSkill = skills[0].name;

        const approaches = APPROACH_OPTIONS[this._selectedEndeavour] ?? [];
        if (!this._selectedApproach && approaches.length) this._selectedApproach = approaches[0].id;
        if (approaches.length && !approaches.some(option => option.id === this._selectedApproach)) {
            this._selectedApproach = approaches[0].id;
        }

        const characterTargets = game.actors
            .filter(actor => actor.type === "character")
            .map(actor => ({ id: actor.id, name: actor.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (!this._selectedTargetActorId && characterTargets.length) {
            this._selectedTargetActorId = this.actor?.id ?? characterTargets[0].id;
        }

        const needsSkillPicker = ["training-course", "hobbies-and-interests"].includes(this._selectedEndeavour);
        const needsApproachPicker = ["asset-cultivation", "infirmary-shift", "repair-equipment"].includes(this._selectedEndeavour);
        const needsTargetPicker = this._selectedEndeavour === "infirmary-shift";
        const needsDepartment = this._selectedEndeavour === "overtime";
        const needsFaction = this._selectedEndeavour === "office-politics";
        const needsTravelToggle = this._selectedEndeavour === "family-vacation";

        return {
            actorName: this.actor?.name ?? "Unknown Agent",
            endeavours: ENDEAVOUR_CHOICES.map(entry => ({
                ...entry,
                selected: entry.id === this._selectedEndeavour
            })),
            summary: ENDEAVOUR_SUMMARY[this._selectedEndeavour] ?? "",
            showSkillPicker: needsSkillPicker,
            showTrainingStat: this._selectedEndeavour === "training-course",
            showApproachPicker: needsApproachPicker,
            showTargetPicker: needsTargetPicker,
            showDepartmentField: needsDepartment,
            showFactionField: needsFaction,
            showTravelToggle: needsTravelToggle,
            skills: skills.map(entry => ({ ...entry, selected: entry.name === this._selectedSkill })),
            trainingStatOptions: [
                { id: "training", label: "Training", selected: this._trainingStat === "training" },
                { id: "focus", label: "Focus", selected: this._trainingStat === "focus" }
            ],
            approaches: approaches.map(entry => ({ ...entry, selected: entry.id === this._selectedApproach })),
            targetActors: characterTargets.map(entry => ({ ...entry, selected: entry.id === this._selectedTargetActorId })),
            departmentName: this._departmentName,
            factionName: this._factionName,
            travelAbroad: this._travelAbroad
        };
    }

    async _onRender(context, options) {
        if (super._onRender) await super._onRender(context, options);
        this._activateActions();
    }

    activateListeners(html) {
        super.activateListeners?.(html);
        this._activateActions(html?.[0] ?? html);
    }

    _activateActions(rootElement = null) {
        const root = rootElement ?? _resolveApplicationRoot(this);
        if (!root) return;
        this._actionsAbortController?.abort();
        this._actionsAbortController = new AbortController();
        const listenerOptions = { signal: this._actionsAbortController.signal };

        root.querySelector('[name="endeavourId"]')?.addEventListener("change", async (ev) => {
            this._selectedEndeavour = String(ev.currentTarget?.value ?? "").trim();
            this._selectedApproach = "";
            await _rerenderApp(this);
        }, listenerOptions);

        root.querySelector('[name="skillName"]')?.addEventListener("change", (ev) => {
            this._selectedSkill = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="trainingStat"]')?.addEventListener("change", (ev) => {
            const next = String(ev.currentTarget?.value ?? "training").trim().toLowerCase();
            this._trainingStat = next === "focus" ? "focus" : "training";
        }, listenerOptions);

        root.querySelector('[name="approachId"]')?.addEventListener("change", (ev) => {
            this._selectedApproach = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="targetActorId"]')?.addEventListener("change", (ev) => {
            this._selectedTargetActorId = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="departmentName"]')?.addEventListener("input", (ev) => {
            this._departmentName = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="factionName"]')?.addEventListener("input", (ev) => {
            this._factionName = String(ev.currentTarget?.value ?? "").trim();
        }, listenerOptions);

        root.querySelector('[name="travelAbroad"]')?.addEventListener("change", (ev) => {
            this._travelAbroad = Boolean(ev.currentTarget?.checked);
        }, listenerOptions);

        root.querySelectorAll('[data-action="submit-endeavour"]').forEach(button => {
            button.addEventListener("click", async (ev) => {
                ev.preventDefault();
                await this._resolveSelectedEndeavour();
            }, listenerOptions);
        });
    }

    async close(options = {}) {
        this._actionsAbortController?.abort();
        this._actionsAbortController = null;
        return super.close(options);
    }

    async _resolveSelectedEndeavour() {
        if (!this.actor) return;
        if (!(game.user?.isGM || this.actor.isOwner)) {
            ui.notifications.warn("Only the GM or actor owner can resolve downtime activities.");
            return;
        }

        switch (this._selectedEndeavour) {
            case "asset-cultivation":
                await this._resolveAssetCultivation();
                return;
            case "business-as-usual":
                await this._resolveBusinessAsUsual();
                return;
            case "compassionate-leave":
                await this._resolveCompassionateLeave();
                return;
            case "cover-up":
                await this._resolveCoverUp();
                return;
            case "dating-scene":
                await this._resolveDatingScene();
                return;
            case "deep-research":
                await this._resolveDeepResearch();
                return;
            case "false-identity":
                await this._resolveFalseIdentity();
                return;
            case "family-vacation":
                await this._resolveFamilyVacation();
                return;
            case "filing-paperwork":
                await this._resolveFilingPaperwork();
                return;
            case "hidden-agenda":
                await this._resolveHiddenAgenda();
                return;
            case "hobbies-and-interests":
                await this._resolveHobbiesAndInterests();
                return;
            case "infirmary-shift":
                await this._resolveInfirmaryShift();
                return;
            case "long-term-planning":
                await this._resolveLongTermPlanning();
                return;
            case "moonlighting":
                await this._resolveMoonlighting();
                return;
            case "office-politics":
                await this._resolveOfficePolitics();
                return;
            case "overseas-conference":
                await this._resolveOverseasConference();
                return;
            case "overtime":
                await this._resolveOvertime();
                return;
            case "performance-review":
                await this._resolvePerformanceReview();
                return;
            case "repair-equipment":
                await this._resolveRepairEquipment();
                return;
            case "research-and-development":
                await this._resolveResearchAndDevelopment();
                return;
            case "role-transfer":
                await this._resolveRoleTransfer();
                return;
            case "sick-leave":
                await this._resolveSickLeave();
                return;
            case "teambuilding":
                await this._resolveTeambuilding();
                return;
            case "training-course":
                await this._resolveTrainingCourse();
                return;
            case "writing-memoirs":
                await this._resolveWritingMemoirs();
                return;
            default:
                ui.notifications.warn("Unsupported Endeavour selection.");
                return;
        }
    }

    async _resolveAssetCultivation() {
        const approach = _getSelectedApproach("asset-cultivation", this._selectedApproach);
        if (!approach) {
            ui.notifications.warn("Select an Asset Cultivation approach.");
            return;
        }
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: approach.attribute,
            skillName: approach.skill,
            dn: 4,
            complexity: 3
        });
        await _patchFlags(this.actor, {
            asset_cultivation: {
                last_at: Date.now(),
                approach: approach.id,
                successes: result.successes,
                success: result.passed
            },
            last_downtime_action: "asset-cultivation"
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "ASSET CULTIVATION REPORT",
            subtitle: "Field contact recruitment attempt",
            lines: [
                `Test: ${approach.label} DN 4:3`,
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Asset recruited and briefed." : "Outcome: Recruitment stalled; no stable asset secured."
            ],
            roll: result.roll
        });
    }

    async _resolveBusinessAsUsual() {
        await _patchFlags(this.actor, {
            business_as_usual_done: true,
            business_as_usual_penalty: false,
            last_downtime_action: "business-as-usual",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "BUSINESS AS USUAL CERTIFICATION",
            subtitle: "Departmental baseline duties filed",
            lines: [
                "Core departmental responsibilities have been maintained.",
                "Next mission: BAU penalty is cleared."
            ]
        });
    }

    async _resolveCompassionateLeave() {
        await _patchFlags(this.actor, {
            compassionate_leave: true,
            last_downtime_action: "compassionate-leave",
            last_downtime_at: Date.now()
        });

        const partyApplied = await _checkAndApplyPartyWideEndeavour({
            flagKey: "compassionate_leave",
            handler: async () => {
                const currentMax = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0));
                await game.settings.set("laundry-rpg", "teamLuckMax", currentMax + 1);
                return "All surviving operatives chose Compassionate Leave: Team Luck maximum increased by 1.";
            }
        });

        await _postEndeavourCard({
            actor: this.actor,
            title: "COMPASSIONATE LEAVE NOTICE",
            subtitle: "Bereavement paperwork accepted",
            lines: [
                "Operative granted leave for mission-related loss.",
                partyApplied ?? "Awaiting full team participation for Luck maximum increase."
            ]
        });
    }

    async _resolveCoverUp() {
        await _patchFlags(this.actor, {
            cover_up: true,
            last_downtime_action: "cover-up",
            last_downtime_at: Date.now()
        });

        const partyApplied = await _checkAndApplyPartyWideEndeavour({
            flagKey: "cover_up",
            handler: async () => {
                const currentThreat = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "threatLevel")) || 0));
                const nextThreat = Math.max(0, currentThreat - 1);
                await game.settings.set("laundry-rpg", "threatLevel", nextThreat);
                return `All operatives selected Cover Up: Threat reduced ${currentThreat} -> ${nextThreat}.`;
            }
        });

        await _postEndeavourCard({
            actor: this.actor,
            title: "COVER UP OPERATIONS LOG",
            subtitle: "Sanitisation and witness control",
            lines: [
                "Mission traces were suppressed through coordinated cleanup.",
                partyApplied ?? "Awaiting full team participation to reduce Threat by 1."
            ]
        });
    }

    async _resolveDatingScene() {
        await _patchFlags(this.actor, {
            dating_scene_protection: true,
            dating_scene_i_know_a_guy: true,
            last_downtime_action: "dating-scene",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "DATING SCENE MEMORANDUM",
            subtitle: "Morale and social resilience",
            lines: [
                "Emotional resilience package prepared for next mission.",
                "Flagged benefits: Charmed resistance rerolls and I Know a Guy-style support."
            ]
        });
    }

    async _resolveDeepResearch() {
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: "mind",
            skillName: "Academics",
            dn: 4,
            complexity: 3
        });
        await _patchFlags(this.actor, {
            deep_research_bonus: result.passed,
            last_downtime_action: "deep-research",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "DEEP RESEARCH ARCHIVE REQUEST",
            subtitle: "Restricted stacks review",
            lines: [
                "Test: Mind (Academics) DN 4:3",
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Historical lead recovered; Forgotten Knowledge benefit flagged." : "Outcome: No reliable lead secured."
            ],
            roll: result.roll
        });
    }

    async _resolveFalseIdentity() {
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: "mind",
            skillName: "Fast Talk",
            dn: 4,
            complexity: 3
        });
        await _patchFlags(this.actor, {
            false_identity_established: result.passed,
            false_identity_suspected: !result.passed,
            last_downtime_action: "false-identity",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "FALSE IDENTITY ADMINISTRATION",
            subtitle: "Cover documents and legend maintenance",
            lines: [
                "Test: Mind (Fast Talk) DN 4:3",
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Cover identity established without active suspicion." : "Outcome: Suspicion raised around cover identity."
            ],
            roll: result.roll
        });
    }

    async _resolveFamilyVacation() {
        const patch = {
            vacation_adrenaline: true,
            last_downtime_action: "family-vacation",
            last_downtime_at: Date.now()
        };
        const lines = [
            "Family Vacation approved.",
            "At next mission start: +1 Adrenaline above normal maximum (one-time)."
        ];
        let roll = null;
        if (this._travelAbroad) {
            const abroadResult = await _rollSkillTest({
                actor: this.actor,
                attribute: "spirit",
                skillName: "Resolve",
                dn: 6,
                complexity: 1
            });
            roll = abroadResult.roll;
            patch.vacation_foreign_advantage = abroadResult.passed;
            lines.push(`Abroad check Spirit (Resolve) DN 6:1 -> ${abroadResult.successes} success(es).`);
            lines.push(abroadResult.passed
                ? "Foreign-services rapport flagged (Advantage marker set)."
                : "No foreign-services rapport benefit flagged.");
        }
        await _patchFlags(this.actor, patch);
        await _postEndeavourCard({
            actor: this.actor,
            title: "FAMILY VACATION LEAVE APPROVAL",
            subtitle: "Recovery and external travel memo",
            lines,
            roll
        });
    }

    async _resolveFilingPaperwork() {
        await _patchFlags(this.actor, {
            paperwork_bonus: true,
            last_downtime_action: "filing-paperwork",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "FILING PAPERWORK COMPLETION",
            subtitle: "Backlog remediation certificate",
            lines: [
                "Flag set: flags.laundry-rpg.endeavours.paperwork_bonus = true.",
                "Next Requisition Support test gains +1 automatic success and consumes the flag."
            ]
        });
    }

    async _resolveHiddenAgenda() {
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: "body",
            skillName: "Stealth",
            dn: 4,
            complexity: 3
        });
        await _patchFlags(this.actor, {
            hidden_agenda_suspected: !result.passed,
            hidden_agenda_clean: result.passed,
            last_downtime_action: "hidden-agenda",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "HIDDEN AGENDA TRANSMISSION",
            subtitle: "Compartmented reporting",
            lines: [
                "Test: Body (Stealth) DN 4:3",
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Contact remained covert." : "Outcome: Coworker suspicion flagged."
            ],
            roll: result.roll
        });
    }

    async _resolveHobbiesAndInterests() {
        const skillName = String(this._selectedSkill ?? "").trim();
        if (!skillName) {
            ui.notifications.warn("Select a skill for Hobbies and Interests.");
            return;
        }
        await _patchFlags(this.actor, {
            hobbies_reroll_skill: skillName,
            hobbies_reroll_available: true,
            last_downtime_action: "hobbies-and-interests",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "HOBBIES AND INTERESTS LOG",
            subtitle: "Work-life balance filing",
            lines: [
                `Designated skill for one free reroll next mission: ${skillName}.`
            ]
        });
    }

    async _resolveInfirmaryShift() {
        const approach = _getSelectedApproach("infirmary-shift", this._selectedApproach);
        if (!approach) {
            ui.notifications.warn("Select an Infirmary Shift approach.");
            return;
        }
        const targetActor = _resolveTargetActor(this._selectedTargetActorId, this.actor);
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: approach.attribute,
            skillName: approach.skill,
            dn: 5,
            complexity: 1
        });
        let healed = 0;
        if (targetActor && result.successes > 0) {
            healed = await _healInjurySpaces(targetActor, result.successes);
        }
        await _patchFlags(this.actor, {
            infirmary_shift_last: {
                at: Date.now(),
                approach: approach.id,
                targetActorId: targetActor?.id ?? "",
                successes: result.successes,
                healed
            },
            last_downtime_action: "infirmary-shift",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "INFIRMARY SHIFT REPORT",
            subtitle: "Medical support deployment",
            lines: [
                `Test: ${approach.label} DN 5:1`,
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                targetActor
                    ? `Target: ${targetActor.name}; Injury spaces cleared: ${healed}.`
                    : "No valid treatment target selected."
            ],
            roll: result.roll
        });
    }

    async _resolveLongTermPlanning() {
        await _patchFlags(this.actor, {
            long_term_planning_bonus: true,
            last_downtime_action: "long-term-planning",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "LONG-TERM PLANNING BRIEF",
            subtitle: "Contingency package approved",
            lines: [
                "Flag set: +1 to one rerolled die when using Luck/Backup Plan/Project Planning (GM adjudicated)."
            ]
        });
    }

    async _resolveMoonlighting() {
        await _patchFlags(this.actor, {
            moonlighting_exhaustion: true,
            last_downtime_action: "moonlighting",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "MOONLIGHTING DECLARATION",
            subtitle: "Secondary civilian income stream",
            lines: [
                "Flag set: flags.laundry-rpg.endeavours.moonlighting_exhaustion = true.",
                "Next mission start: Weakened is applied automatically."
            ]
        });
    }

    async _resolveOfficePolitics() {
        const faction = String(this._factionName ?? "").trim();
        await _patchFlags(this.actor, {
            office_politics_faction: faction || "Undeclared",
            last_downtime_action: "office-politics",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "OFFICE POLITICS ALIGNMENT",
            subtitle: "Faction commitment record",
            lines: [
                `Declared in-group: ${faction || "Undeclared"}.`,
                "Interaction modifiers with in-group/out-group remain GM-adjudicated."
            ]
        });
    }

    async _resolveOverseasConference() {
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: "mind",
            skillName: "Intuition",
            dn: 5,
            complexity: 2
        });
        await _patchFlags(this.actor, {
            overseas_conference_advantage: true,
            overseas_conference_extra_intel: result.passed,
            last_downtime_action: "overseas-conference",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "OVERSEAS CONFERENCE DEBRIEF",
            subtitle: "External liaison summary",
            lines: [
                "Test: Mind (Intuition) DN 5:2",
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Additional strategic intel flagged." : "Outcome: No extra intel flag set."
            ],
            roll: result.roll
        });
    }

    async _resolveOvertime() {
        const department = String(this._departmentName ?? "").trim() || "Unspecified Department";
        await _patchFlags(this.actor, {
            overtime_department: department,
            last_downtime_action: "overtime",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "OVERTIME SHIFT CONFIRMATION",
            subtitle: "Departmental goodwill accrual",
            lines: [
                `Selected department: ${department}.`,
                "Flagged for Advantage on interactions/support requests with this department next mission."
            ]
        });
    }

    async _resolvePerformanceReview() {
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: "mind",
            skillName: "Bureaucracy",
            dn: 4,
            complexity: 2
        });
        await _patchFlags(this.actor, {
            performance_xp: result.passed,
            last_downtime_action: "performance-review",
            last_downtime_at: Date.now()
        });
        const gmWhisper = _getActiveGmIds();
        await _postEndeavourCard({
            actor: this.actor,
            title: "PERFORMANCE REVIEW DOSSIER",
            subtitle: "Supervisor evaluation test",
            lines: [
                "Test: Mind (Bureaucracy) DN 4:2",
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed
                    ? "GM note: +1 extra XP if this operative meets their KPI next mission."
                    : "No KPI XP rider generated."
            ],
            roll: result.roll,
            whisper: gmWhisper
        });
    }

    async _resolveRepairEquipment() {
        const approach = _getSelectedApproach("repair-equipment", this._selectedApproach);
        if (!approach) {
            ui.notifications.warn("Select a Repair Equipment approach.");
            return;
        }
        const result = await _rollSkillTest({
            actor: this.actor,
            attribute: approach.attribute,
            skillName: approach.skill,
            dn: 5,
            complexity: 1
        });
        await _patchFlags(this.actor, {
            repair_equipment_success: result.passed,
            repair_equipment_last_approach: approach.id,
            last_downtime_action: "repair-equipment",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "REPAIR EQUIPMENT WORK ORDER",
            subtitle: "Diagnostics and maintenance",
            lines: [
                `Test: ${approach.label} DN 5:1`,
                `Dice: ${result.dice.join(", ") || "-"}`,
                `Successes: ${result.successes}`,
                result.passed ? "Outcome: Repair objective achieved." : "Outcome: Repair attempt incomplete."
            ],
            roll: result.roll
        });
    }

    async _resolveResearchAndDevelopment() {
        await _patchFlags(this.actor, {
            research_and_development: true,
            last_downtime_action: "research-and-development",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "RESEARCH & DEVELOPMENT CHANGE REQUEST",
            subtitle: "Prototype and tuning workflow",
            lines: [
                "R&D progression marker set for custom weapon/spell/vehicle projects."
            ]
        });
    }

    async _resolveRoleTransfer() {
        await _patchFlags(this.actor, {
            role_transfer_requested: true,
            last_downtime_action: "role-transfer",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "ROLE TRANSFER REQUEST",
            subtitle: "Assignment reassignment filing",
            lines: [
                "Assignment transfer request logged for GM approval and processing."
            ]
        });
    }

    async _resolveSickLeave() {
        const before = Math.max(0, Math.trunc(Number(this.actor.system?.derived?.injuries?.value) || 0));
        const healed = await _healInjurySpaces(this.actor, 1);
        const after = Math.max(0, Math.trunc(Number(this.actor.system?.derived?.injuries?.value) || 0));
        await _patchFlags(this.actor, {
            last_downtime_action: "sick-leave",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "SICK LEAVE MEDICAL CLEARANCE",
            subtitle: "Injury recovery summary",
            lines: [
                `Injury Track: ${before} -> ${after}`,
                `Injury spaces cleared: ${healed}`,
                `Agent ${this.actor.name} has been cleared by medical.`
            ]
        });
    }

    async _resolveTeambuilding() {
        const currentLuck = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuck")) || 0));
        const maxLuck = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0));
        const nextLuck = Math.min(maxLuck, currentLuck + 1);
        await game.settings.set("laundry-rpg", "teamLuck", nextLuck);

        await _patchFlags(this.actor, {
            last_downtime_action: "teambuilding",
            last_downtime_at: Date.now()
        });

        const gmWhisper = _getActiveGmIds();
        await _postEndeavourCard({
            actor: this.actor,
            title: "TEAMBUILDING ACTIVITY LOG",
            subtitle: "Morale intervention",
            lines: [
                `Agent ${this.actor.name} took the team to the pub. Restore 1 point of Party Luck!`,
                `Team Luck: ${currentLuck} -> ${nextLuck} (max ${maxLuck})`
            ],
            whisper: gmWhisper
        });
    }

    async _resolveTrainingCourse() {
        const skillName = String(this._selectedSkill ?? "").trim();
        if (!skillName) {
            ui.notifications.warn("Select a skill for Training Course.");
            return;
        }
        const stat = this._trainingStat === "focus" ? "focus" : "training";
        const xpBefore = Math.max(0, Math.trunc(Number(this.actor.system?.details?.xp?.unspent) || 0));
        if (xpBefore < 5) {
            ui.notifications.warn("Training Course requires at least 5 unspent XP.");
            return;
        }

        const skill = await _getOrCreateSkill(this.actor, skillName);
        if (!skill) {
            ui.notifications.warn("Unable to resolve selected skill.");
            return;
        }
        const current = Math.max(0, Math.trunc(Number(skill.system?.[stat]) || 0));
        const next = current + 1;
        await skill.update({ [`system.${stat}`]: next });
        await this.actor.update({ "system.details.xp.unspent": xpBefore - 5 });

        await _patchFlags(this.actor, {
            training_refund_pending: true,
            training_refund_amount: 1,
            training_refund_skill: skillName,
            training_refund_stat: stat,
            last_downtime_action: "training-course",
            last_downtime_at: Date.now()
        });

        await _postEndeavourCard({
            actor: this.actor,
            title: "TRAINING COURSE COMPLETION FORM",
            subtitle: "Coursework and advancement",
            lines: [
                `${skillName}: ${stat === "focus" ? "Focus" : "Training"} ${current} -> ${next}`,
                `XP debited: 5 (unspent ${xpBefore} -> ${xpBefore - 5})`,
                "Pending refund flag set: +1 XP upon successful course completion."
            ]
        });
    }

    async _resolveWritingMemoirs() {
        await _patchFlags(this.actor, {
            writing_memoirs_last_stand: true,
            last_downtime_action: "writing-memoirs",
            last_downtime_at: Date.now()
        });
        await _postEndeavourCard({
            actor: this.actor,
            title: "WRITING MEMOIRS ARCHIVE ENTRY",
            subtitle: "Legacy knowledge transfer",
            lines: [
                "Last Stand maximised-successes marker set for future missions."
            ]
        });
    }
}

export async function openEndeavoursApp(actor) {
    if (!actor) return null;
    const existing = Object.values(ui.windows ?? {}).find(app =>
        app instanceof EndeavoursApp && app.rendered && app.actor?.id === actor.id
    );
    if (existing) {
        existing.bringToTop?.();
        return existing;
    }
    const app = new EndeavoursApp(actor);
    await app.render(true);
    return app;
}

export async function applyMissionStartEndeavourEffects() {
    if (!game.user?.isGM) return;
    const characters = game.actors.filter(actor => actor.type === "character");

    for (const actor of characters) {
        const flags = actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {};
        const notes = [];
        const updates = {};

        if (flags.vacation_adrenaline) {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.max) || 0));
            const boosted = Math.max(0, Math.min(max + 1, current + 1));
            if (boosted !== current) updates["system.derived.adrenaline.value"] = boosted;
            flags.vacation_adrenaline = false;
            notes.push(`Vacation bonus applied: Adrenaline ${current} -> ${boosted}.`);
        }

        if (flags.moonlighting_exhaustion) {
            await game.laundry?.applyCondition?.(actor, "weakened", {
                durationRounds: 0,
                source: "endeavour-moonlighting",
                suppressChat: true
            });
            flags.moonlighting_exhaustion = false;
            notes.push("Moonlighting exhaustion applied: Weakened.");
        }

        const bauDone = Boolean(flags.business_as_usual_done);
        flags.business_as_usual_penalty = !bauDone;
        flags.business_as_usual_done = false;

        if (Object.keys(updates).length) await actor.update(updates);
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, flags);

        if (notes.length || flags.business_as_usual_penalty) {
            const allNotes = [...notes];
            if (flags.business_as_usual_penalty) {
                allNotes.push("Business As Usual not completed: departmental penalty flag is active.");
            }
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<p><strong>${foundry.utils.escapeHTML(actor.name ?? "Agent")}</strong>: ${foundry.utils.escapeHTML(allNotes.join(" "))}</p>`
            });
        }
    }
}

async function _patchFlags(actor, patch = {}) {
    const current = actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {};
    await actor.setFlag(FLAG_SCOPE, FLAG_KEY, {
        ...current,
        ...patch
    });
}

function _collectActorSkills(actor) {
    return Array.from(actor?.items ?? [])
        .filter(item => item.type === "skill")
        .map(item => ({ id: item.id, name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function _getSkillTraining(actor, skillName) {
    const item = actor?.items?.find(entry =>
        entry.type === "skill" && String(entry.name ?? "").toLowerCase() === String(skillName ?? "").toLowerCase()
    );
    return Math.max(0, Math.trunc(Number(item?.system?.training) || 0));
}

async function _rollSkillTest({ actor, attribute, skillName, dn, complexity }) {
    const attr = String(attribute ?? "mind").toLowerCase();
    const attrValue = Math.max(1, Math.trunc(Number(actor?.system?.attributes?.[attr]?.value) || 1));
    const training = _getSkillTraining(actor, skillName);
    const pool = Math.max(1, attrValue + training);

    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();
    const dice = _extractRollDice(roll);
    const successes = dice.filter(value => value >= dn).length;
    return {
        roll,
        pool,
        dice,
        successes,
        passed: successes >= complexity
    };
}

async function _getOrCreateSkill(actor, skillName) {
    const existing = actor.items.find(item =>
        item.type === "skill" && String(item.name ?? "").toLowerCase() === String(skillName ?? "").toLowerCase()
    );
    if (existing) return existing;

    const skillDef = (CONFIG.LAUNDRY?.skills ?? []).find(entry =>
        String(entry?.name ?? "").toLowerCase() === String(skillName ?? "").toLowerCase()
    );
    const attribute = String(skillDef?.attribute ?? "mind").toLowerCase();
    const created = await actor.createEmbeddedDocuments("Item", [{
        name: skillName,
        type: "skill",
        img: "systems/laundry-rpg/icons/generated/_defaults/skill.svg",
        system: {
            attribute,
            training: 0,
            focus: 0,
            description: "Created by Endeavours automation."
        }
    }]);
    return created?.[0] ?? null;
}

function _extractRollDice(roll) {
    const values = [];
    for (const term of roll?.terms ?? []) {
        if (!Array.isArray(term?.results)) continue;
        for (const result of term.results) {
            const value = Math.max(0, Math.trunc(Number(result?.result) || 0));
            if (value) values.push(value);
        }
    }
    return values;
}

async function _healInjurySpaces(actor, spaces = 1) {
    const amount = Math.max(0, Math.trunc(Number(spaces) || 0));
    if (!actor || amount <= 0) return 0;
    const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.injuries?.value) || 0));
    const next = Math.max(0, current - amount);
    if (next !== current) {
        await actor.update({ "system.derived.injuries.value": next });
    }

    const toRemove = Math.max(0, current - next);
    for (let index = 0; index < toRemove; index += 1) {
        await _removeOneInjuryEffect(actor);
    }
    return toRemove;
}

async function _removeOneInjuryEffect(actor) {
    const legacyInjuryPattern = /\b(injury|wound|phobia|shocked|confused|dread|reality denial|traumatised|hallucinations|broken mind|broken arm|broken leg|brain injury|internal injury|head wound|leg wound|arm wound)\b/i;
    const effects = Array.from(actor?.effects ?? [])
        .filter(effect => {
            const outcomeFlag = effect.getFlag?.("laundry-rpg", "outcomeEffect") ?? {};
            if (String(outcomeFlag?.type ?? "").toLowerCase() === "injury") return true;
            const effectName = String(effect.name ?? "");
            const outcomeText = String(outcomeFlag?.outcomeText ?? "");
            const combined = `${effectName} ${outcomeText}`.trim();
            if (legacyInjuryPattern.test(combined)) return true;

            return Array.isArray(effect?.changes)
                && effect.changes.some(change =>
                    String(change?.key ?? "")
                        .trim()
                        .toLowerCase()
                        .startsWith("flags.laundry-rpg.modifiers.difficulty.")
                );
        })
        .sort((a, b) => {
            const atA = Number(a.getFlag?.("laundry-rpg", "outcomeEffect")?.appliedAt ?? 0) || 0;
            const atB = Number(b.getFlag?.("laundry-rpg", "outcomeEffect")?.appliedAt ?? 0) || 0;
            return atA - atB;
        });

    const first = effects[0];
    if (!first) return null;
    await actor.deleteEmbeddedDocuments("ActiveEffect", [first.id]);
    return first;
}

function _getSelectedApproach(endeavourId, approachId) {
    const options = APPROACH_OPTIONS[endeavourId] ?? [];
    return options.find(option => option.id === approachId) ?? options[0] ?? null;
}

function _resolveTargetActor(targetActorId, fallbackActor) {
    const id = String(targetActorId ?? "").trim();
    if (!id) return fallbackActor ?? null;
    return game.actors?.get(id) ?? fallbackActor ?? null;
}

function _getActiveGmIds() {
    return game.users
        .filter(user => user.isGM && user.active)
        .map(user => user.id);
}

async function _postEndeavourCard({
    actor,
    title = "",
    subtitle = "",
    lines = [],
    roll = null,
    whisper = []
} = {}) {
    const safeTitle = foundry.utils.escapeHTML(String(title ?? "").trim() || "DOWNTIME MEMO");
    const safeSubtitle = foundry.utils.escapeHTML(String(subtitle ?? "").trim());
    const rawLines = (Array.isArray(lines) ? lines : [])
        .map(line => String(line ?? "").trim())
        .filter(Boolean);
    const whisperIds = Array.isArray(whisper) ? whisper.filter(Boolean) : [];
    const rawRows = rawLines
        .map(line => {
            const splitIndex = line.indexOf(":");
            if (splitIndex <= 0) {
                return {
                    label: "Detail",
                    value: line
                };
            }
            return {
                label: line.slice(0, splitIndex).trim() || "Detail",
                value: line.slice(splitIndex + 1).trim()
            };
        })
        .filter(row => row.value);

    let diceValues = [];
    const diceRowIndex = rawRows.findIndex(row => String(row?.label ?? "").trim().toLowerCase() === "dice");
    if (diceRowIndex >= 0) {
        const parsedDice = _parseDiceValues(rawRows[diceRowIndex]?.value ?? "");
        if (parsedDice.length) {
            diceValues = parsedDice;
            rawRows.splice(diceRowIndex, 1);
        }
    }

    const testRow = rawRows.find(row => String(row?.label ?? "").trim().toLowerCase() === "test");
    const testTarget = _parseDnComplexity(testRow?.value ?? "");
    const dn = testTarget?.dn ?? 4;
    const complexity = testTarget?.complexity ?? 1;
    const successesRow = rawRows.find(row => String(row?.label ?? "").trim().toLowerCase() === "successes");
    const declaredSuccesses = _parseFirstInt(successesRow?.value ?? "");
    const rolledSuccesses = diceValues.filter(value => value >= dn).length;
    const effectiveSuccesses = Number.isFinite(declaredSuccesses) ? declaredSuccesses : rolledSuccesses;
    const diceSection = _renderEndeavourRollSection({
        dice: diceValues,
        dn,
        complexity,
        successes: effectiveSuccesses
    });

    const cardRows = rawRows
        .map(row => ({
            label: foundry.utils.escapeHTML(String(row?.label ?? "").trim() || "Detail"),
            value: foundry.utils.escapeHTML(String(row?.value ?? "").trim())
        }))
        .filter(row => row.value);
    const content = `
        <div class="laundry-chat-card laundry-bureau-card laundry-endeavour-card">
            <div class="laundry-chat-header">
                <div class="laundry-chat-title">
                    <strong>${safeTitle}</strong>
                    ${safeSubtitle ? `<span class="laundry-chat-subtitle">${safeSubtitle}</span>` : ""}
                </div>
                <span class="laundry-chat-stamp">END</span>
            </div>
            ${diceSection}
            <div class="laundry-chat-rows">
                ${cardRows.map(row => `
                    <div class="laundry-chat-row">
                        <span class="laundry-chat-label">${row.label}</span>
                        <span class="laundry-chat-value">${row.value}</span>
                    </div>`).join("")}
            </div>
        </div>`;

    const payload = {
        speaker: ChatMessage.getSpeaker({ actor }),
        content
    };
    if (whisperIds.length) payload.whisper = whisperIds;
    if (roll) payload.rolls = [roll];
    if (roll) payload.sound = CONFIG.sounds?.dice;
    await ChatMessage.create(payload);
}

function _renderEndeavourRollSection({
    dice = [],
    dn = 4,
    complexity = 1,
    successes = 0
} = {}) {
    const rawDice = Array.isArray(dice) ? dice : [];
    if (!rawDice.length) return "";

    const safeDn = Math.max(2, Math.trunc(Number(dn) || 4));
    const safeComplexity = Math.max(1, Math.trunc(Number(complexity) || 1));
    const safeSuccesses = Math.max(0, Math.trunc(Number(successes) || 0));
    const passed = safeSuccesses >= safeComplexity;
    const criticals = rawDice.filter(value => Math.trunc(Number(value) || 0) === 6).length;
    const complications = rawDice.filter(value => Math.trunc(Number(value) || 0) === 1).length;
    const safeCriticalLabel = _escapeHtml(game.i18n?.localize?.("LAUNDRY.Criticals") ?? "Criticals");
    const safeComplicationLabel = _escapeHtml(game.i18n?.localize?.("LAUNDRY.Complications") ?? "Complications");
    const safeNaturalSix = _escapeHtml(game.i18n?.localize?.("LAUNDRY.NaturalSix") ?? "Natural Six");
    const safeNaturalOne = _escapeHtml(game.i18n?.localize?.("LAUNDRY.NaturalOne") ?? "Natural One");

    const diceHtml = rawDice.map((value, index) => {
        const dieValue = Math.max(1, Math.min(6, Math.trunc(Number(value) || 0)));
        const isCritical = dieValue === 6;
        const isComplication = dieValue === 1;
        const classes = [
            "roll",
            "die",
            "d6",
            "laundry-die",
            dieValue >= safeDn ? "success" : "failure",
            isCritical ? "die-critical" : "",
            isComplication ? "die-complication" : ""
        ].filter(Boolean).join(" ");
        const marker = isCritical
            ? `<span class="die-marker marker-critical" title="${safeNaturalSix}">*</span>`
            : (isComplication
                ? `<span class="die-marker marker-complication" title="${safeNaturalOne}">!</span>`
                : "");
        return `<li class="${classes}" data-die-index="${index}">${dieValue}${marker}</li>`;
    }).join("");

    const outcomeLabel = passed ? "Downtime Check Passed" : "Downtime Check Failed";
    const outcomeClass = passed ? "outcome-success" : "outcome-failure";
    return `
        <div class="laundry-dice-roll laundry-endeavour-roll">
            <ol class="dice-rolls">${diceHtml}</ol>
            <div class="dice-roll-summary">
                <span class="crit-summary">${safeCriticalLabel}: ${criticals}</span>
                <span class="comp-summary">${safeComplicationLabel}: ${complications}</span>
            </div>
            <div class="dice-outcome ${outcomeClass}">
                <strong>${outcomeLabel}</strong>
                <span class="success-count">(Successes: ${safeSuccesses}/${safeComplexity})</span>
            </div>
        </div>`;
}

function _parseDiceValues(value = "") {
    const tokens = String(value ?? "")
        .split(/[,\s]+/)
        .map(token => token.trim())
        .filter(Boolean);
    const parsed = tokens
        .map(token => Math.trunc(Number(token)))
        .filter(number => Number.isFinite(number) && number >= 1 && number <= 6);
    return parsed;
}

function _parseDnComplexity(value = "") {
    const match = /dn\s*(\d+)\s*:\s*(\d+)/i.exec(String(value ?? ""));
    if (!match) return null;
    return {
        dn: Math.max(2, Math.trunc(Number(match[1]) || 4)),
        complexity: Math.max(1, Math.trunc(Number(match[2]) || 1))
    };
}

function _parseFirstInt(value = "") {
    const match = /(-?\d+)/.exec(String(value ?? ""));
    if (!match) return Number.NaN;
    const parsed = Math.trunc(Number(match[1]));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function _escapeHtml(value) {
    const escape = foundry.utils?.escapeHTML;
    return typeof escape === "function"
        ? escape(String(value ?? ""))
        : String(value ?? "");
}

async function _checkAndApplyPartyWideEndeavour({ flagKey = "", handler } = {}) {
    const key = String(flagKey ?? "").trim();
    if (!key || typeof handler !== "function") return null;

    const characters = game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner);
    if (!characters.length) return null;
    const everyoneSet = characters.every(actor => Boolean(actor.getFlag(FLAG_SCOPE, FLAG_KEY)?.[key]));
    if (!everyoneSet) return null;

    const message = await handler();
    for (const actor of characters) {
        const flags = actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? {};
        flags[key] = false;
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, flags);
    }
    return String(message ?? "").trim();
}

function _resolveApplicationRoot(app) {
    const element = app?.element ?? null;
    if (!element) return null;
    if (element instanceof HTMLElement) return element;
    if (Array.isArray(element) || typeof element.length === "number") return element[0] ?? null;
    return null;
}

async function _rerenderApp(app) {
    if (!app?.render) return;
    try {
        await app.render({ force: true });
    } catch (_err) {
        await app.render(true);
    }
}
