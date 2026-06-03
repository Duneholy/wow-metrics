import { describe, expect, it } from "vitest";
import { DIFFICULTY_XP, levelTargetXp } from "./xp";

describe("XP balancing", () => {
  it("has expected rewards by difficulty", () => {
    expect(DIFFICULTY_XP.EASY).toBe(100);
    expect(DIFFICULTY_XP.MEDIUM).toBe(200);
    expect(DIFFICULTY_XP.HARD).toBe(400);
    expect(DIFFICULTY_XP.EPIC).toBe(1200);
  });

  it("uses level growth formula", () => {
    expect(levelTargetXp(1)).toBe(400);
    expect(levelTargetXp(2)).toBe(800);
    expect(levelTargetXp(3)).toBe(1600);
    expect(levelTargetXp(4)).toBe(3200);
  });
});
