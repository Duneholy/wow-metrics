import type { User } from "@prisma/client";

export function levelXp(level: number): number {
  return 400 * Math.pow(2, Math.max(0, level - 1));
}

export function stripUserPassword(user: User): Omit<User, "password"> {
  const { password, ...safeUser } = user;
  return safeUser;
}
