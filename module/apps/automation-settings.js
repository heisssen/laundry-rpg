export class LaundryAutomationSettings extends FormApplication {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "laundry-automation-settings",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-automation-settings"],
            template: "systems/laundry-rpg/templates/apps/automation-settings.html",
            title: "Laundry Automation Tables",
            width: 520,
            height: "auto",
            submitOnClose: false,
            closeOnSubmit: true
        });
    }

    getData(options = {}) {
        const data = super.getData(options);
        const tables = Array.from(game.tables?.contents ?? [])
            .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
            .map(table => ({
                id: table.id,
                uuid: table.uuid,
                name: table.name ?? table.id
            }));

        const injuryTableUuid = String(game.settings.get("laundry-rpg", "injuryTableUuid") ?? "").trim();
        const mishapTableUuid = String(game.settings.get("laundry-rpg", "mishapTableUuid") ?? "").trim();
        const injuryTable = tables.find(entry => entry.uuid === injuryTableUuid) ?? null;
        const mishapTable = tables.find(entry => entry.uuid === mishapTableUuid) ?? null;

        return {
            ...data,
            tables,
            injuryTableUuid,
            mishapTableUuid,
            injuryTableName: injuryTable?.name ?? "Not linked",
            mishapTableName: mishapTable?.name ?? "Not linked"
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".open-table").on("click", (ev) => this._onOpenTable(ev));
        html.find(".reset-table").on("click", (ev) => this._onResetTable(ev));
        html.find(".cancel-settings").on("click", (ev) => {
            ev.preventDefault();
            this.close();
        });
    }

    async _onOpenTable(ev) {
        ev.preventDefault();
        const fieldName = String(ev.currentTarget?.dataset?.field ?? "").trim();
        if (!fieldName) return;
        const uuid = this._readFieldValue(fieldName);
        if (!uuid) {
            ui.notifications.warn("No RollTable selected.");
            return;
        }

        const table = await fromUuid(uuid);
        if (!(table instanceof RollTable)) {
            ui.notifications.warn("Selected RollTable is not available.");
            return;
        }
        table.sheet?.render(true);
    }

    async _onResetTable(ev) {
        ev.preventDefault();
        const tableType = String(ev.currentTarget?.dataset?.tableType ?? "").trim().toLowerCase();
        if (!["injury", "mishap"].includes(tableType)) return;

        const confirmed = await Dialog.confirm({
            title: "Reset Automation Table",
            content: `<p>Reset linked <strong>${tableType}</strong> automation table to system default?</p>`
        });
        if (!confirmed) return;

        const resetTable = await game.laundry?.resetAutomationTable?.(tableType);
        if (!resetTable) {
            ui.notifications.warn(`Failed to reset ${tableType} table.`);
            return;
        }

        ui.notifications.info(`Reset ${tableType} automation table: ${resetTable.name}`);
        this.render(false);
    }

    _readFieldValue(fieldName) {
        const form = this.form;
        if (!form) return "";
        const element = form.querySelector(`[name="${fieldName}"]`);
        return String(element?.value ?? "").trim();
    }

    async _updateObject(_event, formData) {
        const expanded = foundry.utils.expandObject(formData);
        const injuryTableUuid = String(expanded?.injuryTableUuid ?? "").trim();
        const mishapTableUuid = String(expanded?.mishapTableUuid ?? "").trim();

        await game.laundry?.setAutomationTable?.("injury", injuryTableUuid);
        await game.laundry?.setAutomationTable?.("mishap", mishapTableUuid);

        ui.notifications.info("Automation table links saved.");
    }
}
