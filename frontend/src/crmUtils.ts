import type { ContactStatus } from "../../shared/types";
export type { ContactStatus };

import type { CrmContact as BaseContact } from "../../shared/types";
export type CrmContact = BaseContact & { sphere?: string; birthdayMonth?: number; birthdayDay?: number; comment?: string; lastTouchDate?: string; touchesCount?: number; taskId?: string; taskTitle?: string; rating?: number; };

export type CrmTaskOption = {
  id: string;
  title: string;
  isCompleted: boolean;
};

export const CRM_ADD_NEW_SPHERE = "__add_new_sphere__";

export function formatContactStatus(status: ContactStatus): string {
  return status === "todo" ? "todo" : "idle";
}

export function tasksForContactPicker(tasks: CrmTaskOption[], currentTaskId: string | null): CrmTaskOption[] {
  const open = tasks.filter((t) => !t.isCompleted);
  if (currentTaskId && !open.some((t) => t.id === currentTaskId)) {
    const current = tasks.find((t) => t.id === currentTaskId);
    if (current) {
      return [...open, current].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    }
  }
  return [...open].sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatBirthday(month: number | null, day: number | null): string {
  if (!month || !day) return "—";
  const label = MONTH_LABELS[month - 1] ?? String(month);
  return `${day} ${label}`;
}

export function formatLastContact(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function collectSpheres(contacts: CrmContact[]): string[] {
  const set = new Set<string>();
  for (const c of contacts) {
    const s = c.sphere?.trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export function lastTouchSortKey(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export type CrmSortKey = "name" | "lastContact" | "status" | "rating";

export function compareCrmContacts(
  a: CrmContact,
  b: CrmContact,
  key: CrmSortKey,
  dir: "asc" | "desc"
): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "lastContact":
      return sign * (lastTouchSortKey(a.lastTouchDate) - lastTouchSortKey(b.lastTouchDate));
    case "status": {
      const rank = (s: ContactStatus) => (s === "todo" ? 1 : 0);
      return sign * (rank(a.status) - rank(b.status));
    }
    case "rating":
      return sign * (a.rating - b.rating);
    case "name":
    default:
      return sign * a.name.localeCompare(b.name, "en");
  }
}

export const WOWHEAD_ICON_BASE = "/icons";

export const CRM_PORTRAIT_ICON = `${WOWHEAD_ICON_BASE}/inv_misc_groupneedmore.png`;

/** Same formula as backend `ratingFromMeetings`. */
export function ratingFromMeetings(meetings: number): number {
  const n = Math.max(0, Math.floor(meetings));
  if (n <= 0) return 0;
  if (n >= 20) return 10;
  return Math.round((n / 20) * 100) / 10;
}
