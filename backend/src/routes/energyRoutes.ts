import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getUserId } from "../middlewares/auth.js";
import { exerciseTypeSchema } from "../schemas/index.js";
import {
  applyDailyTicks,
  clampEnergy,
  getMondayWeekKey,
  tierToEnergy,
  toEnergyPayload,
} from "../energyLogic.js";
import {
  applyEnergyToggle,
  energySliceToDbData,
  type EnergyUserSlice,
  type ToggleKey,
} from "../energyActions.js";

export const energyRoutes = Router();

import { syncUserEnergy } from "../services/energyService.js";

function userToEnergySlice(user: {
  energy: number;
  energyAtWeekStart: number;
  energySpentWeek: number;
  energyGainedWeek: number;
  bonusNoPhoneUsed: boolean;
  bonusNoPhoneEnergyApplied: number;
  bonusHeartUsed: boolean;
  bonusHeartEnergyApplied: number;
  bonusRecycleActive: boolean;
  bonusRecycleEnergyApplied?: number | null;
  lossNoPhoneUsed: boolean;
  lossNoPhoneEnergyApplied: number;
  lossHeartUsed: boolean;
  lossHeartEnergyApplied: number;
  lossPillActive: boolean;
  lossPillEnergyApplied?: number | null;
}): EnergyUserSlice {
  return {
    energy: user.energy,
    energyAtWeekStart: user.energyAtWeekStart,
    energySpentWeek: user.energySpentWeek,
    energyGainedWeek: user.energyGainedWeek,
    bonusNoPhoneUsed: user.bonusNoPhoneUsed,
    bonusNoPhoneEnergyApplied: user.bonusNoPhoneEnergyApplied ?? 0,
    bonusHeartUsed: user.bonusHeartUsed,
    bonusHeartEnergyApplied: user.bonusHeartEnergyApplied ?? 0,
    bonusRecycleActive: user.bonusRecycleActive,
    bonusRecycleEnergyApplied: user.bonusRecycleEnergyApplied ?? 0,
    lossNoPhoneUsed: user.lossNoPhoneUsed,
    lossNoPhoneEnergyApplied: user.lossNoPhoneEnergyApplied ?? 0,
    lossHeartUsed: user.lossHeartUsed,
    lossHeartEnergyApplied: user.lossHeartEnergyApplied ?? 0,
    lossPillActive: user.lossPillActive,
    lossPillEnergyApplied: user.lossPillEnergyApplied ?? 0,
  };
}

const BONUS_ROUTE_KEYS = { noPhone: "bonusNoPhone", heart: "bonusHeart", recycle: "bonusRecycle" } as const;
const LOSS_ROUTE_KEYS = { noPhone: "lossNoPhone", heart: "lossHeart", pill: "lossPill" } as const;

energyRoutes.get("/energy", async (req, res) => {
  const userId = getUserId(req);
  const user = await syncUserEnergy(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const weekKey = getMondayWeekKey();
  const [exerciseTypes, slots] = await Promise.all([
    prisma.exerciseType.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.energyWeekSlot.findMany({
      where: { userId, weekKey },
      orderBy: { sortOrder: "asc" },
      include: { exerciseType: true },
    }),
  ]);
  res.json({
    ...toEnergyPayload(user),
    exerciseTypes,
    slots: slots.map((s) => ({
      id: s.id,
      exerciseTypeId: s.exerciseTypeId,
      weekKey: s.weekKey,
      sortOrder: s.sortOrder,
      completed: s.completed,
      name: s.exerciseType.name,
      description: s.exerciseType.description,
      energyTier: s.exerciseType.energyTier,
      energyValue: tierToEnergy(s.exerciseType.energyTier),
    })),
  });
});

energyRoutes.post("/energy/bonus/:key", async (req, res) => {
  const key = req.params.key as keyof typeof BONUS_ROUTE_KEYS;
  if (key !== "noPhone" && key !== "heart" && key !== "recycle") {
    res.status(400).json({ error: "Invalid bonus key" });
    return;
  }
  const userId = getUserId(req);
  let user = await syncUserEnergy(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const toggleKey = BONUS_ROUTE_KEYS[key] as ToggleKey;
  const next = applyEnergyToggle(userToEnergySlice(user), toggleKey);
  try {
    user = await prisma.user.update({ where: { id: userId }, data: energySliceToDbData(next) });
  } catch (err) {
    console.error("energy/bonus update failed", err);
    res.status(500).json({ error: "Energy update failed" });
    return;
  }
  res.json(toEnergyPayload(user));
});

energyRoutes.post("/energy/loss/:key", async (req, res) => {
  const key = req.params.key as keyof typeof LOSS_ROUTE_KEYS;
  if (key !== "noPhone" && key !== "heart" && key !== "pill") {
    res.status(400).json({ error: "Invalid loss key" });
    return;
  }
  const userId = getUserId(req);
  let user = await syncUserEnergy(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const toggleKey = LOSS_ROUTE_KEYS[key] as ToggleKey;
  const next = applyEnergyToggle(userToEnergySlice(user), toggleKey);
  try {
    user = await prisma.user.update({ where: { id: userId }, data: energySliceToDbData(next) });
  } catch (err) {
    console.error("energy/loss update failed", err);
    res.status(500).json({ error: "Energy update failed" });
    return;
  }
  res.json(toEnergyPayload(user));
});

energyRoutes.get("/exercise-types", async (req, res) => {
  const userId = getUserId(req);
  const items = await prisma.exerciseType.findMany({ where: { userId }, orderBy: { name: "asc" } });
  res.json({ items });
});

energyRoutes.post("/exercise-types", async (req, res) => {
  const parsed = exerciseTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const created = await prisma.exerciseType.create({
    data: { userId, ...parsed.data, description: parsed.data.description ?? null },
  });
  res.status(201).json(created);
});

energyRoutes.patch("/exercise-types/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = exerciseTypeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const existing = await prisma.exerciseType.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  const updated = await prisma.exerciseType.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description ?? null }),
      ...(parsed.data.energyTier !== undefined && { energyTier: parsed.data.energyTier }),
    },
  });
  res.json(updated);
});

energyRoutes.delete("/exercise-types/:id", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const existing = await prisma.exerciseType.findFirst({ where: { id, userId } });
  if (!existing) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  await prisma.exerciseType.delete({ where: { id } });
  res.status(204).send();
});

const ENERGY_SLOT_COUNT = 6;

energyRoutes.post("/energy/slots", async (req, res) => {
  const parsed = z
    .object({
      exerciseTypeId: z.string().min(1),
      sortOrder: z.number().int().min(0).max(ENERGY_SLOT_COUNT - 1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const weekKey = getMondayWeekKey();
  const type = await prisma.exerciseType.findFirst({ where: { id: parsed.data.exerciseTypeId, userId } });
  if (!type) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  const existingSlots = await prisma.energyWeekSlot.findMany({
    where: { userId, weekKey },
    orderBy: { sortOrder: "asc" },
  });
  if (existingSlots.length >= ENERGY_SLOT_COUNT) {
    res.status(400).json({ error: "Maximum 6 exercise slots per week" });
    return;
  }
  const takenOrders = new Set(existingSlots.map((s) => s.sortOrder));
  let sortOrder = parsed.data.sortOrder;
  if (sortOrder !== undefined) {
    if (takenOrders.has(sortOrder)) {
      res.status(400).json({ error: "Slot position already taken" });
      return;
    }
  } else {
    sortOrder = [0, 1, 2, 3, 4, 5].find((i) => !takenOrders.has(i));
    if (sortOrder === undefined) {
      res.status(400).json({ error: "No free slot" });
      return;
    }
  }
  const slot = await prisma.energyWeekSlot.create({
    data: {
      userId,
      exerciseTypeId: type.id,
      weekKey,
      sortOrder,
    },
    include: { exerciseType: true },
  });
  res.status(201).json({
    id: slot.id,
    exerciseTypeId: slot.exerciseTypeId,
    weekKey: slot.weekKey,
    sortOrder: slot.sortOrder,
    completed: slot.completed,
    name: slot.exerciseType.name,
    description: slot.exerciseType.description,
    energyTier: slot.exerciseType.energyTier,
    energyValue: tierToEnergy(slot.exerciseType.energyTier),
  });
});

energyRoutes.patch("/energy/slots/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = z
    .object({
      completed: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const slot = await prisma.energyWeekSlot.findFirst({
    where: { id, userId },
    include: { exerciseType: true },
  });
  if (!slot) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }

  if (parsed.data.completed !== undefined && parsed.data.completed !== slot.completed) {
    const gain = tierToEnergy(slot.exerciseType.energyTier);
    const user = await syncUserEnergy(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const delta = parsed.data.completed ? gain : -gain;
    await prisma.user.update({
      where: { id: userId },
      data: {
        energy: clampEnergy(user.energy + delta),
      },
    });
  }

  const updated = await prisma.energyWeekSlot.update({
    where: { id },
    data: {
      ...(parsed.data.completed !== undefined && { completed: parsed.data.completed }),
      ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
    },
    include: { exerciseType: true },
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  res.json({
    slot: {
      id: updated.id,
      exerciseTypeId: updated.exerciseTypeId,
      weekKey: updated.weekKey,
      sortOrder: updated.sortOrder,
      completed: updated.completed,
      name: updated.exerciseType.name,
      description: updated.exerciseType.description,
      energyTier: updated.exerciseType.energyTier,
      energyValue: tierToEnergy(updated.exerciseType.energyTier),
    },
    energy: user ? toEnergyPayload(user) : undefined,
  });
});

energyRoutes.post("/energy/slots/reorder", async (req, res) => {
  const parsed = z.object({ orderedIds: z.array(z.string().min(1)) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const weekKey = getMondayWeekKey();
  const slots = await prisma.energyWeekSlot.findMany({ where: { userId, weekKey } });
  const idSet = new Set(slots.map((s) => s.id));
  if (parsed.data.orderedIds.length !== slots.length || parsed.data.orderedIds.some((id) => !idSet.has(id))) {
    res.status(400).json({ error: "Invalid slot order" });
    return;
  }
  await prisma.$transaction(
    parsed.data.orderedIds.map((id, index) =>
      prisma.energyWeekSlot.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  res.status(204).send();
});

energyRoutes.delete("/energy/slots/:id", async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const slot = await prisma.energyWeekSlot.findFirst({ where: { id, userId } });
  if (!slot) {
    res.status(404).json({ error: "Slot not found" });
    return;
  }
  await prisma.energyWeekSlot.delete({ where: { id } });
  res.status(204).send();
});
