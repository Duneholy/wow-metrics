import { describe, expect, it } from "vitest";
import { DIFFICULTY_COLORS, difficultyColor } from "./goalUtils";

describe("difficultyColor", () => {
  it("maps each difficulty to its WoW quality color", () => {
    expect(difficultyColor("EASY")).toBe("#ffffff");
    expect(difficultyColor("MEDIUM")).toBe("#1eff00");
    expect(difficultyColor("HARD")).toBe("#0070dd");
    expect(difficultyColor("EPIC")).toBe("#a335ee");
  });

  it("uses task difficulty for next-task display, not goal average", () => {
    // Goal with EASY + HARD tasks averages to MEDIUM; next HARD task must stay blue.
    const goalAverage = "MEDIUM" as const;
    const nextTask = "HARD" as const;
    expect(difficultyColor(nextTask)).not.toBe(difficultyColor(goalAverage));
    expect(difficultyColor(nextTask)).toBe(DIFFICULTY_COLORS.HARD);
  });
});
