import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { JWT_SECRET } from "../config.js";

export type AuthRequest = Request & { userId: string };

export function getUserId(req: Request): string {
  return (req as unknown as AuthRequest).userId;
}

export function getTokenPayload(token?: string) {
  if (!token) {
    return null;
  }
  try {
    return jwt.verify(token.replace("Bearer ", ""), JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const publicRoutes = ["/health", "/auth/login", "/auth/status", "/auth/register"];
  if (publicRoutes.includes(req.path) || req.path.startsWith("/auth/users/")) {
    next();
    return;
  }
  const payload = getTokenPayload(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  (req as AuthRequest).userId = user.id;
  next();
};
