"use client";

import { useState, useTransition, useRef } from "react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  sortableKeyboardCoordinates, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NavBar } from "@/components/NavBar";
import { DAY_NAMES, DAY_FULL } from "@/lib/week-utils";
import {
  addChore, deleteChore, updateChore,
  upsertDayLabel, loadDefaultChores, reorderChores,
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
  const [reorderMode, setReorderMode] = useState(false);
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

  function handleReorder(day: string, orderedIds: string[]) {
    setChores((prev) => {
      const others = prev.filter((c) => c.recurrence !== day);
      const dayMap = new Map(
        prev.filter((c) => c.recurrence === day).map((c) => [c.id, c])
      );
      const reordered = orderedIds.map((id, idx) => ({
        ...dayMap.get(id)!,
        display_order: idx,
      }));
      return [...others, ...reordered];
    });
    startTransition(async () => { await reorderChores(day, orderedIds); });
  }

  function toggleReorderMode() {
    setReorderMode((v) => !v);
    setAddingTo(null);
    setEditingId(null);
    setShowConfirm(false);
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
              {reorderMode
                ? "Drag chores to reorder within each day."
                : "Add, edit, or remove chores for each day."}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={`btn btn-sm ${reorderMode ? "btn-primary" : "btn-ghost"}`}
              onClick={toggleReorderMode}
              aria-pressed={reorderMode}
            >
              {reorderMode ? "✓ Done" : "↕ Reorder"}
            </button>
            {!reorderMode && (
              <button
                id="btn-load-defaults"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowConfirm(true)}
                disabled={loadingDefaults}
              >
                {loadingDefaults ? <span className="spinner" /> : "✨ Load Defaults"}
              </button>
            )}
          </div>
        </div>

        {/* Confirm dialog */}
        {showConfirm && !reorderMode && (
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
              reorderMode={reorderMode}
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
              onReorder={handleReorder}
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
  reorderMode: boolean;
  onLabelBlur: (val: string) => void;
  onAddStart: () => void;
  onAddCancel: () => void;
  onAdded: (chore: Chore) => void;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onEdited: (chore: Chore) => void;
  onDelete: (id: string) => void;
  onReorder: (day: string, orderedIds: string[]) => void;
}

function DaySection({
  day, displayName, label, chores, isAdding, editingId, reorderMode,
  onLabelBlur, onAddStart, onAddCancel, onAdded,
  onEditStart, onEditCancel, onEdited, onDelete, onReorder,
}: DaySectionProps) {
  const labelRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = chores.findIndex((c) => c.id === active.id);
    const newIdx = chores.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(chores, oldIdx, newIdx);
    onReorder(day, next.map((c) => c.id));
  }

  const renderedList = chores.length > 0 && (
    <ul className={styles.choreList}>
      {chores.map((chore) =>
        editingId === chore.id && !reorderMode ? (
          <li key={chore.id} className={styles.choreRow}>
            <EditChoreForm
              chore={chore}
              onCancel={onEditCancel}
              onSaved={onEdited}
            />
          </li>
        ) : (
          <SortableChoreRow
            key={chore.id}
            chore={chore}
            reorderMode={reorderMode}
            onEditStart={onEditStart}
            onDelete={onDelete}
          />
        )
      )}
    </ul>
  );

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
            readOnly={reorderMode}
            onBlur={(e) => onLabelBlur(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && labelRef.current?.blur()}
            aria-label={`${displayName} day subtitle`}
          />
        </div>
        {!reorderMode && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onAddStart}
            id={`btn-add-${day}`}
            aria-label={`Add chore to ${displayName}`}
          >
            + Add
          </button>
        )}
      </div>

      {/* Chore list */}
      {chores.length > 0 && (
        reorderMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={chores.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {renderedList}
            </SortableContext>
          </DndContext>
        ) : (
          renderedList
        )
      )}

      {/* Add chore inline form */}
      {isAdding && !reorderMode && (
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

/* ── Sortable Chore Row ────────────────────────────────────── */
function SortableChoreRow({
  chore, reorderMode, onEditStart, onDelete,
}: {
  chore: Chore;
  reorderMode: boolean;
  onEditStart: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: chore.id, disabled: !reorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.choreRow} ${isDragging ? styles.dragging : ""}`}
    >
      {reorderMode ? (
        <button
          type="button"
          className={styles.gripBtn}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${chore.name}`}
          title="Drag to reorder"
        >⋮⋮</button>
      ) : (
        <span className={styles.choreIcon}>☐</span>
      )}
      <div className={styles.choreText}>
        <span className={styles.choreName}>{chore.name}</span>
        {chore.description && (
          <span className={styles.choreDesc}>{chore.description}</span>
        )}
      </div>
      {!reorderMode && (
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
      )}
    </li>
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
