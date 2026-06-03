-- Contact workflow status: idle | todo
CREATE TYPE "ContactStatus" AS ENUM ('IDLE', 'TODO');

ALTER TABLE "Contact" ADD COLUMN "status" "ContactStatus" NOT NULL DEFAULT 'IDLE';
