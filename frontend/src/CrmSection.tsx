import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import {
  CRM_ADD_NEW_SPHERE,
  CRM_PORTRAIT_ICON,
  collectSpheres,
  formatBirthday,
  formatContactStatus,
  formatLastContact,
  compareCrmContacts,
  formatRating,
  ratingFromMeetings,
  type CrmSortKey,
  tasksForContactPicker,
  type ContactStatus,
  type CrmContact,
  type CrmTaskOption,
} from "./crmUtils";

type ContactFormState = {
  name: string;
  sphere: string;
  status: ContactStatus;
  birthdayMonth: string;
  birthdayDay: string;
  comment: string;
  lastTouchDate: string;
  touchesCount: string;
  taskId: string;
};

function emptyForm(defaultSphere: string): ContactFormState {
  return {
    name: "",
    sphere: defaultSphere,
    status: "idle",
    birthdayMonth: "",
    birthdayDay: "",
    comment: "",
    lastTouchDate: "",
    touchesCount: "0",
    taskId: "",
  };
}

function formFromContact(c: CrmContact): ContactFormState {
  return {
    name: c.name,
    sphere: c.sphere,
    status: c.status ?? "idle",
    birthdayMonth: c.birthdayMonth != null ? String(c.birthdayMonth) : "",
    birthdayDay: c.birthdayDay != null ? String(c.birthdayDay) : "",
    comment: c.comment ?? "",
    lastTouchDate: c.lastTouchDate ? c.lastTouchDate.slice(0, 10) : "",
    touchesCount: String(c.touchesCount),
    taskId: c.taskId ?? "",
  };
}

function payloadFromForm(form: ContactFormState) {
  const touchesCount = Math.max(0, Math.floor(Number(form.touchesCount) || 0));
  const birthdayMonth = form.birthdayMonth ? Number(form.birthdayMonth) : null;
  const birthdayDay = form.birthdayDay ? Number(form.birthdayDay) : null;
  return {
    name: form.name.trim(),
    sphere: form.sphere.trim(),
    status: form.status,
    birthdayMonth,
    birthdayDay,
    comment: form.comment.trim() || null,
    lastTouchDate: form.lastTouchDate.trim() || null,
    touchesCount,
    taskId: form.taskId || null,
  };
}

function isFormValid(form: ContactFormState, spherePick: string): boolean {
  if (!form.name.trim()) return false;
  const sphere = spherePick.trim() || form.sphere.trim();
  return sphere.length > 0 && spherePick !== CRM_ADD_NEW_SPHERE;
}

function mergeSphereLists(contacts: CrmContact[], sessionSpheres: string[]): string[] {
  const set = new Set(collectSpheres(contacts));
  for (const s of sessionSpheres) {
    const t = s.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

type CrmSectionProps = {
  contacts: CrmContact[];
  tasks: CrmTaskOption[];
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onRefresh: () => Promise<void>;
  onContactPatched: (contact: CrmContact) => void;
  onContactCreated: (contact: CrmContact) => void;
  onContactDeleted: (contactId: string) => void;
  confirmDelete: (message: string) => Promise<boolean>;
};

export function CrmSection({
  contacts,
  tasks,
  request,
  onRefresh,
  onContactPatched,
  onContactCreated,
  onContactDeleted,
  confirmDelete,
}: CrmSectionProps) {
  const [sphereFilter, setSphereFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sphereModalOpen, setSphereModalOpen] = useState(false);
  const [newSphereName, setNewSphereName] = useState("");
  const [sessionSpheres, setSessionSpheres] = useState<string[]>([]);
  const [form, setForm] = useState<ContactFormState>(() => emptyForm(""));
  const [spherePick, setSpherePick] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [crmSort, setCrmSort] = useState<CrmSortKey>("name");
  const [crmSortDir, setCrmSortDir] = useState<"asc" | "desc">("asc");

  const spheres = useMemo(() => mergeSphereLists(contacts, sessionSpheres), [contacts, sessionSpheres]);
  const defaultSphere = sphereFilter === "ALL" ? "" : sphereFilter;

  const filtered = useMemo(() => {
    const list =
      sphereFilter === "ALL"
        ? contacts
        : contacts.filter((c) => c.sphere === sphereFilter);
    return [...list].sort((a, b) => {
      const primary = compareCrmContacts(a, b, crmSort, crmSortDir);
      if (primary !== 0) return primary;
      const byName = a.name.localeCompare(b.name, "en");
      if (byName !== 0) return byName;
      return compareCrmContacts(a, b, "lastContact", "desc");
    });
  }, [contacts, sphereFilter, crmSort, crmSortDir]);

  function toggleCrmSort(column: CrmSortKey) {
    if (crmSort === column) {
      setCrmSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setCrmSort(column);
    setCrmSortDir("asc");
  }

  const expandedContact = expandedId ? contacts.find((c) => c.id === expandedId) : null;
  const isEditing = editingId != null && editingId === expandedId;
  const previewRating = ratingFromMeetings(Math.max(0, Math.floor(Number(form.touchesCount) || 0)));
  const pickerTasks = useMemo(
    () => tasksForContactPicker(tasks, form.taskId || null),
    [tasks, form.taskId]
  );

  function pickSphere(sphere: string) {
    const trimmed = sphere.trim();
    setSpherePick(trimmed);
    setForm((p) => ({ ...p, sphere: trimmed }));
  }

  function initSpherePick(sphere: string, available: string[]) {
    if (sphere && available.includes(sphere)) {
      pickSphere(sphere);
    } else if (available.length > 0) {
      pickSphere(available[0]!);
    } else {
      setSpherePick("");
      setForm((p) => ({ ...p, sphere: "" }));
    }
  }

  function openCreateModal() {
    setExpandedId(null);
    setEditingId(null);
    setCreateError(null);
    const initial = emptyForm(defaultSphere);
    setForm(initial);
    initSpherePick(defaultSphere, spheres);
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    setCreateError(null);
  }

  function openView(contact: CrmContact) {
    setCreateModalOpen(false);
    setEditingId(null);
    if (expandedId === contact.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(contact.id);
    setForm(formFromContact(contact));
    initSpherePick(contact.sphere, mergeSphereLists(contacts, sessionSpheres));
  }

  function startEdit() {
    if (expandedId) setEditingId(expandedId);
  }

  function cancelEdit() {
    if (!expandedContact) return;
    setEditingId(null);
    setForm(formFromContact(expandedContact));
    initSpherePick(expandedContact.sphere, spheres);
  }

  function closeView() {
    setExpandedId(null);
    setEditingId(null);
  }

  function openSphereModal() {
    setNewSphereName("");
    setSphereModalOpen(true);
  }

  function closeSphereModal() {
    setSphereModalOpen(false);
    setNewSphereName("");
  }

  function confirmNewSphere() {
    const name = newSphereName.trim();
    if (!name) return;
    setSessionSpheres((prev) => (prev.includes(name) ? prev : [...prev, name]));
    pickSphere(name);
    closeSphereModal();
  }

  function onSphereSelectChange(value: string) {
    if (value === CRM_ADD_NEW_SPHERE) {
      openSphereModal();
      return;
    }
    pickSphere(value);
  }

  async function saveCreate() {
    const sphere = spherePick.trim() || form.sphere.trim();
    const body = payloadFromForm({ ...form, sphere });
    if (!body.name || !sphere) {
      setCreateError("Enter name and sphere.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const created = await request<CrmContact>("/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onContactCreated(created);
      closeCreateModal();
      await onRefresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!expandedId) return;
    const sphere = spherePick.trim() || form.sphere.trim();
    const body = payloadFromForm({ ...form, sphere });
    if (!body.name || !sphere) return;
    setSaving(true);
    try {
      const updated = await request<CrmContact>(`/contacts/${expandedId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onContactPatched(updated);
      setForm(formFromContact(updated));
      pickSphere(updated.sphere);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(contactId: string) {
    const ok = await confirmDelete("Delete this contact? This cannot be undone.");
    if (!ok) return;
    await request(`/contacts/${contactId}`, { method: "DELETE" });
    onContactDeleted(contactId);
    closeView();
    await onRefresh();
  }

  const sphereModal =
    sphereModalOpen &&
    createPortal(
      <section className="modal-backdrop modal-stacked" onClick={closeSphereModal}>
        <div className="panel modal-card crm-sphere-modal" onClick={(e) => e.stopPropagation()}>
          <div className="blizz-corners" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <h3>New sphere</h3>
          <label className="field-label">
            <span className="crm-field-caption">Sphere name</span>
            <input
              value={newSphereName}
              onChange={(e) => setNewSphereName(e.target.value)}
              placeholder="e.g. Work"
              autoFocus
            />
          </label>
          <div className="actions actions-right crm-sphere-modal-actions">
            <button
              type="button"
              onClick={confirmNewSphere}
              disabled={!newSphereName.trim()}
            >
              Add
            </button>
            <button type="button" className="secondary" onClick={closeSphereModal}>
              Cancel
            </button>
          </div>
        </div>
      </section>,
      document.body
    );

  const createModal =
    createModalOpen &&
    createPortal(
      <section
        className="modal-backdrop"
        onClick={() => {
          if (!saving) closeCreateModal();
        }}
      >
        <div className="panel modal-card crm-contact-modal" onClick={(e) => e.stopPropagation()}>
          <div className="blizz-corners" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <h3>New contact</h3>
          {createError ? <p className="crm-form-error">{createError}</p> : null}
          <ContactFields
            form={form}
            setForm={setForm}
            spheres={spheres}
            spherePick={spherePick}
            onSphereSelectChange={onSphereSelectChange}
            pickerTasks={pickerTasks}
            previewRating={previewRating}
            readOnly={false}
          />
          <div className="actions actions-right crm-modal-actions">
            <button
              type="button"
              onClick={() => void saveCreate()}
              disabled={saving || !isFormValid(form, spherePick)}
            >
              Create
            </button>
            <button type="button" className="secondary" onClick={closeCreateModal} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </section>,
      document.body
    );

  return (
    <section className="panel panel-inverse bank-tab-section crm-section">
      {sphereModal}
      {createModal}
      <div className="bank-page-air">
        <div className="auction-shell-wrap">
          <div className="auction-shell crm-shell">
            <span className="af-tl" aria-hidden="true" />
            <span className="af-top" aria-hidden="true" />
            <span className="af-tr" aria-hidden="true" />
            <span className="af-bl" aria-hidden="true" />
            <span className="af-bot" aria-hidden="true" />
            <span className="af-br" aria-hidden="true" />
            <img className="auction-portrait-coin" src={CRM_PORTRAIT_ICON} alt="" />
            <div className="auction-shell-header">
              <span className="auction-shell-title energy-bar-title">Social Capital</span>
              <span className="auction-shell-subtitle" aria-hidden="true" />
            </div>
            <div className="auction-shell-body">
              <div className="auction-layout">
                <aside className="auction-sidebar">
                  <button
                    type="button"
                    className={sphereFilter === "ALL" ? "active" : ""}
                    onClick={() => {
                      setSphereFilter("ALL");
                      closeView();
                    }}
                  >
                    <span className="auction-tab-title">All</span>
                  </button>
                  {spheres.map((sphere) => (
                    <button
                      key={sphere}
                      type="button"
                      className={sphereFilter === sphere ? "active" : ""}
                      onClick={() => {
                        setSphereFilter(sphere);
                        closeView();
                      }}
                    >
                      <span className="auction-tab-title">{sphere}</span>
                    </button>
                  ))}
                </aside>
                <div className="auction-content">
                  <div className="auction-topbar">
                    <div className="auction-meta">
                      <span>
                        Contacts: <strong>{filtered.length}</strong>
                      </span>
                      {sphereFilter !== "ALL" ? (
                        <span className="crm-sphere-pill">Sphere: {sphereFilter}</span>
                      ) : null}
                    </div>
                    <div className="actions actions-right">
                      <button type="button" onClick={openCreateModal}>
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="auction-table auction-table-crm">
                    <div className="auction-row auction-head">
                      <span>Name</span>
                      <span>
                        <button type="button" onClick={() => toggleCrmSort("lastContact")}>
                          Last contact
                        </button>
                      </span>
                      <span>Task</span>
                      <span>
                        <button type="button" onClick={() => toggleCrmSort("status")}>
                          Status
                        </button>
                      </span>
                      <span>
                        <button type="button" onClick={() => toggleCrmSort("rating")}>
                          Rating
                        </button>
                      </span>
                    </div>
                    {filtered.length === 0 ? (
                      <p className="crm-empty">No contacts in this view.</p>
                    ) : null}
                    {filtered.map((contact) => (
                      <div key={contact.id}>
                        <button
                          type="button"
                          className={`auction-row auction-row-button${expandedId === contact.id ? " auction-row-selected" : ""}`}
                          onClick={() => openView(contact)}
                        >
                          <span className="crm-name-cell">{contact.name}</span>
                          <span>{formatLastContact(contact.lastTouchDate)}</span>
                          <span className="crm-task-cell">{contact.taskTitle ?? "—"}</span>
                          <span
                            className={`crm-status-cell${contact.status === "todo" ? " crm-status-cell--todo" : ""}`}
                          >
                            {formatContactStatus(contact.status ?? "idle")}
                          </span>
                          <span className="crm-rating-cell">{formatRating(contact.rating)}</span>
                        </button>
                        {expandedId === contact.id ? (
                          <div className="auction-row-editor crm-detail-panel">
                            <ContactFields
                              form={form}
                              setForm={setForm}
                              spheres={spheres}
                              spherePick={spherePick}
                              onSphereSelectChange={onSphereSelectChange}
                              pickerTasks={pickerTasks}
                              previewRating={previewRating}
                              readOnly={!isEditing}
                              taskTitleFallback={contact.taskTitle}
                            />
                            <div className="actions actions-right crm-detail-actions">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void saveEdit()}
                                    disabled={saving || !isFormValid(form, spherePick)}
                                  >
                                    Save
                                  </button>
                                  <button type="button" className="secondary" onClick={cancelEdit} disabled={saving}>
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => void deleteContact(contact.id)}
                                    disabled={saving}
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button type="button" onClick={startEdit}>
                                    Edit
                                  </button>
                                  <button type="button" className="secondary" onClick={closeView}>
                                    Close
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type FieldsProps = {
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  spheres: string[];
  spherePick: string;
  onSphereSelectChange: (value: string) => void;
  pickerTasks: CrmTaskOption[];
  previewRating: number;
  readOnly: boolean;
  taskTitleFallback?: string | null;
};

function taskLabel(
  form: ContactFormState,
  pickerTasks: CrmTaskOption[],
  taskTitleFallback?: string | null
): string {
  if (!form.taskId) return "—";
  const t = pickerTasks.find((x) => x.id === form.taskId);
  if (t) return t.title + (t.isCompleted ? " (completed)" : "");
  if (taskTitleFallback) return taskTitleFallback;
  return "—";
}

function ContactFields({
  form,
  setForm,
  spheres,
  spherePick,
  onSphereSelectChange,
  pickerTasks,
  previewRating,
  readOnly,
  taskTitleFallback,
}: FieldsProps) {
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1);
  const selectSphereValue = spherePick && spheres.includes(spherePick) ? spherePick : spherePick || "";

  return (
    <>
      <p className="crm-editor-rating">
        Rating (auto): <strong>{formatRating(previewRating)}</strong>
        {form.birthdayMonth && form.birthdayDay ? (
          <> · Birthday: {formatBirthday(Number(form.birthdayMonth), Number(form.birthdayDay))}</>
        ) : null}
      </p>
      <div className={`crm-editor-grid${readOnly ? " crm-editor-grid--readonly" : ""}`}>
        <Field label="Name" readOnly={readOnly} value={form.name}>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </Field>
        <Field label="Sphere" readOnly={readOnly} value={form.sphere || spherePick || "—"}>
          {readOnly ? null : (
            <select
              value={selectSphereValue}
              onChange={(e) => onSphereSelectChange(e.target.value)}
            >
              {!spherePick && spheres.length === 0 ? (
                <option value="">Select or add sphere…</option>
              ) : null}
              {spheres.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={CRM_ADD_NEW_SPHERE}>Add new sphere…</option>
            </select>
          )}
        </Field>
        <Field label="Status" readOnly={readOnly} value={formatContactStatus(form.status)}>
          <select
            value={form.status}
            onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ContactStatus }))}
            disabled={readOnly}
          >
            <option value="idle">idle</option>
            <option value="todo">todo</option>
          </select>
        </Field>
        <Field
          label="Last contact"
          readOnly={readOnly}
          value={form.lastTouchDate ? formatLastContact(form.lastTouchDate) : "—"}
        >
          <input
            type="date"
            value={form.lastTouchDate}
            onChange={(e) => setForm((p) => ({ ...p, lastTouchDate: e.target.value }))}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </Field>
        <Field
          label="Birthday (month)"
          readOnly={readOnly}
          value={form.birthdayMonth || "—"}
        >
          <select
            value={form.birthdayMonth}
            onChange={(e) => setForm((p) => ({ ...p, birthdayMonth: e.target.value }))}
            disabled={readOnly}
          >
            <option value="">—</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Birthday (day)" readOnly={readOnly} value={form.birthdayDay || "—"}>
          <select
            value={form.birthdayDay}
            onChange={(e) => setForm((p) => ({ ...p, birthdayDay: e.target.value }))}
            disabled={readOnly}
          >
            <option value="">—</option>
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sum of meetings" readOnly={readOnly} value={form.touchesCount}>
          <input
            type="number"
            min={0}
            step={1}
            value={form.touchesCount}
            onChange={(e) => setForm((p) => ({ ...p, touchesCount: e.target.value }))}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </Field>
        <Field
          label="Task"
          readOnly={readOnly}
          value={taskLabel(form, pickerTasks, taskTitleFallback)}
          wide
        >
          <select
            value={form.taskId}
            onChange={(e) => setForm((p) => ({ ...p, taskId: e.target.value }))}
            disabled={readOnly}
          >
            <option value="">—</option>
            {pickerTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.isCompleted ? " (completed)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Commentary" readOnly={readOnly} value={form.comment.trim() || "—"} wide>
          <textarea
            rows={2}
            value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </Field>
      </div>
    </>
  );
}

function Field({
  label,
  readOnly,
  value,
  wide,
  children,
}: {
  label: string;
  readOnly: boolean;
  value: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field-label${wide ? " field-label--wide" : ""}`}>
      <span className="crm-field-caption">{label}</span>
      {readOnly ? <span className="crm-field-readonly">{value}</span> : children}
    </label>
  );
}
