import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();
const PACKS_DIR = path.join(ROOT, "packs");
const PACK_FILES = [
    "assignments.db",
    "talents.db",
    "weapons.db",
    "armour.db",
    "skills.db",
    "spells.db",
    "gear.db",
    "all-items.db",
    "enemies.db",
    "rules.db",
    "macros.db"
];

function hashFile(filename) {
    const payload = fs.readFileSync(path.join(PACKS_DIR, filename));
    return createHash("sha256").update(payload).digest("hex");
}

function snapshotHashes() {
    const out = {};
    for (const filename of PACK_FILES) {
        out[filename] = hashFile(filename);
    }
    return out;
}

function runRebuild() {
    const run = spawnSync("python3", ["scripts/rebuild_packs_from_json.py"], {
        cwd: ROOT,
        encoding: "utf8"
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
}

test("rebuild script is deterministic across consecutive runs", () => {
    runRebuild();
    const first = snapshotHashes();
    runRebuild();
    const second = snapshotHashes();
    assert.deepEqual(second, first);
});
