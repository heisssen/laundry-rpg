import { rollDice } from "../dice.js";
import { normalizeKpiEntries, summarizeKpiEntries } from "../utils/kpi.js";
import { NPC_PRESETS, createNpcFromPreset, getNpcPreset } from "../utils/npc-presets.js";
import { openMissionGenerator } from "./mission-generator.js";
import { applyThreatBuffsToCurrentScene } from "../utils/threat-integration.js";

const TRACKED_CONDITION_IDS = [
    "prone",
    "stunned",
    "bleeding",
    "weakened",
    "frightened",
    "terrified",
    "restrained",
    "blinded"
];
const COMBAT_FILTER_IDS = new Set(["all", "pc", "npc", "hostile", "critical", "active"]);
const COMBAT_SORT_IDS = new Set(["initiative", "name", "toughness"]);

export class LaundryGMTracker extends Application {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-gm-tracker",
            classes: ["laundry-rpg", "laundry-dialog", "gm-tracker"],
            template: "systems/laundry-rpg/templates/apps/gm-tracker.html",
            title: "Operations Threat Tracker",
            width: 560,
            height: 760,
            popOut: true,
            resizable: true
        });
    }

    constructor(options = {}) {
        super(options);
        this._viewState = {
            combatFilter: "all",
            combatSort: "initiative",
            combatSearch: "",
            autoRefresh: true
        };
        this._selectedCombatActorIds = new Set();
        this._autoRefreshTimer = null;
        this._searchDebounceTimer = null;
    }

    async close(options = {}) {
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = null;
        }
        this._clearAutoRefreshTimer();
        return super.close(options);
    }

    getData(options = {}) {
        const data = super.getData(options);
        const threatLevel = Number(game.settings.get("laundry-rpg", "threatLevel")) || 0;
        const teamLuck = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuck")) || 0));
        const teamLuckMax = Math.max(0, Math.trunc(Number(game.settings.get("laundry-rpg", "teamLuckMax")) || 0));
        const teamLuckAutoSync = Boolean(game.settings.get("laundry-rpg", "teamLuckAutoSync"));
        const target = _getPrimaryTargetToken();
        const actor = target?.actor ?? null;
        const combat = game.combat ?? null;
        const hasCombatStarted = Boolean(combat?.started);
        const conditionOptions = TRACKED_CONDITION_IDS.map(id => ({
            id,
            label: _conditionLabel(id)
        }));

        const pcs = _getPlayerCharacters().map(pc => {
            const adrenalineValue = Math.max(0, Math.trunc(Number(pc.system?.derived?.adrenaline?.value) || 0));
            const adrenalineMax = Math.max(0, Math.trunc(Number(pc.system?.derived?.adrenaline?.max) || 0));
            const injuriesValue = Math.max(0, Math.trunc(Number(pc.system?.derived?.injuries?.value) || 0));
            const injuriesMax = Math.max(0, Math.trunc(Number(pc.system?.derived?.injuries?.max) || 0));
            const toughnessValue = Math.max(0, Math.trunc(Number(pc.system?.derived?.toughness?.value) || 0));
            const toughnessMax = Math.max(0, Math.trunc(Number(pc.system?.derived?.toughness?.max) || 0));
            const kpiSummary = summarizeKpiEntries(normalizeKpiEntries(pc.system?.kpi));
            return {
                id: pc.id,
                name: pc.name,
                adrenalineValue,
                adrenalineMax,
                injuriesValue,
                injuriesMax,
                toughnessValue,
                toughnessMax,
                kpiOpen: kpiSummary.open
            };
        });

        const dispositionLabels = {
            "-1": "Hostile",
            "0": "Neutral",
            "1": "Friendly"
        };

        const combatantsBase = Array.from(combat?.combatants ?? []).map(combatant => {
            const cActor = combatant.actor;
            const statusIds = Array.from(_getActorStatusSet(cActor));
            const statusSet = new Set(statusIds);
            const turnEconomy = game.laundry?.getCombatTurnEconomy?.(cActor) ?? {
                tracked: false,
                actionsRemaining: 0,
                moveRemaining: 0
            };
            const toughnessValue = Math.max(0, Math.trunc(Number(cActor?.system?.derived?.toughness?.value) || 0));
            const toughnessMax = Math.max(0, Math.trunc(Number(cActor?.system?.derived?.toughness?.max) || 0));
            const adrenalineValue = Math.max(0, Math.trunc(Number(cActor?.system?.derived?.adrenaline?.value) || 0));
            const adrenalineMax = Math.max(0, Math.trunc(Number(cActor?.system?.derived?.adrenaline?.max) || 0));
            const disposition = Math.max(-1, Math.min(1, Math.trunc(Number(combatant?.token?.disposition ?? 0))));
            const isPc = cActor?.type === "character";
            const isNpc = cActor?.type === "npc";

            const hints = [];
            if (toughnessValue <= 0) hints.push("Critical");
            if (turnEconomy.tracked && Number(turnEconomy.actionsRemaining) <= 0) hints.push("No Action");
            if (turnEconomy.tracked && Number(turnEconomy.moveRemaining) <= 0) hints.push("No Move");
            if ((cActor?.system?.npc?.defeated ?? false) === true) hints.push("Defeated");
            const hasSpellAction = Array.isArray(cActor?.system?.npc?.quickActions)
                && cActor.system.npc.quickActions.some(action => String(action?.kind ?? "").toLowerCase() === "spell");
            const hasSpells = cActor?.items?.some(item => item.type === "spell");
            if (hasSpellAction || hasSpells) hints.push("Can Cast");
            const hasRanged = cActor?.items?.some(item =>
                item.type === "weapon" && String(item.system?.skill ?? "").toLowerCase().includes("ranged")
            );
            if (hasRanged) hints.push("Ranged");

            return {
                id: combatant.id,
                actorId: cActor?.id ?? "",
                name: cActor?.name ?? combatant.name ?? "Combatant",
                isActive: combat?.combatant?.id === combatant.id,
                initiative: Number.isFinite(Number(combatant.initiative))
                    ? Math.trunc(Number(combatant.initiative))
                    : 0,
                toughnessValue,
                toughnessMax,
                adrenalineValue,
                adrenalineMax,
                statuses: statusIds.join(", ") || "None",
                statusSet,
                isCritical: toughnessValue <= 0,
                actionsRemaining: Math.max(0, Math.trunc(Number(turnEconomy.actionsRemaining) || 0)),
                moveRemaining: Math.max(0, Math.trunc(Number(turnEconomy.moveRemaining) || 0)),
                noActionsLeft: Boolean(turnEconomy.tracked && Number(turnEconomy.actionsRemaining) <= 0),
                noMoveLeft: Boolean(turnEconomy.tracked && Number(turnEconomy.moveRemaining) <= 0),
                hints: hints.join(" | ") || "Standard",
                isPc,
                isNpc,
                disposition,
                dispositionLabel: dispositionLabels[String(disposition)] ?? "Neutral",
                isHostile: disposition < 0,
                selected: Boolean(cActor?.id && this._selectedCombatActorIds.has(cActor.id)),
                conditionButtons: conditionOptions.map(condition => ({
                    id: condition.id,
                    label: condition.label,
                    active: statusSet.has(condition.id)
                }))
            };
        });

        const allActorIds = new Set(combatantsBase.map(entry => entry.actorId).filter(Boolean));
        this._selectedCombatActorIds = new Set(
            Array.from(this._selectedCombatActorIds).filter(actorId => allActorIds.has(actorId))
        );

        const search = String(this._viewState.combatSearch ?? "").trim().toLowerCase();
        const filterId = String(this._viewState.combatFilter ?? "all");
        const sortId = String(this._viewState.combatSort ?? "initiative");

        const filteredCombatants = combatantsBase
            .filter(entry => {
                if (search && !entry.name.toLowerCase().includes(search)) return false;
                switch (filterId) {
                    case "pc":
                        return entry.isPc;
                    case "npc":
                        return entry.isNpc;
                    case "critical":
                        return entry.isCritical;
                    case "active":
                        return entry.isActive;
                    case "hostile":
                        return entry.isHostile;
                    default:
                        return true;
                }
            })
            .sort((a, b) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                if (sortId === "name") return a.name.localeCompare(b.name);
                if (sortId === "toughness") return b.toughnessValue - a.toughnessValue;
                return b.initiative - a.initiative;
            });

        const combatSummary = {
            total: combatantsBase.length,
            visible: filteredCombatants.length,
            critical: combatantsBase.filter(entry => entry.isCritical).length,
            noActions: combatantsBase.filter(entry => entry.noActionsLeft).length,
            noMove: combatantsBase.filter(entry => entry.noMoveLeft).length,
            selected: Array.from(this._selectedCombatActorIds).length
        };
        const npcPresetGroups = _groupNpcPresetsByCategory(NPC_PRESETS);

        return {
            ...data,
            threatLevel: Math.max(0, Math.min(10, Math.trunc(threatLevel))),
            targetName: actor?.name ?? target?.name ?? game.i18n.localize("LAUNDRY.AttackNoTarget"),
            hasTarget: Boolean(actor),
            pcs,
            hasPcs: pcs.length > 0,
            hasCombat: hasCombatStarted,
            hasCombatStarted,
            combatants: filteredCombatants,
            combatIsFilteredEmpty: hasCombatStarted && filteredCombatants.length === 0,
            combatSummary,
            combatHasSelections: this._selectedCombatActorIds.size > 0,
            combatFilters: [
                { id: "all", label: "All" },
                { id: "pc", label: "PCs" },
                { id: "npc", label: "NPCs" },
                { id: "hostile", label: "Hostile" },
                { id: "critical", label: "Critical" },
                { id: "active", label: "Active" }
            ],
            combatSorts: [
                { id: "initiative", label: "Initiative" },
                { id: "name", label: "Name" },
                { id: "toughness", label: "Toughness" }
            ],
            viewState: {
                ...this._viewState
            },
            conditionOptions,
            npcPresetGroups,
            teamLuck,
            teamLuckMax,
            teamLuckAutoSync
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
        html.find(".sync-team-luck").on("click", (ev) => this._onSyncTeamLuck(ev));
        html.find(".reset-team-luck").on("click", (ev) => this._onResetTeamLuck(ev));
        html.find(".request-bau").on("click", (ev) => this._onRequestBau(ev));
        html.find(".open-mission-generator").on("click", (ev) => this._onOpenMissionGenerator(ev));
        html.find(".apply-threat-buffs").on("click", (ev) => this._onApplyThreatBuffs(ev));
        html.find(".max-adrenaline").on("click", (ev) => this._onMaxAdrenaline(ev));
        html.find(".pc-adjust").on("click", (ev) => this._onPcAdjust(ev));
        html.find(".pc-bau").on("click", (ev) => this._onBauForPc(ev));
        html.find(".pc-open-sheet").on("click", (ev) => this._onOpenDossier(ev));
        html.find(".pc-kpi-ping").on("click", (ev) => this._onKpiPing(ev));
        html.find(".combat-adjust").on("click", (ev) => this._onCombatAdjust(ev));
        html.find(".combat-open-sheet").on("click", (ev) => this._onCombatOpenSheet(ev));
        html.find(".combat-next-turn").on("click", (ev) => this._onCombatNextTurn(ev));
        html.find(".combat-filter").on("change", (ev) => this._onCombatFilterChange(ev));
        html.find(".combat-sort").on("change", (ev) => this._onCombatSortChange(ev));
        html.find(".combat-search").on("input", (ev) => this._onCombatSearchInput(ev));
        html.find(".combat-auto-refresh").on("change", (ev) => this._onCombatAutoRefresh(ev));
        html.find(".combat-select").on("change", (ev) => this._onCombatSelect(ev));
        html.find(".combat-select-all").on("click", (ev) => this._onCombatSelectAll(ev));
        html.find(".combat-clear-selection").on("click", (ev) => this._onCombatClearSelection(ev));
        html.find(".combat-bulk-action").on("click", (ev) => this._onCombatBulkAction(ev));
        html.find(".combat-bulk-condition").on("click", (ev) => this._onCombatBulkCondition(ev));
        html.find(".combat-condition-toggle").on("click", (ev) => this._onCombatConditionToggle(ev));
        html.find(".spawn-npc").on("click", (ev) => this._onSpawnNpc(ev));
        html.find(".open-rules").on("click", (ev) => this._onOpenCompendium(ev, "laundry-rpg.rules"));
        html.find(".open-spells").on("click", (ev) => this._onOpenCompendium(ev, "laundry-rpg.spells"));
        this._armAutoRefresh();
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
        this.render(false);
    }

    async _onSyncTeamLuck(ev) {
        ev.preventDefault();
        const result = await game.laundry?.syncTeamLuckMax?.({ force: true });
        if (!result) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.TeamLuckSyncUnavailable"));
            return;
        }
        ui.notifications.info(game.i18n.format("LAUNDRY.TeamLuckSynced", {
            luck: Math.max(0, Math.trunc(Number(result.luck) || 0)),
            max: Math.max(0, Math.trunc(Number(result.max) || 0))
        }));
        this.render(false);
    }

    async _onResetTeamLuck(ev) {
        ev.preventDefault();
        const mode = String(ev.currentTarget?.dataset?.mode ?? "max").trim().toLowerCase();
        const toMax = mode !== "zero";
        const result = await game.laundry?.resetTeamLuck?.({ toMax });
        if (!result) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.TeamLuckResetUnavailable"));
            return;
        }
        ui.notifications.info(game.i18n.format("LAUNDRY.TeamLuckReset", {
            luck: Math.max(0, Math.trunc(Number(result.luck) || 0)),
            max: Math.max(0, Math.trunc(Number(result.max) || 0))
        }));
        this.render(false);
    }

    async _onRequestBau(ev) {
        ev.preventDefault();
        const target = _getPrimaryTargetToken();
        const actor = target?.actor ?? null;
        if (!actor) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.SelectTargetForBAU"));
            return;
        }
        await this._requestBauForActor(actor);
    }

    async _requestBauForActor(actor) {
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

    async _onMaxAdrenaline(ev) {
        ev.preventDefault();
        const pcs = _getPlayerCharacters();
        if (!pcs.length) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.NoPlayerCharacters"));
            return;
        }

        let changed = 0;
        for (const actor of pcs) {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.max) || 0));
            if (current === max) continue;
            await actor.update({ "system.derived.adrenaline.value": max });
            changed += 1;
        }

        ui.notifications.info(game.i18n.format("LAUNDRY.AdrenalineMaxedAll", { count: changed }));
        this.render(false);
    }

    async _onOpenMissionGenerator(ev) {
        ev.preventDefault();
        if (!game.user?.isGM) return;
        await openMissionGenerator();
    }

    async _onApplyThreatBuffs(ev) {
        ev.preventDefault();
        if (!game.user?.isGM) return;
        const threatLevel = Number(game.settings.get("laundry-rpg", "threatLevel")) || 0;
        const result = await applyThreatBuffsToCurrentScene({ threatLevel });
        ui.notifications.info(`Threat buffs applied to ${Math.max(0, Math.trunc(Number(result?.applied) || 0))} hostile NPC actor(s).`);
        this.render(false);
    }

    async _onPcAdjust(ev) {
        ev.preventDefault();
        const button = ev.currentTarget;
        const actorId = String(button.dataset.actorId ?? "");
        const resource = String(button.dataset.resource ?? "");
        const delta = Math.trunc(Number(button.dataset.delta) || 0);
        if (!actorId || !delta) return;

        const actor = game.actors?.get(actorId);
        if (!actor) return;

        if (resource === "adrenaline") {
            const value = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.max) || 0));
            const next = Math.max(0, Math.min(max, value + delta));
            if (next !== value) await actor.update({ "system.derived.adrenaline.value": next });
        } else if (resource === "injuries") {
            const value = Math.max(0, Math.trunc(Number(actor.system?.derived?.injuries?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.injuries?.max) || 0));
            const next = Math.max(0, Math.min(max, value + delta));
            if (next !== value) await actor.update({ "system.derived.injuries.value": next });
        }

        this.render(false);
    }

    async _onBauForPc(ev) {
        ev.preventDefault();
        const actorId = String(ev.currentTarget.dataset.actorId ?? "");
        if (!actorId) return;
        const actor = game.actors?.get(actorId);
        if (!actor) return;
        await this._requestBauForActor(actor);
    }

    async _onOpenDossier(ev) {
        ev.preventDefault();
        const actorId = String(ev.currentTarget.dataset.actorId ?? "");
        if (!actorId) return;
        const actor = game.actors?.get(actorId);
        actor?.sheet?.render(true);
    }

    async _onKpiPing(ev) {
        ev.preventDefault();
        const actorId = String(ev.currentTarget.dataset.actorId ?? "");
        if (!actorId) return;
        const actor = game.actors?.get(actorId);
        if (!actor) return;

        const kpiSummary = summarizeKpiEntries(normalizeKpiEntries(actor.system?.kpi));
        const owners = _getActorOwners(actor).map(user => user.id);
        if (!owners.length) return;
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker(),
            whisper: owners,
            content: `${game.i18n.format("LAUNDRY.KPIPingSent", { name: actor.name })} (${game.i18n.localize("LAUNDRY.KPIStatusOpen")}: ${kpiSummary.open})`
        });
        ui.notifications.info(game.i18n.format("LAUNDRY.KPIPingSent", { name: actor.name }));
    }

    async _onCombatAdjust(ev) {
        ev.preventDefault();
        const button = ev.currentTarget;
        const actorId = String(button.dataset.actorId ?? "").trim();
        const resource = String(button.dataset.resource ?? "").trim().toLowerCase();
        const delta = Math.trunc(Number(button.dataset.delta) || 0);
        if (!actorId || (!delta && !["action", "move", "adrenaline-action"].includes(resource))) return;

        const actor = game.actors?.get(actorId);
        if (!actor) return;
        await this._applyCombatResourceAdjustment(actor, { resource, delta, warn: true });
        this.render(false);
    }

    _clearAutoRefreshTimer() {
        if (this._autoRefreshTimer) {
            clearInterval(this._autoRefreshTimer);
            this._autoRefreshTimer = null;
        }
    }

    _armAutoRefresh() {
        this._clearAutoRefreshTimer();
        if (!this._viewState.autoRefresh) return;
        this._autoRefreshTimer = setInterval(() => {
            if (!this.rendered) {
                this._clearAutoRefreshTimer();
                return;
            }
            this.render(false);
        }, 5000);
    }

    _onCombatFilterChange(ev) {
        const requested = String(ev.currentTarget?.value ?? "all").trim().toLowerCase();
        const combatFilter = COMBAT_FILTER_IDS.has(requested) ? requested : "all";
        if (this._viewState.combatFilter === combatFilter) return;
        this._viewState.combatFilter = combatFilter;
        this.render(false);
    }

    _onCombatSortChange(ev) {
        const requested = String(ev.currentTarget?.value ?? "initiative").trim().toLowerCase();
        const combatSort = COMBAT_SORT_IDS.has(requested) ? requested : "initiative";
        if (this._viewState.combatSort === combatSort) return;
        this._viewState.combatSort = combatSort;
        this.render(false);
    }

    _onCombatSearchInput(ev) {
        const combatSearch = String(ev.currentTarget?.value ?? "").trim();
        if (this._viewState.combatSearch === combatSearch) return;
        this._viewState.combatSearch = combatSearch;
        if (this._searchDebounceTimer) clearTimeout(this._searchDebounceTimer);
        this._searchDebounceTimer = setTimeout(() => {
            this._searchDebounceTimer = null;
            if (this.rendered) this.render(false);
        }, 120);
    }

    _onCombatAutoRefresh(ev) {
        const enabled = Boolean(ev.currentTarget?.checked);
        if (this._viewState.autoRefresh === enabled) return;
        this._viewState.autoRefresh = enabled;
        if (!enabled) this._clearAutoRefreshTimer();
        this.render(false);
    }

    _onCombatSelect(ev) {
        const actorId = String(ev.currentTarget?.dataset?.actorId ?? "").trim();
        if (!actorId) return;
        if (ev.currentTarget?.checked) this._selectedCombatActorIds.add(actorId);
        else this._selectedCombatActorIds.delete(actorId);
        this.render(false);
    }

    _onCombatSelectAll(ev) {
        ev.preventDefault();
        for (const actorId of this._getVisibleCombatActorIds()) {
            this._selectedCombatActorIds.add(actorId);
        }
        this.render(false);
    }

    _onCombatClearSelection(ev) {
        ev.preventDefault();
        this._selectedCombatActorIds.clear();
        this.render(false);
    }

    async _onCombatBulkAction(ev) {
        ev.preventDefault();
        const resource = String(ev.currentTarget?.dataset?.resource ?? "").trim().toLowerCase();
        const delta = Math.trunc(Number(ev.currentTarget?.dataset?.delta) || 0);
        if (!resource) return;

        const actors = this._getSelectedCombatActors();
        if (!actors.length) {
            ui.notifications.warn("Select at least one combatant first.");
            return;
        }

        let applied = 0;
        for (const actor of actors) {
            const changed = await this._applyCombatResourceAdjustment(actor, {
                resource,
                delta,
                warn: false
            });
            if (changed) applied += 1;
        }

        ui.notifications.info(`${this._combatActionLabel(resource)} applied to ${applied}/${actors.length} selected combatants.`);
        this.render(false);
    }

    async _onCombatConditionToggle(ev) {
        ev.preventDefault();
        const actorId = String(ev.currentTarget?.dataset?.actorId ?? "").trim();
        const conditionId = String(ev.currentTarget?.dataset?.conditionId ?? "").trim().toLowerCase();
        if (!actorId || !conditionId) return;

        const actor = game.actors?.get(actorId);
        if (!actor) return;
        await this._toggleActorCondition(actor, conditionId);
        this.render(false);
    }

    async _onCombatBulkCondition(ev) {
        ev.preventDefault();
        const conditionId = String(ev.currentTarget?.dataset?.conditionId ?? "").trim().toLowerCase();
        if (!conditionId) return;

        const actors = this._getSelectedCombatActors();
        if (!actors.length) {
            ui.notifications.warn("Select at least one combatant first.");
            return;
        }

        const hasMissing = actors.some(actor => !this._actorHasCondition(actor, conditionId));
        let changed = 0;
        for (const actor of actors) {
            const actorHas = this._actorHasCondition(actor, conditionId);
            if (hasMissing && actorHas) continue;
            if (!hasMissing && !actorHas) continue;
            if (await this._setActorCondition(actor, conditionId, hasMissing)) changed += 1;
        }

        const modeLabel = hasMissing ? "applied" : "removed";
        ui.notifications.info(`${_conditionLabel(conditionId)} ${modeLabel} on ${changed}/${actors.length} selected combatants.`);
        this.render(false);
    }

    _getVisibleCombatActorIds() {
        const root = this.element?.[0];
        if (!root) return [];
        return Array.from(root.querySelectorAll(".gm-combat-row[data-actor-id]"))
            .map(row => String(row.dataset.actorId ?? "").trim())
            .filter(Boolean);
    }

    _getSelectedCombatActors() {
        return Array.from(this._selectedCombatActorIds)
            .map(actorId => game.actors?.get(actorId))
            .filter(Boolean);
    }

    _combatActionLabel(resource) {
        switch (resource) {
            case "toughness":
                return "Toughness update";
            case "adrenaline":
                return "Adrenaline update";
            case "action":
                return "Use Action";
            case "move":
                return "Use Move";
            case "adrenaline-action":
                return "Spend ADR for Action";
            default:
                return "Combat update";
        }
    }

    _actorHasCondition(actor, conditionId) {
        return _getActorStatusSet(actor).has(String(conditionId ?? "").trim().toLowerCase());
    }

    async _setActorCondition(actor, conditionId, shouldApply) {
        if (!actor || !conditionId) return false;
        if (shouldApply) {
            return Boolean(await game.laundry?.applyCondition?.(actor, conditionId, { suppressChat: true }));
        }
        return Boolean(await game.laundry?.removeCondition?.(actor, conditionId, { suppressChat: true }));
    }

    async _toggleActorCondition(actor, conditionId) {
        if (!actor || !conditionId) return false;
        const hasCondition = this._actorHasCondition(actor, conditionId);
        return this._setActorCondition(actor, conditionId, !hasCondition);
    }

    async _applyCombatResourceAdjustment(actor, { resource, delta = 0, warn = false } = {}) {
        if (!actor || !resource) return false;

        if (resource === "toughness") {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.toughness?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.toughness?.max) || 0));
            const next = Math.max(0, Math.min(max, current + delta));
            if (next === current) return false;
            await actor.update({
                "system.derived.toughness.value": next,
                "system.derived.toughness.damage": Math.max(0, max - next)
            });
            return true;
        }

        if (resource === "adrenaline") {
            const current = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
            const max = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.max) || 0));
            const next = Math.max(0, Math.min(max, current + delta));
            if (next === current) return false;
            await actor.update({ "system.derived.adrenaline.value": next });
            return true;
        }

        if (resource === "action") {
            const spent = await game.laundry?.consumeCombatAction?.(actor, { warn });
            return spent !== false;
        }

        if (resource === "move") {
            const spent = await game.laundry?.consumeCombatMove?.(actor, { warn });
            return spent !== false;
        }

        if (resource === "adrenaline-action") {
            const spent = await game.laundry?.spendAdrenalineForExtraAction?.(actor);
            return spent !== false;
        }

        return false;
    }

    async _onCombatOpenSheet(ev) {
        ev.preventDefault();
        const actorId = String(ev.currentTarget.dataset.actorId ?? "").trim();
        if (!actorId) return;
        const actor = game.actors?.get(actorId);
        actor?.sheet?.render(true);
    }

    async _onCombatNextTurn(ev) {
        ev.preventDefault();
        if (!game.user?.isGM) return;
        if (!game.combat?.started) return;
        await game.combat.nextTurn();
        this.render(false);
    }

    async _onSpawnNpc(ev) {
        ev.preventDefault();
        if (!game.user?.isGM) return;
        if (!canvas?.scene) {
            ui.notifications.warn("No active scene available.");
            return;
        }

        const root = this.element?.[0];
        const presetId = String(root?.querySelector('[name="spawnPreset"]')?.value ?? "").trim();
        const preset = getNpcPreset(presetId);
        if (!preset) {
            ui.notifications.warn("Choose an NPC preset first.");
            return;
        }

        const baseName = String(root?.querySelector('[name="spawnName"]')?.value ?? "").trim() || preset.name;
        const count = Math.max(1, Math.min(20, Math.trunc(Number(root?.querySelector('[name="spawnCount"]')?.value ?? 1) || 1)));
        const anchorToken = _getPrimaryTargetToken() ?? canvas.tokens?.controlled?.[0] ?? null;
        const anchorX = anchorToken?.document?.x ?? Math.max(0, Math.trunc(Number(canvas.scene.grid?.size) || 100) * 2);
        const anchorY = anchorToken?.document?.y ?? Math.max(0, Math.trunc(Number(canvas.scene.grid?.size) || 100) * 2);
        const grid = Math.max(50, Math.trunc(Number(canvas.scene.grid?.size) || 100));
        let created = 0;

        for (let idx = 0; idx < count; idx++) {
            const row = Math.floor(idx / 4);
            const col = idx % 4;
            const x = anchorX + (col * grid);
            const y = anchorY + (row * grid);
            const npcName = count > 1 ? `${baseName} ${idx + 1}` : baseName;
            const npc = await createNpcFromPreset({
                presetId: preset.id,
                name: npcName,
                scene: canvas.scene,
                x,
                y
            });
            if (npc) created += 1;
        }

        ui.notifications.info(`Spawned ${created} NPC(s) from ${preset.name}.`);
        this.render(false);
    }

    _onOpenCompendium(ev, packId) {
        ev.preventDefault();
        const pack = game.packs.get(packId);
        if (!pack) {
            ui.notifications.warn(game.i18n.localize("LAUNDRY.CompendiumUnavailable"));
            return;
        }
        pack.render(true);
    }

    static async handleBusinessAsUsualRequest({ actorId, actorName, sourceUserId } = {}) {
        const actor = game.actors?.get(actorId);
        if (!actor) return;
        if (!actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
        if (game.user.isGM) return;

        const gmName = game.users?.get(sourceUserId)?.name ?? game.i18n.localize("LAUNDRY.GM");
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize("LAUNDRY.BusinessAsUsualCheck"),
            content: `<p>${game.i18n.format("LAUNDRY.BAUDialogPrompt", { gm: gmName, name: actorName ?? actor.name })}</p>`,
            classes: ["laundry-rpg", "laundry-dialog"]
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

function _getPlayerCharacters() {
    return game.actors
        .filter(actor => actor.type === "character" && actor.hasPlayerOwner)
        .sort((a, b) => a.name.localeCompare(b.name));
}

function _getActorStatusSet(actor) {
    return new Set(
        Array.from(game.laundry?.getActorStatuses?.(actor) ?? [])
            .map(value => String(value ?? "").trim().toLowerCase())
            .filter(Boolean)
    );
}

function _conditionLabel(statusId) {
    const key = String(statusId ?? "").trim().toLowerCase();
    const fromConfig = game.laundry?.getConditionDefinition?.(key)?.name;
    if (fromConfig) return String(fromConfig);
    return key
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function _groupNpcPresetsByCategory(presets) {
    const byCategory = new Map();
    for (const preset of presets) {
        const category = String(preset?.category ?? "Other").trim() || "Other";
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category).push({
            id: preset.id,
            name: preset.name
        });
    }
    return Array.from(byCategory.entries())
        .map(([name, entries]) => ({
            name,
            entries: entries.sort((a, b) => a.name.localeCompare(b.name))
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
