import type { User } from "@prisma/client";

export const ENERGY_MAX = 100;
export const BONUS_INSTANT = 10;
export const BONUS_LARGE = 30;
export const LOSS_LARGE = 40;

export function tierToEnergy(tier: number): number {
  return Math.min(4, Math.max(1, tier)) * 10;
}

export function clampEnergy(n: number): number {
  return Math.max(0, Math.min(ENERGY_MAX, Math.round(n)));
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDaysKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** Monday 00:00 local date key for the current week. */
export function getMondayWeekKey(d = new Date()): string {
  const date = new Date(d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return localDateKey(date);
}

export type EnergyFlags = {
  bonusNoPhoneUsed: boolean;
  bonusHeartUsed: boolean;
  bonusRecycleActive: boolean;
  lossNoPhoneUsed: boolean;
  lossHeartUsed: boolean;
  lossPillActive: boolean;
};

export type EnergyStatePayload = {
  energy: number;
  weekKey: string;
  energyAtWeekStart: number;
  spentWeek: number;
  gainedWeek: number;
  flags: EnergyFlags;
};

/** New week: keep energy pool, reset week counters and toggle buttons. */
export function applyWeekRollover(user: User, weekKey: string): Partial<User> {
  return {
    energyWeekKey: weekKey,
    energyAtWeekStart: clampEnergy(user.energy),
    energySpentWeek: 0,
    energyGainedWeek: 0,
    bonusNoPhoneUsed: false,
    bonusNoPhoneEnergyApplied: 0,
    bonusHeartUsed: false,
    bonusHeartEnergyApplied: 0,
    bonusRecycleActive: false,
    bonusRecycleEnergyApplied: 0,
    lossNoPhoneUsed: false,
    lossNoPhoneEnergyApplied: 0,
    lossHeartUsed: false,
    lossHeartEnergyApplied: 0,
    lossPillActive: false,
    lossPillEnergyApplied: 0,
    lossPillInstantApplied: false,
    lossPillSpentRecorded: 0,
    energyLastProcessedDate: null,
  };
}

/** Fix only clearly corrupted week counters (legacy bugs). */
export function repairWeekCounters(user: User): Partial<User> | null {
  const patch: Partial<User> = {};
  if (user.energySpentWeek > 200) {
    patch.energySpentWeek = Math.max(0, user.energyAtWeekStart - user.energy + user.energyGainedWeek);
  }
  if (user.energyGainedWeek > 200) {
    patch.energyGainedWeek = Math.min(user.energyGainedWeek, 100);
  }
  if (user.energyGainedWeek < 0) {
    patch.energyGainedWeek = 0;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Goal completion was credited to energyGainedWeek but the same amount was also
 * wrongly added to energyAtWeekStart and energySpentWeek (legacy reconcile bug).
 */
export function repairGoalInflatedWeekAnchors(
  user: User,
  goalCredits: number,
  exerciseGain = 0,
  asOf = new Date()
): Partial<User> | null {
  if (goalCredits <= 0 || hasActiveEnergyModifiers(user, exerciseGain)) return null;

  const impliedAnchor = user.energy + user.energySpentWeek - user.energyGainedWeek;
  if (user.energyAtWeekStart !== impliedAnchor) return null;

  const maxWeekStart = user.energy + user.energySpentWeek - user.energyGainedWeek - goalCredits;
  if (user.energyAtWeekStart <= maxWeekStart) return null;

  const newStart = user.energyAtWeekStart - goalCredits;
  const newSpent = user.energySpentWeek - goalCredits;
  if (newStart < 0 || newSpent < 0) return null;
  if (newStart - newSpent + user.energyGainedWeek !== user.energy) return null;

  return {
    energyAtWeekStart: newStart,
    energySpentWeek: newSpent,
  };
}

function applyOneDayTick(
  dailyLoss: number,
  energy: number,
  spent: number,
  gained: number
): { energy: number; spent: number; gained: number } {
  return {
    energy: clampEnergy(energy - dailyLoss),
    spent: spent + dailyLoss,
    gained,
  };
}

/** Daily ticks Mon..yesterday from a given week-start energy (no button effects). */
export function replayDailyTicksFromStart(
  dailyLoss: number,
  energyAtWeekStart: number,
  weekKey: string,
  asOf = new Date()
): { energy: number; spent: number; gained: number } {
  const todayKey = localDateKey(asOf);
  const yesterdayKey = addDaysKey(todayKey, -1);
  let cursor = weekKey;
  let energy = energyAtWeekStart;
  let spent = 0;
  let gained = 0;
  while (cursor <= yesterdayKey) {
    const tick = applyOneDayTick(dailyLoss, energy, spent, gained);
    energy = tick.energy;
    spent = tick.spent;
    gained = tick.gained;
    cursor = addDaysKey(cursor, 1);
  }
  return { energy, spent, gained };
}

/** Daily ticks Mon..yesterday from week start (10% per day, no button effects). */
export function replayDailyTicksToYesterday(
  user: Pick<User, "energyAtWeekStart" | "energyWeekKey" | "dailyEnergyLoss">,
  asOf = new Date()
): { energy: number; spent: number; gained: number } {
  const mondayKey = user.energyWeekKey ?? getMondayWeekKey(asOf);
  return replayDailyTicksFromStart(user.dailyEnergyLoss, user.energyAtWeekStart, mondayKey, asOf);
}

/** Sum of energy from completed exercise slots this week (not stored in energyGainedWeek). */
export function completedExerciseEnergyGain(completedSlotValues: number[]): number {
  return completedSlotValues.reduce((sum, v) => sum + v, 0);
}

/** Net energy delta from stored toggle applied amounts (order-independent). */
export function modifierEnergyDelta(user: User): number {
  let delta = 0;
  if (user.bonusNoPhoneUsed) delta += user.bonusNoPhoneEnergyApplied;
  if (user.bonusHeartUsed) delta += user.bonusHeartEnergyApplied;
  if (user.bonusRecycleActive) delta += user.bonusRecycleEnergyApplied ?? 0;
  if (user.lossNoPhoneUsed) delta -= user.lossNoPhoneEnergyApplied;
  if (user.lossHeartUsed) delta -= user.lossHeartEnergyApplied;
  if (user.lossPillActive) delta -= user.lossPillEnergyApplied ?? 0;
  return delta;
}

export function hasActiveEnergyModifiers(user: User, exerciseGain = 0): boolean {
  return (
    exerciseGain > 0 ||
    user.bonusNoPhoneUsed ||
    user.bonusHeartUsed ||
    user.bonusRecycleActive ||
    user.lossNoPhoneUsed ||
    user.lossHeartUsed ||
    user.lossPillActive
  );
}

export function expectedEnergyAfterModifiers(
  user: User,
  baseEnergy: number,
  exerciseGain = 0
): number {
  return clampEnergy(baseEnergy + modifierEnergyDelta(user) + exerciseGain);
}

/** Loss-button amounts recorded in energySpentWeek (nominal, not applied energy). */
export function lossSpentFromFlags(user: User): number {
  let spent = 0;
  if (user.lossNoPhoneUsed) spent += BONUS_INSTANT;
  if (user.lossHeartUsed) spent += BONUS_INSTANT;
  if (user.lossPillActive) spent += LOSS_LARGE;
  return spent;
}

/** Calendar days from week Monday through yesterday (inclusive). */
export function countCompletedDailyTicks(mondayKey: string, yesterdayKey: string): number {
  if (mondayKey > yesterdayKey) return 0;
  let count = 0;
  let cursor = mondayKey;
  while (cursor <= yesterdayKey) {
    count++;
    cursor = addDaysKey(cursor, 1);
  }
  return count;
}

/** Midnight daily ticks in the current week through today (Monday 00:00 counts on Monday). */
export function countCompletedDailyTicksInWeek(mondayKey: string, asOf = new Date()): number {
  const todayKey = localDateKey(asOf);
  if (mondayKey > todayKey) return 0;
  return countCompletedDailyTicks(mondayKey, todayKey);
}

/** Spent week counter from completed daily ticks + loss toggles. */
export function computeExpectedSpentWeek(user: User, asOf = new Date()): number {
  const mondayKey = user.energyWeekKey ?? getMondayWeekKey(asOf);
  const dailyTicks = countCompletedDailyTicksInWeek(mondayKey, asOf);
  return dailyTicks * user.dailyEnergyLoss + lossSpentFromFlags(user);
}

/**
 * Align week-start and spent counters with the energy pool and calendar ticks.
 * Does not change energy — only fixes display counters after rollover or stale toggles.
 */
export function reconcileWeekDisplayAnchors(
  user: User,
  exerciseGain = 0,
  asOf = new Date()
): Partial<User> | null {
  if (hasActiveEnergyModifiers(user, exerciseGain)) return null;

  const lossSpent = lossSpentFromFlags(user);
  const recordedDaily = Math.max(0, user.energySpentWeek - lossSpent);
  const calendarDaily = Math.max(0, computeExpectedSpentWeek(user, asOf) - lossSpent);
  const impliedDaily = dailySpentImpliedByEnergy(user, exerciseGain);
  const targetDaily = Math.max(recordedDaily, calendarDaily, impliedDaily);
  const targetSpent = targetDaily + lossSpent;
  const targetWeekStart = user.energy + targetSpent - user.energyGainedWeek;

  if (targetWeekStart === user.energyAtWeekStart && targetSpent === user.energySpentWeek) {
    return null;
  }

  return {
    energyAtWeekStart: clampEnergy(targetWeekStart),
    energySpentWeek: targetSpent,
  };
}

/** Daily −10% total implied by energy pool when no extra modifiers confuse the math. */
export function dailySpentImpliedByEnergy(user: User, exerciseGain = 0): number {
  const raw =
    user.energyAtWeekStart -
    user.energy +
    user.energyGainedWeek +
    modifierEnergyDelta(user) +
    exerciseGain -
    lossSpentFromFlags(user);
  return Math.max(0, raw);
}

/** Reconcile target: never lower spent below ticks already reflected in energy or replay. */
export function reconcileSpentWeekTarget(user: User, exerciseGain = 0, asOf = new Date()): number {
  const expected = computeExpectedSpentWeek(user, asOf);
  let target = Math.max(user.energySpentWeek, expected);
  if (!hasActiveEnergyModifiers(user, exerciseGain)) {
    target = Math.max(target, dailySpentImpliedByEnergy(user, exerciseGain));
  }
  return target;
}

/** Apply in-week instant bonus/loss toggles on top of daily replay baseline. */
export function applyInstantModifiersToWeek(
  user: User,
  base: { energy: number; spent: number; gained: number },
  exerciseGain = 0
): { energy: number; spent: number; gained: number } {
  let { spent, gained } = base;
  if (user.bonusNoPhoneUsed) gained += BONUS_INSTANT;
  if (user.bonusHeartUsed) gained += BONUS_INSTANT;
  if (user.bonusRecycleActive) gained += BONUS_LARGE;
  spent += lossSpentFromFlags(user);
  if (exerciseGain > 0) gained += exerciseGain;
  const energy = expectedEnergyAfterModifiers(user, base.energy, exerciseGain);
  return { energy, spent, gained };
}

/** Expected energy/spent/gained after Mon..yesterday daily ticks + toggles + completed exercises. */
export function computeExpectedWeekState(
  user: User,
  exerciseGain = 0,
  asOf = new Date()
): { energy: number; spent: number; gained: number } {
  return applyInstantModifiersToWeek(user, replayDailyTicksToYesterday(user, asOf), exerciseGain);
}

/**
 * Apply −10% for each calendar day after the last processed date through yesterday.
 * Used before week rollover so Sunday→Monday is not skipped.
 */
export function applyCalendarTicksThroughYesterday(user: User, asOf = new Date()): Partial<User> {
  const yesterdayKey = addDaysKey(localDateKey(asOf), -1);
  const lastKey = user.energyLastProcessedDate ? localDateKey(user.energyLastProcessedDate) : null;

  if (lastKey && lastKey >= yesterdayKey) {
    return {};
  }

  let cursor: string;
  if (lastKey) {
    cursor = addDaysKey(lastKey, 1);
  } else if (user.energyWeekKey) {
    cursor = user.energyWeekKey;
  } else {
    cursor = yesterdayKey;
  }

  if (cursor > yesterdayKey) {
    return {};
  }

  let { energy, energySpentWeek: spent, energyGainedWeek: gained } = user;

  while (cursor <= yesterdayKey) {
    const tick = applyOneDayTick(user.dailyEnergyLoss, energy, spent, gained);
    energy = tick.energy;
    spent = tick.spent;
    gained = tick.gained;
    cursor = addDaysKey(cursor, 1);
  }

  return {
    energy,
    energySpentWeek: spent,
    energyGainedWeek: gained,
    energyLastProcessedDate: parseDateKey(yesterdayKey),
  };
}

/** Apply midnight transitions for completed days (not including today). */
export function applyDailyTicks(
  user: User,
  exerciseGain = 0,
  asOf = new Date()
): { patch: Partial<User>; changed: boolean } {
  const todayKey = localDateKey(asOf);
  const weekKey = getMondayWeekKey(asOf);
  const yesterdayKey = addDaysKey(todayKey, -1);
  let u: User = { ...user };
  let changed = false;
  let rolloverPatch: Partial<User> = {};

  const finish = (patch: Partial<User>, patchChanged: boolean): { patch: Partial<User>; changed: boolean } => {
    const merged =
      Object.keys(rolloverPatch).length > 0 ? { ...rolloverPatch, ...patch } : patch;
    return {
      patch: merged,
      changed: patchChanged || Object.keys(rolloverPatch).length > 0,
    };
  };

  if (u.energyWeekKey !== weekKey) {
    const pending = applyCalendarTicksThroughYesterday(u, asOf);
    if (Object.keys(pending).length > 0) {
      Object.assign(u, pending);
      changed = true;
    }
    rolloverPatch = applyWeekRollover(u, weekKey);
    Object.assign(u, rolloverPatch);
    changed = true;
  }

  const mondayKey = u.energyWeekKey ?? weekKey;
  const lastKey = u.energyLastProcessedDate ? localDateKey(u.energyLastProcessedDate) : null;

  let cursor: string;
  let energy: number;
  let spent: number;
  let gained: number;
  let replayFromWeekStart = false;

  const hasReplayDays = mondayKey <= yesterdayKey;

  if (!lastKey || lastKey > todayKey) {
    cursor = mondayKey;
    energy = u.energyAtWeekStart;
    spent = 0;
    gained = 0;
    replayFromWeekStart = true;
    changed = true;
  } else if (lastKey >= yesterdayKey) {
    const expected = computeExpectedWeekState(u, exerciseGain, asOf);
    const buttonGained = expected.gained - exerciseGain;
    const keepUserEnergy = hasActiveEnergyModifiers(u, exerciseGain);
    let targetEnergy = u.energy;
    const storedExtraGain = Math.max(0, u.energyGainedWeek - buttonGained);
    if (!keepUserEnergy && hasReplayDays && u.energy > expected.energy + storedExtraGain) {
      targetEnergy = expected.energy + storedExtraGain;
    } else if (!keepUserEnergy && hasReplayDays && u.energy > expected.energy && storedExtraGain === 0) {
      targetEnergy = expected.energy;
    }
    let targetSpent = reconcileSpentWeekTarget(u, exerciseGain, asOf);
    let targetAtWeekStart = u.energyAtWeekStart;
    if (!keepUserEnergy && hasReplayDays) {
      const pool = u.energy + u.energySpentWeek - u.energyGainedWeek;
      const mondayKeyForReplay = u.energyWeekKey ?? getMondayWeekKey(asOf);
      const repairedStart = u.energyAtWeekStart + u.dailyEnergyLoss;
      const lossSpent = lossSpentFromFlags(u);
      const recordedTicks = Math.round((u.energySpentWeek - lossSpent) / u.dailyEnergyLoss);
      const impliedTicks = Math.round((repairedStart - u.energy - lossSpent) / u.dailyEnergyLoss);
      const raisedReplay = replayDailyTicksFromStart(u.dailyEnergyLoss, repairedStart, mondayKeyForReplay, asOf);

      if (
        pool === u.energyAtWeekStart &&
        u.energyAtWeekStart <= u.energy + u.dailyEnergyLoss &&
        u.energySpentWeek - lossSpent <= u.dailyEnergyLoss &&
        u.energy < raisedReplay.energy &&
        recordedTicks < impliedTicks
      ) {
        targetSpent = Math.max(
          targetSpent,
          u.energySpentWeek + (impliedTicks - recordedTicks) * u.dailyEnergyLoss
        );
        targetAtWeekStart = Math.max(targetAtWeekStart, repairedStart);
      } else if (
        u.energy < expected.energy &&
        u.energyAtWeekStart <= u.energy + u.dailyEnergyLoss &&
        u.energyGainedWeek <= buttonGained
      ) {
        const extraDaily = expected.energy - u.energy;
        targetSpent = Math.max(targetSpent, u.energySpentWeek + extraDaily);
        targetAtWeekStart = Math.max(targetAtWeekStart, u.energy + targetSpent - u.energyGainedWeek);
      }
    }
    if (!keepUserEnergy) {
      targetAtWeekStart = Math.max(
        targetAtWeekStart,
        u.energy + targetSpent - u.energyGainedWeek
      );
    }
    let targetGained = hasReplayDays ? Math.max(u.energyGainedWeek, buttonGained) : u.energyGainedWeek;
    if (
      targetEnergy !== u.energy ||
      targetAtWeekStart !== u.energyAtWeekStart ||
      targetSpent !== u.energySpentWeek ||
      targetGained !== u.energyGainedWeek
    ) {
      return finish(
        {
          energy: targetEnergy,
          energyAtWeekStart: targetAtWeekStart,
          energySpentWeek: targetSpent,
          energyGainedWeek: targetGained,
          energyLastProcessedDate: parseDateKey(yesterdayKey),
          lossPillInstantApplied: false,
          lossPillSpentRecorded: 0,
        },
        true
      );
    }
    return finish({}, changed);
  } else {
    cursor = addDaysKey(lastKey, 1);
    energy = u.energy;
    spent = u.energySpentWeek;
    gained = u.energyGainedWeek;
  }

  while (cursor <= yesterdayKey) {
    const tick = applyOneDayTick(u.dailyEnergyLoss, energy, spent, gained);
    energy = tick.energy;
    spent = tick.spent;
    gained = tick.gained;
    cursor = addDaysKey(cursor, 1);
    changed = true;
  }

  if (replayFromWeekStart) {
    const adjusted = applyInstantModifiersToWeek(u, { energy, spent, gained }, exerciseGain);
    energy = adjusted.energy;
    spent = adjusted.spent;
    gained = Math.max(0, adjusted.gained - exerciseGain);
  }

  if (!changed) {
    return finish({}, false);
  }

  return finish(
    {
      energy,
      energySpentWeek: spent,
      energyGainedWeek: gained,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
      energyWeekKey: u.energyWeekKey,
      energyAtWeekStart: u.energyAtWeekStart,
      lossPillInstantApplied: false,
      lossPillSpentRecorded: 0,
    },
    true
  );
}

export function toEnergyPayload(user: User): EnergyStatePayload {
  return {
    energy: clampEnergy(user.energy),
    weekKey: user.energyWeekKey ?? getMondayWeekKey(),
    energyAtWeekStart: user.energyAtWeekStart,
    spentWeek: user.energySpentWeek,
    gainedWeek: user.energyGainedWeek,
    flags: {
      bonusNoPhoneUsed: user.bonusNoPhoneUsed,
      bonusHeartUsed: user.bonusHeartUsed,
      bonusRecycleActive: user.bonusRecycleActive,
      lossNoPhoneUsed: user.lossNoPhoneUsed,
      lossHeartUsed: user.lossHeartUsed,
      lossPillActive: user.lossPillActive,
    },
  };
}
