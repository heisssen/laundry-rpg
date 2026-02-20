import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = process.cwd();

test("compendium QA script passes", () => {
    const run = spawnSync(process.execPath, ["scripts/qa_compendiums.mjs"], {
        cwd: ROOT,
        encoding: "utf8"
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("macro source has at least 9 ready-to-use macros", () => {
    const raw = fs.readFileSync(path.join(ROOT, "macros.json"), "utf8");
    const macros = JSON.parse(raw);
    assert.ok(Array.isArray(macros));
    assert.ok(macros.length >= 9, `Expected at least 9 macros, got ${macros.length}.`);
});
