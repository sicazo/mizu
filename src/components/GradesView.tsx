import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type GradeThresholds } from "../App";
import { type CalEvent, isExamEvent, matchToCourse, courseNameFromSummary } from "../lib/events";

interface Course {
  code: string;
  name: string;
  color: string;
}

interface Assignment {
  id: string;
  name: string;
  weight: number;
  earned: number | null;
  max_score: number;
}

interface DBAssignment {
  id: string;
  course_id: string;
  name: string;
  weight: number;
  earned: number | null;
  max_score: number;
  sort_order: number;
}

interface GradesViewProps {
  courses: Record<string, Course>;
  thresholds: GradeThresholds;
  events: CalEvent[];
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function loadAssignments(courseId: string): Promise<Assignment[]> {
  try {
    const rows = await invoke<DBAssignment[]>("grades_load", { courseId });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      weight: r.weight,
      earned: r.earned ?? null,
      max_score: r.max_score,
    }));
  } catch {
    return [];
  }
}

async function saveAssignments(courseId: string, assignments: Assignment[]) {
  await invoke("grades_save", { courseId, assignments });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Grade math ───────────────────────────────────────────────────────────────

function pct(a: Assignment) {
  return a.earned == null ? null : (a.earned / a.max_score) * 100;
}

function weightedAverage(assignments: Assignment[]): number | null {
  const done = assignments.filter((a) => a.earned !== null);
  if (done.length === 0) return null;
  const totalWeight = done.reduce((s, a) => s + a.weight, 0);
  if (totalWeight === 0) return null;
  const sum = done.reduce((s, a) => s + (pct(a)! * a.weight), 0);
  return sum / totalWeight;
}

// European grade scale (German 1–6, 1 = best)
function europeanGrade(pct: number, thresholds: GradeThresholds): string {
  if (pct >= thresholds[1]) return "1";
  if (pct >= thresholds[2]) return "2";
  if (pct >= thresholds[3]) return "3";
  if (pct >= thresholds[4]) return "4";
  if (pct >= thresholds[5]) return "5";
  return "6";
}

const GRADE_LABELS: Record<string, string> = {
  "1": "sehr gut",
  "2": "gut",
  "3": "befriedigend",
  "4": "ausreichend",
  "5": "mangelhaft",
  "6": "ungenügend",
};

function gradeLabel(grade: string): string {
  return GRADE_LABELS[grade] ?? "";
}

// ─── Course selector panel ────────────────────────────────────────────────────

function CoursePicker({
  courses,
  selectedId,
  onSelect,
  averages,
  thresholds,
}: {
  courses: Record<string, Course>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  averages: Record<string, number | null>;
  thresholds: GradeThresholds;
}) {
  const entries = Object.entries(courses);

  return (
    <div className="gv-picker">
      <div className="gv-picker-head">Courses</div>
      {entries.length === 0 && (
        <p className="gv-picker-empty">No courses yet — add them in Settings.</p>
      )}
      {entries.map(([id, c]) => {
        const avg = averages[id] ?? null;
        const active = id === selectedId;
        return (
          <div
            key={id}
            className={`gv-picker-row${active ? " gv-picker-row-active" : ""}`}
            style={active ? { background: `${c.color}14`, borderLeft: `2px solid ${c.color}` } : undefined}
            onClick={() => onSelect(id)}
          >
            <span className="gv-picker-dot" style={{ background: c.color }} />
            <div className="gv-picker-info">
              <span className="gv-picker-name">{c.name}</span>
              <span className="gv-picker-avg">
                {avg == null
                  ? "No grades yet"
                  : `${avg.toFixed(1)}% · Note ${europeanGrade(avg, thresholds)}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gradebook ────────────────────────────────────────────────────────────────

function Gradebook({
  courseId,
  course,
  onAvgChange,
  thresholds,
}: {
  courseId: string;
  course: Course;
  onAvgChange: (avg: number | null) => void;
  thresholds: GradeThresholds;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAssignments(courseId).then((rows) => {
      setAssignments(rows);
      setLoaded(true);
    });
  }, [courseId]);

  const update = useCallback(
    (next: Assignment[]) => {
      setAssignments(next);
      saveAssignments(courseId, next).catch(console.error);
      onAvgChange(weightedAverage(next));
    },
    [courseId, onAvgChange]
  );

  useEffect(() => {
    if (loaded) onAvgChange(weightedAverage(assignments));
  }, [loaded]);

  function updateField(id: string, field: keyof Assignment, raw: string) {
    update(
      assignments.map((a) => {
        if (a.id !== id) return a;
        if (field === "name") return { ...a, name: raw };
        if (field === "weight") return { ...a, weight: Math.max(0, Number(raw) || 0) };
        if (field === "max_score") return { ...a, max_score: Math.max(1, Number(raw) || 100) };
        if (field === "earned") {
          const v = raw.trim();
          return { ...a, earned: v === "" ? null : Math.max(0, Number(v) || 0) };
        }
        return a;
      })
    );
  }

  function addRow() {
    update([...assignments, { id: uid(), name: "", weight: 10, earned: null, max_score: 100 }]);
  }

  function removeRow(id: string) {
    update(assignments.filter((a) => a.id !== id));
  }

  const avg = weightedAverage(assignments);
  const totalWeight = assignments.reduce((s, a) => s + a.weight, 0);
  const weightOk = totalWeight === 0 || Math.abs(totalWeight - 100) < 0.1;
  const grade = avg != null ? europeanGrade(avg, thresholds) : null;

  return (
    <div className="gv-book">
      {/* Header */}
      <div className="gv-head">
        <div>
          <div className="gv-eyebrow">
            <span className="gv-dot" style={{ background: course.color }} />
            {course.name}
          </div>
          {avg != null && grade != null && (
            <div className="gv-stat-row">
              <div className="gv-stat">
                <div className="gv-stat-num">
                  {avg.toFixed(1)}<span className="gv-stat-pct">%</span>
                </div>
                <div className="gv-stat-lbl">current score</div>
              </div>
              <div className="gv-stat">
                <div className="gv-stat-num">{grade}</div>
                <div className="gv-stat-lbl">{gradeLabel(grade)}</div>
              </div>
            </div>
          )}
          {avg == null && assignments.length === 0 && (
            <p className="gv-empty-hint">Add your assignments below and enter scores as grades come in.</p>
          )}
        </div>
        {!weightOk && totalWeight > 0 && (
          <div className="gv-weight-warn">
            Weights sum to {totalWeight}% — should be 100%
          </div>
        )}
      </div>

      {/* Table */}
      <div className="gv-scroll">
        {assignments.length > 0 && (
          <div className="gv-table">
            <div className="gv-row gv-row-head">
              <span>Assignment</span>
              <span>Weight %</span>
              <span>Earned</span>
              <span>Out of</span>
              <span>%</span>
              <span />
            </div>
            {assignments.map((a) => {
              const p = pct(a);
              return (
                <div key={a.id} className={`gv-row${a.earned !== null ? " gv-row-done" : ""}`}>
                  <input
                    className="gv-input gv-input-name"
                    value={a.name}
                    onChange={(e) => updateField(a.id, "name", e.target.value)}
                    placeholder="Assignment name"
                  />
                  <input
                    className="gv-input gv-input-num"
                    type="number"
                    min={0}
                    value={a.weight}
                    onChange={(e) => updateField(a.id, "weight", e.target.value)}
                  />
                  <input
                    className="gv-input gv-input-num"
                    type="number"
                    min={0}
                    value={a.earned ?? ""}
                    onChange={(e) => updateField(a.id, "earned", e.target.value)}
                    placeholder="—"
                  />
                  <input
                    className="gv-input gv-input-num"
                    type="number"
                    min={1}
                    value={a.max_score}
                    onChange={(e) => updateField(a.id, "max_score", e.target.value)}
                  />
                  <span className="gv-pct">
                    {p == null ? (
                      <span className="gv-pct-empty">—</span>
                    ) : (
                      `${p.toFixed(1)}%`
                    )}
                  </span>
                  <button className="gv-remove-btn" onClick={() => removeRow(a.id)} title="Remove">
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button className="gv-add-btn" onClick={addRow}>
          + Add assignment
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function GradesView({ courses, thresholds, events }: GradesViewProps) {
  const ids = Object.keys(courses);
  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [averages, setAverages] = useState<Record<string, number | null>>({});
  const [seedVersion, setSeedVersion] = useState(0);
  const course = selectedId ? courses[selectedId] : null;

  function handleAvgChange(avg: number | null) {
    if (!selectedId) return;
    setAverages((prev) => ({ ...prev, [selectedId]: avg }));
  }

  // Seed exam events into grade_assignments for all courses whenever events load.
  useEffect(() => {
    if (events.length === 0) return;
    const promises: Promise<void>[] = [];
    for (const [courseId, c] of Object.entries(courses)) {
      const examEvs = events.filter(
        (ev) => isExamEvent(ev.summary) && matchToCourse(ev.summary, { [courseId]: c }) !== null
      );
      if (examEvs.length === 0) continue;
      promises.push(
        loadAssignments(courseId).then((rows) => {
          const existingIds = new Set(rows.map((r) => r.id));
          const fresh = examEvs.filter((ev) => !existingIds.has(`exam-${ev.uid}`));
          if (fresh.length === 0) return;
          const merged = [
            ...rows,
            ...fresh.map((ev) => ({
              id: `exam-${ev.uid}`,
              name: courseNameFromSummary(ev.summary),
              weight: 100,
              earned: null,
              max_score: 100,
            })),
          ];
          return saveAssignments(courseId, merged);
        })
      );
    }
    if (promises.length > 0) {
      Promise.all(promises).then(() => setSeedVersion((v) => v + 1)).catch(console.error);
    }
  }, [events]);

  return (
    <div className="gv-shell">
      <CoursePicker
        courses={courses}
        selectedId={selectedId}
        onSelect={setSelectedId}
        averages={averages}
        thresholds={thresholds}
      />
      {course && selectedId ? (
        <Gradebook
          key={`${selectedId}-${seedVersion}`}
          courseId={selectedId}
          course={course}
          onAvgChange={handleAvgChange}
          thresholds={thresholds}
        />
      ) : (
        <div className="empty-pane">
          <div className="empty-mark">水</div>
          <div className="empty-title">
            {ids.length === 0 ? "No courses yet — complete setup first" : "Select a course to view grades"}
          </div>
        </div>
      )}
    </div>
  );
}
