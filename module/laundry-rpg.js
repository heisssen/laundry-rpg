import { LaundryActor } from "./actor/actor.js";
import { LaundryActorSheet, LaundryNpcSheet } from "./actor/actor-sheet.js";
import { LaundryCharacterBuilder } from "./actor/character-builder.js";
import { LaundryAutomationSettings } from "./apps/automation-settings.js";
import { LaundryGMTracker } from "./apps/gm-tracker.js";
import { bindTokenHudControls } from "./apps/token-hud.js";
import { LaundryItem } from "./item/item.js";
import { LaundryItemSheet } from "./item/item-sheet.js";
import { bindDiceChatControls } from "./dice.js";
import { migrateWorld } from "./migration.js";

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
    refreshCombatDrivenUIs();
});

Hooks.on("combatStart", async (combat) => {
    await cleanupExpiredConditions(combat);
    await initializeTurnEconomyForActiveCombatant(combat);
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
        "systems/laundry-rpg/templates/apps/automation-settings.html"
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
    const current = Number(game.settings.get("laundry-rpg", "teamLuck")) || 0;
    let max = Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0;

    if (max <= 0) {
        const inferred = Math.max(
            1,
            game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).length
        );
        max = inferred;
        await game.settings.set("laundry-rpg", "teamLuckMax", max);
    }

    const clampedCurrent = Math.max(0, Math.min(max, current));
    if (clampedCurrent !== current) {
        await game.settings.set("laundry-rpg", "teamLuck", clampedCurrent);
    }
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

function _buildDefaultInjuryTableData() {
    return {
        name: "Laundry Injury Table",
        description: "Default injury outcomes used by automation (editable by GM).",
        formula: "1d20",
        replacement: true,
        displayRoll: true,
        results: [
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Stunned.",
                weight: 1,
                range: [1, 3],
                drawn: false,
                flags: {
                    "laundry-rpg": {
                        statusId: "stunned",
                        durationRounds: 1
                    }
                }
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Bleeding. Mark ongoing harm and pressure the target.",
                weight: 1,
                range: [4, 5],
                drawn: false,
                flags: {
                    "laundry-rpg": {
                        statusId: "weakened",
                        durationRounds: 1
                    }
                }
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Incapacitated / Lethal trauma.",
                weight: 1,
                range: [6, 8],
                drawn: false,
                flags: {
                    "laundry-rpg": {
                        statusId: "stunned",
                        durationRounds: 1
                    }
                }
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Catastrophic Injury: immediate removal or death at GM discretion.",
                weight: 1,
                range: [9, 20],
                drawn: false
            }
        ]
    };
}

function _buildDefaultMishapTableData() {
    return {
        name: "Laundry Magic Mishap Table",
        description: "Default computational mishap outcomes used by automation (editable by GM).",
        formula: "1d6",
        replacement: true,
        displayRoll: true,
        results: [
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Arcane Feedback: caster is Stunned.",
                weight: 1,
                range: [1, 2],
                drawn: false,
                flags: {
                    "laundry-rpg": {
                        statusId: "stunned",
                        durationRounds: 1
                    }
                }
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Signal Bleed: nearby electronics glitch, occult signatures spike.",
                weight: 1,
                range: [3, 4],
                drawn: false
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Aetheric Backlash: caster suffers harmful recoil and is Weakened.",
                weight: 1,
                range: [5, 5],
                drawn: false,
                flags: {
                    "laundry-rpg": {
                        statusId: "weakened",
                        durationRounds: 1
                    }
                }
            },
            {
                type: CONST.TABLE_RESULT_TYPES.TEXT,
                text: "Catastrophic Breach: severe anomaly manifests.",
                weight: 1,
                range: [6, 6],
                drawn: false
            }
        ]
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
            moveRemaining: combat?.started ? 1 : 0
        };

    return {
        turnKey,
        actionsRemaining: Math.max(0, Math.trunc(Number(normalized?.actionsRemaining) || 0)),
        moveRemaining: Math.max(0, Math.trunc(Number(normalized?.moveRemaining) || 0))
    };
}

function _collectActorStatuses(actor) {
    const statuses = new Set();
    if (!actor) return statuses;
    for (const effect of actor.effects ?? []) {
        const effectStatuses = _extractEffectStatuses(effect);
        for (const statusId of effectStatuses) {
            if (statusId) statuses.add(String(statusId));
        }
        const legacyStatus = effect.getFlag?.("core", "statusId");
        if (legacyStatus) statuses.add(String(legacyStatus));
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
    refreshDurationIfPresent = true
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

    if (existing) {
        if (refreshDurationIfPresent && resolvedDuration > 0 && combat?.started) {
            await existing.update({
                duration: {
                    rounds: resolvedDuration,
                    startRound: Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0)),
                    startTurn: Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))
                },
                [`flags.laundry-rpg.conditionData`]: {
                    statusId: statusKey,
                    durationRounds: resolvedDuration,
                    source
                }
            });
        }
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
                conditionData: {
                    statusId: statusKey,
                    durationRounds: resolvedDuration,
                    source
                }
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
        turnKey: state.turnKey
    };
}

export async function consumeCombatAction(actor, { amount = 1, warn = true } = {}) {
    const combat = game.combat;
    const combatant = _getActorCombatant(actor, combat);
    if (!combat || !combatant) return true;
    if (combat.combatant?.id !== combatant.id) return true;

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

    const spend = Math.max(1, Math.trunc(Number(amount) || 1));
    const state = _normalizeTurnEconomyState(
        combat,
        combatant.getFlag("laundry-rpg", TURN_ECONOMY_FLAG)
    );

    if (state.moveRemaining < spend) {
        if (warn) ui.notifications.warn("No Move remaining this turn.");
        return false;
    }

    state.moveRemaining -= spend;
    await combatant.setFlag("laundry-rpg", TURN_ECONOMY_FLAG, state);
    return true;
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
