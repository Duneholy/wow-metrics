import { Router } from "express";
import { TaskDifficulty } from "../types.js";
import { getUserId } from "../middlewares/auth.js";
import { levelXp, stripUserPassword } from "../userLogic.js";
import { nextGoalSortOrder } from "./goalRoutes.js";
import {
  taskSchema,
  taskUpdateSchema,
  subtaskCreateSchema,
  focusToggleSchema,
  focusReorderSchema,
} from "../schemas/index.js";

import { prisma } from "../prisma.js";
export const taskRoutes = Router();

const difficultyXp: Record<TaskDifficulty, number> = {
  EASY: 100,
  MEDIUM: 200,
  HARD: 400,
  EPIC: 1200,
};

function progressFromSubtasks(subtasks: { isCompleted: boolean }[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.isCompleted).length;
  return Math.floor((done / subtasks.length) * 100);
}

taskRoutes.post("/tasks", async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  if (parsed.data.goalId) {
    const goal = await prisma.goal.findUnique({ where: { id: parsed.data.goalId, userId } });
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
  }
  const goalId = parsed.data.goalId ?? null;
  const goalSortOrder = goalId ? await nextGoalSortOrder(goalId) : 0;
  const task = await prisma.task.create({
    data: {
      userId,
      category: parsed.data.category,
      goalId,
      goalSortOrder,
      title: parsed.data.title,
      difficulty: parsed.data.difficulty,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      comment: parsed.data.comment ?? null,
      definitionDone: parsed.data.definitionDone ?? null,
      xpReward: difficultyXp[parsed.data.difficulty],
    },
  });
  res.status(201).json(task);
});

taskRoutes.patch("/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const parsed = taskUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const existing = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const goalIdInBody = parsed.data.goalId;
  const goalIdChanging = goalIdInBody !== undefined && goalIdInBody !== existing.goalId;
  let categoryFromGoal: (typeof existing)["category"] | undefined;
  if (goalIdChanging && goalIdInBody !== null) {
    const goal = await prisma.goal.findFirst({ where: { id: goalIdInBody, userId } });
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    categoryFromGoal = goal.category;
  }
  const resolvedCategory =
    parsed.data.category !== undefined
      ? parsed.data.category
      : categoryFromGoal !== undefined
        ? categoryFromGoal
        : undefined;
  let goalSortOrderPatch: { goalSortOrder: number } | undefined;
  if (goalIdChanging) {
    goalSortOrderPatch = {
      goalSortOrder: goalIdInBody ? await nextGoalSortOrder(goalIdInBody) : 0,
    };
  }
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.difficulty !== undefined && { difficulty: parsed.data.difficulty, xpReward: difficultyXp[parsed.data.difficulty] }),
      ...(parsed.data.deadline !== undefined && { deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null }),
      ...(parsed.data.definitionDone !== undefined && { definitionDone: parsed.data.definitionDone }),
      ...(parsed.data.comment !== undefined && { comment: parsed.data.comment || null }),
      ...(parsed.data.goalId !== undefined && { goalId: parsed.data.goalId }),
      ...(goalSortOrderPatch ?? {}),
      ...(resolvedCategory !== undefined && { category: resolvedCategory }),
    },
  });
  res.json(updated);
});

taskRoutes.delete("/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const userId = getUserId(req);
  const existing = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  await prisma.task.delete({ where: { id: taskId } });
  res.status(204).send();
});

taskRoutes.post("/tasks/:taskId/subtasks", async (req, res) => {
  const { taskId } = req.params;
  const parsed = subtaskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: { subtasks: { orderBy: { createdAt: "asc" } } },
  });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const subtask = await prisma.subtask.create({
    data: {
      taskId,
      title: parsed.data.title,
    },
  });
  const total = task.subtasks.length + 1;
  const completed = task.subtasks.filter(s => s.isCompleted).length;
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: Math.floor((completed / total) * 100) },
  });
  res.status(201).json(subtask);
});

taskRoutes.delete("/subtasks/:id", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const existing = await prisma.subtask.findFirst({
    where: { id, task: { userId } },
    include: { task: { include: { subtasks: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Subtask not found" });
    return;
  }
  await prisma.subtask.delete({ where: { id } });
  const remaining = existing.task.subtasks.filter(s => s.id !== id);
  const total = remaining.length;
  const completed = remaining.filter(s => s.isCompleted).length;
  await prisma.task.update({
    where: { id: existing.task.id },
    data: { progress: total === 0 ? 0 : Math.floor((completed / total) * 100) },
  });
  res.status(204).send();
});

taskRoutes.patch("/subtasks/:id/complete", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const existing = await prisma.subtask.findFirst({
    where: { id, task: { userId } },
    include: { task: { include: { subtasks: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Subtask not found" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  
  if (existing.task.isCompleted && existing.isCompleted) {
    res.status(400).json({ error: "Mark the task as not done before changing subtasks" });
    return;
  }

  const isCompleting = !existing.isCompleted;
  const total = existing.task.subtasks.length;
  const completedNow = existing.task.subtasks.filter(s => s.isCompleted).length + (isCompleting ? 1 : -1);
  const newProgress = total === 0 ? 0 : Math.floor((completedNow / total) * 100);
  const xpReward = Math.floor(existing.task.xpReward / total);
  
  let nextXp = user.xp + (isCompleting ? xpReward : -xpReward);
  let nextLevel = user.level;
  
  while (nextXp < 0 && nextLevel > 1) {
    nextLevel -= 1;
    nextXp += levelXp(nextLevel);
  }
  if (nextXp < 0) nextXp = 0;

  while (nextXp >= levelXp(nextLevel)) {
    nextXp -= levelXp(nextLevel);
    nextLevel += 1;
  }
  
  const [updatedSubtask, , updatedUser] = await prisma.$transaction([
    prisma.subtask.update({ where: { id }, data: { isCompleted: isCompleting } }),
    prisma.task.update({ where: { id: existing.task.id }, data: { progress: newProgress } }),
    prisma.user.update({ where: { id: userId }, data: { xp: nextXp, level: nextLevel } })
  ]);
  
  res.json({ subtask: updatedSubtask, user: stripUserPassword(updatedUser), taskProgress: newProgress });
});

taskRoutes.patch("/tasks/:taskId/toggle-focus", async (req, res) => {
  const { taskId } = req.params;
  const parsedBody = focusToggleSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const requestedSlot = parsedBody.data.slot;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const userId = getUserId(req);
  if (task.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!task.inFocus && task.isCompleted) {
    res.status(400).json({ error: "Выполненные задачи нельзя добавить в Weekly Focus" });
    return;
  }

  if (!task.inFocus) {
    const inFocusCount = await prisma.task.count({
      where: { inFocus: true, userId },
    });
    if (inFocusCount >= 7) {
      res.status(400).json({ error: "Focus limit is 7 tasks" });
      return;
    }

    let chosenSlot: number;
    if (requestedSlot !== undefined) {
      chosenSlot = requestedSlot;
      await prisma.task.updateMany({
        where: { userId, inFocus: true, focusSlot: chosenSlot, id: { not: taskId } },
        data: { inFocus: false, focusSlot: null },
      });
    } else {
      const usedSlots = await prisma.task.findMany({
        where: { userId, inFocus: true, focusSlot: { not: null } },
        select: { focusSlot: true },
      });
      const taken = new Set(
        usedSlots.map((u) => u.focusSlot).filter((s): s is number => typeof s === "number" && s >= 0 && s <= 6)
      );
      const free = [0, 1, 2, 3, 4, 5, 6].find((i) => !taken.has(i));
      chosenSlot = free ?? 0;
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { inFocus: true, focusSlot: chosenSlot },
    });
    res.json(updated);
    return;
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { inFocus: false, focusSlot: null },
  });
  res.json(updated);
});

taskRoutes.patch("/tasks/:taskId/reorder-focus", async (req, res) => {
  const { taskId } = req.params;
  const parsed = focusReorderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const { targetSlot } = parsed.data;
  const userId = getUserId(req);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (task.userId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!task.inFocus) {
    res.status(400).json({ error: "Task is not in Weekly Focus" });
    return;
  }

  const fromSlot = task.focusSlot;
  if (fromSlot === null || fromSlot < 0 || fromSlot > 6) {
    res.status(400).json({ error: "Task has no focus slot" });
    return;
  }
  if (fromSlot === targetSlot) {
    res.json(task);
    return;
  }

  const other = await prisma.task.findFirst({
    where: { userId, inFocus: true, focusSlot: targetSlot, id: { not: taskId } },
  });

  if (!other) {
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { focusSlot: targetSlot },
    });
    res.json(updated);
    return;
  }

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { focusSlot: targetSlot } }),
    prisma.task.update({ where: { id: other.id }, data: { focusSlot: fromSlot } }),
  ]);
  const [a, b] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.task.findUnique({ where: { id: other.id } }),
  ]);
  res.json({ moved: a, swappedWith: b });
});

taskRoutes.patch("/tasks/:taskId/complete", async (req, res) => {
  const { taskId } = req.params;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subtasks: { orderBy: { createdAt: "asc" } } },
  });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (task.subtasks.length > 0 && task.subtasks.some((subtask) => !subtask.isCompleted)) {
    res.status(400).json({ error: "Complete all subtasks first" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: task.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  
  const isCompleting = !task.isCompleted;
  let xpToAdd = 0;
  if (task.subtasks.length === 0) {
    xpToAdd = isCompleting ? task.xpReward : -task.xpReward;
  }
  
  let nextXp = user.xp + xpToAdd;
  let nextLevel = user.level;

  while (nextXp < 0 && nextLevel > 1) {
    nextLevel -= 1;
    nextXp += levelXp(nextLevel);
  }
  if (nextXp < 0) nextXp = 0;
  
  while (nextXp >= levelXp(nextLevel)) {
    nextXp -= levelXp(nextLevel);
    nextLevel += 1;
  }

  const progressOnUncomplete =
    task.subtasks.length > 0 ? progressFromSubtasks(task.subtasks) : 0;

  const [updatedTask, updatedUser] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: {
        isCompleted: isCompleting,
        progress: isCompleting ? 100 : progressOnUncomplete,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { xp: nextXp, level: nextLevel },
    }),
  ]);
  res.json({ task: updatedTask, user: stripUserPassword(updatedUser) });
});
