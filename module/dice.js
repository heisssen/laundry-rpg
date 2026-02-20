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
    const defenceRating = hasTarget
        ? Math.max(0, Math.trunc(Number(targetActor?.system?.derived?.defence?.value) || 0))
        : 0;
    const ladderDelta = hasTarget ? (attackerRating - defenceRating) : 0;

    return {
        target,
        isMelee,
        hasTarget,
        attackerRating,
        defenceRating,
        ladderDelta,
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
    testType = "common"
} = {}) {
    const baseConfig = {
        pool: Math.max(0, Number(pool) || 0),
        dn: _clampDn(dn),
        complexity: Math.max(1, Number(complexity) || 1),
        shift: _clampShift(difficultyShift),
        testType: testType === "luck" ? "luck" : "common",
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
        preRollLuckUsed
    });
}

export function bindDiceChatControls(message, html) {
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

    html.find(".apply-damage").off("click.laundry-apply-damage").on("click.laundry-apply-damage", async (ev) => {
        ev.preventDefault();
        await _applyDamage(message);
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
    preRollLuckUsed
}) {
    const effectiveDn = Math.max(2, Math.min(6, (dn || 4) + (shift || 0)));

    let roll = null;
    let rawDice = [];

    if (preRollLuckUsed) {
        rawDice = Array.from({ length: pool }, () => 6);
    } else {
        roll = new Roll(`${pool}d6`);
        await roll.evaluate();
        rawDice = roll.terms[0].results.map(d => d.result);
    }

    const actor = actorId ? game.actors?.get(actorId) : null;
    let focusAvailable = 0;
    if (!isLuckTest && actorId && focusItemId) {
        const focusItem = actor?.items?.get(focusItemId);
        focusAvailable = Number(focusItem?.system?.focus ?? 0);
    }

    const target = targetSnapshot || _getPrimaryTargetSnapshot();
    const damageData = await _evaluateDamage({
        damage,
        isWeaponAttack,
        actor,
        damageBonus
    });

    const state = {
        pool,
        dn,
        complexity,
        shift,
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
        targetCount: target?.count ?? 0,
        rawDice,
        focusAllocations: [],
        focusHistory: [],
        selectedDieIndex: null,
        focusSpent: 0,
        focusAvailable,
        focusRemaining: focusAvailable,
        allowFocusControls: !isLuckTest && allowPostRollFocus !== false,
        actorId: actorId ?? null,
        focusItemId: !isLuckTest ? (focusItemId ?? null) : null,
        attackMeta: attackMeta ?? null,
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
    const damageSection = _renderDamageSection(state);

    const teamLuck = Math.max(0, Number(state.teamLuck ?? 0));
    const teamLuckMax = Math.max(0, Number(state.teamLuckMax ?? 0));

    const focusSection = (state.isLuckTest || state.allowFocusControls === false) ? "" : _renderFocusControls(state);
    const luckSection = _renderLuckControls(state, teamLuck, teamLuckMax);

    const formulaBits = state.isLuckTest
        ? `${state.pool}d6 Luck Test (fixed DN 4:1)`
        : `${state.pool}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})`;

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${formulaBits}</div>
        ${attackMetaSection}
        ${targetSection}
        ${state.preRollLuckUsed ? '<div class="dice-formula">Luck spent: Maximise Successes (all dice treated as 6).</div>' : ''}
        <ol class="dice-rolls">${diceHtml}</ol>
        <div class="dice-roll-summary">
            <span class="crit-summary">${_escapeHtml(game.i18n.localize("LAUNDRY.Criticals"))}: ${criticals}</span>
            <span class="comp-summary">${_escapeHtml(game.i18n.localize("LAUNDRY.Complications"))}: ${complications}</span>
        </div>
        ${focusSection}
        ${luckSection}
        <div class="dice-outcome ${outcome.cssClass}">
            <strong>${outcome.label}</strong>
            <span class="success-count">(Successes: ${outcome.successes}/${outcome.complexity})</span>
            ${state.isLuckTest ? "" : `<span class="focus-spent">(Focus used: ${state.focusSpent ?? 0})</span>`}
        </div>
        ${damageSection}
    </div>`;
}

function _buildOutcome(state, results) {
    const successes = results.filter(r => r.success).length;
    const complexity = Math.max(1, Number(state.complexity ?? 1) || 1);
    const margin = successes - complexity;

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
            ${meta.focusSpentPreRoll ? `<div class="attack-pre-spend">${_escapeHtml(game.i18n.localize("LAUNDRY.SpendFocusBoost"))}</div>` : ""}
            ${meta.adrenalineSpentPreRoll ? `<div class="attack-pre-spend">${_escapeHtml(game.i18n.localize("LAUNDRY.SpendAdrenalineBoost"))}</div>` : ""}
        </div>`;
}

function _renderTargetSection(state) {
    const targetName = String(state.targetName ?? "").trim();
    if (!targetName) return "";

    const count = Math.max(1, Number(state.targetCount ?? 1) || 1);
    const label = count > 1 ? `${targetName} (+${count - 1} more)` : targetName;
    return `<div class="target-section"><strong>${_escapeHtml(game.i18n.localize("LAUNDRY.Target"))}:</strong> ${_escapeHtml(label)}</div>`;
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
    const buttonDisabled = !hasTarget || !hasRolledTotal;
    const breakdown = !hasFormula
        ? game.i18n.localize("LAUNDRY.NoDamageFormula")
        : (hasRolledTotal
            ? (bonus > 0 && hasBaseTotal
                ? `${escapedFormula} = ${Math.max(0, Math.trunc(baseTotal))} + ${bonus} (${_escapeHtml(game.i18n.localize("LAUNDRY.Adrenaline"))}) = <strong class="damage-total">${Math.max(0, Math.trunc(total))}</strong>`
                : `${escapedFormula} = <strong class="damage-total">${Math.max(0, Math.trunc(total))}</strong>`)
            : `${escapedFormula} (${_escapeHtml(game.i18n.localize("LAUNDRY.DamageNotRollable"))})`);
    const buttonTitle = hasTarget
        ? game.i18n.localize("LAUNDRY.ApplyDamageTooltip")
        : game.i18n.localize("LAUNDRY.SelectTargetForDamage");

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

async function _updateDiceMessage(message, state) {
    await message.update({
        content: _renderDiceContent(state),
        flags: { "laundry-rpg": { diceState: state } }
    });
}

async function _applyDamage(message) {
    const state = _getDiceState(message);
    if (!state?.isWeaponAttack) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NotWeaponAttackCard"));
        return;
    }

    const targetActor = _resolveTargetActor(state);
    if (!targetActor) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.NoAttackTargetCaptured"));
        return;
    }

    const canApply = _canCurrentUserApplyDamage(state);
    if (!canApply) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.CannotApplyDamage"));
        return;
    }

    const rawDamage = Number(state.damageTotal);
    if (!Number.isFinite(rawDamage)) {
        ui.notifications.warn(game.i18n.localize("LAUNDRY.DamageNotRollable"));
        return;
    }

    const rolledDamage = Math.max(0, Math.trunc(rawDamage));
    const armour = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.armour?.value ?? 0)));
    const appliedDamage = Math.max(0, rolledDamage - armour);
    const currentToughness = Math.max(0, Math.trunc(Number(targetActor.system?.derived?.toughness?.value ?? 0)));
    const maxToughness = Math.max(
        currentToughness,
        Math.trunc(Number(targetActor.system?.derived?.toughness?.max ?? currentToughness))
    );
    const newToughness = Math.max(0, currentToughness - appliedDamage);
    const newDamageTaken = Math.max(0, maxToughness - newToughness);

    await targetActor.update({
        "system.derived.toughness.value": newToughness,
        "system.derived.toughness.damage": newDamageTaken
    });

    ui.notifications.info(game.i18n.format("LAUNDRY.DamageApplied", {
        name: targetActor.name,
        rolled: rolledDamage,
        armour,
        applied: appliedDamage,
        from: currentToughness,
        to: newToughness
    }));
}

function _resolveTargetActor(state) {
    const tokenId = state?.targetTokenId;
    const tokenActor = tokenId ? canvas.tokens?.get(tokenId)?.actor : null;
    if (tokenActor) return tokenActor;

    const actorId = state?.targetActorId;
    if (!actorId) return null;
    return game.actors?.get(actorId) ?? null;
}

function _canCurrentUserApplyDamage(state) {
    const targetActor = _resolveTargetActor(state);
    return Boolean(game.user?.isGM || targetActor?.isOwner);
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

function _getPrimaryTargetSnapshot() {
    const targets = Array.from(game.user?.targets ?? []);
    if (!targets.length) return null;

    const [primary] = targets;
    if (!primary) return null;

    const token = primary.document ?? primary;
    const actor = primary.actor ?? token?.actor ?? null;
    const name = primary.name ?? token?.name ?? actor?.name ?? "";

    return {
        name,
        actorId: actor?.id ?? null,
        tokenId: primary.id ?? token?.id ?? null,
        count: targets.length
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
            <label>Difficulty (DN)</label>
            <input type="number" name="dn" min="2" max="6" value="${_clampDn(config.dn)}" />
        </div>
        <div class="form-group">
            <label>Complexity</label>
            <input type="number" name="complexity" min="1" value="${Math.max(1, Number(config.complexity) || 1)}" />
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
                                preRollLuck: "none"
                            });
                            return;
                        }

                        finish({
                            pool: awaitSafeNumber(root.querySelector('[name="pool"]')?.value, config.pool),
                            dn: _clampDn(root.querySelector('[name="dn"]')?.value ?? config.dn),
                            complexity: Math.max(1, awaitSafeNumber(root.querySelector('[name="complexity"]')?.value, config.complexity)),
                            shift: _clampShift(root.querySelector('[name="shift"]')?.value ?? config.shift),
                            testType,
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
