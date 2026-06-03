import { Asset } from "@prisma/client";
import { CryptoTransactionType } from "../types.js";
import { getCryptoUnitPriceRub } from "./cryptoService.js";
import { getMoexUnitPriceRub } from "./moexService.js";
import { prisma } from "../prisma.js";

export type AssetView = Asset & {
  currentValueRub: number;
  inflationAdjustedRub: number;
  inflationFactor: number;
  pricingSource: "MANUAL" | "COINGECKO" | "MOEX" | "DEPOSIT";
  cryptoCostBasisRub?: number;
  stockCostBasisRub?: number;
  stockInflationAdjustedCostBasisRub?: number;
  expectedProfitInflationRub?: number | null;
};

export function summarizeAssetTransactions(
  txs: Array<{ type: CryptoTransactionType; quantity: number; totalRub: number }>
): { netQty: number; costBasisRub: number } {
  let buyQ = 0;
  let sellQ = 0;
  let buyR = 0;
  let sellR = 0;
  let dividendR = 0;
  for (const t of txs) {
    if (t.type === "BUY") {
      buyQ += t.quantity;
      buyR += t.totalRub;
    } else if (t.type === "SELL") {
      sellQ += t.quantity;
      sellR += t.totalRub;
    } else if (t.type === "DIVIDEND") {
      dividendR += t.totalRub;
    }
  }
  return { netQty: buyQ - sellQ, costBasisRub: buyR - sellR - dividendR };
}

export function assertAssetTxsNetNonNegative(txs: Array<{ type: CryptoTransactionType; quantity: number; totalRub: number }>) {
  const { netQty } = summarizeAssetTransactions(txs);
  if (netQty < -1e-6) {
    throw new Error("Transactions would leave negative crypto balance");
  }
}

export function validateTransactionTypeForAssetCategory(type: CryptoTransactionType, category: string): void {
  if (category === "CRYPTO" && type === "DIVIDEND") {
    throw new Error("Dividends are supported only for stocks");
  }
}

export function validateTransactionQuantity(type: CryptoTransactionType, quantity: number): void {
  if ((type === "BUY" || type === "SELL") && quantity <= 0) {
    throw new Error("Quantity must be positive for buy/sell");
  }
  if (type === "DIVIDEND" && quantity !== 0) {
    throw new Error("Quantity must be 0 for dividends");
  }
}

export function computeStockInflationAdjustedCostBasisFromTransactions(
  txs: Array<{ type: CryptoTransactionType; executedAt: Date; totalRub: number }>,
  priceIndex: (d: Date) => number,
  baseDate: Date
): number | null {
  const idxBase = priceIndex(baseDate);
  if (idxBase <= 0) return null;
  let sum = 0;
  let seen = false;
  for (const t of txs) {
    const idxTx = priceIndex(t.executedAt);
    if (idxTx <= 0) continue;
    const adjusted = t.totalRub * (idxBase / idxTx);
    if (t.type === "BUY") sum += adjusted;
    if (t.type === "SELL") sum -= adjusted;
    if (t.type === "DIVIDEND") sum -= adjusted;
    seen = true;
  }
  return seen ? sum : null;
}

export async function recalcAssetQuantityFromTransactions(assetId: string): Promise<void> {
  const txs = await prisma.cryptoTransaction.findMany({ where: { assetId } });
  const { netQty } = summarizeAssetTransactions(txs as any);
  await prisma.asset.update({
    where: { id: assetId },
    data: { quantity: Math.max(0, netQty) },
  });
}

export function stripCryptoTransactions<T extends Asset & { cryptoTransactions?: unknown }>(row: T): Asset {
  const { cryptoTransactions: _omit, ...rest } = row;
  return rest as Asset;
}

export function computeCryptoInflationFromTransactions(
  txs: Array<{ executedAt: Date; totalRub: number }>,
  priceIndex: (d: Date) => number,
  currentValueRub: number,
  asOf: Date
): { inflationFactor: number; inflationAdjustedRub: number } | null {
  const idxNow = priceIndex(asOf);
  let sumW = 0;
  let sumWeightedFactor = 0;
  for (const t of txs) {
    const w = Math.abs(Number(t.totalRub));
    if (w <= 0) continue;
    const idxTx = priceIndex(t.executedAt);
    if (idxTx <= 0 || idxNow <= 0) continue;
    sumWeightedFactor += w * (idxNow / idxTx);
    sumW += w;
  }
  if (sumW > 0 && sumWeightedFactor > 0) {
    const F = sumWeightedFactor / sumW;
    return { inflationFactor: F, inflationAdjustedRub: F > 0 ? currentValueRub / F : currentValueRub };
  }
  return null;
}

export function inflationBaseDateForAsset(asset: Asset): Date {
  if (asset.category === "DEPOSIT") {
    return asset.acquisitionDate ?? asset.createdAt;
  }
  if (asset.category === "NON_FINANCIAL") {
    return asset.acquisitionDate ?? asset.createdAt;
  }
  return asset.acquisitionDate ?? asset.createdAt;
}

export function computeDepositCurrentValue(asset: Asset): { value: number; valuationDate: Date } {
  const principal = asset.manualValueRub ?? 0;
  const rate = asset.depositRateAnnual ?? 0;
  const start = asset.acquisitionDate ?? asset.createdAt;
  const endLimit = asset.depositCloseDate ?? new Date();
  const now = new Date();
  const effectiveEnd = endLimit < now ? endLimit : now;
  const days = Math.max(0, Math.floor((effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const annual = rate / 100;
  const accrued = principal * Math.pow(1 + annual / 365, days);
  return { value: Number.isFinite(accrued) ? accrued : principal, valuationDate: effectiveEnd };
}

export async function computeAssetCurrentValueRub(
  asset: Asset,
  apiKey?: string | null
): Promise<{ value: number; source: AssetView["pricingSource"]; valuationDate: Date }> {
  const now = new Date();
  if (asset.category === "CRYPTO") {
    const unit = await getCryptoUnitPriceRub(asset.coingeckoId ?? undefined, apiKey);
    if (unit !== null) return { value: unit * asset.quantity, source: "COINGECKO", valuationDate: now };
  }
  if (asset.category === "STOCK") {
    const unit = await getMoexUnitPriceRub(asset.ticker ?? undefined);
    if (unit !== null) return { value: unit * asset.quantity, source: "MOEX", valuationDate: now };
  }
  if (asset.category === "DEPOSIT") {
    const deposit = computeDepositCurrentValue(asset);
    return { value: deposit.value, source: "DEPOSIT", valuationDate: deposit.valuationDate };
  }
  return { value: asset.manualValueRub ?? 0, source: "MANUAL", valuationDate: now };
}

export function fallbackAssetValue(
  asset: Asset,
  apiKey?: string | null
): { value: number; source: AssetView["pricingSource"]; valuationDate: Date } {
  const now = new Date();
  if (asset.category === "DEPOSIT") {
    const deposit = computeDepositCurrentValue(asset);
    return { value: deposit.value, source: "DEPOSIT", valuationDate: deposit.valuationDate };
  }
  return { value: asset.manualValueRub ?? 0, source: "MANUAL", valuationDate: now };
}

export function validateAssetInput(data: {
  category?: "DEPOSIT" | "STOCK" | "CRYPTO" | "NON_FINANCIAL";
  ticker?: string | null;
  coingeckoId?: string | null;
  manualValueRub?: number | null;
  depositRateAnnual?: number | null;
  depositCloseDate?: string | null;
  taxProfitPercent?: number | null;
}) {
  const category = data.category;
  if (!category) return;
  if ((category === "STOCK" && !data.ticker) || (category === "CRYPTO" && !data.coingeckoId)) {
    throw new Error("Ticker/coingeckoId is required for market assets");
  }
  if ((category === "DEPOSIT" || category === "NON_FINANCIAL") && typeof data.manualValueRub !== "number") {
    throw new Error("manualValueRub is required for deposit/non-financial");
  }
  if (category === "DEPOSIT" && (typeof data.depositRateAnnual !== "number" || !data.depositCloseDate)) {
    throw new Error("depositRateAnnual and depositCloseDate are required for deposits");
  }
}

export function normalizeNullableString(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
