import { SUPERVISOR_MISSION_TABLES } from "../utils/supervisors-guide-data.js";

const APP_API = foundry.applications?.api ?? {};
const BaseApplication = APP_API.ApplicationV2 ?? Application;
const HandlebarsMixin = APP_API.HandlebarsApplicationMixin ?? (Base => Base);

export class LaundryMissionGenerator extends HandlebarsMixin(BaseApplication) {
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
            id: "laundry-mission-generator",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-mission-generator"],
            tag: "section",
            window: {
                title: "Mission Generator"
            },
            position: {
                width: 620,
                height: "auto"
            }
        },
        { inplace: false }
    );

    static PARTS = {
        body: {
            template: "systems/laundry-rpg/templates/apps/mission-generator.html"
        }
    };

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions ?? {}, {
            id: "laundry-mission-generator",
            classes: ["laundry-rpg", "laundry-dialog", "laundry-mission-generator"],
            template: "systems/laundry-rpg/templates/apps/mission-generator.html",
            title: "Mission Generator",
            width: 620,
            height: "auto",
            resizable: true
        });
    }

    constructor(options = {}) {
        super(options);
        this._mission = null;
    }

    async _prepareContext(_options) {
        return this._buildContext();
    }

    getData() {
        return this._buildContext();
    }

    _buildContext() {
        return {
            mission: this._mission,
            hasMission: Boolean(this._mission)
        };
    }

    async _onRender(context, options) {
        if (super._onRender) await super._onRender(context, options);
        this._activateActions();
    }

    activateListeners(html) {
        super.activateListeners?.(html);
        this._activateActions(html?.[0] ?? html);
    }

    _activateActions(rootElement = null) {
        const root = rootElement ?? _resolveApplicationRoot(this);
        if (!root) return;
        if (root.dataset?.laundryMissionBound === "true") return;
        if (root.dataset) root.dataset.laundryMissionBound = "true";

        root.querySelectorAll('[data-action="generate"]').forEach(button => {
            button.addEventListener("click", (ev) => this._onGenerate(ev));
        });
        root.querySelectorAll('[data-action="send"]').forEach(button => {
            button.addEventListener("click", (ev) => this._onSend(ev));
        });
    }

    async _onGenerate(event) {
        event.preventDefault();
        this._mission = generateMissionBriefing();
        await _rerenderApp(this);
    }

    async _onSend(event) {
        event.preventDefault();
        if (!this._mission) this._mission = generateMissionBriefing();
        await postMissionBriefingToChat(this._mission);
        ui.notifications.info("Mission briefing posted to chat.");
        await _rerenderApp(this);
    }
}

export function generateMissionBriefing() {
    const table = SUPERVISOR_MISSION_TABLES;
    const location = _pickRandom(table.locations);
    const objective = _pickRandom(table.objectives);
    const rumour = _pickRandom(table.rumours);
    const corroboratingIntel = _pickRandom(table.corroboration);
    const asset = _pickRandom(table.assets);
    const civilian = _pickRandom(table.civilians);
    const target = _pickRandom(table.targets);
    const targetStatus = _pickRandom(table.targetStatus);
    const culprit = _pickRandom(table.culprits);
    const motive = _pickRandom(table.motives);
    const internalComplication = _pickRandom(table.internalComplications);
    const externalComplication = _pickRandom(table.externalComplications);
    const groundZero = _pickRandom(table.groundZero);
    const crisis = _pickRandom(table.crises);

    const buzzword1 = _pickRandom(table.occultBuzzwords.computationalPrefix1).toUpperCase();
    const buzzword2 = _pickRandom(table.occultBuzzwords.ritualSubject).toUpperCase();
    const codenameModifier = _pickRandom(table.codenames.miscellaneous);
    const operationName = `${buzzword1} ${buzzword2}`;

    return {
        generatedAt: Date.now(),
        operationName,
        codenameModifier,
        location,
        objective,
        suspect: `${target} (${targetStatus})`,
        culprit,
        motive,
        complication: `${internalComplication}; ${externalComplication}.`,
        internalComplication,
        externalComplication,
        intel: `${rumour}; ${corroboratingIntel}.`,
        rumour,
        corroboratingIntel,
        peopleOfInterest: {
            asset,
            civilian,
            target,
            targetStatus
        },
        escalation: {
            groundZero,
            crisis
        }
    };
}

export async function postMissionBriefingToChat(mission) {
    if (!mission) return null;

    const safeOperation = _escapeHtml(mission.operationName ?? "UNSPECIFIED");
    const safeModifier = _escapeHtml(mission.codenameModifier ?? "UNSPECIFIED");
    const safeLocation = _escapeHtml(mission.location ?? "UNSPECIFIED");
    const safeObjective = _escapeHtml(mission.objective ?? "UNSPECIFIED");
    const safeSuspect = _escapeHtml(mission.suspect ?? "UNSPECIFIED");
    const safeCulprit = _escapeHtml(mission.culprit ?? "UNSPECIFIED");
    const safeComplication = _escapeHtml(mission.complication ?? "UNSPECIFIED");
    const safeMotive = _escapeHtml(mission.motive ?? "UNSPECIFIED");
    const safeIntel = _escapeHtml(mission.intel ?? "UNSPECIFIED");
    const safeAsset = _escapeHtml(mission.peopleOfInterest?.asset ?? "UNSPECIFIED");
    const safeCivilian = _escapeHtml(mission.peopleOfInterest?.civilian ?? "UNSPECIFIED");
    const safeGroundZero = _escapeHtml(mission.escalation?.groundZero ?? "UNSPECIFIED");
    const safeCrisis = _escapeHtml(mission.escalation?.crisis ?? "UNSPECIFIED");

    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-mission-card">
                <div class="laundry-mission-header">
                    <strong>TOP SECRET // EYES ONLY</strong>
                    <span>SUPERVISOR BRIEFING</span>
                </div>
                <h3>OPERATION: ${safeOperation}</h3>
                <p class="laundry-mission-line"><strong>Codename Marker:</strong> ${safeModifier}</p>
                <p class="laundry-mission-line"><strong>Location:</strong> ${safeLocation}</p>
                <p class="laundry-mission-line"><strong>Objective:</strong> ${safeObjective}</p>
                <p class="laundry-mission-line"><strong>Suspect:</strong> ${safeSuspect}</p>
                <p class="laundry-mission-line"><strong>Culprit:</strong> ${safeCulprit}</p>
                <p class="laundry-mission-line"><strong>Motive:</strong> ${safeMotive}</p>
                <p class="laundry-mission-line"><strong>Complication:</strong> ${safeComplication}</p>
                <p class="laundry-mission-line"><strong>Relevant Intel:</strong> ${safeIntel}</p>
                <p class="laundry-mission-line"><strong>People of Interest:</strong> Asset ${safeAsset}; Civilian ${safeCivilian}.</p>
                <p class="laundry-mission-line"><strong>Escalation Path:</strong> ${safeGroundZero} -> ${safeCrisis}</p>
            </div>`
    });
}

export async function openMissionGenerator() {
    const existing = Object.values(ui.windows ?? {}).find(app =>
        app instanceof LaundryMissionGenerator && app.rendered
    );
    if (existing) {
        existing.bringToTop?.();
        return existing;
    }
    const app = new LaundryMissionGenerator();
    await app.render(true);
    return app;
}

function _pickRandom(entries = []) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return "";
    const index = Math.floor(Math.random() * list.length);
    return String(list[index] ?? "").trim();
}

function _escapeHtml(value) {
    const escape = foundry.utils?.escapeHTML;
    if (typeof escape === "function") return escape(String(value ?? ""));
    return String(value ?? "");
}

function _resolveApplicationRoot(app) {
    const element = app?.element ?? null;
    if (!element) return null;
    if (element instanceof HTMLElement) return element;
    if (Array.isArray(element) || typeof element.length === "number") return element[0] ?? null;
    return null;
}

async function _rerenderApp(app) {
    if (!app?.render) return;
    try {
        await app.render({ force: true });
    } catch (_err) {
        await app.render(true);
    }
}
