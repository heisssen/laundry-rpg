import { rollDice } from "../dice.js";

export class LaundryGMTracker extends Application {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-gm-tracker",
            classes: ["laundry-rpg", "laundry-dialog", "gm-tracker"],
            template: "systems/laundry-rpg/templates/apps/gm-tracker.html",
            title: "Operations Threat Tracker",
            width: 360,
            height: "auto",
            popOut: true,
            resizable: true
        });
    }

    getData(options = {}) {
        const data = super.getData(options);
        const threatLevel = Number(game.settings.get("laundry-rpg", "threatLevel")) || 0;
        const target = _getPrimaryTargetToken();
        const actor = target?.actor ?? null;
        return {
            ...data,
            threatLevel: Math.max(0, Math.min(10, Math.trunc(threatLevel))),
            targetName: actor?.name ?? target?.name ?? game.i18n.localize("LAUNDRY.AttackNoTarget"),
            hasTarget: Boolean(actor)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        if (!game.user?.isGM) return;

        html.find(".threat-range").on("input", (ev) => {
            const value = Number(ev.currentTarget.value ?? 0);
            const numberInput = this.element?.find('[name="threatLevel"]')[0];
            if (numberInput) numberInput.value = String(value);
        });
        html.find('[name="threatLevel"]').on("input", (ev) => {
            const value = Number(ev.currentTarget.value ?? 0);
            const slider = this.element?.find(".threat-range")[0];
            if (slider) slider.value = String(Math.max(0, Math.min(10, Math.trunc(value || 0))));
        });
        html.find("form").on("submit", (ev) => this._onSubmit(ev));
        html.find(".set-threat").on("click", (ev) => this._onSubmit(ev));
        html.find(".award-luck").on("click", (ev) => this._onAwardLuck(ev));
        html.find(".request-bau").on("click", (ev) => this._onRequestBau(ev));
    }

    async _onSubmit(ev) {
        ev.preventDefault();
        const form = this.element?.find("form")[0];
        if (!form) return;
        const level = Number(form.querySelector('[name="threatLevel"]')?.value ?? 0);
        const nextLevel = Math.max(0, Math.min(10, Math.trunc(level || 0)));
        await game.settings.set("laundry-rpg", "threatLevel", nextLevel);
        ui.notifications.info(game.i18n.format("LAUNDRY.ThreatUpdated", { level: nextLevel }));
        this.render(false);
    }

    async _onAwardLuck(ev) {
        ev.preventDefault();
        const pcs = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
        if (!pcs.length) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.NoPlayerCharacters"));
            return;
        }

        const current = Number(game.settings.get("laundry-rpg", "teamLuck")) || 0;
        const max = Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0;
        const inferredMax = Math.max(1, pcs.length);
        const effectiveMax = Math.max(max, inferredMax);
        if (effectiveMax !== max) {
            await game.settings.set("laundry-rpg", "teamLuckMax", effectiveMax);
        }

        const next = Math.max(0, Math.min(effectiveMax, current + pcs.length));
        await game.settings.set("laundry-rpg", "teamLuck", next);

        ui.notifications.info(game.i18n.format("LAUNDRY.LuckAwarded", {
            pcs: pcs.length,
            luck: next,
            max: effectiveMax
        }));
    }

    async _onRequestBau(ev) {
        ev.preventDefault();
        const target = _getPrimaryTargetToken();
        const actor = target?.actor ?? null;
        if (!actor) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.SelectTargetForBAU"));
            return;
        }

        Hooks.callAll("laundryRpgRequestBusinessAsUsual", {
            actorId: actor.id,
            actorName: actor.name,
            sourceUserId: game.user.id
        });

        const owners = _getActorOwners(actor).map(u => u.id);
        const whisper = [...new Set(owners.concat(game.user.id))];
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            whisper,
            content: game.i18n.format("LAUNDRY.BAURequestSent", { name: actor.name })
        });
    }

    static async handleBusinessAsUsualRequest({ actorId, actorName, sourceUserId } = {}) {
        const actor = game.actors?.get(actorId);
        if (!actor) return;
        if (!actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
        if (game.user.isGM) return;

        const gmName = game.users?.get(sourceUserId)?.name ?? game.i18n.localize("LAUNDRY.GM");
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("LAUNDRY.BusinessAsUsualCheck"),
            content: `<p>${game.i18n.format("LAUNDRY.BAUDialogPrompt", { gm: gmName, name: actorName ?? actor.name })}</p>`
        });
        if (!confirmed) return;

        const bureaucracy = actor.items.find(i =>
            i.type === "skill" && i.name.toLowerCase() === "bureaucracy"
        );

        if (bureaucracy) {
            await bureaucracy.roll();
            return;
        }

        const mind = Math.max(1, Math.trunc(Number(actor.system?.attributes?.mind?.value) || 1));
        await rollDice({
            pool: mind,
            dn: 4,
            complexity: 1,
            actorId: actor.id,
            flavor: game.i18n.localize("LAUNDRY.BusinessAsUsualFlavor")
        });
    }
}

function _getPrimaryTargetToken() {
    const targets = Array.from(game.user?.targets ?? []);
    if (!targets.length) return null;
    const [first] = targets;
    return first ?? null;
}

function _getActorOwners(actor) {
    return game.users.filter(user =>
        user.active
        && !user.isGM
        && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
    );
}
