function _getActorStatuses(actor) {
    return game.laundry?.getActorStatuses?.(actor) ?? new Set();
}

function _escapeHtml(value) {
    return foundry.utils.escapeHTML(String(value ?? ""));
}

function _renderPickerDetails(entry, detailsBuilder) {
    if (typeof detailsBuilder !== "function") return "";
    const rows = detailsBuilder(entry)
        .filter(row => row && String(row.value ?? "").trim().length > 0)
        .map(row => ({
            label: _escapeHtml(row.label ?? ""),
            value: _escapeHtml(row.value ?? "")
        }));

    if (!rows.length) {
        return `<p class="notes">No dossier details on record.</p>`;
    }

    return `<dl class="laundry-picker-meta">${
        rows.map(row => `<dt>${row.label}</dt><dd>${row.value}</dd>`).join("")
    }</dl>`;
}

function _buildWeaponPickerRows(weapon) {
    const ammoMax = Math.max(0, Math.trunc(Number(weapon?.system?.ammoMax) || 0));
    const ammoCurrent = Math.max(0, Math.trunc(Number(weapon?.system?.ammo) || 0));
    const ammoLabel = ammoMax > 0
        ? `${ammoCurrent}/${ammoMax}`
        : "Not tracked";

    return [
        { label: "Skill", value: weapon?.system?.skill ?? "Close Combat" },
        { label: "Damage", value: weapon?.system?.damage ?? "-" },
        { label: "Ammo", value: ammoLabel },
        { label: "Traits", value: weapon?.system?.traits ?? "None" }
    ];
}

function _buildSpellPickerRows(spell) {
    const level = Math.max(1, Math.trunc(Number(spell?.system?.level) || 1));
    const dn = Math.max(2, Math.min(6, Math.trunc(Number(spell?.system?.dn) || 4)));
    const complexity = Math.max(
        1,
        Math.trunc(Number(spell?.system?.complexity ?? spell?.system?.level) || 1)
    );

    return [
        { label: "Level", value: level },
        { label: "Difficulty", value: `DN ${dn}:${complexity}` },
        { label: "Duration", value: spell?.system?.duration ?? "Varies" },
        { label: "Target", value: spell?.system?.target ?? "Varies" }
    ];
}

async function _pickDocument(
    title,
    entries = [],
    {
        nameKey = "name",
        emptyWarning = "No entries available.",
        submitLabel = "Confirm",
        subtitle = "",
        detailsBuilder = null
    } = {}
) {
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
            return `<option value="${_escapeHtml(id)}">${_escapeHtml(name)}</option>`;
        }).join("");
        const subtitleHtml = subtitle
            ? `<p class="picker-intro">${_escapeHtml(subtitle)}</p>`
            : "";
        const previewHtml = typeof detailsBuilder === "function"
            ? `<div class="laundry-picker-preview" data-picker-preview></div>`
            : "";

        const content = `
            <form class="laundry-token-hud-picker">
                ${subtitleHtml}
                <div class="form-group">
                    <label>Select:</label>
                    <select name="entryId">${options}</select>
                </div>
                ${previewHtml}
            </form>`;

        new Dialog({
            title,
            content,
            classes: ["laundry-rpg", "laundry-dialog", "laundry-picker-dialog"],
            buttons: {
                roll: {
                    label: submitLabel,
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
            default: "roll",
            render: (html) => {
                const root = html[0];
                const select = root?.querySelector('[name="entryId"]');
                const preview = root?.querySelector("[data-picker-preview]");
                if (!select || !preview || typeof detailsBuilder !== "function") return;

                const renderPreview = () => {
                    const selectedId = String(select.value ?? "").trim();
                    const selected = entries.find(entry => String(entry?.id ?? "") === selectedId) ?? entries[0];
                    preview.innerHTML = _renderPickerDetails(selected, detailsBuilder);
                };

                select.addEventListener("change", renderPreview);
                renderPreview();
            },
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
        emptyWarning: "No weapons available.",
        submitLabel: game.i18n.localize("LAUNDRY.Roll"),
        subtitle: "Select a weapon and roll attack immediately.",
        detailsBuilder: _buildWeaponPickerRows
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
        emptyWarning: "No spells available.",
        submitLabel: game.i18n.localize("LAUNDRY.Roll"),
        subtitle: "Select a spell and roll casting test immediately.",
        detailsBuilder: _buildSpellPickerRows
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
