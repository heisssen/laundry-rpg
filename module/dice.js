/**
 * The Laundry RPG dice roller.
 *
 * Mechanics:
 *  • Roll a pool of d6s.
 *  • Each die equal to or above the Difficulty Number (DN, default 4) is a success.
 *  • Focus points may each raise one die's result by +1 (optimally applied).
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
 */
export async function rollDice({ pool = 1, focus = 0, flavor = "Dice Roll", dn = 4, complexity = 1, damage } = {}) {
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
                    await _executeRoll(newPool, newFocus, newDN, newComplexity, flavor, damage);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "roll"
    }).render(true);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function _executeRoll(pool, focus, dn, complexity, flavor, damage) {
    // Build and evaluate the roll (v12+ API — no async option needed)
    const roll = new Roll(`${pool}d6`);
    await roll.evaluate();

    const rawDice = roll.terms[0].results.map(d => d.result);

    // Apply Focus optimally: spend the minimum Focus needed to turn the closest misses into successes.
    let focusLeft = focus;
    const results = rawDice.map(val => ({
        original: val,
        modified: val,
        success: val >= dn,
        boosted: false
    }));

    const candidates = results
        .map((r, idx) => ({ idx, needed: dn - r.original }))
        .filter(c => c.needed > 0)
        .sort((a, b) => a.needed - b.needed);

    for (const c of candidates) {
        if (focusLeft < c.needed) continue;
        focusLeft -= c.needed;
        const r = results[c.idx];
        r.modified = r.original + c.needed;
        r.success = true;
        r.boosted = true;
    }

    const successes = results.filter(r => r.success).length;
    const focusUsed = focus - focusLeft;
    const isSuccess = successes >= complexity;
    const margin = successes - complexity;

    let outcomeLabel = isSuccess ? "Success" : "Failure";
    let benefitLabel = "";
    if (isSuccess) {
        if (margin >= 3) benefitLabel = "Major Benefit";
        else if (margin >= 1) benefitLabel = "Minor Benefit";
    }

    // ─── Chat card ────────────────────────────────────────────────────────────

    const diceHtml = results.map(r => {
        const cls = ["roll", "die", "d6", r.success ? "success" : "failure", r.boosted ? "boosted" : ""].join(" ").trim();
        const display = r.boosted ? `${r.original}→${r.modified}` : r.modified;
        return `<li class="${cls}" title="${r.boosted ? `Focus spent: +${r.modified - r.original}` : ""}">${display}</li>`;
    }).join("");

    const damageSection = damage
        ? `<div class="damage-section"><strong>Damage:</strong> ${damage}</div>`
        : "";

    const content = `
    <div class="laundry-dice-roll">
        <div class="dice-formula">${pool}d6 vs DN ${dn}:${complexity}</div>
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
