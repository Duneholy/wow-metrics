-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "focusSlot" INTEGER;

-- Assign stable slots for tasks already in focus (per user, by creation time)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC) - 1 AS rn
  FROM "Task"
  WHERE "inFocus" = true
)
UPDATE "Task" t
SET "focusSlot" = n.rn
FROM numbered n
WHERE t.id = n.id;
