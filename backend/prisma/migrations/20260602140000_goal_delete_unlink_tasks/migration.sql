-- Keep tasks in Quest Log when a goal is deleted; clear goal link only.
ALTER TABLE "Task" DROP CONSTRAINT "Task_goalId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
