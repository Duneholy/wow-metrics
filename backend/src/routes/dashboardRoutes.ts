import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Asset } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getUserId } from "../middlewares/auth.js";
import { levelXp, stripUserPassword } from "../userLogic.js";
import { mapGoalForClient } from "../goalLogic.js";
import { mapContactForClient, buildBirthdayNotifications } from "../contactLogic.js";
import { getRussiaCpiByYear, priceLevelForDate } from "../services/cpiService.js";
import { loadFedstatCumulativeCpiIndex } from "../fedstatCpi.js";
import {
  summarizeAssetTransactions,
  computeAssetCurrentValueRub,
  fallbackAssetValue,
  inflationBaseDateForAsset,
  computeCryptoInflationFromTransactions,
  computeStockInflationAdjustedCostBasisFromTransactions,
  stripCryptoTransactions,
  type AssetView
} from "../services/assetService.js";
import {
  resolveCoingeckoId,
  prefetchCryptoPrices,
  getCryptoUnitPriceUsd,
  getCryptoHistoricalUsd,
  getCryptoHistoricalUsdFallback,
  getCryptoHistoricalUsdFromBinance,
  getCryptoHistoricalUsdFromChart
} from "../services/cryptoService.js";
import {
  getMoexUnitPriceRub,
  getMoexHistoricalUnitPriceRub
} from "../services/moexService.js";
import { syncUserEnergy } from "../services/energyService.js";

import { prisma } from "../prisma.js";
import { DASHBOARD_CPI_BUDGET_MS, DASHBOARD_ASSET_PRICE_BUDGET_MS } from "../config.js";

export const dashboardRoutes = Router();

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

let wowIconCatalogCache: { updatedAt: number; names: string[] } | null = null;
const cryptoPerformanceCache = new Map<string, { updatedAt: number; value: { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null } }>();
const stockPerformanceCache = new Map<string, { updatedAt: number; value: { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null } }>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cryptoPerformanceCache.entries()) if (now - v.updatedAt > 1000 * 60 * 60 * 24) cryptoPerformanceCache.delete(k);
  for (const [k, v] of stockPerformanceCache.entries()) if (now - v.updatedAt > 1000 * 60 * 60 * 24) stockPerformanceCache.delete(k);
}, 1000 * 60 * 60).unref();

dashboardRoutes.get("/dashboard", async (req, res) => {
  const userId = getUserId(req);
  const [user, goals, tasksRaw, contacts, assets] = await Promise.all([
    syncUserEnergy(userId),
    prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { userId },
      include: { subtasks: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { userId },
      include: { task: { select: { id: true, title: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { cryptoTransactions: true },
    }),
  ]);

  const [cpiByYear, fedstatCpi] = await Promise.all([
    withTimeout(getRussiaCpiByYear(), DASHBOARD_CPI_BUDGET_MS, {}),
    withTimeout(loadFedstatCumulativeCpiIndex(), DASHBOARD_CPI_BUDGET_MS, null),
  ]);

  const tasks = tasksRaw.map((t) => ({
    ...t,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    subtasks: t.subtasks.map((st) => ({
      ...st,
      createdAt: st.createdAt.toISOString(),
    })),
  }));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const completedTasks = tasks.filter((task) => task.isCompleted).length;
  const weekProgress = `${completedTasks}/${tasks.length || 0}`;
  const notifications = buildBirthdayNotifications(contacts);

  const asOf = new Date();
  const priceIndex = (d: Date) => priceLevelForDate(d, fedstatCpi, cpiByYear);
  
  const cryptoIdsToPrefetch = [...new Set(assets.filter(a => a.category === "CRYPTO" && a.coingeckoId).map(a => resolveCoingeckoId(a.coingeckoId!)))];
  if (cryptoIdsToPrefetch.length > 0) {
    await withTimeout(prefetchCryptoPrices(cryptoIdsToPrefetch, user.coingeckoApiKey), DASHBOARD_ASSET_PRICE_BUDGET_MS, undefined);
  }

  const enrichedAssets: AssetView[] = await Promise.all(
    assets.map(async (row) => {
      const asset = stripCryptoTransactions(row);
      const txs = row.cryptoTransactions ?? [];
      let effectiveAsset: Asset = asset;
      let cryptoCostBasisRub: number | undefined;
      let stockCostBasisRub: number | undefined;
      let stockInflationAdjustedCostBasisRub: number | undefined;
      if ((asset.category === "CRYPTO" || asset.category === "STOCK") && txs.length > 0) {
        const { netQty, costBasisRub } = summarizeAssetTransactions(txs as any);
        if (asset.category === "CRYPTO") cryptoCostBasisRub = costBasisRub;
        if (asset.category === "STOCK") stockCostBasisRub = costBasisRub;
        effectiveAsset = { ...asset, quantity: Math.max(0, netQty) };
      }
      const { value: currentValueRub, source, valuationDate } = await withTimeout(
        computeAssetCurrentValueRub(effectiveAsset, user.coingeckoApiKey),
        DASHBOARD_ASSET_PRICE_BUDGET_MS,
        fallbackAssetValue(effectiveAsset, user.coingeckoApiKey)
      );
      const baseDate = inflationBaseDateForAsset(asset);
      const idxNow = priceIndex(valuationDate);
      const idxPurchase = priceIndex(baseDate);
      let inflationFactor = idxNow > 0 && idxPurchase > 0 ? idxNow / idxPurchase : 1;
      let inflationAdjustedRub = inflationFactor > 0 ? currentValueRub / inflationFactor : currentValueRub;
      if (asset.category === "CRYPTO" && txs.length > 0) {
        const fromTx = computeCryptoInflationFromTransactions(txs as any, priceIndex, currentValueRub, asOf);
        if (fromTx) {
          inflationFactor = fromTx.inflationFactor;
          inflationAdjustedRub = fromTx.inflationAdjustedRub;
        }
      }
      if (asset.category === "STOCK" && txs.length > 0) {
        const basisReal = computeStockInflationAdjustedCostBasisFromTransactions(txs as any, priceIndex, baseDate);
        if (typeof basisReal === "number") stockInflationAdjustedCostBasisRub = basisReal;
      }
      const otherPerformance =
        asset.category === "NON_FINANCIAL"
          ? {
              expectedProfitInflationRub:
                typeof asset.expectedPriceRub === "number" &&
                Number.isFinite(asset.expectedPriceRub) &&
                inflationFactor > 0
                  ? (asset.expectedPriceRub - currentValueRub) / inflationFactor
                  : null,
            }
          : {};
      return {
        ...effectiveAsset,
        ...(typeof cryptoCostBasisRub === "number" ? { cryptoCostBasisRub } : {}),
        ...(typeof stockCostBasisRub === "number" ? { stockCostBasisRub } : {}),
        ...(typeof stockInflationAdjustedCostBasisRub === "number" ? { stockInflationAdjustedCostBasisRub } : {}),
        ...otherPerformance,
        currentValueRub,
        inflationAdjustedRub,
        inflationFactor,
        pricingSource: source,
      };
    })
  );

  const totalMoneyRub = enrichedAssets.reduce((sum, asset) => sum + asset.currentValueRub, 0);
  const totalMoneyInflationAdjustedRub = enrichedAssets.reduce((sum, asset) => sum + asset.inflationAdjustedRub, 0);

  res.json({
    user: stripUserPassword(user),
    levelTargetXp: levelXp(user.level),
    weekProgress,
    goals: goals.map(g => mapGoalForClient(g as any)),
    tasks,
    contacts: contacts.map(mapContactForClient),
    assets: enrichedAssets,
    totalMoneyRub,
    totalMoneyInflationAdjustedRub,
    notifications,
  });
});

async function getWowIconCatalog(): Promise<string[]> {
  const now = Date.now();
  if (wowIconCatalogCache && now - wowIconCatalogCache.updatedAt < 1000 * 60 * 60 * 24) {
    return wowIconCatalogCache.names;
  }
  
  try {
    const iconsDir = path.join(__dirname, "../../../frontend/public/icons");
    const files = await fs.promises.readdir(iconsDir);
    const names = files
      .filter(file => file.toLowerCase().endsWith(".png"))
      .map(file => file.slice(0, -4).toLowerCase())
      .sort();
    
    wowIconCatalogCache = { updatedAt: now, names };
    return names;
  } catch (error) {
    console.error("Error reading icons directory:", error);
    return wowIconCatalogCache?.names ?? [];
  }
}

dashboardRoutes.get("/wow-icons/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim().toLowerCase();
  const limit = Math.min(250, Math.max(20, Number(req.query.limit ?? 120) || 120));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const catalog = await getWowIconCatalog();
  const source = query ? catalog.filter((name) => name.includes(query)) : catalog;
  const items = source.slice(offset, offset + limit);
  res.json({ items, total: source.length, hasMore: offset + limit < source.length, nextOffset: offset + items.length });
});

dashboardRoutes.get("/crypto/performance", async (req, res) => {
  const idsRaw = String(req.query.ids ?? "").trim();
  if (!idsRaw) {
    res.json({ items: {} });
    return;
  }
  const ids = [...new Set(idsRaw.split(",").map((part) => resolveCoingeckoId(part)).filter(Boolean))];
  const items: Record<string, { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null }> = {};
  const fingerprint = String(req.query.fingerprint ?? "").trim();
  
  const userId = getUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const apiKey = user?.coingeckoApiKey;

  await Promise.all(
    ids.map(async (id) => {
      try {
        const cacheKey = `${id}|${fingerprint}`;
        const cached = cryptoPerformanceCache.get(cacheKey);
        if (cached && Date.now() - cached.updatedAt < 1000 * 60 * 60 * 24) {
          items[id] = cached.value;
          return;
        }
        const [currentUsd, oneMonthUsd, oneYearUsd, twoYearUsd] = await Promise.all([
          getCryptoUnitPriceUsd(id, apiKey),
          getCryptoHistoricalUsd(id, 30, apiKey),
          getCryptoHistoricalUsd(id, 365, apiKey),
          (async () => {
            const fromFallback = await getCryptoHistoricalUsdFallback(id, 365 * 2, apiKey);
            if (fromFallback !== null) return fromFallback;
            if (id === "the-open-network") {
              const fromBinance = await getCryptoHistoricalUsdFromBinance("TONUSDT", 365 * 2);
              if (fromBinance !== null) return fromBinance;
            }
            if (id === "usd-coin") {
              const fromBinance = await getCryptoHistoricalUsdFromBinance("USDCUSDT", 365 * 2);
              if (fromBinance !== null) return fromBinance;
            }
            if (id === "tether") {
              const fromBinance = await getCryptoHistoricalUsdFromBinance("USDTUSDT", 365 * 2);
              if (fromBinance !== null) return fromBinance;
            }
            if (id === "bitcoin") return getCryptoHistoricalUsdFromBinance("BTCUSDT", 365 * 2);
            if (id === "ethereum") return getCryptoHistoricalUsdFromBinance("ETHUSDT", 365 * 2);
            return await getCryptoHistoricalUsdFromChart(id, 365 * 2, apiKey);
          })(),
        ]);
        const ratio = (past: number | null) =>
          typeof currentUsd === "number" && currentUsd > 0 && typeof past === "number"
            ? ((past - currentUsd) / currentUsd) * 100
            : null;
        const computed = {
          oneMonthPct: ratio(oneMonthUsd),
          oneYearPct: ratio(oneYearUsd),
          twoYearPct: ratio(twoYearUsd),
        };
        items[id] = computed;
        cryptoPerformanceCache.set(cacheKey, { updatedAt: Date.now(), value: computed });
      } catch {
        items[id] = { oneMonthPct: null, oneYearPct: null, twoYearPct: null };
      }
    })
  );
  res.json({ items });
});

dashboardRoutes.get("/stocks/performance", async (req, res) => {
  const tickersRaw = String(req.query.tickers ?? "").trim();
  if (!tickersRaw) {
    res.json({ items: {} });
    return;
  }
  const tickers = [...new Set(tickersRaw.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean))];
  const items: Record<string, { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null }> = {};
  const fingerprint = String(req.query.fingerprint ?? "").trim();
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const cacheKey = `${ticker}|${fingerprint}`;
        const cached = stockPerformanceCache.get(cacheKey);
        if (cached && Date.now() - cached.updatedAt < 1000 * 60 * 60 * 24) {
          items[ticker] = cached.value;
          return;
        }
        const [currentRub, oneMonthRub, oneYearRub, twoYearRub] = await Promise.all([
          getMoexUnitPriceRub(ticker),
          getMoexHistoricalUnitPriceRub(ticker, 30),
          getMoexHistoricalUnitPriceRub(ticker, 365),
          getMoexHistoricalUnitPriceRub(ticker, 365 * 2),
        ]);
        const ratio = (past: number | null) =>
          typeof currentRub === "number" && currentRub > 0 && typeof past === "number"
            ? ((past - currentRub) / currentRub) * 100
            : null;
        const computed = {
          oneMonthPct: ratio(oneMonthRub),
          oneYearPct: ratio(oneYearRub),
          twoYearPct: ratio(twoYearRub),
        };
        items[ticker] = computed;
        stockPerformanceCache.set(cacheKey, { updatedAt: Date.now(), value: computed });
      } catch {
        items[ticker] = { oneMonthPct: null, oneYearPct: null, twoYearPct: null };
      }
    })
  );
  res.json({ items });
});
