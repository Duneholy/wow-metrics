export function formatDateYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function fetchMoexHistoricalUnitPriceRub(
  ticker: string,
  target: Date,
  halfWindowDays: number
): Promise<number | null> {
  const from = new Date(target.getTime() - halfWindowDays * 24 * 60 * 60 * 1000);
  const till = new Date(target.getTime() + halfWindowDays * 24 * 60 * 60 * 1000);
  const url =
    `https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/${encodeURIComponent(ticker)}.json` +
    `?iss.meta=off&from=${encodeURIComponent(formatDateYmd(from))}&till=${encodeURIComponent(formatDateYmd(till))}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    history?: { columns?: string[]; data?: Array<Array<number | string | null>> };
  };
  const cols = payload.history?.columns ?? [];
  const rows = payload.history?.data ?? [];
  const idxTradeDate = cols.indexOf("TRADEDATE");
  const priceIndexes = ["CLOSE", "LEGALCLOSEPRICE", "MARKETPRICE2", "WAPRICE", "OPEN"]
    .map((name) => cols.indexOf(name))
    .filter((idx) => idx >= 0);
  if (idxTradeDate < 0 || priceIndexes.length === 0 || rows.length === 0) return null;

  const targetMidnight = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  let best: { delta: number; price: number } | null = null;
  for (const row of rows) {
    const rawDate = row[idxTradeDate];
    if (typeof rawDate !== "string") continue;
    const tradeMs = Date.parse(`${rawDate}T00:00:00Z`);
    if (!Number.isFinite(tradeMs)) continue;
    let price: number | null = null;
    for (const idx of priceIndexes) {
      const raw = row[idx];
      if (typeof raw === "number" && raw > 0) {
        price = raw;
        break;
      }
      if (typeof raw === "string") {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          price = parsed;
          break;
        }
      }
    }
    if (price === null) continue;
    const delta = Math.abs(tradeMs - targetMidnight);
    if (!best || delta < best.delta) best = { delta, price };
  }
  return best?.price ?? null;
}

export async function getMoexEarliestAvailableUnitPriceRub(ticker: string): Promise<number | null> {
  const upperTicker = ticker.trim().toUpperCase();
  if (!upperTicker) return null;
  const till = formatDateYmd(new Date());
  const from = "1990-01-01";
  let start = 0;
  let earliest: { dateMs: number; price: number } | null = null;
  for (let page = 0; page < 50; page += 1) {
    const url =
      `https://iss.moex.com/iss/history/engines/stock/markets/shares/securities/${encodeURIComponent(upperTicker)}.json` +
      `?iss.meta=off&from=${encodeURIComponent(from)}&till=${encodeURIComponent(till)}&start=${start}`;
    const response = await fetch(url);
    if (!response.ok) break;
    const payload = (await response.json()) as {
      history?: { columns?: string[]; data?: Array<Array<number | string | null>> };
    };
    const cols = payload.history?.columns ?? [];
    const rows = payload.history?.data ?? [];
    if (rows.length === 0) break;
    const idxTradeDate = cols.indexOf("TRADEDATE");
    const priceIndexes = ["CLOSE", "LEGALCLOSEPRICE", "MARKETPRICE2", "WAPRICE", "OPEN"]
      .map((name) => cols.indexOf(name))
      .filter((idx) => idx >= 0);
    if (idxTradeDate < 0 || priceIndexes.length === 0) break;
    for (const row of rows) {
      const rawDate = row[idxTradeDate];
      if (typeof rawDate !== "string") continue;
      const dateMs = Date.parse(`${rawDate}T00:00:00Z`);
      if (!Number.isFinite(dateMs)) continue;
      let price: number | null = null;
      for (const idx of priceIndexes) {
        const raw = row[idx];
        if (typeof raw === "number" && raw > 0) {
          price = raw;
          break;
        }
        if (typeof raw === "string") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed > 0) {
            price = parsed;
            break;
          }
        }
      }
      if (price === null) continue;
      if (!earliest || dateMs < earliest.dateMs) {
        earliest = { dateMs, price };
      }
    }
    start += rows.length;
    if (rows.length < 100) break;
  }
  return earliest?.price ?? null;
}

export async function getMoexHistoricalUnitPriceRub(ticker: string, daysAgo: number): Promise<number | null> {
  const upperTicker = ticker.trim().toUpperCase();
  if (!upperTicker) return null;
  const target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  try {
    const firstTry = await fetchMoexHistoricalUnitPriceRub(upperTicker, target, 7);
    if (firstTry !== null) return firstTry;
    const wideTry = await fetchMoexHistoricalUnitPriceRub(upperTicker, target, 30);
    if (wideTry !== null) return wideTry;
    return await getMoexEarliestAvailableUnitPriceRub(upperTicker);
  } catch {
    return null;
  }
}

export async function getMoexUnitPriceRub(ticker?: string): Promise<number | null> {
  if (!ticker) return null;
  const upperTicker = ticker.toUpperCase();
  const url = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${encodeURIComponent(upperTicker)}.json?iss.meta=off`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      marketdata?: { columns?: string[]; data?: Array<Array<number | string | null>> };
      securities?: { columns?: string[]; data?: Array<Array<number | string | null>> };
    };
    const marketCols = payload.marketdata?.columns ?? [];
    const marketRow = payload.marketdata?.data?.[0] ?? [];
    const secCols = payload.securities?.columns ?? [];
    const secRow = payload.securities?.data?.[0] ?? [];
    const getField = (cols: string[], row: Array<number | string | null>, key: string): number | null => {
      const idx = cols.indexOf(key);
      if (idx === -1) return null;
      const value = row[idx];
      return typeof value === "number" ? value : null;
    };
    const candidates = [
      getField(marketCols, marketRow, "LAST"),
      getField(marketCols, marketRow, "LCURRENTPRICE"),
      getField(marketCols, marketRow, "MARKETPRICE"),
      getField(secCols, secRow, "PREVPRICE"),
    ];
    return candidates.find((v): v is number => typeof v === "number" && v > 0) ?? null;
  } catch {
    return null;
  }
}
