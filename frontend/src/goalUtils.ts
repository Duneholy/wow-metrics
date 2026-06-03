export type GoalCategory = "FINANCIAL" | "EDUCATION" | "CAREER" | "FAMILY" | "PERSONAL" | "SPORT";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EPIC";



export type Subtask = { id: string; taskId: string; title: string; isCompleted: boolean };



export type Task = {

  id: string;

  goalId: string | null;

  goalSortOrder?: number;

  category: GoalCategory;

  title: string;

  comment?: string;

  definitionDone?: string;

  deadline?: string;

  progress: number;

  inFocus: boolean;

  focusSlot?: number | null;

  isCompleted: boolean;

  xpReward: number;

  difficulty: Difficulty;

  subtasks?: Subtask[];

};



export type GoalPriority = "1" | "2" | "3" | "-";

export const GOAL_PRIORITIES: GoalPriority[] = ["1", "2", "3", "-"];

export type Goal = {

  id: string;

  title: string;

  description?: string | null;

  definitionDone?: string | null;

  resources?: string | null;

  deadline?: string | null;

  category: GoalCategory;

  priority?: GoalPriority;

  iconName?: string | null;

  isCompleted: boolean;
  completedAt?: string | null;
  createdAt?: string;
  /** Average difficulty of all goal tasks — do not use for coloring a single task row. */
  difficulty?: Difficulty | null;

  energyReward?: number;

  tasks?: Task[];

};



export const GOAL_CATEGORIES: GoalCategory[] = [

  "FINANCIAL",

  "EDUCATION",

  "CAREER",

  "FAMILY",

  "PERSONAL",

  "SPORT",

];



export function goalPriorityRank(priority: GoalPriority | undefined | null): number {
  switch (priority) {
    case "1":
      return 4;
    case "2":
      return 3;
    case "3":
      return 2;
    case "-":
    default:
      return 1;
  }
}

/** Active goals first (by priority desc), then completed (by priority desc, then completed date). */
export function sortGoalsForDisplay(goals: Goal[]): Goal[] {
  const active = goals.filter((g) => !g.isCompleted);
  const done = goals.filter((g) => g.isCompleted);
  const byPriority = (a: Goal, b: Goal) => {
    const rank = goalPriorityRank(b.priority) - goalPriorityRank(a.priority);
    if (rank !== 0) return rank;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  };
  const byCompleted = (a: Goal, b: Goal) => {
    const rank = goalPriorityRank(b.priority) - goalPriorityRank(a.priority);
    if (rank !== 0) return rank;
    const ta = a.completedAt ? Date.parse(a.completedAt) : 0;
    const tb = b.completedAt ? Date.parse(b.completedAt) : 0;
    return tb - ta;
  };
  return [...active.sort(byPriority), ...done.sort(byCompleted)];
}

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {

  FINANCIAL: "Financial",

  EDUCATION: "Education",

  CAREER: "Career",

  FAMILY: "Family",

  PERSONAL: "Personal",

  SPORT: "Sport",

};



export const WOWHEAD_ICON_BASE = "/icons";



export const GOAL_CATEGORY_ICONS: Record<GoalCategory, string> = {

  FINANCIAL: `${WOWHEAD_ICON_BASE}/inv_misc_coin_01.png`,

  EDUCATION: `${WOWHEAD_ICON_BASE}/inv_misc_book_09.png`,

  CAREER: `${WOWHEAD_ICON_BASE}/inv_misc_briefcase_01.png`,

  FAMILY: `${WOWHEAD_ICON_BASE}/inv_misc_groupneedmore.png`,

  PERSONAL: `${WOWHEAD_ICON_BASE}/inv_misc_toy_07.png`,

  SPORT: `${WOWHEAD_ICON_BASE}/ability_warrior_innerrage.png`,

};



/** WoW item-quality style colors for task difficulty labels. */

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {

  EASY: "#ffffff",

  MEDIUM: "#1eff00",

  HARD: "#0070dd",

  EPIC: "#a335ee",

};



export const TASK_FLOW_ARROW = "→";



const DIFFICULTY_LABELS: Record<Difficulty, string> = {

  EASY: "Easy",

  MEDIUM: "Medium",

  HARD: "Hard",

  EPIC: "Epic",

};



export function difficultyLabel(d: Difficulty): string {

  return DIFFICULTY_LABELS[d];

}



/** Display color for one task's difficulty (not goal average — use goal.difficulty only for goal-level badges). */
export function difficultyColor(
  difficulty: Difficulty | null | undefined,
  fallback: Difficulty = "EASY"
): string {
  return DIFFICULTY_COLORS[difficulty ?? fallback];
}



const DIFFICULTY_RANK: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  EPIC: 4,
};

const RANK_TO_DIFFICULTY: Difficulty[] = ["EASY", "MEDIUM", "HARD", "EPIC"];

export function goalEnergyFromDifficulty(difficulty: Difficulty): number {
  return 10 + (DIFFICULTY_RANK[difficulty] - 1) * 10;
}

export function averageGoalDifficulty(
  tasks: Pick<{ difficulty: string }, "difficulty">[]
): Difficulty | null {
  if (tasks.length === 0) return null;
  const avg =
    tasks.reduce((sum, t) => sum + DIFFICULTY_RANK[t.difficulty as Difficulty], 0) / tasks.length;
  const rank = Math.min(4, Math.max(1, Math.round(avg)));
  return RANK_TO_DIFFICULTY[rank - 1]!;
}

export function goalEnergyFromTasks(
  tasks: Pick<{ difficulty: Difficulty }, "difficulty">[]
): number {
  const difficulty = averageGoalDifficulty(tasks);
  return difficulty ? goalEnergyFromDifficulty(difficulty) : 0;
}

export function goalIconUrl(goal: Pick<Goal, "category" | "iconName">): string {

  if (goal.iconName?.trim()) {

    return `${WOWHEAD_ICON_BASE}/${goal.iconName.trim().toLowerCase()}.png`;

  }

  return GOAL_CATEGORY_ICONS[goal.category];

}



export function sortGoalTasks(tasks: Task[]): Task[] {

  return tasks.slice().sort((a, b) => {

    const ao = a.goalSortOrder ?? 0;

    const bo = b.goalSortOrder ?? 0;

    if (ao !== bo) return ao - bo;

    return a.title.localeCompare(b.title, "ru");

  });

}



export function goalTasksList(goal: Goal, allTasks: Task[]): Task[] {

  return goal.tasks?.length

    ? sortGoalTasks(goal.tasks)

    : sortGoalTasks(allTasks.filter((t) => t.goalId === goal.id));

}



/** Progress % from completed subtasks (0 when there are no subtasks). */
export function taskProgressFromSubtasks(subtasks: Pick<Subtask, "isCompleted">[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.isCompleted).length;
  return Math.floor((done / subtasks.length) * 100);
}

export function firstGoalTask(goal: Goal, allTasks: Task[]): Task | null {

  const tasks = goalTasksList(goal, allTasks);

  const next = tasks.find((t) => !t.isCompleted);

  return next ?? tasks[0] ?? null;

}



/** Task flow for list row: only incomplete tasks, up to two, with arrow. */

export function incompleteGoalTaskFlow(goal: Goal, allTasks: Task[]): string {

  const tasks = goalTasksList(goal, allTasks).filter((t) => !t.isCompleted);

  if (tasks.length === 0) return "—";

  if (tasks.length === 1) return tasks[0]!.title;

  return `${tasks[0]!.title} ${TASK_FLOW_ARROW} ${tasks[1]!.title}`;

}



export function daysUntilDeadline(deadline?: string | null): number | null {

  if (!deadline) return null;

  const key = deadline.includes("T") ? deadline.slice(0, 10) : deadline;

  const end = new Date(`${key}T12:00:00`);

  const now = new Date();

  now.setHours(12, 0, 0, 0);

  const diff = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);

  return diff;

}



export function formatDaysUntilDeadline(days: number | null): string {

  if (days === null) return "—";

  if (days < 0) return `${Math.abs(days)} days overdue`;

  if (days === 0) return "today";

  if (days === 1) return "1 day";

  return `${days} days`;

}



export function truncateText(text: string, maxLen: number): string {

  const t = text.trim();

  if (t.length <= maxLen) return t;

  return `${t.slice(0, maxLen - 1)}…`;

}



export function formatGoalCompletedDate(iso?: string | null): string {
  if (!iso) return "—";
  const key = iso.includes("T") ? iso.slice(0, 10) : iso;
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return key;
  return `${d}.${m}.${y}`;
}

/** Max energy reward for a goal (Epic average = 40). Hex fill is proportional to this cap. */
export const GOAL_ENERGY_MAX = 40;

/** Energy badge colors (aligned with Energy Bar gauge). Fill arc uses 0..GOAL_ENERGY_MAX. */
export function goalEnergyGaugeStyle(energy: number): Record<string, string> {
  const p = Math.max(0, Math.min(GOAL_ENERGY_MAX, energy));

  let r: number;

  let g: number;

  let b: number;

  if (p >= 22) {
    const t = (p - 22) / (GOAL_ENERGY_MAX - 22);

    r = Math.round(255 + (30 - 255) * t);

    g = Math.round(209 + (255 - 209) * t);

    b = Math.round(0);

  } else if (p >= 10) {
    const t = (p - 10) / 12;

    r = Math.round(255 + (255 - 255) * t);

    g = Math.round(80 + (209 - 80) * t);

    b = Math.round(80 + (0 - 80) * t);

  } else {

    r = 255;

    g = 80;

    b = 80;

  }

  const fillMain = `rgb(${r}, ${g}, ${b})`;

  const fillLight = `rgb(${Math.min(255, r + 20)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 20)})`;

  const deg = (p / GOAL_ENERGY_MAX) * 360;

  return {

    "--goal-energy-deg": `${deg}deg`,

    "--goal-energy-fill-main": fillMain,

    "--goal-energy-fill-light": fillLight,

    "--goal-energy-glow": `rgba(${r}, ${g}, ${b}, 0.35)`,

    "--goal-energy-ring": `rgba(${r}, ${g}, ${b}, 0.5)`,

  };

}



export function taskFromServerResponse(t: any): Task {
  return {
    ...t,
    focusSlot: typeof t.focusSlot === "number" ? t.focusSlot : null,
  };
}

export function weeklyFocusEnergyWarning(focusTasks: Task[], epicCap: number, hardCap: number, medCap: number): string | null {
  const diffs = focusTasks.map((t) => t.difficulty);
  const epicCount = diffs.filter((d) => d === "EPIC").length;
  const hardCount = diffs.filter((d) => d === "HARD").length;
  const medCount = diffs.filter((d) => d === "MEDIUM").length;

  const cost = epicCount * epicCap + hardCount * hardCap + medCount * medCap;
  if (cost > 100) {
    return "WARNING: Total energy cost of the current Weekly Focus exceeds 100%. You might burn out.";
  }
  return null;
}
