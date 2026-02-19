/**
 * The Laundry RPG dice roller.
 *
 * Mechanics:
 *  • Roll a pool of d6s.
 *  • Each die equal to or above the Difficulty Number (DN, default 4) is a success.
 *  • Focus points are allocated manually by the player after rolling.
 *  • Results are displayed in a styled chat card.
 */

/**
 * Open a roll dialog then execute the roll.
 *
 * @param {object}  opts
 * @param {number}  opts.pool     Base dice pool (Attribute + Training).
 * @param {number}  opts.focus    Focus points available.
 * @param {string}  [opts.flavor] Chat message flavour text.
 * @param {number}  [opts.dn]     Difficulty Number (default 4).
 * @param {number}  [opts.complexity] Successes required (default 1).
 * @param {string}  [opts.damage] Damage formula to show (weapons only).
 * @param {number}  [opts.difficultyShift] Advantage/Disadvantage shift:
 *                                         -2 greater advantage, -1 advantage,
 *                                          0 normal, +1 disadvantage, +2 greater disadvantage.
 * @param {boolean} [opts.prompt] Show roll dialog first (default true).
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

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _executeRoll(pool, focus, dn, complexity, flavor, damage, difficultyShift = 0) {
    const shift = Math.max(-2, Math.min(2, difficultyShift || 0));
    const effectiveDn = Math.max(2, Math.min(6, (dn || 4) + shift));

    // Build and evaluate the roll (v12+ API — no async option needed)
    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();

    const rawDice = roll.terms[0].results.map(d => d.result);
    const focusAllocations = await _allocateFocusManually(rawDice, focus);
    const results = rawDice.map((val, idx) => {
        const spent = focusAllocations[idx] ?? 0;
        const modified = val + spent;
        return {
            original: val,
            modified,
            success: modified >= effectiveDn,
            boosted: spent > 0,
            spent
        };
    });

    const successes = results.filter(r => r.success).length;
    const focusUsed = results.reduce((sum, r) => sum + (r.spent ?? 0), 0);
    const isSuccess = successes >= complexity;
    const margin = successes - complexity;

    let outcomeLabel = isSuccess ? "Success" : "Failure";
    let benefitLabel = "";
    if (isSuccess) {
        if (margin >= 3) benefitLabel = "Major Benefit";
        else if (margin >= 1) benefitLabel = "Minor Benefit";
    }
    const shiftLabel = shift === 0
        ? "No Advantage"
        : (shift < 0
            ? (shift === -1 ? "Advantage" : "Greater Advantage")
            : (shift === 1 ? "Disadvantage" : "Greater Disadvantage"));

    // ─── Chat card ────────────────────────────────────────────────────────────

    const diceHtml = results.map(r => {
        const cls = ["roll", "die", "d6", r.success ? "success" : "failure", r.boosted ? "boosted" : ""].join(" ").trim();
        const display = r.boosted ? `${r.original}→${r.modified}` : r.modified;
        return `<li class="${cls}" title="${r.boosted ? `Focus spent: +${r.spent}` : ""}">${display}</li>`;
    }).join("");

    const damageSection = damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${damage}</div>`
        : "";

    const content = `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${pool}d6 vs DN ${dn}:${complexity} (${shiftLabel} -> effective DN ${effectiveDn})</div>
        <ol class="dice-rolls">${diceHtml}</ol>
        <div class="dice-outcome ${isSuccess ? "outcome-success" : "outcome-failure"}">
            <strong>${outcomeLabel}</strong>
            <span class="success-count">(Successes: ${successes}/${complexity})</span>
            ${benefitLabel ? `<span class="benefit-label">${benefitLabel}</span>` : ""}
            ${focusUsed > 0 ? `<span class="focus-spent">(Focus spent: ${focusUsed})</span>` : ""}
        </div>
        ${damageSection}
    </div>`;

    // In Foundry v12+ pass rolls array; omit deprecated `type` field.
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        flavor,
        content,
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });
}

async function _allocateFocusManually(rawDice, focus) {
    const totalFocus = Math.max(0, Number(focus) || 0);
    if (!totalFocus) return rawDice.map(() => 0);

    const rows = rawDice.map((die, idx) => `
        <div class="form-group">
            <label>Die ${idx + 1} (rolled ${die})</label>
            <input type="number" class="focus-spend" data-idx="${idx}" value="0" min="0" max="${totalFocus}" />
        </div>
    `).join("");

    const content = `
    <form class="laundry-focus-dialog">
        <p>You have <strong>${totalFocus}</strong> Focus to allocate (+1 per point).</p>
        <p>You may split points across dice or stack multiple points on one die.</p>
        ${rows}
    </form>`;

    return new Promise(resolve => {
        new Dialog({
            title: "Allocate Focus",
            content,
            buttons: {
                apply: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Apply Focus",
                    callback: (html) => {
                        const allocations = rawDice.map(() => 0);
                        let remaining = totalFocus;
                        html.find(".focus-spend").each((_, input) => {
                            if (remaining <= 0) return;
                            const idx = Number(input.dataset.idx ?? -1);
                            if (idx < 0 || idx >= allocations.length) return;
                            const requested = Math.max(0, parseInt(input.value, 10) || 0);
                            const spend = Math.min(requested, remaining);
                            allocations[idx] = spend;
                            remaining -= spend;
                        });
                        resolve(allocations);
                    }
                },
                skip: {
                    icon: '<i class="fas fa-forward"></i>',
                    label: "Skip Focus",
                    callback: () => resolve(rawDice.map(() => 0))
                }
            },
            default: "apply",
            close: () => resolve(rawDice.map(() => 0))
        }).render(true);
    });
}
