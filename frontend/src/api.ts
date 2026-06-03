export function resolveApiBase(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:4000";
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) {
    return `${window.location.origin}/api`;
  }
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export const API = resolveApiBase();

let currentToken: string | null = localStorage.getItem("pm_token");
let onSessionExpired: (() => void) | null = null;

export function setApiToken(token: string | null) {
  currentToken = token;
  if (token) {
    localStorage.setItem("pm_token", token);
  } else {
    localStorage.removeItem("pm_token");
  }
}

export function getApiToken() {
  return currentToken;
}

export function setSessionExpiredCallback(cb: () => void) {
  onSessionExpired = cb;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Нет связи с API (Failed to fetch). Запустите backend на порту 4000. В режиме npm run dev запросы идут через прокси /api."
      );
    }
    throw e;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    const errMsg = typeof body.error === "string" ? body.error : "Request failed";
    if (response.status === 401 && !path.startsWith("/auth/login")) {
      setApiToken(null);
      if (onSessionExpired) onSessionExpired();
      throw new Error("SESSION_EXPIRED");
    }
    throw new Error(errMsg);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
