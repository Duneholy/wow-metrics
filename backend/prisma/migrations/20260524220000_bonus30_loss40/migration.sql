-- Bonus button 3: +30% instant; Loss button 3: -40% instant (same toggle pattern as ±10%)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bonusRecycleEnergyApplied" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lossPillEnergyApplied" INTEGER NOT NULL DEFAULT 0;
