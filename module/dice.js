/**
 * The Laundry RPG dice roller.
 *
 * Mechanics:
 *  • Roll a pool of d6s.
 *  • Each die equal to or above the Difficulty Number (DN, default 4) is a success.
 *  • Focus is applied directly in the chat card to rolled dice (+1 per point).
 */

export async function rollDice({
    pool = 1,
    flavor = "Dice Roll",
    dn = 4,
    complexity = 1,
    damage,
    difficultyShift = 0,
    actorId,
    focusItemId
} = {}) {
    return _executeRoll(pool, dn, complexity, flavor, damage, difficultyShift, actorId, focusItemId);
}

export function bindDiceChatControls(message, html) {
    const state = _getDiceState(message);
    if (!state) return;

    html.find(".laundry-die").off("click.laundry-focus-die").on("click.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _updateDiceMessage(message, state);
    });
    html.find(".laundry-die").off("dblclick.laundry-focus-die").on("dblclick.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _spendFocus(message, state);
    });

    html.find(".apply-focus").off("click.laundry-focus").on("click.laundry-focus", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _spendFocus(message, state);
    });
    html.find(".auto-focus").off("click.laundry-focus-auto").on("click.laundry-focus-auto", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        state.selectedDieIndex = _findAutoFocusDie(state);
        await _spendFocus(message, state);
    });
    html.find(".undo-focus").off("click.laundry-focus-undo").on("click.laundry-focus-undo", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _undoFocus(message, state);
    });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _executeRoll(pool, dn, complexity, flavor, damage, difficultyShift = 0, actorId, focusItemId) {
    const shift = Math.max(-2, Math.min(2, difficultyShift || 0));
    const effectiveDn = Math.max(2, Math.min(6, (dn || 4) + shift));

    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();

    let focusAvailable = 0;
    if (actorId && focusItemId) {
        const actor = game.actors?.get(actorId);
        const focusItem = actor?.items?.get(focusItemId);
        focusAvailable = Number(focusItem?.system?.focus ?? 0);
    }

    const rawDice = roll.terms[0].results.map(d => d.result);
    const state = {
        pool,
        dn,
        complexity,
        shift,
        effectiveDn,
        damage: damage ?? "",
        rawDice,
        focusAllocations: [],
        focusHistory: [],
        selectedDieIndex: null,
        focusSpent: 0,
        focusAvailable,
        focusRemaining: focusAvailable,
        actorId: actorId ?? null,
        focusItemId: focusItemId ?? null
    };

    const speaker = actorId ? ChatMessage.getSpeaker({ actor: game.actors?.get(actorId) }) : ChatMessage.getSpeaker();
    await ChatMessage.create({
        speaker,
        flavor,
        content: _renderDiceContent(state),
        rolls: [roll],
        flags: { "laundry-rpg": { diceState: state } },
        sound: CONFIG.sounds.dice
    });
}

function _getDiceState(message) {
    return foundry.utils.deepClone(message.getFlag("laundry-rpg", "diceState"));
}

function _buildResults(state) {
    const rawDice = state.rawDice ?? [];
    const allocations = Array.isArray(state.focusAllocations) ? state.focusAllocations : [];
    const effectiveDn = Number(state.effectiveDn ?? state.dn ?? 4);
    return rawDice.map((val, idx) => {
        const bonus = Number(allocations[idx] ?? 0);
        const adjusted = Math.max(1, Math.min(6, Number(val ?? 1) + bonus));
        const selected = Number(state.selectedDieIndex) === idx;
        return {
            index: idx,
            value: adjusted,
            rawValue: val,
            bonus,
            success: adjusted >= effectiveDn,
            selected
        };
    });
}

function _renderDiceContent(state) {
    const results = _buildResults(state);
    const successes = results.filter(r => r.success).length;
    const complexity = Number(state.complexity ?? 1);
    const margin = successes - complexity;
    const isSuccess = successes >= complexity;

    const shift = Number(state.shift ?? 0);
    const shiftLabel = shift === 0
        ? "No Advantage"
        : (shift < 0
            ? (shift === -1 ? "Advantage" : "Greater Advantage")
            : (shift === 1 ? "Disadvantage" : "Greater Disadvantage"));

    let benefitLabel = "";
    if (isSuccess) {
        if (margin >= 3) benefitLabel = "Major Benefit";
        else if (margin >= 1) benefitLabel = "Minor Benefit";
    }

    const diceHtml = results.map(r => {
        const cls = [
            "roll", "die", "d6", "laundry-die",
            r.success ? "success" : "failure",
            r.bonus > 0 ? "focus-boosted" : "",
            r.selected ? "focus-selected" : ""
        ].join(" ").trim();
        const valueText = r.bonus > 0 ? `${r.rawValue}+${r.bonus}=${r.value}` : `${r.value}`;
        return `<li class="${cls}" data-die-index="${r.index}" title="Select die for Focus">${valueText}</li>`;
    }).join("");

    const damageSection = state.damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${state.damage}</div>`
        : "";

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
    const focusControls = `
        <div class="laundry-focus-controls">
            <button type="button" class="apply-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${applyDisabled ? "disabled" : ""}>Apply Focus</button>
            <button type="button" class="auto-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${autoDisabled ? "disabled" : ""}>Auto Focus</button>
            <button type="button" class="undo-focus spend-focus" data-item-id="${state.focusItemId ?? ""}" ${undoDisabled ? "disabled" : ""}>Undo</button>
            <span class="laundry-focus-meta">${selectedDieLabel} | Remaining: ${Math.max(0, focusRemaining)} | Spent: ${state.focusSpent ?? 0}</span>
        </div>`;

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${state.pool}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})</div>
        <ol class="dice-rolls">${diceHtml}</ol>
        ${focusControls}
        <div class="dice-outcome ${isSuccess ? "outcome-success" : "outcome-failure"}">
            <strong>${isSuccess ? "Success" : "Failure"}</strong>
            <span class="success-count">(Successes: ${successes}/${complexity})</span>
            ${benefitLabel ? `<span class="benefit-label">${benefitLabel}</span>` : ""}
            <span class="focus-spent">(Focus used: ${state.focusSpent ?? 0})</span>
        </div>
        ${damageSection}
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

    await _updateDiceMessage(message, state);
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

async function _updateDiceMessage(message, state) {
    await message.update({
        content: _renderDiceContent(state),
        flags: { "laundry-rpg": { diceState: state } }
    });
}
