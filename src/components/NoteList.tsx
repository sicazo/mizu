import type { ApiNoteSummary } from "../lib/notesApi";

interface NoteListProps {
  notes: ApiNoteSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNote?: () => void;
  onTogglePin?: (note: ApiNoteSummary) => void;
  courseColor: string;
  courseCode: string;
  courseName: string;
  onBack?: () => void;
  showCourseTag?: boolean;
}

interface NoteRowProps {
  note: ApiNoteSummary;
  active: boolean;
  onClick: () => void;
  onTogglePin?: () => void;
  color: string;
  showCourseTag?: boolean;
}

function NoteRow({ note, active, onClick, onTogglePin, color, showCourseTag }: NoteRowProps) {
  return (
    <div
      className="nl-row"
      onClick={onClick}
      style={active ? { background: `${color}14`, borderColor: `${color}30` } : undefined}
    >
      <div className="nl-row-top">
        <span className="nl-title">{note.title || "Untitled note"}</span>
        {onTogglePin && (
          <button
            className="nl-pin-btn"
            title={note.pinned ? "Unpin note" : "Pin note"}
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          >
            {note.pinned ? "★" : "☆"}
          </button>
        )}
        <span className="nl-date">
          {note.lectureDate
            ? new Date(note.lectureDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : note.modifiedAt
              ? new Date(note.modifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : ""}
        </span>
      </div>
      <div className="nl-preview">{note.preview || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Empty note</span>}</div>
      <div className="nl-tags">
        {showCourseTag && (
          <span className="nl-tag" style={{ background: "#6B728014", color: "#6B7280" }}>{note.courseId}</span>
        )}
        {note.lectureNum != null && (
          <span className="nl-tag" style={{ background: `${color}1A`, color }}>L{note.lectureNum}</span>
        )}
      </div>
    </div>
  );
}

export default function NoteList({ notes, activeId, onSelect, onCreateNote, onTogglePin, courseColor, courseCode, courseName, onBack, showCourseTag }: NoteListProps) {
  return (
    <section className="nl">
      <div className="nl-header">
        <div className="nl-title-row">
          {onBack && (
            <button className="nl-icon-btn" onClick={onBack} title="Back to overview" style={{ marginRight: 2 }}>←</button>
          )}
          <span className="nl-dot" style={{ background: courseColor }} />
          <div>
            <div className="nl-h" style={{ color: courseColor }}>{courseCode}</div>
            <div className="nl-sub">{courseName}</div>
          </div>
          <span className="nl-count">{notes.length}</span>
        </div>
        <div className="nl-search-row">
          <span className="nl-search-icon">⌕</span>
          <input className="nl-search" placeholder="Search lectures…" />
        </div>
        <div className="nl-sort-row">
          <span>Recent ↓</span>
          {onCreateNote && (
            <button className="nl-icon-btn" title="New note" onClick={onCreateNote}>+</button>
          )}
        </div>
      </div>
      <div className="nl-rows">
        {notes.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No notes yet. Click + to create one.
          </div>
        ) : (
          notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              active={n.id === activeId}
              onClick={() => onSelect(n.id)}
              onTogglePin={onTogglePin ? () => onTogglePin(n) : undefined}
              color={courseColor}
              showCourseTag={showCourseTag}
            />
          ))
        )}
      </div>
    </section>
  );
}
