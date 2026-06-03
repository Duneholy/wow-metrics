-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "definitionDone" TEXT;
ALTER TABLE "Goal" ADD COLUMN "resources" TEXT;
ALTER TABLE "Goal" ADD COLUMN "deadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "goalSortOrder" INTEGER NOT NULL DEFAULT 0;
