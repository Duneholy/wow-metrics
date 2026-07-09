import React, { useState, useEffect, useRef } from "react";
import { getApiToken, setApiToken, setSessionExpiredCallback, request } from "./api";
import { BankSection } from "./BankSection";
import { amountToCoins } from "./bankUtils";
import { QuestLogSection } from "./QuestLogSection";
import { MyGoalsSection } from "./MyGoalsSection";
import { CrmSection } from "./CrmSection";
import { EnergyBar, type EnergyPayloadPatch } from "./EnergyBar";
import type { DashboardPayload, User, GoalCategory, Goal } from "../../shared/types";
import { Clock } from "./Clock";

export default function App() {
  const [token, setToken] = useState<string | null>(getApiToken());
  const [activeTab, setActiveTab] = useState("goals");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);


  const [energyPatch, setEnergyPatch] = useState<EnergyPayloadPatch | null>(null);
  const [energyPatchNonce, setEnergyPatchNonce] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const unreadCount = dashboard?.notifications.length ?? 0;
  const totalMoneyCoins = amountToCoins(dashboard?.totalMoneyRub ?? 0);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalForm, setGoalModalForm] = useState<{ title: string; category: GoalCategory; description: string }>({ title: "", category: "PERSONAL", description: "" });

  async function addGoal() {
    if (!goalModalForm.title.trim()) return;
    try {
      const newGoal = await request<Goal>("/goals", { method: "POST", body: JSON.stringify({ title: goalModalForm.title, category: goalModalForm.category, description: goalModalForm.description }) });
      setDashboard((prev) => prev ? { ...prev, goals: [newGoal, ...prev.goals] } : prev);
      setGoalModalOpen(false);
      setGoalModalForm({ title: "", category: "PERSONAL", description: "" });
    } catch (err: any) {
      alert(err.message || "Failed to create goal");
    }
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDialogOptions, setConfirmDialogOptions] = useState<any>(null);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<User>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Login
  const [isSetupMode, setIsSetupMode] = useState<boolean | null>(null);
  const [loginStep, setLoginStep] = useState<"select" | "password" | "register" | "delete">("select");
  const [authUsers, setAuthUsers] = useState<string[]>([]);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    setSessionExpiredCallback(() => {
      setToken(null);
      setDashboard(null);
    });
  }, []);

  useEffect(() => {
    if (!token) {
      request<{hasUsers: boolean, users: string[]}>("/auth/status")
        .then((data) => {
          setAuthUsers(data.users || []);
          if (!data.hasUsers) {
            setIsSetupMode(true);
            setLoginStep("register");
          } else {
            setIsSetupMode(false);
            setLoginStep("select");
          }
        })
        .catch((err) => {
          console.error(err);
          setError(err.message || "Cannot connect to backend");
          setIsSetupMode(false);
          setLoginStep("select");
        });
    } else {
      loadDashboard();
    }
  }, [token]);

  async function loadDashboard(opts?: { silent?: boolean }) {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await request<DashboardPayload>("/dashboard");
      setDashboard(data);
      setSettingsForm(data.user ?? {});
      return data;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load dashboard");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError("Username and password required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = isSetupMode ? "/auth/register" : "/auth/login";
      const payload: any = { login: login.trim(), password: password.trim() };
      const data = await request<{ token: string }>(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setApiToken(data.token);
      setToken(data.token);
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  }

  function openConfirmDialog(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmDialogOptions({ message, resolve });
    });
  }
  function resolveConfirmDialog(confirm: boolean) {
    if (confirmDialogOptions && confirmDialogOptions.resolve) {
      confirmDialogOptions.resolve(confirm);
    }
    setConfirmDialogOptions(null);
  }

  async function confirmDeleteAccount() {
    if (!confirmDeleteTarget) return;
    setLoading(true);
    try {
      await request(`/auth/users/${confirmDeleteTarget}`, { method: "DELETE" });
      setConfirmDeleteTarget(null);
      setDeleteTarget("");
      setLoginStep("select");
      const data = await request<{hasUsers: boolean, users: string[]}>("/auth/status");
      setAuthUsers(data.users || []);
      if (!data.hasUsers) {
        setIsSetupMode(true);
        setLoginStep("register");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    setDashboard((prev) => prev ? { ...prev, user: { ...prev.user, ...settingsForm } as any } : prev);
    setSettingsOpen(false);
    try {
      await request("/settings", { method: "PATCH", body: JSON.stringify(settingsForm) });
      await loadDashboard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettingsSaving(false);
    }
  }

  function openSettings() {
    setSettingsForm(dashboard?.user ?? {});
    setSettingsOpen(true);
  }

  return (
    <>
      <main className={`app${!token ? " app--login-preview" : ""}`} aria-hidden={!token ? true : undefined}>
        <header className="titan">
          <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
          <div className="titan-left">
            <span className="titan-cell"><img className="titan-icon" src="/textures/time.PNG" alt="" /><Clock /></span>
            <span className="titan-cell"><img className="titan-icon" src="/textures/AdventureGuideMicrobuttonAlert.PNG" alt="" />Quests: {dashboard?.weekProgress ?? "0/0"}</span>
            <span className="titan-cell"><img className="titan-icon" src="/textures/level.PNG" alt="" />Level: {dashboard?.user.level ?? 1} XP: {dashboard?.user.xp ?? 0}/{dashboard?.levelTargetXp ?? 400}</span>
            <span className="titan-cell"><img className="titan-icon" src="/textures/bank.PNG" alt="" />Bank:
              <span className="coin-inline">{totalMoneyCoins.gold}<span className="coin-icon coin-gold" /></span>
              <span className="coin-inline">{totalMoneyCoins.silver}<span className="coin-icon coin-silver" /></span>
            </span>
            <span className="titan-cell"><img className="titan-icon" src="/textures/energy.PNG" alt="" />Energy: {dashboard?.user.energy ?? 100}%</span>
          </div>
          <div className="titan-right">
            <div className="titan-notifications-wrap" ref={notificationsRef}>
              <button
                type="button"
                className="titan-notifications-btn"
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                🔔 {unreadCount}
              </button>
              {notificationsOpen ? (
                <div className="notifications-popover panel" role="dialog" aria-label="Notifications">
                  <h3>Notifications</h3>
                  {dashboard?.notifications.length ? (
                    <ul className="notifications-list">
                      {dashboard.notifications.map((item) => (
                        <li key={item.id}>{item.text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="notifications-empty">No notifications</p>
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={openSettings}>⚙️ Settings</button>
            <button type="button" onClick={() => { setToken(null); setApiToken(null); setDashboard(null); localStorage.removeItem("pm_token"); }}>Log out</button>
          </div>
        </header>

        <div className="global-xp-bar" title={`XP: ${dashboard?.user.xp ?? 0} / ${dashboard?.levelTargetXp ?? 400}`}>
          <div className="global-xp-fill" style={{ width: `${Math.min(100, Math.max(0, ((dashboard?.user.xp ?? 0) / (dashboard?.levelTargetXp ?? 400)) * 100))}%` }}></div>
          <div className="global-xp-segments">
            {[...Array(10)].map((_, i) => <div key={i} className="xp-segment"></div>)}
          </div>
        </div>

        <nav className="tabs">
          <button className={activeTab === "goals" ? "active" : ""} onClick={() => setActiveTab("goals")}>Quest Log</button>
          <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>Profile</button>
          <button className={activeTab === "crm" ? "active" : ""} onClick={() => setActiveTab("crm")}>CRM</button>
          <button className={activeTab === "bank" ? "active" : ""} onClick={() => setActiveTab("bank")}>Bank</button>
        </nav>

        {activeTab === "goals" && <QuestLogSection dashboard={dashboard} setDashboard={setDashboard} request={request} loadDashboard={loadDashboard} token={token} setError={setError} openConfirmDialog={openConfirmDialog} />}

        {activeTab === "profile" && (
          <div className="profile-tab-content">
            <EnergyBar
              request={request}
              energyPatch={energyPatch}
              energyPatchNonce={energyPatchNonce}
              dailyEnergyLoss={dashboard?.user.dailyEnergyLoss ?? 10}
              onEnergyChange={(energy) => {
                setDashboard((prev) =>
                  prev ? { ...prev, user: { ...prev.user, energy } } : prev
                );
              }}
            />

            <MyGoalsSection
              goals={dashboard?.goals ?? []}
              tasks={dashboard?.tasks ?? []}
              request={request}
              onRefresh={async () => { await loadDashboard(); }}
              onNewGoal={() => setGoalModalOpen(true)}
              openConfirmDialog={openConfirmDialog}
              onGoalDeleted={(goalId) => setDashboard(prev => prev ? { ...prev, goals: prev.goals.filter(g => g.id !== goalId) } : prev)}
              onEnergyChange={(energy) => {
                setDashboard((prev) =>
                  prev ? { ...prev, user: { ...prev.user, energy } } : prev
                );
              }}
              onEnergyUpdate={(payload) => {
                setEnergyPatch(payload);
                setEnergyPatchNonce((n) => n + 1);
              }}
              onGoalPatched={(goal) => {
                setDashboard((prev) =>
                  prev
                    ? { ...prev, goals: prev.goals.map((g) => (g.id === goal.id ? goal : g)) }
                    : prev
                );
              }}
            />
          </div>
        )}

        {activeTab === "crm" && dashboard && <CrmSection contacts={dashboard.contacts} tasks={dashboard.tasks} request={request} onRefresh={() => loadDashboard().then(()=>undefined)} onContactPatched={() => loadDashboard().then(()=>undefined)} onContactCreated={() => loadDashboard().then(()=>undefined)} onContactDeleted={() => loadDashboard().then(()=>undefined)} confirmDelete={openConfirmDialog} />}

        {activeTab === "bank" && <BankSection dashboard={dashboard} setDashboard={setDashboard} request={request} loadDashboard={loadDashboard} token={token} setError={setError} openConfirmDialog={openConfirmDialog} resolveConfirmDialog={resolveConfirmDialog} />}

        <footer style={{ textAlign: "center", padding: "30px 10px 10px", color: "var(--text-muted)", fontSize: "var(--text-xs)", fontFamily: "var(--font-display)" }}>
          wow_metrics 1.2 &copy; Yury Mikhno, 2026
        </footer>
      </main>

      {goalModalOpen && (
        <section className="modal-backdrop modal-above-stack" onClick={() => setGoalModalOpen(false)}>
          <div className="panel modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h2 className="modal-title">New Goal</h2>
            <div className="crypto-tx-add">
              <h4 className="crypto-tx-add-title">Goal Details</h4>
              <div className="crypto-tx-add-fields">
                <label className="field-label">
                  Title
                  <input type="text" value={goalModalForm.title} onChange={(e) => setGoalModalForm({ ...goalModalForm, title: e.target.value })} autoFocus />
                </label>
                <label className="field-label">
                  Category
                  <select value={goalModalForm.category} onChange={(e) => setGoalModalForm({ ...goalModalForm, category: e.target.value as GoalCategory })}>
                    <option value="PERSONAL">Personal</option>
                    <option value="FINANCIAL">Financial</option>
                    <option value="EDUCATION">Education</option>
                    <option value="CAREER">Career</option>
                    <option value="FAMILY">Family</option>
                    <option value="SPORT">Sport</option>
                  </select>
                </label>
                <label className="field-label" style={{ gridColumn: "1 / -1" }}>
                  Description
                  <textarea value={goalModalForm.description} onChange={(e) => setGoalModalForm({ ...goalModalForm, description: e.target.value })} rows={3} />
                </label>
              </div>
            </div>
            <div className="actions crypto-tx-modal-footer" style={{ marginTop: "24px" }}>
              <button type="button" onClick={() => setGoalModalOpen(false)}>Cancel</button>
              <button type="button" onClick={addGoal}>Create</button>
            </div>
          </div>
        </section>
      )}

      {confirmDialogOptions && (
        <div className="modal-backdrop modal-above-stack" onClick={() => resolveConfirmDialog(false)}>
          <div className="panel modal-card" style={{ maxWidth: 300, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
            <h3 style={{ marginBottom: "16px" }}>Confirmation</h3>
            <p style={{ marginBottom: "24px" }}>{confirmDialogOptions.message}</p>
            <div className="actions" style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button type="button" className="secondary" onClick={() => resolveConfirmDialog(false)}>Cancel</button>
              <button type="button" onClick={() => resolveConfirmDialog(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {!token && isSetupMode !== null ? (
      <section className="modal-backdrop modal-above-stack">
        <div className="panel modal-card" style={{ maxWidth: 400, margin: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
          <h2 className="modal-title" style={{ textAlign: "center" }}>wow_metrics</h2>
          
          {loginStep === "select" && (
            <div className="login-select-step">
              <p style={{ textAlign: "center", marginBottom: "16px", color: "var(--text-dim)" }}>Select a profile to login</p>
              <div className="login-user-list" style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
                {authUsers.map((u) => (
                  <button key={u} type="button" className="secondary" onClick={() => { setLogin(u); setLoginStep("password"); setIsSetupMode(false); setError(null); }}>
                    {u}
                  </button>
                ))}
                <button type="button" onClick={() => { setLogin(""); setPassword(""); setLoginStep("register"); setIsSetupMode(true); setError(null); }}>
                  + Create new account
                </button>
                {authUsers.length > 0 && (
                  <button type="button" className="btn-delete-account" style={{ marginTop: "16px" }} onClick={() => { setDeleteTarget(""); setLoginStep("delete"); setError(null); }}>
                    Delete account
                  </button>
                )}
              </div>
            </div>
          )}

          {loginStep === "password" && (
            <form onSubmit={onLogin}>
              <div className="crypto-tx-add" style={{ marginTop: "16px" }}>
                <h4 className="crypto-tx-add-title">Login: {login}</h4>
                <div className="crypto-tx-add-fields">
                  <label className="field-label">
                    Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus />
                  </label>
                </div>
              </div>
              {error && <p className="error" style={{ marginTop: "12px", color: "var(--accent-red)", textAlign: "center" }}>{error}</p>}
              <div className="actions crypto-tx-modal-footer" style={{ marginTop: "24px" }}>
                <button type="button" className="secondary" onClick={() => { setLoginStep("select"); setError(null); setPassword(""); }}>Back</button>
                <button type="submit" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
              </div>
            </form>
          )}

          {loginStep === "register" && (
            <form onSubmit={onLogin}>
              <div className="crypto-tx-add" style={{ marginTop: "16px" }}>
                <h4 className="crypto-tx-add-title">New account</h4>
                <div className="crypto-tx-add-fields">
                  <label className="field-label">
                    Username
                    <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required autoFocus />
                  </label>
                  <label className="field-label">
                    Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
                  </label>
                </div>
              </div>
              {error && <p className="error" style={{ marginTop: "12px", color: "var(--accent-red)", textAlign: "center" }}>{error}</p>}
              <div className="actions crypto-tx-modal-footer" style={{ marginTop: "24px" }}>
                {authUsers.length > 0 && (
                  <button type="button" className="secondary" onClick={() => { setLoginStep("select"); setError(null); setPassword(""); }}>Back</button>
                )}
                <button type="submit" disabled={loading}>{loading ? "Creating..." : "Register"}</button>
              </div>
            </form>
          )}

          {loginStep === "delete" && (
            <form onSubmit={(e) => { e.preventDefault(); setConfirmDeleteTarget(deleteTarget); }}>
              <div className="crypto-tx-add" style={{ marginTop: "16px" }}>
                <h4 className="crypto-tx-add-title" style={{ color: "var(--accent-red)" }}>Delete account</h4>
                <div className="crypto-tx-add-fields">
                  <label className="field-label">
                    Username to delete
                    <input type="text" value={deleteTarget} onChange={(e) => setDeleteTarget(e.target.value)} required autoFocus />
                  </label>
                </div>
              </div>
              {error && <p className="error" style={{ marginTop: "12px", color: "var(--accent-red)", textAlign: "center" }}>{error}</p>}
              <div className="actions crypto-tx-modal-footer" style={{ marginTop: "24px" }}>
                <button type="button" className="btn-delete-account" onClick={() => { setLoginStep("select"); setError(null); setDeleteTarget(""); }}>Back</button>
                <button type="submit" className="btn-delete-account" disabled={!authUsers.includes(deleteTarget)}>Delete</button>
              </div>
            </form>
          )}

          {confirmDeleteTarget && (
            <div className="modal-backdrop modal-above-stack" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="panel modal-card" style={{ maxWidth: 300, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
                <h3 style={{ marginBottom: "16px", color: "var(--accent-red)" }}>Confirm Deletion</h3>
                <p style={{ marginBottom: "24px" }}>Are you sure you want to delete the account <strong>{confirmDeleteTarget}</strong>?</p>
                <div className="actions" style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
                  <button type="button" className="secondary" onClick={() => setConfirmDeleteTarget(null)}>No</button>
                  <button type="button" className="danger" disabled={loading} onClick={() => void confirmDeleteAccount()}>{loading ? "Deleting..." : "Yes"}</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>
    ) : null}
    {settingsOpen && (
      <section className="modal-backdrop modal-above-stack" onClick={() => setSettingsOpen(false)}>
        <div className="panel modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
          <div className="blizz-corners" aria-hidden="true"><span /><span /><span /><span /></div>
          <h2 className="modal-title">Settings</h2>
          
          <form onSubmit={saveSettings}>
            <div className="crypto-tx-add">
              <h4 className="crypto-tx-add-title">General</h4>
              <div className="crypto-tx-add-fields">
                <label className="field-label">
                  CoinGecko API Key
                  <input type="text" value={settingsForm.coingeckoApiKey ?? ""} onChange={(e) => setSettingsForm({ ...settingsForm, coingeckoApiKey: e.target.value })} />
                </label>
                <label className="field-label">
                  Daily Energy Loss (%)
                  <input type="number" min="0" max="100" required value={settingsForm.dailyEnergyLoss ?? 10} onChange={(e) => setSettingsForm({ ...settingsForm, dailyEnergyLoss: Number(e.target.value) })} />
                </label>
              </div>
            </div>

            <div className="crypto-tx-add">
              <h4 className="crypto-tx-add-title">Asset Colors (Rubles)</h4>
              <div className="crypto-tx-add-fields">
                <label className="field-label">
                  <span className="asset-value-uncommon">Green Threshold (Min)</span>
                  <input type="number" min="0" required value={settingsForm.assetColorGreenThreshold ?? 50000} onChange={(e) => setSettingsForm({ ...settingsForm, assetColorGreenThreshold: Number(e.target.value) })} />
                </label>
                <label className="field-label">
                  <span className="asset-value-rare">Blue Threshold (Min)</span>
                  <input type="number" min="0" required value={settingsForm.assetColorBlueThreshold ?? 150000} onChange={(e) => setSettingsForm({ ...settingsForm, assetColorBlueThreshold: Number(e.target.value) })} />
                </label>
                <label className="field-label">
                  <span className="asset-value-epic">Purple Threshold (Min)</span>
                  <input type="number" min="0" required value={settingsForm.assetColorPurpleThreshold ?? 300000} onChange={(e) => setSettingsForm({ ...settingsForm, assetColorPurpleThreshold: Number(e.target.value) })} />
                </label>
              </div>
            </div>

            <div className="crypto-tx-add">
              <h4 className="crypto-tx-add-title">Weekly Focus Warnings (Energy &lt;=)</h4>
              <div className="crypto-tx-add-fields">
                <label className="field-label">
                  Medium Task Warning
                  <input type="number" min="0" max="100" required value={settingsForm.mediumTaskWarningEnergy ?? 25} onChange={(e) => setSettingsForm({ ...settingsForm, mediumTaskWarningEnergy: Number(e.target.value) })} />
                </label>
                <label className="field-label">
                  Hard Task Warning
                  <input type="number" min="0" max="100" required value={settingsForm.hardTaskWarningEnergy ?? 45} onChange={(e) => setSettingsForm({ ...settingsForm, hardTaskWarningEnergy: Number(e.target.value) })} />
                </label>
                <label className="field-label">
                  Epic Task Warning
                  <input type="number" min="0" max="100" required value={settingsForm.epicTaskWarningEnergy ?? 60} onChange={(e) => setSettingsForm({ ...settingsForm, epicTaskWarningEnergy: Number(e.target.value) })} />
                </label>
              </div>
            </div>

            <div className="actions crypto-tx-modal-footer" style={{ marginTop: "24px" }}>
              <button type="button" onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button type="submit" disabled={settingsSaving}>{settingsSaving ? "Saving..." : "Save Settings"}</button>
            </div>
          </form>
        </div>
      </section>
    )}
    </>
  );
}



