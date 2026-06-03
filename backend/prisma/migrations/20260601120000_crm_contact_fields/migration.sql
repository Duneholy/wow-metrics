-- CRM contact fields: display name, birthday parts, linked task
ALTER TABLE "Contact" ADD COLUMN "name" TEXT;
ALTER TABLE "Contact" ADD COLUMN "birthdayMonth" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "birthdayDay" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "taskId" TEXT;

UPDATE "Contact"
SET "name" = trim(concat("firstName", ' ', "lastName"))
WHERE "name" IS NULL OR "name" = '';

UPDATE "Contact" SET "name" = 'Contact' WHERE "name" IS NULL OR trim("name") = '';

ALTER TABLE "Contact" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
