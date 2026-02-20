/**
 * The Laundry RPG dice roller.
 *
 * Core mechanics automated here:
 * - DN and Complexity driven tests.
 * - Advantage/Disadvantage as DN shifts.
 * - Focus applied to rolled dice (+1 per point).
 * - Team Luck usage and Luck Tests.
 */

const TEAM_LUCK_SETTING = "teamLuck";
const TEAM_LUCK_MAX_SETTING = "teamLuckMax";

export function getWeaponAttackContext({ actor, weapon, linkedSkillName = "" } = {}) {
    const target = _getPrimaryTargetSnapshot();
    const targetActor = _resolveTargetActor(target);
    const isMelee = _isMeleeWeapon({ weapon, linkedSkillName });
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
    const defencePenalty = _actorHasStatus(targetActor, "blinded") ? 1 : 0;
    const defenceRating = Math.max(0, baseDefence - defencePenalty);
    const ladderDelta = hasTarget ? (attackerRating - defenceRating) : 0;

    return {
        target,
        isMelee,
        hasTarget,
        attackerRating,
        defenceRating,
        ladderDelta,
        defencePenalty,
        dn: hasTarget ? _mapAttackDnFromDelta(ladderDelta) : 4
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

    const configured = prompt
        ? await _promptRollConfig(baseConfig)
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

    return _executeRoll({
        pool: finalPool,
        dn: isLuckTest ? 4 : _clampDn(configured.dn),
        complexity: isLuckTest ? 1 : Math.max(1, Number(configured.complexity) || 1),
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
        rollContext
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
    rollContext
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
        statusNotes: Array.isArray(statusMods.notes) ? statusMods.notes : [],
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

    await ChatMessage.create(payload);
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
    if (!notes.length && poolDelta === 0 && shiftDelta === 0) return "";

    const parts = [];
    if (poolDelta !== 0) parts.push(`Pool ${poolDelta > 0 ? "+" : ""}${poolDelta}`);
    if (shiftDelta !== 0) parts.push(`DN Shift ${shiftDelta > 0 ? "+" : ""}${shiftDelta}`);
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

    if (!hasFormula && !isWeaponAttack) return "";

    const escapedFormula = _escapeHtml(formula);
    const total = Number(state.damageTotal);
    const baseTotal = Number(state.damageBaseTotal);
    const bonus = Math.max(0, Math.trunc(Number(state.damageBonus ?? 0) || 0));
    const hasRolledTotal = Number.isFinite(total);
    const hasBaseTotal = Number.isFinite(baseTotal);

    if (!isWeaponAttack) {
        return `<div class="damage-section"><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Damage"))}:</strong> ${escapedFormula}</div>`;
    }

    const hasTarget = Boolean(String(state.targetName ?? "").trim());
    const outcome = _buildOutcome(state, _buildResults(state));
    const hasHit = outcome.successes >= outcome.complexity;
    const buttonDisabled = !hasTarget || !hasRolledTotal || !hasHit;
    const breakdown = !hasFormula
        ? game.i18n.localize("LAUNDRY.NoDamageFormula")
        : (hasRolledTotal
            ? (bonus > 0 && hasBaseTotal
                ? `${escapedFormula} = ${Math.max(0, Math.trunc(baseTotal))} + ${bonus} (${_escapeHtml(game.i18n.localize("LAUNDRY.Adrenaline"))}) = <strong class="damage-total">${Math.max(0, Math.trunc(total))}</strong>`
                : `${escapedFormula} = <strong class="damage-total">${Math.max(0, Math.trunc(total))}</strong>`)
            : `${escapedFormula} (${_escapeHtml(game.i18n.localize("LAUNDRY.DamageNotRollable"))})`);
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

    const rawDamage = Number(state.damageTotal);
    if (!Number.isFinite(rawDamage)) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.DamageNotRollable"));
        return;
    }

    const rolledDamage = Math.max(0, Math.trunc(rawDamage));
    const traits = _extractWeaponTraits(state);
    const attackMeta = state.attackMeta ?? {};
    const isAreaAttack = Boolean(traits.area || attackMeta.areaMode);
    const templateTargets = isAreaAttack ? _resolveTemplateActors(state) : [];
    const targets = isAreaAttack
        ? (templateTargets.length ? templateTargets : allTargets)
        : [allTargets[0]];
    const criticals = results.filter(result => result.rawValue === 6).length;
    const summaries = [];
    const armourIgnored = traits.piercing ? criticals : 0;

    for (const targetActor of targets) {
        if (!targetActor) continue;
        const armour = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.armour?.value ?? 0)));
        const effectiveArmour = Math.max(0, armour - armourIgnored);
        let appliedDamage = Math.max(0, rolledDamage - effectiveArmour);
        let adrenalineReduced = false;
        let nextAdrenaline = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.adrenaline?.value ?? 0)));

        if (appliedDamage > 0 && nextAdrenaline > 0) {
            const spendAdrenaline = await Dialog.confirm({
                title: "Adrenaline Reaction",
                content: `<p><strong>${_escapeHtml(targetActor.name ?? "Agent")}</strong> can spend 1 Adrenaline to halve incoming damage.</p>`
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
        const newToughness = Math.max(0, currentToughness - appliedDamage);
        const newDamageTaken = Math.max(0, maxToughness - newToughness);
        const overflowDamage = Math.max(0, appliedDamage - currentToughness);

        const updateData = {
            "system.derived.toughness.value": newToughness,
            "system.derived.toughness.damage": newDamageTaken
        };
        if (adrenalineReduced) {
            updateData["system.derived.adrenaline.value"] = nextAdrenaline;
        }
        await targetActor.update(updateData);

        if (traits.crushing && appliedDamage > 0) {
            await _applyConditionToActor(targetActor, "stunned", { durationRounds: 1, source: "weapon-crushing" });
        }
        if (traits.suppressive || attackMeta.suppressiveMode) {
            await _applyConditionToActor(targetActor, "weakened", { durationRounds: 1, source: "weapon-suppressive" });
        }

        summaries.push({
            name: targetActor.name,
            rolled: rolledDamage,
            armour: effectiveArmour,
            applied: appliedDamage,
            from: currentToughness,
            to: newToughness,
            adrenalineReduced
        });

        if (appliedDamage > 0 && currentToughness > 0 && newToughness <= 0) {
            await _postCriticalWoundPrompt({
                targetActor,
                damageTaken: overflowDamage
            });
        }
    }

    if (!summaries.length) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NoAttackTargetCaptured"));
        return;
    }

    if (summaries.length === 1) {
        const summary = summaries[0];
        ui.notifications.info(game.i18n.format("LAUNDRY.DamageApplied", {
            name: summary.name,
            rolled: summary.rolled,
            armour: summary.armour,
            applied: summary.applied,
            from: summary.from,
            to: summary.to
        }));
    } else {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            content: `<p><strong>Area Damage Applied:</strong> ${summaries.map(summary =>
                `${_escapeHtml(summary.name)} (${summary.from} -> ${summary.to}, -${summary.applied})`
            ).join(" | ")}</p>`
        });
    }

    if (armourIgnored > 0) {
        ui.notifications.info(`Piercing: ignored ${armourIgnored} armour from ${criticals} critical(s).`);
    }
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
    return {
        piercing: tokens.includes("piercing") || /\bpiercing\b/.test(asBlob),
        crushing: tokens.includes("crushing") || /\bcrushing\b/.test(asBlob),
        burst: tokens.includes("burst") || /\bburst\b/.test(asBlob),
        automatic: tokens.includes("automatic") || tokens.includes("auto") || /\bautomatic\b/.test(asBlob) || /\bauto\b/.test(asBlob),
        suppressive: tokens.includes("suppressive") || /\bsuppressive\b/.test(asBlob),
        area: tokens.includes("area") || tokens.includes("blast") || tokens.includes("spread") || /\barea\b/.test(asBlob) || /\bblast\b/.test(asBlob) || /\bspread\b/.test(asBlob),
        reload: tokens.includes("reload") || /\breload\b/.test(asBlob)
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
            if (statusId) statuses.add(String(statusId));
        }
        const legacyStatus = effect.getFlag?.("core", "statusId");
        if (legacyStatus) statuses.add(String(legacyStatus));
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
    const attribute = String(rollContext?.attribute ?? "").toLowerCase();
    const attackMode = String(rollContext?.attackMode ?? "").toLowerCase();

    const isVisionRoll = isWeaponAttack || ["awareness", "ranged", "reflexes", "stealth", "close combat"].includes(skillName);
    const isBodyRoll = isWeaponAttack
        || attribute === "body"
        || sourceType === "attribute" && sourceName === "body"
        || ["athletics", "might", "fortitude", "close combat", "ranged", "reflexes", "survival", "stealth"].includes(skillName);
    const isMindSpiritRoll = attribute === "mind"
        || attribute === "spirit"
        || sourceType === "attribute" && (sourceName === "mind" || sourceName === "spirit")
        || ["academics", "awareness", "bureaucracy", "computers", "engineering", "intuition", "magic", "medicine", "occult", "presence", "resolve", "science", "technology", "zeal", "fast talk"].includes(skillName);

    if (own.has("blinded") && isVisionRoll) {
        poolDelta -= 1;
        notes.push("Blinded: Disadvantage on vision checks (-1d6).");
    }

    if (own.has("weakened") && isBodyRoll) {
        poolDelta -= 1;
        notes.push("Weakened: -1 die on Body/physical actions.");
    }

    if (own.has("bleeding") && isBodyRoll) {
        poolDelta -= 1;
        notes.push("Bleeding: -1 die on strenuous physical actions.");
    }

    if (own.has("frightened") && (isMindSpiritRoll || isWeaponAttack)) {
        poolDelta -= 1;
        notes.push("Frightened: -1 die on attacks and Mind/Spirit actions.");
    }

    if (isWeaponAttack) {
        if (target.has("prone")) {
            if (attackMode === "melee") {
                poolDelta += 1;
                notes.push("Target Prone: melee Advantage (+1d6).");
            } else {
                poolDelta -= 1;
                notes.push("Target Prone: ranged Disadvantage (-1d6).");
            }
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

async function _postCriticalWoundPrompt({ targetActor, damageTaken = 0 } = {}) {
    if (!targetActor) return;
    const safeName = _escapeHtml(targetActor.name ?? "Unknown");
    const applied = Math.max(0, Math.trunc(Number(damageTaken) || 0));

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        content: `
            <div class="laundry-critical-wound-card">
                <div class="critical-wound-title"><strong>CRITICAL WOUND: ${safeName}</strong></div>
                <button type="button" class="roll-injury" data-damage-taken="${applied}" data-target-name="${safeName}" data-target-actor-id="${targetActor.id}">Roll Injury</button>
            </div>`
    });
}

async function _rollInjuryFromButton(ev) {
    const button = ev?.currentTarget;
    const damageTaken = Math.max(0, Math.trunc(Number(button?.dataset?.damageTaken ?? 0) || 0));
    const targetName = String(button?.dataset?.targetName ?? "").trim();
    const targetActorId = String(button?.dataset?.targetActorId ?? "").trim();
    const targetActor = targetActorId ? game.actors?.get(targetActorId) ?? null : null;
    const roll = new Roll(`1d6 + ${damageTaken}`);
    await roll.evaluate();
    const total = Math.max(0, Math.trunc(Number(roll.total ?? 0) || 0));
    const resolved = await _resolveOutcomeFromAutomationTable({
        tableType: "injury",
        total
    });
    const outcome = resolved?.text ?? _getInjuryOutcome(total);
    const targetLabel = targetName ? ` for ${_escapeHtml(targetName)}` : "";
    const statusId = String(resolved?.statusId ?? "").trim().toLowerCase();
    const durationRounds = Math.max(0, Math.trunc(Number(resolved?.durationRounds) || 0));
    const statusApplied = Boolean(
        targetActor
        && statusId
        && await game.laundry?.applyCondition?.(targetActor, statusId, {
            durationRounds,
            source: "injury-table",
            suppressChat: true
        })
    );

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-injury-result-card">
                <strong>INJURY RESULT${targetLabel}:</strong>
                1d6 + ${damageTaken} = <strong>${total}</strong>
                <span class="injury-outcome">(${_escapeHtml(outcome)})</span>
                ${resolved?.tableName ? `<div class="injury-outcome">Table: ${_escapeHtml(resolved.tableName)}</div>` : ""}
                ${statusApplied ? `<div class="injury-outcome">Condition Applied: ${_escapeHtml(statusId)}</div>` : ""}
            </div>`,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });
}

function _getInjuryOutcome(total) {
    const n = Math.max(0, Math.trunc(Number(total) || 0));
    if (n <= 3) return "Stunned";
    if (n <= 5) return "Bleeding";
    return "Incapacitated / Lethal";
}

async function _rollMishapFromButton(ev) {
    const button = ev?.currentTarget;
    const sourceName = String(button?.dataset?.sourceName ?? "").trim();
    const actorId = String(button?.dataset?.actorId ?? "").trim();
    const actor = actorId ? game.actors?.get(actorId) ?? null : null;
    const sourceLabel = sourceName ? ` (${_escapeHtml(sourceName)})` : "";
    const roll = new Roll("1d6");
    await roll.evaluate();
    const total = Math.max(1, Math.trunc(Number(roll.total ?? 1) || 1));
    const resolved = await _resolveOutcomeFromAutomationTable({
        tableType: "mishap",
        total
    });
    const outcome = resolved?.text ?? _getMishapOutcome(total);
    const statusId = String(resolved?.statusId ?? "").trim().toLowerCase();
    const durationRounds = Math.max(0, Math.trunc(Number(resolved?.durationRounds) || 0));
    const statusApplied = Boolean(
        actor
        && statusId
        && await game.laundry?.applyCondition?.(actor, statusId, {
            durationRounds,
            source: "mishap-table",
            suppressChat: true
        })
    );

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-mishap-result-card">
                <strong>MISHAP RESULT${sourceLabel}:</strong>
                <strong>${total}</strong>
                <span class="mishap-outcome">- ${_escapeHtml(outcome)}</span>
                ${resolved?.tableName ? `<div class="mishap-outcome">Table: ${_escapeHtml(resolved.tableName)}</div>` : ""}
                ${statusApplied ? `<div class="mishap-outcome">Condition Applied: ${_escapeHtml(statusId)}</div>` : ""}
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

async function _resolveOutcomeFromAutomationTable({ tableType, total } = {}) {
    const table = await game.laundry?.getAutomationTable?.(tableType);
    if (!table) return null;

    const results = Array.from(table.results ?? []);
    if (!results.length) return null;
    const picked = _pickTableResultByTotal(results, total);
    if (!picked) return null;

    const flagData = picked.getFlag?.("laundry-rpg", "conditionData")
        ?? picked.flags?.["laundry-rpg"]
        ?? {};
    return {
        tableName: String(table.name ?? "").trim(),
        text: _extractTableResultText(picked),
        statusId: String(flagData?.statusId ?? "").trim().toLowerCase(),
        durationRounds: Math.max(0, Math.trunc(Number(flagData?.durationRounds) || 0))
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

async function _promptRollConfig(config) {
    const teamLuck = await _getTeamLuck();
    const teamLuckMax = await _getTeamLuckMax();
    const selectedPreset = _normalizeDifficultyPreset(config.difficultyPreset);

    const shiftOpts = [
        { value: "-2", label: "Greater Advantage (-2 DN)" },
        { value: "-1", label: "Advantage (-1 DN)" },
        { value: "0", label: "None" },
        { value: "1", label: "Disadvantage (+1 DN)" },
        { value: "2", label: "Greater Disadvantage (+2 DN)" }
    ];

    const content = `
    <form class="laundry-roll-config">
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
        <div class="form-group">
            <label>Skill Difficulty Preset</label>
            <select name="difficultyPreset">
                <option value="standard" ${selectedPreset === "standard" ? "selected" : ""}>Standard (DN 4, Comp 1)</option>
                <option value="hard" ${selectedPreset === "hard" ? "selected" : ""}>Hard (DN 4, Comp 2)</option>
                <option value="daunting" ${selectedPreset === "daunting" ? "selected" : ""}>Daunting (DN 4, Comp 3)</option>
                <option value="opposed" ${selectedPreset === "opposed" ? "selected" : ""}>Opposed (DN 4, Comp 1)</option>
            </select>
            <p class="notes">Opposed: compare successes with the opposing roll.</p>
        </div>
        <div class="form-group">
            <label>Advantage</label>
            <select name="shift">
                ${shiftOpts.map(o => `<option value="${o.value}" ${Number(o.value) === Number(config.shift) ? "selected" : ""}>${o.label}</option>`).join("")}
            </select>
        </div>
        <div class="form-group">
            <label>Pre-roll Luck</label>
            <select name="preRollLuck">
                <option value="none">Do not spend Luck</option>
                <option value="maximize">Spend 1 Luck: Maximise successes</option>
            </select>
            <p class="notes">Team Luck currently: ${teamLuck}/${teamLuckMax}</p>
        </div>
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
            classes: ["laundry-rpg", "laundry-dialog"],
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
