/**
 * The Laundry RPG dice roller.
 *
 * Core mechanics automated here:
 * - DN and Complexity driven tests.
 * - Advantage/Disadvantage as DN shifts.
 * - Focus applied to rolled dice (+1 per point).
 * - Team Luck usage and Luck Tests.
 */
import {
    buildOutcomeFingerprint,
    computeInjuryTrackUpdate
} from "./utils/automation-math.mjs";

const TEAM_LUCK_SETTING = "teamLuck";
const TEAM_LUCK_MAX_SETTING = "teamLuckMax";
const ROLL_EFFECT_DIFFICULTY_PREFIX = "flags.laundry-rpg.modifiers.difficulty.";
const PHYSICAL_EFFECT_ICON = "icons/svg/blood.svg";
const PSYCHOLOGICAL_EFFECT_ICON = "icons/svg/terror.svg";
const SUPPORTED_OUTCOME_STATUS_IDS = new Set([
    "prone",
    "restrained",
    "stunned",
    "blinded",
    "deafened",
    "unconscious",
    "incapacitated",
    "frightened",
    "terrified",
    "bleeding",
    "weakened"
]);
const LOCAL_CRITICAL_TABLES = {
    physical_injuries: [
        {
            roll: "1-2",
            injury: "Arm Wound",
            effect: "You drop an object you're carrying. Until this injury is healed, you increase the Difficulty of all Body (Dexterity) Tests you make by 1."
        },
        {
            roll: "3-4",
            injury: "Leg Wound",
            effect: "You are knocked Prone. Until this injury is healed, you increase the Difficulty of all Body (Athletics) Tests you make by 1."
        },
        {
            roll: "5-8",
            injury: "Head Wound",
            effect: "You are Stunned until the end of your next turn. Until this injury is healed, you increase the Difficulty of all Body (Reflexes) Tests you make by 1."
        },
        {
            roll: "9-10",
            injury: "Internal Injury",
            effect: "You are Incapacitated until the end of your next turn. Until this injury is healed, you increase the Difficulty of all Body (Fortitude and Might) Tests you make by 1."
        },
        {
            roll: "11-12",
            injury: "Broken Arm",
            effect: "You drop an object that you're carrying. Until this injury is healed, you reduce your Melee and Accuracy by one step. Additionally, you increase the Difficulty of all Tests which would require the use of two arms by 1."
        },
        {
            roll: "13-14",
            injury: "Broken Leg",
            effect: "You are knocked Prone. Until this injury is healed, reduce your Speed by 1 step, and increase the Difficulty of all Body (Athletics and Stealth) Tests you make by 1."
        },
        {
            roll: "15-17",
            injury: "Brain Injury",
            effect: "You fall Unconscious until the end of your next turn. Until this injury is healed, you always go last in the turn order, and you increase the Difficulty of all Body Tests you make by 1."
        },
        {
            roll: "18+",
            injury: "Instant Death",
            effect: "You instantly die a gruesome death!"
        }
    ],
    psychological_injuries: [
        {
            roll: "1-2",
            injury: "Shocked",
            effect: "You let out a loud shout, yelp, or scream. Until this Injury is healed, increase the Difficulty of all Mind (Intuition) Tests you make by 1."
        },
        {
            roll: "3-4",
            injury: "Phobia",
            effect: "Until this Injury is healed, you are Frightened of the cause of this Injury."
        },
        {
            roll: "5-8",
            injury: "Confused",
            effect: "You are Stunned until the end of your next turn. Until this Injury is healed, increase the Difficulty of all Mind (Awareness) Tests you make by 1."
        },
        {
            roll: "9-10",
            injury: "Existential Dread",
            effect: "You are Incapacitated until the end of your next turn. Until this Injury is healed, you increase the Difficulty of all Spirit (Resolve) Tests you make by 1."
        },
        {
            roll: "11-12",
            injury: "Reality Denial",
            effect: "You are Blinded and Deafened until the end of your next turn. Until this Injury is healed, you increase the Difficulty of all Spirit (Zeal) and Mind (Magic) Tests by 1."
        },
        {
            roll: "13-14",
            injury: "Traumatised",
            effect: "Until this Injury is healed, you are Terrified of the cause of this Injury."
        },
        {
            roll: "15-17",
            injury: "Hallucinations",
            effect: "You fall Unconscious until the end of your next turn. Until this Injury is healed, you cannot make Extended Tests, and you increase the Difficulty of all Mind and Spirit Tests you make by 1."
        },
        {
            roll: "18+",
            injury: "Broken Mind",
            effect: "Your mind completely crumbles and you are plunged into an unwaking coma."
        }
    ],
    magical_mishaps: [
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
            description: "The caster seems to have gotten away scott free... but a gnawing sensation at the back of their mind warns them that the looming spectre of CASE NIGHTMARE GREEN is creeping ever-closer. Increase Threat by +1."
        },
        {
            roll: "11-12",
            effect: "Dark Future",
            description: "In the interdimensional ether the caster is haunted by dreadful visions of a post-cataclysmic world - along with useful details of a potential future. The caster triggers a successful Prognostication at the spell's Level if they are a Laundry operative. NPCs trigger the Dread effect instead."
        }
    ]
};

export function getWeaponAttackContext({ actor, weapon, linkedSkillName = "" } = {}) {
    const target = _getPrimaryTargetSnapshot();
    const targetActor = _resolveTargetActor(target);
    const isMelee = _isMeleeWeapon({ weapon, linkedSkillName });
    const closeRangeAttack = !isMelee && _isTargetWithinCloseRange(actor, target);
    const hasCloseTrait = /\bclose\b/i.test(String(weapon?.system?.traits ?? ""));
    const attackerStatuses = _collectActorStatuses(actor);
    const targetStatuses = _collectActorStatuses(targetActor);
    const attackerRating = Math.max(
        0,
        Math.trunc(Number(
            isMelee
                ? actor?.system?.derived?.melee?.value
                : actor?.system?.derived?.accuracy?.value
        ) || 0)
    );
    const hasTarget = Boolean(targetActor);
    const baseDefence = hasTarget
        ? Math.max(0, Math.trunc(Number(targetActor?.system?.derived?.defence?.value) || 0))
        : 0;
    let attackerPenalty = 0;
    if (attackerStatuses.has("blinded")) attackerPenalty += 1;
    if (attackerStatuses.has("prone")) attackerPenalty += 1;
    if (attackerStatuses.has("restrained")) attackerPenalty += 1;
    if (closeRangeAttack && !hasCloseTrait) attackerPenalty += 1;

    let defencePenalty = 0;
    if (targetStatuses.has("blinded")) defencePenalty += 1;
    if (targetStatuses.has("stunned")) defencePenalty += 1;
    if (targetStatuses.has("restrained")) defencePenalty += 1;

    const effectiveAttackerRating = Math.max(0, attackerRating - attackerPenalty);
    const defenceRating = Math.max(0, baseDefence - defencePenalty);
    const ladderDelta = hasTarget ? (effectiveAttackerRating - defenceRating) : 0;
    const targetLockedDn = hasTarget && (targetStatuses.has("incapacitated") || targetStatuses.has("unconscious"))
        ? 2
        : null;

    return {
        target,
        isMelee,
        closeRangeAttack,
        hasTarget,
        attackerRating: effectiveAttackerRating,
        defenceRating,
        ladderDelta,
        defencePenalty,
        dn: hasTarget ? (targetLockedDn ?? _mapAttackDnFromDelta(ladderDelta)) : 4
    };
}

export async function rollDice({
    pool = 1,
    flavor = "Dice Roll",
    dn = 4,
    complexity = 1,
    damage,
    damageBonus = 0,
    isWeaponAttack = false,
    difficultyShift = 0,
    actorId,
    focusItemId,
    allowPostRollFocus = true,
    targetSnapshot = null,
    attackMeta = null,
    prompt = true,
    testType = "common",
    difficultyPreset = "standard",
    rollContext = null
} = {}) {
    const baseConfig = {
        pool: Math.max(0, Number(pool) || 0),
        dn: _clampDn(dn),
        complexity: Math.max(1, Number(complexity) || 1),
        shift: _clampShift(difficultyShift),
        testType: testType === "luck" ? "luck" : "common",
        difficultyPreset: difficultyPreset
            ? _normalizeDifficultyPreset(difficultyPreset)
            : _inferDifficultyPreset(_clampDn(dn), Math.max(1, Number(complexity) || 1)),
        preRollLuck: "none"
    };
    const actor = actorId ? game.actors?.get(actorId) : null;
    const normalizedRollContext = _normalizeRollContext({
        rollContext,
        actor,
        focusItemId,
        flavor
    });
    const effectDifficultyPenalty = _getDifficultyPenaltyFromEffects({
        actor,
        rollContext: normalizedRollContext
    });

    const configured = prompt
        ? await _promptRollConfig(baseConfig, {
            complexityPenalty: effectDifficultyPenalty.complexityDelta,
            penaltyNotice: effectDifficultyPenalty.notice
        })
        : baseConfig;

    if (!configured) return null;

    const isLuckTest = configured.testType === "luck";
    const finalPool = isLuckTest
        ? await _getTeamLuck()
        : Math.max(0, Number(configured.pool) || 0);

    if (finalPool <= 0) {
        ui.notifications.warn(isLuckTest
            ? "Team Luck is 0, so a Luck Test cannot be rolled."
            : "Dice pool is 0 for this roll.");
        return null;
    }

    const preRollLuckUsed = !isLuckTest && configured.preRollLuck === "maximize";
    if (preRollLuckUsed) {
        const spent = await _spendTeamLuck(1);
        if (!spent) {
            ui.notifications.warn("Not enough Team Luck to maximise successes.");
            return null;
        }
    }
    const effectComplexityDelta = isLuckTest
        ? 0
        : Math.trunc(Number(effectDifficultyPenalty.complexityDelta) || 0);
    const configuredComplexity = Math.max(1, Math.trunc(Number(configured.complexity) || 1));
    const finalComplexity = isLuckTest
        ? 1
        : Math.max(1, configuredComplexity + effectComplexityDelta);

    return _executeRoll({
        pool: finalPool,
        dn: isLuckTest ? 4 : _clampDn(configured.dn),
        complexity: finalComplexity,
        flavor,
        damage,
        damageBonus: Math.max(0, Math.trunc(Number(damageBonus) || 0)),
        isWeaponAttack,
        shift: isLuckTest ? 0 : _clampShift(configured.shift),
        actorId,
        focusItemId,
        allowPostRollFocus,
        targetSnapshot,
        attackMeta,
        isLuckTest,
        difficultyPreset: configured.difficultyPreset,
        preRollLuckUsed,
        rollContext: normalizedRollContext,
        effectComplexityDelta,
        effectComplexityNotes: Array.isArray(effectDifficultyPenalty.notes)
            ? effectDifficultyPenalty.notes
            : []
    });
}

export function bindDiceChatControls(message, html) {
    html.find(".roll-injury").off("click.laundry-roll-injury").on("click.laundry-roll-injury", async (ev) => {
        ev.preventDefault();
        await _rollInjuryFromButton(ev);
    });

    html.find(".roll-mishap").off("click.laundry-roll-mishap").on("click.laundry-roll-mishap", async (ev) => {
        ev.preventDefault();
        await _rollMishapFromButton(ev);
    });

    html.find(".apply-roll-effect").off("click.laundry-apply-roll-effect").on("click.laundry-apply-roll-effect", async (ev) => {
        ev.preventDefault();
        await _applyOutcomeEffectFromButton(ev);
    });

    const state = _getDiceState(message);
    if (!state) return;
    const focusEnabled = state.allowFocusControls !== false;

    html.find(".laundry-die").off("click.laundry-focus-die").on("click.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest || !focusEnabled) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _updateDiceMessage(message, state);
    });

    html.find(".laundry-die").off("dblclick.laundry-focus-die").on("dblclick.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest || !focusEnabled) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _spendFocus(message, state);
    });

    html.find(".apply-focus").off("click.laundry-focus").on("click.laundry-focus", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest || !focusEnabled) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _spendFocus(message, state);
    });

    html.find(".auto-focus").off("click.laundry-focus-auto").on("click.laundry-focus-auto", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest || !focusEnabled) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        state.selectedDieIndex = _findAutoFocusDie(state);
        await _spendFocus(message, state);
    });

    html.find(".undo-focus").off("click.laundry-focus-undo").on("click.laundry-focus-undo", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest || !focusEnabled) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _undoFocus(message, state);
    });

    html.find(".luck-reroll-failures").off("click.laundry-luck-reroll").on("click.laundry-luck-reroll", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        await _rerollFailuresWithLuck(message, state);
    });

    html.find(".spend-adrenaline-die").off("click.laundry-adrenaline-die").on("click.laundry-adrenaline-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        await _spendAdrenalineDie(message, state);
    });

    html.find(".apply-damage").off("click.laundry-apply-damage").on("click.laundry-apply-damage", async (ev) => {
        ev.preventDefault();
        await _applyDamage(message);
    });

    html.find(".resolve-opposed").off("click.laundry-resolve-opposed").on("click.laundry-resolve-opposed", async (ev) => {
        ev.preventDefault();
        await _resolveOpposedRoll(message);
    });

    if (!_canCurrentUserApplyDamage(state)) {
        html.find(".apply-damage").remove();
    }
}

async function _executeRoll({
    pool,
    dn,
    complexity,
    flavor,
    damage,
    damageBonus,
    isWeaponAttack,
    shift,
    actorId,
    focusItemId,
    allowPostRollFocus,
    targetSnapshot,
    attackMeta,
    isLuckTest,
    difficultyPreset,
    preRollLuckUsed,
    rollContext,
    effectComplexityDelta = 0,
    effectComplexityNotes = []
}) {
    const actor = actorId ? game.actors?.get(actorId) : null;
    const normalizedRollContext = _normalizeRollContext({
        rollContext,
        actor,
        focusItemId,
        flavor
    });
    const target = targetSnapshot || _getPrimaryTargetSnapshot();
    const targetActor = _resolveTargetActor({
        targetTokenId: target?.tokenId ?? null,
        targetActorId: target?.actorId ?? null
    });
    const statusMods = isLuckTest
        ? { shiftDelta: 0, poolDelta: 0, notes: [] }
        : _getStatusRollModifiers({
            actor,
            targetActor,
            rollContext: normalizedRollContext,
            isWeaponAttack
        });
    const statusNotes = [
        ...(Array.isArray(statusMods.notes) ? statusMods.notes : []),
        ...(Array.isArray(effectComplexityNotes) ? effectComplexityNotes : [])
    ]
        .map(note => String(note ?? "").trim())
        .filter(Boolean);
    const uniqueStatusNotes = Array.from(new Set(statusNotes));
    const basePool = Math.max(0, Math.trunc(Number(pool) || 0));
    const adjustedPool = Math.max(1, basePool + Math.trunc(Number(statusMods.poolDelta ?? 0) || 0));
    const baseShift = _clampShift(shift);
    const statusShiftDelta = _clampShift(statusMods.shiftDelta ?? 0);
    const totalShift = isLuckTest ? 0 : _clampShift(baseShift + statusShiftDelta);
    const effectiveDn = Math.max(2, Math.min(6, (dn || 4) + totalShift));

    let roll = null;
    let rawDice = [];

    if (preRollLuckUsed) {
        rawDice = Array.from({ length: adjustedPool }, () => 6);
    } else {
        roll = new Roll(`${adjustedPool}d6`);
        await roll.evaluate();
        rawDice = roll.terms[0].results.map(d => d.result);
    }

    let focusAvailable = 0;
    if (!isLuckTest && actorId && focusItemId) {
        const focusItem = actor?.items?.get(focusItemId);
        focusAvailable = Number(focusItem?.system?.focus ?? 0);
    }
    const adrenalineAvailable = Math.max(
        0,
        Math.trunc(Number(actor?.system?.derived?.adrenaline?.value) || 0)
    );

    const damageData = await _evaluateDamage({
        damage,
        isWeaponAttack,
        actor,
        damageBonus
    });
    const initialComplications = rawDice.filter(value => _clampDie(value) === 1).length;
    const mishapTriggered = Boolean(normalizedRollContext.isMagic && initialComplications > 0);

    const state = {
        pool: adjustedPool,
        basePool,
        dn,
        complexity,
        shift: totalShift,
        baseShift,
        statusShiftDelta,
        statusPoolDelta: Math.trunc(Number(statusMods.poolDelta ?? 0) || 0),
        statusComplexityDelta: Math.trunc(Number(effectComplexityDelta) || 0),
        statusNotes: uniqueStatusNotes,
        difficultyPreset: _normalizeDifficultyPreset(difficultyPreset || _inferDifficultyPreset(dn, complexity)),
        showDifficultyPreset: !isLuckTest && !isWeaponAttack && !normalizedRollContext.isSpell,
        isOpposedTest: _normalizeDifficultyPreset(difficultyPreset || _inferDifficultyPreset(dn, complexity)) === "opposed",
        effectiveDn,
        damage: damageData.formula,
        damageBaseTotal: damageData.baseTotal,
        damageBonus: damageData.bonus,
        damageTotal: damageData.total,
        damageRollResult: damageData.result,
        isWeaponAttack: Boolean(isWeaponAttack),
        targetName: target?.name ?? "",
        targetActorId: target?.actorId ?? null,
        targetTokenId: target?.tokenId ?? null,
        targetActorIds: Array.isArray(target?.actorIds)
            ? target.actorIds.filter(Boolean)
            : (target?.actorId ? [target.actorId] : []),
        targetTokenIds: Array.isArray(target?.tokenIds)
            ? target.tokenIds.filter(Boolean)
            : (target?.tokenId ? [target.tokenId] : []),
        targetNames: Array.isArray(target?.names)
            ? target.names.filter(name => String(name ?? "").trim().length > 0)
            : (target?.name ? [target.name] : []),
        targetCount: target?.count ?? 0,
        rawDice,
        focusAllocations: [],
        focusHistory: [],
        selectedDieIndex: null,
        focusSpent: 0,
        focusAvailable,
        focusRemaining: focusAvailable,
        adrenalineAvailable,
        adrenalineRemaining: adrenalineAvailable,
        adrenalineSpent: 0,
        allowFocusControls: !isLuckTest && allowPostRollFocus !== false,
        actorId: actorId ?? null,
        focusItemId: !isLuckTest ? (focusItemId ?? null) : null,
        attackMeta: attackMeta ?? null,
        rollContext: normalizedRollContext,
        mishap: {
            triggered: mishapTriggered,
            initialComplications
        },
        isLuckTest,
        preRollLuckUsed,
        teamLuck: await _getTeamLuck(),
        teamLuckMax: await _getTeamLuckMax()
    };

    const speaker = actorId
        ? ChatMessage.getSpeaker({ actor: game.actors?.get(actorId) })
        : ChatMessage.getSpeaker();

    const payload = {
        speaker,
        flavor,
        content: _renderDiceContent(state),
        flags: { "laundry-rpg": { diceState: state } },
        sound: CONFIG.sounds.dice
    };
    const payloadRolls = [roll, damageData.roll].filter(Boolean);
    if (payloadRolls.length) payload.rolls = payloadRolls;

    return ChatMessage.create(payload);
}

function _getDiceState(message) {
    return foundry.utils.deepClone(message.getFlag("laundry-rpg", "diceState"));
}

function _buildResults(state) {
    const rawDice = state.rawDice ?? [];
    const allocations = Array.isArray(state.focusAllocations) ? state.focusAllocations : [];
    const effectiveDn = Number(state.effectiveDn ?? state.dn ?? 4);
    return rawDice.map((val, idx) => {
        const rawValue = _clampDie(val);
        const bonus = Number(allocations[idx] ?? 0);
        const adjusted = _clampDie(rawValue + bonus);
        const selected = Number(state.selectedDieIndex) === idx;
        return {
            index: idx,
            value: adjusted,
            rawValue,
            bonus,
            success: adjusted >= effectiveDn,
            critical: rawValue === 6,
            complication: rawValue === 1,
            selected
        };
    });
}

function _renderDiceContent(state) {
    const results = _buildResults(state);
    const outcome = _buildOutcome(state, results);
    const criticals = results.filter(r => r.critical).length;
    const complications = results.filter(r => r.complication).length;

    const shift = Number(state.shift ?? 0);
    const shiftLabel = state.isLuckTest
        ? "Luck Test"
        : (shift === 0
            ? "No Advantage"
            : (shift < 0
                ? (shift === -1 ? "Advantage" : "Greater Advantage")
                : (shift === 1 ? "Disadvantage" : "Greater Disadvantage")));

    const diceHtml = results.map(r => {
        const cls = [
            "roll", "die", "d6", "laundry-die",
            r.success ? "success" : "failure",
            r.critical ? "die-critical" : "",
            r.complication ? "die-complication" : "",
            r.bonus > 0 ? "focus-boosted" : "",
            r.selected ? "focus-selected" : ""
        ].join(" ").trim();
        const valueText = `${r.value}`;
        const marker = r.critical
            ? `<span class="die-marker marker-critical" title="${_escapeHtml(game.i18n.localize("LAUNDRY.NaturalSix"))}">*</span>`
            : (r.complication
                ? `<span class="die-marker marker-complication" title="${_escapeHtml(game.i18n.localize("LAUNDRY.NaturalOne"))}">!</span>`
                : "");
        const title = state.allowFocusControls === false
            ? ""
            : _escapeHtml(game.i18n.localize("LAUNDRY.SelectDieForFocus"));
        return `<li class="${cls}" data-die-index="${r.index}" title="${title}">${valueText}${marker}</li>`;
    }).join("");

    const attackMetaSection = _renderAttackMetaSection(state);
    const targetSection = _renderTargetSection(state);
    const statusSection = _renderStatusModifierSection(state);
    const mishapSection = _renderMishapWarningSection(state, results);
    const damageSection = _renderDamageSection(state);
    const opposedSection = _renderOpposedResolverSection(state);

    const teamLuck = Math.max(0, Number(state.teamLuck ?? 0));
    const teamLuckMax = Math.max(0, Number(state.teamLuckMax ?? 0));

    const focusSection = (state.isLuckTest || state.allowFocusControls === false) ? "" : _renderFocusControls(state);
    const luckSection = _renderLuckControls(state, teamLuck, teamLuckMax);
    const adrenalineSection = _renderAdrenalineControls(state);

    const skillPreset = state.showDifficultyPreset ? _getDifficultyPresetLabel(state.difficultyPreset) : "";
    const presetSuffix = skillPreset ? ` | ${skillPreset}` : "";
    const opposedSuffix = state.isOpposedTest ? " | Opposed: compare successes with the opposing roll" : "";
    const poolSuffix = Number(state.statusPoolDelta ?? 0) !== 0
        ? ` | Pool ${Math.max(0, Number(state.basePool ?? state.pool) || 0)} -> ${Math.max(0, Number(state.pool) || 0)}`
        : "";
    const successSummary = state.isOpposedTest
        ? `(Successes: ${outcome.successes})`
        : `(Successes: ${outcome.successes}/${outcome.complexity})`;
    const formulaBits = state.isLuckTest
        ? `${state.pool}d6 Luck Test (fixed DN 4:1)`
        : `${state.pool}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})${presetSuffix}${opposedSuffix}${poolSuffix}`;

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${formulaBits}</div>
        ${attackMetaSection}
        ${targetSection}
        ${statusSection}
        ${state.preRollLuckUsed ? '<div class="dice-formula">Luck spent: Maximise Successes (all dice treated as 6).</div>' : ''}
        <ol class="dice-rolls">${diceHtml}</ol>
        <div class="dice-roll-summary">
            <span class="crit-summary">${_escapeHtml(game.i18n.localize("LAUNDRY.Criticals"))}: ${criticals}</span>
            <span class="comp-summary">${_escapeHtml(game.i18n.localize("LAUNDRY.Complications"))}: ${complications}</span>
        </div>
        ${mishapSection}
        ${opposedSection}
        ${focusSection}
        ${luckSection}
        ${adrenalineSection}
        <div class="dice-outcome ${outcome.cssClass}">
            <strong>${outcome.label}</strong>
            <span class="success-count">${successSummary}</span>
            ${state.isLuckTest ? "" : `<span class="focus-spent">(Focus used: ${state.focusSpent ?? 0})</span>`}
        </div>
        ${damageSection}
    </div>`;
}

function _renderOpposedResolverSection(state) {
    if (!state?.isOpposedTest) return "";
    const resolution = state.opposedResolution ?? null;
    if (resolution) {
        const own = Math.max(0, Math.trunc(Number(resolution.ownSuccesses) || 0));
        const opp = Math.max(0, Math.trunc(Number(resolution.opponentSuccesses) || 0));
        const label = resolution.result === "win"
            ? "WIN"
            : (resolution.result === "lose" ? "LOSS" : "TIE");
        const opponent = String(resolution.opponentLabel ?? "Opponent");
        return `
            <div class="status-modifier-section">
                <strong>Opposed Resolution:</strong> ${_escapeHtml(label)} (${own} vs ${opp}) against ${_escapeHtml(opponent)}
            </div>`;
    }

    return `
        <div class="laundry-focus-controls">
            <button type="button" class="resolve-opposed spend-focus">Resolve Opposed</button>
            <span class="laundry-focus-meta">Compare this roll against another Opposed roll card.</span>
        </div>`;
}

function _buildOutcome(state, results) {
    const successes = results.filter(r => r.success).length;
    const complexity = Math.max(1, Number(state.complexity ?? 1) || 1);
    const margin = successes - complexity;

    if (state.isOpposedTest) {
        return {
            label: "Opposed Roll",
            cssClass: "outcome-opposed",
            successes,
            complexity
        };
    }

    if (margin < 0) {
        return {
            label: game.i18n.localize("LAUNDRY.Failure"),
            cssClass: "outcome-failure",
            successes,
            complexity
        };
    }

    if (margin === 0) {
        return {
            label: game.i18n.localize("LAUNDRY.MarginalSuccess"),
            cssClass: "outcome-marginal",
            successes,
            complexity
        };
    }

    return {
        label: game.i18n.localize("LAUNDRY.Success"),
        cssClass: "outcome-success",
        successes,
        complexity
    };
}

function _renderAttackMetaSection(state) {
    if (!state.isWeaponAttack) return "";
    const meta = state.attackMeta ?? null;
    if (!meta) return "";

    if (!meta.hasTarget) {
        return `
            <div class="attack-meta-section">
                <div><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Target"))}:</strong> ${_escapeHtml(game.i18n.localize("LAUNDRY.AttackNoTarget"))}</div>
                <div><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.AttackAutoDN"))}:</strong> 4</div>
            </div>`;
    }

    const modeLabel = meta.mode === "melee"
        ? game.i18n.localize("LAUNDRY.AttackModeMelee")
        : game.i18n.localize("LAUNDRY.AttackModeRanged");
    const attackerLabel = meta.mode === "melee"
        ? game.i18n.localize("LAUNDRY.Melee")
        : game.i18n.localize("LAUNDRY.Accuracy");

    const attackerRating = Number(meta.attackerRating);
    const defenceRating = Number(meta.defenceRating);
    const ladderDelta = Math.trunc(Number(meta.ladderDelta ?? 0) || 0);
    const ladderLabel = ladderDelta > 0
        ? game.i18n.format("LAUNDRY.LadderDiffHigher", { steps: ladderDelta })
        : (ladderDelta < 0
            ? game.i18n.format("LAUNDRY.LadderDiffLower", { steps: Math.abs(ladderDelta) })
            : game.i18n.localize("LAUNDRY.LadderDiffEqual"));

    return `
        <div class="attack-meta-section">
            <div><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.AttackMode"))}:</strong> ${_escapeHtml(modeLabel)}</div>
            <div><strong>${_escapeHtml(attackerLabel)}:</strong> ${Math.max(0, Math.trunc(attackerRating || 0))} | <strong>${_escapeHtml(game.i18n.localize("LAUNDRY.TargetDefence"))}:</strong> ${Math.max(0, Math.trunc(defenceRating || 0))}</div>
            <div><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.LadderDifference"))}:</strong> ${_escapeHtml(ladderLabel)} | <strong>${_escapeHtml(game.i18n.localize("LAUNDRY.AttackAutoDN"))}:</strong> ${Math.max(2, Math.min(6, Number(state.dn ?? 4) || 4))}</div>
            ${Number(meta.defencePenalty ?? 0) > 0 ? `<div class="attack-pre-spend">Target Blinded: Defence -${Math.max(0, Math.trunc(Number(meta.defencePenalty) || 0))}</div>` : ""}
            ${meta.focusSpentPreRoll ? `<div class="attack-pre-spend">${_escapeHtml(game.i18n.localize("LAUNDRY.SpendFocusBoost"))}</div>` : ""}
            ${meta.adrenalineSpentPreRoll ? `<div class="attack-pre-spend">${_escapeHtml(game.i18n.localize("LAUNDRY.SpendAdrenalineBoost"))}</div>` : ""}
        </div>`;
}

function _renderTargetSection(state) {
    const targetNames = Array.isArray(state.targetNames) && state.targetNames.length
        ? state.targetNames
        : [state.targetName].filter(Boolean);
    const targetName = String(targetNames[0] ?? "").trim();
    if (!targetName) return "";

    const explicitCount = Math.max(0, Number(state.targetCount ?? 0) || 0);
    const count = Math.max(explicitCount, targetNames.length, 1);
    const label = count > 1 ? `${targetName} (+${count - 1} more)` : targetName;
    return `<div class="target-section"><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Target"))}:</strong> ${_escapeHtml(label)}</div>`;
}

function _renderStatusModifierSection(state) {
    const notes = Array.isArray(state.statusNotes) ? state.statusNotes : [];
    const poolDelta = Math.trunc(Number(state.statusPoolDelta ?? 0) || 0);
    const shiftDelta = Math.trunc(Number(state.statusShiftDelta ?? 0) || 0);
    const complexityDelta = Math.trunc(Number(state.statusComplexityDelta ?? 0) || 0);
    if (!notes.length && poolDelta === 0 && shiftDelta === 0 && complexityDelta === 0) return "";

    const parts = [];
    if (poolDelta !== 0) parts.push(`Pool ${poolDelta > 0 ? "+" : ""}${poolDelta}`);
    if (shiftDelta !== 0) parts.push(`DN Shift ${shiftDelta > 0 ? "+" : ""}${shiftDelta}`);
    if (complexityDelta !== 0) parts.push(`Complexity ${complexityDelta > 0 ? "+" : ""}${complexityDelta}`);
    const compact = parts.length ? ` (${parts.join(", ")})` : "";
    const noteText = notes.map(note => _escapeHtml(note)).join(" | ");

    return `<div class="status-modifier-section"><strong>Status Automation${compact}:</strong> ${noteText}</div>`;
}

function _renderMishapWarningSection(state, results) {
    if (!_isMishapTriggered(state, results)) return "";
    const sourceName = String(state.rollContext?.sourceName ?? "").trim();
    const sourceBits = sourceName ? ` data-source-name="${_escapeHtml(sourceName)}"` : "";
    const actorBits = state.actorId ? ` data-actor-id="${_escapeHtml(state.actorId)}"` : "";
    return `
        <div class="mishap-warning-section">
            <div class="mishap-warning-text"><strong>⚠️ COMPUTATIONAL COMPLICATION / MISHAP TRIGGERED!</strong></div>
            <button type="button" class="roll-mishap spend-focus"${sourceBits}${actorBits}>Roll Mishap</button>
        </div>`;
}

function _renderDamageSection(state) {
    const formula = String(state.damage ?? "").trim();
    const isWeaponAttack = Boolean(state.isWeaponAttack);
    const hasFormula = Boolean(formula);
    const hasSuccessToken = /\bS\b/i.test(formula);

    if (!hasFormula && !isWeaponAttack) return "";

    const escapedFormula = _escapeHtml(formula);
    const total = Number(state.damageTotal);
    const baseTotal = Number(state.damageBaseTotal);
    const bonus = Math.max(0, Math.trunc(Number(state.damageBonus ?? 0) || 0));
    const hasRolledTotal = Number.isFinite(total);
    const hasBaseTotal = Number.isFinite(baseTotal);
    const outcome = _buildOutcome(state, _buildResults(state));
    const successBonus = Math.max(0, Math.trunc(Number(outcome.successes) || 0));
    const totalWithSuccesses = hasRolledTotal
        ? Math.max(0, Math.trunc(total + successBonus))
        : null;

    if (!isWeaponAttack) {
        return `<div class="damage-section"><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Damage"))}:</strong> ${escapedFormula}</div>`;
    }

    const hasTarget = Boolean(String(state.targetName ?? "").trim());
    const hasHit = outcome.successes >= outcome.complexity;
    const buttonDisabled = !hasTarget || !hasFormula || !hasHit;
    const breakdown = !hasFormula
        ? game.i18n.localize("LAUNDRY.NoDamageFormula")
        : (hasSuccessToken
            ? `${escapedFormula} (S = ${successBonus}; resolved on Apply Damage)`
            : (hasRolledTotal
            ? (bonus > 0 && hasBaseTotal
                ? `${escapedFormula} = ${Math.max(0, Math.trunc(baseTotal))} + ${bonus} (${_escapeHtml(game.i18n.localize("LAUNDRY.Adrenaline"))}) + ${successBonus} (Successes) = <strong class="damage-total">${totalWithSuccesses}</strong>`
                : `${escapedFormula} + ${successBonus} (Successes) = <strong class="damage-total">${totalWithSuccesses}</strong>`)
            : `${escapedFormula} (${_escapeHtml(game.i18n.localize("LAUNDRY.DamageNotRollable"))})`));
    const buttonTitle = !hasTarget
        ? game.i18n.localize("LAUNDRY.SelectTargetForDamage")
        : (!hasHit
            ? "Attack did not hit; damage cannot be applied."
            : game.i18n.localize("LAUNDRY.ApplyDamageTooltip"));

    return `
        <div class="damage-section weapon-damage-section">
            <div><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Damage"))}:</strong> ${breakdown}</div>
            <button type="button" class="apply-damage spend-focus" title="${_escapeHtml(buttonTitle)}" ${buttonDisabled ? "disabled" : ""}>${_escapeHtml(game.i18n.localize("LAUNDRY.ApplyDamage"))}</button>
        </div>`;
}

function _renderFocusControls(state) {
    const focusRemaining = Number.isFinite(state.focusRemaining)
        ? Number(state.focusRemaining)
        : Number(state.focusAvailable ?? 0);
    const selectedDieIndex = Number(state.selectedDieIndex);
    const hasSelectedDie = Number.isInteger(selectedDieIndex) && selectedDieIndex >= 0;
    const applyDisabled = !state.focusItemId || focusRemaining <= 0 || !hasSelectedDie;
    const autoCandidate = _findAutoFocusDie(state);
    const autoDisabled = !state.focusItemId || focusRemaining <= 0 || !Number.isInteger(autoCandidate);
    const hasHistory = Array.isArray(state.focusHistory) && state.focusHistory.length > 0;
    const undoDisabled = !state.focusItemId || !hasHistory;
    const selectedDieLabel = Number.isInteger(state.selectedDieIndex)
        ? `Selected die: #${Number(state.selectedDieIndex) + 1}`
        : "Selected die: none";

    return `
        <div class="laundry-focus-controls">
            <button type="button" class="apply-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${applyDisabled ? "disabled" : ""}>Apply Focus</button>
            <button type="button" class="auto-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${autoDisabled ? "disabled" : ""}>Auto Focus</button>
            <button type="button" class="undo-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${undoDisabled ? "disabled" : ""}>Undo</button>
            <span class="laundry-focus-meta">${selectedDieLabel} | Remaining: ${Math.max(0, focusRemaining)} | Spent: ${state.focusSpent ?? 0}</span>
        </div>`;
}

function _renderLuckControls(state, teamLuck, teamLuckMax) {
    const failures = _countFailureDice(state);
    const disabled = state.isLuckTest || teamLuck <= 0 || failures <= 0;
    return `
        <div class="laundry-focus-controls">
            <button type="button" class="luck-reroll-failures spend-focus" ${disabled ? "disabled" : ""}>Reroll Failures (Luck)</button>
            <span class="laundry-focus-meta">Team Luck: ${teamLuck}/${teamLuckMax}${state.isLuckTest ? " | Luck spending disabled on Luck Tests" : ""}</span>
        </div>`;
}

function _renderAdrenalineControls(state) {
    if (state.isLuckTest || !state.actorId) return "";
    const remaining = Math.max(0, Math.trunc(Number(state.adrenalineRemaining ?? state.adrenalineAvailable ?? 0) || 0));
    const spent = Math.max(0, Math.trunc(Number(state.adrenalineSpent ?? 0) || 0));
    const disabled = remaining <= 0;
    return `
        <div class="laundry-focus-controls">
            <button type="button" class="spend-adrenaline-die spend-focus" ${disabled ? "disabled" : ""}>Spend Adrenaline (+1d6)</button>
            <span class="laundry-focus-meta">Adrenaline: ${remaining} | Spent on this roll: ${spent}</span>
        </div>`;
}

async function _spendFocus(message, state) {
    if (!state.actorId || !state.focusItemId) {
        ui.notifications.warn("This roll is not linked to a Focus-capable skill.");
        return;
    }

    const actor = game.actors?.get(state.actorId);
    const focusItem = actor?.items?.get(state.focusItemId);
    if (!focusItem) {
        ui.notifications.warn("Linked Focus item not found on actor.");
        return;
    }

    const current = Number(focusItem.system?.focus ?? 0);
    if (current <= 0) {
        ui.notifications.warn("Character has no Focus left on this skill.");
        return;
    }

    const dieIndex = Number(state.selectedDieIndex);
    const rawDice = Array.isArray(state.rawDice) ? state.rawDice : [];
    if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex >= rawDice.length) {
        ui.notifications.warn("Select a die result before applying Focus.");
        return;
    }

    state.focusAllocations = Array.isArray(state.focusAllocations) ? state.focusAllocations : [];
    state.focusHistory = Array.isArray(state.focusHistory) ? state.focusHistory : [];

    const currentBonus = Number(state.focusAllocations[dieIndex] ?? 0);
    const rawValue = Number(rawDice[dieIndex] ?? 1);
    if (rawValue + currentBonus >= 6) {
        ui.notifications.warn("That die is already at the maximum result.");
        return;
    }

    await focusItem.update({ "system.focus": current - 1 });

    state.focusAllocations[dieIndex] = currentBonus + 1;
    state.focusHistory.push({ dieIndex, previousBonus: currentBonus });
    state.focusSpent = Number(state.focusSpent ?? 0) + 1;
    state.focusAvailable = Number(state.focusAvailable ?? current);
    state.focusRemaining = Math.max(0, current - 1);

    await _refreshLuckSnapshot(state);
    await _updateDiceMessage(message, state);
}

async function _undoFocus(message, state) {
    if (!state.actorId || !state.focusItemId) {
        ui.notifications.warn("This roll is not linked to a Focus-capable skill.");
        return;
    }

    state.focusHistory = Array.isArray(state.focusHistory) ? state.focusHistory : [];
    const last = state.focusHistory.pop();
    if (!last) return;

    const actor = game.actors?.get(state.actorId);
    const focusItem = actor?.items?.get(state.focusItemId);
    if (!focusItem) {
        ui.notifications.warn("Linked Focus item not found on actor.");
        return;
    }

    state.focusAllocations = Array.isArray(state.focusAllocations) ? state.focusAllocations : [];
    state.focusAllocations[last.dieIndex] = Number(last.previousBonus ?? 0);
    if (state.focusAllocations[last.dieIndex] <= 0) state.focusAllocations[last.dieIndex] = 0;

    const current = Number(focusItem.system?.focus ?? 0);
    await focusItem.update({ "system.focus": current + 1 });

    state.focusSpent = Math.max(0, Number(state.focusSpent ?? 0) - 1);
    state.focusAvailable = Math.max(Number(state.focusAvailable ?? 0), current + 1);
    state.focusRemaining = Math.max(0, Number(state.focusRemaining ?? current) + 1);

    await _refreshLuckSnapshot(state);
    await _updateDiceMessage(message, state);
}

async function _rerollFailuresWithLuck(message, state) {
    if (state.isLuckTest) {
        ui.notifications.warn("Luck cannot be spent on a Luck Test.");
        return;
    }

    const failures = _buildResults(state).filter(r => !r.success);
    if (!failures.length) {
        ui.notifications.info("No failed dice to reroll.");
        return;
    }

    const spent = await _spendTeamLuck(1);
    if (!spent) {
        ui.notifications.warn("Not enough Team Luck to reroll failures.");
        return;
    }

    const reroll = new Roll(`${failures.length}d6`);
    await reroll.evaluate();
    const fresh = reroll.terms[0].results.map(r => Number(r.result ?? 1));

    state.rawDice = Array.isArray(state.rawDice) ? state.rawDice : [];
    failures.forEach((die, idx) => {
        state.rawDice[die.index] = fresh[idx] ?? state.rawDice[die.index];
    });

    await _refreshLuckSnapshot(state);
    await _updateDiceMessage(message, state);
}

async function _spendAdrenalineDie(message, state) {
    const actor = state.actorId ? game.actors?.get(state.actorId) : null;
    if (!actor) {
        ui.notifications.warn("Roll is not linked to an actor.");
        return;
    }

    const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
    if (current <= 0) {
        ui.notifications.warn("No Adrenaline remaining.");
        return;
    }

    await actor.update({ "system.derived.adrenaline.value": current - 1 });

    const bonusRoll = new Roll("1d6");
    await bonusRoll.evaluate();
    const bonusDie = _clampDie(Number(bonusRoll.total ?? 1));

    state.rawDice = Array.isArray(state.rawDice) ? state.rawDice : [];
    state.rawDice.push(bonusDie);
    state.pool = Math.max(1, Math.trunc(Number(state.pool) || 0) + 1);
    state.adrenalineSpent = Math.max(0, Math.trunc(Number(state.adrenalineSpent ?? 0) || 0) + 1);
    state.adrenalineRemaining = Math.max(0, current - 1);

    await _refreshLuckSnapshot(state);
    await _updateDiceMessage(message, state);
}

async function _updateDiceMessage(message, state) {
    await message.update({
        content: _renderDiceContent(state),
        flags: { "laundry-rpg": { diceState: state } }
    });
}

async function _resolveOpposedRoll(message) {
    if (!message?.id) return;
    if (!message.isOwner && !game.user?.isGM) {
        ui.notifications.warn("Only the roll owner or GM can resolve opposed tests.");
        return;
    }

    const ownState = _getDiceState(message);
    if (!ownState?.isOpposedTest) return;
    if (ownState?.opposedResolution) {
        ui.notifications.info("This opposed roll has already been resolved.");
        return;
    }

    const candidates = game.messages.contents
        .filter(entry => entry.id !== message.id)
        .map(entry => ({
            message: entry,
            state: _getDiceState(entry)
        }))
        .filter(entry => entry.state?.isOpposedTest)
        .filter(entry => !entry.state?.opposedResolution);

    if (!candidates.length) {
        ui.notifications.warn("No unresolved opposed roll cards found.");
        return;
    }

    const selectedMessageId = await _promptOpposedSelection(message, candidates);
    if (!selectedMessageId) return;

    const opponentMessage = game.messages.get(selectedMessageId);
    const opponentState = opponentMessage ? _getDiceState(opponentMessage) : null;
    if (!opponentMessage || !opponentState?.isOpposedTest) {
        ui.notifications.warn("Selected opposed roll is no longer available.");
        return;
    }
    if (opponentState?.opposedResolution) {
        ui.notifications.warn("Selected opposed roll was already resolved.");
        return;
    }

    const ownSuccesses = _buildOutcome(ownState, _buildResults(ownState)).successes;
    const opponentSuccesses = _buildOutcome(opponentState, _buildResults(opponentState)).successes;
    const ownResult = ownSuccesses > opponentSuccesses
        ? "win"
        : (ownSuccesses < opponentSuccesses ? "lose" : "tie");
    const opponentResult = ownResult === "win"
        ? "lose"
        : (ownResult === "lose" ? "win" : "tie");
    const ownSpeaker = String(message.speaker?.alias ?? "Opponent");
    const opponentSpeaker = String(opponentMessage.speaker?.alias ?? "Opponent");

    ownState.opposedResolution = {
        opponentMessageId: opponentMessage.id,
        opponentLabel: opponentSpeaker,
        ownSuccesses,
        opponentSuccesses,
        result: ownResult,
        resolvedAt: Date.now()
    };
    opponentState.opposedResolution = {
        opponentMessageId: message.id,
        opponentLabel: ownSpeaker,
        ownSuccesses: opponentSuccesses,
        opponentSuccesses: ownSuccesses,
        result: opponentResult,
        resolvedAt: Date.now()
    };

    await _updateDiceMessage(message, ownState);
    await _updateDiceMessage(opponentMessage, opponentState);
}

async function _promptOpposedSelection(message, candidates) {
    return new Promise(resolve => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const optionsHtml = candidates.map(entry => {
            const state = entry.state;
            const opponentSuccesses = _buildOutcome(state, _buildResults(state)).successes;
            const alias = String(entry.message.speaker?.alias ?? "Actor");
            const flavor = String(entry.message.flavor ?? "").trim();
            const label = flavor
                ? `${alias} — ${flavor} (${opponentSuccesses} successes)`
                : `${alias} (${opponentSuccesses} successes)`;
            return `<option value="${entry.message.id}">${_escapeHtml(label)}</option>`;
        }).join("");

        const content = `
            <form class="laundry-opposed-resolver">
                <div class="form-group">
                    <label>Resolve against:</label>
                    <select name="opponentMessageId">${optionsHtml}</select>
                </div>
            </form>`;

        new Dialog({
            title: "Resolve Opposed Test",
            content,
            classes: ["laundry-rpg", "laundry-dialog"],
            buttons: {
                resolve: {
                    label: "Resolve",
                    callback: (html) => {
                        const selected = String(
                            html[0]?.querySelector('[name="opponentMessageId"]')?.value ?? ""
                        ).trim();
                        finish(selected || null);
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => finish(null)
                }
            },
            default: "resolve",
            close: () => finish(null)
        }).render(true);
    });
}

async function _applyDamage(message) {
    const state = _getDiceState(message);
    if (!state?.isWeaponAttack) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NotWeaponAttackCard"));
        return;
    }

    const allTargets = _resolveTargetActors(state);
    if (!allTargets.length) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NoAttackTargetCaptured"));
        return;
    }

    const canApply = _canCurrentUserApplyDamage(state);
    if (!canApply) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.CannotApplyDamage"));
        return;
    }

    const results = _buildResults(state);
    const outcome = _buildOutcome(state, results);
    if (outcome.successes < outcome.complexity) {
        ui.notifications.warn("Attack missed (insufficient successes). No damage applied.");
        return;
    }

    const resolvedDamage = await _resolveAttackDamageTotal({ state, outcome });
    if (!Number.isFinite(resolvedDamage)) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.DamageNotRollable"));
        return;
    }

    const rolledDamage = Math.max(0, Math.trunc(Number(resolvedDamage) || 0));
    const traits = _extractWeaponTraits(state);
    const attackMeta = state.attackMeta ?? {};
    const isAreaAttack = Boolean(traits.area || attackMeta.areaMode);
    const templateTargets = isAreaAttack ? _resolveTemplateActors(state) : [];
    const targets = isAreaAttack
        ? (templateTargets.length ? templateTargets : allTargets)
        : [allTargets[0]];
    const criticals = results.filter(result => result.rawValue === 6).length;
    const summaries = [];
    const armourIgnored = (traits.piercing ? criticals : 0) + (traits.penetrating ? 1 : 0);
    const attackSuccesses = Math.max(0, Math.trunc(Number(outcome.successes) || 0));
    const primaryDefence = Math.max(0, Math.trunc(Number(targets[0]?.system?.derived?.defence?.value ?? 0) || 0));

    for (const [index, targetActor] of targets.entries()) {
        if (!targetActor) continue;
        const isNpc = targetActor.type === "npc";
        const npcData = isNpc ? (targetActor.system?.npc ?? {}) : {};
        const npcClass = String(npcData.class ?? "elite").trim().toLowerCase();
        const npcFastDamage = Boolean(npcData.fastDamage ?? true);
        const npcTrackInjuries = Boolean(npcData.trackInjuries ?? false);
        const npcMobSize = Math.max(1, Math.trunc(Number(npcData.mobSize) || 1));
        const targetDamage = traits.spread && index > 0
            ? Math.floor(rolledDamage / 2)
            : rolledDamage;
        let spreadEvaded = false;
        if (traits.spread && index > 0 && targetDamage > 0) {
            const targetDefence = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.defence?.value ?? 0) || 0));
            if (targetDefence > primaryDefence) {
                spreadEvaded = await _attemptSpreadEvasion({
                    targetActor,
                    attackSuccesses
                });
            }
        }

        const armour = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.armour?.value ?? 0)));
        const adjustedArmour = traits.ineffective ? armour * 2 : armour;
        const effectiveArmour = Math.max(0, adjustedArmour - armourIgnored);
        let appliedDamage = spreadEvaded
            ? 0
            : Math.max(0, targetDamage - effectiveArmour);
        let adrenalineReduced = false;
        let nextAdrenaline = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.adrenaline?.value ?? 0)));

        const canAdrenalineReact = appliedDamage > 0 && nextAdrenaline > 0 && (!isNpc || !npcFastDamage);
        if (canAdrenalineReact) {
            const spendAdrenaline = await Dialog.confirm({
                title: "Adrenaline Reaction",
                content: `<p><strong>${_escapeHtml(targetActor.name ?? "Agent")}</strong> can spend 1 Adrenaline to halve incoming damage.</p>`,
                classes: ["laundry-rpg", "laundry-dialog"]
            });
            if (spendAdrenaline) {
                nextAdrenaline = Math.max(0, nextAdrenaline - 1);
                appliedDamage = Math.floor(appliedDamage / 2);
                adrenalineReduced = true;
            }
        }

        const currentToughness = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.toughness?.value ?? 0)));
        const maxToughness = Math.max(
            currentToughness,
            Math.trunc(Number(targetActor.system?.derived?.toughness?.max ?? currentToughness))
        );
        let newToughness = Math.max(0, currentToughness - appliedDamage);
        let newDamageTaken = Math.max(0, maxToughness - newToughness);
        const injuryDamage = currentToughness > 0
            ? Math.max(0, appliedDamage - currentToughness)
            : Math.max(0, appliedDamage);
        let casualties = 0;
        let mobRemaining = npcMobSize;
        let npcDefeated = false;

        if (isNpc && appliedDamage > 0 && npcMobSize > 1 && (npcFastDamage || npcClass === "minion")) {
            const perBody = Math.max(1, currentToughness || maxToughness || 1);
            casualties = Math.min(
                npcMobSize,
                Math.max(1, Math.ceil(appliedDamage / perBody))
            );
            mobRemaining = Math.max(0, npcMobSize - casualties);
            if (mobRemaining <= 0) {
                npcDefeated = true;
            } else {
                // Fast-mode mob tracking: remove casualties and keep remaining unit at full track.
                newToughness = maxToughness;
                newDamageTaken = 0;
            }
        }

        if (isNpc && appliedDamage > 0 && npcMobSize <= 1 && (npcFastDamage || npcClass === "minion")) {
            npcDefeated = true;
        }

        if (isNpc && newToughness <= 0 && (npcFastDamage || npcClass === "minion" || !npcTrackInjuries)) {
            npcDefeated = true;
        }

        if (npcDefeated) {
            newToughness = 0;
            newDamageTaken = Math.max(0, maxToughness);
            mobRemaining = Math.max(1, mobRemaining);
        }

        const updateData = {
            "system.derived.toughness.value": newToughness,
            "system.derived.toughness.damage": newDamageTaken
        };
        if (adrenalineReduced) {
            updateData["system.derived.adrenaline.value"] = nextAdrenaline;
        }
        if (isNpc) {
            updateData["system.npc.defeated"] = npcDefeated;
            updateData["system.npc.mobSize"] = Math.max(1, mobRemaining);
        }
        await targetActor.update(updateData);

        if (traits.stunning && !spreadEvaded && criticals > 0 && (!isNpc || !npcDefeated)) {
            await _applyConditionToActor(targetActor, "stunned", { durationRounds: 1, source: "weapon-stunning" });
        }
        if (traits.restraining && !spreadEvaded && appliedDamage > 0 && (!isNpc || !npcDefeated)) {
            await _applyConditionToActor(targetActor, "restrained", { durationRounds: 0, source: "weapon-restraining" });
        }
        if ((traits.suppressive || attackMeta.suppressiveMode) && (!isNpc || !npcDefeated)) {
            await _applyConditionToActor(targetActor, "weakened", { durationRounds: 1, source: "weapon-suppressive" });
        }

        summaries.push({
            name: targetActor.name,
            rolled: targetDamage,
            armour: effectiveArmour,
            applied: appliedDamage,
            from: currentToughness,
            to: newToughness,
            adrenalineReduced,
            isNpc,
            mobBefore: npcMobSize,
            mobAfter: Math.max(1, mobRemaining),
            casualties,
            defeated: npcDefeated,
            evadedSpread: spreadEvaded
        });

        if (injuryDamage > 0) {
            if (isNpc && (npcFastDamage || !npcTrackInjuries)) {
                await _postDeathNotice({
                    targetActor,
                    damageTaken: injuryDamage,
                    appliedDamage
                });
            } else {
                const severity = _resolveInjurySeverity({
                    injuryDamage,
                    brutal: traits.brutal,
                    forceMinor: traits.ineffective
                });
                await _postCriticalWoundPrompt({
                    targetActor,
                    injuryDamage,
                    injuryType: "physical",
                    severity
                });
            }
        }
    }

    if (!summaries.length) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NoAttackTargetCaptured"));
        return;
    }

    if (summaries.length === 1) {
        const summary = summaries[0];
        const baseSummary = game.i18n.format("LAUNDRY.DamageApplied", {
            name: summary.name,
            rolled: summary.rolled,
            armour: summary.armour,
            applied: summary.applied,
            from: summary.from,
            to: summary.to
        });
        const mobSummary = summary.isNpc && summary.mobBefore > 1
            ? ` | Mob ${summary.mobBefore} -> ${summary.mobAfter}`
            : "";
        const evadeSummary = summary.evadedSpread ? " | EVADED SPREAD" : "";
        const defeatedSummary = summary.defeated ? " | DEFEATED" : "";
        ui.notifications.info(`${baseSummary}${mobSummary}${evadeSummary}${defeatedSummary}`);
    } else {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            content: `<p><strong>Area Damage Applied:</strong> ${summaries.map(summary =>
                `${_escapeHtml(summary.name)} (${summary.from} -> ${summary.to}, -${summary.applied})`
                + `${summary.isNpc && summary.mobBefore > 1 ? ` [Mob ${summary.mobBefore} -> ${summary.mobAfter}]` : ""}`
                + `${summary.evadedSpread ? " [EVADED]" : ""}`
                + `${summary.defeated ? " [DEFEATED]" : ""}`
            ).join(" | ")}</p>`
        });
    }

    if (armourIgnored > 0) {
        ui.notifications.info(`Armour ignored: ${armourIgnored} (${traits.penetrating ? "Penetrating + " : ""}${traits.piercing ? `${criticals} Piercing critical(s)` : "no Piercing criticals"}).`);
    }
}

async function _resolveAttackDamageTotal({ state, outcome } = {}) {
    const formula = String(state?.damage ?? "").trim();
    const successes = Math.max(0, Math.trunc(Number(outcome?.successes) || 0));
    const hasSuccessToken = /\bS\b/i.test(formula);
    const rolledTotal = Number(state?.damageTotal);

    if (hasSuccessToken) {
        const expression = formula.replace(/\bS\b/gi, String(successes));
        try {
            const roll = new Roll(expression);
            await roll.evaluate();
            const total = Number(roll.total);
            return Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : null;
        } catch (_err) {
            const fallback = Number(expression);
            if (Number.isFinite(fallback)) return Math.max(0, Math.trunc(fallback));
            return null;
        }
    }

    if (Number.isFinite(rolledTotal)) {
        return Math.max(0, Math.trunc(rolledTotal + successes));
    }

    const numeric = Number(formula);
    if (Number.isFinite(numeric)) {
        return Math.max(0, Math.trunc(numeric + successes));
    }

    return null;
}

function _resolveInjurySeverity({ injuryDamage = 0, brutal = false, forceMinor = false } = {}) {
    if (forceMinor) {
        return { tier: "minor", diceCount: 1, trackSpaces: 1 };
    }
    const amount = Math.max(0, Math.trunc(Number(injuryDamage) || 0));
    let tier = "minor";
    if (amount >= 5) tier = "deadly";
    else if (amount >= 2) tier = "serious";

    if (brutal && tier === "minor") tier = "serious";

    if (tier === "deadly") return { tier, diceCount: 3, trackSpaces: 3 };
    if (tier === "serious") return { tier, diceCount: 2, trackSpaces: 2 };
    return { tier, diceCount: 1, trackSpaces: 1 };
}

async function _attemptSpreadEvasion({ targetActor, attackSuccesses = 0 } = {}) {
    if (!targetActor) return false;
    const safeAttackSuccesses = Math.max(0, Math.trunc(Number(attackSuccesses) || 0));
    if (safeAttackSuccesses <= 0) return false;

    const pool = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.defence?.value ?? 0) || 0));
    if (pool <= 0) return false;

    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();
    const values = Array.isArray(roll.terms?.[0]?.results)
        ? roll.terms[0].results.map(result => _clampDie(Number(result?.result ?? 1)))
        : [];
    const successes = values.filter(value => value >= 4).length;
    return successes >= safeAttackSuccesses;
}

function _resolveTargetActor(state) {
    const tokenId = state?.targetTokenId ?? state?.tokenId;
    const tokenActor = tokenId ? canvas.tokens?.get(tokenId)?.actor : null;
    if (tokenActor) return tokenActor;

    const actorId = state?.targetActorId ?? state?.actorId;
    if (!actorId) return null;
    return game.actors?.get(actorId) ?? null;
}

function _resolveTargetActors(state) {
    const fromTokens = Array.isArray(state?.targetTokenIds)
        ? state.targetTokenIds
            .map(id => canvas.tokens?.get(id)?.actor ?? null)
            .filter(Boolean)
        : [];
    if (fromTokens.length) return _dedupeActors(fromTokens);

    const fromActors = Array.isArray(state?.targetActorIds)
        ? state.targetActorIds
            .map(id => game.actors?.get(id) ?? null)
            .filter(Boolean)
        : [];
    if (fromActors.length) return _dedupeActors(fromActors);

    const single = _resolveTargetActor({
        targetTokenId: state?.targetTokenId ?? null,
        targetActorId: state?.targetActorId ?? null
    });
    return single ? [single] : [];
}

function _resolveTemplateActors(state) {
    const templateId = String(state?.attackMeta?.areaTemplateId ?? "").trim();
    const templateSceneId = String(state?.attackMeta?.areaTemplateSceneId ?? "").trim();
    if (!templateId) return [];
    if (!canvas?.scene || (templateSceneId && canvas.scene.id !== templateSceneId)) return [];

    const templateDoc = canvas.scene.templates?.get(templateId) ?? null;
    if (!templateDoc) return [];
    const templateObject = canvas.templates?.get(templateId)
        ?? canvas.templates?.placeables?.find(entry => entry.id === templateId)
        ?? null;

    const actors = [];
    for (const token of canvas.tokens?.placeables ?? []) {
        const actor = token?.actor ?? null;
        if (!actor || token.document?.hidden) continue;
        if (_tokenInsideTemplate(token, templateDoc, templateObject)) {
            actors.push(actor);
        }
    }
    return _dedupeActors(actors);
}

function _tokenInsideTemplate(token, templateDoc, templateObject) {
    const center = token?.center ?? null;
    if (!center) return false;

    const shape = templateObject?.shape ?? null;
    if (shape?.contains) {
        const localX = center.x - Number(templateDoc?.x ?? templateObject?.x ?? 0);
        const localY = center.y - Number(templateDoc?.y ?? templateObject?.y ?? 0);
        return Boolean(shape.contains(localX, localY));
    }

    const gridDistance = Number(canvas?.scene?.grid?.distance) || 1;
    const gridSize = Number(canvas?.scene?.grid?.size) || 100;
    const radiusPixels = (Math.max(0, Number(templateDoc?.distance) || 0) / gridDistance) * gridSize;
    const dx = center.x - Number(templateDoc?.x ?? 0);
    const dy = center.y - Number(templateDoc?.y ?? 0);
    return (dx * dx + dy * dy) <= (radiusPixels * radiusPixels);
}

function _canCurrentUserApplyDamage(state) {
    if (game.user?.isGM) return true;
    const targets = _resolveTargetActors(state);
    if (!targets.length) return false;
    return targets.every(actor => actor?.isOwner);
}

function _extractWeaponTraits(state) {
    const rawTraits = String(state?.attackMeta?.weaponTraits ?? "").trim().toLowerCase();
    const tokens = rawTraits
        .split(/[,\n;]+/g)
        .map(entry => entry.trim())
        .filter(Boolean);
    const asBlob = tokens.join(" ");
    const has = (label) => tokens.includes(label) || new RegExp(`\\b${label}\\b`).test(asBlob);
    return {
        piercing: has("piercing"),
        penetrating: has("penetrating"),
        crushing: has("crushing"),
        stunning: has("stunning") || has("stun"),
        restraining: has("restraining") || has("restrained"),
        ineffective: has("ineffective"),
        brutal: has("brutal") || has("devastating"),
        rend: has("rend"),
        spread: has("spread"),
        blast: has("blast"),
        burst: has("burst"),
        automatic: has("automatic") || has("auto"),
        suppressive: has("suppressive"),
        area: has("area") || has("blast") || has("spread"),
        reload: has("reload")
    };
}

function _dedupeActors(actors = []) {
    const map = new Map();
    for (const actor of actors) {
        if (!actor?.id || map.has(actor.id)) continue;
        map.set(actor.id, actor);
    }
    return Array.from(map.values());
}

async function _applyConditionToActor(actor, statusId, { durationRounds = 0, source = "automation" } = {}) {
    if (!actor || !statusId) return;

    if (game.laundry?.applyCondition) {
        await game.laundry.applyCondition(actor, statusId, {
            durationRounds,
            source,
            suppressChat: true
        });
        return;
    }

    const config = (CONFIG.statusEffects ?? []).find(entry => entry.id === statusId);
    const combat = game.combat;
    const effectData = {
        name: config?.name ?? statusId,
        img: config?.img ?? "icons/svg/daze.svg",
        statuses: [statusId],
        disabled: false,
        origin: actor.uuid,
        flags: {
            core: { statusId },
            "laundry-rpg": {
                conditionData: {
                    statusId,
                    durationRounds: Math.max(0, Math.trunc(Number(durationRounds) || 0)),
                    source
                }
            }
        }
    };
    if (combat?.started && durationRounds > 0) {
        effectData.duration = {
            rounds: Math.max(0, Math.trunc(Number(durationRounds) || 0)),
            startRound: Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0)),
            startTurn: Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))
        };
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

function _findAutoFocusDie(state) {
    const results = _buildResults(state);
    if (!results.length) return null;

    const effectiveDn = Number(state.effectiveDn ?? state.dn ?? 4);
    const fixableFailures = results
        .filter(r => r.value < effectiveDn && r.value < 6)
        .sort((a, b) => b.value - a.value);
    if (fixableFailures.length) return fixableFailures[0].index;

    const anyUpgradable = results
        .filter(r => r.value < 6)
        .sort((a, b) => b.value - a.value);
    return anyUpgradable.length ? anyUpgradable[0].index : null;
}

function _countFailureDice(state) {
    return _buildResults(state).filter(r => !r.success).length;
}

function _normalizeDifficultyPreset(value) {
    const preset = String(value ?? "").trim().toLowerCase();
    if (["standard", "hard", "daunting", "opposed"].includes(preset)) return preset;
    return "standard";
}

function _getDifficultyPresetData(preset) {
    switch (_normalizeDifficultyPreset(preset)) {
        case "hard":
            return { dn: 4, complexity: 2, label: "Hard (DN 4, Comp 2)" };
        case "daunting":
            return { dn: 4, complexity: 3, label: "Daunting (DN 4, Comp 3)" };
        case "opposed":
            return { dn: 4, complexity: 1, label: "Opposed (DN 4, Comp 1)" };
        default:
            return { dn: 4, complexity: 1, label: "Standard (DN 4, Comp 1)" };
    }
}

function _getDifficultyPresetLabel(preset) {
    return _getDifficultyPresetData(preset).label;
}

function _inferDifficultyPreset(dn, complexity) {
    const safeDn = _clampDn(dn);
    const safeComplexity = Math.max(1, Math.trunc(Number(complexity) || 1));
    if (safeDn !== 4) return "standard";
    if (safeComplexity >= 3) return "daunting";
    if (safeComplexity === 2) return "hard";
    return "standard";
}

function _collectActorStatuses(actor) {
    const statuses = new Set();
    if (!actor) return statuses;
    for (const effect of actor.effects ?? []) {
        const effectStatuses = effect?.statuses instanceof Set
            ? Array.from(effect.statuses)
            : Array.isArray(effect?.statuses) ? effect.statuses : [];
        for (const statusId of effectStatuses) {
            if (statusId) statuses.add(String(statusId).trim().toLowerCase());
        }
        const legacyStatus = effect.getFlag?.("core", "statusId");
        if (legacyStatus) statuses.add(String(legacyStatus).trim().toLowerCase());
    }
    return statuses;
}

function _actorHasStatus(actor, statusId) {
    if (!actor || !statusId) return false;
    return _collectActorStatuses(actor).has(String(statusId));
}

function _getStatusRollModifiers({ actor, targetActor, rollContext, isWeaponAttack }) {
    const own = _collectActorStatuses(actor);
    const target = _collectActorStatuses(targetActor);
    const notes = [];
    let shiftDelta = 0;
    let poolDelta = 0;

    const sourceType = String(rollContext?.sourceType ?? "").toLowerCase();
    const sourceName = String(rollContext?.sourceName ?? "").toLowerCase();
    const skillName = String(rollContext?.skillName ?? sourceName).toLowerCase();
    const attackMode = String(rollContext?.attackMode ?? "").toLowerCase();
    const isAwarenessRoll = sourceType === "skill" && skillName === "awareness";
    const isVisionRoll = isWeaponAttack || ["awareness", "ranged", "reflexes", "stealth", "close combat"].includes(skillName);
    const distanceMeta = _getActorDistanceMeta(actor, targetActor);

    if (own.has("weakened")) {
        poolDelta -= 1;
        notes.push("Weakened: dice pool -1 on all Tests.");
    }

    if (own.has("frightened")) {
        poolDelta -= 1;
        notes.push("Frightened: dice pool -1 on all Tests.");
    }

    if (own.has("terrified")) {
        poolDelta -= 2;
        notes.push("Terrified: dice pool -2 on all Tests.");
    }

    if (own.has("blinded")) {
        if (isVisionRoll) {
            poolDelta -= 1;
            notes.push("Blinded: reduced effectiveness on sight-dependent checks.");
        }
        if (isAwarenessRoll) {
            shiftDelta += 2;
            notes.push("Blinded: Mind (Awareness) tests relying on sight are +2 Difficulty.");
        }
    }

    if (own.has("deafened") && isAwarenessRoll) {
        shiftDelta += 2;
        notes.push("Deafened: Mind (Awareness) tests relying on hearing are +2 Difficulty.");
    }

    if (own.has("prone") && isWeaponAttack) {
        poolDelta -= 1;
        notes.push("Prone: attacker Melee/Accuracy reduced one step.");
    }

    if (own.has("restrained") && isWeaponAttack) {
        poolDelta -= 1;
        notes.push("Restrained: attacker Melee/Accuracy reduced one step.");
    }

    if (isWeaponAttack && target.has("prone")) {
        const treatAsClose = distanceMeta.available
            ? distanceMeta.isClose
            : attackMode === "melee";
        if (treatAsClose) {
            poolDelta += 1;
            notes.push("Target Prone: attacks from Close Range gain one step.");
        } else {
            const penaltySteps = Math.max(1, Math.trunc(Number(distanceMeta.outsideCloseZones) || 1));
            poolDelta -= penaltySteps;
            const penaltyLabel = penaltySteps === 1
                ? "1 step penalty"
                : `${penaltySteps} step penalties`;
            notes.push(`Target Prone: ranged attacks outside Close Range suffer ${penaltyLabel}.`);
        }
    }

    return { shiftDelta, poolDelta, notes };
}

function _isMishapTriggered(state, results = null) {
    if (state?.isLuckTest) return false;
    if (!state?.rollContext?.isMagic) return false;
    if (state?.mishap?.triggered === true) return true;
    const evaluated = Array.isArray(results) ? results : _buildResults(state);
    return evaluated.some(result => result.complication);
}

function _normalizeRollContext({ rollContext, actor, focusItemId, flavor }) {
    const sourceTypeRaw = String(rollContext?.sourceType ?? "").trim().toLowerCase();
    const sourceName = String(rollContext?.sourceName ?? "").trim();
    const sourceAttribute = String(rollContext?.attribute ?? "").trim().toLowerCase();
    const sourceSkillName = String(rollContext?.skillName ?? "").trim();
    const attackMode = String(rollContext?.attackMode ?? "").trim().toLowerCase();
    let isSpell = Boolean(rollContext?.isSpell || sourceTypeRaw === "spell");
    let isMagic = Boolean(rollContext?.isMagic || isSpell);

    const focusItem = actor && focusItemId ? actor.items?.get(focusItemId) : null;
    const focusItemName = String(focusItem?.name ?? "").trim();
    const focusItemIsMagicSkill = focusItem?.type === "skill"
        && focusItemName.toLowerCase() === "magic";
    if (!isMagic && focusItemIsMagicSkill) isMagic = true;
    if (!isMagic && sourceName.toLowerCase() === "magic") isMagic = true;
    if (!isMagic && /\bmagic\b/i.test(String(flavor ?? ""))) isMagic = true;
    if (!isSpell && sourceTypeRaw === "spell") isSpell = true;

    return {
        sourceType: sourceTypeRaw || (isSpell ? "spell" : null),
        sourceName: sourceName || focusItemName || "",
        attribute: sourceAttribute || "",
        skillName: sourceSkillName || sourceName || focusItemName || "",
        attackMode: attackMode || "",
        isSpell,
        isMagic
    };
}

async function _postCriticalWoundPrompt({
    targetActor,
    injuryDamage = 0,
    injuryType = "physical",
    severity = null
} = {}) {
    if (!targetActor) return;
    const safeName = _escapeHtml(targetActor.name ?? "Unknown");
    const safeInjuryDamage = Math.max(0, Math.trunc(Number(injuryDamage) || 0));
    const resolvedSeverity = severity && typeof severity === "object"
        ? severity
        : _resolveInjurySeverity({ injuryDamage: safeInjuryDamage, brutal: false });
    const diceCount = Math.max(1, Math.trunc(Number(resolvedSeverity?.diceCount) || 1));
    const trackSpaces = Math.max(1, Math.trunc(Number(resolvedSeverity?.trackSpaces) || 1));
    const tier = String(resolvedSeverity?.tier ?? "minor").trim().toLowerCase() || "minor";
    const selectedType = String(injuryType ?? "physical").trim().toLowerCase().startsWith("psy")
        ? "psychological"
        : "physical";
    const physicalLabel = selectedType === "physical"
        ? "Roll Physical Injury (Recommended)"
        : "Roll Physical Injury";
    const psychologicalLabel = selectedType === "psychological"
        ? "Roll Psychological Injury (Recommended)"
        : "Roll Psychological Injury";

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        content: `
            <div class="laundry-critical-wound-card">
                <div class="critical-wound-title"><strong>CRITICAL INJURY: ${safeName}</strong></div>
                <div class="critical-wound-title">Severity: ${_escapeHtml(tier)} | Injury damage: ${safeInjuryDamage} | Roll: ${diceCount}d6 | Track: +${trackSpaces}</div>
                <div class="critical-wound-actions">
                    <button
                        type="button"
                        class="roll-injury"
                        data-injury-type="physical"
                        data-injury-damage="${safeInjuryDamage}"
                        data-injury-tier="${_escapeHtml(tier)}"
                        data-injury-dice-count="${diceCount}"
                        data-injury-track-spaces="${trackSpaces}"
                        data-target-name="${safeName}"
                        data-target-actor-id="${targetActor.id}"
                    >${physicalLabel}</button>
                    <button
                        type="button"
                        class="roll-injury"
                        data-injury-type="psychological"
                        data-injury-damage="${safeInjuryDamage}"
                        data-injury-tier="${_escapeHtml(tier)}"
                        data-injury-dice-count="${diceCount}"
                        data-injury-track-spaces="${trackSpaces}"
                        data-target-name="${safeName}"
                        data-target-actor-id="${targetActor.id}"
                    >${psychologicalLabel}</button>
                </div>
            </div>`
    });
}

async function _postDeathNotice({ targetActor, damageTaken = 0, appliedDamage = 0 } = {}) {
    if (!targetActor) return;
    const safeName = _escapeHtml(targetActor.name ?? "Unknown");
    const safeOverflow = Math.max(0, Math.trunc(Number(damageTaken) || 0));
    const safeApplied = Math.max(0, Math.trunc(Number(appliedDamage) || 0));

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        content: `
            <div class="laundry-death-card">
                <div class="death-title">☠ DEATH CONFIRMED: ${safeName}</div>
                <div>Damage Applied: <strong>${safeApplied}</strong>${safeOverflow > 0 ? ` | Overflow: <strong>${safeOverflow}</strong>` : ""}</div>
            </div>`
    });
}

async function _rollInjuryFromButton(ev) {
    const button = ev?.currentTarget;
    const injuryDamage = Math.max(0, Math.trunc(Number(button?.dataset?.injuryDamage ?? 0) || 0));
    const targetName = String(button?.dataset?.targetName ?? "").trim();
    const targetActorId = String(button?.dataset?.targetActorId ?? "").trim();
    const targetActor = targetActorId ? game.actors?.get(targetActorId) ?? null : null;
    const injuryType = String(button?.dataset?.injuryType ?? "physical").trim().toLowerCase();
    const tier = String(button?.dataset?.injuryTier ?? "").trim().toLowerCase();
    const requestedDiceCount = Math.max(0, Math.trunc(Number(button?.dataset?.injuryDiceCount) || 0));
    const requestedTrackSpaces = Math.max(0, Math.trunc(Number(button?.dataset?.injuryTrackSpaces) || 0));
    const fallbackSeverity = _resolveInjurySeverity({
        injuryDamage,
        brutal: tier === "deadly" && injuryDamage <= 0
    });
    const diceCount = Math.max(1, requestedDiceCount || Math.trunc(Number(fallbackSeverity.diceCount) || 1));
    const trackSpaces = Math.max(1, requestedTrackSpaces || Math.trunc(Number(fallbackSeverity.trackSpaces) || 1));
    const injuryLabel = injuryType.startsWith("psy") ? "Psychological Injury" : "Physical Injury";
    const injuryTrack = await _markCriticalInjuryOnTrack(targetActor, { spaces: trackSpaces });
    const roll = new Roll(`${diceCount}d6`);
    await roll.evaluate();
    const total = Math.max(0, Math.trunc(Number(roll.total ?? 0) || 0));
    const resolved = await _resolveOutcomeFromCriticalTables({
        tableType: "injury",
        total,
        injuryType
    });
    const outcome = resolved?.text ?? _getInjuryOutcome(total);
    const targetLabel = targetName ? ` for ${_escapeHtml(targetName)}` : "";
    const statusId = _normalizeOutcomeStatusId(resolved?.statusId, outcome, "injury");
    const statusIds = _collectOutcomeStatusIds(statusId, outcome, "injury");
    const durationRounds = Math.max(0, Math.trunc(Number(resolved?.durationRounds) || 0));
    const modifierChanges = _mergeDifficultyModifierChanges([
        ..._sanitizeModifierChanges(resolved?.modifierChanges),
        ..._extractDifficultyModifierChangesFromText(outcome)
    ]);
    const effectCategory = _inferOutcomeCategory({
        effectType: "injury",
        outcomeText: outcome
    });
    const effectName = _deriveOutcomeEffectName({
        effectType: "injury",
        outcomeText: outcome,
        fallbackTotal: total
    });
    const resolvedEffectName = String(resolved?.effectName ?? "").trim();
    const finalEffectName = resolvedEffectName || effectName;
    const applyButton = _renderOutcomeApplyButton({
        actorId: targetActor?.id ?? "",
        effectType: "injury",
        effectCategory,
        effectName: finalEffectName,
        outcomeText: outcome,
        statusId,
        statusIds,
        durationRounds,
        sourceTag: "injury-table",
        tableName: resolved?.tableName ?? "",
        modifierChanges
    });

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-injury-result-card">
                <strong>INJURY RESULT${targetLabel}:</strong>
                <div class="injury-outcome">${_escapeHtml(injuryLabel)}</div>
                ${diceCount}d6 = <strong>${total}</strong>
                <span class="injury-outcome">(${_escapeHtml(outcome)})</span>
                <div class="injury-outcome">Severity: ${_escapeHtml(tier || fallbackSeverity.tier)} | Injury spaces: +${trackSpaces}</div>
                ${resolved?.tableName ? `<div class="injury-outcome">Table: ${_escapeHtml(resolved.tableName)}</div>` : ""}
                ${statusIds.length ? `<div class="injury-outcome">Condition: ${_escapeHtml(statusIds.join(", "))}</div>` : ""}
                ${injuryTrack ? `<div class="injury-outcome">Injury Track: ${injuryTrack.before} -> ${injuryTrack.after}${injuryTrack.atCap ? " (MAX)" : ""}</div>` : ""}
                ${modifierChanges.length ? `<div class="injury-outcome">${_escapeHtml(_formatDifficultyModifierSummary(modifierChanges))}</div>` : ""}
                ${applyButton}
            </div>`,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });
}

async function _markCriticalInjuryOnTrack(actor, { spaces = 1 } = {}) {
    if (!actor) return null;
    const isNpc = actor.type === "npc";
    const canTrack = actor.type === "character"
        || (isNpc && Boolean(actor.system?.npc?.trackInjuries));
    if (!canTrack) return null;
    const delta = Math.max(1, Math.trunc(Number(spaces) || 1));

    const state = computeInjuryTrackUpdate({
        current: Number(actor.system?.derived?.injuries?.value ?? 0),
        max: Number(actor.system?.derived?.injuries?.max ?? 0),
        delta
    });
    if (state.max <= 0) return null;
    if (state.changed) {
        await actor.update({ "system.derived.injuries.value": state.after });
    }
    return {
        before: state.before,
        after: state.after,
        max: state.max,
        atCap: state.atCap
    };
}

function _getInjuryOutcome(total) {
    const n = Math.max(0, Math.trunc(Number(total) || 0));
    if (n <= 2) return "Arm Wound";
    if (n <= 4) return "Leg Wound";
    if (n <= 8) return "Head Wound";
    if (n <= 10) return "Internal Injury";
    if (n <= 12) return "Broken Arm";
    if (n <= 14) return "Broken Leg";
    if (n <= 17) return "Brain Injury";
    return "Instant Death / Broken Mind";
}

async function _rollMishapFromButton(ev) {
    const button = ev?.currentTarget;
    const sourceName = String(button?.dataset?.sourceName ?? "").trim();
    const actorId = String(button?.dataset?.actorId ?? "").trim();
    const actor = actorId ? game.actors?.get(actorId) ?? null : null;
    const sourceLabel = sourceName ? ` (${_escapeHtml(sourceName)})` : "";
    const roll = new Roll(_getRollFormulaForOutcomeTable("mishap"));
    await roll.evaluate();
    const total = Math.max(1, Math.trunc(Number(roll.total ?? 1) || 1));
    const resolved = await _resolveOutcomeFromCriticalTables({
        tableType: "mishap",
        total
    });
    const outcome = resolved?.text ?? _getMishapOutcome(total);
    const statusId = _normalizeOutcomeStatusId(resolved?.statusId, outcome, "mishap");
    const statusIds = _collectOutcomeStatusIds(statusId, outcome, "mishap");
    const durationRounds = Math.max(0, Math.trunc(Number(resolved?.durationRounds) || 0));
    const modifierChanges = _mergeDifficultyModifierChanges([
        ..._sanitizeModifierChanges(resolved?.modifierChanges),
        ..._extractDifficultyModifierChangesFromText(outcome)
    ]);
    const effectCategory = _inferOutcomeCategory({
        effectType: "mishap",
        outcomeText: outcome
    });
    const effectName = _deriveOutcomeEffectName({
        effectType: "mishap",
        outcomeText: outcome,
        fallbackTotal: total
    });
    const resolvedEffectName = String(resolved?.effectName ?? "").trim();
    const finalEffectName = resolvedEffectName || effectName;
    const applyButton = _renderOutcomeApplyButton({
        actorId: actor?.id ?? "",
        effectType: "mishap",
        effectCategory,
        effectName: finalEffectName,
        outcomeText: outcome,
        statusId,
        statusIds,
        durationRounds,
        sourceTag: "mishap-table",
        tableName: resolved?.tableName ?? "",
        modifierChanges
    });

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-mishap-result-card">
                <strong>MISHAP RESULT${sourceLabel}:</strong>
                <strong>${total}</strong>
                <span class="mishap-outcome">- ${_escapeHtml(outcome)}</span>
                ${resolved?.tableName ? `<div class="mishap-outcome">Table: ${_escapeHtml(resolved.tableName)}</div>` : ""}
                ${statusIds.length ? `<div class="mishap-outcome">Condition: ${_escapeHtml(statusIds.join(", "))}</div>` : ""}
                ${modifierChanges.length ? `<div class="mishap-outcome">${_escapeHtml(_formatDifficultyModifierSummary(modifierChanges))}</div>` : ""}
                ${applyButton}
            </div>`,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });
}

function _getMishapOutcome(total) {
    const n = Math.max(1, Math.trunc(Number(total) || 1));
    if (n <= 2) return "Arcane Feedback: magical output destabilises; the caster is left Stunned.";
    if (n <= 4) return "Signal Bleed: nearby electronics glitch and occult signatures spike.";
    if (n === 5) return "Aetheric Backlash: the caster suffers immediate Bleeding trauma.";
    return "Catastrophic Breach: severe anomaly manifests (Incapacitated/Lethal fallout).";
}

function _getRollFormulaForOutcomeTable(tableType = "") {
    const normalizedType = String(tableType ?? "").trim().toLowerCase();
    if (normalizedType !== "mishap") return "1d6";

    const rows = _getLocalOutcomeRows({ tableType: normalizedType });
    const max = _getMaxRollValueFromRows(rows);
    return max > 6 ? "2d6" : "1d6";
}

function _getLocalOutcomeRows({ tableType = "", injuryType = "physical" } = {}) {
    const normalizedType = String(tableType ?? "").trim().toLowerCase();
    if (normalizedType === "mishap") {
        return Array.isArray(LOCAL_CRITICAL_TABLES.magical_mishaps)
            ? LOCAL_CRITICAL_TABLES.magical_mishaps
            : [];
    }

    if (normalizedType !== "injury") return [];
    const normalizedInjuryType = String(injuryType ?? "physical").trim().toLowerCase();
    const isPsychological = normalizedInjuryType.startsWith("psy");
    return isPsychological
        ? (Array.isArray(LOCAL_CRITICAL_TABLES.psychological_injuries)
            ? LOCAL_CRITICAL_TABLES.psychological_injuries
            : [])
        : (Array.isArray(LOCAL_CRITICAL_TABLES.physical_injuries)
            ? LOCAL_CRITICAL_TABLES.physical_injuries
            : []);
}

function _parseRollRangeSpec(rawRange) {
    const text = String(rawRange ?? "").trim();
    if (!text) return null;

    const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
        const min = Math.max(0, Math.trunc(Number(rangeMatch[1]) || 0));
        const max = Math.max(min, Math.trunc(Number(rangeMatch[2]) || min));
        return { min, max };
    }

    const plusMatch = text.match(/^(\d+)\s*\+$/);
    if (plusMatch) {
        const min = Math.max(0, Math.trunc(Number(plusMatch[1]) || 0));
        return { min, max: Number.POSITIVE_INFINITY };
    }

    const exactMatch = text.match(/^(\d+)$/);
    if (exactMatch) {
        const exact = Math.max(0, Math.trunc(Number(exactMatch[1]) || 0));
        return { min: exact, max: exact };
    }

    return null;
}

function _pickLocalOutcomeByTotal(rows, total) {
    const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
    const parsed = rows
        .map(row => ({ row, range: _parseRollRangeSpec(row?.roll) }))
        .filter(entry => entry.range !== null);
    if (!parsed.length) return null;

    const direct = parsed.find(entry => safeTotal >= entry.range.min && safeTotal <= entry.range.max);
    if (direct) return direct.row;

    const nearestBelow = parsed
        .filter(entry => safeTotal >= entry.range.min)
        .sort((a, b) => b.range.min - a.range.min)[0];
    if (nearestBelow) return nearestBelow.row;

    const nearestAbove = parsed
        .sort((a, b) => a.range.min - b.range.min)[0];
    return nearestAbove?.row ?? null;
}

function _getMaxRollValueFromRows(rows = []) {
    const parsed = rows
        .map(row => _parseRollRangeSpec(row?.roll))
        .filter(Boolean);
    if (!parsed.length) return 0;
    let max = 0;
    for (const range of parsed) {
        if (!Number.isFinite(range.max)) return Number.POSITIVE_INFINITY;
        max = Math.max(max, Math.trunc(Number(range.max) || 0));
    }
    return max;
}

function _buildLocalOutcomeResult({ tableType = "", injuryType = "physical", row = null } = {}) {
    if (!row) return null;
    const normalizedType = String(tableType ?? "").trim().toLowerCase();
    const normalizedInjuryType = String(injuryType ?? "physical").trim().toLowerCase();
    const isPsychologicalInjury = normalizedType === "injury" && normalizedInjuryType.startsWith("psy");

    if (normalizedType === "injury") {
        const injuryName = String(row?.injury ?? "").trim();
        const effectText = String(row?.effect ?? "").trim();
        const text = injuryName && effectText
            ? `${injuryName}: ${effectText}`
            : (effectText || injuryName);
        return {
            tableName: isPsychologicalInjury
                ? "Psychological Injuries (tables.json)"
                : "Physical Injuries (tables.json)",
            effectName: injuryName || (isPsychologicalInjury ? "Psychological Injury" : "Physical Injury"),
            text,
            statusId: _normalizeOutcomeStatusId("", text, normalizedType),
            durationRounds: /until the end of your next turn/i.test(text) ? 1 : 0,
            modifierChanges: []
        };
    }

    if (normalizedType === "mishap") {
        const effectName = String(row?.effect ?? "").trim() || "Magical Mishap";
        const description = String(row?.description ?? "").trim();
        const text = description ? `${effectName}: ${description}` : effectName;
        return {
            tableName: "Magical Mishaps (tables.json)",
            effectName,
            text,
            statusId: _normalizeOutcomeStatusId("", text, normalizedType),
            durationRounds: /until the end of your next turn/i.test(text) ? 1 : 0,
            modifierChanges: []
        };
    }

    return null;
}

function _resolveOutcomeFromLocalCriticalTables({ tableType = "", total = 0, injuryType = "physical" } = {}) {
    const rows = _getLocalOutcomeRows({ tableType, injuryType });
    if (!rows.length) return null;
    const picked = _pickLocalOutcomeByTotal(rows, total);
    return _buildLocalOutcomeResult({ tableType, injuryType, row: picked });
}

async function _resolveOutcomeFromCriticalTables({ tableType = "", total = 0, injuryType = "physical" } = {}) {
    const automated = await _resolveOutcomeFromAutomationTable({ tableType, total, injuryType });
    if (automated) return automated;
    return _resolveOutcomeFromLocalCriticalTables({ tableType, total, injuryType });
}

function _renderOutcomeApplyButton({
    actorId = "",
    effectType = "",
    effectCategory = "",
    effectName = "",
    outcomeText = "",
    statusId = "",
    statusIds = [],
    durationRounds = 0,
    sourceTag = "",
    tableName = "",
    modifierChanges = []
} = {}) {
    const targetActorId = String(actorId ?? "").trim();
    const disabled = targetActorId ? "" : "disabled";
    const title = targetActorId
        ? "Create Active Effect and apply status automation."
        : "Target actor is unavailable.";
    return `<button
        type="button"
        class="apply-roll-effect spend-focus"
        data-actor-id="${_escapeHtml(targetActorId)}"
        data-effect-type="${_escapeHtml(String(effectType ?? "").trim().toLowerCase())}"
        data-effect-category="${_escapeHtml(String(effectCategory ?? "").trim().toLowerCase())}"
        data-effect-name="${_escapeHtml(_encodeDataValue(effectName))}"
        data-outcome-text="${_escapeHtml(_encodeDataValue(outcomeText))}"
        data-status-id="${_escapeHtml(String(statusId ?? "").trim().toLowerCase())}"
        data-status-ids="${_escapeHtml(_encodeDataValue(JSON.stringify(statusIds)))}"
        data-duration-rounds="${Math.max(0, Math.trunc(Number(durationRounds) || 0))}"
        data-source-tag="${_escapeHtml(String(sourceTag ?? "").trim())}"
        data-table-name="${_escapeHtml(_encodeDataValue(tableName))}"
        data-modifier-changes="${_escapeHtml(_encodeDataValue(JSON.stringify(_sanitizeModifierChanges(modifierChanges))))}"
        title="${_escapeHtml(title)}"
        ${disabled}
    >Apply Effect</button>`;
}

async function _applyOutcomeEffectFromButton(ev) {
    const button = ev?.currentTarget;
    if (!button) return;
    if (button.dataset?.applied === "true") return;

    const actorId = String(button.dataset?.actorId ?? "").trim();
    if (!actorId) {
        ui.notifications.warn("No actor is linked to this outcome card.");
        return;
    }
    const actor = game.actors?.get(actorId) ?? null;
    if (!actor) {
        ui.notifications.warn("Linked actor could not be found.");
        return;
    }
    if (!(game.user?.isGM || actor.isOwner)) {
        ui.notifications.warn("Only the GM or actor owner can apply this effect.");
        return;
    }

    const effectType = String(button.dataset?.effectType ?? "").trim().toLowerCase();
    const effectCategory = String(button.dataset?.effectCategory ?? "").trim().toLowerCase();
    const effectNameRaw = _decodeDataValue(button.dataset?.effectName ?? "");
    const outcomeText = _decodeDataValue(button.dataset?.outcomeText ?? "");
    const sourceTag = String(button.dataset?.sourceTag ?? "").trim() || `${effectType || "outcome"}-chat`;
    const tableName = _decodeDataValue(button.dataset?.tableName ?? "");
    const parsedChanges = _safeParseJsonArray(_decodeDataValue(button.dataset?.modifierChanges ?? ""));
    const modifierChanges = _mergeDifficultyModifierChanges([
        ..._sanitizeModifierChanges(parsedChanges),
        ..._extractDifficultyModifierChangesFromText(outcomeText)
    ]);
    const statusId = _normalizeOutcomeStatusId(button.dataset?.statusId ?? "", outcomeText, effectType);
    const parsedStatusIds = _safeParseJsonArray(_decodeDataValue(button.dataset?.statusIds ?? ""))
        .map(value => _normalizeOutcomeStatusId(value, outcomeText, effectType))
        .filter(Boolean);
    const statusIds = _collectOutcomeStatusIds(parsedStatusIds.length ? parsedStatusIds : statusId, outcomeText, effectType);
    const durationRounds = Math.max(0, Math.trunc(Number(button.dataset?.durationRounds) || 0));
    const effectName = effectNameRaw || _deriveOutcomeEffectName({
        effectType,
        outcomeText,
        fallbackTotal: null
    });
    const category = effectCategory || _inferOutcomeCategory({
        effectType,
        outcomeText
    });
    const icon = category === "psychological"
        ? PSYCHOLOGICAL_EFFECT_ICON
        : PHYSICAL_EFFECT_ICON;

    const effectResult = await _createOutcomeActiveEffect({
        actor,
        effectName,
        icon,
        effectType,
        outcomeText,
        statusId,
        durationRounds,
        sourceTag,
        tableName,
        modifierChanges
    });
    const duplicateEffect = Boolean(effectResult?.duplicate);

    let statusAppliedCount = 0;
    for (const statusKey of statusIds) {
        const applied = await _applyStatusEffectToActor(actor, statusKey, {
            durationRounds,
            sourceTag
        });
        if (applied) statusAppliedCount += 1;
    }

    const modifierSummary = modifierChanges.length
        ? _formatDifficultyModifierSummary(modifierChanges)
        : "";
    const statusSummary = statusIds.length
        ? (statusAppliedCount > 0
            ? `Status: ${statusIds.join(", ")}.`
            : `Status marker requested: ${statusIds.join(", ")}.`)
        : "No status marker.";
    const extra = modifierSummary ? ` ${modifierSummary}` : "";
    const applySummary = duplicateEffect
        ? `already has ${effectName}; skipped duplicate effect.`
        : `applied ${effectName}.`;
    ui.notifications.info(`${actor.name}: ${applySummary} ${statusSummary}${extra}`);

    button.dataset.applied = "true";
    button.disabled = true;
    button.classList.add("is-applied");
    button.textContent = duplicateEffect ? "Already Active" : "Effect Applied";
}

async function _createOutcomeActiveEffect({
    actor,
    effectName,
    icon,
    effectType,
    outcomeText,
    statusId,
    durationRounds = 0,
    sourceTag = "",
    tableName = "",
    modifierChanges = []
} = {}) {
    if (!actor) return null;
    const safeName = String(effectName ?? "").trim() || "Outcome Effect";
    const safeIcon = String(icon ?? "").trim() || PHYSICAL_EFFECT_ICON;
    const safeChanges = _sanitizeModifierChanges(modifierChanges);
    const safeDuration = Math.max(0, Math.trunc(Number(durationRounds) || 0));
    const safeStatusId = _normalizeOutcomeStatusId(statusId, outcomeText, effectType);
    const safeSource = String(sourceTag ?? "").trim() || "chat-outcome";
    const safeTableName = String(tableName ?? "").trim();
    const safeOutcomeText = String(outcomeText ?? "").trim();
    const normalizedType = String(effectType ?? "").trim().toLowerCase() || "outcome";
    const fingerprint = buildOutcomeFingerprint({
        effectType: normalizedType,
        effectName: safeName,
        outcomeText: safeOutcomeText,
        statusId: safeStatusId,
        sourceTag: safeSource,
        tableName: safeTableName,
        modifierChanges: safeChanges
    });
    const now = Date.now();
    const duplicate = Array.from(actor.effects ?? []).find(effect => {
        const flag = effect.getFlag?.("laundry-rpg", "outcomeEffect") ?? {};
        const existingFingerprint = String(flag?.fingerprint ?? "").trim();
        if (existingFingerprint && existingFingerprint === fingerprint) {
            const existingAt = Math.max(0, Math.trunc(Number(flag?.appliedAt) || 0));
            return !existingAt || (now - existingAt) <= 30_000;
        }

        const existingType = String(flag?.type ?? "").trim().toLowerCase();
        const existingSource = String(flag?.source ?? "").trim();
        const existingName = String(effect?.name ?? "").trim().toLowerCase();
        const existingOutcome = String(flag?.outcomeText ?? "").trim().toLowerCase();
        const existingStatus = String(flag?.statusId ?? "").trim().toLowerCase();
        const existingAt = Math.max(0, Math.trunc(Number(flag?.appliedAt) || 0));
        const isRecent = existingAt > 0 && (now - existingAt) <= 30_000;
        if (!isRecent) return false;
        return existingType === normalizedType
            && existingSource === safeSource
            && existingName === safeName.toLowerCase()
            && existingOutcome === safeOutcomeText.toLowerCase()
            && existingStatus === safeStatusId.toLowerCase();
    }) ?? null;
    if (duplicate) {
        return {
            effect: duplicate,
            duplicate: true
        };
    }

    const effectData = {
        name: safeName,
        img: safeIcon,
        disabled: false,
        origin: actor.uuid,
        changes: safeChanges,
        flags: {
            "laundry-rpg": {
                outcomeEffect: {
                    type: normalizedType,
                    statusId: safeStatusId,
                    source: safeSource,
                    tableName: safeTableName,
                    outcomeText: safeOutcomeText,
                    fingerprint,
                    appliedBy: game.user?.id ?? null,
                    appliedAt: Date.now()
                }
            }
        }
    };

    const combat = game.combat;
    if (safeDuration > 0 && combat?.started) {
        effectData.duration = {
            rounds: safeDuration,
            startRound: Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0)),
            startTurn: Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))
        };
    }

    const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return {
        effect: created?.[0] ?? null,
        duplicate: false
    };
}

async function _applyStatusEffectToActor(actor, statusId, { durationRounds = 0, sourceTag = "chat-outcome" } = {}) {
    const safeStatusId = String(statusId ?? "").trim().toLowerCase();
    if (!actor || !safeStatusId) return false;

    if (typeof game.laundry?.applyCondition === "function") {
        return Boolean(await game.laundry.applyCondition(actor, safeStatusId, {
            durationRounds,
            source: sourceTag,
            suppressChat: true
        }));
    }

    if (typeof actor.toggleStatusEffect === "function") {
        try {
            await actor.toggleStatusEffect(safeStatusId, { active: true });
            if (_collectActorStatuses(actor).has(safeStatusId)) return true;
        } catch (err) {
            console.warn(`Laundry RPG | Failed to toggle status '${safeStatusId}' via actor.toggleStatusEffect`, err);
        }
    }

    return false;
}

function _inferOutcomeCategory({ effectType = "", outcomeText = "" } = {}) {
    const type = String(effectType ?? "").trim().toLowerCase();
    if (type === "mishap") return "psychological";

    const text = String(outcomeText ?? "").trim().toLowerCase();
    const psychologicalPattern = /\b(psychological|phobia|hallucination|dread|terrified|frightened|mind|spirit|trauma)\b/;
    return psychologicalPattern.test(text) ? "psychological" : "physical";
}

function _deriveOutcomeEffectName({ effectType = "", outcomeText = "", fallbackTotal = null } = {}) {
    const text = String(outcomeText ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
        const label = String(effectType ?? "").trim().toLowerCase() === "mishap"
            ? "Magical Mishap"
            : "Injury";
        return Number.isFinite(Number(fallbackTotal))
            ? `${label} (${Math.max(0, Math.trunc(Number(fallbackTotal) || 0))})`
            : label;
    }

    const sentence = text.split(/[.:\n]/)[0] ?? text;
    const trimmed = sentence.replace(/\b(?:you|until)\b.*$/i, "").trim() || sentence.trim();
    const compact = trimmed.replace(/\s+/g, " ");
    return compact.length > 72 ? compact.slice(0, 72).trim() : compact;
}

function _normalizeOutcomeStatusId(statusId, outcomeText = "", effectType = "") {
    const provided = _normalizeModifierToken(statusId);
    if (SUPPORTED_OUTCOME_STATUS_IDS.has(provided)) return provided;

    const text = String(outcomeText ?? "").toLowerCase();
    if (/\bunconscious\b/.test(text)) return "unconscious";
    if (/\bincapacitated\b/.test(text)) return "incapacitated";
    if (/\brestrained\b/.test(text)) return "restrained";
    if (/\bdeafened\b/.test(text)) return "deafened";
    if (/\bblinded\b/.test(text)) return "blinded";
    if (/\bprone\b/.test(text)) return "prone";
    if (/\bstunned\b/.test(text)) return "stunned";
    if (/\bterrified\b/.test(text)) return "terrified";
    if (/\bterrified\b|\bfrightened\b|\bphobia\b/.test(text)) return "frightened";
    if (/\bbleeding\b/.test(text)) return "bleeding";
    if (/\bweakened\b/.test(text)) return "weakened";

    const normalizedType = String(effectType ?? "").trim().toLowerCase();
    if (normalizedType === "mishap" && /\bbacklash|arcane|breach|mishap\b/.test(text)) {
        return "";
    }
    return "";
}

function _collectOutcomeStatusIds(statusIdOrIds, outcomeText = "", effectType = "") {
    const provided = Array.isArray(statusIdOrIds) ? statusIdOrIds : [statusIdOrIds];
    const statuses = new Set();
    for (const raw of provided) {
        const key = _normalizeModifierToken(raw);
        if (SUPPORTED_OUTCOME_STATUS_IDS.has(key)) statuses.add(key);
    }

    const normalizedText = String(outcomeText ?? "").toLowerCase();
    if (/\bunconscious\b/.test(normalizedText)) statuses.add("unconscious");
    if (/\bincapacitated\b/.test(normalizedText)) statuses.add("incapacitated");
    if (/\brestrained\b/.test(normalizedText)) statuses.add("restrained");
    if (/\bdeafened\b/.test(normalizedText)) statuses.add("deafened");
    if (/\bblinded\b/.test(normalizedText)) statuses.add("blinded");
    if (/\bprone\b/.test(normalizedText)) statuses.add("prone");
    if (/\bstunned\b/.test(normalizedText)) statuses.add("stunned");
    if (/\bterrified\b/.test(normalizedText)) statuses.add("terrified");
    if (!statuses.has("terrified") && /\bfrightened\b|\bphobia\b/.test(normalizedText)) statuses.add("frightened");
    if (/\bbleeding\b/.test(normalizedText)) statuses.add("bleeding");
    if (/\bweakened\b/.test(normalizedText)) statuses.add("weakened");

    const fallback = _normalizeOutcomeStatusId("", normalizedText, effectType);
    if (fallback) statuses.add(fallback);

    return Array.from(statuses).filter(status => SUPPORTED_OUTCOME_STATUS_IDS.has(status));
}

function _extractDifficultyModifierChangesFromText(outcomeText) {
    const text = String(outcomeText ?? "").trim();
    if (!text) return [];

    const changes = [];
    const pattern = /increase(?:s|d)?\s+the\s+difficulty\s+of\s+(.+?)\s+tests?(?:\s+you\s+make)?\s+by\s+(\d+)/gi;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const descriptor = String(match[1] ?? "").trim();
        const amount = Math.max(0, Math.trunc(Number(match[2]) || 0));
        if (!descriptor || amount <= 0) continue;
        const scopedKeys = _resolveDifficultyModifierKeysFromDescriptor(descriptor);
        for (const scopedKey of scopedKeys) {
            changes.push({
                key: `${ROLL_EFFECT_DIFFICULTY_PREFIX}${scopedKey}`,
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                value: amount
            });
        }
    }

    return _mergeDifficultyModifierChanges(changes);
}

function _resolveDifficultyModifierKeysFromDescriptor(descriptor) {
    const raw = String(descriptor ?? "").trim().toLowerCase();
    if (!raw) return [];

    const attributeTerms = [];
    if (/\bbody\b/.test(raw)) attributeTerms.push("body");
    if (/\bmind\b/.test(raw)) attributeTerms.push("mind");
    if (/\bspirit\b/.test(raw)) attributeTerms.push("spirit");
    if (!attributeTerms.length && /\ball\s+tests?\b/.test(raw)) attributeTerms.push("all");

    const pairedKeys = [];
    const pairedAttributes = new Set();
    const pairedMatches = [...raw.matchAll(/\b(body|mind|spirit)\b\s*\(([^)]+)\)/g)];
    for (const match of pairedMatches) {
        const attribute = _normalizeModifierToken(match[1] ?? "");
        if (!attribute) continue;
        pairedAttributes.add(attribute);

        const term = String(match[2] ?? "");
        const parts = term.split(/,|\/|&|\band\b/gi);
        const normalizedSkills = parts
            .map(part => _normalizeModifierSkillToken(part))
            .filter(Boolean);
        if (!normalizedSkills.length) {
            pairedKeys.push(`${attribute}.all`);
            continue;
        }
        for (const skill of normalizedSkills) {
            pairedKeys.push(`${attribute}.${skill}`);
        }
    }

    const skillTerms = [];
    const parenthetical = [...raw.matchAll(/\(([^)]+)\)/g)].map(match => String(match[1] ?? ""));
    for (const term of parenthetical) {
        const parts = term.split(/,|\/|&|\band\b/gi);
        for (const part of parts) {
            const normalized = _normalizeModifierSkillToken(part);
            if (normalized) skillTerms.push(normalized);
        }
    }

    const uniqueAttributes = Array.from(new Set(attributeTerms.map(entry => _normalizeModifierToken(entry)).filter(Boolean)));
    const uniqueSkills = Array.from(new Set(skillTerms));
    const results = new Set(pairedKeys);

    if (results.size) {
        const unpairedAttributes = uniqueAttributes.filter(attribute => !pairedAttributes.has(attribute));
        if (unpairedAttributes.length) {
            if (uniqueSkills.length) {
                for (const attribute of unpairedAttributes) {
                    for (const skill of uniqueSkills) {
                        results.add(`${attribute}.${skill}`);
                    }
                }
            } else {
                for (const attribute of unpairedAttributes) {
                    results.add(`${attribute}.all`);
                }
            }
        }
        return Array.from(results);
    }

    if (!uniqueAttributes.length && !uniqueSkills.length) return [];
    if (uniqueAttributes.length && uniqueSkills.length) {
        return uniqueAttributes.flatMap(attribute => uniqueSkills.map(skill => `${attribute}.${skill}`));
    }
    if (uniqueAttributes.length) {
        return uniqueAttributes.map(attribute => `${attribute}.all`);
    }
    return uniqueSkills.map(skill => `all.${skill}`);
}

function _normalizeModifierSkillToken(value) {
    let text = String(value ?? "").toLowerCase();
    text = text
        .replace(/\b(skill|skills|test|tests|check|checks|roll|rolls|all|the|of|you|make|which|require|required)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return _normalizeModifierToken(text);
}

function _normalizeDifficultyChangeKey(rawKey) {
    const input = String(rawKey ?? "").trim();
    if (!input) return null;
    const lowered = input.toLowerCase();
    const withPrefix = lowered.startsWith(ROLL_EFFECT_DIFFICULTY_PREFIX)
        ? lowered
        : `${ROLL_EFFECT_DIFFICULTY_PREFIX}${lowered}`;
    const scoped = withPrefix.slice(ROLL_EFFECT_DIFFICULTY_PREFIX.length);
    const [attributeRaw, skillRaw = "all"] = scoped.split(".");
    const attribute = _normalizeModifierToken(attributeRaw || "");
    const skill = _normalizeModifierToken(skillRaw || "all") || "all";
    if (!attribute) return null;
    return `${ROLL_EFFECT_DIFFICULTY_PREFIX}${attribute}.${skill}`;
}

function _sanitizeModifierChanges(changes = []) {
    const entries = Array.isArray(changes) ? changes : [];
    const sanitized = [];
    for (const entry of entries) {
        const normalizedKey = _normalizeDifficultyChangeKey(entry?.key);
        if (!normalizedKey) continue;
        const modeRaw = Number(entry?.mode);
        const mode = Number.isFinite(modeRaw)
            ? Math.trunc(modeRaw)
            : CONST.ACTIVE_EFFECT_MODES.ADD;
        const numericValue = Number(entry?.value);
        if (!Number.isFinite(numericValue) || numericValue === 0) continue;
        sanitized.push({
            key: normalizedKey,
            mode,
            value: Math.trunc(numericValue)
        });
    }
    return sanitized;
}

function _mergeDifficultyModifierChanges(changes = []) {
    const normalized = _sanitizeModifierChanges(changes);
    if (!normalized.length) return [];

    const merged = new Map();
    for (const change of normalized) {
        const index = `${change.key}|${change.mode}`;
        const current = merged.get(index) ?? 0;
        merged.set(index, current + Math.trunc(Number(change.value) || 0));
    }

    return Array.from(merged.entries())
        .map(([index, value]) => {
            const [key, modeRaw] = index.split("|");
            return {
                key,
                mode: Math.trunc(Number(modeRaw) || CONST.ACTIVE_EFFECT_MODES.ADD),
                value: Math.trunc(Number(value) || 0)
            };
        })
        .filter(change => change.value !== 0);
}

function _safeParseJsonArray(raw) {
    const text = String(raw ?? "").trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
        return [];
    }
}

function _encodeDataValue(value) {
    return encodeURIComponent(String(value ?? ""));
}

function _decodeDataValue(value) {
    const text = String(value ?? "");
    if (!text) return "";
    try {
        return decodeURIComponent(text);
    } catch (_err) {
        return text;
    }
}

function _formatDifficultyModifierSummary(changes = []) {
    const normalized = _sanitizeModifierChanges(changes);
    if (!normalized.length) return "";

    const parts = normalized.map(change => {
        const scoped = change.key.slice(ROLL_EFFECT_DIFFICULTY_PREFIX.length);
        const [attributeRaw, skillRaw = "all"] = scoped.split(".");
        const attribute = attributeRaw === "all"
            ? "All"
            : `${attributeRaw.charAt(0).toUpperCase()}${attributeRaw.slice(1)}`;
        const skill = skillRaw === "all"
            ? "all tests"
            : skillRaw
                .split("-")
                .map(chunk => chunk ? `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}` : "")
                .filter(Boolean)
                .join(" ");
        const label = skillRaw === "all"
            ? `${attribute} (${skill})`
            : `${attribute} (${skill})`;
        const value = Math.trunc(Number(change.value) || 0);
        return `${value > 0 ? "+" : ""}${value} Complexity ${label}`;
    });

    return `Difficulty Modifiers: ${parts.join("; ")}.`;
}

async function _resolveOutcomeFromAutomationTable({ tableType, total, injuryType = "physical" } = {}) {
    const table = await game.laundry?.getAutomationTable?.(tableType);
    if (!table) return null;

    const allResults = Array.from(table.results ?? []);
    const normalizedType = String(tableType ?? "").trim().toLowerCase();
    const normalizedInjuryType = String(injuryType ?? "physical").trim().toLowerCase().startsWith("psy")
        ? "psychological"
        : "physical";
    let results = allResults;
    if (normalizedType === "injury") {
        const typedRows = allResults.filter(result => {
            const laundryFlags = result.flags?.["laundry-rpg"] ?? {};
            const flagData = result.getFlag?.("laundry-rpg", "conditionData")
                ?? laundryFlags?.conditionData
                ?? laundryFlags
                ?? {};
            const rowType = String(flagData?.injuryType ?? laundryFlags?.injuryType ?? "")
                .trim()
                .toLowerCase();
            return rowType === normalizedInjuryType;
        });
        if (typedRows.length) {
            results = typedRows;
        }
    }
    if (!results.length) return null;
    const picked = _pickTableResultByTotal(results, total);
    if (!picked) return null;

    const laundryFlags = picked.flags?.["laundry-rpg"] ?? {};
    const flagData = picked.getFlag?.("laundry-rpg", "conditionData")
        ?? laundryFlags?.conditionData
        ?? laundryFlags
        ?? {};
    const modifierChanges = _mergeDifficultyModifierChanges([
        ..._sanitizeModifierChanges(flagData?.modifierChanges),
        ..._sanitizeModifierChanges(laundryFlags?.modifierChanges)
    ]);
    return {
        tableName: String(table.name ?? "").trim(),
        effectName: String(flagData?.effectName ?? laundryFlags?.effectName ?? "").trim(),
        text: _extractTableResultText(picked),
        statusId: String(flagData?.statusId ?? "").trim().toLowerCase(),
        durationRounds: Math.max(0, Math.trunc(Number(flagData?.durationRounds) || 0)),
        modifierChanges
    };
}

function _pickTableResultByTotal(results, total) {
    const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
    const withRanges = results
        .map(result => ({
            result,
            range: _extractTableResultRange(result)
        }))
        .filter(entry => entry.range !== null);

    const direct = withRanges.find(entry => safeTotal >= entry.range[0] && safeTotal <= entry.range[1]);
    if (direct) return direct.result;

    const nearestBelow = withRanges
        .filter(entry => safeTotal >= entry.range[0])
        .sort((a, b) => b.range[1] - a.range[1])[0];
    if (nearestBelow) return nearestBelow.result;

    const nearestAbove = withRanges
        .sort((a, b) => a.range[0] - b.range[0])[0];
    return nearestAbove?.result ?? results[0] ?? null;
}

function _extractTableResultRange(result) {
    const raw = result?.range;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const min = Math.max(0, Math.trunc(Number(raw[0]) || 0));
    const max = Math.max(min, Math.trunc(Number(raw[1]) || min));
    return [min, max];
}

function _extractTableResultText(result) {
    if (!result) return "";
    const text = result.text ?? result.getChatText?.() ?? "";
    return String(text ?? "").trim();
}

function _getPrimaryTargetSnapshot() {
    const targets = Array.from(game.user?.targets ?? []);
    if (!targets.length) return null;

    const normalizedTargets = targets
        .map(target => {
            const token = target.document ?? target;
            const actor = target.actor ?? token?.actor ?? null;
            return {
                name: target.name ?? token?.name ?? actor?.name ?? "",
                actorId: actor?.id ?? null,
                tokenId: target.id ?? token?.id ?? null
            };
        })
        .filter(entry => Boolean(entry.actorId || entry.tokenId));
    if (!normalizedTargets.length) return null;

    const [primary] = normalizedTargets;
    const actorIds = Array.from(new Set(normalizedTargets.map(entry => entry.actorId).filter(Boolean)));
    const tokenIds = Array.from(new Set(normalizedTargets.map(entry => entry.tokenId).filter(Boolean)));
    const names = normalizedTargets
        .map(entry => String(entry.name ?? "").trim())
        .filter(Boolean);

    return {
        name: primary.name,
        actorId: primary.actorId,
        tokenId: primary.tokenId,
        actorIds,
        tokenIds,
        names,
        count: normalizedTargets.length
    };
}

function _isMeleeWeapon({ weapon, linkedSkillName = "" } = {}) {
    const skillName = String(linkedSkillName || weapon?.system?.skill || "").trim().toLowerCase();
    if (skillName.includes("close") || skillName.includes("melee")) return true;
    if (skillName.includes("ranged") || skillName.includes("firearm") || skillName.includes("shoot")) return false;

    const rangeText = String(weapon?.system?.range ?? "").trim().toLowerCase();
    if (!rangeText) return true;
    if (rangeText.includes("short") || rangeText.includes("medium") || rangeText.includes("long")) return false;
    return rangeText.includes("close") || rangeText.includes("touch");
}

function _getActorTokenInCurrentScene(actor) {
    if (!actor || !canvas?.scene) return null;
    return canvas.tokens?.placeables?.find(token =>
        token?.actor?.id === actor.id && token.document?.hidden !== true
    ) ?? null;
}

function _measureTokenDistance(attackerToken, targetToken) {
    if (!attackerToken?.center || !targetToken?.center || !canvas?.scene) return Number.POSITIVE_INFINITY;
    const gridDistance = Number(canvas.scene.grid?.distance) || 1;
    const ray = new Ray(attackerToken.center, targetToken.center);
    const measured = canvas.grid?.measureDistances
        ? canvas.grid.measureDistances([{ ray }], { gridSpaces: true })?.[0]
        : null;
    if (Number.isFinite(Number(measured))) return Number(measured);
    return (ray.distance / (Number(canvas.scene.grid?.size) || 100)) * gridDistance;
}

function _getActorDistanceMeta(attackerActor, targetActor) {
    const attackerToken = _getActorTokenInCurrentScene(attackerActor);
    const targetToken = _getActorTokenInCurrentScene(targetActor);
    if (!attackerToken || !targetToken || !canvas?.scene) {
        return {
            available: false,
            isClose: false,
            outsideCloseZones: 1,
            distance: Number.POSITIVE_INFINITY
        };
    }

    const closeDistance = Number(canvas.scene.grid?.distance) || 1;
    const measured = _measureTokenDistance(attackerToken, targetToken);
    if (!Number.isFinite(measured)) {
        return {
            available: false,
            isClose: false,
            outsideCloseZones: 1,
            distance: Number.POSITIVE_INFINITY
        };
    }

    const isClose = measured <= closeDistance;
    const zoneSteps = Math.max(1, Math.ceil(measured / closeDistance));
    return {
        available: true,
        isClose,
        outsideCloseZones: isClose ? 0 : Math.min(3, Math.max(1, zoneSteps - 1)),
        distance: measured
    };
}

function _isTargetWithinCloseRange(actor, targetSnapshot) {
    const targetTokenId = String(targetSnapshot?.tokenId ?? "").trim();
    if (!targetTokenId || !canvas?.scene) return false;
    const targetToken = canvas.tokens?.get(targetTokenId) ?? null;
    if (!targetToken?.center) return false;
    const actorToken = _getActorTokenInCurrentScene(actor);
    if (!actorToken?.center) return false;
    const gridDistance = Number(canvas.scene.grid?.distance) || 1;
    const measured = _measureTokenDistance(actorToken, targetToken);
    return Number.isFinite(measured) && measured <= gridDistance;
}

function _mapAttackDnFromDelta(delta = 0) {
    const diff = Math.trunc(Number(delta) || 0);
    if (diff >= 2) return 2;
    if (diff === 1) return 3;
    if (diff === 0) return 4;
    if (diff === -1) return 5;
    return 6;
}

async function _evaluateDamage({ damage, isWeaponAttack, actor, damageBonus = 0 }) {
    const formula = String(damage ?? "").trim();
    const bonus = Math.max(0, Math.trunc(Number(damageBonus) || 0));
    if (!formula || !isWeaponAttack) {
        return {
            formula,
            baseTotal: null,
            bonus,
            total: null,
            result: "",
            roll: null
        };
    }
    if (/\bS\b/i.test(formula)) {
        return {
            formula,
            baseTotal: null,
            bonus,
            total: null,
            result: formula,
            roll: null
        };
    }

    try {
        const roll = new Roll(formula, actor?.getRollData?.() ?? {});
        await roll.evaluate();
        const baseTotal = Number(roll.total);
        const finalTotal = Number.isFinite(baseTotal)
            ? baseTotal + bonus
            : null;
        return {
            formula,
            baseTotal,
            bonus,
            total: finalTotal,
            result: roll.result ?? "",
            roll
        };
    } catch (err) {
        console.warn("Laundry RPG | Failed to evaluate weapon damage roll", err);
        const flat = Number(formula);
        if (Number.isFinite(flat)) {
            return {
                formula,
                baseTotal: flat,
                bonus,
                total: flat + bonus,
                result: `${flat}`,
                roll: null
            };
        }
        return {
            formula,
            baseTotal: null,
            bonus,
            total: null,
            result: "",
            roll: null
        };
    }
}

async function _promptRollConfig(config, {
    complexityPenalty = 0,
    penaltyNotice = ""
} = {}) {
    const teamLuck = await _getTeamLuck();
    const teamLuckMax = await _getTeamLuckMax();
    const selectedPreset = _normalizeDifficultyPreset(config.difficultyPreset);
    const safeComplexityPenalty = Math.max(0, Math.trunc(Number(complexityPenalty) || 0));
    const penaltyNoticeText = String(penaltyNotice ?? "").trim();
    const penaltyNoticeHtml = safeComplexityPenalty > 0
        ? `<p class="roll-config-alert">⚠️ +${safeComplexityPenalty} Complexity (Injury Penalty)${penaltyNoticeText ? ` — ${_escapeHtml(penaltyNoticeText)}` : ""}</p>`
        : "";

    const shiftOpts = [
        { value: "-2", label: "Greater Advantage (-2 DN)" },
        { value: "-1", label: "Advantage (-1 DN)" },
        { value: "0", label: "None" },
        { value: "1", label: "Disadvantage (+1 DN)" },
        { value: "2", label: "Greater Disadvantage (+2 DN)" }
    ];

    const content = `
    <form class="laundry-roll-config">
        <div class="roll-config-banner">
            <strong>FORM C7</strong>
            <span>Operational Test Warrant</span>
        </div>
        ${penaltyNoticeHtml}
        <div class="form-group">
            <label>Test Type</label>
            <select name="testType">
                <option value="common" ${config.testType === "common" ? "selected" : ""}>Common/Opposed/Extended/Group</option>
                <option value="luck" ${config.testType === "luck" ? "selected" : ""}>Luck Test (DN 4:1, pool = Team Luck)</option>
            </select>
        </div>
        <div class="form-group">
            <label>Dice Pool</label>
            <input type="number" name="pool" min="0" value="${Math.max(0, Number(config.pool) || 0)}" />
        </div>
        <div class="form-group" data-roll-config-row="difficulty">
            <label>Skill Difficulty Preset</label>
            <select name="difficultyPreset">
                <option value="standard" ${selectedPreset === "standard" ? "selected" : ""}>Standard (DN 4, Comp 1)</option>
                <option value="hard" ${selectedPreset === "hard" ? "selected" : ""}>Hard (DN 4, Comp 2)</option>
                <option value="daunting" ${selectedPreset === "daunting" ? "selected" : ""}>Daunting (DN 4, Comp 3)</option>
                <option value="opposed" ${selectedPreset === "opposed" ? "selected" : ""}>Opposed (DN 4, Comp 1)</option>
            </select>
            <p class="notes">Opposed: compare successes with the opposing roll.</p>
        </div>
        <div class="form-group" data-roll-config-row="shift">
            <label>Advantage</label>
            <select name="shift">
                ${shiftOpts.map(o => `<option value="${o.value}" ${Number(o.value) === Number(config.shift) ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
        </div>
        <div class="form-group" data-roll-config-row="preluck">
            <label>Pre-roll Luck</label>
            <select name="preRollLuck">
                <option value="none">Do not spend Luck</option>
                <option value="maximize">Spend 1 Luck: Maximise successes</option>
            </select>
            <p class="notes">Team Luck currently: ${teamLuck}/${teamLuckMax}</p>
        </div>
        <p class="roll-config-summary" data-roll-config-summary></p>
    </form>`;

    return new Promise(resolve => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        new Dialog({
            title: "Configure Test",
            content,
            classes: ["laundry-rpg", "laundry-dialog", "laundry-roll-config-dialog"],
            width: 460,
            buttons: {
                roll: {
                    label: "Roll",
                    callback: (html) => {
                        const root = html[0];
                        const testType = root.querySelector('[name="testType"]')?.value === "luck" ? "luck" : "common";

                        if (testType === "luck") {
                            finish({
                                pool: awaitSafeNumber(root.querySelector('[name="pool"]')?.value, config.pool),
                                dn: 4,
                                complexity: 1,
                                shift: 0,
                                testType,
                                difficultyPreset: "standard",
                                preRollLuck: "none"
                            });
                            return;
                        }

                        const difficultyPreset = _normalizeDifficultyPreset(
                            root.querySelector('[name="difficultyPreset"]')?.value ?? config.difficultyPreset
                        );
                        const presetData = _getDifficultyPresetData(difficultyPreset);

                        finish({
                            pool: awaitSafeNumber(root.querySelector('[name="pool"]')?.value, config.pool),
                            dn: _clampDn(presetData.dn),
                            complexity: Math.max(1, awaitSafeNumber(presetData.complexity, config.complexity)),
                            shift: _clampShift(root.querySelector('[name="shift"]')?.value ?? config.shift),
                            testType,
                            difficultyPreset,
                            preRollLuck: root.querySelector('[name="preRollLuck"]')?.value === "maximize" ? "maximize" : "none"
                        });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => finish(null)
                }
            },
            default: "roll",
            render: (html) => {
                const root = html[0];
                if (!root) return;

                const testTypeInput = root.querySelector('[name="testType"]');
                const presetInput = root.querySelector('[name="difficultyPreset"]');
                const shiftInput = root.querySelector('[name="shift"]');
                const poolInput = root.querySelector('[name="pool"]');
                const difficultyRow = root.querySelector('[data-roll-config-row="difficulty"]');
                const shiftRow = root.querySelector('[data-roll-config-row="shift"]');
                const preLuckRow = root.querySelector('[data-roll-config-row="preluck"]');
                const summary = root.querySelector("[data-roll-config-summary]");

                const syncView = () => {
                    const isLuckTest = testTypeInput?.value === "luck";
                    if (difficultyRow) difficultyRow.hidden = isLuckTest;
                    if (shiftRow) shiftRow.hidden = isLuckTest;
                    if (preLuckRow) preLuckRow.hidden = isLuckTest;
                    if (poolInput) poolInput.disabled = isLuckTest;
                    if (summary) {
                        if (isLuckTest) {
                            summary.textContent = `Luck Test: Team Luck ${teamLuck}/${teamLuckMax}, DN 4, Comp 1.`;
                        } else {
                            const presetLabel = presetInput?.selectedOptions?.[0]?.textContent?.trim() ?? "Standard";
                            const shiftLabel = shiftInput?.selectedOptions?.[0]?.textContent?.trim() ?? "None";
                            const difficultyPreset = _normalizeDifficultyPreset(
                                presetInput?.value ?? config.difficultyPreset
                            );
                            const baseComplexity = Math.max(
                                1,
                                Math.trunc(Number(_getDifficultyPresetData(difficultyPreset).complexity) || 1)
                            );
                            const effectiveComplexity = Math.max(1, baseComplexity + safeComplexityPenalty);
                            const penaltySummary = safeComplexityPenalty > 0
                                ? ` (+${safeComplexityPenalty} Injury Penalty)`
                                : "";
                            summary.textContent = `Common Test: ${presetLabel}; ${shiftLabel}; Comp ${effectiveComplexity}${penaltySummary}.`;
                        }
                    }
                };

                testTypeInput?.addEventListener("change", syncView);
                presetInput?.addEventListener("change", syncView);
                shiftInput?.addEventListener("change", syncView);
                syncView();
            },
            close: () => finish(null)
        }).render(true);
    });
}

function awaitSafeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : Number(fallback);
}

function _clampShift(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-2, Math.min(2, Math.trunc(n)));
}

function _clampDn(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 4;
    return Math.max(2, Math.min(6, Math.trunc(n)));
}

function _clampDie(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(6, Math.trunc(n)));
}

function _escapeHtml(value) {
    const text = String(value ?? "");
    const escape = globalThis.foundry?.utils?.escapeHTML;
    if (typeof escape === "function") return escape(text);
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function _normalizeModifierToken(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function _resolveActiveEffectChangeDelta(change = {}) {
    const mode = Math.trunc(Number(change?.mode) || CONST.ACTIVE_EFFECT_MODES.ADD);
    const value = Number(change?.value);
    if (!Number.isFinite(value) || value === 0) return 0;
    if (mode === CONST.ACTIVE_EFFECT_MODES.ADD) return Math.trunc(value);
    if (mode === CONST.ACTIVE_EFFECT_MODES.OVERRIDE) return Math.trunc(value);
    return 0;
}

function _collectDifficultyModifierMapFromEffects(actor) {
    const totals = new Map();
    if (!actor) return totals;

    for (const effect of actor.effects ?? []) {
        if (effect?.disabled === true) continue;
        const changes = Array.isArray(effect?.changes) ? effect.changes : [];
        for (const change of changes) {
            const normalizedKey = _normalizeDifficultyChangeKey(change?.key);
            if (!normalizedKey) continue;
            const scopedKey = normalizedKey.slice(ROLL_EFFECT_DIFFICULTY_PREFIX.length);
            const delta = _resolveActiveEffectChangeDelta(change);
            if (!delta) continue;
            totals.set(scopedKey, (totals.get(scopedKey) ?? 0) + delta);
        }
    }

    return totals;
}

function _getDifficultyPenaltyFromEffects({ actor, rollContext = null } = {}) {
    if (!actor) {
        return { complexityDelta: 0, notes: [], notice: "", matches: [] };
    }

    const map = _collectDifficultyModifierMapFromEffects(actor);
    if (!map.size) {
        return { complexityDelta: 0, notes: [], notice: "", matches: [] };
    }

    const attributeToken = _normalizeModifierToken(
        rollContext?.attribute
        || (String(rollContext?.sourceType ?? "").toLowerCase() === "attribute"
            ? rollContext?.sourceName
            : "")
    );
    const skillToken = _normalizeModifierToken(
        rollContext?.skillName
        || (["skill", "weapon", "spell"].includes(String(rollContext?.sourceType ?? "").toLowerCase())
            ? rollContext?.sourceName
            : "")
    );

    const candidates = [];
    if (attributeToken && skillToken) candidates.push(`${attributeToken}.${skillToken}`);
    if (attributeToken) candidates.push(`${attributeToken}.all`);
    if (skillToken) candidates.push(`all.${skillToken}`);
    candidates.push("all.all");

    const scopedKeys = Array.from(new Set(candidates.filter(Boolean)));
    let complexityDelta = 0;
    const matches = [];
    for (const key of scopedKeys) {
        const value = Math.trunc(Number(map.get(key) ?? 0) || 0);
        if (!value) continue;
        complexityDelta += value;
        matches.push({ key, value });
    }

    if (!complexityDelta) {
        return { complexityDelta: 0, notes: [], notice: "", matches: [] };
    }

    const summary = matches
        .map(entry => `${entry.key} ${entry.value > 0 ? "+" : ""}${entry.value}`)
        .join(", ");
    const notes = [
        complexityDelta > 0
            ? `Injury Penalty: +${complexityDelta} Complexity.`
            : `Modifier: ${complexityDelta} Complexity.`
    ];

    return {
        complexityDelta,
        notes,
        notice: summary ? `Matched effect modifiers: ${summary}` : "",
        matches
    };
}

async function _refreshLuckSnapshot(state) {
    state.teamLuck = await _getTeamLuck();
    state.teamLuckMax = await _getTeamLuckMax();
    if (state?.actorId) {
        const actor = game.actors?.get(state.actorId);
        if (actor) {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            state.adrenalineAvailable = current;
            state.adrenalineRemaining = current;
        }
    }
}

async function _spendTeamLuck(amount = 1) {
    const current = await _getTeamLuck();
    const spend = Math.max(0, Number(amount) || 0);
    if (current < spend) return false;
    await game.settings.set("laundry-rpg", TEAM_LUCK_SETTING, current - spend);
    return true;
}

async function _getTeamLuck() {
    const value = Number(game.settings.get("laundry-rpg", TEAM_LUCK_SETTING));
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

async function _getTeamLuckMax() {
    const value = Number(game.settings.get("laundry-rpg", TEAM_LUCK_MAX_SETTING));
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
