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
  addTask, deleteTask, updateTask,
  upsertDayLabel, loadDefaultTasks, reorderTasks,
} from "./actions";
import type { Task } from "@/lib/types";
import styles from "./TasksClient.module.css";

interface DayLabel { day_of_week: string; label: string; }

interface Props {
  tasks: Task[];
  dayLabels: DayLabel[];
  householdName: string;
}

const ALL_DAYS = ["monthly", "daily", ...DAY_NAMES] as const;

export function TasksClient({ tasks: initialTasks, dayLabels: initialLabels, householdName }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [labels, setLabels] = useState<Map<string, string>>(
    new Map(initialLabels.map((l) => [l.day_of_week, l.label]))
  );
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [loadingDefaults, startDefaultsTransition] = useTransition();
  const [, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const tasksByDay = (day: string) => tasks.filter((c) => c.recurrence === day);

  function handleLoadDefaults() {
    startDefaultsTransition(async () => {
      await loadDefaultTasks();
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

  function handleDelete(taskId: string) {
    setTasks((prev) => prev.filter((c) => c.id !== taskId));
    startTransition(async () => { await deleteTask(taskId); });
  }

  function handleReorder(day: string, orderedIds: string[]) {
    setTasks((prev) => {
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
    startTransition(async () => { await reorderTasks(day, orderedIds); });
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
            <h1 className={styles.pageTitle}>Manage Tasks</h1>
            <p className={styles.pageSubtitle}>
              {reorderMode
                ? "Drag tasks to reorder within each day."
                : "Add, edit, or remove tasks for each day."}
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
            <p>Load a default set of tasks organized by room?</p>
            <p className={styles.confirmNote}>Existing tasks will not be removed.</p>
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
          const dayTasks = tasksByDay(day);
          const label = labels.get(day) ?? "";
          const displayName = day === "monthly" ? "Monthly" : day === "daily" ? "Daily" : DAY_FULL[i - 2];

          return (
            <DaySection
              key={day}
              day={day}
              displayName={displayName}
              label={label}
              tasks={dayTasks}
              isAdding={addingTo === day}
              editingId={editingId}
              reorderMode={reorderMode}
              onLabelBlur={(val) => handleLabelBlur(day, val)}
              onAddStart={() => { setAddingTo(day); setEditingId(null); }}
              onAddCancel={() => setAddingTo(null)}
              onAdded={(task) => {
                setTasks((prev) => [...prev, task]);
                setAddingTo(null);
              }}
              onEditStart={(id) => { setEditingId(id); setAddingTo(null); }}
              onEditCancel={() => setEditingId(null)}
              onEdited={(updated) => {
                setTasks((prev) => prev.map((c) => c.id === updated.id ? updated : c));
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
  tasks: Task[];
  isAdding: boolean;
  editingId: string | null;
  reorderMode: boolean;
  onLabelBlur: (val: string) => void;
  onAddStart: () => void;
  onAddCancel: () => void;
  onAdded: (task: Task) => void;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onEdited: (task: Task) => void;
  onDelete: (id: string) => void;
  onReorder: (day: string, orderedIds: string[]) => void;
}

function DaySection({
  day, displayName, label, tasks, isAdding, editingId, reorderMode,
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
    const oldIdx = tasks.findIndex((c) => c.id === active.id);
    const newIdx = tasks.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(tasks, oldIdx, newIdx);
    onReorder(day, next.map((c) => c.id));
  }

  const renderedList = tasks.length > 0 && (
    <ul className={styles.taskList}>
      {tasks.map((task) =>
        editingId === task.id && !reorderMode ? (
          <li key={task.id} className={styles.taskRow}>
            <EditTaskForm
              task={task}
              onCancel={onEditCancel}
              onSaved={onEdited}
            />
          </li>
        ) : (
          <SortableTaskRow
            key={task.id}
            task={task}
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
            aria-label={`Add task to ${displayName}`}
          >
            + Add
          </button>
        )}
      </div>

      {/* Task list */}
      {tasks.length > 0 && (
        reorderMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {renderedList}
            </SortableContext>
          </DndContext>
        ) : (
          renderedList
        )
      )}

      {/* Add task inline form */}
      {isAdding && !reorderMode && (
        <AddTaskForm
          day={day}
          onCancel={onAddCancel}
          onAdded={onAdded}
        />
      )}

      {tasks.length === 0 && !isAdding && (
        <p className={styles.emptyDay}>No tasks yet for this day.</p>
      )}
    </div>
  );
}

/* ── Sortable Task Row ────────────────────────────────────── */
function SortableTaskRow({
  task, reorderMode, onEditStart, onDelete,
}: {
  task: Task;
  reorderMode: boolean;
  onEditStart: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !reorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`${styles.taskRow} ${isDragging ? styles.dragging : ""}`}
    >
      {reorderMode ? (
        <button
          type="button"
          className={styles.gripBtn}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${task.name}`}
          title="Drag to reorder"
        >⋮⋮</button>
      ) : (
        <span className={styles.taskIcon}>☐</span>
      )}
      <div className={styles.taskText}>
        <span className={styles.taskName}>{task.name}</span>
        {task.description && (
          <span className={styles.taskDesc}>{task.description}</span>
        )}
      </div>
      {!reorderMode && (
        <div className={styles.taskActions}>
          <button
            className={styles.iconBtn}
            onClick={() => onEditStart(task.id)}
            aria-label={`Edit ${task.name}`}
            title="Edit"
          >✏️</button>
          <button
            className={`${styles.iconBtn} ${styles.deleteBtn}`}
            onClick={() => onDelete(task.id)}
            aria-label={`Delete ${task.name}`}
            title="Delete"
          >🗑️</button>
        </div>
      )}
    </li>
  );
}

/* ── Add Task Form ────────────────────────────────────────── */
function AddTaskForm({ day, onCancel, onAdded }: {
  day: string;
  onCancel: () => void;
  onAdded: (task: Task) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("recurrence", day);
    setError(null);
    startTransition(async () => {
      const result = await addTask(fd);
      if (result.error) { setError(result.error); return; }
      // Build an optimistic task object to return
      const optimistic: Task = {
        id: crypto.randomUUID(),
        household_id: "",
        name: (fd.get("name") as string).trim(),
        description: (fd.get("description") as string | null)?.trim() || null,
        recurrence: day as Task["recurrence"],
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
        placeholder="Task name"
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

/* ── Edit Task Form ───────────────────────────────────────── */
function EditTaskForm({ task, onCancel, onSaved }: {
  task: Task;
  onCancel: () => void;
  onSaved: (updated: Task) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateTask(task.id, fd);
      if (result.error) { setError(result.error); return; }
      onSaved({
        ...task,
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
        defaultValue={task.name}
        required
        autoFocus
        autoComplete="off"
      />
      <input
        name="description"
        className={`form-input ${styles.inlineInput}`}
        defaultValue={task.description ?? ""}
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
