/**
 * The Laundry RPG dice roller.
 *
 * Mechanics:
 *  • Roll a pool of d6s.
 *  • Each die equal to or above the Difficulty Number (DN, default 4) is a success.
 *  • Focus is spent directly in the chat card (no focus pop-ups).
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

    html.find(".spend-focus").off("click.laundry-focus").on("click.laundry-focus", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _spendFocus(message, state);
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
        extraDice: [],
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
    const extraDice = state.extraDice ?? [];
    const effectiveDn = Number(state.effectiveDn ?? state.dn ?? 4);
    const base = rawDice.map((val, idx) => ({
        index: idx,
        value: val,
        success: val >= effectiveDn,
        extra: false
    }));
    const extras = extraDice.map((val, idx) => ({
        index: rawDice.length + idx,
        value: val,
        success: val >= effectiveDn,
        extra: true
    }));
    return base.concat(extras);
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
            r.extra ? "focus-die" : ""
        ].join(" ").trim();
        return `<li class="${cls}" data-die-index="${r.index}">${r.value}</li>`;
    }).join("");

    const damageSection = state.damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${state.damage}</div>`
        : "";

    const focusRemaining = Number.isFinite(state.focusRemaining)
        ? Number(state.focusRemaining)
        : Number(state.focusAvailable ?? 0);
    const focusDisabled = !state.focusItemId || focusRemaining <= 0;
    const focusControls = `
        <div class="laundry-focus-controls">
            <button type="button" class="spend-focus" data-item-id="${state.focusItemId ?? ""}" ${focusDisabled ? "disabled" : ""}>Spend Focus</button>
            <span class="laundry-focus-meta">Remaining: ${Math.max(0, focusRemaining)} | Spent: ${state.focusSpent ?? 0}</span>
        </div>`;

    const extraCount = Array.isArray(state.extraDice) ? state.extraDice.length : 0;
    const poolLabel = extraCount > 0 ? `${state.pool}+${extraCount}` : `${state.pool}`;

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${poolLabel}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})</div>
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

    await focusItem.update({ "system.focus": current - 1 });

    const extraRoll = new Roll("1d6");
    await extraRoll.evaluate();
    const extraResult = extraRoll.terms[0].results[0]?.result ?? 1;

    state.extraDice = Array.isArray(state.extraDice) ? state.extraDice : [];
    state.extraDice.push(extraResult);
    state.focusSpent = Number(state.focusSpent ?? 0) + 1;
    state.focusAvailable = Number(state.focusAvailable ?? current);
    state.focusRemaining = Math.max(0, current - 1);

    await _updateDiceMessage(message, state);
}

async function _updateDiceMessage(message, state) {
    await message.update({
        content: _renderDiceContent(state),
        flags: { "laundry-rpg": { diceState: state } }
    });
}
