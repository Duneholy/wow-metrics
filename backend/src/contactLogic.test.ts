import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBirthdayNotifications,
  contactStatusFromClient,
  contactStatusToClient,
  daysUntilNextBirthday,
  formatBirthdayDdMm,
  ratingFromMeetings,
} from "./contactLogic.js";

describe("contactLogic", () => {
  it("maps meetings to rating 0..10", () => {
    assert.equal(ratingFromMeetings(0), 0);
    assert.equal(ratingFromMeetings(10), 5);
    assert.equal(ratingFromMeetings(20), 10);
    assert.equal(ratingFromMeetings(100), 10);
  });

  it("maps contact status idle/todo", () => {
    assert.equal(contactStatusToClient("IDLE"), "idle");
    assert.equal(contactStatusToClient("TODO"), "todo");
    assert.equal(contactStatusFromClient("idle"), "IDLE");
    assert.equal(contactStatusFromClient("todo"), "TODO");
  });

  it("formats birthday as dd.mm", () => {
    assert.equal(formatBirthdayDdMm(3, 5), "05.03");
    assert.equal(formatBirthdayDdMm(12, 1), "01.12");
  });

  it("builds birthday notifications within 7 days", () => {
    const from = new Date("2026-06-01T12:00:00");
    const items = buildBirthdayNotifications(
      [
        {
          id: "a",
          name: "Alice",
          firstName: "Alice",
          lastName: "",
          birthdayMonth: 6,
          birthdayDay: 5,
        },
        {
          id: "b",
          name: "Bob",
          firstName: "Bob",
          lastName: "",
          birthdayMonth: 12,
          birthdayDay: 25,
        },
      ],
      from,
      7
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.text, "Contact's birthday: Alice - birthday date: 05.06");
    assert.equal(daysUntilNextBirthday(6, 1, from), 0);
    assert.equal(daysUntilNextBirthday(6, 8, from), 7);
    assert.equal(daysUntilNextBirthday(6, 9, from), 8);
  });
});
