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
        adrenalineAvailable = 0
    } = {}, options = {}) {
        super(options);
        this.actor = actor;
        this.weapon = weapon;
        this.attackContext = attackContext ?? {};
        this.basePool = Math.max(0, Math.trunc(Number(basePool) || 0));
        this.complexity = Math.max(1, Math.trunc(Number(complexity) || 1));
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
            canSpendAdrenaline: this.adrenalineAvailable > 0
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

        this._finish({
            dn: Math.max(2, Math.min(6, Number(this.attackContext?.dn ?? 4) || 4)),
            complexity: this.complexity,
            spendAdrenaline,
            poolBonus: spendAdrenaline ? 1 : 0,
            damageBonus: 0,
            target: this.attackContext?.target ?? null,
            attackContext: this.attackContext
        });

        this.close();
    }
}
