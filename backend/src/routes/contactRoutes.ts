import { Router } from "express";
import { prisma } from "../prisma.js";
import { getUserId } from "../middlewares/auth.js";
import { contactSchema, contactUpdateSchema } from "../schemas/index.js";
import { contactWriteData, mapContactForClient, contactStatusToClient } from "../contactLogic.js";

export const contactRoutes = Router();

contactRoutes.post("/contacts", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid contact data" });
    return;
  }
  const userId = getUserId(req);
  if (parsed.data.taskId) {
    const task = await prisma.task.findFirst({ where: { id: parsed.data.taskId, userId } });
    if (!task) {
      res.status(400).json({ error: "Task not found" });
      return;
    }
  }
  try {
    const contact = await prisma.contact.create({
      data: contactWriteData(userId, parsed.data),
      include: { task: { select: { id: true, title: true } } },
    });
    res.status(201).json(mapContactForClient(contact));
  } catch (e) {
    console.error("POST /contacts failed:", e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Contact create failed",
    });
  }
});

contactRoutes.patch("/contacts/:contactId", async (req, res) => {
  const { contactId } = req.params;
  const parsed = contactUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }
  const userId = getUserId(req);
  const existing = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!existing) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  if (parsed.data.taskId) {
    const task = await prisma.task.findFirst({ where: { id: parsed.data.taskId, userId } });
    if (!task) {
      res.status(400).json({ error: "Task not found" });
      return;
    }
  }
  const merged = {
    name: parsed.data.name ?? existing.name,
    sphere: parsed.data.sphere ?? existing.sphere,
    birthdayMonth: parsed.data.birthdayMonth !== undefined ? parsed.data.birthdayMonth : existing.birthdayMonth,
    birthdayDay: parsed.data.birthdayDay !== undefined ? parsed.data.birthdayDay : existing.birthdayDay,
    comment: parsed.data.comment !== undefined ? parsed.data.comment : existing.comment,
    lastTouchDate:
      parsed.data.lastTouchDate !== undefined
        ? parsed.data.lastTouchDate
        : existing.lastTouchDate
          ? existing.lastTouchDate.toISOString().slice(0, 10)
          : null,
    touchesCount: parsed.data.touchesCount ?? existing.touchesCount,
    taskId: parsed.data.taskId !== undefined ? parsed.data.taskId : existing.taskId,
    status:
      parsed.data.status !== undefined
        ? parsed.data.status
        : contactStatusToClient(existing.status as any),
  };
  try {
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: contactWriteData(userId, merged, existing),
      include: { task: { select: { id: true, title: true } } },
    });
    res.json(mapContactForClient(contact));
  } catch (e) {
    console.error("PATCH /contacts failed:", e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Contact update failed",
    });
  }
});

contactRoutes.delete("/contacts/:contactId", async (req, res) => {
  const { contactId } = req.params;
  const userId = getUserId(req);
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  await prisma.contact.delete({ where: { id: contactId } });
  res.status(204).send();
});
