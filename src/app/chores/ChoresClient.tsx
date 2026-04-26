"use client";

import { useState, useTransition, useRef } from "react";
import { NavBar } from "@/components/NavBar";
import { DAY_NAMES, DAY_FULL } from "@/lib/week-utils";
import {
  addChore, deleteChore, updateChore,
  upsertDayLabel, loadDefaultChores,
} from "./actions";
import type { Chore } from "@/lib/types";
import styles from "./ChoresClient.module.css";

interface DayLabel { day_of_week: string; label: string; }

interface Props {
  chores: Chore[];
  dayLabels: DayLabel[];
  householdName: string;
}

const ALL_DAYS = ["daily", ...DAY_NAMES] as const;

export function ChoresClient({ chores: initialChores, dayLabels: initialLabels, householdName }: Props) {
  const [chores, setChores] = useState<Chore[]>(initialChores);
  const [labels, setLabels] = useState<Map<string, string>>(
    new Map(initialLabels.map((l) => [l.day_of_week, l.label]))
  );
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingDefaults, startDefaultsTransition] = useTransition();
  const [, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const choresByDay = (day: string) => chores.filter((c) => c.recurrence === day);

  function handleLoadDefaults() {
    startDefaultsTransition(async () => {
      await loadDefaultChores();
      // Refresh by reloading page data
      window.location.reload();
    });
    setShowConfirm(false);
  }

  function handleLabelBlur(day: string, value: string) {
    const trimmed = value.trim();
    setLabels((prev) => new Map(prev).set(day, trimmed));
    startTransition(async () => {
      await upsertDayLabel(day, trimmed);
    });
  }

  function handleDelete(choreId: string) {
    setChores((prev) => prev.filter((c) => c.id !== choreId));
    startTransition(async () => { await deleteChore(choreId); });
  }

  return (
    <div className={styles.shell}>
      <NavBar householdName={householdName} />

      <main className={styles.main}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Manage Chores</h1>
            <p className={styles.pageSubtitle}>
              Add, edit, or remove chores for each day.
            </p>
          </div>
          <button
            id="btn-load-defaults"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowConfirm(true)}
            disabled={loadingDefaults}
          >
            {loadingDefaults ? <span className="spinner" /> : "✨ Load Defaults"}
          </button>
        </div>

        {/* Confirm dialog */}
        {showConfirm && (
          <div className={`glass ${styles.confirm}`}>
            <p>Load a default set of chores organized by room?</p>
            <p className={styles.confirmNote}>Existing chores will not be removed.</p>
            <div className={styles.confirmBtns}>
              <button className="btn btn-primary btn-sm" onClick={handleLoadDefaults}>
                Yes, load defaults
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Day sections */}
        {ALL_DAYS.map((day, i) => {
          const dayChores = choresByDay(day);
          const label = labels.get(day) ?? "";
          const displayName = day === "daily" ? "Daily" : DAY_FULL[i - 1];

          return (
            <DaySection
              key={day}
              day={day}
              displayName={displayName}
              label={label}
              chores={dayChores}
              isAdding={addingTo === day}
              editingId={editingId}
              onLabelBlur={(val) => handleLabelBlur(day, val)}
              onAddStart={() => { setAddingTo(day); setEditingId(null); }}
              onAddCancel={() => setAddingTo(null)}
              onAdded={(chore) => {
                setChores((prev) => [...prev, chore]);
                setAddingTo(null);
              }}
              onEditStart={(id) => { setEditingId(id); setAddingTo(null); }}
              onEditCancel={() => setEditingId(null)}
              onEdited={(updated) => {
                setChores((prev) => prev.map((c) => c.id === updated.id ? updated : c));
                setEditingId(null);
              }}
              onDelete={handleDelete}
            />
          );
        })}

        <div className={styles.bottomPad} />
      </main>
    </div>
  );
}

/* ── Day Section ───────────────────────────────────────────── */
interface DaySectionProps {
  day: string;
  displayName: string;
  label: string;
  chores: Chore[];
  isAdding: boolean;
  editingId: string | null;
  onLabelBlur: (val: string) => void;
  onAddStart: () => void;
  onAddCancel: () => void;
  onAdded: (chore: Chore) => void;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onEdited: (chore: Chore) => void;
  onDelete: (id: string) => void;
}

function DaySection({
  day, displayName, label, chores, isAdding, editingId,
  onLabelBlur, onAddStart, onAddCancel, onAdded,
  onEditStart, onEditCancel, onEdited, onDelete,
}: DaySectionProps) {
  const labelRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`glass ${styles.daySection}`}>
      {/* Section header */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitles}>
          <span className={styles.dayName}>{displayName}</span>
          <input
            ref={labelRef}
            className={styles.labelInput}
            defaultValue={label}
            placeholder="Add a subtitle (e.g. Bathrooms)"
            onBlur={(e) => onLabelBlur(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && labelRef.current?.blur()}
            aria-label={`${displayName} day subtitle`}
          />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onAddStart}
          id={`btn-add-${day}`}
          aria-label={`Add chore to ${displayName}`}
        >
          + Add
        </button>
      </div>

      {/* Chore list */}
      {chores.length > 0 && (
        <ul className={styles.choreList}>
          {chores.map((chore) =>
            editingId === chore.id ? (
              <li key={chore.id} className={styles.choreRow}>
                <EditChoreForm
                  chore={chore}
                  onCancel={onEditCancel}
                  onSaved={onEdited}
                />
              </li>
            ) : (
              <li key={chore.id} className={styles.choreRow}>
                <span className={styles.choreIcon}>☐</span>
                <div className={styles.choreText}>
                  <span className={styles.choreName}>{chore.name}</span>
                  {chore.description && (
                    <span className={styles.choreDesc}>{chore.description}</span>
                  )}
                </div>
                <div className={styles.choreActions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => onEditStart(chore.id)}
                    aria-label={`Edit ${chore.name}`}
                    title="Edit"
                  >✏️</button>
                  <button
                    className={`${styles.iconBtn} ${styles.deleteBtn}`}
                    onClick={() => onDelete(chore.id)}
                    aria-label={`Delete ${chore.name}`}
                    title="Delete"
                  >🗑️</button>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {/* Add chore inline form */}
      {isAdding && (
        <AddChoreForm
          day={day}
          onCancel={onAddCancel}
          onAdded={onAdded}
        />
      )}

      {chores.length === 0 && !isAdding && (
        <p className={styles.emptyDay}>No chores yet for this day.</p>
      )}
    </div>
  );
}

/* ── Add Chore Form ────────────────────────────────────────── */
function AddChoreForm({ day, onCancel, onAdded }: {
  day: string;
  onCancel: () => void;
  onAdded: (chore: Chore) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("recurrence", day);
    setError(null);
    startTransition(async () => {
      const result = await addChore(fd);
      if (result.error) { setError(result.error); return; }
      // Build an optimistic chore object to return
      const optimistic: Chore = {
        id: crypto.randomUUID(),
        household_id: "",
        name: (fd.get("name") as string).trim(),
        description: (fd.get("description") as string | null)?.trim() || null,
        recurrence: day as Chore["recurrence"],
        display_order: 999,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      onAdded(optimistic);
    });
  }

  return (
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <input
        name="name"
        className={`form-input ${styles.inlineInput}`}
        placeholder="Chore name"
        required
        autoFocus
        autoComplete="off"
      />
      <input
        name="description"
        className={`form-input ${styles.inlineInput}`}
        placeholder="Description (optional)"
        autoComplete="off"
      />
      {error && <p className={styles.inlineError}>{error}</p>}
      <div className={styles.inlineActions}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? <span className="spinner" /> : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Edit Chore Form ───────────────────────────────────────── */
function EditChoreForm({ chore, onCancel, onSaved }: {
  chore: Chore;
  onCancel: () => void;
  onSaved: (updated: Chore) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateChore(chore.id, fd);
      if (result.error) { setError(result.error); return; }
      onSaved({
        ...chore,
        name: (fd.get("name") as string).trim(),
        description: (fd.get("description") as string | null)?.trim() || null,
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <input
        name="name"
        className={`form-input ${styles.inlineInput}`}
        defaultValue={chore.name}
        required
        autoFocus
        autoComplete="off"
      />
      <input
        name="description"
        className={`form-input ${styles.inlineInput}`}
        defaultValue={chore.description ?? ""}
        placeholder="Description (optional)"
        autoComplete="off"
      />
      {error && <p className={styles.inlineError}>{error}</p>}
      <div className={styles.inlineActions}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? <span className="spinner" /> : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
