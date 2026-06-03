import { prisma } from "../prisma.js";
import { getMondayWeekKey, parseDateKey, repairGoalInflatedWeekAnchors, applyDailyTicks, repairWeekCounters, reconcileWeekDisplayAnchors, tierToEnergy } from "../energyLogic.js";
import { goalEnergyFromTasks } from "../goalLogic.js";

export async function weekExerciseEnergyGain(userId: string, weekKey: string): Promise<number> {
  const slots = await prisma.energyWeekSlot.findMany({
    where: { userId, weekKey, completed: true },
    include: { exerciseType: true },
  });
  return slots.reduce((sum, s) => sum + tierToEnergy(s.exerciseType.energyTier), 0);
}

export async function reconcileGoalEnergyCredits(
  user: {
    id: string;
    energyWeekKey: string | null;
    energyAtWeekStart: number;
    energySpentWeek: number;
    energyGainedWeek: number;
    energy: number;
  },
  exerciseGain = 0
) {
  const weekKey = user.energyWeekKey ?? getMondayWeekKey();
  const weekStart = parseDateKey(weekKey);
  const goals = await prisma.goal.findMany({
    where: {
      userId: user.id,
      isCompleted: true,
      completedAt: { gte: weekStart },
    },
    include: { tasks: { select: { difficulty: true } } },
  });
  let expectedFromGoals = 0;
  for (const goal of goals) {
    expectedFromGoals += goal.completionEnergyGain ?? goalEnergyFromTasks(goal.tasks as any);
  }

  const patch: Record<string, number> = {};
  if (expectedFromGoals > user.energyGainedWeek) {
    const delta = expectedFromGoals - user.energyGainedWeek;
    patch.energyGainedWeek = expectedFromGoals;
    patch.energyAtWeekStart = user.energyAtWeekStart - delta;
  }

  const userAfterGainFix = { ...user, ...patch };
  const anchorRepair = repairGoalInflatedWeekAnchors(
    userAfterGainFix as Parameters<typeof repairGoalInflatedWeekAnchors>[0],
    expectedFromGoals,
    exerciseGain
  );
  if (anchorRepair) {
    Object.assign(patch, anchorRepair);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export async function syncUserEnergy(userId: string) {
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const patches: Record<string, unknown> = {};
  const weekKey = getMondayWeekKey();
  const exerciseGain = await weekExerciseEnergyGain(userId, weekKey);
  const { patch: dailyPatch, changed } = applyDailyTicks(user, exerciseGain);
  if (changed) Object.assign(patches, dailyPatch);
  if (Object.keys(patches).length > 0) {
    user = await prisma.user.update({ where: { id: userId }, data: patches });
  }
  const repair = user ? repairWeekCounters(user) : null;
  if (repair) {
    user = await prisma.user.update({ where: { id: userId }, data: repair });
  }
  const anchorRepair = user ? reconcileWeekDisplayAnchors(user, exerciseGain) : null;
  if (anchorRepair) {
    user = await prisma.user.update({ where: { id: userId }, data: anchorRepair });
  }
  const goalRepair = user ? await reconcileGoalEnergyCredits(user, exerciseGain) : null;
  if (goalRepair) {
    user = await prisma.user.update({ where: { id: userId }, data: goalRepair });
  }
  return user;
}
