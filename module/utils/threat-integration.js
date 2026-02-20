const THREAT_FLAG_SCOPE = "laundry-rpg";
const THREAT_FLAG_KEY = "threatBuff";
const THREAT_EFFECT_MARKER = "threatBuffEffect";

export async function applyThreatBuffsToCurrentScene({ scene = canvas?.scene, threatLevel = null } = {}) {
    if (!game.user?.isGM) return { applied: 0, affectedActors: [] };
    if (!scene) {
        ui.notifications.warn("No active scene to apply Threat buffs.");
        return { applied: 0, affectedActors: [] };
    }

    const resolvedThreat = _normalizeThreatLevel(
        threatLevel ?? game.settings.get("laundry-rpg", "threatLevel")
    );
    const tokenDocs = Array.from(scene.tokens ?? []);
    const affectedActors = [];
    const processed = new Set();

    for (const tokenDoc of tokenDocs) {
        if (!_isEligibleThreatTarget(tokenDoc)) continue;
        const actor = tokenDoc.actor;
        if (!actor) continue;
        if (processed.has(actor.uuid)) continue;
        processed.add(actor.uuid);

        await _upsertThreatBuffEffect(actor, {
            threatLevel: resolvedThreat,
            sceneId: scene.id,
            tokenName: tokenDoc.name ?? actor.name
        });
        affectedActors.push(actor);
    }

    const manualHints = [
        `Summon allies/minions up to Threat (${resolvedThreat}) when appropriate.`,
        `Escalate environmental hazards with current Threat.`,
        resolvedThreat >= 3
            ? "Equipment-based enemies can gain extra Traits/effects at Threat 3+."
            : "Equipment Trait escalation unlocks at Threat 3+."
    ];

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: `
            <div class="laundry-chat-card laundry-threat-card">
                <div class="laundry-chat-header">
                    <div class="laundry-chat-title">
                        <strong>Threat Buffs Applied</strong>
                        <span class="laundry-chat-subtitle">Hostile actors updated</span>
                    </div>
                    <span class="laundry-chat-stamp">THREAT ${resolvedThreat}</span>
                </div>
                <div class="laundry-chat-rows">
                    <div class="laundry-chat-row"><span class="laundry-chat-label">Threat Level</span><span class="laundry-chat-value">${resolvedThreat}</span></div>
                    <div class="laundry-chat-row"><span class="laundry-chat-label">Updated Actors</span><span class="laundry-chat-value">${affectedActors.length}</span></div>
                    <div class="laundry-chat-row"><span class="laundry-chat-label">Mechanical Buffs</span><span class="laundry-chat-value">+${resolvedThreat} Armour, +${resolvedThreat} Defence, +${resolvedThreat} Toughness regen/round, +${resolvedThreat} Adrenaline gain/round</span></div>
                    <div class="laundry-chat-row"><span class="laundry-chat-label">GM Guidance</span><span class="laundry-chat-value">${manualHints.map(note => foundry.utils.escapeHTML(note)).join(" ")}</span></div>
                </div>
            </div>`
    });

    return {
        applied: affectedActors.length,
        affectedActors: affectedActors.map(actor => actor.id)
    };
}

export async function applyThreatRoundRegeneration(combat) {
    if (!game.user?.isGM) return;
    if (!combat?.started) return;
    const combatant = combat.combatant;
    const actor = combatant?.actor ?? null;
    if (!actor || actor.type !== "npc") return;

    const threatFlag = actor.getFlag(THREAT_FLAG_SCOPE, THREAT_FLAG_KEY) ?? {};
    const enabled = Boolean(threatFlag?.active);
    if (!enabled) return;

    const threatLevel = _normalizeThreatLevel(
        threatFlag?.threatLevel ?? game.settings.get("laundry-rpg", "threatLevel")
    );
    if (threatLevel <= 0) return;

    const turnKey = `${Math.max(0, Math.trunc(Number(combat.round ?? 0) || 0))}:${Math.max(0, Math.trunc(Number(combat.turn ?? 0) || 0))}`;
    if (String(threatFlag?.lastRoundTick ?? "") === turnKey) return;

    const toughnessCurrent = Math.max(0, Math.trunc(Number(actor.system?.derived?.toughness?.value) || 0));
    const toughnessMax = Math.max(
        toughnessCurrent,
        Math.trunc(Number(actor.system?.derived?.toughness?.max ?? toughnessCurrent) || toughnessCurrent)
    );
    const adrenalineCurrent = Math.max(0, Math.trunc(Number(actor.system?.derived?.adrenaline?.value) || 0));
    const adrenalineMax = Math.max(
        adrenalineCurrent,
        Math.trunc(Number(actor.system?.derived?.adrenaline?.max ?? adrenalineCurrent) || adrenalineCurrent)
    );

    const nextToughness = Math.max(0, Math.min(toughnessMax, toughnessCurrent + threatLevel));
    const nextAdrenaline = Math.max(0, Math.min(adrenalineMax, adrenalineCurrent + threatLevel));
    const updates = {};

    if (nextToughness !== toughnessCurrent) {
        updates["system.derived.toughness.value"] = nextToughness;
        updates["system.derived.toughness.damage"] = Math.max(0, toughnessMax - nextToughness);
    }
    if (nextAdrenaline !== adrenalineCurrent) {
        updates["system.derived.adrenaline.value"] = nextAdrenaline;
    }

    if (Object.keys(updates).length) {
        await actor.update(updates);
        const safeName = foundry.utils.escapeHTML(actor.name ?? "Hostile Entity");
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
                <div class="laundry-chat-card laundry-threat-card">
                    <div class="laundry-chat-header">
                        <div class="laundry-chat-title">
                            <strong>${safeName}</strong>
                            <span class="laundry-chat-subtitle">Threat regeneration tick</span>
                        </div>
                        <span class="laundry-chat-stamp">ROUND TICK</span>
                    </div>
                    <div class="laundry-chat-rows">
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Toughness</span><span class="laundry-chat-value">${toughnessCurrent} -> ${nextToughness}</span></div>
                        <div class="laundry-chat-row"><span class="laundry-chat-label">Adrenaline</span><span class="laundry-chat-value">${adrenalineCurrent} -> ${nextAdrenaline}</span></div>
                    </div>
                </div>`
        });
    }

    await actor.setFlag(THREAT_FLAG_SCOPE, THREAT_FLAG_KEY, {
        ...threatFlag,
        active: true,
        threatLevel,
        lastRoundTick: turnKey
    });
}

function _normalizeThreatLevel(value) {
    return Math.max(0, Math.min(10, Math.trunc(Number(value) || 0)));
}

function _isEligibleThreatTarget(tokenDoc) {
    if (!tokenDoc) return false;
    if (tokenDoc.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
    const actor = tokenDoc.actor;
    if (!actor) return false;
    if (actor.type !== "npc") return false;
    return true;
}

async function _upsertThreatBuffEffect(actor, { threatLevel = 0, sceneId = "", tokenName = "" } = {}) {
    const existing = actor.effects.find(effect => Boolean(effect.getFlag?.(THREAT_FLAG_SCOPE, THREAT_EFFECT_MARKER)));
    if (threatLevel <= 0) {
        if (existing) {
            await actor.deleteEmbeddedDocuments("ActiveEffect", [existing.id]);
        }
        await actor.unsetFlag(THREAT_FLAG_SCOPE, THREAT_FLAG_KEY);
        return;
    }

    const effectChanges = [
        {
            key: "system.derived.armour.value",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: threatLevel
        },
        {
            key: "system.derived.defence.value",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: threatLevel
        }
    ];
    const effectData = {
        name: `Threat-Fueled Entity (+${threatLevel})`,
        img: "icons/svg/terror.svg",
        origin: actor.uuid,
        disabled: false,
        changes: effectChanges,
        flags: {
            [THREAT_FLAG_SCOPE]: {
                [THREAT_EFFECT_MARKER]: true,
                threatLevel,
                sceneId,
                tokenName,
                appliedAt: Date.now()
            }
        }
    };

    if (existing) {
        await existing.update(effectData);
    } else {
        await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }

    await actor.setFlag(THREAT_FLAG_SCOPE, THREAT_FLAG_KEY, {
        active: true,
        threatLevel,
        sceneId,
        tokenName,
        appliedAt: Date.now(),
        lastRoundTick: ""
    });
}
