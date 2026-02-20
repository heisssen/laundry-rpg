const DEFAULT_ATTRIBUTE_BY_SKILL = {
    "academics": "mind",
    "athletics": "body",
    "awareness": "mind",
    "bureaucracy": "mind",
    "close combat": "body",
    "computers": "mind",
    "dexterity": "body",
    "engineering": "mind",
    "fast talk": "spirit",
    "fortitude": "body",
    "intuition": "mind",
    "magic": "mind",
    "medicine": "mind",
    "might": "body",
    "occult": "mind",
    "presence": "spirit",
    "ranged": "body",
    "reflexes": "body",
    "resolve": "spirit",
    "science": "mind",
    "stealth": "body",
    "survival": "mind",
    "technology": "mind",
    "zeal": "spirit"
};

export const NPC_PRESETS = [
    {
        id: "cultist",
        name: "Cultist Cell",
        npcClass: "minion",
        mode: "lite",
        threat: "minor",
        mobSize: 4,
        fastDamage: true,
        trackInjuries: false,
        attributes: { body: 2, mind: 2, spirit: 2 },
        skillTraining: {
            "Close Combat": 1,
            "Awareness": 1,
            "Occult": 1,
            "Magic": 1,
            "Reflexes": 1
        },
        quickActions: [
            { name: "Knife Rush", kind: "attack", pool: 3, dn: 4, complexity: 1, damage: "1d6", traits: "Concealable", isMagic: false },
            { name: "Chanted Hex", kind: "spell", pool: 4, dn: 4, complexity: 1, damage: "1d6", traits: "", isMagic: true }
        ]
    },
    {
        id: "security",
        name: "Security Team",
        npcClass: "elite",
        mode: "lite",
        threat: "moderate",
        mobSize: 2,
        fastDamage: true,
        trackInjuries: false,
        attributes: { body: 3, mind: 2, spirit: 2 },
        skillTraining: {
            "Ranged": 2,
            "Close Combat": 1,
            "Reflexes": 2,
            "Awareness": 1,
            "Fortitude": 1
        },
        quickActions: [
            { name: "Sidearm Burst", kind: "attack", pool: 5, dn: 4, complexity: 1, damage: "2d6", traits: "Piercing, Reload", isMagic: false },
            { name: "Suppression Fire", kind: "attack", pool: 6, dn: 4, complexity: 2, damage: "2d6", traits: "Suppressive", isMagic: false }
        ]
    },
    {
        id: "field-agent",
        name: "Hostile Field Agent",
        npcClass: "elite",
        mode: "lite",
        threat: "major",
        mobSize: 1,
        fastDamage: false,
        trackInjuries: true,
        attributes: { body: 3, mind: 3, spirit: 2 },
        skillTraining: {
            "Ranged": 2,
            "Close Combat": 2,
            "Reflexes": 2,
            "Awareness": 2,
            "Resolve": 1
        },
        quickActions: [
            { name: "Pistol Shot", kind: "attack", pool: 5, dn: 4, complexity: 1, damage: "2d6", traits: "Piercing", isMagic: false },
            { name: "Tactical Strike", kind: "attack", pool: 5, dn: 4, complexity: 1, damage: "1d6+1", traits: "Crushing", isMagic: false }
        ]
    },
    {
        id: "aberration",
        name: "Aberration",
        npcClass: "boss",
        mode: "lite",
        threat: "extreme",
        mobSize: 1,
        fastDamage: false,
        trackInjuries: true,
        attributes: { body: 5, mind: 2, spirit: 4 },
        skillTraining: {
            "Close Combat": 3,
            "Fortitude": 3,
            "Reflexes": 2,
            "Awareness": 2,
            "Resolve": 2
        },
        quickActions: [
            { name: "Rending Limbs", kind: "attack", pool: 8, dn: 4, complexity: 1, damage: "3d6", traits: "Crushing, Piercing", isMagic: false },
            { name: "Psychic Shriek", kind: "spell", pool: 6, dn: 4, complexity: 2, damage: "2d6", traits: "Area", isMagic: true }
        ]
    },
    {
        id: "civilian",
        name: "Panicked Civilian",
        npcClass: "minion",
        mode: "lite",
        threat: "minor",
        mobSize: 3,
        fastDamage: true,
        trackInjuries: false,
        attributes: { body: 1, mind: 2, spirit: 2 },
        skillTraining: {
            "Athletics": 0,
            "Awareness": 1,
            "Fast Talk": 1,
            "Resolve": 0
        },
        quickActions: [
            { name: "Flee in Panic", kind: "test", pool: 3, dn: 4, complexity: 1, damage: "", traits: "", isMagic: false },
            { name: "Distracted Plea", kind: "test", pool: 3, dn: 4, complexity: 1, damage: "", traits: "", isMagic: false }
        ]
    }
];

export function getNpcPreset(presetId) {
    const key = String(presetId ?? "").trim().toLowerCase();
    if (!key) return null;
    return NPC_PRESETS.find(preset => preset.id === key) ?? null;
}

export function normalizeNpcQuickAction(action = {}) {
    const id = String(action.id ?? foundry.utils.randomID()).trim() || foundry.utils.randomID();
    const kindRaw = String(action.kind ?? "attack").trim().toLowerCase();
    const kind = ["attack", "spell", "test"].includes(kindRaw) ? kindRaw : "attack";
    return {
        id,
        name: String(action.name ?? "New Action").trim() || "New Action",
        kind,
        pool: Math.max(0, Math.trunc(Number(action.pool) || 0)),
        dn: Math.max(2, Math.min(6, Math.trunc(Number(action.dn) || 4))),
        complexity: Math.max(1, Math.trunc(Number(action.complexity) || 1)),
        damage: String(action.damage ?? "").trim(),
        traits: String(action.traits ?? "").trim(),
        isMagic: Boolean(action.isMagic || kind === "spell")
    };
}

export async function applyNpcPreset(actor, presetId, { replaceActions = true } = {}) {
    if (!actor || actor.type !== "npc") return null;
    const preset = getNpcPreset(presetId);
    if (!preset) return null;

    const npcSystem = actor.system?.npc ?? {};
    const nextActions = replaceActions
        ? preset.quickActions.map(entry => normalizeNpcQuickAction(entry))
        : [..._readActions(npcSystem.quickActions), ...preset.quickActions.map(entry => normalizeNpcQuickAction(entry))];

    await actor.update({
        "system.attributes.body.value": Math.max(1, Math.trunc(Number(preset.attributes?.body) || 1)),
        "system.attributes.mind.value": Math.max(1, Math.trunc(Number(preset.attributes?.mind) || 1)),
        "system.attributes.spirit.value": Math.max(1, Math.trunc(Number(preset.attributes?.spirit) || 1)),
        "system.threat": String(preset.threat ?? "minor"),
        "system.npc.mode": String(preset.mode ?? "lite"),
        "system.npc.class": String(preset.npcClass ?? "elite"),
        "system.npc.mobSize": Math.max(1, Math.trunc(Number(preset.mobSize) || 1)),
        "system.npc.fastDamage": Boolean(preset.fastDamage),
        "system.npc.trackInjuries": Boolean(preset.trackInjuries),
        "system.npc.archetype": preset.id,
        "system.npc.defeated": false,
        "system.npc.quickActions": nextActions
    });

    await _applyPresetSkillTraining(actor, preset.skillTraining ?? {});
    return preset;
}

export async function createNpcFromPreset({
    presetId,
    name = "",
    scene = canvas?.scene ?? null,
    x = null,
    y = null
} = {}) {
    const preset = getNpcPreset(presetId);
    if (!preset) return null;

    const actorName = String(name ?? "").trim() || preset.name;
    const created = await Actor.create({
        name: actorName,
        type: "npc",
        img: "systems/laundry-rpg/icons/generated/_defaults/assignment.svg",
        system: {
            threat: preset.threat ?? "minor"
        }
    });
    if (!created) return null;

    await applyNpcPreset(created, preset.id, { replaceActions: true });

    if (scene) {
        const sceneId = scene.id ?? scene;
        const targetScene = typeof sceneId === "string" ? game.scenes?.get(sceneId) : scene;
        if (targetScene) {
            const tokenX = Number.isFinite(Number(x))
                ? Math.trunc(Number(x))
                : Math.max(0, Math.trunc(Number(targetScene.grid?.size) || 100) * 2);
            const tokenY = Number.isFinite(Number(y))
                ? Math.trunc(Number(y))
                : Math.max(0, Math.trunc(Number(targetScene.grid?.size) || 100) * 2);
            await targetScene.createEmbeddedDocuments("Token", [{
                actorId: created.id,
                name: actorName,
                x: tokenX,
                y: tokenY,
                hidden: false
            }]);
        }
    }

    return created;
}

function _readActions(actions) {
    if (!Array.isArray(actions)) return [];
    return actions.map(entry => normalizeNpcQuickAction(entry));
}

async function _applyPresetSkillTraining(actor, trainingMap = {}) {
    const updates = [];
    const creations = [];
    const skillDefs = Array.from(CONFIG.LAUNDRY?.skills ?? []);
    const knownSkillDefs = new Map(skillDefs.map(entry => [String(entry.name ?? "").toLowerCase(), entry]));

    for (const [skillNameRaw, rawTraining] of Object.entries(trainingMap)) {
        const skillName = String(skillNameRaw ?? "").trim();
        if (!skillName) continue;
        const training = Math.max(0, Math.trunc(Number(rawTraining) || 0));
        const existing = actor.items.find(item => item.type === "skill" && item.name === skillName);
        if (existing) {
            updates.push({
                _id: existing.id,
                "system.training": training
            });
            continue;
        }

        const skillDef = knownSkillDefs.get(skillName.toLowerCase()) ?? null;
        const attribute = String(skillDef?.attribute ?? DEFAULT_ATTRIBUTE_BY_SKILL[skillName.toLowerCase()] ?? "mind");
        creations.push({
            name: skillName,
            type: "skill",
            img: "systems/laundry-rpg/icons/generated/_defaults/skill.svg",
            system: {
                attribute,
                training,
                focus: 0,
                description: ""
            }
        });
    }

    if (creations.length) await actor.createEmbeddedDocuments("Item", creations);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}
