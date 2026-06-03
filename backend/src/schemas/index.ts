import { z } from "zod";

export const CLIENT_GOAL_PRIORITY = z.enum(["1", "2", "3", "-"]);

export const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const goalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  definitionDone: z.string().optional(),
  resources: z.string().optional(),
  deadline: z.string().optional(),
  category: z.enum(["FINANCIAL", "EDUCATION", "CAREER", "FAMILY", "PERSONAL", "SPORT"]),
  priority: CLIENT_GOAL_PRIORITY.optional(),
});

export const goalUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  definitionDone: z.string().optional(),
  resources: z.string().optional(),
  deadline: z.string().nullable().optional(),
  category: z.enum(["FINANCIAL", "EDUCATION", "CAREER", "FAMILY", "PERSONAL", "SPORT"]).optional(),
  priority: CLIENT_GOAL_PRIORITY.optional(),
  iconName: z.string().nullable().optional(),
});

export const goalTasksReorderSchema = z.object({
  taskIds: z.array(z.string().min(1)),
});

export const taskSchema = z.object({
  category: z.enum(["FINANCIAL", "EDUCATION", "CAREER", "FAMILY", "PERSONAL", "SPORT"]),
  goalId: z.string().nullable().optional(),
  title: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EPIC"]),
  deadline: z.string().optional(),
  comment: z.string().optional(),
  definitionDone: z.string().optional(),
});

export const taskUpdateSchema = z.object({
  goalId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  category: z.enum(["FINANCIAL", "EDUCATION", "CAREER", "FAMILY", "PERSONAL", "SPORT"]).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "EPIC"]).optional(),
  deadline: z.string().optional(),
  comment: z.string().optional(),
  definitionDone: z.string().optional(),
});

export const subtaskCreateSchema = z.object({
  title: z.string().min(1),
});

export const focusToggleSchema = z.object({
  slot: z.number().int().min(0).max(6).optional(),
});

export const focusReorderSchema = z.object({
  targetSlot: z.number().int().min(0).max(6),
});

export const contactSchema = z.object({
  name: z.string().min(1),
  sphere: z.string().min(1),
  birthdayMonth: z.number().int().min(1).max(12).nullish(),
  birthdayDay: z.number().int().min(1).max(31).nullish(),
  comment: z.string().nullish(),
  lastTouchDate: z.string().nullish(),
  touchesCount: z.number().int().min(0).optional(),
  taskId: z.string().nullish(),
  status: z.enum(["idle", "todo"]).optional(),
});

export const contactUpdateSchema = contactSchema.partial();

export const assetCreateSchema = z
  .object({
    name: z.string().min(1),
    category: z.enum(["DEPOSIT", "STOCK", "CRYPTO", "NON_FINANCIAL"]),
    quantity: z.number().nonnegative(),
    ticker: z.string().nullish(),
    coingeckoId: z.string().nullish(),
    manualValueRub: z.number().nonnegative().nullish(),
    acquisitionDate: z.string().nullish(),
    depositRateAnnual: z.number().min(0).max(100).nullish(),
    depositCloseDate: z.string().nullish(),
    taxProfitPercent: z.number().min(0).max(100).nullish(),
    note: z.string().nullish(),
    iconName: z.string().nullish(),
    purchaseCostRub: z.number().nonnegative().nullish(),
    expectedPriceRub: z.number().nonnegative().nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.category !== "CRYPTO" && data.category !== "STOCK" && data.quantity <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Quantity must be positive", path: ["quantity"] });
    }
  });

export const assetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["DEPOSIT", "STOCK", "CRYPTO", "NON_FINANCIAL"]).optional(),
  quantity: z.number().nonnegative().optional(),
  ticker: z.string().nullish(),
  coingeckoId: z.string().nullish(),
  manualValueRub: z.number().nonnegative().nullish(),
  acquisitionDate: z.string().nullish(),
  depositRateAnnual: z.number().min(0).max(100).nullish(),
  depositCloseDate: z.string().nullish(),
  taxProfitPercent: z.number().min(0).max(100).nullish(),
  note: z.string().nullish(),
  iconName: z.string().nullish(),
  purchaseCostRub: z.number().nonnegative().nullish(),
  expectedPriceRub: z.number().nonnegative().nullish(),
});

export const cryptoTxCreateSchema = z.object({
  type: z.enum(["BUY", "SELL", "DIVIDEND"]),
  executedAt: z.string().min(1),
  quantity: z.number().nonnegative(),
  totalRub: z.number().nonnegative(),
});

export const cryptoTxUpdateSchema = cryptoTxCreateSchema.partial();

export const exerciseTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  energyTier: z.number().int().min(1).max(4),
});
