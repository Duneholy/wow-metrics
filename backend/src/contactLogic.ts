import { ContactStatus } from "./types.js";
export type ContactStatusClient = "idle" | "todo";

export function contactStatusToClient(status: string): ContactStatusClient {
  return status === "TODO" ? "todo" : "idle";
}

export function contactStatusFromClient(status: string): string {
  return status === "todo" ? "TODO" : "IDLE";
}

/** Rating 0..10 from meeting count: 0 → 0, 20+ → 10 (linear). */
export function ratingFromMeetings(meetings: number): number {
  const n = Math.max(0, Math.floor(meetings));
  if (n <= 0) return 0;
  if (n >= 20) return 10;
  return Math.round((n / 20) * 100) / 10;
}

export function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type BirthdayNotification = {
  id: string;
  text: string;
  daysUntil: number;
};

export function formatBirthdayDdMm(month: number, day: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

/** Days until the next occurrence of a birthday (0 = today). */
export function daysUntilNextBirthday(
  month: number,
  day: number,
  from: Date = new Date()
): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = startOfLocalDay(from);
  const year = today.getFullYear();
  let next = new Date(year, month - 1, day, 12, 0, 0);
  if (Number.isNaN(next.getTime())) return null;
  if (next < today) {
    next = new Date(year + 1, month - 1, day, 12, 0, 0);
    if (Number.isNaN(next.getTime())) return null;
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export function buildBirthdayNotifications(
  contacts: Array<{
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    birthdayMonth: number | null;
    birthdayDay: number | null;
  }>,
  from: Date = new Date(),
  withinDays = 7
): BirthdayNotification[] {
  const items: BirthdayNotification[] = [];
  for (const contact of contacts) {
    const month = contact.birthdayMonth;
    const day = contact.birthdayDay;
    if (month == null || day == null) continue;
    const daysUntil = daysUntilNextBirthday(month, day, from);
    if (daysUntil === null || daysUntil < 0 || daysUntil > withinDays) continue;
    const label =
      contact.name?.trim() || `${contact.firstName} ${contact.lastName}`.trim();
    if (!label) continue;
    items.push({
      id: contact.id,
      daysUntil,
      text: `Contact's birthday: ${label} - birthday date: ${formatBirthdayDdMm(month, day)}`,
    });
  }
  return items.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.text.localeCompare(b.text, "en")
  );
}

export function mapContactForClient(contact: {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  sphere: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  comment: string | null;
  lastTouchDate: Date | null;
  touchesCount: number;
  taskId: string | null;
  status: string;
  task?: { id: string; title: string } | null;
}) {
  const displayName =
    contact.name?.trim() || `${contact.firstName} ${contact.lastName}`.trim() || "—";
  const meetings = contact.touchesCount;
  const rating = ratingFromMeetings(meetings);
  return {
    id: contact.id,
    name: displayName,
    sphere: contact.sphere,
    birthdayMonth: contact.birthdayMonth,
    birthdayDay: contact.birthdayDay,
    comment: contact.comment,
    lastTouchDate: contact.lastTouchDate ? contact.lastTouchDate.toISOString() : null,
    touchesCount: meetings,
    taskId: contact.taskId,
    taskTitle: contact.task?.title ?? null,
    rating,
    status: contactStatusToClient(contact.status as ContactStatus),
  };
}

export function contactWriteData(
  userId: string,
  data: any,
  existing?: { firstName: string; lastName: string }
) {
  const touchesCount = data.touchesCount ?? 0;
  const parts = data.name.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || (existing?.lastName ?? "");
  return {
    userId,
    name: data.name.trim(),
    firstName,
    lastName,
    sphere: data.sphere.trim(),
    birthdayMonth: data.birthdayMonth ?? null,
    birthdayDay: data.birthdayDay ?? null,
    comment: data.comment?.trim() || null,
    lastTouchDate: parseOptionalDate(data.lastTouchDate),
    touchesCount,
    taskId: data.taskId ?? null,
    status: contactStatusFromClient(data.status ?? "idle"),
  };
}
