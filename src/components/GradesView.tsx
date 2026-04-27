import { useState, useCallback } from "react";

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
  max: number;
}

interface GradesViewProps {
  courses: Record<string, Course>;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function storageKey(courseId: string) {
  return `mizu-grades-${courseId}`;
}

function loadAssignments(courseId: string): Assignment[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(courseId)) || "[]");
  } catch {
    return [];
  }
}

function saveAssignments(courseId: string, assignments: Assignment[]) {
  localStorage.setItem(storageKey(courseId), JSON.stringify(assignments));
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ─── Grade math ───────────────────────────────────────────────────────────────

function pct(a: Assignment) {
  return a.earned == null ? null : (a.earned / a.max) * 100;
}

function weightedAverage(assignments: Assignment[]): number | null {
  const done = assignments.filter((a) => a.earned !== null);
  if (done.length === 0) return null;
  const totalWeight = done.reduce((s, a) => s + a.weight, 0);
  if (totalWeight === 0) return null;
  const sum = done.reduce((s, a) => s + (pct(a)! * a.weight), 0);
  return sum / totalWeight;
}

function letterGrade(pct: number): string {
  if (pct >= 93) return "A";
  if (pct >= 90) return "A−";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B−";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C−";
  if (pct >= 60) return "D";
  return "F";
}

// ─── Course selector panel ────────────────────────────────────────────────────

function CoursePicker({
  courses,
  selectedId,
  onSelect,
}: {
  courses: Record<string, Course>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const entries = Object.entries(courses);

  return (
    <div className="gv-picker">
      <div className="gv-picker-head">Courses</div>
      {entries.length === 0 && (
        <p className="gv-picker-empty">No courses yet — add them in Settings.</p>
      )}
      {entries.map(([id, c]) => {
        const assignments = loadAssignments(id);
        const avg = weightedAverage(assignments);
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
                {avg == null ? "No grades yet" : `${avg.toFixed(1)}% · ${letterGrade(avg)}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gradebook ────────────────────────────────────────────────────────────────

function Gradebook({ courseId, course }: { courseId: string; course: Course }) {
  const [assignments, setAssignments] = useState<Assignment[]>(() => loadAssignments(courseId));

  const update = useCallback((next: Assignment[]) => {
    setAssignments(next);
    saveAssignments(courseId, next);
  }, [courseId]);

  function updateField(id: string, field: keyof Assignment, raw: string) {
    update(assignments.map((a) => {
      if (a.id !== id) return a;
      if (field === "name") return { ...a, name: raw };
      if (field === "weight") return { ...a, weight: Math.max(0, Number(raw) || 0) };
      if (field === "max")    return { ...a, max: Math.max(1, Number(raw) || 100) };
      if (field === "earned") {
        const v = raw.trim();
        return { ...a, earned: v === "" ? null : Math.max(0, Number(v) || 0) };
      }
      return a;
    }));
  }

  function addRow() {
    update([...assignments, { id: uid(), name: "", weight: 10, earned: null, max: 100 }]);
  }

  function removeRow(id: string) {
    update(assignments.filter((a) => a.id !== id));
  }

  const avg = weightedAverage(assignments);
  const totalWeight = assignments.reduce((s, a) => s + a.weight, 0);
  const weightOk = totalWeight === 0 || Math.abs(totalWeight - 100) < 0.1;

  return (
    <div className="gv-book">
      {/* Header */}
      <div className="gv-head">
        <div>
          <div className="gv-eyebrow">
            <span className="gv-dot" style={{ background: course.color }} />
            {course.name}
          </div>
          {avg != null && (
            <div className="gv-stat-row">
              <div className="gv-stat">
                <div className="gv-stat-num">
                  {avg.toFixed(1)}<span className="gv-stat-pct">%</span>
                </div>
                <div className="gv-stat-lbl">current grade</div>
              </div>
              <div className="gv-stat">
                <div className="gv-stat-num">{letterGrade(avg)}</div>
                <div className="gv-stat-lbl">letter</div>
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
                    value={a.max}
                    onChange={(e) => updateField(a.id, "max", e.target.value)}
                  />
                  <span className="gv-pct">
                    {p == null
                      ? <span className="gv-pct-empty">—</span>
                      : `${p.toFixed(1)}%`}
                  </span>
                  <button className="gv-remove-btn" onClick={() => removeRow(a.id)} title="Remove">×</button>
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

export default function GradesView({ courses }: GradesViewProps) {
  const ids = Object.keys(courses);
  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const course = selectedId ? courses[selectedId] : null;

  return (
    <div className="gv-shell">
      <CoursePicker courses={courses} selectedId={selectedId} onSelect={setSelectedId} />
      {course && selectedId ? (
        <Gradebook key={selectedId} courseId={selectedId} course={course} />
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
