import { indexForMonth, type FedstatCpiCacheState } from "../fedstatCpi.js";

type CpiMap = Record<number, number>;
let cpiCache: { updatedAt: number; values: CpiMap } | null = null;

export async function getRussiaCpiByYear(): Promise<CpiMap> {
  const now = Date.now();
  if (cpiCache && now - cpiCache.updatedAt < 1000 * 60 * 60 * 24) {
    return cpiCache.values;
  }
  try {
    const response = await fetch(
      "https://api.worldbank.org/v2/country/RUS/indicator/FP.CPI.TOTL?format=json&per_page=80"
    );
    if (!response.ok) {
      throw new Error("CPI request failed");
    }
    const payload = (await response.json()) as [unknown, Array<{ date: string; value: number | null }>];
    const series = Array.isArray(payload?.[1]) ? payload[1] : [];
    const values: CpiMap = {};
    for (const point of series) {
      const year = Number(point.date);
      if (!Number.isNaN(year) && typeof point.value === "number" && point.value > 0) {
        values[year] = point.value;
      }
    }
    if (Object.keys(values).length > 0) {
      cpiCache = { updatedAt: now, values };
      return values;
    }
  } catch {
    // Fallback below
  }
  return cpiCache?.values ?? {};
}

export function getClosestCpiValue(cpiByYear: CpiMap, year: number): number | null {
  if (cpiByYear[year]) return cpiByYear[year];
  for (let delta = 1; delta <= 5; delta += 1) {
    if (cpiByYear[year - delta]) return cpiByYear[year - delta];
    if (cpiByYear[year + delta]) return cpiByYear[year + delta];
  }
  return null;
}

export function yearEndCpiLevel(cpiByYear: CpiMap, year: number): number | null {
  return cpiByYear[year] ?? getClosestCpiValue(cpiByYear, year);
}

export function projectedYearEndCpiLevel(cpiByYear: CpiMap, year: number): number | null {
  if (typeof cpiByYear[year] === "number" && cpiByYear[year] > 0) return cpiByYear[year];
  const knownYears = Object.keys(cpiByYear)
    .map(Number)
    .filter((y) => Number.isFinite(y) && typeof cpiByYear[y] === "number" && (cpiByYear[y] ?? 0) > 0)
    .sort((a, b) => a - b);
  if (knownYears.length === 0) return null;
  if (knownYears.length === 1) return cpiByYear[knownYears[0]] ?? null;

  const minYear = knownYears[0];
  const maxYear = knownYears[knownYears.length - 1];

  if (year > maxYear) {
    const prevYear = knownYears[knownYears.length - 2];
    const maxLevel = cpiByYear[maxYear]!;
    const prevLevel = cpiByYear[prevYear]!;
    const annualGrowth = prevLevel > 0 ? maxLevel / prevLevel : 1;
    if (annualGrowth <= 0) return maxLevel;
    return maxLevel * Math.pow(annualGrowth, year - maxYear);
  }

  if (year < minYear) {
    const nextYear = knownYears[1];
    const minLevel = cpiByYear[minYear]!;
    const nextLevel = cpiByYear[nextYear]!;
    const annualGrowth = minLevel > 0 ? nextLevel / minLevel : 1;
    if (annualGrowth <= 0) return minLevel;
    return minLevel / Math.pow(annualGrowth, minYear - year);
  }

  return yearEndCpiLevel(cpiByYear, year);
}

export function monthlyCpiIndexFromAnnualSeries(cpiByYear: CpiMap, date: Date): number {
  const y = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const L0 = projectedYearEndCpiLevel(cpiByYear, y - 1);
  const L1 = projectedYearEndCpiLevel(cpiByYear, y);
  if (L1 && L0 && L0 > 0) {
    return L0 * Math.pow(L1 / L0, month / 12);
  }
  if (L1 && L1 > 0) return L1;
  if (L0 && L0 > 0) return L0;
  return 1;
}

export function clampedFedstatIndex(indexByMonth: Record<string, number>, d: Date): number | null {
  const keys = Object.keys(indexByMonth).sort();
  if (keys.length === 0) return null;
  const hit = indexForMonth(indexByMonth, d);
  if (hit != null) return hit;
  const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  if (k < keys[0]) return indexByMonth[keys[0]];
  return indexByMonth[keys[keys.length - 1]];
}

export function priceLevelForDate(d: Date, fed: FedstatCpiCacheState | null, cpiByYear: CpiMap): number {
  if (fed) {
    const v = clampedFedstatIndex(fed.indexByMonth, d);
    if (v != null && v > 0) return v;
  }
  return monthlyCpiIndexFromAnnualSeries(cpiByYear, d);
}
