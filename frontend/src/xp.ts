export const DIFFICULTY_XP = {
  EASY: 100,
  MEDIUM: 200,
  HARD: 400,
  EPIC: 1200,
} as const;

export function levelTargetXp(level: number): number {
  return 400 * Math.pow(2, Math.max(0, level - 1));
}
