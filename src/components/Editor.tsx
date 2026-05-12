import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import MizuBlockNoteEditor from "./editor/MizuBlockNoteEditor";
import { type ApiNoteDocument } from "../lib/notesApi";
import type { CalEvent, Course } from "../lib/events";
import { matchToCourse, sortByStart } from "../lib/events";

// ── Property panel helpers ────────────────────────────────────────────────────

// Derive lecture list from calendar events for the course
interface LectureOption {
  num: number;
  date: string; // YYYY-MM-DD
  location: string | null;
  label: string;
}

function deriveLectures(events: CalEvent[], courseId: string, courses: Record<string, Course>): LectureOption[] {
  const courseMap = { [courseId]: courses[courseId] };
  const courseEvents = sortByStart(
    events.filter(ev => ev.start && matchToCourse(ev.summary, courseMap) !== null)
  );
  return courseEvents.map((ev, i) => {
    const date = ev.start ? ev.start.slice(0, 10) : "";
    const fmt = date ? new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    return {
      num: i + 1,
      date,
      location: ev.location,
      label: `Lecture ${i + 1}${fmt ? " · " + fmt : ""}`,
    };
  });
}

// ── Inline editable text cell ─────────────────────────────────────────────────

function EditableText({ value, placeholder, onChange, monospace }: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  monospace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="prop-value-input"
        style={monospace ? { fontFamily: "var(--font-mono)" } : undefined}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
      />
    );
  }

  return (
    <button
      className="prop-value-btn"
      style={monospace ? { fontFamily: "var(--font-mono)" } : undefined}
      onClick={() => setEditing(true)}
    >
      <span className={value ? undefined : "prop-value-empty"}>{value || placeholder || "—"}</span>
    </button>
  );
}

// ── Lecture dropdown cell ─────────────────────────────────────────────────────

function LectureSelect({ value, lectures, onChange }: {
  value: number | null;
  lectures: LectureOption[];
  onChange: (opt: LectureOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const current = lectures.find(l => l.num === value);

  return (
    <div ref={ref} className="prop-select-wrap">
      <button
        className="prop-value-btn"
        onClick={() => setOpen(v => !v)}
      >
        <span className={current ? undefined : "prop-value-empty"}>
          {current ? `Lecture ${current.num}` : "—"}
        </span>
        <span className="prop-select-chevron">›</span>
      </button>
      {open && (
        <div className="prop-dropdown">
          <button
            className="prop-dropdown-item"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <span className="prop-value-empty">None</span>
          </button>
          {lectures.map(l => (
            <button
              key={l.num}
              className={`prop-dropdown-item${l.num === value ? " prop-dropdown-item-active" : ""}`}
              onClick={() => { onChange(l); setOpen(false); }}
            >
              <span className="prop-dropdown-label">Lecture {l.num}</span>
              {l.date && (
                <span className="prop-dropdown-meta">
                  {new Date(l.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date cell with popover picker ─────────────────────────────────────────────

function DateCell({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(value ?? "");
        setInvalid(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, value]);

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) { onChange(null); setOpen(false); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) { setInvalid(true); return; }
    onChange(trimmed);
    setOpen(false);
    setInvalid(false);
  }

  const formatted = value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div ref={ref} className="prop-select-wrap">
      <button className="prop-value-btn" onClick={() => setOpen(v => !v)}>
        <span className={formatted ? undefined : "prop-value-empty"}>{formatted ?? "—"}</span>
      </button>
      {open && (
        <div className="prop-date-popover">
          <input
            ref={inputRef}
            className={`prop-date-input${invalid ? " prop-date-input-invalid" : ""}`}
            type="date"
            value={draft}
            onChange={e => { setDraft(e.target.value); setInvalid(false); }}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setOpen(false); setDraft(value ?? ""); setInvalid(false); }
            }}
          />
          <div className="prop-date-actions">
            {value && (
              <button className="prop-date-clear" onClick={() => { onChange(null); setOpen(false); }}>
                Clear
              </button>
            )}
            <button className="prop-date-apply" onClick={commit}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Property row ──────────────────────────────────────────────────────────────

function PropRow({ icon, label, children }: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="prop-row">
      <span className="prop-label">
        <span className="prop-icon">{icon}</span>
        <span className="prop-label-text">{label}</span>
      </span>
      <span className="prop-value">{children}</span>
    </div>
  );
}

// ── Delete row ────────────────────────────────────────────────────────────────

function DeleteRow({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="prop-delete-confirm">
        <span className="prop-delete-label">Delete this note?</span>
        <div className="prop-delete-btns">
          <button className="prop-delete-yes" onClick={onDelete}>Delete</button>
          <button className="prop-delete-no" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <button className="prop-row prop-row-delete" onClick={() => setConfirming(true)}>
      <span className="prop-label">
        <span className="prop-icon">⌫</span>
        <span className="prop-label-text">Delete note</span>
      </span>
    </button>
  );
}

// ── Properties panel ──────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  note: ApiNoteDocument;
  courseCode: string;
  courseColor: string;
  courseId: string;
  courses: Record<string, Course>;
  events: CalEvent[];
  onUpdate: (patch: Partial<{ title: string; lectureNum: number | null; lectureDate: string | null; location: string | null; pinned: boolean }>) => void;
  onDelete: () => void;
}

function PropertiesPanel({ note, courseCode, courseColor, courseId, courses, events, onUpdate, onDelete }: PropertiesPanelProps) {
  const lectures = useMemo(
    () => deriveLectures(events, courseId, courses),
    [events, courseId, courses]
  );

  const handleLectureChange = useCallback((opt: LectureOption | null) => {
    if (!opt) {
      onUpdate({ lectureNum: null });
    } else {
      onUpdate({
        lectureNum: opt.num,
        lectureDate: opt.date || null,
        location: opt.location ?? note.location,
      });
    }
  }, [onUpdate, note.location]);

  return (
    <aside className="prop-panel">
      <div className="prop-panel-heading">Properties</div>

      <div className="prop-grid">
        <PropRow icon="◎" label="Course">
          <span className="prop-course-badge" style={{ color: courseColor, borderColor: `${courseColor}40`, background: `${courseColor}0F` }}>
            {courseCode}
          </span>
        </PropRow>

        <PropRow icon="T" label="Title">
          <EditableText
            value={note.title}
            placeholder="Untitled note"
            onChange={v => onUpdate({ title: v })}
          />
        </PropRow>

        <PropRow icon="#" label="Lecture">
          <LectureSelect
            value={note.lectureNum}
            lectures={lectures}
            onChange={handleLectureChange}
          />
        </PropRow>

        <PropRow icon="◷" label="Date">
          <DateCell
            value={note.lectureDate}
            onChange={v => onUpdate({ lectureDate: v })}
          />
        </PropRow>

        <PropRow icon="⌖" label="Location">
          <EditableText
            value={note.location ?? ""}
            placeholder="—"
            onChange={v => onUpdate({ location: v || null })}
          />
        </PropRow>

        <PropRow icon="✦" label="Pinned">
          <button className="prop-value-btn" onClick={() => onUpdate({ pinned: !note.pinned })}>
            <span>{note.pinned ? "Pinned" : "Not pinned"}</span>
          </button>
        </PropRow>

        <PropRow icon="✎" label="Modified">
          <span className="prop-value-muted">
            {new Date(note.lectureDate ?? Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </PropRow>
      </div>

      <div className="prop-divider" />

      <div className="prop-grid">
        <DeleteRow onDelete={onDelete} />
      </div>
    </aside>
  );
}

// ── Main Editor component ─────────────────────────────────────────────────────

interface EditorProps {
  noteId: string | null;
  noteContent: string;
  activeNote: ApiNoteDocument | null;
  courseCode: string;
  courseColor: string;
  courseId: string;
  courses: Record<string, Course>;
  events: CalEvent[];
  lectureNum: number | null;
  lectureDate: string | null;
  onChange: (markdown: string, title?: string) => void;
  onUpdateMeta: (patch: Partial<{ title: string; lectureNum: number | null; lectureDate: string | null; location: string | null; pinned: boolean }>) => void;
  onDelete: () => void;
  showPanel: boolean;
  onTogglePanel: () => void;
}

export default function Editor({
  noteId,
  noteContent,
  activeNote,
  courseCode,
  courseColor,
  courseId,
  courses,
  events,
  lectureNum,
  lectureDate,
  onChange,
  onUpdateMeta,
  onDelete,
  showPanel,
  onTogglePanel: _onTogglePanel,
}: EditorProps) {
  if (!noteId || !activeNote) {
    return (
      <section className="ed">
        <div className="ed-empty">
          <div className="ed-empty-mark">水</div>
          <div className="ed-empty-label">Select a note or create one</div>
        </div>
      </section>
    );
  }

  return (
    <section className="ed" style={{ flexDirection: "row" }}>
      <div className="ed-main">
        <div className="ed-scroll">
          <div className="ed-meta-row">
            <span className="ed-course-tag" style={{ background: `${courseColor}1A`, color: courseColor }}>
              ● {courseCode}
            </span>
            <button className="ed-pin-btn" onClick={() => onUpdateMeta({ pinned: !activeNote.pinned })} title={activeNote.pinned ? "Unpin note" : "Pin note"}>
              {activeNote.pinned ? "★" : "☆"}
            </button>
            {lectureNum != null && <span className="ed-meta">Lecture {lectureNum}</span>}
            {lectureDate && (
              <span className="ed-meta">
                {new Date(lectureDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          <MizuBlockNoteEditor
            key={noteId}
            noteId={noteId}
            courseId={courseId}
            initialContent={noteContent}
            onChange={onChange}
          />
        </div>
      </div>

      {showPanel && (
        <PropertiesPanel
          note={activeNote}
          courseCode={courseCode}
          courseColor={courseColor}
          courseId={courseId}
          courses={courses}
          events={events}
          onUpdate={onUpdateMeta}
          onDelete={onDelete}
        />
      )}
    </section>
  );
}
