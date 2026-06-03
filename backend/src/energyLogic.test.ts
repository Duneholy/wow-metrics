import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  addDaysKey,
  applyCalendarTicksThroughYesterday,
  applyDailyTicks,
  applyWeekRollover,
  computeExpectedSpentWeek,
  computeExpectedWeekState,
  getMondayWeekKey,
  localDateKey,
  parseDateKey,
  reconcileSpentWeekTarget,
  reconcileWeekDisplayAnchors,
  repairGoalInflatedWeekAnchors,
  replayDailyTicksToYesterday,
} from "./energyLogic.js";

import type { User } from "@prisma/client";



function mockUser(overrides: Partial<User>): User {

  return {

    id: "u1",

    login: "test",

    password: "x",

    level: 1,

    xp: 0,

    energy: 100,

    energyWeekKey: getMondayWeekKey(new Date("2025-05-24T12:00:00")),

    energyAtWeekStart: 100,

    energySpentWeek: 0,

    energyGainedWeek: 0,

    energyLastProcessedDate: null,

    bonusNoPhoneUsed: false,

    bonusNoPhoneEnergyApplied: 0,

    bonusHeartUsed: false,

    bonusHeartEnergyApplied: 0,

    bonusRecycleActive: false,

    bonusRecycleEnergyApplied: 0,

    lossNoPhoneUsed: false,

    lossNoPhoneEnergyApplied: 0,

    lossHeartUsed: false,

    lossHeartEnergyApplied: 0,

    lossPillActive: false,

    lossPillEnergyApplied: 0,

    lossPillInstantApplied: false,

    lossPillSpentRecorded: 0,

    coingeckoApiKey: null,

    dailyEnergyLoss: 10,

    assetColorGreenThreshold: 50000,

    assetColorBlueThreshold: 150000,

    assetColorPurpleThreshold: 300000,

    epicTaskWarningEnergy: 60,

    hardTaskWarningEnergy: 45,

    mediumTaskWarningEnergy: 25,

    createdAt: new Date(),

    updatedAt: new Date(),

    ...overrides,

  } as User;

}



describe("applyDailyTicks", () => {

  it("Sunday week day 7: 6 prior days at 10% → 40% energy, 60% spent", () => {
    const sunday = new Date("2025-05-25T12:00:00");
    const weekKey = getMondayWeekKey(sunday);
    const user = mockUser({
      energy: 100,
      energyAtWeekStart: 100,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(localDateKey(sunday)),
    });
    const replay = replayDailyTicksToYesterday(user, sunday);
    assert.equal(replay.energy, 40);
    assert.equal(replay.spent, 60);
  });



  it("reconciles stale totals when already caught up to yesterday", () => {
    const sunday = new Date("2025-05-25T12:00:00");
    const weekKey = getMondayWeekKey(sunday);
    const yesterdayKey = addDaysKey(localDateKey(sunday), -1);
    const user = mockUser({
      energy: 58,
      energyAtWeekStart: 100,
      energySpentWeek: 42,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });
    assert.equal(computeExpectedWeekState(user, 0, sunday).energy, 40);
  });

  it("Sunday 80% → Monday: one daily tick before week rollover → 70%", () => {
    const sundayNight = new Date("2026-05-24T22:00:00");
    const mondayMorning = new Date("2026-05-25T10:40:00");
    const sundayWeek = getMondayWeekKey(sundayNight);
    const mondayWeek = getMondayWeekKey(mondayMorning);

    let user = mockUser({
      energy: 80,
      energyAtWeekStart: 100,
      energySpentWeek: 20,
      energyWeekKey: sundayWeek,
      energyLastProcessedDate: parseDateKey("2026-05-23"),
    });

    const pending = applyCalendarTicksThroughYesterday(user, mondayMorning);
    assert.equal(pending.energy, 70);

    user = { ...user, ...pending };
    user = { ...user, ...applyWeekRollover(user, mondayWeek) };

    const { patch, changed } = applyDailyTicks(user, 0, mondayMorning);
    assert.equal(changed, true);
    assert.equal(patch.energy, 70);
    assert.equal(patch.energyAtWeekStart, 70);
    assert.equal(patch.energySpentWeek, 0);
    const display = reconcileWeekDisplayAnchors({ ...user, ...patch } as typeof user, 0, mondayMorning);
    assert.ok(display);
    assert.equal(display!.energyAtWeekStart, 80);
    assert.equal(display!.energySpentWeek, 10);
  });

  it("reconcileWeekDisplayAnchors fixes Monday counters when pool already includes today tick", () => {
    const monday = new Date("2026-06-01T12:00:00");
    const weekKey = getMondayWeekKey(monday);
    const user = mockUser({
      energy: 50,
      energyAtWeekStart: 50,
      energySpentWeek: 0,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(addDaysKey(localDateKey(monday), -1)),
    });
    const repair = reconcileWeekDisplayAnchors(user, 0, monday);
    assert.ok(repair);
    assert.equal(repair!.energyAtWeekStart, 60);
    assert.equal(repair!.energySpentWeek, 10);
  });

  it("Monday rollover persists button reset when already caught up through yesterday", () => {
    const monday = new Date("2026-05-25T10:40:00");
    const prevWeek = getMondayWeekKey(new Date("2026-05-18T12:00:00"));
    const mondayWeek = getMondayWeekKey(monday);
    const yesterdayKey = addDaysKey(localDateKey(monday), -1);
    const user = mockUser({
      energy: 70,
      energyAtWeekStart: 100,
      energySpentWeek: 30,
      energyGainedWeek: 10,
      energyWeekKey: prevWeek,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
      bonusNoPhoneUsed: true,
      bonusNoPhoneEnergyApplied: 10,
      lossNoPhoneUsed: true,
      lossNoPhoneEnergyApplied: 10,
      bonusHeartUsed: true,
      bonusRecycleActive: true,
      lossHeartUsed: true,
      lossPillActive: true,
    });

    const { patch, changed } = applyDailyTicks(user, 0, monday);
    assert.equal(changed, true);
    assert.equal(patch.energyWeekKey, mondayWeek);
    assert.equal(patch.bonusNoPhoneUsed, false);
    assert.equal(patch.lossNoPhoneUsed, false);
    assert.equal(patch.bonusHeartUsed, false);
    assert.equal(patch.bonusRecycleActive, false);
    assert.equal(patch.lossHeartUsed, false);
    assert.equal(patch.lossPillActive, false);
    assert.equal(patch.bonusNoPhoneEnergyApplied, 0);
    assert.equal(patch.lossNoPhoneEnergyApplied, 0);
    assert.equal(patch.energy, 70);
  });

  it("already caught up on Monday reconciles display anchors once then is stable", () => {
    const monday = new Date("2026-05-25T10:40:00");
    const weekKey = getMondayWeekKey(monday);
    const yesterdayKey = addDaysKey(localDateKey(monday), -1);
    const user = mockUser({
      energy: 70,
      energyAtWeekStart: 70,
      energySpentWeek: 10,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });
    const first = applyDailyTicks(user, 0, monday);
    assert.equal(first.changed, true);
    assert.equal(first.patch.energyAtWeekStart, 80);
    assert.equal(first.patch.energySpentWeek, 10);
    assert.equal(first.patch.energy, 70);

    const merged = { ...user, ...first.patch };
    const second = applyDailyTicks(merged, 0, monday);
    assert.equal(second.changed, false);
    assert.deepEqual(second.patch, {});
  });

  it("Tuesday reconcile keeps spentWeek at 20% when already repaired", () => {
    const tuesday = new Date("2026-05-26T10:00:00");
    const weekKey = getMondayWeekKey(tuesday);
    const yesterdayKey = addDaysKey(localDateKey(tuesday), -1);
    const user = mockUser({
      energy: 50,
      energyAtWeekStart: 70,
      energySpentWeek: 20,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });

    const { patch, changed } = applyDailyTicks(user, 0, tuesday);
    assert.equal(changed, false);
    assert.deepEqual(patch, {});
  });

  it("Tuesday reconcile repairs spentWeek from 10% to 20% when collapsed anchor hides a tick", () => {
    const tuesday = new Date("2026-05-26T10:00:00");
    const weekKey = getMondayWeekKey(tuesday);
    const yesterdayKey = addDaysKey(localDateKey(tuesday), -1);
    const user = mockUser({
      energy: 50,
      energyAtWeekStart: 60,
      energySpentWeek: 10,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });

    const { patch, changed } = applyDailyTicks(user, 0, tuesday);
    assert.equal(changed, true);
    assert.equal(patch.energySpentWeek, 20);
    assert.equal(patch.energyAtWeekStart, 70);
    assert.equal(patch.energy, 50);
  });

  it("Tuesday repairs spent when collapsed week-start anchor hides second tick", () => {
    const tuesday = new Date("2026-05-26T10:00:00");
    const weekKey = getMondayWeekKey(tuesday);
    const yesterdayKey = addDaysKey(localDateKey(tuesday), -1);
    const user = mockUser({
      energy: 50,
      energyAtWeekStart: 60,
      energySpentWeek: 10,
      energyGainedWeek: 0,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });

    const { patch, changed } = applyDailyTicks(user, 0, tuesday);
    assert.equal(changed, true);
    assert.equal(patch.energySpentWeek, 20);
    assert.equal(patch.energyAtWeekStart, 70);
    assert.equal(patch.energy, 50);
  });

  it("repairs goal energy wrongly added to week start and spent counters", () => {
    const tuesday = new Date("2026-05-26T10:00:00");
    const weekKey = getMondayWeekKey(tuesday);
    const yesterdayKey = addDaysKey(localDateKey(tuesday), -1);
    const user = mockUser({
      energy: 60,
      energyAtWeekStart: 80,
      energySpentWeek: 30,
      energyGainedWeek: 10,
      energyWeekKey: weekKey,
      energyLastProcessedDate: parseDateKey(yesterdayKey),
    });

    const repair = repairGoalInflatedWeekAnchors(user, 10, 0, tuesday);
    assert.ok(repair);
    assert.equal(repair!.energyAtWeekStart, 70);
    assert.equal(repair!.energySpentWeek, 20);

    const { patch, changed } = applyDailyTicks(user, 0, tuesday);
    const merged = { ...user, ...repair, ...patch };
    assert.equal(changed, false);
    assert.equal(merged.energyAtWeekStart, 70);
    assert.equal(merged.energySpentWeek, 20);
    assert.equal(merged.energyGainedWeek, 10);
    assert.equal(merged.energy, 60);
  });

});


