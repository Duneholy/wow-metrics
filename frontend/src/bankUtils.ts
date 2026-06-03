import type {
  Asset,
  AssetCategory,
  AssetFormState,
  BankSortKey,
  DashboardPayload,
} from "../../shared/types";

export const WOWHEAD_ICON_BASE = "/icons";
export const WEEKLY_FOCUS_CAPACITY = 7;
export const FOCUS_CURSOR_HAND_GLOW = 'url("/textures/openhandglow.PNG") 32 40, grabbing';

export const CATEGORY_ICON_URLS: Record<AssetCategory, string> = {
  DEPOSIT: `${WOWHEAD_ICON_BASE}/inv_misc_bag_10.png`,
  STOCK: `${WOWHEAD_ICON_BASE}/inv_misc_coin_01.png`,
  CRYPTO: `${WOWHEAD_ICON_BASE}/inv_misc_gem_pearl_04.png`,
  NON_FINANCIAL: `${WOWHEAD_ICON_BASE}/inv_misc_book_09.png`,
};

export function amountToCoins(value: number): { gold: number; silver: number } {
  const rub = Math.max(0, Math.floor(value));
  const gold = Math.floor(rub / 1000);
  const silver = Math.floor((rub % 1000) / 10);
  return { gold, silver };
}

export function txDateToInput(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function inputDateToIso(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

export function parseAssetCategorySelect(value: string): AssetCategory {
  if (value === "DEPOSIT" || value === "STOCK" || value === "CRYPTO" || value === "NON_FINANCIAL") return value;
  return "DEPOSIT";
}

export function amountToSignedCoins(value: number): { sign: -1 | 0 | 1; gold: number; silver: number } {
  const rounded = Math.round(value);
  if (rounded === 0) return { sign: 0, gold: 0, silver: 0 };
  const sign: -1 | 1 = rounded < 0 ? -1 : 1;
  const absRub = Math.abs(rounded);
  const gold = Math.floor(absRub / 1000);
  const silver = Math.floor((absRub % 1000) / 10);
  return { sign, gold, silver };
}

export function cryptoCostBasisRub(asset: Asset): number {
  if (asset.category !== "CRYPTO") return asset.purchaseCostRub ?? 0;
  if (typeof asset.cryptoCostBasisRub === "number") return asset.cryptoCostBasisRub;
  return asset.purchaseCostRub ?? 0;
}

export function depositCostBasisRub(asset: Asset): number {
  if (asset.category !== "DEPOSIT") return 0;
  return asset.manualValueRub ?? 0;
}

export function stockCostBasisRub(asset: Asset): number {
  if (asset.category !== "STOCK") return asset.purchaseCostRub ?? 0;
  if (typeof asset.stockCostBasisRub === "number") return asset.stockCostBasisRub;
  return asset.purchaseCostRub ?? 0;
}

export function stockInflationAdjustedCostBasisRub(asset: Asset): number {
  if (asset.category !== "STOCK") return stockCostBasisRub(asset);
  if (typeof asset.stockInflationAdjustedCostBasisRub === "number") return asset.stockInflationAdjustedCostBasisRub;
  return stockCostBasisRub(asset);
}

export function taxedDepositProfitRub(asset: Asset, rawProfitRub: number): number {
  if (asset.category !== "DEPOSIT") return rawProfitRub;
  const taxPct = Math.max(0, Math.min(100, Number(asset.taxProfitPercent ?? 0)));
  return rawProfitRub * (1 - taxPct / 100);
}

export function nominalProfitRub(asset: Asset): number {
  if (asset.category === "CRYPTO") {
    return asset.currentValueRub - cryptoCostBasisRub(asset);
  }
  if (asset.category === "STOCK") {
    return asset.currentValueRub - stockCostBasisRub(asset);
  }
  if (asset.category === "DEPOSIT") {
    return taxedDepositProfitRub(asset, asset.currentValueRub - depositCostBasisRub(asset));
  }
  const basis = asset.purchaseCostRub ?? asset.manualValueRub ?? 0;
  return asset.currentValueRub - basis;
}

export function profitInflationRub(asset: Asset): number {
  if (asset.category === "DEPOSIT") {
    return taxedDepositProfitRub(asset, asset.inflationAdjustedRub - depositCostBasisRub(asset));
  }
  if (asset.category === "STOCK") {
    return asset.inflationAdjustedRub - stockInflationAdjustedCostBasisRub(asset);
  }
  if (asset.category === "CRYPTO") {
    return asset.inflationAdjustedRub - cryptoCostBasisRub(asset);
  }
  return 0;
}

export function getBankSortValue(asset: Asset, key: BankSortKey): number | string {
  switch (key) {
    case "name":
      return asset.name ?? "";
    case "category":
      return asset.category ?? "";
    case "quantity":
      return asset.quantity ?? 0;
    case "currentValueRub":
      return asset.currentValueRub ?? 0;
    case "inflationAdjustedRub":
      return asset.inflationAdjustedRub ?? 0;
    case "acquisitionDate":
      return asset.acquisitionDate ?? "";
    case "profit":
      if (asset.category === "NON_FINANCIAL") return Number.NEGATIVE_INFINITY;
      return nominalProfitRub(asset);
    case "profitInflation":
      return profitInflationRub(asset);
    case "expectedPriceRub":
      return typeof asset.expectedPriceRub === "number" && Number.isFinite(asset.expectedPriceRub)
        ? asset.expectedPriceRub
        : Number.NEGATIVE_INFINITY;
    case "expectedProfitInflation":
      return typeof asset.expectedProfitInflationRub === "number" && Number.isFinite(asset.expectedProfitInflationRub)
        ? asset.expectedProfitInflationRub
        : Number.NEGATIVE_INFINITY;
    default:
      return "";
  }
}

export function assetToForm(asset: Asset): AssetFormState {
  return {
    name: asset.name,
    category: asset.category,
    quantity: String(asset.quantity),
    manualValueRub: asset.manualValueRub != null ? String(asset.manualValueRub) : "",
    acquisitionDate: asset.acquisitionDate
      ? asset.acquisitionDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    ticker:
      asset.category === "CRYPTO"
        ? (asset.ticker ?? asset.coingeckoId ?? "")
        : (asset.ticker ?? ""),
    coingeckoId: asset.coingeckoId ?? "",
    depositRateAnnual: asset.depositRateAnnual != null ? String(asset.depositRateAnnual) : "",
    depositCloseDate: asset.depositCloseDate
      ? asset.depositCloseDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    taxProfitPercent: asset.taxProfitPercent != null ? String(asset.taxProfitPercent) : "",
    iconName: asset.iconName ?? "",
    purchaseCostRub: asset.purchaseCostRub != null ? String(asset.purchaseCostRub) : "",
    expectedPriceRub: asset.expectedPriceRub != null ? String(asset.expectedPriceRub) : "",
  };
}

export function formatAssetDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const key = iso.includes("T") ? iso.slice(0, 10) : iso;
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function assetsVisuallyEqual(a: Asset[], b: Asset[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((x) => [x.id, x]));
  for (const x of a) {
    const y = byId.get(x.id);
    if (!y) return false;
    if (
      x.currentValueRub !== y.currentValueRub ||
      x.quantity !== y.quantity ||
      x.inflationAdjustedRub !== y.inflationAdjustedRub ||
      x.cryptoCostBasisRub !== y.cryptoCostBasisRub ||
      x.name !== y.name ||
      x.iconName !== y.iconName ||
      x.ticker !== y.ticker ||
      x.coingeckoId !== y.coingeckoId ||
      x.category !== y.category ||
      x.manualValueRub !== y.manualValueRub ||
      x.expectedPriceRub !== y.expectedPriceRub ||
      x.expectedProfitInflationRub !== y.expectedProfitInflationRub ||
      x.stockInflationAdjustedCostBasisRub !== y.stockInflationAdjustedCostBasisRub ||
      x.acquisitionDate !== y.acquisitionDate
    ) {
      return false;
    }
  }
  return true;
}

export function dashboardVisuallyEqual(prev: DashboardPayload, next: DashboardPayload): boolean {
  if (prev.totalMoneyRub !== next.totalMoneyRub || prev.totalMoneyInflationAdjustedRub !== next.totalMoneyInflationAdjustedRub) {
    return false;
  }
  if (prev.weekProgress !== next.weekProgress || prev.levelTargetXp !== next.levelTargetXp) return false;
  if (prev.user.xp !== next.user.xp || prev.user.level !== next.user.level || prev.user.energy !== next.user.energy) return false;
  if (prev.goals.length !== next.goals.length || prev.tasks.length !== next.tasks.length) {
    return false;
  }
  if (prev.contacts.length !== next.contacts.length || prev.notifications.length !== next.notifications.length) return false;
  if (!assetsVisuallyEqual(prev.assets, next.assets)) return false;
  for (let i = 0; i < prev.goals.length; i++) {
    const a = prev.goals[i]!;
    const b = next.goals[i]!;
    if (
      a.id !== b.id ||
      a.title !== b.title ||
      a.isCompleted !== b.isCompleted ||
      (a.iconName ?? "") !== (b.iconName ?? "") ||
      (a.description ?? "") !== (b.description ?? "") ||
      (a.completedAt ?? "") !== (b.completedAt ?? "")
    ) {
      return false;
    }
  }
  return true;
}
