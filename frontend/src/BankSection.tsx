import React, { useState, useEffect, useRef, useMemo } from "react";
import type { FormEvent } from "react";
import type { 
  AssetCategory, BankSortKey, CryptoPerfItem, StockPerfItem, 
  CryptoTxKind, CryptoTransaction, Asset, AssetFormState, DashboardPayload, User
} from "../../shared/types";
import { 
  CATEGORY_ICON_URLS, WOWHEAD_ICON_BASE, amountToCoins, amountToSignedCoins,
  cryptoCostBasisRub, depositCostBasisRub, stockCostBasisRub,
  stockInflationAdjustedCostBasisRub, taxedDepositProfitRub, nominalProfitRub,
  profitInflationRub, getBankSortValue, assetToForm, formatAssetDate,
  txDateToInput, inputDateToIso, parseAssetCategorySelect
} from "./bankUtils";
import { BankField } from "./BankField";

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
export function BankSection({
  dashboard, setDashboard, request, loadDashboard, token, setError, openConfirmDialog, resolveConfirmDialog
}: { dashboard: DashboardPayload | null, setDashboard: any, request: RequestFn, loadDashboard: (opts?: any) => Promise<DashboardPayload | undefined>, token: string | null, setError: (e: string|null) => void, openConfirmDialog: any, resolveConfirmDialog: any }) {
  const [bankFilter, setBankFilter] = useState<AssetCategory | "ALL">("ALL");
  const [bankSort, setBankSort] = useState<BankSortKey>("name");
  const [bankSortDir, setBankSortDir] = useState<"asc" | "desc">("asc");
  const [bankPage, setBankPage] = useState(0);
  const [cryptoPerf, setCryptoPerf] = useState<Record<string, CryptoPerfItem>>({});
  const [stockPerf, setStockPerf] = useState<Record<string, StockPerfItem>>({});
  const [iconQuery, setIconQuery] = useState("");
  const [iconResults, setIconResults] = useState<string[]>([]);
  const [iconLoading, setIconLoading] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconOffset, setIconOffset] = useState(0);
  const [iconHasMore, setIconHasMore] = useState(true);
  const [assetModal, setAssetModal] = useState<{ mode: "add" | "edit"; assetId?: string } | null>(null);
  const [cryptoTxModalOpen, setCryptoTxModalOpen] = useState(false);
  const [cryptoTxAssetId, setCryptoTxAssetId] = useState<string | null>(null);
  const [cryptoTxList, setCryptoTxList] = useState<CryptoTransaction[]>([]);
  const [cryptoTxLoading, setCryptoTxLoading] = useState(false);
  const [newTxType, setNewTxType] = useState<CryptoTxKind>("BUY");
  const [newTxDate, setNewTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTxQty, setNewTxQty] = useState("");
  const [newTxRub, setNewTxRub] = useState("");
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxType, setEditTxType] = useState<CryptoTxKind>("BUY");
  const [editTxDate, setEditTxDate] = useState("");
  const [editTxQty, setEditTxQty] = useState("");
  const [editTxRub, setEditTxRub] = useState("");
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  
  const [assetForm, setAssetForm] = useState<AssetFormState>({
    name: "",
    category: "DEPOSIT",
    quantity: "1",
    manualValueRub: "",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    ticker: "",
    coingeckoId: "bitcoin",
    depositRateAnnual: "",
    depositCloseDate: new Date().toISOString().slice(0, 10),
    taxProfitPercent: "",
    iconName: "",
    purchaseCostRub: "",
    expectedPriceRub: "",
  });

  

  useEffect(() => {
    if (!expandedAssetId || editingAssetId) return;
    const asset = dashboard?.assets.find((a: Asset) => a.id === expandedAssetId);
    if (asset) setAssetForm(assetToForm(asset));
  }, [dashboard?.assets, expandedAssetId, editingAssetId]);

  
  useEffect(() => {
    if (!iconPickerOpen) return;
    const query = iconQuery.trim();
    const timer = setTimeout(() => {
      setIconLoading(true);
      void request<{ items: string[]; hasMore?: boolean; nextOffset?: number }>(
        `/wow-icons/search?q=${encodeURIComponent(query)}&limit=120&offset=0`
      )
        .then((data) => {
          setIconResults(data.items ?? []);
          setIconHasMore(Boolean(data.hasMore));
          setIconOffset(data.nextOffset ?? (data.items?.length ?? 0));
        })
        .catch(() => {
          setIconResults([]);
          setIconHasMore(false);
          setIconOffset(0);
        })
        .finally(() => setIconLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [iconPickerOpen, iconQuery]);

  useEffect(() => {
    if (!token || false || bankFilter !== "CRYPTO") return;
    const ids = [...new Set((dashboard?.assets ?? [])
      .filter((asset: Asset) => asset.category === "CRYPTO" && asset.coingeckoId)
      .map((asset: Asset) => String(asset.coingeckoId).trim().toLowerCase())
      .filter(Boolean))];
    if (ids.length === 0) {
      setCryptoPerf({});
      return;
    }
    const fingerprint = (dashboard?.assets ?? [])
      .filter((asset: Asset) => asset.category === "CRYPTO")
      .map((asset: Asset) => `${asset.id}:${asset.quantity}`)
      .sort()
      .join("|");
    void request<{ items: Record<string, CryptoPerfItem> }>(
      `/crypto/performance?ids=${encodeURIComponent(ids.join(","))}&fingerprint=${encodeURIComponent(fingerprint)}`
    )
      .then((payload) => {
        const next = payload?.items ?? {};
        setCryptoPerf((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      })
      .catch(() => setCryptoPerf({}));
  }, [token, bankFilter, dashboard?.assets]);

  useEffect(() => {
    if (!token || false || bankFilter !== "STOCK") return;
    const tickers = [...new Set((dashboard?.assets ?? [])
      .filter((asset: Asset) => asset.category === "STOCK" && asset.ticker)
      .map((asset: Asset) => String(asset.ticker).trim().toUpperCase())
      .filter(Boolean))];
    if (tickers.length === 0) {
      setStockPerf({});
      return;
    }
    const fingerprint = (dashboard?.assets ?? [])
      .filter((asset: Asset) => asset.category === "STOCK")
      .map((asset: Asset) => `${asset.id}:${asset.quantity}`)
      .sort()
      .join("|");
    void request<{ items: Record<string, StockPerfItem> }>(
      `/stocks/performance?tickers=${encodeURIComponent(tickers.join(","))}&fingerprint=${encodeURIComponent(fingerprint)}`
    )
      .then((payload) => {
        const next = payload?.items ?? {};
        setStockPerf((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      })
      .catch(() => setStockPerf({}));
  }, [token, bankFilter, dashboard?.assets]);

  

  function openAddAssetModal() {
    const category = bankFilter === "ALL" ? assetForm.category : bankFilter;
    setAssetForm({
      name: "",
      category,
      quantity: category === "CRYPTO" || category === "STOCK" ? "0" : "1",
      manualValueRub: "",
      acquisitionDate: new Date().toISOString().slice(0, 10),
      ticker: "",
      coingeckoId: category === "CRYPTO" ? "" : "bitcoin",
      depositRateAnnual: "",
      depositCloseDate: new Date().toISOString().slice(0, 10),
      taxProfitPercent: "",
      iconName: "",
      purchaseCostRub: "",
      expectedPriceRub: "",
    });
    setIconQuery("");
    setIconResults([]);
    setAssetModal({ mode: "add" });
  }

  function closeAssetView() {
    setExpandedAssetId(null);
    setEditingAssetId(null);
  }

  function openAssetInlineEditor(asset: Asset) {
    if (expandedAssetId === asset.id) {
      closeAssetView();
      return;
    }
    setAssetForm(assetToForm(asset));
    setIconQuery(asset.iconName ?? "");
    setIconResults([]);
    setExpandedAssetId(asset.id);
    setEditingAssetId(null);
  }

  function startAssetEdit() {
    if (expandedAssetId) setEditingAssetId(expandedAssetId);
  }

  function cancelAssetEdit() {
    const asset = dashboard?.assets.find((a: Asset) => a.id === expandedAssetId);
    if (asset) setAssetForm(assetToForm(asset));
    setEditingAssetId(null);
  }

  function buildTransactionDraftPayload(category: "CRYPTO" | "STOCK"): Record<string, unknown> {
    const raw = assetForm.ticker.trim();
    return {
      name: assetForm.name.trim(),
      category,
      quantity: 0,
      ticker: raw.toUpperCase(),
      coingeckoId: category === "CRYPTO" ? raw.toLowerCase() : null,
      iconName: assetForm.iconName.trim() || null,
      purchaseCostRub: null,
    };
  }

  function buildAssetPayload(form: AssetFormState): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category,
      quantity: Number(form.quantity || "1"),
      iconName: form.iconName.trim() || null,
      purchaseCostRub: form.purchaseCostRub.trim() ? Number(form.purchaseCostRub) : null,
    };
    if (form.category === "CRYPTO") {
      const raw = form.ticker.trim() || form.coingeckoId.trim();
      payload.ticker = raw.toUpperCase();
      payload.coingeckoId = raw.toLowerCase();
      payload.quantity = Number(form.quantity || "0");
      payload.purchaseCostRub = null;
    } else if (form.category === "STOCK") {
      payload.ticker = form.ticker.trim().toUpperCase();
      payload.quantity = Number(form.quantity || "0");
      payload.purchaseCostRub = null;
    } else if (form.category === "DEPOSIT") {
      payload.manualValueRub = Number(form.manualValueRub || "0");
      payload.acquisitionDate = form.acquisitionDate;
      payload.depositRateAnnual = Number(form.depositRateAnnual || "0");
      payload.depositCloseDate = form.depositCloseDate;
      payload.taxProfitPercent = Number(form.taxProfitPercent || "0");
    } else {
      payload.manualValueRub = Number(form.manualValueRub || "0");
      payload.acquisitionDate = form.acquisitionDate;
      payload.expectedPriceRub = form.expectedPriceRub.trim() ? Number(form.expectedPriceRub) : null;
    }
    return payload;
  }

  async function submitAssetModal() {
    if (!assetForm.name.trim()) return;
    if ((assetForm.category === "CRYPTO" || assetForm.category === "STOCK") && !assetForm.ticker.trim()) {
      setError("Enter a ticker");
      return;
    }
    setError(null);
    try {
      const payload = buildAssetPayload(assetForm);
      if (assetModal?.mode === "edit" && assetModal.assetId) {
        await request(`/assets/${assetModal.assetId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await request("/assets", { method: "POST", body: JSON.stringify(payload) });
      }
      setAssetModal(null);
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function submitInlineAssetEditor() {
    if (!expandedAssetId || !assetForm.name.trim()) return;
    if ((assetForm.category === "CRYPTO" || assetForm.category === "STOCK") && !assetForm.ticker.trim()) {
      setError("Enter a ticker");
      return;
    }
    setError(null);
    try {
      const payload = buildAssetPayload(assetForm);
      await request(`/assets/${expandedAssetId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditingAssetId(null);
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function deleteInlineAssetEditor() {
    if (!expandedAssetId) return;
    const ok = await openConfirmDialog("Delete this asset? This cannot be undone.");
    if (!ok) return;
    await request(`/assets/${expandedAssetId}`, { method: "DELETE" });
    closeAssetView();
    await loadDashboard();
  }

  function closeCryptoTxModal() {
    setCryptoTxModalOpen(false);
    setCryptoTxAssetId(null);
    setCryptoTxList([]);
    setEditingTxId(null);
    setNewTxType("BUY");
    setNewTxDate(new Date().toISOString().slice(0, 10));
    setNewTxQty("");
    setNewTxRub("");
  }

  async function loadCryptoTxs(assetId: string) {
    setCryptoTxLoading(true);
    setError(null);
    try {
      const list = await request<CryptoTransaction[]>(`/assets/${assetId}/transactions`);
      setCryptoTxList(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
    } finally {
      setCryptoTxLoading(false);
    }
  }

  async function afterCryptoTxMutation(assetId: string) {
    await loadCryptoTxs(assetId);
    const data = await loadDashboard({ silent: true });
    const refreshed = data?.assets.find((a: Asset) => a.id === assetId);
    if (refreshed && expandedAssetId === assetId) {
      setAssetForm((p: any) => ({ ...p, quantity: String(refreshed.quantity) }));
    }
  }

  async function handleOpenCryptoTransactions() {
    setError(null);
    if (assetModal && (assetForm.category === "CRYPTO" || assetForm.category === "STOCK")) {
      if (assetModal.mode === "edit" && assetModal.assetId) {
        setCryptoTxAssetId(assetModal.assetId);
        setCryptoTxModalOpen(true);
        await loadCryptoTxs(assetModal.assetId);
        return;
      }
      if (assetModal.mode === "add") {
        if (!assetForm.name.trim() || !assetForm.ticker.trim()) {
          setError("Enter name and ticker before opening transactions");
          return;
        }
        try {
          const created = await request<Asset>("/assets", {
            method: "POST",
            body: JSON.stringify(buildTransactionDraftPayload(assetForm.category)),
          });
          setAssetModal({ mode: "edit", assetId: created.id });
          setCryptoTxAssetId(created.id);
          setCryptoTxModalOpen(true);
          await loadDashboard();
          await loadCryptoTxs(created.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not create asset draft");
        }
        return;
      }
    }
    if (expandedAssetId && (assetForm.category === "CRYPTO" || assetForm.category === "STOCK")) {
      setCryptoTxAssetId(expandedAssetId);
      setCryptoTxModalOpen(true);
      await loadCryptoTxs(expandedAssetId);
    }
  }

  async function submitNewCryptoTx() {
    if (!cryptoTxAssetId) return;
    const q = Number(newTxQty);
    const r = Number(newTxRub);
    const isDividend = newTxType === "DIVIDEND";
    const qtyOk = isDividend ? true : (Number.isFinite(q) && q > 0);
    if (!qtyOk || !Number.isFinite(r) || r < 0) {
      setError("Enter a positive quantity and a non-negative amount in RUB");
      return;
    }
    setError(null);
    try {
      await request(`/assets/${cryptoTxAssetId}/transactions`, {
        method: "POST",
        body: JSON.stringify({
          type: newTxType,
          executedAt: inputDateToIso(newTxDate),
          quantity: isDividend ? 0 : q,
          totalRub: r,
        }),
      });
      setNewTxQty("");
      setNewTxRub("");
      await afterCryptoTxMutation(cryptoTxAssetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add transaction");
    }
  }

  function beginEditTx(tx: CryptoTransaction) {
    setEditingTxId(tx.id);
    setEditTxType(tx.type);
    setEditTxDate(txDateToInput(tx.executedAt));
    setEditTxQty(tx.type === "DIVIDEND" ? "0" : String(tx.quantity));
    setEditTxRub(String(tx.totalRub));
  }

  function cancelEditTx() {
    setEditingTxId(null);
  }

  async function saveEditCryptoTx() {
    if (!editingTxId || !cryptoTxAssetId) return;
    const q = Number(editTxQty);
    const r = Number(editTxRub);
    const isDividend = editTxType === "DIVIDEND";
    const qtyOk = isDividend ? true : (Number.isFinite(q) && q > 0);
    if (!qtyOk || !Number.isFinite(r) || r < 0) {
      setError("Check quantity and amount");
      return;
    }
    setError(null);
    try {
      await request(`/transactions/${editingTxId}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: editTxType,
          executedAt: inputDateToIso(editTxDate),
          quantity: isDividend ? 0 : q,
          totalRub: r,
        }),
      });
      setEditingTxId(null);
      await afterCryptoTxMutation(cryptoTxAssetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save transaction");
    }
  }

  async function removeCryptoTx(txId: string) {
    const ok = await openConfirmDialog("Delete this transaction? This cannot be undone.");
    if (!ok) return;
    if (!cryptoTxAssetId) return;
    setError(null);
    try {
      await request(`/transactions/${txId}`, { method: "DELETE" });
      await afterCryptoTxMutation(cryptoTxAssetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete transaction");
    }
  }

  function toggleBankSort(column: BankSortKey) {
    if (bankSort === column) {
      setBankSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setBankSort(column);
    setBankSortDir("asc");
  }

  function getAssetIconUrl(asset: Asset): string {
    if (asset.iconName && asset.iconName.trim()) {
      return `${WOWHEAD_ICON_BASE}/${asset.iconName.trim().toLowerCase()}.png`;
    }
    if (asset.category === "CRYPTO") return `${WOWHEAD_ICON_BASE}/inv_misc_coin_17.png`;
    if (asset.category === "STOCK") return `${WOWHEAD_ICON_BASE}/inv_misc_pocketwatch_01.png`;
    if (asset.category === "DEPOSIT") return `${WOWHEAD_ICON_BASE}/inv_jewelry_talisman_03.png`;
    return CATEGORY_ICON_URLS.NON_FINANCIAL;
  }

  function getAssetValueColorClass(valueRub: number, user?: User | null): string {
    const purple = user?.assetColorPurpleThreshold ?? 300000;
    const blue = user?.assetColorBlueThreshold ?? 150000;
    const green = user?.assetColorGreenThreshold ?? 50000;
    if (valueRub >= purple) return "asset-value-epic";
    if (valueRub >= blue) return "asset-value-rare";
    if (valueRub >= green) return "asset-value-uncommon";
    return "asset-value-common";
  }

  function formatPct(value: number | null | undefined): string {
    if (typeof value !== "number" || Number.isNaN(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }

  function resolveCryptoPerfKey(raw?: string | null): string {
    const key = String(raw ?? "").trim().toLowerCase();
    if (key === "ton" || key.includes("ton")) return "the-open-network";
    if (key === "eth") return "ethereum";
    if (key === "btc") return "bitcoin";
    return key;
  }

  function resolveStockPerfKey(raw?: string | null): string {
    return String(raw ?? "").trim().toUpperCase();
  }

  const currentTxAssetCategory = useMemo<AssetCategory | null>(() => {
    if (!cryptoTxAssetId) return null;
    return (dashboard?.assets ?? []).find((a: Asset) => a.id === cryptoTxAssetId)?.category ?? null;
  }, [cryptoTxAssetId, dashboard?.assets]);
  const currentTxSupportsDividends = currentTxAssetCategory === "STOCK";

  useEffect(() => {
    if (!currentTxSupportsDividends && newTxType === "DIVIDEND") setNewTxType("BUY");
    if (!currentTxSupportsDividends && editTxType === "DIVIDEND") setEditTxType("BUY");
  }, [currentTxSupportsDividends, newTxType, editTxType]);

  useEffect(() => {
    if (newTxType === "DIVIDEND" && !newTxQty.trim()) setNewTxQty("0");
  }, [newTxType, newTxQty]);

  function txTypeLabel(type: CryptoTxKind): string {
    if (type === "BUY") return "Buy";
    if (type === "SELL") return "Sell";
    return "Dividends";
  }

  async function loadMoreIcons() {
    if (!iconPickerOpen || iconLoading || !iconHasMore) return;
    setIconLoading(true);
    try {
      const data = await request<{ items: string[]; hasMore?: boolean; nextOffset?: number }>(
        `/wow-icons/search?q=${encodeURIComponent(iconQuery.trim())}&limit=120&offset=${iconOffset}`
      );
      setIconResults((prev) => [...prev, ...(data.items ?? [])]);
      setIconHasMore(Boolean(data.hasMore));
      setIconOffset(data.nextOffset ?? iconOffset);
    } catch {
      setIconHasMore(false);
    } finally {
      setIconLoading(false);
    }
  }

  const unreadCount = dashboard?.notifications.length ?? 0;
  const totalMoneyCoins = amountToCoins(dashboard?.totalMoneyRub ?? 0);
  const categoryTotals = useMemo(() => {
    const totals: Record<AssetCategory, number> = {
      DEPOSIT: 0,
      STOCK: 0,
      CRYPTO: 0,
      NON_FINANCIAL: 0,
    };
    for (const asset of dashboard?.assets ?? []) {
      totals[asset.category] += asset.currentValueRub;
    }
    return totals;
  }, [dashboard?.assets]);
  const filteredAssets = useMemo(() => {
    const scoped = (dashboard?.assets ?? []).filter((asset: Asset) => bankFilter === "ALL" || asset.category === bankFilter);
    const groupOf = (n: number): 0 | 1 | 2 => {
      if (!Number.isFinite(n)) return 2;
      return n >= 0 ? 0 : 1;
    };
    const profitLikeColumns: BankSortKey[] = [
      "profit",
      "profitInflation",
      "expectedPriceRub",
      "expectedProfitInflation",
    ];
    const isProfitLike = profitLikeColumns.includes(bankSort);
    const sorted = [...scoped].sort((a, b) => {
      const left = getBankSortValue(a, bankSort);
      const right = getBankSortValue(b, bankSort);
      if (typeof left === "number" && typeof right === "number") {
        const lg = groupOf(left);
        const rg = groupOf(right);
        if (lg !== rg) {
          return bankSortDir === "asc" ? lg - rg : rg - lg;
        }
        if (lg === 2) return 0;
        if (isProfitLike) {
          return bankSortDir === "asc" ? right - left : left - right;
        }
        return bankSortDir === "asc" ? left - right : right - left;
      }
      const lv = String(left ?? "");
      const rv = String(right ?? "");
      return bankSortDir === "asc" ? lv.localeCompare(rv) : rv.localeCompare(lv);
    });
    return sorted;
  }, [dashboard?.assets, bankFilter, bankSort, bankSortDir]);
  const BANK_PAGE_SIZE = 15;
  const bankPageCount = Math.max(1, Math.ceil(filteredAssets.length / BANK_PAGE_SIZE));
  const bankSortSig = `${bankFilter}|${bankSort}|${bankSortDir}`;
  const [lastBankSortSig, setLastBankSortSig] = useState(bankSortSig);
  let effectiveBankPage = bankPage;
  if (lastBankSortSig !== bankSortSig) {
    setLastBankSortSig(bankSortSig);
    if (bankPage !== 0) setBankPage(0);
    effectiveBankPage = 0;
  }
  const safeBankPage = Math.min(Math.max(effectiveBankPage, 0), bankPageCount - 1);
  const pagedAssets = useMemo(
    () => filteredAssets.slice(safeBankPage * BANK_PAGE_SIZE, safeBankPage * BANK_PAGE_SIZE + BANK_PAGE_SIZE),
    [filteredAssets, safeBankPage],
  );
  useEffect(() => {
    if (bankPage > bankPageCount - 1) setBankPage(bankPageCount - 1);
  }, [bankPage, bankPageCount]);
  const isCryptoOnlyView = bankFilter === "CRYPTO";
  const isStockOnlyView = bankFilter === "STOCK";
  const isDepositOnlyView = bankFilter === "DEPOSIT";
  const isOtherOnlyView = bankFilter === "NON_FINANCIAL";
  const isTransactionAssetOnlyView = isCryptoOnlyView || isStockOnlyView;
  const selectedCategoryTotalRub = useMemo(() => {
    if (bankFilter === "ALL") return dashboard?.totalMoneyRub ?? 0;
    return categoryTotals[bankFilter] ?? 0;
  }, [bankFilter, dashboard?.totalMoneyRub, categoryTotals]);
  const selectedCategoryInflationProfitRub = useMemo(() => {
    const scoped = bankFilter === "ALL"
      ? (dashboard?.assets ?? [])
      : (dashboard?.assets ?? []).filter((asset: Asset) => asset.category === bankFilter);
    return scoped.reduce((sum: number, asset: Asset) => {
      if (asset.category === "NON_FINANCIAL") return sum;
      if (asset.category === "DEPOSIT") {
        const raw = asset.inflationAdjustedRub - depositCostBasisRub(asset);
        return sum + taxedDepositProfitRub(asset, raw);
      }
      if (asset.category === "CRYPTO") {
        return sum + (asset.inflationAdjustedRub - cryptoCostBasisRub(asset));
      }
      if (asset.category === "STOCK") {
        return sum + (asset.inflationAdjustedRub - stockInflationAdjustedCostBasisRub(asset));
      }
      const basis = asset.purchaseCostRub ?? asset.manualValueRub ?? 0;
      return sum + (asset.inflationAdjustedRub - basis);
    }, 0);
  }, [bankFilter, dashboard?.assets]);

  const selectedOtherExpectedProfitInflationRub = useMemo(() => {
    if (bankFilter !== "NON_FINANCIAL") return 0;
    return (dashboard?.assets ?? [])
      .filter((a: Asset) => a.category === "NON_FINANCIAL")
      .reduce((sum: number, a: Asset) => {
        const v = a.expectedProfitInflationRub;
        return sum + (typeof v === "number" && !Number.isNaN(v) ? v : 0);
      }, 0);
  }, [bankFilter, dashboard?.assets]);

  const bankHeaderSecondaryProfitRub = bankFilter === "NON_FINANCIAL" ? selectedOtherExpectedProfitInflationRub : selectedCategoryInflationProfitRub;
  const bankHeaderSecondaryProfitCoins = useMemo(() => amountToSignedCoins(bankHeaderSecondaryProfitRub), [bankHeaderSecondaryProfitRub]);


  return (
    <>
              <section className="panel panel-inverse bank-tab-section">
          <div className="bank-page-air">
            <div className="auction-shell-wrap">
          <div className="auction-shell">
            <span className="af-tl" aria-hidden="true" />
            <span className="af-top" aria-hidden="true" />
            <span className="af-tr" aria-hidden="true" />
            <span className="af-bl" aria-hidden="true" />
            <span className="af-bot" aria-hidden="true" />
            <span className="af-br" aria-hidden="true" />
            <img className="auction-portrait-coin" src={`${WOWHEAD_ICON_BASE}/inv_misc_coin_01.png`} alt="" />
            <div className="auction-shell-header">
              <span className="auction-shell-title">Active Portfolio</span>
              <span className="auction-shell-subtitle" aria-hidden="true" />
            </div>
            <div className="auction-shell-body">
              <div className="auction-layout">
                <aside className="auction-sidebar">
                  <button className={bankFilter === "ALL" ? "active" : ""} onClick={() => setBankFilter("ALL")}>
                    <span className="auction-tab-title">All</span>
                  </button>
                  <button className={bankFilter === "DEPOSIT" ? "active" : ""} onClick={() => setBankFilter("DEPOSIT")}>
                    <span className="auction-tab-title">Deposits</span>
                  </button>
                  <button className={bankFilter === "STOCK" ? "active" : ""} onClick={() => setBankFilter("STOCK")}>
                    <span className="auction-tab-title">Stocks</span>
                  </button>
                  <button className={bankFilter === "CRYPTO" ? "active" : ""} onClick={() => setBankFilter("CRYPTO")}>
                    <span className="auction-tab-title">Crypto</span>
                  </button>
                  <button className={bankFilter === "NON_FINANCIAL" ? "active" : ""} onClick={() => setBankFilter("NON_FINANCIAL")}>
                    <span className="auction-tab-title">Other</span>
                  </button>
                </aside>
                <div className="auction-content">
                  <div className="auction-topbar">
                    <div className="auction-meta">
                      <span>Current Value:
                        <strong className="coin-group">
                          <span className="coin-inline">{amountToCoins(selectedCategoryTotalRub).gold}<span className="coin-icon coin-gold" /></span>
                          <span className="coin-inline">{amountToCoins(selectedCategoryTotalRub).silver}<span className="coin-icon coin-silver" /></span>
                        </strong>
                      </span>
                      <span>{bankFilter === "NON_FINANCIAL" ? "Expected profit (Inflation):" : "Profit (Inflation):"}
                        <strong className="coin-group">
                          <span className="coin-inline">{bankHeaderSecondaryProfitCoins.sign < 0 ? "-" : bankHeaderSecondaryProfitCoins.sign > 0 ? "+" : ""}{bankHeaderSecondaryProfitCoins.gold}<span className="coin-icon coin-gold" /></span>
                          <span className="coin-inline">{bankHeaderSecondaryProfitCoins.silver}<span className="coin-icon coin-silver" /></span>
                        </strong>
                      </span>
                    </div>
                    <div className="actions actions-right">
                      {bankFilter !== "ALL" ? (
                        <button onClick={openAddAssetModal}>Add</button>
                      ) : null}
                    </div>
                  </div>
                  <div className="auction-divider" />
                  <div className={`auction-table ${isTransactionAssetOnlyView ? "auction-table-crypto" : ""} ${isDepositOnlyView ? "auction-table-deposit" : ""} ${isOtherOnlyView ? "auction-table-other" : ""}`}>
                    <div className="auction-row auction-head">
                      {isTransactionAssetOnlyView ? (
                        <>
                          <span><button onClick={() => toggleBankSort("name")}>Name</button></span>
                          <span><button onClick={() => toggleBankSort("quantity")}>Qty</button></span>
                          <span><button onClick={() => toggleBankSort("currentValueRub")}>Price</button></span>
                          <span>1M vs now</span>
                          <span>1Y vs now</span>
                          <span>2Y vs now</span>
                          <span><button onClick={() => toggleBankSort("profitInflation")}>Profit (Inflation)</button></span>
                        </>
                      ) : isDepositOnlyView ? (
                        <>
                          <span><button onClick={() => toggleBankSort("name")}>Name</button></span>
                          <span>%</span>
                          <span>Date (Close)</span>
                          <span><button onClick={() => toggleBankSort("currentValueRub")}>Price</button></span>
                          <span><button onClick={() => toggleBankSort("profitInflation")}>Profit (Inflation)</button></span>
                        </>
                      ) : isOtherOnlyView ? (
                        <>
                          <span><button onClick={() => toggleBankSort("name")}>Name</button></span>
                          <span><button onClick={() => toggleBankSort("currentValueRub")}>Price</button></span>
                          <span><button onClick={() => toggleBankSort("inflationAdjustedRub")}>Real Value (Inflation)</button></span>
                          <span><button onClick={() => toggleBankSort("expectedPriceRub")}>Expected price</button></span>
                          <span><button onClick={() => toggleBankSort("expectedProfitInflation")}>Expected profit (Inflation)</button></span>
                        </>
                      ) : (
                        <>
                          <span><button onClick={() => toggleBankSort("name")}>Name</button></span>
                          <span><button onClick={() => toggleBankSort("category")}>Category</button></span>
                          <span><button onClick={() => toggleBankSort("currentValueRub")}>Price</button></span>
                          <span><button onClick={() => toggleBankSort("inflationAdjustedRub")}>Real Value (Inflation)</button></span>
                          <span><button onClick={() => toggleBankSort("profit")}>Profit</button></span>
                        </>
                      )}
                    </div>
                    {pagedAssets.map((asset: Asset) => (
                      <div key={asset.id}>
                        <button
                          type="button"
                          className={`auction-row auction-row-button ${getAssetValueColorClass(asset.currentValueRub, dashboard?.user)}${expandedAssetId === asset.id ? " auction-row-selected" : ""}`}
                          onClick={() => openAssetInlineEditor(asset)}
                        >
                          {isTransactionAssetOnlyView ? (
                            <>
                              <span className="asset-name-cell"><img className="asset-icon" src={getAssetIconUrl(asset)} alt="" />{asset.name}</span>
                              <span>{asset.quantity}</span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span>{asset.category === "CRYPTO" ? formatPct(cryptoPerf[resolveCryptoPerfKey(asset.coingeckoId)]?.oneMonthPct) : formatPct(stockPerf[resolveStockPerfKey(asset.ticker)]?.oneMonthPct)}</span>
                              <span>{asset.category === "CRYPTO" ? formatPct(cryptoPerf[resolveCryptoPerfKey(asset.coingeckoId)]?.oneYearPct) : formatPct(stockPerf[resolveStockPerfKey(asset.ticker)]?.oneYearPct)}</span>
                              <span>{asset.category === "CRYPTO" ? formatPct(cryptoPerf[resolveCryptoPerfKey(asset.coingeckoId)]?.twoYearPct) : formatPct(stockPerf[resolveStockPerfKey(asset.ticker)]?.twoYearPct)}</span>
                              <span className="coin-group">
                                {(() => {
                                  const basis = asset.category === "STOCK" ? stockInflationAdjustedCostBasisRub(asset) : cryptoCostBasisRub(asset);
                                  const profit = amountToSignedCoins(asset.inflationAdjustedRub - basis);
                                  return (
                                    <>
                                      <span className="coin-inline">{profit.sign < 0 ? "-" : profit.sign > 0 ? "+" : ""}{profit.gold}<span className="coin-icon coin-gold" /></span>
                                      <span className="coin-inline">{profit.silver}<span className="coin-icon coin-silver" /></span>
                                    </>
                                  );
                                })()}
                              </span>
                            </>
                          ) : isDepositOnlyView ? (
                            <>
                              <span className="asset-name-cell"><img className="asset-icon" src={getAssetIconUrl(asset)} alt="" />{asset.name}</span>
                              <span>{typeof asset.depositRateAnnual === "number" ? `${asset.depositRateAnnual}%` : "-"}</span>
                              <span>{asset.depositCloseDate ? new Date(asset.depositCloseDate).toLocaleDateString("ru-RU") : "-"}</span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span className="coin-group">
                                {(() => {
                                  const profit = amountToSignedCoins(
                                    taxedDepositProfitRub(asset, asset.inflationAdjustedRub - depositCostBasisRub(asset))
                                  );
                                  return (
                                    <>
                                      <span className="coin-inline">{profit.sign < 0 ? "-" : profit.sign > 0 ? "+" : ""}{profit.gold}<span className="coin-icon coin-gold" /></span>
                                      <span className="coin-inline">{profit.silver}<span className="coin-icon coin-silver" /></span>
                                    </>
                                  );
                                })()}
                              </span>
                            </>
                          ) : isOtherOnlyView ? (
                            <>
                              <span className="asset-name-cell"><img className="asset-icon" src={getAssetIconUrl(asset)} alt="" />{asset.name}</span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.inflationAdjustedRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.inflationAdjustedRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span className="coin-group">
                                {asset.expectedPriceRub != null && Number.isFinite(asset.expectedPriceRub) ? (
                                  <>
                                    <span className="coin-inline">{amountToCoins(asset.expectedPriceRub).gold}<span className="coin-icon coin-gold" /></span>
                                    <span className="coin-inline">{amountToCoins(asset.expectedPriceRub).silver}<span className="coin-icon coin-silver" /></span>
                                  </>
                                ) : (
                                  "-"
                                )}
                              </span>
                              <span className="coin-group">
                                {typeof asset.expectedProfitInflationRub === "number" && !Number.isNaN(asset.expectedProfitInflationRub) ? (
                                  (() => {
                                    const profit = amountToSignedCoins(asset.expectedProfitInflationRub);
                                    return (
                                      <>
                                        <span className="coin-inline">{profit.sign < 0 ? "-" : profit.sign > 0 ? "+" : ""}{profit.gold}<span className="coin-icon coin-gold" /></span>
                                        <span className="coin-inline">{profit.silver}<span className="coin-icon coin-silver" /></span>
                                      </>
                                    );
                                  })()
                                ) : (
                                  "-"
                                )}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="asset-name-cell"><img className="asset-icon" src={getAssetIconUrl(asset)} alt="" />{asset.name}</span>
                              <span>{asset.category}</span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.currentValueRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span className="coin-group">
                                <span className="coin-inline">{amountToCoins(asset.inflationAdjustedRub).gold}<span className="coin-icon coin-gold" /></span>
                                <span className="coin-inline">{amountToCoins(asset.inflationAdjustedRub).silver}<span className="coin-icon coin-silver" /></span>
                              </span>
                              <span className="coin-group">
                                {asset.category === "NON_FINANCIAL" ? (
                                  "-"
                                ) : (
                                  (() => {
                                    const profit = amountToSignedCoins(nominalProfitRub(asset));
                                    return (
                                      <>
                                        <span className="coin-inline">{profit.sign < 0 ? "-" : profit.sign > 0 ? "+" : ""}{profit.gold}<span className="coin-icon coin-gold" /></span>
                                        <span className="coin-inline">{profit.silver}<span className="coin-icon coin-silver" /></span>
                                      </>
                                    );
                                  })()
                                )}
                              </span>
                            </>
                          )}
                        </button>
                        {expandedAssetId === asset.id && (() => {
                          const isAssetEditing = editingAssetId === asset.id;
                          const isTxAsset =
                            assetForm.category === "CRYPTO" || assetForm.category === "STOCK";
                          const tickerLabel =
                            assetForm.category === "STOCK" ? "MOEX Ticker" : "Ticker";
                          return (
                            <div
                              className={`auction-row-editor bank-asset-editor${isAssetEditing ? "" : " bank-asset-editor--readonly"}`}
                            >
                              {isTxAsset ? (
                                <>
                                  {isAssetEditing ? (
                                    <div className="inline-form inline-form-5">
                                      <BankField label="Name" readOnly={false} value={assetForm.name}>
                                        <input
                                          value={assetForm.name}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({ ...p, name: e.target.value }))
                                          }
                                        />
                                      </BankField>
                                      <BankField label={tickerLabel} readOnly={false} value={assetForm.ticker}>
                                        <input
                                          value={assetForm.ticker}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              ticker: v,
                                              coingeckoId:
                                                p.category === "CRYPTO"
                                                  ? v.trim().toLowerCase()
                                                  : p.coingeckoId,
                                            }));
                                          }}
                                        />
                                      </BankField>
                                      <BankField
                                        label="Qty (from transactions)"
                                        readOnly={false}
                                        value={assetForm.quantity}
                                      >
                                        <input
                                          value={assetForm.quantity}
                                          readOnly
                                          title="Derived from buys and sells"
                                        />
                                      </BankField>
                                    </div>
                                  ) : (
                                    <div className="inline-form inline-form-5">
                                      <BankField label="Name" readOnly value={asset.name}>
                                        <span />
                                      </BankField>
                                      <BankField
                                        label={tickerLabel}
                                        readOnly
                                        value={asset.ticker ?? asset.coingeckoId ?? "—"}
                                      >
                                        <span />
                                      </BankField>
                                      <BankField
                                        label="Qty (from transactions)"
                                        readOnly
                                        value={String(asset.quantity)}
                                      >
                                        <span />
                                      </BankField>
                                    </div>
                                  )}
                                  <div className="icon-picker-inline">
                                    {isAssetEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIconOffset(0);
                                          setIconHasMore(true);
                                          setIconPickerOpen(true);
                                        }}
                                      >
                                        Choose icon
                                      </button>
                                    ) : null}
                                    {(asset.iconName || assetForm.iconName) && (
                                      <img
                                        className="asset-icon"
                                        src={`${WOWHEAD_ICON_BASE}/${(asset.iconName ?? assetForm.iconName)!.toLowerCase()}.png`}
                                        alt=""
                                      />
                                    )}
                                  </div>
                                </>
                              ) : isAssetEditing ? (
                                <>
                                  <div className="inline-form inline-form-5">
                                    <BankField label="Name" readOnly={false} value={assetForm.name}>
                                      <input
                                        value={assetForm.name}
                                        onChange={(e) =>
                                          setAssetForm((p: any) => ({ ...p, name: e.target.value }))
                                        }
                                      />
                                    </BankField>
                                    <BankField label="Category" readOnly={false} value={assetForm.category}>
                                      <input value={assetForm.category} readOnly />
                                    </BankField>
                                    <BankField label="Quantity" readOnly={false} value={assetForm.quantity}>
                                      <input
                                        value={assetForm.quantity}
                                        onChange={(e) =>
                                          setAssetForm((p: any) => ({ ...p, quantity: e.target.value }))
                                        }
                                      />
                                    </BankField>
                                    {(assetForm.category === "DEPOSIT" ||
                                      assetForm.category === "NON_FINANCIAL") && (
                                      <BankField
                                        label="Manual Value (RUB)"
                                        readOnly={false}
                                        value={assetForm.manualValueRub}
                                      >
                                        <input
                                          value={assetForm.manualValueRub}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              manualValueRub: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "NON_FINANCIAL" && (
                                      <BankField
                                        label="Purchase date"
                                        readOnly={false}
                                        value={assetForm.acquisitionDate}
                                      >
                                        <input
                                          type="date"
                                          value={assetForm.acquisitionDate}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              acquisitionDate: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "NON_FINANCIAL" && (
                                      <BankField
                                        label="Expected price (RUB)"
                                        readOnly={false}
                                        value={assetForm.expectedPriceRub || "—"}
                                      >
                                        <input
                                          value={assetForm.expectedPriceRub}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              expectedPriceRub: e.target.value,
                                            }))
                                          }
                                          placeholder="Optional"
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "DEPOSIT" && (
                                      <BankField label="Date" readOnly={false} value={assetForm.acquisitionDate}>
                                        <input
                                          type="date"
                                          value={assetForm.acquisitionDate}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              acquisitionDate: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "DEPOSIT" && (
                                      <BankField label="Rate %" readOnly={false} value={assetForm.depositRateAnnual}>
                                        <input
                                          value={assetForm.depositRateAnnual}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              depositRateAnnual: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "DEPOSIT" && (
                                      <BankField
                                        label="Tax Profit %"
                                        readOnly={false}
                                        value={assetForm.taxProfitPercent}
                                      >
                                        <input
                                          value={assetForm.taxProfitPercent}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              taxProfitPercent: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                    {assetForm.category === "DEPOSIT" && (
                                      <BankField label="Close Date" readOnly={false} value={assetForm.depositCloseDate}>
                                        <input
                                          type="date"
                                          value={assetForm.depositCloseDate}
                                          onChange={(e) =>
                                            setAssetForm((p: any) => ({
                                              ...p,
                                              depositCloseDate: e.target.value,
                                            }))
                                          }
                                        />
                                      </BankField>
                                    )}
                                  </div>
                                  <div className="icon-picker-inline">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIconOffset(0);
                                        setIconHasMore(true);
                                        setIconPickerOpen(true);
                                      }}
                                    >
                                      Choose Icon
                                    </button>
                                    {assetForm.iconName && (
                                      <img
                                        className="asset-icon"
                                        src={`${WOWHEAD_ICON_BASE}/${assetForm.iconName}.png`}
                                        alt={assetForm.iconName}
                                      />
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="inline-form inline-form-5">
                                    <BankField label="Name" readOnly value={asset.name}>
                                      <span />
                                    </BankField>
                                    <BankField label="Category" readOnly value={asset.category}>
                                      <span />
                                    </BankField>
                                    <BankField label="Quantity" readOnly value={String(asset.quantity)}>
                                      <span />
                                    </BankField>
                                    {(asset.category === "DEPOSIT" || asset.category === "NON_FINANCIAL") && (
                                      <BankField
                                        label="Manual Value (RUB)"
                                        readOnly
                                        value={
                                          asset.manualValueRub != null ? String(asset.manualValueRub) : "—"
                                        }
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "NON_FINANCIAL" && (
                                      <BankField
                                        label="Purchase date"
                                        readOnly
                                        value={formatAssetDate(asset.acquisitionDate)}
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "NON_FINANCIAL" && (
                                      <BankField
                                        label="Expected price (RUB)"
                                        readOnly
                                        value={
                                          asset.expectedPriceRub != null
                                            ? String(asset.expectedPriceRub)
                                            : "—"
                                        }
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "DEPOSIT" && (
                                      <BankField label="Date" readOnly value={formatAssetDate(asset.acquisitionDate)}>
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "DEPOSIT" && (
                                      <BankField
                                        label="Rate %"
                                        readOnly
                                        value={
                                          asset.depositRateAnnual != null
                                            ? String(asset.depositRateAnnual)
                                            : "—"
                                        }
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "DEPOSIT" && (
                                      <BankField
                                        label="Tax Profit %"
                                        readOnly
                                        value={
                                          asset.taxProfitPercent != null
                                            ? String(asset.taxProfitPercent)
                                            : "—"
                                        }
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                    {asset.category === "DEPOSIT" && (
                                      <BankField
                                        label="Close Date"
                                        readOnly
                                        value={formatAssetDate(asset.depositCloseDate)}
                                      >
                                        <span />
                                      </BankField>
                                    )}
                                  </div>
                                  <div className="icon-picker-inline">
                                    {asset.iconName && (
                                      <img
                                        className="asset-icon"
                                        src={`${WOWHEAD_ICON_BASE}/${asset.iconName.toLowerCase()}.png`}
                                        alt=""
                                      />
                                    )}
                                  </div>
                                </>
                              )}
                              <div className="actions actions-right">
                                {isTxAsset ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenCryptoTransactions()}
                                  >
                                    Transactions
                                  </button>
                                ) : null}
                                {isAssetEditing ? (
                                  <>
                                    <button type="button" onClick={() => void submitInlineAssetEditor()}>
                                      Save
                                    </button>
                                    <button type="button" className="secondary" onClick={cancelAssetEdit}>
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="danger"
                                      onClick={() => void deleteInlineAssetEditor()}
                                    >
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" onClick={startAssetEdit}>
                                      Edit
                                    </button>
                                    <button type="button" className="secondary" onClick={closeAssetView}>
                                      Close
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="category-totals-dock">
              <span className="category-total-frame">
                Deposits: <span className="coin-inline">{amountToCoins(categoryTotals.DEPOSIT).gold}<span className="coin-icon coin-gold" /></span><span className="coin-inline">{amountToCoins(categoryTotals.DEPOSIT).silver}<span className="coin-icon coin-silver" /></span>
              </span>
              <span className="category-total-frame">
                Stocks: <span className="coin-inline">{amountToCoins(categoryTotals.STOCK).gold}<span className="coin-icon coin-gold" /></span><span className="coin-inline">{amountToCoins(categoryTotals.STOCK).silver}<span className="coin-icon coin-silver" /></span>
              </span>
              <span className="category-total-frame">
                Crypto: <span className="coin-inline">{amountToCoins(categoryTotals.CRYPTO).gold}<span className="coin-icon coin-gold" /></span><span className="coin-inline">{amountToCoins(categoryTotals.CRYPTO).silver}<span className="coin-icon coin-silver" /></span>
              </span>
              <span className="category-total-frame">
                Other: <span className="coin-inline">{amountToCoins(categoryTotals.NON_FINANCIAL).gold}<span className="coin-icon coin-gold" /></span><span className="coin-inline">{amountToCoins(categoryTotals.NON_FINANCIAL).silver}<span className="coin-icon coin-silver" /></span>
              </span>
            </div>
          </div>
            </div>
            {filteredAssets.length > BANK_PAGE_SIZE && (
              <nav className="bank-pagination" aria-label="Bank pages">
                <button
                  type="button"
                  className="page-arrow page-arrow-prev"
                  disabled={safeBankPage <= 0}
                  onClick={() => setBankPage((p: any) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <img src={safeBankPage <= 0 ? "/textures/left%20disabled.PNG" : "/textures/left.PNG"} alt="" />
                </button>
                <span className="page-status">
                  Page {safeBankPage + 1} / {bankPageCount}
                </span>
                <button
                  type="button"
                  className="page-arrow page-arrow-next"
                  disabled={safeBankPage >= bankPageCount - 1}
                  onClick={() => setBankPage((p: any) => Math.min(bankPageCount - 1, p + 1))}
                  aria-label="Next page"
                >
                  <img src={safeBankPage >= bankPageCount - 1 ? "/textures/right%20disabled.PNG" : "/textures/right.PNG"} alt="" />
                </button>
              </nav>
            )}
          </div>
    </section>
      {assetModal && (
        <section
          className="modal-backdrop"
          onClick={() => {
            closeCryptoTxModal();
            setAssetModal(null);
          }}
        >
          <div className="panel modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3>{assetModal.mode === "add" ? "Add Asset" : "Edit Asset"}</h3>
            {(assetForm.category === "CRYPTO" || assetForm.category === "STOCK") ? (
              <>
                <div className="inline-form inline-form-5">
                  <label className="field-label">
                    Name
                    <input value={assetForm.name} onChange={(e) => setAssetForm((p) => ({ ...p, name: e.target.value }))} />
                  </label>
                  <label className="field-label">
                    {assetForm.category === "STOCK" ? "MOEX Ticker" : "Ticker"}
                    <input
                      value={assetForm.ticker}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAssetForm((p) => ({
                          ...p,
                          ticker: v,
                          coingeckoId: p.category === "CRYPTO" ? v.trim().toLowerCase() : p.coingeckoId,
                        }));
                      }}
                    />
                  </label>
                  {bankFilter === "ALL" ? (
                    <label className="field-label">
                      Category
                      <select
                        value={assetForm.category}
                        onChange={(e) => {
                          const category = parseAssetCategorySelect(e.target.value);
                          setAssetForm((p) => ({
                            ...p,
                            category,
                            quantity:
                              category === "CRYPTO" || category === "STOCK"
                                ? "0"
                                : p.category === "CRYPTO" || p.category === "STOCK"
                                  ? "1"
                                  : p.quantity === "0"
                                    ? "1"
                                    : p.quantity,
                            ticker: category === "CRYPTO" || category === "STOCK" ? "" : p.ticker,
                            coingeckoId: category === "CRYPTO" ? "" : p.coingeckoId || "bitcoin",
                            purchaseCostRub: category === "CRYPTO" || category === "STOCK" ? "" : p.purchaseCostRub,
                          }));
                        }}
                      >
                        <option value="DEPOSIT">Deposit</option>
                        <option value="STOCK">Stock</option>
                        <option value="CRYPTO">Crypto</option>
                        <option value="NON_FINANCIAL">Other</option>
                      </select>
                    </label>
                  ) : (
                    <label className="field-label">Category<input value={bankFilter} readOnly /></label>
                  )}
                </div>
                <div className="icon-picker-inline">
                  <button type="button" onClick={() => { setIconOffset(0); setIconHasMore(true); setIconPickerOpen(true); }}>Choose icon</button>
                  {assetForm.iconName && <img className="asset-icon" src={`${WOWHEAD_ICON_BASE}/${assetForm.iconName}.jpg`} alt={assetForm.iconName} />}
                </div>
                <div className="actions">
                  <button type="button" onClick={() => void handleOpenCryptoTransactions()}>Transactions</button>
                  <button type="button" onClick={() => { closeCryptoTxModal(); setAssetModal(null); }}>Cancel</button>
                  <button type="button" onClick={() => void submitAssetModal()}>Save</button>
                </div>
              </>
            ) : (
              <>
                <div className="inline-form inline-form-5">
                  <label className="field-label">Name<input value={assetForm.name} onChange={(e) => setAssetForm((p) => ({ ...p, name: e.target.value }))} /></label>
                  {bankFilter === "ALL" ? (
                    <label className="field-label">
                      Category
                      <select
                        value={assetForm.category}
                        onChange={(e) => {
                          const category = parseAssetCategorySelect(e.target.value);
                          setAssetForm((p) => ({
                            ...p,
                            category,
                            quantity:
                              category === "CRYPTO" || category === "STOCK"
                                ? "0"
                                : p.category === "CRYPTO" || p.category === "STOCK"
                                  ? "1"
                                  : p.quantity === "0"
                                    ? "1"
                                    : p.quantity,
                            ticker: category === "CRYPTO" || category === "STOCK" ? "" : p.ticker,
                            coingeckoId: category === "CRYPTO" ? "" : p.coingeckoId || "bitcoin",
                            purchaseCostRub: category === "CRYPTO" || category === "STOCK" ? "" : p.purchaseCostRub,
                          }));
                        }}
                      >
                        <option value="DEPOSIT">Deposit</option>
                        <option value="STOCK">Stock</option>
                        <option value="CRYPTO">Crypto</option>
                        <option value="NON_FINANCIAL">Other</option>
                      </select>
                    </label>
                  ) : (
                    <label className="field-label">Category<input value={bankFilter} readOnly /></label>
                  )}
                  <label className="field-label">Quantity<input value={assetForm.quantity} onChange={(e) => setAssetForm((p) => ({ ...p, quantity: e.target.value }))} /></label>
                  {(assetForm.category === "DEPOSIT" || assetForm.category === "NON_FINANCIAL") && <label className="field-label">Manual Value (RUB)<input value={assetForm.manualValueRub} onChange={(e) => setAssetForm((p) => ({ ...p, manualValueRub: e.target.value }))} /></label>}
                  {assetForm.category === "NON_FINANCIAL" && (
                    <label className="field-label">
                      Purchase date
                      <input type="date" value={assetForm.acquisitionDate} onChange={(e) => setAssetForm((p) => ({ ...p, acquisitionDate: e.target.value }))} />
                    </label>
                  )}
                  {assetForm.category === "NON_FINANCIAL" && (
                    <label className="field-label">
                      Expected price (RUB)
                      <input value={assetForm.expectedPriceRub} onChange={(e) => setAssetForm((p) => ({ ...p, expectedPriceRub: e.target.value }))} placeholder="Optional" />
                    </label>
                  )}
                  {assetForm.category === "DEPOSIT" && <label className="field-label">Date<input type="date" value={assetForm.acquisitionDate} onChange={(e) => setAssetForm((p) => ({ ...p, acquisitionDate: e.target.value }))} /></label>}
                  {assetForm.category === "DEPOSIT" && (
                    <>
                      <label className="field-label">Rate %<input value={assetForm.depositRateAnnual} onChange={(e) => setAssetForm((p) => ({ ...p, depositRateAnnual: e.target.value }))} /></label>
                      <label className="field-label">Tax Profit %<input value={assetForm.taxProfitPercent} onChange={(e) => setAssetForm((p) => ({ ...p, taxProfitPercent: e.target.value }))} /></label>
                      <label className="field-label">Close Date<input type="date" value={assetForm.depositCloseDate} onChange={(e) => setAssetForm((p) => ({ ...p, depositCloseDate: e.target.value }))} /></label>
                    </>
                  )}
                </div>
                <div className="icon-picker-inline">
                  <button type="button" onClick={() => { setIconOffset(0); setIconHasMore(true); setIconPickerOpen(true); }}>Choose Icon</button>
                  {assetForm.iconName && <img className="asset-icon" src={`${WOWHEAD_ICON_BASE}/${assetForm.iconName}.jpg`} alt={assetForm.iconName} />}
                </div>
                <div className="actions"><button type="button" onClick={() => { closeCryptoTxModal(); setAssetModal(null); }}>Cancel</button><button type="button" onClick={() => void submitAssetModal()}>Save</button></div>
              </>
            )}
          </div>
        </section>
      )}
      {cryptoTxModalOpen && cryptoTxAssetId && (
        <section className="modal-backdrop modal-stacked" onClick={() => closeCryptoTxModal()}>
          <div className="panel modal-card crypto-tx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3 className="crypto-tx-modal-title">Transactions</h3>
            {cryptoTxLoading ? <p className="crypto-tx-loading">Loading…</p> : null}
            <div className="crypto-tx-table-shell">
              <div className="crypto-tx-list-head crypto-tx-row-grid" role="row">
                <span>Date</span>
                <span>Type</span>
                <span className="crypto-tx-head-numeric">Qty</span>
                <span className="crypto-tx-head-numeric">Amount</span>
                <span className="crypto-tx-head-actions" />
              </div>
              <ul className="crypto-tx-list">
              {cryptoTxList.map((tx) => (
                <li key={tx.id} className={`crypto-tx-row${editingTxId === tx.id ? " crypto-tx-row--editing" : ""}`}>
                  {editingTxId === tx.id ? (
                    <div className="crypto-tx-edit-grid">
                      <label className="field-label">
                        Type
                        <select value={editTxType} onChange={(e) => setEditTxType(e.target.value as CryptoTxKind)}>
                          <option value="BUY">Buy</option>
                          <option value="SELL">Sell</option>
                          {currentTxSupportsDividends ? <option value="DIVIDEND">Dividends</option> : null}
                        </select>
                      </label>
                      <label className="field-label">
                        Date
                        <input type="date" value={editTxDate} onChange={(e) => setEditTxDate(e.target.value)} />
                      </label>
                      {editTxType !== "DIVIDEND" ? (
                        <label className="field-label">
                          Quantity
                          <input value={editTxQty} onChange={(e) => setEditTxQty(e.target.value)} />
                        </label>
                      ) : null}
                      <label className="field-label">
                        Amount (RUB)
                        <input value={editTxRub} onChange={(e) => setEditTxRub(e.target.value)} />
                      </label>
                      <div className="crypto-tx-edit-actions">
                        <button type="button" onClick={() => void saveEditCryptoTx()}>Save</button>
                        <button type="button" onClick={cancelEditTx}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="crypto-tx-summary crypto-tx-row-grid">
                      <span className="crypto-tx-cell crypto-tx-date">{new Date(tx.executedAt).toLocaleDateString("en-GB")}</span>
                      <span className="crypto-tx-cell crypto-tx-type">{txTypeLabel(tx.type)}</span>
                      <span className="crypto-tx-cell crypto-tx-qty">{tx.type === "DIVIDEND" ? "-" : tx.quantity}</span>
                      <span className="crypto-tx-cell crypto-tx-rub">{tx.totalRub} ₽</span>
                      <div className="crypto-tx-row-actions">
                        <button type="button" onClick={() => beginEditTx(tx)}>Edit</button>
                        <button type="button" className="danger icon-trash" title="Delete" aria-label="Delete" onClick={() => void removeCryptoTx(tx.id)}>🗑</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              </ul>
            </div>
            <div className="crypto-tx-add">
              <h4 className="crypto-tx-add-title">Add transaction</h4>
              <div className="crypto-tx-add-fields">
                <label className="field-label">
                  Type
                  <select value={newTxType} onChange={(e) => setNewTxType(e.target.value as CryptoTxKind)}>
                    <option value="BUY">Buy</option>
                    <option value="SELL">Sell</option>
                    {currentTxSupportsDividends ? <option value="DIVIDEND">Dividends</option> : null}
                  </select>
                </label>
                <label className="field-label">
                  Date
                  <input type="date" value={newTxDate} onChange={(e) => setNewTxDate(e.target.value)} />
                </label>
                {newTxType !== "DIVIDEND" ? (
                  <label className="field-label">
                    Quantity
                    <input value={newTxQty} onChange={(e) => setNewTxQty(e.target.value)} placeholder="0" />
                  </label>
                ) : null}
                <label className="field-label">
                  Amount (RUB)
                  <input value={newTxRub} onChange={(e) => setNewTxRub(e.target.value)} placeholder="0" />
                </label>
              </div>
              <button type="button" className="crypto-tx-add-submit" onClick={() => void submitNewCryptoTx()}>
                Add transaction
              </button>
            </div>
            <div className="actions crypto-tx-modal-footer">
              <button type="button" onClick={() => closeCryptoTxModal()}>Close</button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}