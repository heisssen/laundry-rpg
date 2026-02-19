/**
 * The Laundry RPG dice roller.
 *
 * Mechanics:
 *  • Roll a pool of d6s.
 *  • Each die equal to or above the Difficulty Number (DN, default 4) is a success.
 *  • Focus is applied manually in chat by right-clicking individual dice.
 *  • Results are displayed in a styled chat card.
 */

/**
 * Open a roll dialog then execute the roll.
 */
export async function rollDice({
    pool = 1,
    focus = 0,
    flavor = "Dice Roll",
    dn = 4,
    complexity = 1,
    damage,
    difficultyShift = 0,
    prompt = true
} = {}) {
    if (!prompt) {
        return _executeRoll(pool, focus, dn, complexity, flavor, damage, difficultyShift);
    }

    const content = `
    <form class="laundry-roll-dialog">
        <div class="form-group">
            <label>Dice Pool</label>
            <input type="number" name="pool" value="${pool}" min="1" max="20" />
        </div>
        <div class="form-group">
            <label>Focus</label>
            <input type="number" name="focus" value="${focus}" min="0" max="3" />
        </div>
        <div class="form-group">
            <label>Difficulty Number (DN)</label>
            <input type="number" name="dn" value="${dn}" min="2" max="6" />
        </div>
        <div class="form-group">
            <label>Complexity (Successes Needed)</label>
            <input type="number" name="complexity" value="${complexity}" min="1" max="10" />
        </div>
        <div class="form-group">
            <label>Advantage / Disadvantage</label>
            <select name="difficultyShift">
                <option value="0" ${difficultyShift === 0 ? "selected" : ""}>None</option>
                <option value="-1" ${difficultyShift === -1 ? "selected" : ""}>Advantage (-1 DN)</option>
                <option value="-2" ${difficultyShift === -2 ? "selected" : ""}>Greater Advantage (-2 DN)</option>
                <option value="1" ${difficultyShift === 1 ? "selected" : ""}>Disadvantage (+1 DN)</option>
                <option value="2" ${difficultyShift === 2 ? "selected" : ""}>Greater Disadvantage (+2 DN)</option>
            </select>
        </div>
    </form>`;

    new Dialog({
        title: "Roll Dice",
        content,
        buttons: {
            roll: {
                icon: '<i class="fas fa-dice"></i>',
                label: "Roll",
                callback: async (html) => {
                    const newPool  = parseInt(html.find('[name="pool"]').val())  || 1;
                    const newFocus = parseInt(html.find('[name="focus"]').val()) || 0;
                    const newDN    = parseInt(html.find('[name="dn"]').val())    || 4;
                    const newComplexity = parseInt(html.find('[name="complexity"]').val()) || 1;
                    const newDifficultyShift = parseInt(html.find('[name="difficultyShift"]').val()) || 0;
                    await _executeRoll(newPool, newFocus, newDN, newComplexity, flavor, damage, newDifficultyShift);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "roll"
    }).render(true);
}

export function bindDiceChatContextMenu(message, html) {
    const state = _getDiceState(message);
    if (!state) return;

    html.find(".laundry-die").off("contextmenu.laundry-focus").on("contextmenu.laundry-focus", async (ev) => {
        ev.preventDefault();
        if (!message.isOwner) return;

        const idx = Number(ev.currentTarget.dataset.dieIndex ?? -1);
        if (idx < 0 || idx >= state.rawDice.length) return;

        const spent = Number(state.spentByDie[idx] ?? 0);
        const remaining = _focusRemaining(state);

        const content = `
        <div class="laundry-focus-context">
            <p>Die ${idx + 1}: <strong>${state.rawDice[idx]} -> ${state.rawDice[idx] + spent}</strong></p>
            <p>Focus remaining: <strong>${remaining}</strong></p>
        </div>`;

        new Dialog({
            title: "Focus Options",
            content,
            buttons: {
                apply: {
                    icon: '<i class="fas fa-plus"></i>',
                    label: "Apply Focus",
                    callback: async () => {
                        if (_focusRemaining(state) <= 0) {
                            ui.notifications.warn("No Focus remaining.");
                            return;
                        }
                        state.spentByDie[idx] = Number(state.spentByDie[idx] ?? 0) + 1;
                        await _updateDiceMessage(message, state);
                    }
                },
                remove: {
                    icon: '<i class="fas fa-minus"></i>',
                    label: "Remove Focus",
                    callback: async () => {
                        const current = Number(state.spentByDie[idx] ?? 0);
                        if (current <= 0) return;
                        state.spentByDie[idx] = current - 1;
                        await _updateDiceMessage(message, state);
                    }
                },
                cancel: { label: "Cancel" }
            },
            default: "apply"
        }).render(true);
    });
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _executeRoll(pool, focus, dn, complexity, flavor, damage, difficultyShift = 0) {
    const shift = Math.max(-2, Math.min(2, difficultyShift || 0));
    const effectiveDn = Math.max(2, Math.min(6, (dn || 4) + shift));

    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();

    const state = {
        pool,
        focus: Math.max(0, Number(focus) || 0),
        dn,
        complexity,
        shift,
        effectiveDn,
        damage: damage ?? "",
        rawDice: roll.terms[0].results.map(d => d.result),
        spentByDie: []
    };
    state.spentByDie = state.rawDice.map(() => 0);

    const content = _renderDiceContent(state);

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        flavor,
        content,
        rolls: [roll],
        flags: {
            "laundry-rpg": {
                diceState: state
            }
        },
        sound: CONFIG.sounds.dice
    });
}

function _getDiceState(message) {
    return foundry.utils.deepClone(message.getFlag("laundry-rpg", "diceState"));
}

function _focusRemaining(state) {
    const spent = (state.spentByDie ?? []).reduce((sum, v) => sum + (Number(v) || 0), 0);
    return Math.max(0, (Number(state.focus) || 0) - spent);
}

function _buildResults(state) {
    const rawDice = state.rawDice ?? [];
    const spentByDie = state.spentByDie ?? [];
    const effectiveDn = Number(state.effectiveDn ?? state.dn ?? 4);
    return rawDice.map((val, idx) => {
        const spent = Number(spentByDie[idx] ?? 0);
        const modified = val + spent;
        return {
            index: idx,
            original: val,
            spent,
            modified,
            success: modified >= effectiveDn,
            boosted: spent > 0
        };
    });
}

function _renderDiceContent(state) {
    const results = _buildResults(state);
    const successes = results.filter(r => r.success).length;
    const focusUsed = results.reduce((sum, r) => sum + r.spent, 0);
    const focusRemaining = _focusRemaining(state);
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
        const cls = ["roll", "die", "d6", "laundry-die", r.success ? "success" : "failure", r.boosted ? "boosted" : ""]
            .join(" ")
            .trim();
        const display = r.boosted ? `${r.original}->${r.modified}` : r.modified;
        const title = r.boosted ? `Focus spent: +${r.spent} (right-click for focus options)` : "Right-click for focus options";
        return `<li class="${cls}" data-die-index="${r.index}" title="${title}">${display}</li>`;
    }).join("");

    const damageSection = state.damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${state.damage}</div>`
        : "";

    return `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${state.pool}d6 vs DN ${state.dn}:${state.complexity} (${shiftLabel} -> effective DN ${state.effectiveDn})</div>
        <ol class="dice-rolls">${diceHtml}</ol>
        <div class="dice-outcome ${isSuccess ? "outcome-success" : "outcome-failure"}">
            <strong>${isSuccess ? "Success" : "Failure"}</strong>
            <span class="success-count">(Successes: ${successes}/${complexity})</span>
            ${benefitLabel ? `<span class="benefit-label">${benefitLabel}</span>` : ""}
            <span class="focus-spent">(Focus used: ${focusUsed}/${state.focus}, remaining: ${focusRemaining})</span>
        </div>
        ${damageSection}
    </div>`;
}

async function _updateDiceMessage(message, state) {
    const content = _renderDiceContent(state);
    await message.update({
        content,
        flags: {
            "laundry-rpg": {
                diceState: state
            }
        }
    });
}
