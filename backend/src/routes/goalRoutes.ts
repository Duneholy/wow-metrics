import { Router } from "express";
import { z } from "zod";
import { getUserId } from "../middlewares/auth.js";
import { syncUserEnergy, reconcileGoalEnergyCredits } from "../services/energyService.js";
import { clampEnergy, toEnergyPayload } from "../energyLogic.js";
import { goalEnergyFromTasks, goalPriorityFromClient, mapGoalForClient } from "../goalLogic.js";
import { goalSchema, goalUpdateSchema, goalTasksReorderSchema } from "../schemas/index.js";

import { prisma } from "../prisma.js";
export const goalRoutes = Router();

export async function nextGoalSortOrder(goalId: string): Promise<number> {
  const max = await prisma.task.aggregate({
    where: { goalId },
    _max: { goalSortOrder: true },
  });
  return (max._max.goalSortOrder ?? -1) + 1;
}

goalRoutes.post("/goals", async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const { deadline, priority, ...rest } = parsed.data;
  const goal = await prisma.goal.create({
    data: {
      userId,
      ...rest,
      deadline: deadline ? new Date(deadline) : null,
      ...(priority !== undefined ? { priority: goalPriorityFromClient(priority) } : {}),
    },
    include: {
      tasks: {
        include: { subtasks: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  res.status(201).json(mapGoalForClient(goal as any));
});

goalRoutes.patch("/goals/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = goalUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.definitionDone !== undefined && { definitionDone: parsed.data.definitionDone }),
      ...(parsed.data.resources !== undefined && { resources: parsed.data.resources }),
      ...(parsed.data.deadline !== undefined && {
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      }),
      ...(parsed.data.category !== undefined && { category: parsed.data.category }),
      ...(parsed.data.priority !== undefined && { priority: goalPriorityFromClient(parsed.data.priority) }),
      ...(parsed.data.iconName !== undefined && { iconName: parsed.data.iconName }),
    },
    include: {
      tasks: {
        include: { subtasks: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (parsed.data.category !== undefined && parsed.data.category !== existing.category) {
    await prisma.task.updateMany({
      where: { goalId: id },
      data: { category: updated.category },
    });
  }
  res.json(mapGoalForClient(updated as any));
});

goalRoutes.post("/goals/:id/tasks/reorder", async (req, res) => {
  const { id } = req.params;
  const parsed = goalTasksReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  const existing = await prisma.task.findMany({ where: { goalId: id, userId }, select: { id: true } });
  const existingIds = new Set(existing.map((t) => t.id));
  if (
    parsed.data.taskIds.length !== existing.length ||
    parsed.data.taskIds.some((taskId) => !existingIds.has(taskId))
  ) {
    res.status(400).json({ error: "Invalid task list" });
    return;
  }
  await prisma.$transaction(
    parsed.data.taskIds.map((taskId, index) =>
      prisma.task.update({ where: { id: taskId }, data: { goalSortOrder: index } })
    )
  );
  res.json({ ok: true });
});

goalRoutes.post("/goals/:id/complete", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const goal = await prisma.goal.findFirst({
    where: { id, userId },
    include: {
      tasks: { orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  if (goal.isCompleted) {
    res.status(400).json({ error: "Goal already completed" });
    return;
  }
  const incomplete = goal.tasks.filter((t) => !t.isCompleted);
  if (incomplete.length > 0) {
    res.status(400).json({ error: "Complete all tasks first" });
    return;
  }
  const gain = goalEnergyFromTasks(goal.tasks as any);
  const user = await syncUserEnergy(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [updatedGoal, updatedUser] = await prisma.$transaction([
    prisma.goal.update({
      where: { id },
      data: { isCompleted: true, completedAt: new Date(), completionEnergyGain: gain },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        energy: clampEnergy(user.energy + gain),
        energyGainedWeek: user.energyGainedWeek + gain,
      },
    }),
  ]);
  let userAfter = updatedUser;
  const goalRepair = await reconcileGoalEnergyCredits(updatedUser, 0);
  if (goalRepair) {
    userAfter = await prisma.user.update({ where: { id: userId }, data: goalRepair });
  }
  const withTasks = await prisma.goal.findUnique({
    where: { id: updatedGoal.id },
    include: {
      tasks: {
        include: { subtasks: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  res.json({
    goal: mapGoalForClient(withTasks! as any),
    energy: toEnergyPayload(userAfter),
  });
});

goalRoutes.post("/goals/:id/uncomplete", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const goal = await prisma.goal.findFirst({
    where: { id, userId },
    include: {
      tasks: { orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  if (!goal.isCompleted) {
    res.status(400).json({ error: "Goal is not completed" });
    return;
  }
  const gain = goal.completionEnergyGain ?? goalEnergyFromTasks(goal.tasks as any);
  const user = await syncUserEnergy(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [updatedGoal, updatedUser] = await prisma.$transaction([
    prisma.goal.update({
      where: { id },
      data: { isCompleted: false, completedAt: null, completionEnergyGain: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        energy: clampEnergy(user.energy - gain),
        energyGainedWeek: Math.max(0, user.energyGainedWeek - gain),
      },
    }),
  ]);
  const withTasks = await prisma.goal.findUnique({
    where: { id: updatedGoal.id },
    include: {
      tasks: {
        include: { subtasks: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ goalSortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  res.json({
    goal: mapGoalForClient(withTasks! as any),
    energy: toEnergyPayload(updatedUser),
  });
});

goalRoutes.delete("/goals/:id", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const existing = await prisma.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { goalId: id, userId },
      data: { goalId: null, goalSortOrder: 0 },
    }),
    prisma.goal.delete({ where: { id } }),
  ]);
  res.status(204).send();
});
