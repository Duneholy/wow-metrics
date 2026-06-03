import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  GOAL_PRIORITIES,
  WOWHEAD_ICON_BASE,
  type Goal,
  type GoalCategory,
  type GoalPriority,
  type Task,
  sortGoalsForDisplay,
  daysUntilDeadline,
  difficultyColor,
  difficultyLabel,
  firstGoalTask,
  formatGoalCompletedDate,
  formatDaysUntilDeadline,
  goalEnergyGaugeStyle,
  goalIconUrl,
  goalTasksList,
  truncateText,
  goalEnergyFromTasks,
  averageGoalDifficulty,
} from "./goalUtils";

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;

type GoalEditorForm = {
  title: string;
  category: GoalCategory;
  priority: GoalPriority;
  iconName: string;
  description: string;
  definitionDone: string;
  resources: string;
  deadline: string;
};

function GoalField({
  label,
  readOnly,
  value,
  wide,
  children,
}: {
  label: string;
  readOnly: boolean;
  value: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field-label${wide ? " field-label--wide" : ""}`}>
      <span className="my-goal-field-caption">{label}</span>
      {readOnly ? <span className="my-goal-field-readonly">{value}</span> : children}
    </label>
  );
}

type EnergyPayload = {
  energy: number;
  weekKey: string;
  energyAtWeekStart: number;
  spentWeek: number;
  gainedWeek: number;
  flags: import("./EnergyBar").EnergyFlags;
};

type MyGoalsSectionProps = {
  goals: Goal[];
  tasks: Task[];
  request: RequestFn;
  onRefresh: () => void | Promise<void>;
  onNewGoal: () => void;
  onEnergyChange?: (energy: number) => void;
  onEnergyUpdate?: (payload: EnergyPayload) => void;
  onGoalPatched?: (goal: Goal) => void;
  openConfirmDialog?: (message: string) => Promise<boolean>;
  onGoalDeleted?: (goalId: string) => void;
};

function goalToEditor(goal: Goal): GoalEditorForm {
  const deadline = goal.deadline
    ? goal.deadline.includes("T")
      ? goal.deadline.slice(0, 10)
      : goal.deadline
    : "";
  return {
    title: goal.title,
    category: goal.category,
    priority: goal.priority ?? "-",
    iconName: goal.iconName ?? "",
    description: goal.description ?? "",
    definitionDone: goal.definitionDone ?? "",
    resources: goal.resources ?? "",
    deadline,
  };
}

export function MyGoalsSection({
  goals,
  tasks,
  request,
  onRefresh,
  onNewGoal,
  onEnergyChange,
  onEnergyUpdate,
  onGoalPatched,
  openConfirmDialog,
  onGoalDeleted,
}: MyGoalsSectionProps) {
  const [categoryFilter, setCategoryFilter] = useState<GoalCategory | "ALL">("ALL");
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editor, setEditor] = useState<GoalEditorForm | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [assignTaskId, setAssignTaskId] = useState("");
  const [completingGoalId, setCompletingGoalId] = useState<string | null>(null);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState("");
  const [iconResults, setIconResults] = useState<string[]>([]);
  const [iconLoading, setIconLoading] = useState(false);
  const [iconHasMore, setIconHasMore] = useState(true);
  const [iconOffset, setIconOffset] = useState(0);

  const filteredGoals = useMemo(() => {
    let list = goals;
    if (categoryFilter !== "ALL") {
      list = list.filter((g) => g.category === categoryFilter);
    }
    return sortGoalsForDisplay(list);
  }, [goals, categoryFilter]);

  const closeGoal = useCallback(() => {
    setExpandedGoalId(null);
    setEditingGoalId(null);
    setEditor(null);
    setAssignTaskId("");
  }, []);

  const openGoal = useCallback(
    (goal: Goal) => {
      if (expandedGoalId === goal.id) {
        closeGoal();
        return;
      }
      setExpandedGoalId(goal.id);
      setEditingGoalId(null);
      setEditor(goalToEditor(goal));
      setAssignTaskId("");
    },
    [expandedGoalId, closeGoal]
  );

  const startEdit = useCallback(() => {
    if (expandedGoalId) setEditingGoalId(expandedGoalId);
  }, [expandedGoalId]);

  const cancelEdit = useCallback(() => {
    const goal = goals.find((g) => g.id === expandedGoalId);
    if (goal) setEditor(goalToEditor(goal));
    setEditingGoalId(null);
    setAssignTaskId("");
  }, [expandedGoalId, goals]);

  useEffect(() => {
    if (!expandedGoalId || editingGoalId) return;
    const goal = goals.find((g) => g.id === expandedGoalId);
    if (goal) setEditor(goalToEditor(goal));
  }, [goals, expandedGoalId, editingGoalId]);

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
  }, [iconPickerOpen, iconQuery, request]);

  const loadMoreIcons = async () => {
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
  };

  const saveGoal = async (goalId: string) => {
    const snapshot = editor;
    if (!snapshot) return;
    const payload = {
      title: snapshot.title.trim(),
      category: snapshot.category,
      priority: snapshot.priority,
      iconName: snapshot.iconName.trim() || null,
      description: snapshot.description.trim() || undefined,
      definitionDone: snapshot.definitionDone.trim() || undefined,
      resources: snapshot.resources.trim() || undefined,
      deadline: snapshot.deadline || null,
    };
    const updated = await request<Goal>(`/goals/${goalId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setEditor(goalToEditor(updated));
    setEditingGoalId(null);
    onGoalPatched?.(updated);
    await onRefresh();
  };

  const saveGoalIcon = async (goalId: string, iconName: string) => {
    const updated = await request<Goal>(`/goals/${goalId}`, {
      method: "PATCH",
      body: JSON.stringify({ iconName: iconName.trim() || null }),
    });
    setEditor((prev) => (prev ? { ...prev, iconName: updated.iconName ?? "" } : prev));
    onGoalPatched?.(updated);
  };

  const completeGoal = async (goalId: string) => {
    setCompletingGoalId(goalId);
    try {
      const res = await request<{ energy?: EnergyPayload }>(`/goals/${goalId}/complete`, {
        method: "POST",
      });
      if (res.energy) {
        onEnergyUpdate?.(res.energy);
        onEnergyChange?.(res.energy.energy);
      }
      setExpandedGoalId(null);
      setEditor(null);
      await onRefresh();
    } finally {
      setCompletingGoalId(null);
    }
  };

  const uncompleteGoal = async (goalId: string) => {
    setCompletingGoalId(goalId);
    try {
      const res = await request<{ energy?: EnergyPayload }>(`/goals/${goalId}/uncomplete`, {
        method: "POST",
      });
      if (res.energy) {
        onEnergyUpdate?.(res.energy);
        onEnergyChange?.(res.energy.energy);
      }
      await onRefresh();
    } finally {
      setCompletingGoalId(null);
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (openConfirmDialog) {
      const ok = await openConfirmDialog("Delete this goal? This cannot be undone.");
      if (!ok) return;
    } else {
      if (!confirm("Delete this goal?")) return;
    }
    if (onGoalDeleted) onGoalDeleted(goalId);
    if (expandedGoalId === goalId) {
      closeGoal();
    }
    try {
      await request(`/goals/${goalId}`, { method: "DELETE" });
    } finally {
      await onRefresh();
    }
  };

  const goalTasks = (goal: Goal): Task[] => goalTasksList(goal, tasks);

  const reorderTasks = async (goalId: string, orderedIds: string[]) => {
    await request(`/goals/${goalId}/tasks/reorder`, {
      method: "POST",
      body: JSON.stringify({ taskIds: orderedIds }),
    });
    await onRefresh();
  };

  const unlinkTask = async (taskId: string) => {
    await request(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ goalId: null }),
    });
    await onRefresh();
  };

  const assignTask = async (goalId: string) => {
    if (!assignTaskId) return;
    await request(`/tasks/${assignTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ goalId }),
    });
    setAssignTaskId("");
    await onRefresh();
  };

  const onTaskDragStart = (taskId: string) => (e: DragEvent) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  };

  const onTaskDragOver = (taskId: string) => (e: DragEvent) => {
    e.preventDefault();
    if (draggingTaskId && draggingTaskId !== taskId) setDragOverTaskId(taskId);
  };

  const onTaskDrop = (goal: Goal, taskId: string) => async (e: DragEvent) => {
    e.preventDefault();
    const fromId = draggingTaskId ?? e.dataTransfer.getData("text/plain");
    setDraggingTaskId(null);
    setDragOverTaskId(null);
    if (!fromId || fromId === taskId) return;
    const ordered = goalTasks(goal);
    const ids = ordered.map((t) => t.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(taskId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = ids.slice();
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    await reorderTasks(goal.id, next);
  };

  const onTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };

  const handleEditorSubmit = (e: FormEvent, goalId: string) => {
    e.preventDefault();
    void saveGoal(goalId);
  };

  const editorIconSrc = editor?.iconName
    ? `${WOWHEAD_ICON_BASE}/${editor.iconName}.png`
    : editor
      ? goalIconUrl({ category: editor.category, iconName: editor.iconName })
      : "";

  return (
    <section className="panel panel-inverse my-goals-section">
      <div className="my-goals-page-air bank-page-air">
        <div className="auction-shell-wrap">
          <div className="auction-shell my-goals-shell">
            <span className="af-tl" aria-hidden="true" />
            <span className="af-top" aria-hidden="true" />
            <span className="af-tr" aria-hidden="true" />
            <span className="af-bl" aria-hidden="true" />
            <span className="af-bot" aria-hidden="true" />
            <span className="af-br" aria-hidden="true" />
            <div className="auction-shell-header">
              <h2 className="energy-bar-title">My Goals</h2>
              <button type="button" className="energy-bar-add-btn" onClick={onNewGoal}>
                + New Goal
              </button>
            </div>
            <div className="auction-shell-body">
              <div className="auction-layout">
                <aside className="auction-sidebar">
                  <button
                    type="button"
                    className={categoryFilter === "ALL" ? "active" : ""}
                    onClick={() => setCategoryFilter("ALL")}
                  >
                    <span className="auction-tab-title">All</span>
                  </button>
                  {GOAL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={categoryFilter === cat ? "active" : ""}
                      onClick={() => setCategoryFilter(cat)}
                    >
                      <span className="auction-tab-title">{GOAL_CATEGORY_LABELS[cat]}</span>
                    </button>
                  ))}
                </aside>
                <div className="auction-content">
                  <div className="auction-table auction-table-goals">
                    <div className="auction-row auction-head">
                      <span aria-hidden="true" />
                      <span>Goal</span>
                      <span>Next task</span>
                      <span>Deadline</span>
                      <span>Energy</span>
                    </div>
                    {filteredGoals.length === 0 ? (
                      <p className="my-goals-empty">No goals in this category. Create one to get started.</p>
                    ) : (
                      filteredGoals.map((goal) => {
                        const assigned = goalTasks(goal);
                        const taskOne = firstGoalTask(goal, tasks);
                        const lastTask = assigned.length > 0 ? assigned[assigned.length - 1] : null;
                        const days = daysUntilDeadline(lastTask?.deadline);
                        const energy = goal.isCompleted ? (goal.energyReward ?? 0) : goalEnergyFromTasks(assigned);
                        const diff = goal.isCompleted ? goal.difficulty : averageGoalDifficulty(assigned);
                        const isOpen = expandedGoalId === goal.id;
                        const isEditing = editingGoalId === goal.id;
                        const allTasksDone = assigned.length > 0 && assigned.every((t) => t.isCompleted);
                        const canCompleteGoal = assigned.length === 0 || allTasksDone;
                        const energyStyle = goalEnergyGaugeStyle(energy || 0) as CSSProperties;
                        const available = tasks.filter(
                          (t) => t.goalId === null && t.category === goal.category && !t.isCompleted
                        );

                        return (
                          <div
                            key={goal.id}
                            className={`my-goal-row-wrap${goal.isCompleted ? " my-goal-row-wrap--completed" : ""}`}
                          >
                            <button
                              type="button"
                              className={`auction-row auction-row-button${isOpen ? " auction-row-selected" : ""}${goal.isCompleted ? " my-goal-row-completed" : ""}`}
                              onClick={() => openGoal(goal)}
                            >
                              <span className="my-goal-icon-wrap">
                                <img className="my-goal-icon" src={goalIconUrl(goal)} alt="" />
                              </span>
                              <span className="my-goal-main">
                                <h3 className="my-goal-title">{goal.title}</h3>
                                {goal.isCompleted ? (
                                  <p className="my-goal-completed-label">Goal completed</p>
                                ) : null}
                                <p className="my-goal-description">
                                  {goal.description?.trim()
                                    ? truncateText(goal.description, 160)
                                    : "—"}
                                </p>
                              </span>
                              <span className="my-goal-next-task">
                                {taskOne && !taskOne.isCompleted ? (
                                  <span
                                    className="my-goal-next-task-title my-goal-task-diff-name"
                                    style={{ color: difficultyColor(taskOne.difficulty) }}
                                  >
                                    {taskOne.title}
                                  </span>
                                ) : (
                                  <span className="my-goal-next-task-title">—</span>
                                )}
                              </span>
                              <span className="my-goal-deadline">
                                {goal.isCompleted || allTasksDone ? "—" : formatDaysUntilDeadline(days)}
                              </span>
                              <span className="my-goal-energy">
                                <span
                                  className={`my-goal-energy-hex${goal.isCompleted ? " my-goal-energy-hex--completed" : ""}`}
                                  style={energyStyle}
                                  aria-hidden="true"
                                >
                                  <span className="my-goal-energy-hex-fill" />
                                  <span className="my-goal-energy-hex-inner">
                                    <span className="my-goal-energy-value">{energy || "—"}</span>
                                  </span>
                                </span>
                                {goal.isCompleted && goal.completedAt ? (
                                  <span className="my-goal-completed-date">
                                    {formatGoalCompletedDate(goal.completedAt)}
                                  </span>
                                ) : diff ? (
                                  <span className="my-goal-energy-diff">{difficultyLabel(diff)}</span>
                                ) : null}
                              </span>
                            </button>
                            {isOpen && editor && (
                              <div
                                className={`auction-row-editor my-goal-editor${isEditing ? "" : " my-goal-editor--readonly"}`}
                              >
                                {isEditing ? (
                                  <form onSubmit={(e) => handleEditorSubmit(e, goal.id)}>
                                    <div className="icon-picker-inline my-goal-icon-picker-row">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIconQuery(editor.iconName);
                                          setIconOffset(0);
                                          setIconHasMore(true);
                                          setIconPickerOpen(true);
                                        }}
                                      >
                                        Choose icon
                                      </button>
                                      {editorIconSrc ? (
                                        <img className="asset-icon" src={editorIconSrc} alt="" />
                                      ) : null}
                                    </div>
                                    <div className="inline-form inline-form-5 my-goal-fields-grid">
                                      <GoalField label="Title" readOnly={false} value={editor.title}>
                                        <input
                                          className="my-goal-field-input"
                                          value={editor.title}
                                          onChange={(e) =>
                                            setEditor({ ...editor, title: e.target.value })
                                          }
                                        />
                                      </GoalField>
                                      <GoalField
                                        label="Category"
                                        readOnly={false}
                                        value={GOAL_CATEGORY_LABELS[editor.category]}
                                      >
                                        <select
                                          className="my-goal-field-input"
                                          value={editor.category}
                                          onChange={(e) =>
                                            setEditor({
                                              ...editor,
                                              category: e.target.value as GoalCategory,
                                            })
                                          }
                                        >
                                          {GOAL_CATEGORIES.map((c) => (
                                            <option key={c} value={c}>
                                              {GOAL_CATEGORY_LABELS[c]}
                                            </option>
                                          ))}
                                        </select>
                                      </GoalField>
                                      <GoalField label="Priority" readOnly={false} value={editor.priority}>
                                        <select
                                          className="my-goal-field-input"
                                          value={editor.priority}
                                          onChange={(e) =>
                                            setEditor({
                                              ...editor,
                                              priority: e.target.value as GoalPriority,
                                            })
                                          }
                                        >
                                          {GOAL_PRIORITIES.map((p) => (
                                            <option key={p} value={p}>
                                              {p}
                                            </option>
                                          ))}
                                        </select>
                                      </GoalField>
                                      <GoalField
                                        label="Goal deadline"
                                        readOnly={false}
                                        value={editor.deadline || "—"}
                                      >
                                        <input
                                          className="my-goal-field-input"
                                          type="date"
                                          value={editor.deadline}
                                          onChange={(e) =>
                                            setEditor({ ...editor, deadline: e.target.value })
                                          }
                                        />
                                      </GoalField>
                                    </div>
                                    <div className="inline-form inline-form-5 my-goal-text-block">
                                      <GoalField
                                        label="Description"
                                        readOnly={false}
                                        value={editor.description.trim() || "—"}
                                        wide
                                      >
                                        <textarea
                                          className="my-goal-field-input standard-textarea"
                                          rows={3}
                                          value={editor.description}
                                          onChange={(e) =>
                                            setEditor({ ...editor, description: e.target.value })
                                          }
                                        />
                                      </GoalField>
                                    </div>
                                    <div className="inline-form inline-form-5 my-goal-text-block">
                                      <GoalField
                                        label="Definition of Done"
                                        readOnly={false}
                                        value={editor.definitionDone.trim() || "—"}
                                        wide
                                      >
                                        <textarea
                                          className="my-goal-field-input standard-textarea"
                                          rows={2}
                                          value={editor.definitionDone}
                                          onChange={(e) =>
                                            setEditor({ ...editor, definitionDone: e.target.value })
                                          }
                                        />
                                      </GoalField>
                                    </div>
                                    <div className="inline-form inline-form-5 my-goal-text-block my-goal-text-block--resources">
                                      <GoalField
                                        label="Resources"
                                        readOnly={false}
                                        value={editor.resources.trim() || "—"}
                                        wide
                                      >
                                        <textarea
                                          className="my-goal-field-input standard-textarea"
                                          rows={2}
                                          value={editor.resources}
                                          onChange={(e) =>
                                            setEditor({ ...editor, resources: e.target.value })
                                          }
                                        />
                                      </GoalField>
                                    </div>

                                    <h4 className="profile-section-title my-goal-task-sequence-title">
                                      Task sequence
                                    </h4>
                                    <ul className="my-goal-task-list">
                                      {assigned.map((task, index) => (
                                        <li
                                          key={task.id}
                                          className={`my-goal-task-item${task.isCompleted ? " my-goal-task-item--completed" : ""}${draggingTaskId === task.id ? " my-goal-task-item--drag-source" : ""}${dragOverTaskId === task.id ? " my-goal-task-item--drag-over" : ""}`}
                                          draggable
                                          onDragStart={onTaskDragStart(task.id)}
                                          onDragOver={onTaskDragOver(task.id)}
                                          onDrop={(e) => void onTaskDrop(goal, task.id)(e)}
                                          onDragEnd={onTaskDragEnd}
                                        >
                                          <span className="my-goal-task-grip" aria-hidden="true">
                                            ⋮⋮
                                          </span>
                                          <span
                                            className="my-goal-task-title"
                                            style={{ color: difficultyColor(task.difficulty) }}
                                          >
                                            {index + 1}. {task.title}
                                          </span>
                                          <span className="my-goal-task-meta">
                                            {difficultyLabel(task.difficulty)}
                                          </span>
                                          <button
                                            type="button"
                                            className="danger"
                                            onClick={() => void unlinkTask(task.id)}
                                            title="Remove from goal"
                                          >
                                            ×
                                          </button>
                                        </li>
                                      ))}
                                      {assigned.length === 0 ? (
                                        <li className="my-goals-empty" style={{ padding: "12px 8px" }}>
                                          No tasks linked. Assign tasks below.
                                        </li>
                                      ) : null}
                                    </ul>

                                    {available.length > 0 ? (
                                      <div className="my-goal-assign-row">
                                        <select
                                          className="my-goal-field-input"
                                          value={assignTaskId}
                                          onChange={(e) => setAssignTaskId(e.target.value)}
                                        >
                                          <option value="">Select task to assign…</option>
                                          {available.map((t) => (
                                            <option key={t.id} value={t.id}>
                                              {t.title}
                                            </option>
                                          ))}
                                        </select>
                                        <button type="button" onClick={() => void assignTask(goal.id)}>
                                          Add
                                        </button>
                                      </div>
                                    ) : null}

                                    <div className="my-goal-meta-row">
                                      <span>
                                        Difficulty:{" "}
                                        <strong>
                                          {goal.difficulty ? difficultyLabel(goal.difficulty) : "—"}
                                        </strong>
                                      </span>
                                      <span>
                                        Energy on completion: <strong>{energy || 0}%</strong>
                                      </span>
                                    </div>

                                    <div className="actions my-goal-actions">
                                      {!goal.isCompleted ? (
                                        <button
                                          type="button"
                                          className="my-goal-complete-btn"
                                          disabled={!canCompleteGoal || completingGoalId === goal.id}
                                          title={
                                            canCompleteGoal
                                              ? "Mark goal as completed and gain energy"
                                              : "Complete all tasks in this goal first"
                                          }
                                          onClick={() => void completeGoal(goal.id)}
                                        >
                                          {completingGoalId === goal.id ? "Completing…" : "Complete goal"}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="my-goal-undo-btn"
                                          disabled={completingGoalId === goal.id}
                                          title="Undo completion and remove energy reward"
                                          onClick={() => void uncompleteGoal(goal.id)}
                                        >
                                          {completingGoalId === goal.id ? "Undoing…" : "Undo completion"}
                                        </button>
                                      )}
                                      <button type="submit">Save</button>
                                      <button type="button" className="secondary" onClick={cancelEdit}>
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => void deleteGoal(goal.id)}
                                      >
                                        Delete Goal
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    <div className="my-goal-icon-picker-row my-goal-icon-picker-row--readonly">
                                      <img className="asset-icon" src={goalIconUrl(goal)} alt="" />
                                    </div>
                                    <div className="inline-form inline-form-5 my-goal-fields-grid">
                                      <GoalField label="Title" readOnly value={editor.title}>
                                        <span />
                                      </GoalField>
                                      <GoalField label="Priority" readOnly value={editor.priority}>
                                        <span />
                                      </GoalField>
                                      <GoalField
                                        label="Goal deadline"
                                        readOnly
                                        value={editor.deadline || "—"}
                                      >
                                        <span />
                                      </GoalField>
                                    </div>
                                    <div className="my-goal-readonly-blocks">
                                      <GoalField
                                        label="Description"
                                        readOnly
                                        value={editor.description.trim() || "—"}
                                        wide
                                      >
                                        <span />
                                      </GoalField>
                                      <GoalField
                                        label="Definition of Done"
                                        readOnly
                                        value={editor.definitionDone.trim() || "—"}
                                        wide
                                      >
                                        <span />
                                      </GoalField>
                                      <GoalField
                                        label="Resources"
                                        readOnly
                                        value={editor.resources.trim() || "—"}
                                        wide
                                      >
                                        <span />
                                      </GoalField>
                                    </div>
                                  </>
                                )}

                                {!isEditing ? (
                                  <>
                                    <h4 className="profile-section-title my-goal-task-sequence-title">
                                      Task sequence
                                    </h4>
                                    <ul className="my-goal-task-list">
                                      {assigned.map((task, index) => (
                                        <li
                                          key={task.id}
                                          className={`my-goal-task-item my-goal-task-item--readonly${task.isCompleted ? " my-goal-task-item--completed" : ""}`}
                                        >
                                          <span
                                            className="my-goal-task-title"
                                            style={{ color: difficultyColor(task.difficulty) }}
                                          >
                                            {index + 1}. {task.title}
                                          </span>
                                          <span className="my-goal-task-meta">
                                            {difficultyLabel(task.difficulty)}
                                          </span>
                                        </li>
                                      ))}
                                      {assigned.length === 0 ? (
                                        <li className="my-goals-empty" style={{ padding: "12px 8px" }}>
                                          No tasks linked.
                                        </li>
                                      ) : null}
                                    </ul>

                                    <div className="my-goal-meta-row">
                                      <span>
                                        Difficulty:{" "}
                                        <strong>
                                          {goal.difficulty ? difficultyLabel(goal.difficulty) : "—"}
                                        </strong>
                                      </span>
                                      <span>
                                        Energy on completion: <strong>{energy || 0}%</strong>
                                      </span>
                                    </div>

                                    <div className="actions my-goal-actions">
                                      {!goal.isCompleted ? (
                                        <button
                                          type="button"
                                          className="my-goal-complete-btn"
                                          disabled={!canCompleteGoal || completingGoalId === goal.id}
                                          title={
                                            canCompleteGoal
                                              ? "Mark goal as completed and gain energy"
                                              : "Complete all tasks in this goal first"
                                          }
                                          onClick={() => void completeGoal(goal.id)}
                                        >
                                          {completingGoalId === goal.id ? "Completing…" : "Complete goal"}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="my-goal-undo-btn"
                                          disabled={completingGoalId === goal.id}
                                          title="Undo completion and remove energy reward"
                                          onClick={() => void uncompleteGoal(goal.id)}
                                        >
                                          {completingGoalId === goal.id ? "Undoing…" : "Undo completion"}
                                        </button>
                                      )}
                                      <button type="button" onClick={startEdit}>
                                        Edit
                                      </button>
                                      <button type="button" className="secondary" onClick={closeGoal}>
                                        Close
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {iconPickerOpen && editor && (
        <section className="modal-backdrop" onClick={() => setIconPickerOpen(false)}>
          <div className="panel icon-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Icon Library</h3>
            <input
              placeholder="Filter by icon name"
              value={iconQuery}
              onChange={(e) => setIconQuery(e.target.value)}
            />
            <div className="icon-grid icon-grid-scroll">
              {iconResults.map((name) => (
                <button
                  type="button"
                  key={name}
                  className={`icon-choice ${editor.iconName === name ? "active" : ""}`}
                  onClick={() => setEditor((p) => (p ? { ...p, iconName: name } : p))}
                  title={name}
                >
                  <img src={`${WOWHEAD_ICON_BASE}/${name}.png`} alt={name} />
                  <small>{name}</small>
                </button>
              ))}
            </div>
            <div className="actions">
              {iconHasMore ? (
                <button type="button" onClick={() => void loadMoreIcons()}>
                  {iconLoading ? "Loading…" : "Load More"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setIconPickerOpen(false);
                  if (expandedGoalId) {
                    void saveGoalIcon(expandedGoalId, editor.iconName);
                  }
                }}
              >
                Done
              </button>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
