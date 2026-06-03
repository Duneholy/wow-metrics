-- CreateEnum
CREATE TYPE "GoalPriority" AS ENUM ('ONE', 'TWO', 'THREE', 'DASH');

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "priority" "GoalPriority" NOT NULL DEFAULT 'DASH';
