import assert from "node:assert/strict";
import test from "node:test";

import {
    buildGearBundleRequest,
    buildSupportForecast,
    calculateGrantedQuantity,
    computeInjuryTrackUpdate
} from "../module/utils/automation-math.mjs";

test("multi-line requisition bundle computes aggregated DN and complexity", () => {
    const bundle = buildGearBundleRequest([
        {
            id: "line-a",
            name: "Line A",
            dn: 4,
            complexity: 1,
            quantity: 2,
            requirements: ""
        },
        {
            id: "line-b",
            name: "Line B",
            dn: 5,
            complexity: 2,
            quantity: 1,
            requirements: "Certification X"
        }
    ]);

    assert.ok(bundle);
    assert.equal(bundle.dn, 5);
    assert.equal(bundle.complexity, 5);
    assert.equal(bundle.lineCount, 2);
    assert.equal(bundle.totalQty, 3);
});

test("issued quantity math handles template quantity and override mode", () => {
    const scaled = calculateGrantedQuantity({
        existingQuantity: 3,
        templateQuantity: 2,
        requestedQuantity: 2,
        overrideExistingQuantity: false
    });
    assert.equal(scaled.addedQuantity, 4);
    assert.equal(scaled.nextQuantity, 7);

    const override = calculateGrantedQuantity({
        existingQuantity: 3,
        templateQuantity: 2,
        requestedQuantity: 2,
        overrideExistingQuantity: true
    });
    assert.equal(override.addedQuantity, 2);
    assert.equal(override.nextQuantity, 5);
});

test("injury track update respects cap", () => {
    const rising = computeInjuryTrackUpdate({
        current: 2,
        max: 3,
        delta: 1
    });
    assert.equal(rising.before, 2);
    assert.equal(rising.after, 3);
    assert.equal(rising.atCap, true);

    const capped = computeInjuryTrackUpdate({
        current: 3,
        max: 3,
        delta: 1
    });
    assert.equal(capped.before, 3);
    assert.equal(capped.after, 3);
    assert.equal(capped.changed, false);
});

test("forecast math includes paperwork bonus", () => {
    const forecast = buildSupportForecast({
        pool: 4,
        dn: 4,
        complexity: 3,
        bonusSuccesses: 1
    });

    // P(X >= 2) for X~Binomial(4, 0.5) = 11/16 = 0.6875
    assert.equal(forecast.requiredSuccesses, 2);
    assert.equal(forecast.requiredWithoutBonus, 3);
    assert.ok(Math.abs(forecast.chance - 0.6875) < 1e-9);
});
