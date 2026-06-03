import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 4000);

const secret = process.env.JWT_SECRET ?? "replace_me";
if (secret === "replace_me" || secret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long and not 'replace_me'");
}
export const JWT_SECRET = secret;
export const DASHBOARD_CPI_BUDGET_MS = Number(process.env.DASHBOARD_CPI_BUDGET_MS ?? 400);
export const DASHBOARD_ASSET_PRICE_BUDGET_MS = Number(process.env.DASHBOARD_ASSET_PRICE_BUDGET_MS ?? 600);
