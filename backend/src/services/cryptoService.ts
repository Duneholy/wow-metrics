const cryptoPerfCache = new Map<string, { updatedAt: number; value: number | null }>();
const cryptoChartCache = new Map<string, { updatedAt: number; points: Array<{ ts: number; price: number }> }>();
const cryptoPriceCache = new Map<string, { updatedAt: number; usd: number; rub: number }>();
let fxCache: { updatedAt: number; usdToRub: number } | null = null;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cryptoPerfCache.entries()) if (now - v.updatedAt > 1000 * 60 * 60 * 24) cryptoPerfCache.delete(k);
  for (const [k, v] of cryptoChartCache.entries()) if (now - v.updatedAt > 1000 * 60 * 60 * 24) cryptoChartCache.delete(k);
  for (const [k, v] of cryptoPriceCache.entries()) if (now - v.updatedAt > 1000 * 60 * 5) cryptoPriceCache.delete(k);
}, 1000 * 60 * 60).unref();

export function resolveCoingeckoId(coingeckoId?: string): string {
  const normalizedKey = (coingeckoId ?? "").trim().toLowerCase();
  const aliasMap: Record<string, string> = {
    eth: "ethereum",
    ethereum: "ethereum",
    ton: "the-open-network",
    "the-open-network": "the-open-network",
    btc: "bitcoin",
    bitcoin: "bitcoin",
    usdc: "usd-coin",
    usdt: "tether",
  };
  return aliasMap[normalizedKey] ?? normalizedKey;
}

export async function getUsdToRubRate(): Promise<number> {
  const now = Date.now();
  if (fxCache && now - fxCache.updatedAt < 1000 * 60 * 30) return fxCache.usdToRub;
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error("FX request failed");
    const payload = (await response.json()) as { rates?: { RUB?: number } };
    const rate = payload?.rates?.RUB;
    if (typeof rate === "number" && rate > 0) {
      fxCache = { updatedAt: now, usdToRub: rate };
      return rate;
    }
  } catch {
    // fallback below
  }
  return fxCache?.usdToRub ?? 90;
}

export async function prefetchCryptoPrices(resolvedIds: string[], apiKey?: string | null): Promise<void> {
  const missing = resolvedIds.filter(id => {
    const cached = cryptoPriceCache.get(id);
    return !cached || Date.now() - cached.updatedAt > 1000 * 60 * 5;
  });
  if (missing.length === 0) return;

  const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd,rub&ids=${encodeURIComponent(missing.join(","))}`;
  const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
  let success = false;
  let attempts = 0;

  while (!success && attempts < 2) {
    attempts++;
    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const payload = (await response.json()) as Record<string, { usd?: number; rub?: number }>;
        const now = Date.now();
        for (const id of missing) {
          const usdPrice = payload?.[id]?.usd;
          const rubPrice = payload?.[id]?.rub;
          if (typeof usdPrice === "number" && typeof rubPrice === "number" && usdPrice >= 0 && rubPrice >= 0) {
            cryptoPriceCache.set(id, { updatedAt: now, usd: usdPrice, rub: rubPrice });
          }
        }
        success = true;
      } else {
        if (attempts < 2) await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      if (attempts < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
}

export async function getCryptoUnitPriceUsd(resolvedId: string, apiKey?: string | null): Promise<number | null> {
  if (!resolvedId) return null;
  const cached = cryptoPriceCache.get(resolvedId);
  if (cached && Date.now() - cached.updatedAt < 1000 * 60 * 5) return cached.usd;

  const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd,rub&ids=${encodeURIComponent(resolvedId)}`;
  const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
  try {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const payload = (await response.json()) as Record<string, { usd?: number; rub?: number }>;
      const usdPrice = payload?.[resolvedId]?.usd;
      const rubPrice = payload?.[resolvedId]?.rub;
      if (typeof usdPrice === "number" && typeof rubPrice === "number" && usdPrice >= 0 && rubPrice >= 0) {
        cryptoPriceCache.set(resolvedId, { updatedAt: Date.now(), usd: usdPrice, rub: rubPrice });
        return usdPrice;
      }
    }
  } catch (e) {}
  return null;
}

export async function getCryptoUnitPriceRub(coingeckoId?: string, apiKey?: string | null): Promise<number | null> {
  if (!coingeckoId) return null;
  const resolvedId = resolveCoingeckoId(coingeckoId);
  const cached = cryptoPriceCache.get(resolvedId);
  if (cached && Date.now() - cached.updatedAt < 1000 * 60 * 5) return cached.rub;

  const url = `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd,rub&ids=${encodeURIComponent(resolvedId)}`;
  const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
  try {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const payload = (await response.json()) as Record<string, { usd?: number; rub?: number }>;
      const usdPrice = payload?.[resolvedId]?.usd;
      const rubPrice = payload?.[resolvedId]?.rub;
      if (typeof usdPrice === "number" && typeof rubPrice === "number" && usdPrice >= 0 && rubPrice >= 0) {
        cryptoPriceCache.set(resolvedId, { updatedAt: Date.now(), usd: usdPrice, rub: rubPrice });
        return rubPrice;
      }
    }
  } catch (e) {}
  return null;
}

export function formatCgHistoryDate(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = String(date.getUTCFullYear());
  return `${d}-${m}-${y}`;
}

export function getCryptoCompareSymbols(resolvedId: string): string[] {
  const map: Record<string, string[]> = {
    bitcoin: ["BTC"],
    ethereum: ["ETH"],
    "the-open-network": ["TON", "TONCOIN"],
    tether: ["USDT"],
    "usd-coin": ["USDC"],
    binancecoin: ["BNB"],
    ripple: ["XRP"],
    cardano: ["ADA"],
    solana: ["SOL"],
    dogecoin: ["DOGE"],
    tron: ["TRX"],
  };
  return map[resolvedId] ?? [];
}

export async function getCryptoHistoricalUsdFromCryptocompare(resolvedId: string, daysAgo: number): Promise<number | null> {
  const symbols = getCryptoCompareSymbols(resolvedId);
  if (symbols.length === 0) return null;
  const toTs = Math.floor(Date.now() / 1000) - daysAgo * 24 * 60 * 60;
  for (const symbol of symbols) {
    const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${encodeURIComponent(symbol)}&tsym=USD&limit=1&toTs=${toTs}`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        Response?: string;
        Message?: string;
        Data?: { Data?: Array<{ close?: number }> };
      };
      if (payload.Response === "Error") continue;
      const row = payload.Data?.Data?.[0];
      const close = row?.close;
      if (typeof close === "number" && close > 0) return close;
    } catch {
      // try next symbol
    }
  }
  return null;
}

export async function getCryptoHistoricalUsd(
  resolvedId: string,
  daysAgo: number,
  apiKey?: string | null
): Promise<number | null> {
  if (!resolvedId) return null;
  const target = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const dateKey = formatCgHistoryDate(target);
  const cacheKey = `${resolvedId}:${dateKey}`;
  const cached = cryptoPerfCache.get(cacheKey);
  if (cached && cached.value !== null && Date.now() - cached.updatedAt < 1000 * 60 * 60 * 6) {
    return cached.value;
  }
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(resolvedId)}/history?date=${dateKey}&localization=false`;
  const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      cryptoPerfCache.set(cacheKey, { updatedAt: Date.now(), value: null });
      return null;
    }
    const payload = (await response.json()) as {
      market_data?: { current_price?: { usd?: number } };
    };
    const value = payload.market_data?.current_price?.usd;
    let parsed = typeof value === "number" && value > 0 ? value : null;
    if (parsed === null) {
      parsed = await getCryptoHistoricalUsdFallback(resolvedId, daysAgo, apiKey);
    }
    cryptoPerfCache.set(cacheKey, { updatedAt: Date.now(), value: parsed });
    return parsed;
  } catch {
    const fallback = await getCryptoHistoricalUsdFallback(resolvedId, daysAgo, apiKey);
    cryptoPerfCache.set(cacheKey, { updatedAt: Date.now(), value: fallback });
    return fallback;
  }
}

export async function getCryptoHistoricalUsdFromChart(resolvedId: string, daysAgo: number, apiKey?: string | null): Promise<number | null> {
  if (!resolvedId) return null;
  const cached = cryptoChartCache.get(resolvedId);
  if (!cached || Date.now() - cached.updatedAt > 1000 * 60 * 60 * 24) {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(resolvedId)}/market_chart?vs_currency=usd&days=max`;
    const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) return null;
      const payload = (await response.json()) as { prices?: Array<[number, number]> };
      const points = (payload.prices ?? [])
        .filter((entry) => Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "number")
        .map((entry) => ({ ts: entry[0], price: entry[1] }))
        .filter((entry) => entry.price > 0);
      cryptoChartCache.set(resolvedId, { updatedAt: Date.now(), points });
    } catch {
      return null;
    }
  }
  const points = cryptoChartCache.get(resolvedId)?.points ?? [];
  if (points.length === 0) return null;
  const targetTs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  let best: { delta: number; price: number } | null = null;
  for (const point of points) {
    const delta = Math.abs(point.ts - targetTs);
    if (!best || delta < best.delta) best = { delta, price: point.price };
  }
  return best?.price ?? null;
}

export async function getCryptoHistoricalUsdFallback(resolvedId: string, daysAgo: number, apiKey?: string | null): Promise<number | null> {
  const chartPrice = await getCryptoHistoricalUsdFromChart(resolvedId, daysAgo, apiKey);
  if (chartPrice !== null) return chartPrice;
  return getCryptoHistoricalUsdFromCryptocompare(resolvedId, daysAgo);
}

export async function getCryptoHistoricalUsdFromBinance(symbol: string, daysAgo: number): Promise<number | null> {
  const targetTime = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const startTime = targetTime - 3 * 24 * 60 * 60 * 1000;
  const endTime = targetTime + 3 * 24 * 60 * 60 * 1000;
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=10`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as Array<[number, string, string, string, string]>;
    if (!Array.isArray(payload) || payload.length === 0) return null;
    let best: { delta: number; close: number } | null = null;
    for (const row of payload) {
      const openTime = Number(row?.[0]);
      const close = Number(row?.[4]);
      if (!Number.isFinite(openTime) || !Number.isFinite(close) || close <= 0) continue;
      const delta = Math.abs(openTime - targetTime);
      if (!best || delta < best.delta) best = { delta, close };
    }
    return best?.close ?? null;
  } catch {
    return null;
  }
}
