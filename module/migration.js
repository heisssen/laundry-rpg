export async function migrateWorld() {
    const updates = [];

    for (const actor of game.actors.contents) {
        if (actor.type === "npc") {
            const npc = actor.system?.npc ?? {};
            const npcUpdate = {};

            if (typeof npc !== "object" || Array.isArray(npc)) {
                npcUpdate["system.npc"] = {
                    mode: "lite",
                    class: "elite",
                    mobSize: 1,
                    trackInjuries: false,
                    fastDamage: true,
                    archetype: "",
                    defeated: false,
                    quickActions: []
                };
            } else {
                if (typeof npc.mode !== "string") npcUpdate["system.npc.mode"] = "lite";
                if (typeof npc.class !== "string") npcUpdate["system.npc.class"] = "elite";
                if (typeof npc.mobSize !== "number") npcUpdate["system.npc.mobSize"] = 1;
                if (typeof npc.trackInjuries !== "boolean") npcUpdate["system.npc.trackInjuries"] = false;
                if (typeof npc.fastDamage !== "boolean") npcUpdate["system.npc.fastDamage"] = true;
                if (typeof npc.archetype !== "string") npcUpdate["system.npc.archetype"] = "";
                if (typeof npc.defeated !== "boolean") npcUpdate["system.npc.defeated"] = false;
                if (!Array.isArray(npc.quickActions)) npcUpdate["system.npc.quickActions"] = [];
            }

            if (Object.keys(npcUpdate).length) {
                updates.push(actor.update(npcUpdate));
            }
        }

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
