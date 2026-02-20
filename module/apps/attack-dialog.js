export class LaundryAttackDialog extends Application {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["laundry-rpg", "laundry-attack-dialog", "dialog"],
            template: "systems/laundry-rpg/templates/apps/attack-dialog.html",
            width: 480,
            height: "auto",
            resizable: false
        });
    }

    /**
     * Render the attack prompt and resolve with attack modifiers, or null on cancel.
     */
    static async prompt(config = {}) {
        const app = new this(config);
        app.render(true);
        return app._resultPromise;
    }

    constructor({
        actor = null,
        weapon = null,
        attackContext = {},
        basePool = 1,
        complexity = 1,
        traitProfile = {},
        ammo = {},
        adrenalineAvailable = 0
    } = {}, options = {}) {
        super(options);
        this.actor = actor;
        this.weapon = weapon;
        this.attackContext = attackContext ?? {};
        this.basePool = Math.max(0, Math.trunc(Number(basePool) || 0));
        this.complexity = Math.max(1, Math.trunc(Number(complexity) || 1));
        this.traitProfile = {
            burst: Boolean(traitProfile?.burst),
            automatic: Boolean(traitProfile?.automatic),
            suppressive: Boolean(traitProfile?.suppressive),
            area: Boolean(traitProfile?.area),
            reload: Boolean(traitProfile?.reload)
        };
        this.ammo = {
            usesAmmo: Boolean(ammo?.usesAmmo),
            current: Math.max(0, Math.trunc(Number(ammo?.current) || 0)),
            max: Math.max(0, Math.trunc(Number(ammo?.max) || 0))
        };
        this.adrenalineAvailable = Math.max(0, Math.trunc(Number(adrenalineAvailable) || 0));

        this._resolved = false;
        this._resultPromise = new Promise(resolve => {
            this._resolveResult = resolve;
        });
    }

    get title() {
        return game.i18n.localize("LAUNDRY.AttackDialogTitle");
    }

    getData(options = {}) {
        const data = super.getData(options);
        const dn = Math.max(2, Math.min(6, Number(this.attackContext?.dn ?? 4) || 4));
        const ladderDelta = Math.trunc(Number(this.attackContext?.ladderDelta ?? 0) || 0);

        const ladderDeltaLabel = ladderDelta > 0
            ? game.i18n.format("LAUNDRY.LadderDiffHigher", { steps: ladderDelta })
            : (ladderDelta < 0
                ? game.i18n.format("LAUNDRY.LadderDiffLower", { steps: Math.abs(ladderDelta) })
                : game.i18n.localize("LAUNDRY.LadderDiffEqual"));
        const fireModes = this._getFireModes();

        return {
            ...data,
            weaponName: this.weapon?.name ?? "",
            targetName: this.attackContext?.target?.name || game.i18n.localize("LAUNDRY.AttackNoTarget"),
            hasTarget: Boolean(this.attackContext?.target?.name),
            modeLabel: this.attackContext?.isMelee
                ? game.i18n.localize("LAUNDRY.AttackModeMelee")
                : game.i18n.localize("LAUNDRY.AttackModeRanged"),
            attackerLabel: this.attackContext?.isMelee
                ? game.i18n.localize("LAUNDRY.Melee")
                : game.i18n.localize("LAUNDRY.Accuracy"),
            attackerRating: Math.max(0, Math.trunc(Number(this.attackContext?.attackerRating ?? 0) || 0)),
            defenceRating: Math.max(0, Math.trunc(Number(this.attackContext?.defenceRating ?? 0) || 0)),
            dn,
            complexity: this.complexity,
            ladderDeltaLabel,
            ladderDelta,
            basePool: this.basePool,
            adrenalineAvailable: this.adrenalineAvailable,
            canSpendAdrenaline: this.adrenalineAvailable > 0,
            fireModes,
            canSelectFireMode: fireModes.filter(mode => mode.enabled !== false).length > 1,
            ammo: this.ammo,
            traitProfile: this.traitProfile
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        const root = html[0];
        const form = root.querySelector("form");
        const cancelBtn = root.querySelector('[data-action="cancel"]');

        form?.addEventListener("submit", (event) => this._onSubmit(event));
        cancelBtn?.addEventListener("click", (event) => {
            event.preventDefault();
            this._finish(null);
            this.close();
        });
    }

    async close(options = {}) {
        if (!this._resolved) this._finish(null);
        return super.close(options);
    }

    _finish(payload) {
        if (this._resolved) return;
        this._resolved = true;
        this._resolveResult(payload);
    }

    _onSubmit(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const spendAdrenaline = formData.get("spendAdrenaline") === "on" && this.adrenalineAvailable > 0;
        const requestedMode = String(formData.get("fireMode") ?? "single").trim().toLowerCase();
        const fireModes = this._getFireModes();
        const enabledModes = fireModes.filter(mode => mode.enabled !== false);
        if (!enabledModes.length) {
            ui.notifications.warn("No available fire mode with current ammo.");
            return;
        }
        const fireMode = enabledModes.find(mode => mode.id === requestedMode) ?? enabledModes[0];

        this._finish({
            dn: Math.max(2, Math.min(6, Number(this.attackContext?.dn ?? 4) || 4)),
            complexity: this.complexity,
            spendAdrenaline,
            fireMode: fireMode.id,
            suppressiveMode: fireMode.id === "suppressive",
            areaMode: Boolean(this.traitProfile?.area),
            complexityBonus: Math.max(0, Math.trunc(Number(fireMode.complexityBonus) || 0)),
            ammoCost: Math.max(0, Math.trunc(Number(fireMode.ammoCost) || 0)),
            poolBonus: Math.max(0, Math.trunc(Number(fireMode.poolBonus) || 0)) + (spendAdrenaline ? 1 : 0),
            damageBonus: 0,
            target: this.attackContext?.target ?? null,
            attackContext: this.attackContext
        });

        this.close();
    }

    _getFireModes() {
        const usesAmmo = Boolean(this.ammo?.usesAmmo);
        const singleAmmo = usesAmmo ? 1 : 0;
        const modes = [{
            id: "single",
            label: usesAmmo ? "Single Shot (1 ammo)" : "Single Shot",
            poolBonus: 0,
            complexityBonus: 0,
            ammoCost: singleAmmo,
            enabled: !usesAmmo || this.ammo.current >= singleAmmo
        }];

        if (this.traitProfile?.burst) {
            modes.push({
                id: "burst",
                label: usesAmmo ? "Burst (+1d6, 3 ammo)" : "Burst (+1d6)",
                poolBonus: 1,
                complexityBonus: 0,
                ammoCost: usesAmmo ? 3 : 0,
                enabled: !usesAmmo || this.ammo.current >= 3
            });
        }

        if (this.traitProfile?.automatic) {
            modes.push({
                id: "auto",
                label: usesAmmo ? "Auto (+2d6, 5 ammo)" : "Auto (+2d6)",
                poolBonus: 2,
                complexityBonus: 0,
                ammoCost: usesAmmo ? 5 : 0,
                enabled: !usesAmmo || this.ammo.current >= 5
            });
        }

        if (this.traitProfile?.suppressive) {
            modes.push({
                id: "suppressive",
                label: usesAmmo ? "Suppressive (+1d6, Comp +1, 5 ammo)" : "Suppressive (+1d6, Comp +1)",
                poolBonus: 1,
                complexityBonus: 1,
                ammoCost: usesAmmo ? 5 : 0,
                enabled: !usesAmmo || this.ammo.current >= 5
            });
        }

        return modes;
    }
}
