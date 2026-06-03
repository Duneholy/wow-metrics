import type { TaskDifficulty, GoalPriority } from "./types.js";
type DBGoalPriority = "ONE" | "TWO" | "THREE" | "DASH";

const GOAL_PRIORITY_TO_CLIENT: Record<DBGoalPriority, GoalPriority> = {
  ONE: "1",
  TWO: "2",
  THREE: "3",
  DASH: "-",
};

export function goalPriorityFromClient(value: GoalPriority): DBGoalPriority {
  const map: Record<GoalPriority, DBGoalPriority> = {
    "1": "ONE",
    "2": "TWO",
    "3": "THREE",
    "-": "DASH",
  };
  return map[value];
}

export function mapGoalForClient(
  goal: {
    id: string;
    title: string;
    description: string | null;
    definitionDone: string | null;
    resources: string | null;
    deadline: Date | null;
    category: string;
    priority: string;
    iconName: string | null;
    isCompleted: boolean;
    completedAt: Date | null;
    updatedAt: Date;
    tasks?: Array<{
      id: string;
      goalId: string | null;
      goalSortOrder: number;
      category: string;
      title: string;
      comment: string | null;
      definitionDone: string | null;
      deadline: Date | null;
      difficulty: string;
      progress: number;
      inFocus: boolean;
      focusSlot: number | null;
      isCompleted: boolean;
      xpReward: number;
      subtasks: unknown[];
      createdAt: Date;
    }>;
  }
) {
  const tasks = goal.tasks;
  const difficulty = tasks ? averageGoalDifficulty(tasks) : null;
  return {
    ...goal,
    deadline: goal.deadline ? goal.deadline.toISOString() : null,
    priority: GOAL_PRIORITY_TO_CLIENT[goal.priority as DBGoalPriority] ?? "-",
    iconName: goal.iconName ?? null,
    completedAt:
      goal.isCompleted && (goal.completedAt ?? goal.updatedAt)
        ? (goal.completedAt ?? goal.updatedAt).toISOString()
        : null,
    difficulty: difficulty ?? (goal.priority === "DASH" ? null : "HARD"),
    energyReward: tasks ? goalEnergyFromTasks(tasks as any) : (goal as any).completionEnergyGain ?? 0,
    ...(tasks ? {
      tasks: tasks.map((t) => ({
        ...t,
        deadline: t.deadline ? t.deadline.toISOString() : null,
      })),
    } : {}),
  };
}
const DIFFICULTY_RANK: Record<TaskDifficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
  EPIC: 4,
};

const RANK_TO_DIFFICULTY: TaskDifficulty[] = ["EASY", "MEDIUM", "HARD", "EPIC"];

/** Energy reward for completing a goal from its average task difficulty (Easy 10 → Epic 40). */
export function goalEnergyFromDifficulty(difficulty: TaskDifficulty): number {
  return 10 + (DIFFICULTY_RANK[difficulty] - 1) * 10;
}

export function averageGoalDifficulty(
  tasks: Pick<{ difficulty: string }, "difficulty">[]
): TaskDifficulty | null {
  if (tasks.length === 0) return null;
  const avg =
    tasks.reduce((sum, t) => sum + DIFFICULTY_RANK[t.difficulty as TaskDifficulty], 0) / tasks.length;
  const rank = Math.min(4, Math.max(1, Math.round(avg)));
  return RANK_TO_DIFFICULTY[rank - 1]!;
}

export function goalEnergyFromTasks(
  tasks: Pick<{ difficulty: TaskDifficulty }, "difficulty">[]
): number {
  const difficulty = averageGoalDifficulty(tasks);
  return difficulty ? goalEnergyFromDifficulty(difficulty) : 0;
}
