import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Помесячный ИПЦ РФ из ЕМИСС (fedstat.ru): показатель 31074,
 * «Все товары и услуги», РФ, «К предыдущему месяцу», %.
 * Индекс: I_m = I_{m-1} * (1 + p_m/100). Реальная стоимость: nominal / (I_now / I_tx).
 */

const FEDSTAT_INDICATOR_ID = process.env.FEDSTAT_CPI_INDICATOR_ID ?? "31074";
const FEDSTAT_BASE = "https://www.fedstat.ru";
const FETCH_TIMEOUT_MS = Number(process.env.FEDSTAT_FETCH_TIMEOUT_MS ?? 5_000);
const FAILED_RETRY_MS = Number(process.env.FEDSTAT_FAILED_RETRY_MS ?? 1000 * 60 * 30);

const CURL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function curlExe(): string {
  return process.env.CURL_PATH?.trim() || "curl";
}

function curlAvailable(): boolean {
  try {
    execFileSync(curlExe(), ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fedstat отвечает на fetch() HTML-оболочкой без SDMX (сессия Struts/libcurl).
 * Надёжно: один cookie-jar на GET страницы + POST data.do через curl.
 */
function downloadSdmxViaCurl(pageUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pm-fedstat-"));
  const jar = join(dir, "jar.txt");
  const pagePath = join(dir, "page.html");
  const postPath = join(dir, "post.txt");
  const maxTime = String(Math.max(30, Math.floor(FETCH_TIMEOUT_MS / 1000)));
  const ce = curlExe();
  try {
    execFileSync(
      ce,
      [
        "-sS",
        "-L",
        "--http1.1",
        "--max-time",
        maxTime,
        "-c",
        jar,
        "-b",
        jar,
        "-H",
        `User-Agent: ${CURL_UA}`,
        "-o",
        pagePath,
        pageUrl,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    const html = readFileSync(pagePath, "utf8");
    const scraped = scrapeHtmlFilterSlices(html);
    const dataIds = buildSelectedRows(scraped);
    let pairs = buildPostBodyPairs(dataIds);
    const csrf = scrapeStrutsCsrf(html);
    if (csrf) {
      pairs = [
        ["struts.token.name", csrf.tokenParam],
        [csrf.tokenParam, csrf.tokenValue],
        ...pairs,
      ];
    }
    const body = new URLSearchParams();
    for (const [k, v] of pairs) {
      body.append(k, v);
    }
    writeFileSync(postPath, body.toString(), "utf8");

    const xml = execFileSync(
      ce,
      [
        "-sS",
        "-L",
        "--http1.1",
        "--max-time",
        maxTime,
        "-b",
        jar,
        "-c",
        jar,
        "-X",
        "POST",
        "-H",
        "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
        "-H",
        `Referer: ${pageUrl}`,
        "-H",
        `Origin: ${FEDSTAT_BASE}`,
        "-H",
        `User-Agent: ${CURL_UA}`,
        "--data-binary",
        `@${postPath}`,
        "-o",
        "-",
        `${FEDSTAT_BASE}/indicator/data.do?format=sdmx`,
      ],
      { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 }
    );
    return xml;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const STATIC_IDS = {
  indicatorField: "0",
  indicatorValue: FEDSTAT_INDICATOR_ID,
  yearField: "3",
  okatoField: "57831",
  okatoRf: process.env.FEDSTAT_OKATO_RF_VALUE_ID ?? "1688487",
  goodsField: "58273",
  goodsAll: process.env.FEDSTAT_GOODS_ALL_VALUE_ID ?? "1707675",
  periodField: "33560",
  indicatorKindField: "57937",
  kindPrevMonth: process.env.FEDSTAT_KIND_PREV_MONTH_ID ?? "1704142",
  unitField: "30611",
  unitPercent: process.env.FEDSTAT_UNIT_PERCENT_ID ?? "950473",
} as const;

const RU_MONTHS = new Set([
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
]);

/** Резерв, если вёрстка fedstat сменит кавычки/поля (порядок = календарный, см. показатель 31074). */
const FALLBACK_MONTH_VALUE_IDS = (
  process.env.FEDSTAT_MONTH_VALUE_IDS?.split(",").filter(Boolean) ?? [
    "1540283",
    "1540282",
    "1540236",
    "1540229",
    "1540235",
    "1540234",
    "1540233",
    "1540228",
    "1540276",
    "1540273",
    "1540272",
    "1540230",
  ]
) as string[];

function decodeJsStringLiteral(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function extractBalancedObject(html: string, fieldId: string): string {
  const re = new RegExp(`\\b${fieldId}:\\s*\\{`);
  const mi = html.search(re);
  if (mi < 0) throw new Error(`Fedstat: filter field ${fieldId} not found`);
  const braceStart = html.indexOf("{", mi);
  let depth = 0;
  for (let i = braceStart; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Fedstat: unbalanced filter ${fieldId}`);
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  if (signal) {
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      c.abort();
    });
  }
  void (t as unknown as { unref?: () => void }).unref?.();
  return c.signal;
}

/** Без полного парсинга filters (слишком тяжёлый для vm): вырезаем блоки Год и Период из HTML.show */
function scrapeStrutsCsrf(html: string): { tokenParam: string; tokenValue: string } | null {
  const nameField = html.match(/name="struts\.token\.name"\s+value="([^"]+)"/);
  const val = html.match(/<input[^>]+name="token"[^>]*value="([^"]+)"[^>]*\/?>/i);
  if (!nameField || !val) return null;
  return { tokenParam: nameField[1], tokenValue: val[1] };
}

function scrapeHtmlFilterSlices(html: string): { indicatorTitle: string; yearIds: string[]; monthIds: string[] } {
  const titleRe = new RegExp(
    `${FEDSTAT_INDICATOR_ID}:\\s*\\{\\s*title:\\s*'((?:[^'\\\\]|\\\\.)*)'`
  );
  const titleM = titleRe.exec(html);
  let indicatorTitle = "Индексы потребительских цен на товары и услуги";
  if (titleM) {
    indicatorTitle = decodeJsStringLiteral(titleM[1]);
  }

  const yInner = extractBalancedObject(html, STATIC_IDS.yearField);
  const yearIds: string[] = [];
  const yrRe = /\b(19\d{2}|20\d{2}):\s*\{\s*title:\s*'\1'/g;
  let m: RegExpExecArray | null;
  while ((m = yrRe.exec(yInner)) !== null) {
    yearIds.push(m[1]);
  }

  const pInner = extractBalancedObject(html, STATIC_IDS.periodField);
  const moRe =
    /(\d+):\s*\{\s*title:\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")/g;
  const monthIdsSeen = new Set<string>();
  const monthIds: string[] = [];
  while ((m = moRe.exec(pInner)) !== null) {
    const id = m[1];
    const rawTit = m[2] ?? m[3] ?? "";
    const tit = decodeJsStringLiteral(rawTit).toLowerCase().trim();
    if (RU_MONTHS.has(tit) && !monthIdsSeen.has(id)) {
      monthIdsSeen.add(id);
      monthIds.push(id);
    }
  }

  const monthIdsFinal = monthIds.length >= 12 ? monthIds : [...FALLBACK_MONTH_VALUE_IDS];

  const maxYears = Math.max(1, Number(process.env.FEDSTAT_MAX_YEARS ?? 40));
  const yearIdsLimited = yearIds.length > maxYears ? yearIds.slice(-maxYears) : yearIds;

  return { indicatorTitle, yearIds: yearIdsLimited, monthIds: monthIdsFinal };
}

type DataIdRow = {
  filter_field_id: string;
  filter_field_title: string;
  filter_value_id: string;
  filter_value_title: string;
  filter_field_object_ids: "lineObjectIds" | "columnObjectIds";
};

const FIELD_LAYOUT: Record<string, "lineObjectIds" | "columnObjectIds"> = {
  "0": "lineObjectIds",
  "3": "columnObjectIds",
  "33560": "columnObjectIds",
  "57937": "columnObjectIds",
  "57831": "lineObjectIds",
  "58273": "lineObjectIds",
  "30611": "lineObjectIds",
};

function pushRow(rows: DataIdRow[], fieldId: string, valueId: string, valueTitle: string, fieldTitle: string): void {
  const layout = FIELD_LAYOUT[fieldId];
  if (!layout) throw new Error(`Fedstat: no layout for field ${fieldId}`);
  rows.push({
    filter_field_id: fieldId,
    filter_field_title: fieldTitle,
    filter_value_id: valueId,
    filter_value_title: valueTitle,
    filter_field_object_ids: layout,
  });
}

function buildSelectedRows(scraped: ReturnType<typeof scrapeHtmlFilterSlices>): DataIdRow[] {
  const rows: DataIdRow[] = [];
  pushRow(rows, STATIC_IDS.indicatorField, STATIC_IDS.indicatorValue, scraped.indicatorTitle, "Показатель");
  for (const y of scraped.yearIds) {
    pushRow(rows, STATIC_IDS.yearField, y, y, "Год");
  }
  for (const mid of scraped.monthIds) {
    pushRow(rows, STATIC_IDS.periodField, mid, mid, "Период");
  }
  pushRow(rows, STATIC_IDS.okatoField, STATIC_IDS.okatoRf, "Российская Федерация", "ОКАТО");
  pushRow(rows, STATIC_IDS.goodsField, STATIC_IDS.goodsAll, "Все товары и услуги", "Виды товаров и услуг");
  pushRow(rows, STATIC_IDS.indicatorKindField, STATIC_IDS.kindPrevMonth, "К предыдущему месяцу", "Виды показателя");
  pushRow(rows, STATIC_IDS.unitField, STATIC_IDS.unitPercent, "процент", "Единица измерения");
  return rows;
}

/** Пары полей тела POST (в т.ч. повторяющиеся selectedFilterIds) — порядок как в fedstatAPIr. */
function buildPostBodyPairs(dataIds: DataIdRow[]): Array<[string, string]> {
  const ind = dataIds.find((r) => r.filter_field_id === "0");
  if (!ind) throw new Error("Fedstat: indicator row missing");

  const uniqueFieldOrder: string[] = [];
  const seenF = new Set<string>();
  for (const r of dataIds) {
    if (!seenF.has(r.filter_field_id)) {
      seenF.add(r.filter_field_id);
      uniqueFieldOrder.push(r.filter_field_id);
    }
  }

  const pairs: Array<[string, string]> = [
    ["format", "sdmx"],
    ["id", ind.filter_value_id],
    ["indicator_title", ind.filter_value_title],
  ];

  for (const fid of uniqueFieldOrder) {
    const row = dataIds.find((x) => x.filter_field_id === fid);
    if (!row) continue;
    pairs.push([row.filter_field_object_ids, row.filter_field_id]);
  }

  for (const r of dataIds) {
    pairs.push(["selectedFilterIds", `${r.filter_field_id}_${r.filter_value_id}`]);
  }
  return pairs;
}

function parseSdmxObservations(xml: string): Array<{ period: string; value: number }> {
  const out: Array<{ period: string; value: number }> = [];
  const obsRe = /<(?:[\w]+:)?Obs\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = obsRe.exec(xml)) !== null) {
    const tag = m[0];
    const periodM = /\bTIME_PERIOD="([^"]+)"/i.exec(tag);
    const valueM =
      /\bOBS_VALUE="([^"]+)"/i.exec(tag) ?? /\bVALUE="([^"]+)"/i.exec(tag) ?? /\bobsValue="([^"]+)"/i.exec(tag);
    if (!periodM || !valueM) continue;
    const value = Number(valueM[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    out.push({ period: periodM[1], value });
  }
  return out;
}

function fedstatPeriodToMonthKey(period: string): string | null {
  const dot = /^(\d{1,2})\.(\d{4})$/.exec(period.trim());
  if (dot) {
    const mm = dot[1].padStart(2, "0");
    return `${dot[2]}-${mm}`;
  }
  const iso = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(period.trim());
  if (iso) return `${iso[1]}-${iso[2]}`;
  return null;
}

function cumulativeIndexFromMomPercent(sorted: Array<{ key: string; pct: number }>): Record<string, number> {
  let level = 100;
  const byMonth: Record<string, number> = {};
  for (const { key, pct } of sorted) {
    level *= 1 + pct / 100;
    byMonth[key] = level;
  }
  return byMonth;
}

export type FedstatCpiCacheState = {
  updatedAt: number;
  indexByMonth: Record<string, number>;
};

let cache: FedstatCpiCacheState | null = null;
let lastFailedAttemptAt = 0;

/**
 * Ручная подстановка темпов ИПЦ «к предыдущему месяцу», % — если POST ЕМИСС недоступен из вашей сети.
 * Формат JSON: `{ "2024-01": 0.76, "2024-02": ... }` — ключ `YYYY-MM`, значение число (можно с запятой в исходнике не использовать).
 */
function tryLoadMomPercentFromLocalFile(): FedstatCpiCacheState | null {
  const path = process.env.PM_INFLATION_MOM_JSON?.trim();
  if (!path || !existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const mom = JSON.parse(raw) as Record<string, number>;
    const sorted = Object.keys(mom)
      .sort()
      .map((k) => ({ key: k, pct: Number(mom[k]) }))
      .filter((x) => Number.isFinite(x.pct));
    if (sorted.length === 0) return null;
    const indexByMonth = cumulativeIndexFromMomPercent(sorted);
    return { updatedAt: Date.now(), indexByMonth };
  } catch {
    return null;
  }
}

export async function loadFedstatCumulativeCpiIndex(): Promise<FedstatCpiCacheState | null> {
  const now = Date.now();
  const fromDisk = tryLoadMomPercentFromLocalFile();
  if (fromDisk) {
    cache = fromDisk;
    return fromDisk;
  }
  if (cache && now - cache.updatedAt < 1000 * 60 * 60 * 24) {
    return cache;
  }
  if (lastFailedAttemptAt > 0 && now - lastFailedAttemptAt < FAILED_RETRY_MS) {
    return null;
  }

  const ac = new AbortController();
  const signal = withTimeout(ac.signal, FETCH_TIMEOUT_MS);

  try {
    const pageUrl = `${FEDSTAT_BASE}/indicator/${FEDSTAT_INDICATOR_ID}`;
    // IMPORTANT: curl path uses synchronous child_process and can block Node event loop.
    // Keep it opt-in only for environments where this behavior is acceptable.
    const useCurl = process.env.FEDSTAT_USE_CURL === "1" && curlAvailable() && process.env.FEDSTAT_PREFER_FETCH !== "1";

    let xml: string;
    if (useCurl) {
      xml = downloadSdmxViaCurl(pageUrl);
    } else {
      const pageRes = await fetch(pageUrl, {
        signal,
        headers: { Accept: "text/html,*/*", "User-Agent": CURL_UA },
      });
      if (!pageRes.ok) throw new Error(`Fedstat page ${pageRes.status}`);
      const html = await pageRes.text();
      const scraped = scrapeHtmlFilterSlices(html);
      const dataIds = buildSelectedRows(scraped);
      let pairs = buildPostBodyPairs(dataIds);
      const csrf = scrapeStrutsCsrf(html);
      if (csrf) {
        pairs = [
          ["struts.token.name", csrf.tokenParam],
          [csrf.tokenParam, csrf.tokenValue],
          ...pairs,
        ];
      }
      const body = new URLSearchParams();
      for (const [k, v] of pairs) {
        body.append(k, v);
      }
      const setRaw = typeof pageRes.headers.getSetCookie === "function" ? pageRes.headers.getSetCookie() : [];
      const cookieHdr = setRaw.map((line) => line.split(";")[0].trim()).filter(Boolean).join("; ");
      const postRes = await fetch(`${FEDSTAT_BASE}/indicator/data.do?format=sdmx`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "text/xml, application/xml, */*",
          Referer: pageUrl,
          Origin: FEDSTAT_BASE,
          ...(cookieHdr ? { Cookie: cookieHdr } : {}),
          "User-Agent": CURL_UA,
        },
        body,
      });
      xml = await postRes.text();
      if (!postRes.ok) throw new Error(`Fedstat data.do HTTP ${postRes.status} ${xml.slice(0, 120)}`);
    }

    if (!xml.includes("Obs")) {
      const title = /<title>([^<]*)<\/title>/i.exec(xml)?.[1]?.trim();
      throw new Error(`Fedstat: SDMX Obs not found title=${title ?? "?"} snippet=${xml.slice(0, 160)}`);
    }

    const obs = parseSdmxObservations(xml);
    const lastByMonth = new Map<string, number>();
    for (const { period, value } of obs) {
      const key = fedstatPeriodToMonthKey(period);
      if (!key) continue;
      lastByMonth.set(key, value);
    }

    const sortedKeys = [...lastByMonth.keys()].sort();
    const momSeries = sortedKeys.map((key) => ({ key, pct: lastByMonth.get(key)! }));
    const indexByMonth = cumulativeIndexFromMomPercent(momSeries);

    if (Object.keys(indexByMonth).length === 0) {
      throw new Error("Fedstat: no month keys parsed from SDMX");
    }

    cache = { updatedAt: now, indexByMonth };
    return cache;
  } catch (e) {
    lastFailedAttemptAt = Date.now();
    if (process.env.FEDSTAT_DEBUG === "1") {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[fedstatCpi]", msg.slice(0, 500));
    }
    return null;
  }
}

export function indexForMonth(indexByMonth: Record<string, number>, d: Date): number | null {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const key = `${y}-${String(m).padStart(2, "0")}`;
  if (indexByMonth[key] != null) return indexByMonth[key];
  for (let back = 1; back <= 48; back += 1) {
    const d2 = new Date(Date.UTC(y, m - 1 - back, 15));
    const k2 = `${d2.getUTCFullYear()}-${String(d2.getUTCMonth() + 1).padStart(2, "0")}`;
    if (indexByMonth[k2] != null) return indexByMonth[k2];
  }
  return null;
}
