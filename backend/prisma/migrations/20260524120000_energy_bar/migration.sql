-- Energy bar state on User
ALTER TABLE "User" ADD COLUMN "energyWeekKey" TEXT;
ALTER TABLE "User" ADD COLUMN "energyAtWeekStart" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "User" ADD COLUMN "energySpentWeek" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "energyGainedWeek" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "energyLastProcessedDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bonusNoPhoneUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "bonusHeartUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "bonusRecycleActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lossNoPhoneUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lossHeartUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lossPillActive" BOOLEAN NOT NULL DEFAULT false;

-- Exercise catalog & weekly frame slots
CREATE TABLE "ExerciseType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "energyTier" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnergyWeekSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseTypeId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyWeekSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnergyWeekSlot_userId_weekKey_idx" ON "EnergyWeekSlot"("userId", "weekKey");

ALTER TABLE "ExerciseType" ADD CONSTRAINT "ExerciseType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyWeekSlot" ADD CONSTRAINT "EnergyWeekSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnergyWeekSlot" ADD CONSTRAINT "EnergyWeekSlot_exerciseTypeId_fkey" FOREIGN KEY ("exerciseTypeId") REFERENCES "ExerciseType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
