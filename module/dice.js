export async function rollDice({ pool, focus, flavor = "Rolling Dice", dn = 4 } = {}) {
    // Show a dialog to confirm/modify the roll
    const content = `
    <form>
        <div class="form-group">
            <label>Dice Pool</label>
            <input type="number" name="pool" value="${pool}"/>
        </div>
        <div class="form-group">
            <label>Focus</label>
            <input type="number" name="focus" value="${focus}"/>
        </div>
        <div class="form-group">
            <label>Difficulty Number (DN)</label>
            <input type="number" name="dn" value="${dn}"/>
        </div>
    </form>
    `;

    new Dialog({
        title: "Roll Dice",
        content: content,
        buttons: {
            roll: {
                label: "Roll",
                callback: async (html) => {
                    const newPool = parseInt(html.find('[name="pool"]').val());
                    const newFocus = parseInt(html.find('[name="focus"]').val());
                    const newDN = parseInt(html.find('[name="dn"]').val());

                    await _executeRoll(newPool, newFocus, newDN, flavor);
                }
            }
        },
        default: "roll"
    }).render(true);
}

async function _executeRoll(pool, focus, dn, flavor) {
    const roll = new Roll(`${pool}d6`);
    await roll.evaluate({ async: true });

    // Basic logic: Count successes (>= DN)
    // Detailed logic with Focus: Focus adds +1 to a die.
    // We should optimize Focus usage.
    // For each Focus point, we can turn a (DN-1) into a DN (Success).
    // Or a (DN-2) into (DN-1) [not useful unless we have more Focus].

    // Let's implement auto-focus usage for optimal successes.

    let dice = roll.terms[0].results.map(d => d.result);
    // Sort descending
    dice.sort((a, b) => b - a);

    let successes = 0;
    let focusUsed = 0;
    let modifiedDice = [];

    for (let die of dice) {
        let currentVal = die;
        let isSuccess = currentVal >= dn;
        let wasModified = false;

        if (!isSuccess && focus > 0) {
            // Check if we can bump it to DN
            const needed = dn - currentVal;
            if (focus >= needed) {
                focus -= needed;
                focusUsed += needed;
                currentVal += needed; // Visually cap at DN? Or show true value? Rules say "adds +1 to result".
                isSuccess = true;
                wasModified = true;
            }
        }

        if (isSuccess) successes++;

        modifiedDice.push({
            original: die,
            modified: currentVal,
            isSuccess: isSuccess,
            wasModified: wasModified
        });
    }

    // Construct Chat Message
    // visual rendering of dice

    let msgContent = `
    <div class="dice-roll">
        <div class="dice-result">
            <div class="dice-formula">${pool}d6 (DN ${dn})</div>
            <div class="dice-tooltip">
                <section class="tooltip-part">
                    <div class="dice">
                        <header class="part-header flexrow">
                            <span class="part-formula">${pool}d6</span>
                            <span class="part-total">${roll.total}</span>
                        </header>
                        <ol class="dice-rolls">
                            ${modifiedDice.map(d => {
        const classes = `roll die d6 ${d.isSuccess ? 'success' : ''} ${d.wasModified ? 'modified' : ''}`;
        return `<li class="${classes}">${d.modified}</li>`;
    }).join('')}
                        </ol>
                    </div>
                </section>
            </div>
            <h4 class="dice-total">${successes} Successes</h4>
             ${focusUsed > 0 ? `<div class="focus-used">Focus Spent: ${focusUsed}</div>` : ''}
        </div>
    </div>
    `;

    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        flavor: flavor,
        content: msgContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        roll: roll
    });
}
