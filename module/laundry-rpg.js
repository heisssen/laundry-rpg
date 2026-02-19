import { LaundryActor } from "./actor/actor.js";
import { LaundryActorSheet } from "./actor/actor-sheet.js";
import { LaundryItem } from "./item/item.js";
import { LaundryItemSheet } from "./item/item-sheet.js";

/**
 * Global system configuration — consumed by templates via `config.*`
 */
const LAUNDRY = {
    attributes: {
        body:   { label: "Body" },
        mind:   { label: "Mind" },
        spirit: { label: "Spirit" }
    },
    clearances: [
        "UNCLASSIFIED",
        "CONFIDENTIAL",
        "SECRET",
        "TOP_SECRET",
        "COSMIC"
    ],
    threatLevels: {
        minor:    "Minor",
        moderate: "Moderate",
        major:    "Major",
        extreme:  "Extreme",
        cosmic:   "Cosmic"
    },
    ladder: [
        { min: 12, label: "Unprecedented" },
        { min: 10, label: "Extraordinary" },
        { min:  8, label: "Superb" },
        { min:  6, label: "Great" },
        { min:  4, label: "Good" },
        { min:  2, label: "Average" },
        { min:  0, label: "Poor" }
    ]
};

Hooks.once("init", async function () {
    console.log("Laundry RPG | Initialising The Laundry RPG System");

    game.laundry = { LaundryActor, LaundryItem, config: LAUNDRY };
    CONFIG.LAUNDRY = LAUNDRY;

    CONFIG.Actor.documentClass = LaundryActor;
    CONFIG.Item.documentClass  = LaundryItem;

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("laundry-rpg", LaundryActorSheet, {
        makeDefault: true,
        label: "Laundry RPG Character Sheet"
    });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("laundry-rpg", LaundryItemSheet, {
        makeDefault: true,
        label: "Laundry RPG Item Sheet"
    });

    // Custom Handlebars helpers
    Handlebars.registerHelper("laundryEq", (a, b) => a === b);
    Handlebars.registerHelper("laundryOr", (a, b) => a || b);
    Handlebars.registerHelper("laundryGear", (type) =>
        ["gear", "weapon", "armour"].includes(type)
    );

    await preloadTemplates();

    console.log("Laundry RPG | System ready.");
});

async function preloadTemplates() {
    return loadTemplates([
        "systems/laundry-rpg/templates/actor/actor-sheet.html",
        "systems/laundry-rpg/templates/item/item-sheet.html"
    ]);
}
