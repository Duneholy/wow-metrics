import "dotenv/config";
import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { loadFedstatCumulativeCpiIndex } from "./fedstatCpi.js";
import { getRussiaCpiByYear } from "./services/cpiService.js";

import { authRoutes } from "./routes/authRoutes.js";
import { contactRoutes } from "./routes/contactRoutes.js";
import { assetRoutes } from "./routes/assetRoutes.js";
import { energyRoutes } from "./routes/energyRoutes.js";
import { goalRoutes } from "./routes/goalRoutes.js";
import { taskRoutes } from "./routes/taskRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { settingsRoutes } from "./routes/settingsRoutes.js";
import { authMiddleware } from "./middlewares/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());

const corsOrigin = process.env.CORS_ORIGIN || "http://127.0.0.1:5173";
app.use(cors({ origin: [corsOrigin, "http://localhost:5173"], credentials: true }));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: { error: "Too many requests from this IP, please try again later." }
});
app.use(globalLimiter);

// Serve static frontend files FIRST so they are not blocked by authMiddleware
const frontendDist = path.join(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many login attempts from this IP, please try again after 15 minutes." }
});
app.use("/auth", authLimiter);

// Auth routes don't require authentication (login, register, status)
app.use(authRoutes);

// Protect all API routes below this point
app.use(authMiddleware);

app.use(contactRoutes);
app.use(assetRoutes);
app.use(energyRoutes);
app.use(goalRoutes);
app.use(taskRoutes);
app.use(dashboardRoutes);
app.use(settingsRoutes);

void loadFedstatCumulativeCpiIndex();
void getRussiaCpiByYear();

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
});

app.listen(port, () => {
  console.log(`Backend API running at http://localhost:${port}`);
});
