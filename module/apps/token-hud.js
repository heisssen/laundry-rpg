function _getActorStatuses(actor) {
    return game.laundry?.getActorStatuses?.(actor) ?? new Set();
}

async function _pickDocument(title, entries = [], { nameKey = "name", emptyWarning = "No entries available." } = {}) {
    if (!entries.length) {
        ui.notifications.warn(emptyWarning);
        return null;
    }
    if (entries.length === 1) return entries[0];

    return new Promise(resolve => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const options = entries.map(entry => {
            const id = String(entry?.id ?? "");
            const name = String(entry?.[nameKey] ?? entry?.name ?? id);
            return `<option value="${foundry.utils.escapeHTML(id)}">${foundry.utils.escapeHTML(name)}</option>`;
        }).join("");

        const content = `
            <form class="laundry-token-hud-picker">
                <div class="form-group">
                    <label>Select:</label>
                    <select name="entryId">${options}</select>
                </div>
            </form>`;

        new Dialog({
            title,
            content,
            classes: ["laundry-rpg", "laundry-dialog"],
            buttons: {
                ok: {
                    label: "Confirm",
                    callback: (html) => {
                        const selected = String(
                            html[0]?.querySelector('[name="entryId"]')?.value ?? ""
                        ).trim();
                        finish(entries.find(entry => String(entry?.id ?? "") === selected) ?? null);
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => finish(null)
                }
            },
            default: "ok",
            close: () => finish(null)
        }).render(true);
    });
}

async function _quickAttack(actor) {
    if (!actor) return;
    const weapons = actor.items
        .filter(item => item.type === "weapon")
        .sort((a, b) => a.name.localeCompare(b.name));
    const equipped = weapons.filter(item => item.system?.equipped);
    const candidates = equipped.length ? equipped : weapons;
    const selected = await _pickDocument("Quick Attack", candidates, {
        emptyWarning: "No weapons available."
    });
    if (!selected) return;
    await selected.roll();
}

async function _quickCast(actor) {
    if (!actor) return;
    const spells = actor.items
        .filter(item => item.type === "spell")
        .sort((a, b) => a.name.localeCompare(b.name));
    const selected = await _pickDocument("Quick Cast", spells, {
        emptyWarning: "No spells available."
    });
    if (!selected) return;
    await selected.roll();
}

async function _standFromProne(actor) {
    if (!actor) return;
    const statuses = _getActorStatuses(actor);
    if (!statuses.has("prone")) {
        ui.notifications.info("Actor is not Prone.");
        return;
    }
    const spentMove = await game.laundry?.consumeCombatMove?.(actor, { warn: true });
    if (spentMove === false) return;
    await game.laundry?.removeCondition?.(actor, "prone", { suppressChat: true });
    ui.notifications.info(`${actor.name}: stood up from Prone.`);
}

async function _handleHudAction(actor, action) {
    switch (action) {
        case "attack":
            await _quickAttack(actor);
            return;
        case "cast":
            await _quickCast(actor);
            return;
        case "action":
            await game.laundry?.consumeCombatAction?.(actor, { warn: true });
            return;
        case "move":
            await game.laundry?.consumeCombatMove?.(actor, { warn: true });
            return;
        case "adrenaline":
            await game.laundry?.spendAdrenalineForExtraAction?.(actor);
            return;
        case "stand":
            await _standFromProne(actor);
            return;
        case "gm-tracker":
            if (game.user?.isGM) game.laundry?.openGMTracker?.();
            return;
        default:
            return;
    }
}

function _buildHudHtml({ actor, canUseTurnEconomy, isProne }) {
    const gmButton = game.user?.isGM
        ? `<button type="button" class="control-icon laundry-hud-action" data-action="gm-tracker" title="Open GM Tracker"><i class="fas fa-user-secret"></i></button>`
        : "";
    const standButton = isProne
        ? `<button type="button" class="control-icon laundry-hud-action" data-action="stand" title="Stand from Prone"><i class="fas fa-person-walking"></i></button>`
        : "";
    const economyButtons = canUseTurnEconomy
        ? `
            <button type="button" class="control-icon laundry-hud-action" data-action="action" title="Use Action"><i class="fas fa-hand-rock"></i></button>
            <button type="button" class="control-icon laundry-hud-action" data-action="move" title="Use Move"><i class="fas fa-shoe-prints"></i></button>
            <button type="button" class="control-icon laundry-hud-action" data-action="adrenaline" title="Spend Adrenaline (+1 Action)"><i class="fas fa-bolt"></i></button>
          `
        : "";

    return `
        <div class="col left laundry-token-hud-actions">
            <div class="control-icon control-icon-label" title="${foundry.utils.escapeHTML(actor.name ?? "Actor")}">L</div>
            <button type="button" class="control-icon laundry-hud-action" data-action="attack" title="Quick Attack"><i class="fas fa-crosshairs"></i></button>
            <button type="button" class="control-icon laundry-hud-action" data-action="cast" title="Quick Cast"><i class="fas fa-hat-wizard"></i></button>
            ${economyButtons}
            ${standButton}
            ${gmButton}
        </div>`;
}

export function bindTokenHudControls(tokenHudApp, html) {
    const token = tokenHudApp?.object ?? null;
    const actor = token?.actor ?? null;
    if (!actor || !actor.isOwner) return;

    html.find(".laundry-token-hud-actions").remove();

    const turnEconomy = game.laundry?.getCombatTurnEconomy?.(actor) ?? {
        tracked: false,
        isActorTurn: false
    };
    const canUseTurnEconomy = Boolean(turnEconomy.tracked && turnEconomy.isActorTurn);
    const isProne = _getActorStatuses(actor).has("prone");
    const panelHtml = _buildHudHtml({ actor, canUseTurnEconomy, isProne });

    const rightCol = html.find(".right");
    if (rightCol.length) {
        rightCol.after(panelHtml);
    } else {
        html.append(panelHtml);
    }

    html.find(".laundry-hud-action").off("click.laundry-token-hud").on("click.laundry-token-hud", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = String(ev.currentTarget?.dataset?.action ?? "").trim();
        await _handleHudAction(actor, action);
    });
}
