import { LaundryActor } from "./actor/actor.js";
import { LaundryActorSheet } from "./actor/actor-sheet.js";
import { LaundryItem } from "./item/item.js";
import { LaundryItemSheet } from "./item/item-sheet.js";

Hooks.once('init', async function () {
    console.log('Laundry RPG | Initializing The Laundry RPG System');

    game.laundry = {
        LaundryActor,
        LaundryItem
    };

    CONFIG.Actor.documentClass = LaundryActor;
    CONFIG.Item.documentClass = LaundryItem;

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("laundry-rpg", LaundryActorSheet, { makeDefault: true });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("laundry-rpg", LaundryItemSheet, { makeDefault: true });

    // Preload Handlebars templates
    await preloadTemplates();
});

async function preloadTemplates() {
    const templatePaths = [
        "systems/laundry-rpg/templates/actor/actor-sheet.html",
        "systems/laundry-rpg/templates/item/item-sheet.html"
    ];

    return loadTemplates(templatePaths);
}
