import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { averageGoalDifficulty, goalEnergyFromDifficulty, goalEnergyFromTasks } from "./goalLogic.js";

describe("goalLogic", () => {
  it("maps difficulty to goal energy 10..40", () => {
    assert.equal(goalEnergyFromDifficulty("EASY"), 10);
    assert.equal(goalEnergyFromDifficulty("MEDIUM"), 20);
    assert.equal(goalEnergyFromDifficulty("HARD"), 30);
    assert.equal(goalEnergyFromDifficulty("EPIC"), 40);
  });

  it("averages task difficulties for goal reward", () => {
    const tasks = [{ difficulty: "EASY" as const }, { difficulty: "EPIC" as const }];
    assert.equal(averageGoalDifficulty(tasks), "HARD");
    assert.equal(goalEnergyFromTasks(tasks), 30);
  });
});
