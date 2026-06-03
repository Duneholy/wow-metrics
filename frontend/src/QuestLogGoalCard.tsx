import type { CSSProperties } from "react";
import { difficultyLabel, goalEnergyGaugeStyle, goalIconUrl, goalEnergyFromTasks, averageGoalDifficulty, goalTasksList, type Goal, type Task } from "./goalUtils";

type QuestLogGoalCardProps = {
  goal: Goal;
  tasks?: Task[];
};

export function QuestLogGoalCard({ goal, tasks }: QuestLogGoalCardProps) {
  const assigned = tasks ? goalTasksList(goal, tasks) : [];
  const energy = goal.isCompleted ? (goal.energyReward ?? 0) : (tasks ? goalEnergyFromTasks(assigned) : (goal.energyReward ?? 0));
  const diff = goal.isCompleted ? goal.difficulty : (tasks ? averageGoalDifficulty(assigned) : goal.difficulty);
  const energyStyle = goalEnergyGaugeStyle(energy || 0) as CSSProperties;

  return (
    <div className={`quest-goal-card${goal.isCompleted ? " quest-goal-card--completed" : ""}`}>
      <span className="my-goal-icon-wrap quest-goal-card-icon">
        <img className="my-goal-icon" src={goalIconUrl(goal)} alt="" />
      </span>
      <div className="quest-goal-card-main">
        <h4 className="my-goal-title quest-goal-card-title">{goal.title}</h4>
        {goal.isCompleted ? <p className="my-goal-completed-label">Goal completed</p> : null}
        <p className="my-goal-description quest-goal-card-description">
          {goal.description?.trim() || "—"}
        </p>
      </div>
      <div className="quest-goal-card-energy">
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
        {diff && !goal.isCompleted ? (
          <span className="my-goal-energy-diff">{difficultyLabel(diff)}</span>
        ) : null}
      </div>
    </div>
  );
}
