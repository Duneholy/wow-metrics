import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyEnergyToggle,
  freshEnergyUser,
  type EnergyUserSlice,
  type ToggleKey,
} from "./energyActions.js";
import { BONUS_INSTANT, BONUS_LARGE, LOSS_LARGE } from "./energyLogic.js";

const TOGGLES: ToggleKey[] = [
  "bonusNoPhone",
  "bonusHeart",
  "bonusRecycle",
  "lossNoPhone",
  "lossHeart",
  "lossPill",
];

function clone(u: EnergyUserSlice): EnergyUserSlice {
  return { ...u };
}

function runSequence(base: EnergyUserSlice, keys: ToggleKey[]): EnergyUserSlice {
  return keys.reduce((u, k) => applyEnergyToggle(u, k), clone(base));
}

describe("energy toggles — single actions", () => {
  it("bonus noPhone at 100%: gained +10, energy capped", () => {
    const u = applyEnergyToggle(freshEnergyUser(), "bonusNoPhone");
    assert.equal(u.energy, 100);
    assert.equal(u.energyGainedWeek, 10);
    assert.equal(u.bonusNoPhoneUsed, true);
    assert.equal(u.bonusNoPhoneEnergyApplied, 0);
  });

  it("bonus noPhone undo restores 100% and gained 0", () => {
    let u = applyEnergyToggle(freshEnergyUser(), "bonusNoPhone");
    u = applyEnergyToggle(u, "bonusNoPhone");
    assert.equal(u.energy, 100);
    assert.equal(u.energyGainedWeek, 0);
    assert.equal(u.bonusNoPhoneUsed, false);
  });

  it("bonus noPhone at 80% adds energy", () => {
    const u = applyEnergyToggle(freshEnergyUser({ energy: 80 }), "bonusNoPhone");
    assert.equal(u.energy, 90);
    assert.equal(u.energyGainedWeek, 10);
    assert.equal(u.bonusNoPhoneEnergyApplied, 10);
  });

  it("bonus recycle +30% with toggle off/on", () => {
    let u = applyEnergyToggle(freshEnergyUser({ energy: 40 }), "bonusRecycle");
    assert.equal(u.energy, 70);
    assert.equal(u.energyGainedWeek, 30);
    assert.equal(u.bonusRecycleActive, true);
    assert.equal(u.bonusRecycleEnergyApplied, 30);
    u = applyEnergyToggle(u, "bonusRecycle");
    assert.equal(u.energy, 40);
    assert.equal(u.energyGainedWeek, 0);
    assert.equal(u.bonusRecycleActive, false);
  });

  it("loss noPhone subtracts energy and adds spent", () => {
    const u = applyEnergyToggle(freshEnergyUser(), "lossNoPhone");
    assert.equal(u.energy, 90);
    assert.equal(u.energySpentWeek, 10);
    assert.equal(u.lossNoPhoneEnergyApplied, 10);
  });

  it("loss noPhone undo restores energy and spent", () => {
    let u = applyEnergyToggle(freshEnergyUser(), "lossNoPhone");
    u = applyEnergyToggle(u, "lossNoPhone");
    assert.equal(u.energy, 100);
    assert.equal(u.energySpentWeek, 0);
  });

  it("undo after week rollover clears stale flag without changing energy or spent", () => {
    const u = applyEnergyToggle(
      freshEnergyUser({
        energy: 50,
        energySpentWeek: 10,
        lossNoPhoneUsed: true,
        lossNoPhoneEnergyApplied: 0,
      }),
      "lossNoPhone"
    );
    assert.equal(u.energy, 50);
    assert.equal(u.energySpentWeek, 10);
    assert.equal(u.lossNoPhoneUsed, false);
  });

  it("loss pill −40% with toggle off/on", () => {
    let u = applyEnergyToggle(freshEnergyUser(), "lossPill");
    assert.equal(u.energy, 60);
    assert.equal(u.energySpentWeek, 40);
    assert.equal(u.lossPillActive, true);
    assert.equal(u.lossPillEnergyApplied, 40);
    u = applyEnergyToggle(u, "lossPill");
    assert.equal(u.energy, 100);
    assert.equal(u.energySpentWeek, 0);
    assert.equal(u.lossPillActive, false);
  });
});

describe("energy toggles — 100 pseudo-random sequences", () => {
  const seeds = Array.from({ length: 100 }, (_, i) => i + 1);

  for (const seed of seeds) {
    it(`sequence seed ${seed} maintains invariants`, () => {
      let u = freshEnergyUser({ energy: 50 + (seed % 51) });
      const steps = 8 + (seed % 5);
      for (let i = 0; i < steps; i++) {
        const key = TOGGLES[(seed * 7 + i * 3) % TOGGLES.length]!;
        u = applyEnergyToggle(u, key);

        assert.ok(u.energy >= 0 && u.energy <= 100, `energy out of range after ${key}`);
        assert.ok(u.energySpentWeek >= 0, `spent negative after ${key}`);
        assert.ok(u.energyGainedWeek >= 0, `gained negative after ${key}`);

        if (key === "bonusNoPhone" && u.bonusNoPhoneUsed) {
          assert.ok(u.energyGainedWeek >= BONUS_INSTANT);
        }
        if (key === "bonusRecycle" && u.bonusRecycleActive) {
          assert.ok(u.energyGainedWeek >= BONUS_LARGE);
        }
        if (key === "lossPill" && u.lossPillActive) {
          assert.ok(u.energySpentWeek >= LOSS_LARGE);
        }
      }
    });
  }
});

describe("energy toggles — exhaustive double-toggle pairs", () => {
  for (const key of TOGGLES) {
    it(`${key} double toggle returns to stable state (energy 100 baseline)`, () => {
      const start = freshEnergyUser();
      const end = runSequence(start, [key, key]);
      assert.equal(end.energy, 100);
      if (key.startsWith("bonus")) {
        assert.equal(end.energyGainedWeek, 0);
      } else {
        assert.equal(end.energySpentWeek, 0);
      }
    });
  }
});
