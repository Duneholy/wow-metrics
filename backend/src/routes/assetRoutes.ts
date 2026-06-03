import { Router } from "express";
import { z } from "zod";
import { AssetCategory, CryptoTransactionType } from "../types.js";
import { prisma } from "../prisma.js";
import { getUserId } from "../middlewares/auth.js";
import { resolveCoingeckoId } from "../services/cryptoService.js";
import {
  assetCreateSchema,
  assetUpdateSchema,
  cryptoTxCreateSchema,
  cryptoTxUpdateSchema,
} from "../schemas/index.js";
import {
  validateAssetInput,
  normalizeNullableString,
  recalcAssetQuantityFromTransactions,
  validateTransactionTypeForAssetCategory,
  validateTransactionQuantity,
  assertAssetTxsNetNonNegative,
} from "../services/assetService.js";

export const assetRoutes = Router();

assetRoutes.post("/assets", async (req, res) => {
  const parsed = assetCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const normalized: z.infer<typeof assetCreateSchema> = parsed.data;
  const userId = getUserId(req);
  let createPayload = normalized;
  if (normalized.category === "CRYPTO") {
    const raw = String(normalized.coingeckoId ?? normalized.ticker ?? "").trim();
    const resolved = resolveCoingeckoId(raw);
    createPayload = {
      ...normalized,
      quantity: normalized.quantity,
      ticker: raw ? raw.toUpperCase() : null,
      coingeckoId: resolved,
    };
  }
  try {
    validateAssetInput({
      category: createPayload.category,
      ticker: createPayload.ticker,
      coingeckoId: createPayload.coingeckoId,
      manualValueRub: createPayload.manualValueRub,
      depositRateAnnual: createPayload.depositRateAnnual,
      depositCloseDate: createPayload.depositCloseDate,
      taxProfitPercent: createPayload.taxProfitPercent,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid asset data" });
    return;
  }
  const asset = await prisma.asset.create({
    data: {
      userId,
      name: createPayload.name,
      category: createPayload.category as AssetCategory,
      quantity: createPayload.quantity,
      ticker: normalizeNullableString(createPayload.ticker),
      coingeckoId: normalizeNullableString(createPayload.coingeckoId),
      manualValueRub: createPayload.manualValueRub ?? null,
      acquisitionDate: createPayload.acquisitionDate ? new Date(createPayload.acquisitionDate) : null,
      depositRateAnnual: createPayload.depositRateAnnual ?? null,
      depositCloseDate: createPayload.depositCloseDate ? new Date(createPayload.depositCloseDate) : null,
      taxProfitPercent: createPayload.taxProfitPercent ?? null,
      note: normalizeNullableString(createPayload.note),
      iconName: normalizeNullableString(createPayload.iconName),
      purchaseCostRub: createPayload.purchaseCostRub ?? null,
      expectedPriceRub: createPayload.expectedPriceRub ?? null,
    },
  });
  res.status(201).json(asset);
});

assetRoutes.patch("/assets/:assetId", async (req, res) => {
  const { assetId } = req.params;
  const parsed = assetUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const existing = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!existing) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  const txCount =
    (existing.category === "CRYPTO" || existing.category === "STOCK")
      ? await prisma.cryptoTransaction.count({ where: { assetId } })
      : 0;
  const patchBody = { ...parsed.data };
  if ((existing.category === "CRYPTO" || existing.category === "STOCK") && txCount > 0 && patchBody.quantity !== undefined) {
    delete (patchBody as { quantity?: number }).quantity;
  }
  if (existing.category === "CRYPTO" && (patchBody.ticker !== undefined || patchBody.coingeckoId !== undefined)) {
    const raw = String(
      patchBody.coingeckoId ?? patchBody.ticker ?? existing.coingeckoId ?? existing.ticker ?? ""
    ).trim();
    if (raw) {
      (patchBody as { coingeckoId?: string | null }).coingeckoId = resolveCoingeckoId(raw);
      (patchBody as { ticker?: string | null }).ticker = raw.toUpperCase();
    }
  }
  const merged = { ...existing, ...patchBody };
  if (merged.category !== "CRYPTO" && merged.quantity <= 0) {
    res.status(400).json({ error: "Quantity must be positive" });
    return;
  }
  try {
    const mergedClose =
      typeof merged.depositCloseDate === "string"
        ? merged.depositCloseDate
        : merged.depositCloseDate
          ? merged.depositCloseDate.toISOString()
          : undefined;
    validateAssetInput({
      category: (merged.category as "DEPOSIT" | "STOCK" | "CRYPTO" | "NON_FINANCIAL") ?? undefined,
      ticker: merged.ticker ?? undefined,
      coingeckoId: merged.coingeckoId ?? undefined,
      manualValueRub: merged.manualValueRub ?? undefined,
      depositRateAnnual: merged.depositRateAnnual ?? undefined,
      depositCloseDate: mergedClose,
      taxProfitPercent: merged.taxProfitPercent ?? undefined,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid asset data" });
    return;
  }
  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: {
      ...(patchBody.name !== undefined ? { name: patchBody.name } : {}),
      ...(patchBody.category !== undefined ? { category: patchBody.category as AssetCategory } : {}),
      ...(patchBody.quantity !== undefined ? { quantity: patchBody.quantity } : {}),
      ...(patchBody.ticker !== undefined ? { ticker: normalizeNullableString(patchBody.ticker) } : {}),
      ...(patchBody.coingeckoId !== undefined ? { coingeckoId: normalizeNullableString(patchBody.coingeckoId) } : {}),
      ...(patchBody.manualValueRub !== undefined ? { manualValueRub: patchBody.manualValueRub ?? null } : {}),
      ...(patchBody.acquisitionDate !== undefined
        ? { acquisitionDate: patchBody.acquisitionDate ? new Date(patchBody.acquisitionDate) : null }
        : {}),
      ...(patchBody.depositRateAnnual !== undefined ? { depositRateAnnual: patchBody.depositRateAnnual ?? null } : {}),
      ...(patchBody.depositCloseDate !== undefined
        ? { depositCloseDate: patchBody.depositCloseDate ? new Date(patchBody.depositCloseDate) : null }
        : {}),
      ...(patchBody.taxProfitPercent !== undefined ? { taxProfitPercent: patchBody.taxProfitPercent ?? null } : {}),
      ...(patchBody.note !== undefined ? { note: normalizeNullableString(patchBody.note) } : {}),
      ...(patchBody.iconName !== undefined ? { iconName: normalizeNullableString(patchBody.iconName) } : {}),
      ...(patchBody.purchaseCostRub !== undefined ? { purchaseCostRub: patchBody.purchaseCostRub ?? null } : {}),
      ...(patchBody.expectedPriceRub !== undefined ? { expectedPriceRub: patchBody.expectedPriceRub ?? null } : {}),
    },
  });
  res.json(updated);
});

assetRoutes.delete("/assets/:assetId", async (req, res) => {
  const { assetId } = req.params;
  const userId = getUserId(req);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  await prisma.asset.delete({ where: { id: assetId } });
  res.status(204).send();
});


assetRoutes.get("/assets/:assetId/transactions", async (req, res) => {
  const { assetId } = req.params;
  const userId = getUserId(req);
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset || (asset.category !== "CRYPTO" && asset.category !== "STOCK")) {
    res.status(404).json({ error: "Asset with transactions not found" });
    return;
  }
  const txs = await prisma.cryptoTransaction.findMany({
    where: { assetId },
    orderBy: { executedAt: "desc" },
  });
  res.json(txs);
});


assetRoutes.post("/assets/:assetId/transactions", async (req, res) => {
  const { assetId } = req.params;
  const userId = getUserId(req);
  const parsed = cryptoTxCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId } });
  if (!asset || (asset.category !== "CRYPTO" && asset.category !== "STOCK")) {
    res.status(404).json({ error: "Asset with transactions not found" });
    return;
  }
  const existingTxs = await prisma.cryptoTransaction.findMany({ where: { assetId } });
  const next = {
    type: parsed.data.type as CryptoTransactionType,
    quantity: (parsed.data.type as CryptoTransactionType) === "DIVIDEND" ? 0 : parsed.data.quantity,
    totalRub: parsed.data.totalRub,
  };
  try {
    validateTransactionTypeForAssetCategory(next.type, asset.category);
    validateTransactionQuantity(next.type, next.quantity);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid transaction type" });
    return;
  }
  assertAssetTxsNetNonNegative([
    ...existingTxs.map((t) => ({ type: t.type as CryptoTransactionType, quantity: t.quantity, totalRub: t.totalRub })),
    next,
  ]);
  const tx = await prisma.cryptoTransaction.create({
    data: {
      assetId,
      type: next.type,
      executedAt: new Date(parsed.data.executedAt),
      quantity: next.quantity,
      totalRub: next.totalRub,
    },
  });
  await recalcAssetQuantityFromTransactions(assetId);
  res.status(201).json(tx);
});


assetRoutes.patch("/transactions/:txId", async (req, res) => {
  const { txId } = req.params;
  const userId = getUserId(req);
  const parsed = cryptoTxUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const txRow = await prisma.cryptoTransaction.findUnique({
    where: { id: txId },
    include: { asset: true },
  });
  if (!txRow || txRow.asset.userId !== userId || (txRow.asset.category !== "CRYPTO" && txRow.asset.category !== "STOCK")) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  const others = await prisma.cryptoTransaction.findMany({
    where: { assetId: txRow.assetId, NOT: { id: txId } },
  });
  const merged = {
    type: (parsed.data.type ?? txRow.type) as CryptoTransactionType,
    quantity:
      ((parsed.data.type ?? txRow.type) as CryptoTransactionType) === "DIVIDEND"
        ? 0
        : (parsed.data.quantity ?? txRow.quantity),
    totalRub: parsed.data.totalRub ?? txRow.totalRub,
    executedAt: parsed.data.executedAt ? new Date(parsed.data.executedAt) : txRow.executedAt,
  };
  try {
    validateTransactionTypeForAssetCategory(merged.type, txRow.asset.category);
    validateTransactionQuantity(merged.type, merged.quantity);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid transaction type" });
    return;
  }
  assertAssetTxsNetNonNegative([
    ...others.map((t) => ({ type: t.type as CryptoTransactionType, quantity: t.quantity, totalRub: t.totalRub })),
    { type: merged.type, quantity: merged.quantity, totalRub: merged.totalRub },
  ]);
  const updated = await prisma.cryptoTransaction.update({
    where: { id: txId },
    data: {
      type: merged.type,
      quantity: merged.quantity,
      totalRub: merged.totalRub,
      executedAt: merged.executedAt,
    },
  });
  await recalcAssetQuantityFromTransactions(txRow.assetId);
  res.json(updated);
});


assetRoutes.delete("/transactions/:txId", async (req, res) => {
  const { txId } = req.params;
  const userId = getUserId(req);
  const txRow = await prisma.cryptoTransaction.findUnique({
    where: { id: txId },
    include: { asset: true },
  });
  if (!txRow || txRow.asset.userId !== userId || (txRow.asset.category !== "CRYPTO" && txRow.asset.category !== "STOCK")) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  const remaining = await prisma.cryptoTransaction.findMany({
    where: { assetId: txRow.assetId, NOT: { id: txId } },
  });
  assertAssetTxsNetNonNegative(remaining.map((t) => ({ type: t.type as CryptoTransactionType, quantity: t.quantity, totalRub: t.totalRub })));
  await prisma.cryptoTransaction.delete({ where: { id: txId } });
  await recalcAssetQuantityFromTransactions(txRow.assetId);
  res.status(204).send();
});
