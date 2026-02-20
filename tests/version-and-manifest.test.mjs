import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function readJson(filename) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, filename), "utf8"));
}

test("system and manifest versions are synchronized", () => {
    const system = readJson("system.json");
    const manifest = readJson("manifest.json");
    assert.equal(system.version, manifest.version);
});

test("macro pack is declared in both manifests", () => {
    const system = readJson("system.json");
    const manifest = readJson("manifest.json");

    const systemMacroPack = (system.packs ?? []).find(entry => entry.name === "macros");
    const manifestMacroPack = (manifest.packs ?? []).find(entry => entry.name === "macros");

    assert.ok(systemMacroPack, "system.json missing macros pack definition");
    assert.ok(manifestMacroPack, "manifest.json missing macros pack definition");
    assert.equal(systemMacroPack.type, "Macro");
    assert.equal(manifestMacroPack.type, "Macro");
});
