export type GoalCategory = "FINANCIAL" | "EDUCATION" | "CAREER" | "FAMILY" | "PERSONAL" | "SPORT";
export type GoalPriority = "1" | "2" | "3" | "-";
export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EPIC";
export type TaskDifficulty = Difficulty;
export type AssetCategory = "DEPOSIT" | "STOCK" | "CRYPTO" | "NON_FINANCIAL";
export type CryptoTxKind = "BUY" | "SELL" | "DIVIDEND";
export type CryptoTransactionType = CryptoTxKind;
export type ContactStatus = "idle" | "todo";
export type Tab = "goals" | "profile" | "crm" | "bank";

export type User = {
  login: string;
  level: number;
  xp: number;
  energy: number;
  coingeckoApiKey?: string | null;
  dailyEnergyLoss?: number;
  assetColorGreenThreshold?: number;
  assetColorBlueThreshold?: number;
  assetColorPurpleThreshold?: number;
  epicTaskWarningEnergy?: number;
  hardTaskWarningEnergy?: number;
  mediumTaskWarningEnergy?: number;
};

export type Subtask = { id: string; taskId: string; title: string; isCompleted: boolean; createdAt?: string };

export type Goal = {
  id: string;
  title: string;
  description?: string | null;
  definitionDone?: string | null;
  resources?: string | null;
  deadline?: string | null;
  category: GoalCategory;
  iconName?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  createdAt?: string;
  difficulty?: Difficulty | null;
  energyReward?: number;
  tasks?: Task[];
};

export type Task = {
  id: string;
  goalId: string | null;
  goalSortOrder?: number;
  category: GoalCategory;
  title: string;
  comment?: string;
  definitionDone?: string;
  deadline?: string;
  progress: number;
  inFocus: boolean;
  focusSlot?: number | null;
  isCompleted: boolean;
  xpReward: number;
  difficulty: Difficulty;
  subtasks?: Subtask[];
};

export type CryptoTransaction = {
  id: string;
  assetId: string;
  type: CryptoTxKind;
  executedAt: string;
  quantity: number;
  totalRub: number;
};

export type Asset = {
  id: string;
  name: string;
  category: AssetCategory;
  quantity: number;
  ticker?: string | null;
  coingeckoId?: string | null;
  manualValueRub?: number | null;
  acquisitionDate?: string | null;
  depositRateAnnual?: number | null;
  depositCloseDate?: string | null;
  taxProfitPercent?: number | null;
  iconName?: string | null;
  purchaseCostRub?: number | null;
  expectedPriceRub?: number | null;
  currentValueRub: number;
  pricingSource: "MANUAL" | "COINGECKO" | "MOEX" | "DEPOSIT";
  inflationAdjustedRub: number;
  cryptoCostBasisRub?: number;
  stockCostBasisRub?: number;
  stockInflationAdjustedCostBasisRub?: number;
  expectedProfitInflationRub?: number | null;
};

export type Notification = { id: string; text: string };
export type CryptoPerfItem = { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null };
export type StockPerfItem = { oneMonthPct: number | null; oneYearPct: number | null; twoYearPct: number | null };

export type CrmContact = {
  id: string;
  name: string;
  role?: string | null;
  status: ContactStatus;
  avatarUrl?: string | null;
  notes?: string | null;
  tasks?: Task[];
  relatedTasksCount?: number;
};

export type DashboardPayload = {
  user: User;
  levelTargetXp: number;
  weekProgress: string;
  goals: Goal[];
  tasks: Task[];
  contacts: CrmContact[];
  assets: Asset[];
  totalMoneyRub: number;
  totalMoneyInflationAdjustedRub: number;
  notifications: Notification[];
};

export type AssetFormState = {
  name: string;
  category: AssetCategory;
  quantity: string;
  manualValueRub: string;
  acquisitionDate: string;
  ticker: string;
  coingeckoId: string;
  depositRateAnnual: string;
  depositCloseDate: string;
  taxProfitPercent: string;
  iconName: string;
  purchaseCostRub: string;
  expectedPriceRub: string;
};

export type BankSortKey =
  | "name"
  | "category"
  | "quantity"
  | "currentValueRub"
  | "inflationAdjustedRub"
  | "acquisitionDate"
  | "profit"
  | "profitInflation"
  | "expectedPriceRub"
  | "expectedProfitInflation";
