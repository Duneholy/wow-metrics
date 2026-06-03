import {
  BONUS_INSTANT,
  BONUS_LARGE,
  LOSS_LARGE,
  clampEnergy,
  type EnergyFlags,
} from "./energyLogic.js";

/** Mutable user slice used for energy toggle simulation and API handlers. */
export type EnergyUserSlice = {
  energy: number;
  energyAtWeekStart: number;
  energySpentWeek: number;
  energyGainedWeek: number;
  bonusNoPhoneUsed: boolean;
  bonusNoPhoneEnergyApplied: number;
  bonusHeartUsed: boolean;
  bonusHeartEnergyApplied: number;
  bonusRecycleActive: boolean;
  bonusRecycleEnergyApplied: number;
  lossNoPhoneUsed: boolean;
  lossNoPhoneEnergyApplied: number;
  lossHeartUsed: boolean;
  lossHeartEnergyApplied: number;
  lossPillActive: boolean;
  lossPillEnergyApplied: number;
};

export function energyFlags(u: EnergyUserSlice): EnergyFlags {
  return {
    bonusNoPhoneUsed: u.bonusNoPhoneUsed,
    bonusHeartUsed: u.bonusHeartUsed,
    bonusRecycleActive: u.bonusRecycleActive,
    lossNoPhoneUsed: u.lossNoPhoneUsed,
    lossHeartUsed: u.lossHeartUsed,
    lossPillActive: u.lossPillActive,
  };
}

export function freshEnergyUser(overrides: Partial<EnergyUserSlice> = {}): EnergyUserSlice {
  return {
    energy: 100,
    energyAtWeekStart: 100,
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
    ...overrides,
  };
}

type GainUsedFlag = "bonusNoPhoneUsed" | "bonusHeartUsed" | "bonusRecycleActive";
type GainAppliedField = "bonusNoPhoneEnergyApplied" | "bonusHeartEnergyApplied" | "bonusRecycleEnergyApplied";
type LossUsedFlag = "lossNoPhoneUsed" | "lossHeartUsed" | "lossPillActive";
type LossAppliedField = "lossNoPhoneEnergyApplied" | "lossHeartEnergyApplied" | "lossPillEnergyApplied";

function applyInstantGain(
  u: EnergyUserSlice,
  amount: number,
  usedFlag: GainUsedFlag,
  appliedField: GainAppliedField
): EnergyUserSlice {
  const energyApplied = clampEnergy(u.energy + amount) - u.energy;
  return {
    ...u,
    [usedFlag]: true,
    [appliedField]: energyApplied,
    energy: clampEnergy(u.energy + energyApplied),
    energyGainedWeek: u.energyGainedWeek + amount,
  } as EnergyUserSlice;
}

function revertInstantGain(
  u: EnergyUserSlice,
  amount: number,
  usedFlag: GainUsedFlag,
  appliedField: GainAppliedField
): EnergyUserSlice {
  const applied = u[appliedField];
  if (applied === 0) {
    // At 100% energy nothing is applied to the pool; still undo nominal gainedWeek.
    return {
      ...u,
      [usedFlag]: false,
      [appliedField]: 0,
      energyGainedWeek: Math.max(0, u.energyGainedWeek - amount),
    } as EnergyUserSlice;
  }
  return {
    ...u,
    [usedFlag]: false,
    [appliedField]: 0,
    energy: clampEnergy(u.energy - applied),
    energyGainedWeek: Math.max(0, u.energyGainedWeek - amount),
  } as EnergyUserSlice;
}

function applyInstantLoss(
  u: EnergyUserSlice,
  amount: number,
  usedFlag: LossUsedFlag,
  appliedField: LossAppliedField
): EnergyUserSlice {
  const energyApplied = u.energy - clampEnergy(u.energy - amount);
  return {
    ...u,
    [usedFlag]: true,
    [appliedField]: energyApplied,
    energy: clampEnergy(u.energy - energyApplied),
    energySpentWeek: u.energySpentWeek + amount,
  } as EnergyUserSlice;
}

function revertInstantLoss(
  u: EnergyUserSlice,
  amount: number,
  usedFlag: LossUsedFlag,
  appliedField: LossAppliedField
): EnergyUserSlice {
  const applied = u[appliedField];
  if (applied === 0) {
    return { ...u, [usedFlag]: false, [appliedField]: 0 } as EnergyUserSlice;
  }
  return {
    ...u,
    [usedFlag]: false,
    [appliedField]: 0,
    energy: clampEnergy(u.energy + applied),
    energySpentWeek: Math.max(0, u.energySpentWeek - amount),
  } as EnergyUserSlice;
}

export function toggleBonusNoPhone(u: EnergyUserSlice): EnergyUserSlice {
  return u.bonusNoPhoneUsed
    ? revertInstantGain(u, BONUS_INSTANT, "bonusNoPhoneUsed", "bonusNoPhoneEnergyApplied")
    : applyInstantGain(u, BONUS_INSTANT, "bonusNoPhoneUsed", "bonusNoPhoneEnergyApplied");
}

export function toggleBonusHeart(u: EnergyUserSlice): EnergyUserSlice {
  return u.bonusHeartUsed
    ? revertInstantGain(u, BONUS_INSTANT, "bonusHeartUsed", "bonusHeartEnergyApplied")
    : applyInstantGain(u, BONUS_INSTANT, "bonusHeartUsed", "bonusHeartEnergyApplied");
}

export function toggleBonusRecycle(u: EnergyUserSlice): EnergyUserSlice {
  return u.bonusRecycleActive
    ? revertInstantGain(u, BONUS_LARGE, "bonusRecycleActive", "bonusRecycleEnergyApplied")
    : applyInstantGain(u, BONUS_LARGE, "bonusRecycleActive", "bonusRecycleEnergyApplied");
}

export function toggleLossNoPhone(u: EnergyUserSlice): EnergyUserSlice {
  return u.lossNoPhoneUsed
    ? revertInstantLoss(u, BONUS_INSTANT, "lossNoPhoneUsed", "lossNoPhoneEnergyApplied")
    : applyInstantLoss(u, BONUS_INSTANT, "lossNoPhoneUsed", "lossNoPhoneEnergyApplied");
}

export function toggleLossHeart(u: EnergyUserSlice): EnergyUserSlice {
  return u.lossHeartUsed
    ? revertInstantLoss(u, BONUS_INSTANT, "lossHeartUsed", "lossHeartEnergyApplied")
    : applyInstantLoss(u, BONUS_INSTANT, "lossHeartUsed", "lossHeartEnergyApplied");
}

export function toggleLossPill(u: EnergyUserSlice): EnergyUserSlice {
  return u.lossPillActive
    ? revertInstantLoss(u, LOSS_LARGE, "lossPillActive", "lossPillEnergyApplied")
    : applyInstantLoss(u, LOSS_LARGE, "lossPillActive", "lossPillEnergyApplied");
}

export type ToggleKey = "bonusNoPhone" | "bonusHeart" | "bonusRecycle" | "lossNoPhone" | "lossHeart" | "lossPill";

/** Prisma-safe payload for user.update after a toggle. */
export function energySliceToDbData(slice: EnergyUserSlice) {
  return {
    energy: slice.energy,
    energySpentWeek: slice.energySpentWeek,
    energyGainedWeek: slice.energyGainedWeek,
    bonusNoPhoneUsed: slice.bonusNoPhoneUsed,
    bonusNoPhoneEnergyApplied: slice.bonusNoPhoneEnergyApplied,
    bonusHeartUsed: slice.bonusHeartUsed,
    bonusHeartEnergyApplied: slice.bonusHeartEnergyApplied,
    bonusRecycleActive: slice.bonusRecycleActive,
    bonusRecycleEnergyApplied: slice.bonusRecycleEnergyApplied,
    lossNoPhoneUsed: slice.lossNoPhoneUsed,
    lossNoPhoneEnergyApplied: slice.lossNoPhoneEnergyApplied,
    lossHeartUsed: slice.lossHeartUsed,
    lossHeartEnergyApplied: slice.lossHeartEnergyApplied,
    lossPillActive: slice.lossPillActive,
    lossPillEnergyApplied: slice.lossPillEnergyApplied,
    lossPillInstantApplied: false,
    lossPillSpentRecorded: 0,
  };
}

/** Toggle exercise completion — affects energy only, not energyGainedWeek. */
export function applySlotCompletion(
  u: EnergyUserSlice,
  energyValue: number,
  completing: boolean
): EnergyUserSlice {
  const delta = completing ? energyValue : -energyValue;
  return { ...u, energy: clampEnergy(u.energy + delta) };
}

export function displayGainedWeek(u: EnergyUserSlice, completedExerciseGain: number): number {
  return Math.max(0, u.energyGainedWeek + completedExerciseGain);
}

export function applyEnergyToggle(u: EnergyUserSlice, key: ToggleKey): EnergyUserSlice {
  switch (key) {
    case "bonusNoPhone":
      return toggleBonusNoPhone(u);
    case "bonusHeart":
      return toggleBonusHeart(u);
    case "bonusRecycle":
      return toggleBonusRecycle(u);
    case "lossNoPhone":
      return toggleLossNoPhone(u);
    case "lossHeart":
      return toggleLossHeart(u);
    case "lossPill":
      return toggleLossPill(u);
    default:
      return u;
  }
}
