export async function migrateWorld() {
    const updates = [];

    for (const actor of game.actors.contents) {
        const itemUpdates = [];

        for (const item of actor.items.contents) {
            const u = {};

            if (item.type === "spell") {
                const sys = item.system ?? {};
                if (typeof sys.dn !== "number") u["system.dn"] = 4;
                if (typeof sys.complexity !== "number") {
                    const fallback = typeof sys.level === "number" ? sys.level : 1;
                    u["system.complexity"] = fallback;
                }
                if (typeof sys.target !== "string") u["system.target"] = "";
                if (typeof sys.range !== "string") u["system.range"] = "";
                if (typeof sys.duration !== "string") u["system.duration"] = "";

                if (sys.cost !== undefined) u["system.-=cost"] = null;
            }

            if (item.type === "weapon") {
                if (item.system?.skill === "Ranged Combat") {
                    u["system.skill"] = "Ranged";
                }
                if (typeof item.system?.ammo !== "number") u["system.ammo"] = 0;
                if (typeof item.system?.ammoMax !== "number") u["system.ammoMax"] = 0;
                if (typeof item.system?.areaDistance !== "number") u["system.areaDistance"] = 2;
            }

            if (Object.keys(u).length) itemUpdates.push({ _id: item.id, ...u });
        }

        if (itemUpdates.length) {
            updates.push(actor.updateEmbeddedDocuments("Item", itemUpdates));
        }
    }

    if (updates.length) {
        await Promise.allSettled(updates);
        ui.notifications.info("Laundry RPG | Migration complete.");
    }
}
