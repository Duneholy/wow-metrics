
import React, { useState, useEffect, useRef, useMemo } from "react";
import type { FormEvent } from "react";
import type { 
  GoalCategory, Difficulty, Task, Goal, Subtask, DashboardPayload
} from "../../shared/types";
import { 
  WEEKLY_FOCUS_CAPACITY, FOCUS_CURSOR_HAND_GLOW
} from "./bankUtils";
import { QuestLogDropdown } from "./QuestLogDropdown";
import { QuestLogGoalCard } from "./QuestLogGoalCard";
import { WOWHEAD_ICON_BASE } from "./goalUtils";
import { taskFromServerResponse, weeklyFocusEnergyWarning, GOAL_CATEGORY_LABELS } from "./goalUtils";

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;

export function QuestLogSection({
  dashboard, setDashboard, request, loadDashboard, token, setError,
  openConfirmDialog
}: { dashboard: DashboardPayload | null, setDashboard: any, request: RequestFn, loadDashboard: (opts?: any) => Promise<DashboardPayload | undefined>, token: string | null, setError: (e: string|null) => void, openConfirmDialog: any }) {
  const focusDidPointerDragRef = useRef(false);
  const [expandedGoalCategories, setExpandedGoalCategories] = useState<string[]>([]);
  const [questLogSelectedTaskId, setQuestLogSelectedTaskId] = useState<string | null>(null);
  const questLogSelectedTaskIdRef = useRef<string | null>(null);
  questLogSelectedTaskIdRef.current = questLogSelectedTaskId;
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalForm, setGoalModalForm] = useState<{ title: string; category: GoalCategory; description: string }>({ title: "", category: "PERSONAL", description: "" });
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalForm, setTaskModalForm] = useState<{ title: string; category: GoalCategory; difficulty: Difficulty; description: string; definitionOfDone: string; deadline: string }>({ title: "", category: "PERSONAL", difficulty: "MEDIUM", description: "", definitionOfDone: "", deadline: "" });
  const [weeklyFocusPickOpen, setWeeklyFocusPickOpen] = useState(false);
  const [weeklyFocusPickTaskId, setWeeklyFocusPickTaskId] = useState("");
  const [weeklyFocusPickSlot, setWeeklyFocusPickSlot] = useState<number | null>(null);
  const [focusDraggingTaskId, setFocusDraggingTaskId] = useState<string | null>(null);
  const [focusDragOverSlot, setFocusDragOverSlot] = useState<number | null>(null);
  const [questLogEditTitle, setQuestLogEditTitle] = useState("");
  const [questLogEditDifficulty, setQuestLogEditDifficulty] = useState<Difficulty>("MEDIUM");
  const [questLogEditComment, setQuestLogEditComment] = useState("");
  const [questLogEditDeadline, setQuestLogEditDeadline] = useState("");
  const [questLogEditDoD, setQuestLogEditDoD] = useState("");
  const [questLogEditCategory, setQuestLogEditCategory] = useState<GoalCategory>("PERSONAL");
  const [questLogEditGoalId, setQuestLogEditGoalId] = useState<string | null>(null);
  const [questLogNewSubtaskTitle, setQuestLogNewSubtaskTitle] = useState("");
  const [questLogEditMode, setQuestLogEditMode] = useState(false);
  const questLogTitleInputRef = useRef<HTMLInputElement | null>(null);

  

  async function addGoal() {
    if (!goalModalForm.title.trim()) return;
    await request("/goals", { method: "POST", body: JSON.stringify({ title: goalModalForm.title, category: goalModalForm.category, description: goalModalForm.description }) });
    setGoalModalOpen(false);
    setGoalModalForm({ title: "", category: "PERSONAL", description: "" });
    await loadDashboard();
  }

  async function toggleFocus(taskId: string, options?: { slot?: number }): Promise<boolean> {
    const snap = dashboard;
    if (!snap) return false;
    const cur = snap.tasks.find((t: Task) => t.id === taskId);
    if (!cur) return false;

    if (cur.inFocus) {
      setDashboard((p: any) => {
        if (!p) return p;
        const tasks = p.tasks.map((t: Task) =>
          t.id === taskId ? { ...t, inFocus: false, focusSlot: null } : t
        );
        return { ...p, tasks };
      });
      try {
        await request(`/tasks/${taskId}/toggle-focus`, { method: "PATCH", body: "{}" });
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update Weekly Focus");
        void loadDashboard({ silent: true });
        return false;
      }
    }

    if (cur.isCompleted) {
      setError("Completed tasks cannot be added to Weekly Focus");
      return false;
    }

    setError(null);
    const taken = new Set(
      snap.tasks.filter((t: Task) => t.inFocus).map((t: Task) => t.focusSlot).filter((s: any): s is number => typeof s === "number")
    );
    let slot = options?.slot;
    if (slot === undefined || taken.has(slot)) {
      slot = [0, 1, 2, 3, 4, 5, 6].find((i) => !taken.has(i)) ?? 0;
    }

    setDashboard((p: any) => {
      if (!p) return p;
      const tasks = p.tasks.map((t: Task) => {
        if (t.id === taskId) return { ...t, inFocus: true, focusSlot: slot };
        if (t.inFocus && t.focusSlot === slot && t.id !== taskId) return { ...t, inFocus: false, focusSlot: null };
        return t;
      });
      return { ...p, tasks };
    });

    try {
      await request(`/tasks/${taskId}/toggle-focus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      // Removed loadDashboard to prevent UI blink and redundant network calls
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить Weekly Focus");
      void loadDashboard({ silent: true });
      return false;
    }
  }

  function openWeeklyFocusPicker(slotIndex: number) {
    setWeeklyFocusPickTaskId("");
    setWeeklyFocusPickSlot(slotIndex);
    setWeeklyFocusPickOpen(true);
  }

  async function confirmWeeklyFocusPick() {
    if (!weeklyFocusPickTaskId || weeklyFocusPickSlot === null) return;
    const ok = await toggleFocus(weeklyFocusPickTaskId, { slot: weeklyFocusPickSlot });
    if (ok) {
      setWeeklyFocusPickOpen(false);
      setWeeklyFocusPickTaskId("");
      setWeeklyFocusPickSlot(null);
    }
  }

  async function addRandomWeeklyFocusTask(slotIndex: number) {
    const pool = (dashboard?.tasks ?? []).filter((t: Task) => !t.inFocus && !t.isCompleted);
    if (pool.length === 0) {
      setError("No active tasks outside Weekly Focus");
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await toggleFocus(pick.id, { slot: slotIndex });
  }

  async function reorderFocusInWeekly(draggedId: string, targetSlot: number, sourceSlot: number) {
    if (targetSlot === sourceSlot) {
      setFocusDraggingTaskId(null);
      setFocusDragOverSlot(null);
      return;
    }
    const snap = dashboard;
    if (!snap) return;
    const dragged = snap.tasks.find((t: Task) => t.id === draggedId);
    if (!dragged?.inFocus) return;
    const other = snap.tasks.find((t: Task) => t.inFocus && t.focusSlot === targetSlot && t.id !== draggedId);

    setDashboard((prev: any) => {
      if (!prev) return prev;
      const tasks = prev.tasks.map((t: Task) => {
        if (t.id === draggedId) return { ...t, focusSlot: targetSlot };
        if (other && t.id === other.id) return { ...t, focusSlot: sourceSlot };
        return t;
      });
      return { ...prev, tasks };
    });

    try {
      await request<unknown>(`/tasks/${draggedId}/reorder-focus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSlot }),
      });
      void loadDashboard({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder Weekly Focus");
      void loadDashboard({ silent: true });
    } finally {
      setFocusDraggingTaskId(null);
      setFocusDragOverSlot(null);
    }
  }

  function newTaskModalDefaults(category: GoalCategory) {
    return {
      title: "",
      category,
      difficulty: "MEDIUM" as Difficulty,
      description: "",
      definitionOfDone: "",
      deadline: "",
    };
  }

  function openNewTaskModal(category: GoalCategory) {
    setTaskModalForm(newTaskModalDefaults(category));
    setTaskModalOpen(true);
  }

  async function submitTaskModal() {
    if (!taskModalOpen || !taskModalForm.title.trim()) return;
    const category = taskModalForm.category;
    const payload = {
      title: taskModalForm.title.trim(),
      category: taskModalForm.category,
      difficulty: taskModalForm.difficulty,
      comment: taskModalForm.description || undefined,
      definitionDone: taskModalForm.definitionOfDone || undefined,
      deadline: taskModalForm.deadline || undefined,
    };
    try {
      const created = await request<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) });
      const normalized = taskFromServerResponse(created);
      setTaskModalOpen(false);
      setTaskModalForm(newTaskModalDefaults("PERSONAL"));
      setExpandedGoalCategories((prev: any) => (prev.includes(category) ? prev : [...prev, category]));

      setDashboard((prev: any) => {
        if (!prev) return prev;
        const tasks = [...prev.tasks, normalized];
        const completedTasks = tasks.filter((t: Task) => t.isCompleted).length;
        return {
          ...prev,
          tasks,
          weekProgress: `${completedTasks}/${tasks.length}`,
        };
      });

      setQuestLogSelectedTaskId(normalized.id);
      applyQuestLogTaskToEditors(normalized);

      void loadDashboard({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  }

  async function completeTask(taskId: string) {
    // Optimistic update — flip isCompleted instantly in local state
    setDashboard((prev: any) => {
      if (!prev) return prev;
      const toggle = (t: typeof prev.tasks[0]) =>
        t.id === taskId ? { ...t, isCompleted: !t.isCompleted, progress: !t.isCompleted ? 100 : 0 } : t;
      return {
        ...prev,
        tasks: prev.tasks.map(toggle),
      };
    });
    try {
      await request(`/tasks/${taskId}/complete`, { method: "PATCH" });
      // Silent background refresh to sync XP / level changes
      const data = await request<DashboardPayload>("/dashboard");
      setDashboard(data);
    } catch (e) {
      // Revert on error
      setDashboard((prev: any) => {
        if (!prev) return prev;
        const revert = (t: typeof prev.tasks[0]) =>
          t.id === taskId ? { ...t, isCompleted: !t.isCompleted, progress: !t.isCompleted ? 100 : 0 } : t;
        return { ...prev, tasks: prev.tasks.map(revert) };
      });
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  }

  function toggleGoalCategory(category: string) {
    setExpandedGoalCategories((prev: any) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function applyQuestLogTaskToEditors(task: Task) {
    setQuestLogEditMode(false);
    setQuestLogEditTitle(task.title);
    setQuestLogEditDifficulty(task.difficulty);
    setQuestLogEditCategory(task.category);
    setQuestLogEditGoalId(task.goalId);
    setQuestLogEditComment(task.comment ?? "");
    setQuestLogEditDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setQuestLogEditDoD(task.definitionDone ?? "");
  }

  function selectQuestLogTask(taskId: string) {
    setQuestLogSelectedTaskId(taskId);
    const task = dashboard?.tasks.find((t: Task) => t.id === taskId);
    if (task) applyQuestLogTaskToEditors(task);
  }

  async function saveQuestLogTask(
    taskId: string,
    overrides?: Partial<{
      title: string;
      difficulty: Difficulty;
      goalId: string | null;
      category: GoalCategory;
      comment: string;
      deadline: string;
      definitionDone: string;
    }>
  ) {
    const o = overrides ?? {};
    const payload: Record<string, unknown> = {
      title: o.title ?? questLogEditTitle,
      difficulty: o.difficulty ?? questLogEditDifficulty,
      goalId: o.goalId !== undefined ? o.goalId : questLogEditGoalId,
      comment: o.comment ?? questLogEditComment,
      deadline: o.deadline !== undefined ? o.deadline : questLogEditDeadline,
      definitionDone: o.definitionDone ?? questLogEditDoD,
    };
    if (o.category !== undefined) {
      payload.category = o.category;
    }
    await request(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await loadDashboard();
    if (data && questLogSelectedTaskIdRef.current === taskId) {
      const t = data.tasks.find((tt: Task) => tt.id === taskId);
      if (t) applyQuestLogTaskToEditors(t);
    }
  }

  useEffect(() => {
    if (!questLogEditMode) return;
    const el = questLogTitleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [questLogEditMode]);

  async function saveQuestLogEditAndClose(taskId: string) {
    const trimmed = questLogEditTitle.trim();
    if (!trimmed) {
      setError("Enter a task title");
      return;
    }
    try {
      await saveQuestLogTask(taskId);
      setQuestLogEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save task");
    }
  }

  function cancelQuestLogEdit(task: Task) {
    applyQuestLogTaskToEditors(task);
  }

  async function deleteQuestLogTask(taskId: string) {
    const ok = await openConfirmDialog("Delete this task? This cannot be undone.");
    if (!ok) return;
    setDashboard(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) } : prev);
    setQuestLogSelectedTaskId(null);
    try {
      await request(`/tasks/${taskId}`, { method: "DELETE" });
    } finally {
      await loadDashboard();
    }
  }

  async function addQuestLogSubtask(taskId: string) {
    if (!questLogNewSubtaskTitle.trim()) return;
    await request(`/tasks/${taskId}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ title: questLogNewSubtaskTitle }),
    });
    setQuestLogNewSubtaskTitle("");
    const data = await request<DashboardPayload>("/dashboard");
    setDashboard(data);
  }

  async function completeQuestLogSubtask(subtaskId: string) {
    await request(`/subtasks/${subtaskId}/complete`, { method: "PATCH" });
    const data = await request<DashboardPayload>("/dashboard");
    setDashboard(data);
  }

  async function deleteQuestLogSubtask(subtaskId: string) {
    await request(`/subtasks/${subtaskId}`, { method: "DELETE" });
    const data = await request<DashboardPayload>("/dashboard");
    setDashboard(data);
  }


  

  const categories: GoalCategory[] = ["FINANCIAL", "EDUCATION", "CAREER", "FAMILY", "PERSONAL", "SPORT"];

        const selectedTask = dashboard?.tasks.find(t => t.id === questLogSelectedTaskId);
        const linkedGoal = (() => {
          if (!selectedTask) return null;
          const gid = questLogEditGoalId ?? selectedTask.goalId;
          if (!gid) return null;
          return dashboard?.goals.find((x: Goal) => x.id === gid) ?? null;
        })();

        const focusList = dashboard?.tasks.filter((t: Task) => t.inFocus && !t.isCompleted).sort((a: any, b: any) => (a.focusSlot ?? 99) - (b.focusSlot ?? 99)) ?? [];
        const slotMap = new Map<number, Task>();
        const legacyFocus: Task[] = [];
        for (const t of focusList) {
          if (typeof t.focusSlot === "number" && t.focusSlot >= 0 && t.focusSlot < 7) slotMap.set(t.focusSlot, t);
          else legacyFocus.push(t);
        }
        let legacyIdx = 0;
        for (let i = 0; i < WEEKLY_FOCUS_CAPACITY; i++) {
          if (!slotMap.has(i) && legacyIdx < legacyFocus.length) {
            slotMap.set(i, legacyFocus[legacyIdx++]!);
          }
        }

        const userEnergy = dashboard?.user.energy ?? 100;

        

  return (
          <>
          <section className="panel-inverse bank-tab-section goals-tab-section">
            <div className="goals-page-air">
              
              {/* Weekly Focus Block outside of auction shell */}
              <div className="quest-log-focus">
                <h2 className="auction-shell-title weekly-focus-title">Weekly Focus</h2>
                <div className="focus-tasks-container">
                  {Array.from({ length: WEEKLY_FOCUS_CAPACITY }, (_, slotIndex) => {
                    const task = slotMap.get(slotIndex);
                    if (task) {
                      const energyWarn = null;
                      return (
                        <div
                          key={task.id}
                          data-focus-slot={slotIndex}
                          className={`focus-task-card focus-task-card--draggable diff-border-${task.difficulty.toLowerCase()} ${task.isCompleted ? "completed" : ""}${energyWarn ? " focus-task-card--energy-warning" : ""}${focusDraggingTaskId === task.id ? " focus-task-card--drag-source" : ""}${focusDragOverSlot === slotIndex ? " focus-task-card--drag-over" : ""}`}
                          title="Drag left or right to reorder"
                        >
                          <div
                            className="focus-task-drag-surface"
                            aria-hidden
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              const zone = e.currentTarget as HTMLElement;
                              const startX = e.clientX;
                              const startY = e.clientY;
                              const taskId = task.id;
                              const sourceSlot = slotIndex;
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
                                focusDidPointerDragRef.current = true;
                                setFocusDraggingTaskId(taskId);
                                document.body.classList.add("focus-weekly-focus-dragging");
                                document.body.style.cursor = FOCUS_CURSOR_HAND_GLOW;
                                (document.documentElement as HTMLElement).style.cursor = FOCUS_CURSOR_HAND_GLOW;
                              }
                              if (!activeDrag) return;
                              ev.preventDefault();
                              const el = document.elementFromPoint(ev.clientX, ev.clientY);
                              const raw = el?.closest("[data-focus-slot]")?.getAttribute("data-focus-slot");
                              const sl = raw != null ? Number.parseInt(raw, 10) : NaN;
                              setFocusDragOverSlot(
                                Number.isFinite(sl) && sl >= 0 && sl < WEEKLY_FOCUS_CAPACITY ? sl : null
                              );
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
                              let targetSlot: number | null = null;
                              if (activeDrag) {
                                const el = document.elementFromPoint(ev.clientX, ev.clientY);
                                const raw = el?.closest("[data-focus-slot]")?.getAttribute("data-focus-slot");
                                const sl = raw != null ? Number.parseInt(raw, 10) : NaN;
                                if (Number.isFinite(sl) && sl >= 0 && sl < WEEKLY_FOCUS_CAPACITY) targetSlot = sl;
                              }
                              setFocusDraggingTaskId(null);
                              setFocusDragOverSlot(null);
                              if (activeDrag && targetSlot !== null && targetSlot !== sourceSlot) {
                                void reorderFocusInWeekly(taskId, targetSlot, sourceSlot);
                              }
                              if (!activeDrag) {
                                focusDidPointerDragRef.current = false;
                              } else {
                                window.setTimeout(() => {
                                  focusDidPointerDragRef.current = false;
                                }, 0);
                              }
                            };
                            window.addEventListener("pointermove", onMove, { passive: false });
                            window.addEventListener("pointerup", onUp);
                            window.addEventListener("pointercancel", onUp);
                          }}
                          />
                          <div className="focus-task-card-inner">
                            <span
                              className="focus-task-title"
                              title={task.comment?.trim() ? task.comment.trim() : undefined}
                              onClick={(ev) => {
                                if (focusDidPointerDragRef.current) {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  return;
                                }
                                selectQuestLogTask(task.id);
                              }}
                            >
                              {energyWarn ? (
                                <span className="focus-task-warn-icon" aria-hidden="true">
                                  ⚠️{" "}
                                </span>
                              ) : null}
                              {task.title}
                            </span>
                            <div className="focus-actions">
                              <button
                                type="button"
                                className={`complete-btn${task.isCompleted ? " is-done" : ""}`}
                                onClick={() => completeTask(task.id)}
                              >
                                {task.isCompleted ? "Done" : "Complete"}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="focus-remove-icon"
                            onClick={() => void toggleFocus(task.id)}
                            title="Remove from focus"
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`focus-empty-${slotIndex}`}
                        data-focus-slot={slotIndex}
                        className={`focus-task-card focus-task-card--empty${focusDragOverSlot === slotIndex ? " focus-task-card--drag-over" : ""}`}
                      >
                        <button
                          type="button"
                          className="focus-random-icon"
                          title="Random task from the list"
                          aria-label="Random task from the list"
                          onClick={() => void addRandomWeeklyFocusTask(slotIndex)}
                        >
                          <img src="/textures/UI-GroupLoot-Dice-Up.PNG" alt="" />
                        </button>
                        <button
                          type="button"
                          className="focus-empty-plus-btn"
                          draggable={false}
                          aria-label="Add task to Weekly Focus"
                          onClick={() => openWeeklyFocusPicker(slotIndex)}
                        >
                          <img className="focus-empty-plus-icon" src="/textures/SkillUp-BG.PNG" alt="" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="auction-shell-wrap">
                <div className="auction-shell" style={{ height: "auto", minHeight: "700px" }}>
                  <span className="af-tl" aria-hidden="true" />
                  <span className="af-top" aria-hidden="true" />
                  <span className="af-tr" aria-hidden="true" />
                  <span className="af-bl" aria-hidden="true" />
                  <span className="af-bot" aria-hidden="true" />
                  <span className="af-br" aria-hidden="true" />
                  <img className="auction-portrait-coin" src={`${WOWHEAD_ICON_BASE}/inv_misc_book_09.png`} alt="" />
                  <div className="auction-shell-header">
                    <span className="auction-shell-title">Quest Log</span>
                    <span className="auction-shell-subtitle" aria-hidden="true" />
                  </div>
                  <div className="auction-shell-body" style={{ paddingBottom: "24px" }}>
                    <div className="quest-log-page">
                      <section className="quest-log-book">
                        <div className="quest-log-left">
                          <div className="quest-log-header">
                            <h3>Categories and tasks</h3>
                            <button type="button" onClick={() => openNewTaskModal("PERSONAL")}>Add task</button>
                          </div>
                <div className="quest-tree">
                  {categories.map((cat) => {
                    const catTasks = (dashboard?.tasks ?? [])
                      .filter((t: Task) => t.category === cat)
                      .slice()
                      .sort((a: any, b: any) => {
                        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
                        return a.title.localeCompare(b.title, "ru");
                      });
                    const isCatExpanded = expandedGoalCategories.includes(cat);
                    return (
                      <div key={cat} className="quest-category-node">
                        <div className="quest-tree-item category-row" onClick={() => toggleGoalCategory(cat)}>
                          <img className="expand-icon-img" src={isCatExpanded ? "/textures/UI-PlusButton-Down.PNG" : "/textures/UI-PlusButton-Up.PNG"} alt="" />
                          <span className="category-name">{cat}</span>
                        </div>
                        {isCatExpanded && (
                          <div className="quest-category-children">
                            {catTasks.map(task => (
                              <div
                                key={task.id}
                                className={`quest-tree-item task-row diff-${task.difficulty.toLowerCase()} ${questLogSelectedTaskId === task.id ? "selected" : ""} ${task.isCompleted ? "task-row--completed" : ""}`}
                                onClick={() => selectQuestLogTask(task.id)}
                              >
                                <span className={`task-name${task.isCompleted ? " completed-text" : ""}`}>
                                  {task.title}
                                </span>
                                {task.inFocus ? (
                                  <img
                                    className="focus-checkmark"
                                    src="/textures/UI-CheckBox-Check.PNG"
                                    alt=""
                                  />
                                ) : null}
                              </div>
                            ))}
                            <div
                              className="quest-tree-item add-task-row"
                              onClick={(e) => {
                                e.stopPropagation();
                                openNewTaskModal(cat as GoalCategory);
                              }}
                            >
                              + Add Task
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="quest-log-right">
                {selectedTask ? (
                  <div className={`quest-details${questLogEditMode ? " quest-details--editing" : " quest-details--view"}`}>
                    <div className="quest-details-header">
                      <div className="quest-details-title-row">
                        <button
                          type="button"
                          className={`quest-focus-micro${selectedTask.inFocus ? " quest-focus-micro--active" : ""}`}
                          aria-label={
                            selectedTask.inFocus
                              ? "Remove from Weekly Focus"
                              : "Add to Weekly Focus"
                          }
                          title={
                            !selectedTask.inFocus && selectedTask.isCompleted
                              ? "Completed tasks cannot be added to Weekly Focus"
                              : selectedTask.inFocus
                                ? "Remove from Weekly Focus"
                                : "Add to Weekly Focus"
                          }
                          disabled={!selectedTask.inFocus && selectedTask.isCompleted}
                          onClick={() => void toggleFocus(selectedTask.id)}
                        >
                          <img
                            src={
                              selectedTask.inFocus
                                ? "/textures/UI-MICROBUTTON-QUEST-DOWN.PNG"
                                : "/textures/UI-MICROBUTTON-QUEST-UP.PNG"
                            }
                            alt=""
                          />
                        </button>
                        {questLogEditMode ? (
                          <input
                            ref={questLogTitleInputRef}
                            value={questLogEditTitle}
                            onChange={(e) => setQuestLogEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelQuestLogEdit(selectedTask);
                              }
                            }}
                            className="invisible-input quest-title-input"
                          />
                        ) : (
                          <span className="quest-details-title-readonly">{selectedTask.title}</span>
                        )}
                        {questLogEditMode ? (
                          <div className="quest-details-edit-actions">
                            <button
                              type="button"
                              className="quest-details-title-save"
                              onClick={() => void saveQuestLogEditAndClose(selectedTask.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="secondary quest-details-title-cancel"
                              onClick={() => cancelQuestLogEdit(selectedTask)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="quest-details-rename-gear"
                            aria-label="Edit task"
                            title="Edit"
                            onClick={() => {
                              applyQuestLogTaskToEditors(selectedTask);
                              setQuestLogEditMode(true);
                            }}
                          >
                            <img src="/textures/QuestTaskRename.png" alt="" width={20} height={20} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="quest-description">
                      <h3>Goal</h3>
                      {questLogEditMode ? (
                        <>
                          <QuestLogDropdown
                            className="quest-log-dropdown--spaced"
                            ariaLabel="Link to goal"
                            value={questLogEditGoalId ?? ""}
                            options={[
                              { value: "", label: "None (Standalone Task)" },
                              ...[...(dashboard?.goals ?? [])]
                                .sort(
                                  (a: any, b: any) =>
                                    a.category.localeCompare(b.category) ||
                                    a.title.localeCompare(b.title)
                                )
                                .map((g) => ({
                                  value: g.id,
                                  label: `${GOAL_CATEGORY_LABELS[g.category]} — ${g.title}`,
                                })),
                            ]}
                            onChange={(newGoalId) => {
                              setQuestLogEditGoalId(newGoalId === "" ? null : newGoalId);
                            }}
                          />
                          {linkedGoal ? (
                            <div className="quest-goal-card-wrap">
                              <QuestLogGoalCard goal={linkedGoal} tasks={dashboard?.tasks ?? []} />
                            </div>
                          ) : (
                            <p className="quest-field-readonly quest-goal-standalone">None (Standalone Task)</p>
                          )}
                        </>
                      ) : linkedGoal ? (
                        <QuestLogGoalCard goal={linkedGoal} tasks={dashboard?.tasks ?? []} />
                      ) : (
                        <p className="quest-field-readonly quest-goal-standalone">None (Standalone Task)</p>
                      )}

                      <h3>Description</h3>
                      {questLogEditMode ? (
                        <textarea
                          placeholder="Task notes..."
                          value={questLogEditComment}
                          onChange={(e) => setQuestLogEditComment(e.target.value)}
                          className="standard-textarea"
                        />
                      ) : (
                        <p className="quest-field-readonly quest-field-readonly--block">
                          {questLogEditComment.trim() || "—"}
                        </p>
                      )}

                      <h3>Definition of Done</h3>
                      {questLogEditMode ? (
                        <textarea
                          placeholder="What must be true for this task to count as done?"
                          value={questLogEditDoD}
                          onChange={(e) => setQuestLogEditDoD(e.target.value)}
                          className="standard-textarea"
                        />
                      ) : (
                        <p className="quest-field-readonly quest-field-readonly--block">
                          {questLogEditDoD.trim() || "—"}
                        </p>
                      )}

                      <h3>Deadline</h3>
                      {questLogEditMode ? (
                        <input
                          type="date"
                          value={questLogEditDeadline}
                          onChange={(e) => setQuestLogEditDeadline(e.target.value)}
                        />
                      ) : (
                        <p className="quest-field-readonly">
                          {questLogEditDeadline
                            ? new Date(
                                questLogEditDeadline.includes("T")
                                  ? questLogEditDeadline
                                  : `${questLogEditDeadline}T12:00:00`
                              ).toLocaleDateString("en-US", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </p>
                      )}
                    </div>

                    <div className="quest-subtasks">
                      <h3>Subtasks</h3>
                      <ul>
                        {[...(selectedTask.subtasks ?? [])]
                          .sort((a: any, b: any) => {
                            const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
                            const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
                            return ta - tb;
                          })
                          .map((st) => (
                            <li key={st.id}>
                              <label className="quest-subtask-check">
                                <input
                                  type="checkbox"
                                  checked={st.isCompleted}
                                  onChange={() => completeQuestLogSubtask(st.id)}
                                />
                              </label>
                              <span className={st.isCompleted ? "completed-text" : ""}>{st.title}</span>
                              {questLogEditMode ? (
                                <button
                                  className="subtask-delete-btn"
                                  onClick={() => deleteQuestLogSubtask(st.id)}
                                  title="Delete subtask"
                                >
                                  🗑
                                </button>
                              ) : null}
                            </li>
                          ))}
                      </ul>
                      {questLogEditMode ? (
                        <div className="quest-log-add-inline">
                          <input
                            placeholder="Add Subtask..."
                            value={questLogNewSubtaskTitle}
                            onChange={(e) => setQuestLogNewSubtaskTitle(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && addQuestLogSubtask(selectedTask.id)
                            }
                          />
                          <button type="button" onClick={() => addQuestLogSubtask(selectedTask.id)}>
                            +
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {questLogEditMode ? (
                      <div className="quest-description quest-description--meta">
                        <h3>Category</h3>
                        <QuestLogDropdown
                          ariaLabel="Task category"
                          value={questLogEditCategory}
                          options={(
                            [
                              "FINANCIAL",
                              "EDUCATION",
                              "CAREER",
                              "FAMILY",
                              "PERSONAL",
                              "SPORT",
                            ] as const
                          ).map((c) => ({ value: c, label: GOAL_CATEGORY_LABELS[c] }))}
                          onChange={(v) => setQuestLogEditCategory(v as GoalCategory)}
                        />

                        <h3>Difficulty</h3>
                        <QuestLogDropdown
                          ariaLabel="Difficulty"
                          value={questLogEditDifficulty}
                          options={[
                            { value: "EASY", label: "Easy" },
                            { value: "MEDIUM", label: "Medium" },
                            { value: "HARD", label: "Hard" },
                            { value: "EPIC", label: "Epic" },
                          ]}
                          onChange={(v) => setQuestLogEditDifficulty(v as Difficulty)}
                        />
                      </div>
                    ) : null}

                    <div className="quest-rewards">
                      <h3>Rewards</h3>
                      <p>You will receive: <strong>{selectedTask.xpReward} XP</strong></p>
                      <div className="wow-progress-bar">
                        <div className="wow-progress-fill" style={{ width: `${selectedTask.progress ?? 0}%` }}></div>
                        <span className="wow-progress-text">{selectedTask.progress ?? 0}%</span>
                      </div>
                    </div>

                    <div className="quest-actions">
                      <button className="abandon-btn" onClick={() => deleteQuestLogTask(selectedTask.id)}>Delete</button>
                      <button
                        className={selectedTask.isCompleted ? "is-done" : ""}
                        onClick={() => completeTask(selectedTask.id)}
                        style={selectedTask.isCompleted ? { background: "#313131", borderColor: "#444", color: "#aaa" } : {}}
                      >{selectedTask.isCompleted ? "Done" : "Complete"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="quest-details-empty">
                    <p>Select a quest from the Quest Log on the left.</p>
                  </div>
                )}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </section>
{goalModalOpen && (
        <div className="modal-backdrop" onClick={() => setGoalModalOpen(false)}>
          <div className="panel modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3>New Goal</h3>
            <div className="modal-grid" style={{ display: 'grid', gap: '12px' }}>
              <label className="field-label">
                Goal Title
                <input value={goalModalForm.title} onChange={(e) => setGoalModalForm({ ...goalModalForm, title: e.target.value })} />
              </label>
              <label className="field-label">
                Category
                <select value={goalModalForm.category} onChange={(e) => setGoalModalForm({ ...goalModalForm, category: e.target.value as GoalCategory })}>
                  <option value="FINANCIAL">Financial</option>
                  <option value="EDUCATION">Education</option>
                  <option value="CAREER">Career</option>
                  <option value="FAMILY">Family</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="SPORT">Sport</option>
                </select>
              </label>
              <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea value={goalModalForm.description} onChange={(e) => setGoalModalForm({ ...goalModalForm, description: e.target.value })} />
              </label>
            </div>
            <div className="actions" style={{ marginTop: '16px' }}>
              <button type="button" onClick={() => setGoalModalOpen(false)}>Cancel</button>
              <button type="button" onClick={addGoal}>Save</button>
            </div>
          </div>
        </div>
      )}
      
      {weeklyFocusPickOpen && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setWeeklyFocusPickOpen(false);
            setWeeklyFocusPickSlot(null);
          }}
        >
          <div className="panel modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3>Add to Weekly Focus</h3>
            <div className="modal-grid" style={{ display: "grid", gap: "12px" }}>
              <label className="field-label">
                Task
                <select value={weeklyFocusPickTaskId} onChange={(e) => setWeeklyFocusPickTaskId(e.target.value)}>
                  <option value="">— select a task —</option>
                  {(dashboard?.tasks ?? [])
                    .filter((t) => !t.inFocus && !t.isCompleted)
                    .slice()
                    .sort((a, b) => a.title.localeCompare(b.title, "ru"))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="actions" style={{ marginTop: "16px" }}>
              <button type="button" onClick={() => { setWeeklyFocusPickOpen(false); setWeeklyFocusPickSlot(null); }}>Cancel</button>
              <button
                type="button"
                disabled={!weeklyFocusPickTaskId || weeklyFocusPickSlot === null}
                onClick={() => void confirmWeeklyFocusPick()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {taskModalOpen && (
        <div className="modal-backdrop" onClick={() => { setTaskModalOpen(false); setTaskModalForm(newTaskModalDefaults("PERSONAL")); }}>
          <div className="panel modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3>New Task</h3>
            <div className="modal-grid" style={{ display: 'grid', gap: '12px', gridTemplateColumns: '1fr 1fr' }}>
              <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                Task Title
                <input value={taskModalForm.title} onChange={(e) => setTaskModalForm({ ...taskModalForm, title: e.target.value })} />
              </label>
              <label className="field-label">
                Category
                <select value={taskModalForm.category} onChange={(e) => setTaskModalForm({ ...taskModalForm, category: e.target.value as GoalCategory })}>
                  <option value="FINANCIAL">Financial</option>
                  <option value="EDUCATION">Education</option>
                  <option value="CAREER">Career</option>
                  <option value="FAMILY">Family</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="SPORT">Sport</option>
                </select>
              </label>
              <label className="field-label">
                Difficulty
                <select value={taskModalForm.difficulty} onChange={(e) => setTaskModalForm({ ...taskModalForm, difficulty: e.target.value as Difficulty })} className={`diff-${taskModalForm.difficulty.toLowerCase()}`}>
                  <option value="EASY" className="diff-easy">Easy</option>
                  <option value="MEDIUM" className="diff-medium">Medium</option>
                  <option value="HARD" className="diff-hard">Hard</option>
                  <option value="EPIC" className="diff-epic">Epic</option>
                </select>
              </label>
              <label className="field-label">
                Deadline
                <input type="date" value={taskModalForm.deadline} onChange={(e) => setTaskModalForm({ ...taskModalForm, deadline: e.target.value })} />
              </label>
              <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea value={taskModalForm.description} onChange={(e) => setTaskModalForm({ ...taskModalForm, description: e.target.value })} />
              </label>
              <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                Definition of Done
                <textarea value={taskModalForm.definitionOfDone} onChange={(e) => setTaskModalForm({ ...taskModalForm, definitionOfDone: e.target.value })} />
              </label>
            </div>
            <div className="actions" style={{ marginTop: '16px' }}>
              <button type="button" onClick={() => { setTaskModalOpen(false); setTaskModalForm(newTaskModalDefaults("PERSONAL")); }}>Cancel</button>
              <button type="button" onClick={() => void submitTaskModal()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
