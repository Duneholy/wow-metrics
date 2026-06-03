import { Router } from "express";
import { z } from "zod";
import { getUserId } from "../middlewares/auth.js";
import { stripUserPassword } from "../userLogic.js";

import { prisma } from "../prisma.js";
export const settingsRoutes = Router();

const settingsUpdateSchema = z.object({
  coingeckoApiKey: z.string().nullable().optional(),
  dailyEnergyLoss: z.number().int().min(0).max(100).optional(),
  assetColorGreenThreshold: z.number().min(0).optional(),
  assetColorBlueThreshold: z.number().min(0).optional(),
  assetColorPurpleThreshold: z.number().min(0).optional(),
  epicTaskWarningEnergy: z.number().int().min(0).max(100).optional(),
  hardTaskWarningEnergy: z.number().int().min(0).max(100).optional(),
  mediumTaskWarningEnergy: z.number().int().min(0).max(100).optional(),
});

settingsRoutes.get("/settings", async (req, res) => {
  const userId = getUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(stripUserPassword(user));
});

settingsRoutes.patch("/settings", async (req, res) => {
  const userId = getUserId(req);
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
    return;
  }
  
  const data = parsed.data;
  const updateData: any = {};
  
  if (data.coingeckoApiKey !== undefined) updateData.coingeckoApiKey = data.coingeckoApiKey;
  if (data.dailyEnergyLoss !== undefined) updateData.dailyEnergyLoss = data.dailyEnergyLoss;
  if (data.assetColorGreenThreshold !== undefined) updateData.assetColorGreenThreshold = data.assetColorGreenThreshold;
  if (data.assetColorBlueThreshold !== undefined) updateData.assetColorBlueThreshold = data.assetColorBlueThreshold;
  if (data.assetColorPurpleThreshold !== undefined) updateData.assetColorPurpleThreshold = data.assetColorPurpleThreshold;
  if (data.epicTaskWarningEnergy !== undefined) updateData.epicTaskWarningEnergy = data.epicTaskWarningEnergy;
  if (data.hardTaskWarningEnergy !== undefined) updateData.hardTaskWarningEnergy = data.hardTaskWarningEnergy;
  if (data.mediumTaskWarningEnergy !== undefined) updateData.mediumTaskWarningEnergy = data.mediumTaskWarningEnergy;

  if (Object.keys(updateData).length === 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    res.json(user ? stripUserPassword(user) : null);
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  res.json(stripUserPassword(updatedUser));
});
