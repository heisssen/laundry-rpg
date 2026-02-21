import { LaundryActor } from "./actor/actor.js";
import { LaundryActorSheet, LaundryNpcSheet } from "./actor/actor-sheet.js";
import { LaundryCharacterBuilder } from "./actor/character-builder.js";
import { LaundryAutomationSettings } from "./apps/automation-settings.js";
import { LaundryGMTracker } from "./apps/gm-tracker.js";
import { openMissionGenerator } from "./apps/mission-generator.js";
import { openSupportRequestApp } from "./apps/support-request.js";
import { openEndeavoursApp, applyMissionStartEndeavourEffects } from "./apps/endeavours.js";
import { bindTokenHudControls } from "./apps/token-hud.js";
import { LaundryItem } from "./item/item.js";
import { LaundryItemSheet } from "./item/item-sheet.js";
import { bindDiceChatControls, rollDice } from "./dice.js";
import { migrateWorld } from "./migration.js";
import { applyThreatBuffsToCurrentScene, applyThreatRoundRegeneration } from "./utils/threat-integration.js";

/**
 * Global system configuration — consumed by templates via `config.*`
 */
const LAUNDRY = {
    attributes: {
        body:   { label: "Body" },
        mind:   { label: "Mind" },
        spirit: { label: "Spirit" }
    },
    skills: [
        { name: "Academics", attribute: "mind" },
        { name: "Athletics", attribute: "body" },
        { name: "Awareness", attribute: "mind" },
        { name: "Bureaucracy", attribute: "mind" },
        { name: "Close Combat", attribute: "body" },
        { name: "Computers", attribute: "mind" },
        { name: "Dexterity", attribute: "body" },
        { name: "Engineering", attribute: "mind" },
        { name: "Fast Talk", attribute: "spirit" },
        { name: "Fortitude", attribute: "body" },
        { name: "Intuition", attribute: "mind" },
        { name: "Magic", attribute: "mind" },
        { name: "Medicine", attribute: "mind" },
        { name: "Might", attribute: "body" },
        { name: "Occult", attribute: "mind" },
        { name: "Presence", attribute: "spirit" },
        { name: "Ranged", attribute: "body" },
        { name: "Reflexes", attribute: "body" },
        { name: "Resolve", attribute: "spirit" },
        { name: "Science", attribute: "mind" },
        { name: "Stealth", attribute: "body" },
        { name: "Survival", attribute: "mind" },
        { name: "Technology", attribute: "mind" },
        { name: "Zeal", attribute: "spirit" }
    ],
    clearances: [
        "UNCLASSIFIED",
        "CONFIDENTIAL",
        "SECRET",
        "TOP_SECRET",
        "COSMIC"
    ],
    threatLevels: {
        minor:    "Minor",
        moderate: "Moderate",
        major:    "Major",
        extreme:  "Extreme",
        cosmic:   "Cosmic"
    },
    ladder: [
        { min: 12, label: "Unprecedented" },
        { min: 10, label: "Extraordinary" },
        { min:  8, label: "Superb" },
        { min:  6, label: "Great" },
        { min:  4, label: "Good" },
        { min:  2, label: "Average" },
        { min:  1, label: "Poor" }
    ]
};

const LAUNDRY_CONDITIONS = {
    blinded: {
        id: "blinded",
        name: "Blinded",
        img: "icons/svg/blind.svg",
        defaultDurationRounds: 0,
        clearAtTurnStart: false
    },
    deafened: {
        id: "deafened",
        name: "Deafened",
        img: "icons/svg/deaf.svg",
        defaultDurationRounds: 0,
        clearAtTurnStart: false
    },
    prone: {
        id: "prone",
        name: "Prone",
        img: "icons/svg/falling.svg",
        defaultDurationRounds: 0,
        clearAtTurnStart: false
    },
    stunned: {
        id: "stunned",
        name: "Stunned",
        img: "icons/svg/daze.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: true
    },
    weakened: {
        id: "weakened",
        name: "Weakened",
        img: "icons/svg/downgrade.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: false
    },
    bleeding: {
        id: "bleeding",
        name: "Bleeding",
        img: "icons/svg/blood.svg",
        defaultDurationRounds: 0,
        clearAtTurnStart: false
    },
    frightened: {
        id: "frightened",
        name: "Frightened",
        img: "icons/svg/terror.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: false
    },
    terrified: {
        id: "terrified",
        name: "Terrified",
        img: "icons/svg/terror.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: false
    },
    restrained: {
        id: "restrained",
        name: "Restrained",
        img: "icons/svg/net.svg",
        defaultDurationRounds: 0,
        clearAtTurnStart: false
    },
    incapacitated: {
        id: "incapacitated",
        name: "Incapacitated",
        img: "icons/svg/net.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: false
    },
    unconscious: {
        id: "unconscious",
        name: "Unconscious",
        img: "icons/svg/sleep.svg",
        defaultDurationRounds: 1,
        clearAtTurnStart: false
    }
};
const LAUNDRY_STATUS_EFFECTS = Object.values(LAUNDRY_CONDITIONS).map(entry => ({
    id: entry.id,
    name: entry.name,
    img: entry.img
}));
const LAUNDRY_STATUS_IDS = new Set(Object.keys(LAUNDRY_CONDITIONS));
const TURN_ECONOMY_FLAG = "turnEconomy";
const INJURY_TABLE_SETTING = "injuryTableUuid";
const MISHAP_TABLE_SETTING = "mishapTableUuid";
const TEAM_LUCK_AUTO_SYNC_SETTING = "teamLuckAutoSync";

Hooks.once("init", async function () {
    console.log("Laundry RPG | Initialising The Laundry RPG System");

    game.laundry = {
        LaundryActor,
        LaundryItem,
        LaundryCharacterBuilder,
        LaundryGMTracker,
        config: LAUNDRY,
        conditions: LAUNDRY_CONDITIONS,
        getCombatTurnEconomy: (actor) => getCombatTurnEconomy(actor),
        consumeCombatAction: (actor, options = {}) => consumeCombatAction(actor, options),
        consumeCombatMove: (actor, options = {}) => consumeCombatMove(actor, options),
        spendAdrenalineForExtraAction: (actor) => spendAdrenalineForExtraAction(actor),
        getActorStatuses: (actor) => _collectActorStatuses(actor),
        getConditionDefinition: (statusId) => _getConditionDefinition(statusId),
        applyCondition: (actor, statusId, options = {}) => applyCondition(actor, statusId, options),
        removeCondition: (actor, statusId, options = {}) => removeCondition(actor, statusId, options),
        getAutomationTable: (tableType) => getAutomationTable(tableType),
        setAutomationTable: (tableType, tableUuid) => setAutomationTable(tableType, tableUuid),
        resetAutomationTable: (tableType) => resetAutomationTable(tableType),
        ensureAutomationTables: () => ensureAutomationRollTables(),
        syncTeamLuckMax: (options = {}) => syncTeamLuckMaxWithPlayers(options),
        resetTeamLuck: ({ toMax = true } = {}) => resetTeamLuck({ toMax }),
        openMissionGenerator: () => openMissionGenerator(),
        openSupportRequest: (actor) => openSupportRequestApp(actor),
        openEndeavours: (actor) => openEndeavoursApp(actor),
        applyThreatBuffs: (options = {}) => applyThreatBuffsToCurrentScene(options),
        openGMTracker: () => {
            if (!game.user?.isGM) return null;
            const existing = Object.values(ui.windows).find(app =>
                app instanceof LaundryGMTracker && app.rendered
            );
            if (existing) {
                existing.bringToTop();
                return existing;
            }
            const tracker = new LaundryGMTracker();
            tracker.render(true);
            return tracker;
        }
    };
    CONFIG.LAUNDRY = LAUNDRY;
    CONFIG.statusEffects = LAUNDRY_STATUS_EFFECTS.map(effect => foundry.utils.deepClone(effect));

    CONFIG.Actor.documentClass = LaundryActor;
    CONFIG.Item.documentClass  = LaundryItem;
    CONFIG.Combat.initiative = foundry.utils.mergeObject(
        CONFIG.Combat.initiative ?? {},
        {
            // v12/v13 roll data resolves actor system fields at root by default.
            // Using @derived... avoids undefined -> 0 rolls.
            formula: "@derived.initiative.value",
            decimals: 0
        },
        { inplace: false, overwrite: true }
    );

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("laundry-rpg", LaundryActorSheet, {
        types: ["character"],
        makeDefault: true,
        label: "Laundry RPG Character Sheet"
    });
    Actors.registerSheet("laundry-rpg", LaundryNpcSheet, {
        types: ["npc"],
        makeDefault: true,
        label: "Laundry RPG NPC Sheet"
    });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("laundry-rpg", LaundryItemSheet, {
        makeDefault: true,
        label: "Laundry RPG Item Sheet"
    });

    // Custom Handlebars helpers
    Handlebars.registerHelper("laundryEq", (a, b) => a === b);
    Handlebars.registerHelper("laundryOr", (a, b) => a || b);
    Handlebars.registerHelper("laundryGear", (type) =>
        ["gear", "weapon", "armour"].includes(type)
    );

    registerSystemSettings();
    await preloadTemplates();

    console.log("Laundry RPG | System ready.");
});

Hooks.once("ready", async function () {
    await cacheTalentNameIndex();
    if (!game.user.isGM) return;
    try {
        await migrateWorld();
        await initializeTeamLuckDefaults();
        await ensureAutomationRollTables();
    } catch (err) {
        console.error("Laundry RPG | Migration failed", err);
    }
});

Hooks.on("createActor", async (actor) => {
    await _syncTeamLuckForActorLifecycle(actor);
});

Hooks.on("deleteActor", async (actor) => {
    await _syncTeamLuckForActorLifecycle(actor);
});

Hooks.on("updateActor", async (actor, changed) => {
    if (!game.user?.isGM) return;
    if (actor?.type !== "character") return;
    const ownershipChanged = Object.prototype.hasOwnProperty.call(changed ?? {}, "ownership");
    const typeChanged = Object.prototype.hasOwnProperty.call(changed ?? {}, "type");
    const playerOwnerChanged = Object.prototype.hasOwnProperty.call(changed ?? {}, "hasPlayerOwner");
    if (!ownershipChanged && !typeChanged && !playerOwnerChanged) return;
    await syncTeamLuckMaxWithPlayers();
});

Hooks.on("renderChatMessage", (message, html) => {
    bindDiceChatControls(message, html);
});

Hooks.on("renderTokenHUD", (app, html) => {
    bindTokenHudControls(app, html);
});

Hooks.on("renderDialog", (_app, html) => {
    html.addClass("laundry-dialog-content");
    html.closest(".window-app").addClass("laundry-dialog");
});

Hooks.on("renderApplication", (_app, html) => {
    html.closest(".window-app").addClass("laundry-dialog");
});

Hooks.on("renderCombatTracker", (_app, html) => {
    decorateCombatTracker(html);
});

Hooks.on("updateCombat", async (combat, changed) => {
    if (!_isTurnUpdate(changed)) return;
    await cleanupExpiredConditions(combat);
    await initializeTurnEconomyForActiveCombatant(combat);
    await applyThreatRoundRegeneration(combat);
    refreshCombatDrivenUIs();
});

Hooks.on("combatStart", async (combat) => {
    await cleanupExpiredConditions(combat);
    await initializeTurnEconomyForActiveCombatant(combat);
    await applyThreatRoundRegeneration(combat);
    await applyMissionStartEndeavourEffects();
    refreshCombatDrivenUIs();
});

Hooks.on("updateCombatant", (_combatant, changed) => {
    if (!foundry.utils.hasProperty(changed, `flags.laundry-rpg.${TURN_ECONOMY_FLAG}`)) return;
    refreshCombatDrivenUIs();
});

Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;
    const tokenControls = controls.find(c => c.name === "token");
    if (!tokenControls) return;
    if (tokenControls.tools.some(t => t.name === "laundry-gm-tracker")) return;
    tokenControls.tools.push({
        name: "laundry-gm-tracker",
        title: "LAUNDRY.ThreatTrackerTitle",
        icon: "fas fa-user-secret",
        button: true,
        onClick: () => game.laundry?.openGMTracker?.()
    });
});

Hooks.on("laundryRpgRequestBusinessAsUsual", async (payload) => {
    await LaundryGMTracker.handleBusinessAsUsualRequest(payload);
});

async function preloadTemplates() {
    return loadTemplates([
        "systems/laundry-rpg/templates/actor/actor-sheet.html",
        "systems/laundry-rpg/templates/actor/npc-sheet.html",
        "systems/laundry-rpg/templates/actor/character-builder.html",
        "systems/laundry-rpg/templates/item/item-sheet.html",
        "systems/laundry-rpg/templates/apps/attack-dialog.html",
        "systems/laundry-rpg/templates/apps/gm-tracker.html",
        "systems/laundry-rpg/templates/apps/automation-settings.html",
        "systems/laundry-rpg/templates/apps/mission-generator.html",
        "systems/laundry-rpg/templates/apps/support-request.html",
        "systems/laundry-rpg/templates/apps/endeavours.html"
    ]);
}

function registerSystemSettings() {
    game.settings.registerMenu("laundry-rpg", "automationTablesMenu", {
        name: "Automation Tables",
        hint: "Choose and manage linked Injury and Mishap RollTables.",
        label: "Configure",
        icon: "fas fa-table-list",
        type: LaundryAutomationSettings,
        restricted: true
    });

    game.settings.register("laundry-rpg", "teamLuck", {
        name: "Team Luck",
        hint: "Current team Luck pool used for Luck spending and Luck Tests.",
        scope: "world",
        config: true,
        type: Number,
        default: 0
    });

    game.settings.register("laundry-rpg", "teamLuckMax", {
        name: "Team Luck Maximum",
        hint: "Maximum team Luck pool (typically number of player characters).",
        scope: "world",
        config: true,
        type: Number,
        default: 0
    });

    game.settings.register("laundry-rpg", TEAM_LUCK_AUTO_SYNC_SETTING, {
        name: "Auto-sync Team Luck Max",
        hint: "Automatically keep Team Luck max aligned to current player-owned characters.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("laundry-rpg", "threatLevel", {
        name: "Threat Level",
        hint: "Global occult threat pressure used by the GM tracker.",
        scope: "world",
        config: true,
        type: Number,
        default: 0
    });

    game.settings.register("laundry-rpg", INJURY_TABLE_SETTING, {
        name: "Injury RollTable UUID",
        hint: "Stores linked Injury automation RollTable UUID.",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    game.settings.register("laundry-rpg", MISHAP_TABLE_SETTING, {
        name: "Mishap RollTable UUID",
        hint: "Stores linked Mishap automation RollTable UUID.",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });
}

async function initializeTeamLuckDefaults() {
    await syncTeamLuckMaxWithPlayers({ force: true });
}

function _countPlayerCharacters() {
    return Math.max(0, game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner).length);
}

async function syncTeamLuckMaxWithPlayers({ force = false } = {}) {
    if (!game.user?.isGM) return null;
    const autoSync = Boolean(game.settings.get("laundry-rpg", TEAM_LUCK_AUTO_SYNC_SETTING));
    if (!force && !autoSync) return null;

    const nextMax = _countPlayerCharacters();
    const currentMax = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0));
    const currentLuck = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuck")) || 0));
    const clampedLuck = Math.max(0, Math.min(nextMax, currentLuck));

    if (currentMax !== nextMax) {
        await game.settings.set("laundry-rpg", "teamLuckMax", nextMax);
    }
    if (clampedLuck !== currentLuck) {
        await game.settings.set("laundry-rpg", "teamLuck", clampedLuck);
    }

    return {
        max: nextMax,
        luck: clampedLuck,
        changedMax: currentMax !== nextMax,
        changedLuck: clampedLuck !== currentLuck
    };
}

async function resetTeamLuck({ toMax = true } = {}) {
    if (!game.user?.isGM) return null;
    const max = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0));
    const next = toMax ? max : 0;
    await game.settings.set("laundry-rpg", "teamLuck", next);
    return { luck: next, max };
}

async function _syncTeamLuckForActorLifecycle(actor) {
    if (!game.user?.isGM) return;
    if (!actor || actor.type !== "character") return;
    await syncTeamLuckMaxWithPlayers();
}

async function getAutomationTable(tableType) {
    const normalized = String(tableType ?? "").trim().toLowerCase();
    const settingKey = _getAutomationSettingKey(normalized);
    if (!settingKey) return null;
    const tableUuid = String(game.settings.get("laundry-rpg", settingKey) ?? "").trim();
    if (!tableUuid) return null;
    try {
        const table = await fromUuid(tableUuid);
        return table instanceof RollTable ? table : null;
    } catch (err) {
        console.warn(`Laundry RPG | Failed to resolve automation RollTable: ${tableType}`, err);
        return null;
    }
}

async function setAutomationTable(tableType, tableUuid = "") {
    const settingKey = _getAutomationSettingKey(tableType);
    if (!settingKey) return false;

    const normalizedUuid = String(tableUuid ?? "").trim();
    if (normalizedUuid) {
        try {
            const table = await fromUuid(normalizedUuid);
            if (!(table instanceof RollTable)) return false;
        } catch (_err) {
            return false;
        }
    }

    await game.settings.set("laundry-rpg", settingKey, normalizedUuid);
    return true;
}

async function resetAutomationTable(tableType) {
    const normalized = String(tableType ?? "").trim().toLowerCase();
    const settingKey = _getAutomationSettingKey(normalized);
    if (!settingKey) return null;

    await game.settings.set("laundry-rpg", settingKey, "");
    const defaults = normalized === "mishap"
        ? _buildDefaultMishapTableData()
        : _buildDefaultInjuryTableData();
    return _ensureAutomationTable({
        tableType: normalized,
        settingKey,
        defaults
    });
}

async function ensureAutomationRollTables() {
    if (!game.user?.isGM) return;
    await _ensureAutomationTable({
        tableType: "injury",
        settingKey: INJURY_TABLE_SETTING,
        defaults: _buildDefaultInjuryTableData()
    });
    await _ensureAutomationTable({
        tableType: "mishap",
        settingKey: MISHAP_TABLE_SETTING,
        defaults: _buildDefaultMishapTableData()
    });
}

async function _ensureAutomationTable({ tableType, settingKey, defaults } = {}) {
    const existing = await getAutomationTable(tableType);
    if (existing) return existing;

    const table = await RollTable.create(defaults, { renderSheet: false });
    await game.settings.set("laundry-rpg", settingKey, table.uuid);
    console.log(`Laundry RPG | Created default ${tableType} RollTable: ${table.uuid}`);
    return table;
}

function _getAutomationSettingKey(tableType) {
    const normalized = String(tableType ?? "").trim().toLowerCase();
    if (normalized === "injury") return INJURY_TABLE_SETTING;
    if (normalized === "mishap") return MISHAP_TABLE_SETTING;
    return null;
}

const PDF_PHYSICAL_INJURY_ROWS = [
    {
        roll: "1-2",
        injury: "Arm Wound",
        effect: "You drop an object you're carrying. Until this injury is healed, you increase the Difficulty of all Body (Dexterity) Tests you make by 1.",
        statusId: "",
        durationRounds: 0
    },
    {
        roll: "3-4",
        injury: "Leg Wound",
        effect: "You are knocked Prone. Until this injury is healed, you increase the Difficulty of all Body (Athletics) Tests you make by 1.",
        statusId: "prone",
        durationRounds: 0
    },
    {
        roll: "5-8",
        injury: "Head Wound",
        effect: "You are Stunned until the end of your next turn. Until this injury is healed, you increase the Difficulty of all Body (Reflexes) Tests you make by 1.",
        statusId: "stunned",
        durationRounds: 1
    },
    {
        roll: "9-10",
        injury: "Internal Injury",
        effect: "You are Incapacitated until the end of your next turn. Until this injury is healed, you increase the Difficulty of all Body (Fortitude and Might) Tests you make by 1.",
        statusId: "incapacitated",
        durationRounds: 1
    },
    {
        roll: "11-12",
        injury: "Broken Arm",
        effect: "You drop an object that you're carrying. Until this injury is healed, you reduce your Melee and Accuracy by one step. Additionally, you increase the Difficulty of all Tests which would require the use of two arms by 1.",
        statusId: "",
        durationRounds: 0
    },
    {
        roll: "13-14",
        injury: "Broken Leg",
        effect: "You are knocked Prone. Until this injury is healed, reduce your Speed by 1 step, and increase the Difficulty of all Body (Athletics and Stealth) Tests you make by 1.",
        statusId: "prone",
        durationRounds: 0
    },
    {
        roll: "15-17",
        injury: "Brain Injury",
        effect: "You fall Unconscious until the end of your next turn. Until this injury is healed, you always go last in the turn order, and you increase the Difficulty of all Body Tests you make by 1.",
        statusId: "unconscious",
        durationRounds: 1
    },
    {
        roll: "18+",
        injury: "Instant Death",
        effect: "You instantly die a gruesome death!",
        statusId: "incapacitated",
        durationRounds: 0
    }
];

const PDF_PSYCHOLOGICAL_INJURY_ROWS = [
    {
        roll: "1-2",
        injury: "Shocked",
        effect: "You let out a loud shout, yelp, or scream. Until this Injury is healed, increase the Difficulty of all Mind (Intuition) Tests you make by 1.",
        statusId: "",
        durationRounds: 0
    },
    {
        roll: "3-4",
        injury: "Phobia",
        effect: "Until this Injury is healed, you are Frightened of the cause of this Injury.",
        statusId: "frightened",
        durationRounds: 0
    },
    {
        roll: "5-8",
        injury: "Confused",
        effect: "You are Stunned until the end of your next turn. Until this Injury is healed, increase the Difficulty of all Mind (Awareness) Tests you make by 1.",
        statusId: "stunned",
        durationRounds: 1
    },
    {
        roll: "9-10",
        injury: "Existential Dread",
        effect: "You are Incapacitated until the end of your next turn. Until this Injury is healed, you increase the Difficulty of all Spirit (Resolve) Tests you make by 1.",
        statusId: "incapacitated",
        durationRounds: 1
    },
    {
        roll: "11-12",
        injury: "Reality Denial",
        effect: "You are Blinded and Deafened until the end of your next turn. Until this Injury is healed, you increase the Difficulty of all Spirit (Zeal) and Mind (Magic) Tests by 1.",
        statusId: "blinded",
        durationRounds: 1
    },
    {
        roll: "13-14",
        injury: "Traumatised",
        effect: "Until this Injury is healed, you are Terrified of the cause of this Injury.",
        statusId: "terrified",
        durationRounds: 0
    },
    {
        roll: "15-17",
        injury: "Hallucinations",
        effect: "You fall Unconscious until the end of your next turn. Until this Injury is healed, you cannot make Extended Tests, and you increase the Difficulty of all Mind and Spirit Tests you make by 1.",
        statusId: "unconscious",
        durationRounds: 1
    },
    {
        roll: "18+",
        injury: "Broken Mind",
        effect: "Your mind completely crumbles and you are plunged into an unwaking coma.",
        statusId: "unconscious",
        durationRounds: 0
    }
];

const PDF_MISHAP_ROWS = [
    {
        roll: "2-3",
        effect: "Incursion",
        description: "The caster opens a Level 4 Dimensional Gateway, with one portal in their Zone, and the other in an unknown dimension. An exonome of the spell's Level enters the Zone, per Summons (below). Unless the gateway is sealed, more exonomes may appear over the coming Rounds, hours, and days."
    },
    {
        roll: "4",
        effect: "Outbreak",
        description: "Extra-dimensional energies escape from the spellcaster's control. All Zones within Medium Range of their current location are transformed into a Hazard which inflicts Psychological Damage equal to the spell's Level."
    },
    {
        roll: "5",
        effect: "Summons",
        description: "The caster accidentally summons an exonome of the spell's Level into their Zone. If the exonome has no physical form, it immediately attempts Possession of a target in its Zone, ignoring the spell's usual 1 hour Casting Time. If it already has physical form, it reacts violently, and attempts to escape."
    },
    {
        roll: "6",
        effect: "Ground Zero",
        description: "Bizarre forces spin around the spellcaster, barely within their power to contain. Their current Zone is transformed into a Hazard which inflicts Psychological Damage equal to the spell's Level."
    },
    {
        roll: "7",
        effect: "Psychological Injury",
        description: "The caster suffers a Psychological Injury. Level 1 spells inflict Minor Injuries, Level 2-3 spells inflict Serious Injuries, and Level 4+ spells inflict Deadly Injuries."
    },
    {
        roll: "8",
        effect: "Warping",
        description: "The GM adjusts the Environmental Traits of the spellcaster's Zone to reflect the misfiring extra-dimensional static coursing through the space. Scale the results to the Level of the spell - a Level 1 Warping might only cover the Zone in Lightly Obscuring green fog, whilst Level 4 Warping could flatten Cover, impose Difficult Terrain, and plunge it into Darkness."
    },
    {
        roll: "9",
        effect: "Miscast",
        description: "After resolving the spell's effects (if any), the caster immediately triggers a second spell, successfully cast at the original spell's Level. If the original spell targeted the caster, they blast their spirit out of their body using Astral Projection. If the original spell targeted another creature, the caster and the target are bound in a Destiny Entanglement Geas. If the original spell targeted a Zone or inanimate creature, the GM chooses an appropriate effect due to Energy Transference."
    },
    {
        roll: "10",
        effect: "Dread",
        description: "The caster seems to have gotten away scott free, but a gnawing sensation at the back of their mind warns them that the looming spectre of CASE NIGHTMARE GREEN is creeping ever-closer. Increase Threat by +1."
    },
    {
        roll: "11-12",
        effect: "Dark Future",
        description: "In the interdimensional ether the caster is haunted by dreadful visions of a post-cataclysmic world, along with useful details of a potential future. The caster triggers a successful Prognostication at the spell's Level if they are a Laundry operative. NPCs trigger the Dread effect instead."
    }
];

function _parseRollRangeSpec(raw) {
    const text = String(raw ?? "").trim();
    const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
        const min = Math.max(0, Math.trunc(Number(rangeMatch[1]) || 0));
        const max = Math.max(min, Math.trunc(Number(rangeMatch[2]) || min));
        return [min, max];
    }
    const plusMatch = text.match(/^(\d+)\s*\+$/);
    if (plusMatch) {
        const min = Math.max(0, Math.trunc(Number(plusMatch[1]) || 0));
        return [min, 999];
    }
    const exact = Math.max(0, Math.trunc(Number(text) || 0));
    return [exact, exact];
}

function _buildRollTableResult({
    text = "",
    roll = "1",
    flags = {}
} = {}) {
    return {
        type: CONST.TABLE_RESULT_TYPES.TEXT,
        text,
        weight: 1,
        range: _parseRollRangeSpec(roll),
        drawn: false,
        flags: {
            "laundry-rpg": flags
        }
    };
}

function _buildDefaultInjuryTableData() {
    const physicalResults = PDF_PHYSICAL_INJURY_ROWS.map(row => _buildRollTableResult({
        text: `${row.injury}: ${row.effect}`,
        roll: row.roll,
        flags: {
            injuryType: "physical",
            conditionData: {
                injuryType: "physical",
                effectName: row.injury,
                statusId: row.statusId,
                durationRounds: row.durationRounds
            }
        }
    }));
    const psychologicalResults = PDF_PSYCHOLOGICAL_INJURY_ROWS.map(row => _buildRollTableResult({
        text: `${row.injury}: ${row.effect}`,
        roll: row.roll,
        flags: {
            injuryType: "psychological",
            conditionData: {
                injuryType: "psychological",
                effectName: row.injury,
                statusId: row.statusId,
                durationRounds: row.durationRounds
            }
        }
    }));

    return {
        name: "Laundry Injury Table",
        description: "Default physical and psychological injury outcomes from Operative's Handbook (editable by GM).",
        formula: "2d6",
        replacement: true,
        displayRoll: true,
        results: physicalResults.concat(psychologicalResults)
    };
}

function _buildDefaultMishapTableData() {
    const results = PDF_MISHAP_ROWS.map(row => _buildRollTableResult({
        text: `${row.effect}: ${row.description}`,
        roll: row.roll,
        flags: {
            conditionData: {
                effectName: row.effect,
                statusId: "",
                durationRounds: 0
            }
        }
    }));

    return {
        name: "Laundry Magic Mishap Table",
        description: "Default magical mishap outcomes from Operative's Handbook (editable by GM).",
        formula: "2d6",
        replacement: true,
        displayRoll: true,
        results
    };
}

async function cacheTalentNameIndex() {
    const pack = game.packs.get("laundry-rpg.talents");
    if (!pack) {
        game.laundry.talentNames = new Set();
        return;
    }
    const index = await pack.getIndex();
    game.laundry.talentNames = new Set(
        index
            .map(entry => String(entry?.name ?? "").trim().toLowerCase())
            .filter(Boolean)
    );
}

function decorateCombatTracker(html) {
    const combat = game.combat;
    if (!combat) return;

    const activeCombatantId = combat.combatant?.id;
    const rows = html.find(".combatant");
    rows.removeClass("laundry-spotlight");
    rows.find(".laundry-active-stamp").remove();

    if (!activeCombatantId) return;
    const activeRow = html.find(`.combatant[data-combatant-id="${activeCombatantId}"]`);
    if (!activeRow.length) return;

    activeRow.addClass("laundry-spotlight");
    const nameContainer = activeRow.find(".token-name h4, .token-name").first();
    if (nameContainer.length) {
        const stamp = document.createElement("span");
        stamp.className = "laundry-active-stamp";
        stamp.textContent = game.i18n.localize("LAUNDRY.ActiveAgent");
        nameContainer.append(stamp);
    }
}

function _isTurnUpdate(changed = {}) {
    return Object.prototype.hasOwnProperty.call(changed, "turn")
        || Object.prototype.hasOwnProperty.call(changed, "round")
        || Object.prototype.hasOwnProperty.call(changed, "combatants");
}

function refreshCombatDrivenUIs() {
    ui.combat?.render(false);
    for (const app of Object.values(ui.windows)) {
        if (app instanceof LaundryActorSheet && app.rendered) {
            app.render(false);
        }
    }
}

function _getTurnKey(combat) {
    const round = Math.max(0, Math.trunc(Number(combat?.round ?? 0) || 0));
    const turn = Math.max(0, Math.trunc(Number(combat?.turn ?? 0) || 0));
    return `${round}:${turn}`;
}

function _getActorCombatant(actor, combat = game.combat) {
    const actorId = actor?.id ?? actor;
    if (!actorId || !combat) return null;
    return combat.combatants.find(entry => entry.actorId === actorId) ?? null;
}

function _normalizeTurnEconomyState(combat, state = null) {
    const turnKey = _getTurnKey(combat);
    const actionFallback = combat?.started ? 1 : 0;
    const normalized = state?.turnKey === turnKey
        ? state
        : {
            turnKey,
            actionsRemaining: actionFallback,
            moveRemaining: combat?.started ? 1 : 0,
            fearCloserBlocked: false
        };

    return {
        turnKey,
        actionsRemaining: Math.max(0, Math.trunc(Number(normalized?.actionsRemaining) || 0)),
        moveRemaining: Math.max(0, Math.trunc(Number(normalized?.moveRemaining) || 0)),
        fearCloserBlocked: Boolean(normalized?.fearCloserBlocked)
    };
}

function _collectActorStatuses(actor) {
    const statuses = new Set();
    if (!actor) return statuses;
    for (const effect of actor.effects ?? []) {
        const effectStatuses = _extractEffectStatuses(effect);
        for (const statusId of effectStatuses) {
            if (statusId) statuses.add(String(statusId).trim().toLowerCase());
        }
        const legacyStatus = effect.getFlag?.("core", "statusId");
        if (legacyStatus) statuses.add(String(legacyStatus).trim().toLowerCase());
    }
    return statuses;
}

function _getConditionDefinition(statusId) {
    const key = String(statusId ?? "").trim().toLowerCase();
    return LAUNDRY_CONDITIONS[key] ?? null;
}

function _extractEffectStatuses(effect) {
    const statuses = effect?.statuses instanceof Set
        ? Array.from(effect.statuses)
        : Array.isArray(effect?.statuses) ? effect.statuses : [];
    if (statuses.length) return statuses.map(value => String(value));
    const legacy = effect?.getFlag?.("core", "statusId");
    return legacy ? [String(legacy)] : [];
}

function _normalizeIdString(value) {
    const text = String(value ?? "").trim();
    return text || "";
}

function _resolveDefaultFearSourceFromTargets(actor) {
    const actorId = _normalizeIdString(actor?.id);
    for (const target of Array.from(game.user?.targets ?? [])) {
        const targetActor = target?.actor ?? target?.document?.actor ?? null;
        const targetActorId = _normalizeIdString(targetActor?.id);
        if (!targetActorId || targetActorId === actorId) continue;
        return {
            fearSourceActorId: targetActorId,
            fearSourceTokenId: _normalizeIdString(target?.id ?? target?.document?.id),
            fearSourceName: _normalizeIdString(target?.name ?? targetActor?.name)
        };
    }
    return {
        fearSourceActorId: "",
        fearSourceTokenId: "",
        fearSourceName: ""
    };
}

function _resolveFearConditionData({
    actor,
    statusKey,
    fearSourceActorId = "",
    fearSourceTokenId = "",
    fearSourceName = "",
    existingData = null
} = {}) {
    if (statusKey !== "frightened" && statusKey !== "terrified") return {};

    const previous = existingData && typeof existingData === "object" ? existingData : {};
    let actorId = _normalizeIdString(fearSourceActorId) || _normalizeIdString(previous.fearSourceActorId);
    let tokenId = _normalizeIdString(fearSourceTokenId) || _normalizeIdString(previous.fearSourceTokenId);
    let sourceName = _normalizeIdString(fearSourceName) || _normalizeIdString(previous.fearSourceName);

    if (!actorId && !tokenId) {
        const fallback = _resolveDefaultFearSourceFromTargets(actor);
        actorId = fallback.fearSourceActorId;
        tokenId = fallback.fearSourceTokenId;
        sourceName = sourceName || fallback.fearSourceName;
    }

    if (!actorId && tokenId && canvas?.scene) {
        const sourceToken = canvas.tokens?.get(tokenId)
            ?? canvas.tokens?.placeables?.find(token => token?.id === tokenId)
            ?? null;
        actorId = _normalizeIdString(sourceToken?.actor?.id);
        sourceName = sourceName || _normalizeIdString(sourceToken?.name ?? sourceToken?.actor?.name);
    }

    if (!tokenId && actorId && canvas?.scene) {
        const sourceToken = canvas.tokens?.placeables?.find(token =>
            token?.actor?.id === actorId && token.document?.hidden !== true
        ) ?? null;
        tokenId = _normalizeIdString(sourceToken?.id);
        sourceName = sourceName || _normalizeIdString(sourceToken?.name ?? sourceToken?.actor?.name);
    }

    if (!sourceName && actorId) {
        sourceName = _normalizeIdString(game.actors?.get(actorId)?.name);
    }

    const out = {};
    if (actorId) out.fearSourceActorId = actorId;
    if (tokenId) out.fearSourceTokenId = tokenId;
    if (sourceName) out.fearSourceName = sourceName;
    return out;
}

async function _removeActorStatus(actor, statusId) {
    if (!actor || !statusId) return;
    const toDelete = actor.effects
        .filter(effect => {
            const effectStatuses = _extractEffectStatuses(effect);
            if (effectStatuses.includes(statusId)) return true;
            return effect.getFlag?.("core", "statusId") === statusId;
        })
        .map(effect => effect.id);
    if (!toDelete.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
}

export async function removeCondition(actor, statusId, { suppressChat = false } = {}) {
    const statusKey = String(statusId ?? "").trim().toLowerCase();
    if (!actor || !statusKey) return false;
    const hadStatus = _collectActorStatuses(actor).has(statusKey);
    if (!hadStatus) return false;
    await _removeActorStatus(actor, statusKey);
    if (!suppressChat) {
        const condition = _getConditionDefinition(statusKey);
        const safeName = foundry.utils.escapeHTML(actor.name ?? "Agent");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<p><strong>${safeName}</strong>: ${condition?.name ?? statusKey} removed.</p>`
        });
    }
    return true;
}

export async function applyCondition(actor, statusId, {
    durationRounds = null,
    source = "automation",
    suppressChat = false,
    refreshDurationIfPresent = true,
    fearSourceActorId = "",
    fearSourceTokenId = "",
    fearSourceName = ""
} = {}) {
    const statusKey = String(statusId ?? "").trim().toLowerCase();
    if (!actor || !statusKey) return false;
    const condition = _getConditionDefinition(statusKey);
    if (!condition) return false;

    const existing = actor.effects.find(effect => _extractEffectStatuses(effect).includes(statusKey));
    const combat = game.combat;
    const resolvedDuration = Number.isFinite(Number(durationRounds))
        ? Math.max(0, Math.trunc(Number(durationRounds)))
        : Math.max(0, Math.trunc(Number(condition.defaultDurationRounds ?? 0) || 0));
    const existingConditionData = existing?.getFlag?.("laundry-rpg", "conditionData") ?? null;
    const fearConditionData = _resolveFearConditionData({
        actor,
        statusKey,
        fearSourceActorId,
        fearSourceTokenId,
        fearSourceName,
        existingData: existingConditionData
    });
    const conditionData = {
        statusId: statusKey,
        durationRounds: resolvedDuration,
        source,
        ...fearConditionData
    };

    if (existing) {
        const updateData = {
            [`flags.laundry-rpg.conditionData`]: conditionData
        };
        if (refreshDurationIfPresent && resolvedDuration > 0 && combat?.started) {
            updateData.duration = {
                rounds: resolvedDuration,
                startRound: Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0)),
                startTurn: Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))
            };
        }
        await existing.update(updateData);
        return true;
    }

    const effectData = {
        name: condition.name,
        img: condition.img,
        statuses: [statusKey],
        disabled: false,
        origin: actor.uuid,
        flags: {
            core: {
                statusId: statusKey
            },
            "laundry-rpg": {
                conditionData
            }
        }
    };

    if (resolvedDuration > 0 && combat?.started) {
        effectData.duration = {
            rounds: resolvedDuration,
            startRound: Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0)),
            startTurn: Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))
        };
    }

    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

    if (statusKey === "frightened" || statusKey === "terrified") {
        const adrenalineValue = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
        const adrenalineMax = Math.max(adrenalineValue, Math.trunc(Number(actor.system?.derived?.adrenaline?.max ?? adrenalineValue) || adrenalineValue));
        const nextAdrenaline = Math.max(0, Math.min(adrenalineMax, adrenalineValue + 1));
        if (nextAdrenaline !== adrenalineValue) {
            await actor.update({ "system.derived.adrenaline.value": nextAdrenaline });
        }
    }

    if (!suppressChat) {
        const safeName = foundry.utils.escapeHTML(actor.name ?? "Agent");
        const durationText = resolvedDuration > 0 ? ` (${resolvedDuration} round)` : "";
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<p><strong>${safeName}</strong> gains <strong>${condition.name}</strong>${durationText}.</p>`
        });
    }
    return true;
}

async function cleanupExpiredConditions(combat) {
    if (!game.user?.isGM) return;
    if (!combat?.started) return;

    for (const combatant of combat.combatants ?? []) {
        const actor = combatant?.actor;
        if (!actor) continue;
        const expiredIds = [];
        for (const effect of actor.effects ?? []) {
            const statuses = _extractEffectStatuses(effect).map(value => value.toLowerCase());
            if (!statuses.some(status => LAUNDRY_STATUS_IDS.has(status))) continue;
            const rounds = Number(effect.duration?.rounds ?? 0);
            const remaining = Number(effect.duration?.remaining);
            if (!Number.isFinite(rounds) || rounds <= 0) continue;
            if (!Number.isFinite(remaining)) continue;
            if (remaining > 0) continue;
            expiredIds.push(effect.id);
        }

        if (!expiredIds.length) continue;
        await actor.deleteEmbeddedDocuments("ActiveEffect", expiredIds);
        const safeName = foundry.utils.escapeHTML(actor.name ?? "Agent");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<p><strong>${safeName}</strong>: temporary conditions expired.</p>`
        });
    }
}

export function getCombatTurnEconomy(actor) {
    const combat = game.combat;
    const combatant = _getActorCombatant(actor, combat);
    if (!combat || !combatant) {
        return {
            tracked: false,
            isActorTurn: false,
            actionsRemaining: 0,
            moveRemaining: 0,
            turnKey: null
        };
    }

    const state = _normalizeTurnEconomyState(
        combat,
        combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG)
    );

    return {
        tracked: true,
        isActorTurn: combat.combatant?.id === combatant.id,
        actionsRemaining: state.actionsRemaining,
        moveRemaining: state.moveRemaining,
        fearCloserBlocked: state.fearCloserBlocked,
        turnKey: state.turnKey
    };
}

export async function consumeCombatAction(actor, { amount = 1, warn = true } = {}) {
    const combat = game.combat;
    const combatant = _getActorCombatant(actor, combat);
    if (!combat || !combatant) return true;
    if (combat.combatant?.id !== combatant.id) return true;
    const statuses = _collectActorStatuses(actor);
    if (statuses.has("incapacitated") || statuses.has("unconscious")) {
        if (warn) ui.notifications.warn("Incapacitated actors cannot take Actions.");
        return false;
    }

    const spend = Math.max(1, Math.trunc(Number(amount) || 1));
    const state = _normalizeTurnEconomyState(
        combat,
        combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG)
    );

    if (state.actionsRemaining < spend) {
        if (warn) ui.notifications.warn("No Actions remaining this turn.");
        return false;
    }

    state.actionsRemaining -= spend;
    await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, state);
    return true;
}

export async function consumeCombatMove(actor, { amount = 1, warn = true } = {}) {
    const combat = game.combat;
    const combatant = _getActorCombatant(actor, combat);
    if (!combat || !combatant) return true;
    if (combat.combatant?.id !== combatant.id) return true;
    const statuses = _collectActorStatuses(actor);
    if (statuses.has("incapacitated") || statuses.has("unconscious")) {
        if (warn) ui.notifications.warn("Incapacitated actors cannot Move.");
        return false;
    }
    if (statuses.has("restrained")) {
        if (warn) ui.notifications.warn("Restrained actors cannot Move.");
        return false;
    }

    const spend = Math.max(1, Math.trunc(Number(amount) || 1));
    const state = _normalizeTurnEconomyState(
        combat,
        combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG)
    );

    if (state.moveRemaining < spend) {
        if (warn) ui.notifications.warn("No Move remaining this turn.");
        return false;
    }

    const fearConstraint = _getFearMoveConstraint(actor);
    if (fearConstraint?.hasLineOfSight) {
        const moveIntent = await _promptFearMovementIntent({
            actor,
            fearConstraint
        });
        if (moveIntent === "cancel") return false;
        if (moveIntent === "closer") {
            if (state.fearCloserBlocked) {
                if (warn) {
                    ui.notifications.warn(game.i18n.format("LAUNDRY.FearMoveBlockedTurn", {
                        source: fearConstraint.sourceName
                    }));
                }
                return false;
            }
            const check = await _rollFearResolveCheck({
                actor,
                fearConstraint
            });
            if (!check.passed) {
                state.fearCloserBlocked = true;
                await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, state);
                if (warn) {
                    ui.notifications.warn(game.i18n.format("LAUNDRY.FearMoveDenied", {
                        name: actor.name,
                        source: fearConstraint.sourceName
                    }));
                }
                return false;
            }
        }
    }

    state.moveRemaining -= spend;
    await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, state);
    return true;
}

function _getActorTokenInCurrentScene(actor) {
    if (!actor || !canvas?.scene) return null;
    return canvas.tokens?.placeables?.find(token =>
        token?.actor?.id === actor.id && token.document?.hidden !== true
    ) ?? null;
}

function _getFearSourceToken({ fearSourceTokenId = "", fearSourceActorId = "" } = {}) {
    const tokenId = _normalizeIdString(fearSourceTokenId);
    if (tokenId && canvas?.scene) {
        const byId = canvas.tokens?.get(tokenId)
            ?? canvas.tokens?.placeables?.find(token => token?.id === tokenId)
            ?? null;
        if (byId) return byId;
    }

    const actorId = _normalizeIdString(fearSourceActorId);
    if (!actorId || !canvas?.scene) return null;
    return canvas.tokens?.placeables?.find(token =>
        token?.actor?.id === actorId && token.document?.hidden !== true
    ) ?? null;
}

function _tokensHaveLineOfSight(observerToken, targetToken) {
    if (!observerToken?.center || !targetToken?.center) return false;

    if (typeof observerToken.hasLineOfSight === "function") {
        try {
            return Boolean(observerToken.hasLineOfSight(targetToken));
        } catch (_err) {
            // Fall through to visibility check fallback.
        }
    }

    if (canvas?.visibility?.testVisibility) {
        try {
            const visible = canvas.visibility.testVisibility(targetToken.center, {
                object: observerToken
            });
            if (typeof visible === "boolean") return visible;
        } catch (_err) {
            // Fall through to permissive fallback.
        }
    }

    return true;
}

function _getFearMoveConstraint(actor) {
    if (!actor) return null;
    const statuses = _collectActorStatuses(actor);
    const statusId = statuses.has("terrified")
        ? "terrified"
        : (statuses.has("frightened") ? "frightened" : "");
    if (!statusId) return null;

    const conditionEffect = Array.from(actor.effects ?? []).find(effect => {
        const effectStatuses = _extractEffectStatuses(effect)
            .map(value => String(value ?? "").trim().toLowerCase());
        return effectStatuses.includes(statusId);
    }) ?? null;
    const conditionData = conditionEffect?.getFlag?.("laundry-rpg", "conditionData") ?? {};
    const fearSourceActorId = _normalizeIdString(conditionData?.fearSourceActorId);
    const fearSourceTokenId = _normalizeIdString(conditionData?.fearSourceTokenId);
    const sourceToken = _getFearSourceToken({ fearSourceTokenId, fearSourceActorId });
    const sourceName = _normalizeIdString(
        conditionData?.fearSourceName
        || sourceToken?.name
        || sourceToken?.actor?.name
        || game.actors?.get(fearSourceActorId)?.name
        || game.i18n.localize("LAUNDRY.FearSourceUnknown")
    );
    const actorToken = _getActorTokenInCurrentScene(actor);
    const hasLineOfSight = Boolean(actorToken && sourceToken && _tokensHaveLineOfSight(actorToken, sourceToken));

    return {
        statusId,
        sourceName,
        fearSourceActorId,
        fearSourceTokenId,
        hasLineOfSight,
        dn: statusId === "terrified" ? 6 : 5
    };
}

async function _promptFearMovementIntent({ actor, fearConstraint } = {}) {
    const sourceName = foundry.utils.escapeHTML(
        fearConstraint?.sourceName
        ?? game.i18n.localize("LAUNDRY.FearSourceUnknown")
    );
    const dn = Math.max(2, Math.min(6, Math.trunc(Number(fearConstraint?.dn ?? 5) || 5)));
    const actorName = foundry.utils.escapeHTML(actor?.name ?? game.i18n.localize("LAUNDRY.ActorFallback"));
    const line1 = game.i18n.format("LAUNDRY.FearMoveDialogLine1", { name: actorName });
    const line2 = game.i18n.format("LAUNDRY.FearMoveDialogLine2", { source: sourceName, dn });
    return new Promise(resolve => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        new Dialog({
            title: game.i18n.localize("LAUNDRY.FearMoveDialogTitle"),
            content: `<p>${line1}</p><p>${line2}</p>`,
            classes: ["laundry-rpg", "laundry-dialog"],
            buttons: {
                closer: {
                    label: game.i18n.localize("LAUNDRY.FearMoveCloser"),
                    callback: () => finish("closer")
                },
                notCloser: {
                    label: game.i18n.localize("LAUNDRY.FearMoveElsewhere"),
                    callback: () => finish("not-closer")
                },
                cancel: {
                    label: game.i18n.localize("Cancel"),
                    callback: () => finish("cancel")
                }
            },
            default: "notCloser",
            close: () => finish("cancel")
        }).render(true);
    });
}

function _didDiceStateSucceed(state) {
    if (!state || typeof state !== "object") return false;
    const dn = Math.max(2, Math.min(6, Math.trunc(Number(state.effectiveDn ?? state.dn ?? 4) || 4)));
    const complexity = Math.max(1, Math.trunc(Number(state.complexity ?? 1) || 1));
    const dice = Array.isArray(state.rawDice) ? state.rawDice : [];
    const allocations = Array.isArray(state.focusAllocations) ? state.focusAllocations : [];
    const successes = dice.reduce((sum, raw, index) => {
        const value = Math.max(1, Math.min(6, Math.trunc(Number(raw) || 1)));
        const bonus = Math.max(0, Math.trunc(Number(allocations[index] ?? 0) || 0));
        const adjusted = Math.max(1, Math.min(6, value + bonus));
        return sum + (adjusted >= dn ? 1 : 0);
    }, 0);
    return successes >= complexity;
}

async function _rollFearResolveCheck({ actor, fearConstraint } = {}) {
    if (!actor) return { passed: false };

    const resolveSkill = actor.items.find(item =>
        item.type === "skill" && String(item.name ?? "").trim().toLowerCase() === "resolve"
    ) ?? null;
    const attributeKey = String(resolveSkill?.system?.attribute ?? "spirit").trim().toLowerCase() || "spirit";
    const attributeValue = Math.max(0, Math.trunc(Number(actor.system?.attributes?.[attributeKey]?.value) || 0));
    const trainingValue = Math.max(0, Math.trunc(Number(resolveSkill?.system?.training) || 0));
    const pool = Math.max(0, attributeValue + trainingValue);
    if (pool <= 0) {
        return { passed: false };
    }

    const dn = Math.max(2, Math.min(6, Math.trunc(Number(fearConstraint?.dn ?? 5) || 5)));
    const sourceName = String(
        fearConstraint?.sourceName
        ?? game.i18n.localize("LAUNDRY.FearSourceUnknown")
    ).trim();
    const message = await rollDice({
        pool,
        dn,
        complexity: 1,
        flavor: game.i18n.format("LAUNDRY.FearCheckFlavor", { source: sourceName }),
        actorId: actor.id,
        focusItemId: resolveSkill?.id ?? null,
        allowPostRollFocus: false,
        prompt: false,
        rollContext: {
            sourceType: "skill",
            sourceName: "Resolve",
            skillName: "Resolve",
            attribute: attributeKey,
            isMagic: false,
            isSpell: false
        }
    });
    const state = message?.getFlag?.("laundry-rpg", "diceState") ?? null;
    return {
        passed: _didDiceStateSucceed(state)
    };
}

export async function spendAdrenalineForExtraAction(actor) {
    const combat = game.combat;
    const combatant = _getActorCombatant(actor, combat);
    if (!combat || !combatant) {
        ui.notifications.warn("Extra Actions from Adrenaline are tracked in combat only.");
        return false;
    }
    if (combat.combatant?.id !== combatant.id) {
        ui.notifications.warn("You can only gain an extra Action during your turn.");
        return false;
    }
    const statuses = _collectActorStatuses(actor);
    if (statuses.has("stunned") || statuses.has("incapacitated") || statuses.has("unconscious")) {
        ui.notifications.warn("Current condition prevents spending Adrenaline for extra Actions.");
        return false;
    }

    const currentAdrenaline = Math.max(0, Math.trunc(Number(actor?.system?.derived?.adrenaline?.value) || 0));
    if (currentAdrenaline <= 0) {
        ui.notifications.warn("No Adrenaline available.");
        return false;
    }

    await actor.update({ "system.derived.adrenaline.value": currentAdrenaline - 1 });

    const state = _normalizeTurnEconomyState(
        combat,
        combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG)
    );
    state.actionsRemaining += 1;
    await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, state);

    ui.notifications.info("Adrenaline spent: +1 Action this turn.");
    return true;
}

async function initializeTurnEconomyForActiveCombatant(combat) {
    if (!game.user?.isGM) return;
    if (!combat?.started) return;
    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!combatant || !actor) return;

    const existing = combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG);
    const normalized = _normalizeTurnEconomyState(combat, existing);
    if (existing?.turnKey === normalized.turnKey) return;

    const activeStatuses = _collectActorStatuses(actor);
    if (activeStatuses.has("bleeding")) {
        await _applyBleedingTick(actor);
    }
    if (activeStatuses.has("terrified")) {
        const currentAdr = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
        const maxAdr = Math.max(currentAdr, Math.trunc(Number(actor.system?.derived?.adrenaline?.max ?? currentAdr) || currentAdr));
        const nextAdr = Math.max(0, Math.min(maxAdr, currentAdr + 1));
        if (nextAdr !== currentAdr) {
            await actor.update({ "system.derived.adrenaline.value": nextAdr });
        }
    }

    for (const statusId of activeStatuses) {
        const definition = _getConditionDefinition(statusId);
        if (!definition?.clearAtTurnStart) continue;
        if (statusId === "stunned") {
            normalized.actionsRemaining = 0;
            await removeCondition(actor, statusId, { suppressChat: true });
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<p><strong>${foundry.utils.escapeHTML(actor.name ?? "Agent")}</strong> is Stunned and loses their Action this turn.</p>`
            });
            continue;
        }
        await removeCondition(actor, statusId, { suppressChat: true });
    }

    await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, normalized);
}

async function _applyBleedingTick(actor) {
    const currentToughness = Math.max(0, Math.trunc(Number(actor.system?.derived?.toughness?.value) || 0));
    if (currentToughness <= 0) return;

    const maxToughness = Math.max(
        currentToughness,
        Math.trunc(Number(actor.system?.derived?.toughness?.max ?? currentToughness))
    );
    const nextToughness = Math.max(0, currentToughness - 1);
    const nextDamage = Math.max(0, maxToughness - nextToughness);

    await actor.update({
        "system.derived.toughness.value": nextToughness,
        "system.derived.toughness.damage": nextDamage
    });

    const safeName = foundry.utils.escapeHTML(actor.name ?? "Agent");
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><strong>${safeName}</strong> suffers 1 Toughness from Bleeding (${currentToughness} → ${nextToughness}).</p>`
    });
}
