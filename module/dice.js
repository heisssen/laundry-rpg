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

export async function rollDice({
    pool = 1,
    flavor = "Dice Roll",
    dn = 4,
    complexity = 1,
    damage,
    difficultyShift = 0,
    actorId,
    focusItemId,
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
        shift: isLuckTest ? 0 : _clampShift(configured.shift),
        actorId,
        focusItemId,
        isLuckTest,
        preRollLuckUsed
    });
}

export function bindDiceChatControls(message, html) {
    const state = _getDiceState(message);
    if (!state) return;

    html.find(".laundry-die").off("click.laundry-focus-die").on("click.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _updateDiceMessage(message, state);
    });

    html.find(".laundry-die").off("dblclick.laundry-focus-die").on("dblclick.laundry-focus-die", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        const dieIndex = Number(ev.currentTarget.dataset.dieIndex);
        if (!Number.isInteger(dieIndex)) return;
        state.selectedDieIndex = dieIndex;
        await _spendFocus(message, state);
    });

    html.find(".apply-focus").off("click.laundry-focus").on("click.laundry-focus", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _spendFocus(message, state);
    });

    html.find(".auto-focus").off("click.laundry-focus-auto").on("click.laundry-focus-auto", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        state.selectedDieIndex = _findAutoFocusDie(state);
        await _spendFocus(message, state);
    });

    html.find(".undo-focus").off("click.laundry-focus-undo").on("click.laundry-focus-undo", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner || state.isLuckTest) return;
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId) state.focusItemId = itemId;
        await _undoFocus(message, state);
    });

    html.find(".luck-reroll-failures").off("click.laundry-luck-reroll").on("click.laundry-luck-reroll", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;
        await _rerollFailuresWithLuck(message, state);
    });
}

async function _executeRoll({
    pool,
    dn,
    complexity,
    flavor,
    damage,
    shift,
    actorId,
    focusItemId,
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

    let focusAvailable = 0;
    if (!isLuckTest && actorId && focusItemId) {
        const actor = game.actors?.get(actorId);
        const focusItem = actor?.items?.get(focusItemId);
        focusAvailable = Number(focusItem?.system?.focus ?? 0);
    }

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
        focusItemId: !isLuckTest ? (focusItemId ?? null) : null,
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
    if (roll) payload.rolls = [roll];

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
    const shiftLabel = state.isLuckTest
        ? "Luck Test"
        : (shift === 0
            ? "No Advantage"
            : (shift < 0
                ? (shift === -1 ? "Advantage" : "Greater Advantage")
                : (shift === 1 ? "Disadvantage" : "Greater Disadvantage")));

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
        const valueText = `${r.value}`;
        return `<li class="${cls}" data-die-index="${r.index}" title="Select die for Focus">${valueText}</li>`;
    }).join("");

    const damageSection = state.damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${state.damage}</div>`
        : "";

    const teamLuck = Math.max(0, Number(state.teamLuck ?? 0));
    const teamLuckMax = Math.max(0, Number(state.teamLuckMax ?? 0));

    const focusSection = state.isLuckTest ? "" : _renderFocusControls(state);
    const luckSection = _renderLuckControls(state, teamLuck, teamLuckMax);

    const formulaBits = state.isLuckTest
        ? `${state.pool}d6 Luck Test (fixed DN 4:1)`
        : `${state.pool}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})`;

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${formulaBits}</div>
        ${state.preRollLuckUsed ? '<div class="dice-formula">Luck spent: Maximise Successes (all dice treated as 6).</div>' : ''}
        <ol class="dice-rolls">${diceHtml}</ol>
        ${focusSection}
        ${luckSection}
        <div class="dice-outcome ${isSuccess ? "outcome-success" : "outcome-failure"}">
            <strong>${isSuccess ? "Success" : "Failure"}</strong>
            <span class="success-count">(Successes: ${successes}/${complexity})</span>
            ${benefitLabel ? `<span class="benefit-label">${benefitLabel}</span>` : ""}
            ${state.isLuckTest ? "" : `<span class="focus-spent">(Focus used: ${state.focusSpent ?? 0})</span>`}
        </div>
        ${damageSection}
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
