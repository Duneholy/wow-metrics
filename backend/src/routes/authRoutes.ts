import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { JWT_SECRET } from "../config.js";
import { loginSchema } from "../schemas/index.js";

export const authRoutes = Router();

authRoutes.get("/health", (_req, res) => {
  res.json({ ok: true });
});

authRoutes.get("/auth/status", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { login: true },
      orderBy: { createdAt: "asc" }
    });
    res.json({ hasUsers: users.length > 0, users: users.map(u => u.login) });
  } catch (err) {
    res.status(500).json({ error: "DB Error", hasUsers: false, users: [] });
  }
});

authRoutes.post("/auth/register", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const hashed = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      login: parsed.data.login,
      password: hashed,
    },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { login: user.login, level: user.level, xp: user.xp, energy: user.energy } });
});

authRoutes.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(parsed.data.password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { login: user.login, level: user.level, xp: user.xp, energy: user.energy } });
});

authRoutes.delete("/auth/users/:login", async (req, res) => {
  try {
    const { login } = req.params;
    if (!login) {
      res.status(400).json({ error: "Missing login parameter" });
      return;
    }
    await prisma.user.delete({ where: { login } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user. User may not exist." });
  }
});
