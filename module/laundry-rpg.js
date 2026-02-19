import { LaundryActor } from "./actor/actor.js";
import { LaundryActorSheet } from "./actor/actor-sheet.js";
import { LaundryItem } from "./item/item.js";
import { LaundryItemSheet } from "./item/item-sheet.js";
import { migrateWorld } from "./migration.js";
import { bindDiceChatContextMenu } from "./dice.js";

/**
 * Global system configuration — consumed by templates via `config.*`
 */
const LAUNDRY = {
    attributes: {
        body:   { label: "Body" },
        mind:   { label: "Mind" },
        spirit: { label: "Spirit" }
    },
    skills: [
        { name: "Academics", attribute: "mind" },
        { name: "Athletics", attribute: "body" },
        { name: "Awareness", attribute: "mind" },
        { name: "Bureaucracy", attribute: "mind" },
        { name: "Close Combat", attribute: "body" },
        { name: "Computers", attribute: "mind" },
        { name: "Dexterity", attribute: "body" },
        { name: "Engineering", attribute: "mind" },
        { name: "Fast Talk", attribute: "spirit" },
        { name: "Fortitude", attribute: "body" },
        { name: "Intuition", attribute: "mind" },
        { name: "Magic", attribute: "mind" },
        { name: "Medicine", attribute: "mind" },
        { name: "Might", attribute: "body" },
        { name: "Occult", attribute: "mind" },
        { name: "Presence", attribute: "spirit" },
        { name: "Ranged", attribute: "body" },
        { name: "Reflexes", attribute: "body" },
        { name: "Resolve", attribute: "spirit" },
        { name: "Science", attribute: "mind" },
        { name: "Stealth", attribute: "body" },
        { name: "Survival", attribute: "mind" },
        { name: "Technology", attribute: "mind" },
        { name: "Zeal", attribute: "spirit" }
    ],
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
        { min:  1, label: "Poor" }
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

Hooks.once("ready", async function () {
    if (!game.user.isGM) return;
    try {
        await migrateWorld();
    } catch (err) {
        console.error("Laundry RPG | Migration failed", err);
    }
});

Hooks.on("renderChatMessage", (message, html) => {
    bindDiceChatContextMenu(message, html);
});

async function preloadTemplates() {
    return loadTemplates([
        "systems/laundry-rpg/templates/actor/actor-sheet.html",
        "systems/laundry-rpg/templates/item/item-sheet.html"
    ]);
}
