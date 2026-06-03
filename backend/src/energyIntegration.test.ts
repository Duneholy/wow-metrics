import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyEnergyToggle,
  applySlotCompletion,
  displayGainedWeek,
  freshEnergyUser,
  type EnergyUserSlice,
  type ToggleKey,
} from "./energyActions.js";
import { tierToEnergy } from "./energyLogic.js";

const TOGGLE_KEYS: ToggleKey[] = [
  "bonusNoPhone",
  "bonusHeart",
  "bonusRecycle",
  "lossNoPhone",
  "lossHeart",
  "lossPill",
];
const TIER_VALUES = [10, 20, 30, 40];

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baselineAfterDailyTicks(): EnergyUserSlice {
  return freshEnergyUser({
    energy: 40,
    energyAtWeekStart: 100,
    energySpentWeek: 60,
    energyGainedWeek: 0,
  });
}

function completedGain(slots: Array<number | null>): number {
  return slots.reduce((sum, v) => sum + (v ?? 0), 0);
}

describe("energy integration: exercises + bonus/loss", () => {
  it("uncompleting exercise does not make display gained negative (legacy -20% bug)", () => {
    let u = baselineAfterDailyTicks();
    const slots: Array<number | null> = [20, null, null, null, null, null];
    u = applySlotCompletion(u, 20, true);
    assert.equal(u.energy, 60);
    assert.equal(u.energyGainedWeek, 0);
    assert.equal(displayGainedWeek(u, completedGain(slots)), 20);

    u = applySlotCompletion(u, 20, false);
    slots[0] = null;
    assert.equal(u.energy, 40);
    assert.equal(u.energyGainedWeek, 0);
    assert.equal(displayGainedWeek(u, completedGain(slots)), 0);
  });

  it("100 random interaction sequences keep invariants", () => {
    for (let test = 0; test < 100; test++) {
      const rand = mulberry32(1000 + test);
      let u = baselineAfterDailyTicks();
      const slots: Array<number | null> = [null, null, null, null, null, null];
      const steps = 5 + Math.floor(rand() * 25);

      for (let s = 0; s < steps; s++) {
        const roll = rand();
        if (roll < 0.45) {
          const key = TOGGLE_KEYS[Math.floor(rand() * TOGGLE_KEYS.length)];
          u = applyEnergyToggle(u, key);
        } else {
          const slotIdx = Math.floor(rand() * 6);
          const tier = 1 + Math.floor(rand() * 4);
          const value = tierToEnergy(tier);
          if (slots[slotIdx] != null) {
            u = applySlotCompletion(u, slots[slotIdx]!, false);
            slots[slotIdx] = null;
          } else {
            u = applySlotCompletion(u, value, true);
            slots[slotIdx] = value;
          }
        }

        const exGain = completedGain(slots);
        assert.ok(u.energy >= 0 && u.energy <= 100, `test ${test} step ${s}: energy ${u.energy}`);
        assert.ok(u.energyGainedWeek >= 0, `test ${test} step ${s}: gainedWeek ${u.energyGainedWeek}`);
        assert.ok(
          displayGainedWeek(u, exGain) >= 0,
          `test ${test} step ${s}: display ${displayGainedWeek(u, exGain)}`
        );
        assert.ok(u.energySpentWeek >= 0, `test ${test} step ${s}: spent ${u.energySpentWeek}`);
      }
    }
  });
});
