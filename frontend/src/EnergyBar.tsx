import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { pickEnergyRecommendation } from "./energyRecommendations";

const ENERGY_SLOT_COUNT = 6;

export type EnergyFlags = {
  bonusNoPhoneUsed: boolean;
  bonusHeartUsed: boolean;
  bonusRecycleActive: boolean;
  lossNoPhoneUsed: boolean;
  lossHeartUsed: boolean;
  lossPillActive: boolean;
};

export type ExerciseTypeRow = {
  id: string;
  name: string;
  description: string | null;
  energyTier: number;
};

export type EnergySlotRow = {
  id: string;
  exerciseTypeId: string;
  weekKey: string;
  sortOrder: number;
  completed: boolean;
  name: string;
  description: string | null;
  energyTier: number;
  energyValue: number;
};

export type EnergyState = {
  energy: number;
  weekKey: string;
  energyAtWeekStart: number;
  spentWeek: number;
  gainedWeek: number;
  flags: EnergyFlags;
  exerciseTypes: ExerciseTypeRow[];
  slots: EnergySlotRow[];
};

export type EnergyPayloadPatch = Pick<
  EnergyState,
  "energy" | "weekKey" | "energyAtWeekStart" | "spentWeek" | "gainedWeek" | "flags"
>;

type EnergyBarProps = {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onEnergyChange: (energy: number) => void;
  energyPatch?: EnergyPayloadPatch | null;
  energyPatchNonce?: number;
  dailyEnergyLoss: number;
};

const FOCUS_CURSOR_HAND_GLOW = 'url("/textures/openhandglow.PNG") 32 40, grabbing';

const ENERGY_BONUS_ICONS = ["/textures/bonus-1.PNG", "/textures/bonus-2.PNG", "/textures/bonus-3.PNG"] as const;
const ENERGY_LOSS_ICONS = ["/textures/loss-1.PNG", "/textures/loss-2.PNG", "/textures/loss-3.PNG"] as const;

function tierDifficultyKey(tier: number): string {
  if (tier >= 4) return "epic";
  if (tier >= 3) return "hard";
  if (tier >= 2) return "medium";
  return "easy";
}

function tierBolts(tier: number): string {
  return "⚡".repeat(Math.min(4, Math.max(1, tier)));
}

function daysSinceMonday(): number {
  const dow = new Date().getDay();
  return dow === 0 ? 7 : dow;
}

function dailySpentAverage(spentWeek: number, weekDays: number): number {
  if (weekDays <= 0) return 0;
  return Math.max(0, Math.round(spentWeek / weekDays));
}

type Rgb = { r: number; g: number; b: number };

const ENERGY_GREEN: Rgb = { r: 122, g: 168, b: 138 };
const ENERGY_YELLOW: Rgb = { r: 194, g: 178, b: 112 };
const ENERGY_RED: Rgb = { r: 188, g: 132, b: 122 };

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

function rgbCss(c: Rgb, alpha = 1): string {
  return alpha === 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Soft green (high) → yellow (mid) → red (low). */
function energyGaugeColors(percent: number) {
  const p = Math.max(0, Math.min(100, percent));
  let base: Rgb;
  if (p >= 55) {
    base = lerpRgb(ENERGY_YELLOW, ENERGY_GREEN, (p - 55) / 45);
  } else if (p >= 25) {
    base = lerpRgb(ENERGY_RED, ENERGY_YELLOW, (p - 25) / 30);
  } else {
    base = ENERGY_RED;
  }
  const fillLight = lerpRgb(base, { r: 248, g: 244, b: 228 }, 0.22);
  return {
    fillLight: rgbCss(fillLight),
    fillMain: rgbCss(base),
    glow: rgbCss(base, 0.1),
    glowSoft: rgbCss(base, 0.05),
    ringA: rgbCss(fillLight, 0.38),
    ringB: rgbCss(base, 0.22),
    textGlow: rgbCss(base, 0.28),
  };
}

export function EnergyBar({ request, onEnergyChange, energyPatch, energyPatchNonce = 0, dailyEnergyLoss }: EnergyBarProps) {
  const [state, setState] = useState<EnergyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [pickExerciseOpen, setPickExerciseOpen] = useState(false);
  const [pickSlotIndex, setPickSlotIndex] = useState<number | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeForm, setTypeForm] = useState({ name: "", description: "", energyTier: 1 });
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const slotDragDidMoveRef = useRef(false);
  const onEnergyChangeRef = useRef(onEnergyChange);
  onEnergyChangeRef.current = onEnergyChange;
  const requestRef = useRef(request);
  requestRef.current = request;
  const [energyTip] = useState(() => pickEnergyRecommendation());
  const [toggleError, setToggleError] = useState<string | null>(null);
  const togglingRef = useRef(false);

  const loadEnergy = useCallback(async () => {
    try {
      const data = await requestRef.current<EnergyState>("/energy");
      setState(data);
      onEnergyChangeRef.current(data.energy);
      return data;
    } catch {
      setState(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnergy();
  }, [loadEnergy]);

  useEffect(() => {
    if (!energyPatch) return;
    setState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        energy: energyPatch.energy,
        weekKey: energyPatch.weekKey,
        energyAtWeekStart: energyPatch.energyAtWeekStart,
        spentWeek: energyPatch.spentWeek,
        gainedWeek: energyPatch.gainedWeek,
        flags: energyPatch.flags,
      };
      onEnergyChangeRef.current(next.energy);
      return next;
    });
  }, [energyPatch, energyPatchNonce]);

  const applyPayload = (payload: {
    energy: number;
    weekKey: string;
    energyAtWeekStart: number;
    spentWeek: number;
    gainedWeek: number;
    flags: EnergyFlags;
  }) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        energy: payload.energy,
        weekKey: payload.weekKey,
        energyAtWeekStart: payload.energyAtWeekStart,
        spentWeek: payload.spentWeek,
        gainedWeek: payload.gainedWeek,
        flags: payload.flags,
      };
      onEnergyChangeRef.current(next.energy);
      return next;
    });
  };

  const runEnergyToggle = async (path: string) => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    setToggleError(null);
    try {
      const payload = await requestRef.current<{
        energy: number;
        weekKey: string;
        energyAtWeekStart: number;
        spentWeek: number;
        gainedWeek: number;
        flags: EnergyFlags;
      }>(path, { method: "POST", body: JSON.stringify({}) });
      applyPayload(payload);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update energy";
      setToggleError(message);
      await loadEnergy();
      throw e;
    } finally {
      togglingRef.current = false;
    }
  };

  const toggleBonus = (key: "noPhone" | "heart" | "recycle") => runEnergyToggle(`/energy/bonus/${key}`);

  const toggleLoss = (key: "noPhone" | "heart" | "pill") => runEnergyToggle(`/energy/loss/${key}`);

  const toggleSlotComplete = async (slot: EnergySlotRow) => {
    const res = await request<{ slot: EnergySlotRow; energy?: EnergyState }>(`/energy/slots/${slot.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: !slot.completed }),
    });
    setState((prev) => {
      if (!prev) return prev;
      const slots = prev.slots.map((s) => (s.id === slot.id ? { ...s, completed: res.slot.completed } : s));
      const next = {
        ...prev,
        slots,
        ...(res.energy ? { energy: res.energy.energy, gainedWeek: res.energy.gainedWeek, flags: res.energy.flags } : {}),
      };
      if (res.energy) onEnergyChangeRef.current(res.energy.energy);
      return next;
    });
  };

  const removeSlot = async (slotId: string) => {
    await request(`/energy/slots/${slotId}`, { method: "DELETE" });
    setState((prev) => (prev ? { ...prev, slots: prev.slots.filter((s) => s.id !== slotId) } : prev));
  };

  const addSlot = async (exerciseTypeId: string, sortOrder: number) => {
    const created = await request<EnergySlotRow>("/energy/slots", {
      method: "POST",
      body: JSON.stringify({ exerciseTypeId, sortOrder }),
    });
    setState((prev) => (prev ? { ...prev, slots: [...prev.slots, created] } : prev));
    setPickExerciseOpen(false);
    setPickSlotIndex(null);
  };

  const moveSlotToIndex = async (slotId: string, targetIndex: number) => {
    const slot = state?.slots.find((s) => s.id === slotId);
    if (!slot || slot.sortOrder === targetIndex) return;
    const occupant = state?.slots.find((s) => s.sortOrder === targetIndex);
    await request(`/energy/slots/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify({ sortOrder: targetIndex }),
    });
    if (occupant) {
      await request(`/energy/slots/${occupant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sortOrder: slot.sortOrder }),
      });
    }
    void loadEnergy();
  };

  const slotsByIndex = useMemo(() => {
    if (!state) return Array<EnergySlotRow | null>(ENERGY_SLOT_COUNT).fill(null);
    const cells: (EnergySlotRow | null)[] = Array(ENERGY_SLOT_COUNT).fill(null);
    const sorted = [...state.slots].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const slot of sorted) {
      if (slot.sortOrder >= 0 && slot.sortOrder < ENERGY_SLOT_COUNT && cells[slot.sortOrder] === null) {
        cells[slot.sortOrder] = slot;
      } else {
        const free = cells.findIndex((c) => c === null);
        if (free >= 0) cells[free] = slot;
      }
    }
    return cells;
  }, [state]);

  const reorderSlots = async (orderedIds: string[]) => {
    await request("/energy/slots/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    });
    setState((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.slots.map((s) => [s.id, s]));
      return { ...prev, slots: orderedIds.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })) };
    });
  };

  const saveExerciseType = async () => {
    if (!typeForm.name.trim()) return;
    if (editingTypeId) {
      const updated = await request<ExerciseTypeRow>(`/exercise-types/${editingTypeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: typeForm.name.trim(),
          description: typeForm.description.trim() || undefined,
          energyTier: typeForm.energyTier,
        }),
      });
      setState((prev) =>
        prev
          ? {
              ...prev,
              exerciseTypes: prev.exerciseTypes.map((t) => (t.id === updated.id ? updated : t)),
              slots: prev.slots.map((s) =>
                s.exerciseTypeId === updated.id
                  ? {
                      ...s,
                      name: updated.name,
                      description: updated.description,
                      energyTier: updated.energyTier,
                      energyValue: updated.energyTier * 10,
                    }
                  : s
              ),
            }
          : prev
      );
    } else {
      const created = await request<ExerciseTypeRow>("/exercise-types", {
        method: "POST",
        body: JSON.stringify({
          name: typeForm.name.trim(),
          description: typeForm.description.trim() || undefined,
          energyTier: typeForm.energyTier,
        }),
      });
      setState((prev) => (prev ? { ...prev, exerciseTypes: [...prev.exerciseTypes, created] } : prev));
    }
    setEditingTypeId(null);
    setTypeForm({ name: "", description: "", energyTier: 1 });
  };

  const deleteExerciseType = async (id: string) => {
    await request(`/exercise-types/${id}`, { method: "DELETE" });
    setState((prev) =>
      prev
        ? {
            ...prev,
            exerciseTypes: prev.exerciseTypes.filter((t) => t.id !== id),
            slots: prev.slots.filter((s) => s.exerciseTypeId !== id),
          }
        : prev
    );
  };

  const energy = state?.energy ?? 100;
  const gaugeStyle = useMemo(() => {
    const c = energyGaugeColors(energy);
    return {
      "--energy-deg": `${energy * 3.6}deg`,
      "--energy-fill-light": c.fillLight,
      "--energy-fill-main": c.fillMain,
      "--energy-glow": c.glow,
      "--energy-glow-soft": c.glowSoft,
      "--energy-ring-a": c.ringA,
      "--energy-ring-b": c.ringB,
      "--energy-text-glow": c.textGlow,
    } as CSSProperties;
  }, [energy]);
  const weekDays = daysSinceMonday();
  const dailySpend =
    state && weekDays > 0 ? dailySpentAverage(state.spentWeek, weekDays) : dailyEnergyLoss;
  const exerciseGained =
    state?.slots.filter((s) => s.completed).reduce((sum, s) => sum + s.energyValue, 0) ?? 0;
  const totalGained = Math.max(0, (state?.gainedWeek ?? 0) + exerciseGained);
  const dailyGain = state && weekDays > 0 ? Math.max(0, Math.round(totalGained / weekDays)) : 0;

  if (loading) {
    return <section className="panel energy-bar-panel"><p className="energy-bar-loading">Loading Energy Bar…</p></section>;
  }

  if (!state) {
    return <section className="panel energy-bar-panel"><p className="energy-bar-loading">Failed to load Energy Bar</p></section>;
  }

  return (
    <section className="panel energy-bar-panel">
      <header className="energy-bar-header">
        <h2 className="energy-bar-title">Energy Bar</h2>
        <button type="button" className="energy-bar-add-btn" onClick={() => setExerciseModalOpen(true)}>
          Add
        </button>
      </header>

      <div className="energy-bar-body">
        <div className="energy-bar-gauge-col" aria-label={`Energy ${energy}%`}>
          <div className="energy-pie-wrap" style={gaugeStyle}>
            <div className="energy-pie" />
            <div className="energy-pie-inner">
              <span className="energy-pie-value">{energy}%</span>
            </div>
          </div>
        </div>

        <div className="energy-bar-stats-col">
          <div className="energy-bar-stats-top">
            <p className="energy-stat-line">
              <span className="energy-stat-label">Energy at week start:</span>{" "}
              <strong>{state.energyAtWeekStart}%</strong>
            </p>
            <p className="energy-stat-hint">{energyTip}</p>
          </div>
          <div className="energy-bar-stats-footer">
            <p className="energy-stat-line energy-stat-spent">
              <span className="energy-stat-label">Spent:</span>{" "}
              <strong>{state.spentWeek}%</strong>
              <span className="energy-stat-sub"> ({dailySpend}% per day)</span>
            </p>
            <p className="energy-stat-line energy-stat-gained">
              <span className="energy-stat-label">Gained:</span>{" "}
              <strong>{totalGained}%</strong>
              {dailyGain > 0 ? <span className="energy-stat-sub"> ({dailyGain}% per day)</span> : null}
            </p>
          </div>
        </div>

        <div className="energy-bar-modifiers-col">
          {toggleError ? (
            <p className="energy-toggle-error" role="alert">
              {toggleError}
            </p>
          ) : null}
          <div className="energy-modifier-frame">
            <h3 className="energy-modifier-heading">Bonus +</h3>
            <div className="energy-modifier-btns">
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--bonus${state.flags.bonusNoPhoneUsed ? " is-used" : ""}`}
                title="+10%"
                onClick={() => void toggleBonus("noPhone").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_BONUS_ICONS[0]} alt="" />
              </button>
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--bonus${state.flags.bonusHeartUsed ? " is-used" : ""}`}
                title="+10%"
                onClick={() => void toggleBonus("heart").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_BONUS_ICONS[1]} alt="" />
              </button>
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--bonus${state.flags.bonusRecycleActive ? " is-used" : ""}`}
                title="+30%"
                onClick={() => void toggleBonus("recycle").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_BONUS_ICONS[2]} alt="" />
              </button>
            </div>
          </div>
          <div className="energy-modifier-frame">
            <h3 className="energy-modifier-heading">Loss −</h3>
            <div className="energy-modifier-btns">
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--loss${state.flags.lossNoPhoneUsed ? " is-used" : ""}`}
                title="-10%"
                onClick={() => void toggleLoss("noPhone").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_LOSS_ICONS[0]} alt="" />
              </button>
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--loss${state.flags.lossHeartUsed ? " is-used" : ""}`}
                title="-10%"
                onClick={() => void toggleLoss("heart").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_LOSS_ICONS[1]} alt="" />
              </button>
              <button
                type="button"
                className={`energy-modifier-btn energy-modifier-btn--loss${state.flags.lossPillActive ? " is-used" : ""}`}
                title="-40%"
                onClick={() => void toggleLoss("pill").catch(() => undefined)}
              >
                <img className="energy-modifier-icon" src={ENERGY_LOSS_ICONS[2]} alt="" />
              </button>
            </div>
          </div>
        </div>

        <div className="energy-bar-exercises-col">
          <div className="energy-exercise-frame">
            <div className="energy-slot-row">
              {slotsByIndex.map((slot, slotIndex) =>
                slot ? (
              <div
                key={slot.id}
                data-energy-slot={slot.id}
                data-energy-slot-index={slotIndex}
                className={`energy-slot-card energy-slot-card--draggable diff-border-${tierDifficultyKey(slot.energyTier)} ${slot.completed ? "completed" : ""}${draggingSlotId === slot.id ? " energy-slot-card--drag-source" : ""}${dragOverSlotId === slot.id || dragOverSlotId === `idx-${slotIndex}` ? " energy-slot-card--drag-over" : ""}`}
              >
                <div
                  className="energy-slot-drag-surface"
                  aria-hidden
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const zone = e.currentTarget as HTMLElement;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const slotId = slot.id;
                    let activeDrag = false;
                    try {
                      zone.setPointerCapture(e.pointerId);
                    } catch {
                      /* ignore */
                    }
                    const onMove = (ev: PointerEvent) => {
                      const dx = ev.clientX - startX;
                      const dy = ev.clientY - startY;
                      if (!activeDrag && dx * dx + dy * dy > 36) {
                        activeDrag = true;
                        slotDragDidMoveRef.current = true;
                        setDraggingSlotId(slotId);
                        document.body.classList.add("focus-weekly-focus-dragging");
                        document.body.style.cursor = FOCUS_CURSOR_HAND_GLOW;
                        (document.documentElement as HTMLElement).style.cursor = FOCUS_CURSOR_HAND_GLOW;
                      }
                      if (!activeDrag) return;
                      ev.preventDefault();
                      const el = document.elementFromPoint(ev.clientX, ev.clientY);
                      const raw = el?.closest("[data-energy-slot]")?.getAttribute("data-energy-slot");
                      const rawIdx = el?.closest("[data-energy-slot-index]")?.getAttribute("data-energy-slot-index");
                      if (raw && raw !== slotId) setDragOverSlotId(raw);
                      else if (rawIdx !== null && rawIdx !== undefined) setDragOverSlotId(`idx-${rawIdx}`);
                      else setDragOverSlotId(null);
                    };
                    const onUp = (ev: PointerEvent) => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                      window.removeEventListener("pointercancel", onUp);
                      try {
                        zone.releasePointerCapture(ev.pointerId);
                      } catch {
                        /* ignore */
                      }
                      document.body.classList.remove("focus-weekly-focus-dragging");
                      document.body.style.cursor = "";
                      (document.documentElement as HTMLElement).style.cursor = "";
                      let targetId: string | null = null;
                      let targetIndex: number | null = null;
                      if (activeDrag) {
                        const el = document.elementFromPoint(ev.clientX, ev.clientY);
                        const raw = el?.closest("[data-energy-slot]")?.getAttribute("data-energy-slot");
                        const rawIdx = el?.closest("[data-energy-slot-index]")?.getAttribute("data-energy-slot-index");
                        if (raw && raw !== slotId) targetId = raw;
                        else if (rawIdx !== null && rawIdx !== undefined) targetIndex = Number(rawIdx);
                      }
                      setDraggingSlotId(null);
                      setDragOverSlotId(null);
                      if (activeDrag && targetId) {
                        const ids = state.slots.map((s) => s.id);
                        const from = ids.indexOf(slotId);
                        const to = ids.indexOf(targetId);
                        if (from >= 0 && to >= 0) {
                          const next = [...ids];
                          next.splice(from, 1);
                          next.splice(to, 0, slotId);
                          void reorderSlots(next);
                        }
                      } else if (activeDrag && targetIndex !== null && !Number.isNaN(targetIndex)) {
                        void moveSlotToIndex(slotId, targetIndex);
                      }
                      if (!activeDrag) slotDragDidMoveRef.current = false;
                      else window.setTimeout(() => { slotDragDidMoveRef.current = false; }, 0);
                    };
                    window.addEventListener("pointermove", onMove, { passive: false });
                    window.addEventListener("pointerup", onUp);
                    window.addEventListener("pointercancel", onUp);
                  }}
                />
                <button
                  type="button"
                  className="focus-remove-icon"
                  aria-label="Remove from frame"
                  onClick={() => void removeSlot(slot.id)}
                />
                <div className="energy-slot-content">
                  <p className="energy-slot-title">{slot.name}</p>
                  {slot.description?.trim() ? (
                    <p className="energy-slot-desc">{slot.description.trim()}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`energy-slot-energy-bar diff-border-${tierDifficultyKey(slot.energyTier)}`}
                  onClick={() => void toggleSlotComplete(slot)}
                  title="Mark complete"
                >
                  <span className="energy-slot-bolts" aria-hidden>
                    {tierBolts(slot.energyTier)}
                  </span>
                </button>
              </div>
                ) : (
              <button
                key={`empty-${slotIndex}`}
                type="button"
                className={`energy-slot-add${dragOverSlotId === `idx-${slotIndex}` ? " energy-slot-card--drag-over" : ""}`}
                data-energy-slot-index={slotIndex}
                aria-label={`Add exercise to slot ${slotIndex + 1}`}
                onClick={() => {
                  setPickSlotIndex(slotIndex);
                  setPickExerciseOpen(true);
                }}
              >
                <img className="energy-slot-add-glow" src="/textures/SkillUp-BG.PNG" alt="" />
              </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {pickExerciseOpen && (
        <div className="modal-backdrop" onClick={() => setPickExerciseOpen(false)}>
          <div className="panel modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <h3>Choose an exercise</h3>
            <ul className="energy-pick-list">
              {state.exerciseTypes.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => void addSlot(t.id, pickSlotIndex ?? slotsByIndex.findIndex((s) => s === null))}
                  >
                    {tierBolts(t.energyTier)} {t.name}
                  </button>
                </li>
              ))}
            </ul>
            {state.exerciseTypes.length === 0 && (
              <p className="energy-pick-empty">Add exercises first using Add</p>
            )}
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setPickExerciseOpen(false);
                  setPickSlotIndex(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {exerciseModalOpen && (
        <div className="modal-backdrop modal-stacked" onClick={() => setExerciseModalOpen(false)}>
          <div className="panel modal-card energy-exercise-modal" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <h3>Exercises</h3>

            <div className="energy-type-form">
              <label className="field-label">
                Name
                <input
                  value={typeForm.name}
                  onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))}
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  value={typeForm.description}
                  onChange={(e) => setTypeForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
              <label className="field-label">
                Energy
                <select
                  value={typeForm.energyTier}
                  onChange={(e) => setTypeForm((p) => ({ ...p, energyTier: Number(e.target.value) }))}
                >
                  <option value={1}>⚡ — 10</option>
                  <option value={2}>⚡⚡ — 20</option>
                  <option value={3}>⚡⚡⚡ — 30</option>
                  <option value={4}>⚡⚡⚡⚡ — 40</option>
                </select>
              </label>
              <button type="button" onClick={() => void saveExerciseType()}>
                {editingTypeId ? "Save" : "Add exercise"}
              </button>
            </div>

            <ul className="energy-type-list">
              {state.exerciseTypes.map((t) => (
                <li key={t.id} className="energy-type-list-item">
                  <div>
                    <strong>
                      {tierBolts(t.energyTier)} {t.name}
                    </strong>
                    {t.description ? <p>{t.description}</p> : null}
                  </div>
                  <div className="energy-type-list-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTypeId(t.id);
                        setTypeForm({
                          name: t.name,
                          description: t.description ?? "",
                          energyTier: t.energyTier,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => void deleteExerciseType(t.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="actions">
              <button type="button" onClick={() => setExerciseModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
