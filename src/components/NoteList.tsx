const COURSE_NOTES = [
  { id: "n14", title: "Eigenvalues · intuition",  lecture: 14,   date: "Wed 11 Mar", preview: "An eigenvector is a vector that doesn't change direction when a transformation is applied — only its length changes by a scalar λ.", tags: ["lecture"] },
  { id: "n13", title: "Basis changes",             lecture: 13,   date: "Mon 9 Mar",  preview: "Switching coordinate systems via change-of-basis matrices. Inverse of the basis matrix recovers the original.", tags: ["lecture"] },
  { id: "n12", title: "Determinants — geometric",  lecture: 12,   date: "Fri 6 Mar",  preview: "The determinant as the signed scaling factor of n-dimensional volume under the transformation.", tags: ["lecture"] },
  { id: "n11", title: "Cofactor expansion",        lecture: 11,   date: "Wed 4 Mar",  preview: "Recursive method for computing determinants by expanding along a row or column.", tags: ["lecture"] },
  { id: "ps",  title: "Problem set 5 · scratch",  lecture: null, date: "Tue 10 Mar", preview: "Working through Q3 — the diagonalizable matrix needs eigenvectors that span the space.", tags: ["scratch"] },
  { id: "study", title: "Midterm review notes",   lecture: null, date: "1w ago",      preview: "Compiled from lectures 1–10. Strong on row reduction, weaker on inner products.", tags: ["study"] },
];

interface NoteListProps {
  activeId: string;
  onSelect: (id: string) => void;
  courseColor: string;
  courseCode: string;
  courseName: string;
}

interface NoteRowProps {
  note: typeof COURSE_NOTES[0];
  active: boolean;
  onClick: () => void;
  color: string;
}

function NoteRow({ note, active, onClick, color }: NoteRowProps) {
  return (
    <div
      className="nl-row"
      onClick={onClick}
      style={active ? { background: `${color}14`, borderColor: `${color}30` } : undefined}
    >
      <div className="nl-row-top">
        <span className="nl-title">{note.title}</span>
        <span className="nl-date">{note.date}</span>
      </div>
      <div className="nl-preview">{note.preview}</div>
      <div className="nl-tags">
        {note.lecture != null && (
          <span className="nl-tag" style={{ background: `${color}1A`, color }}>L{note.lecture}</span>
        )}
        {note.tags.map((t) => (
          <span key={t} className="nl-tag nl-tag-plain">{t}</span>
        ))}
      </div>
    </div>
  );
}

export default function NoteList({ activeId, onSelect, courseColor, courseCode, courseName }: NoteListProps) {
  return (
    <section className="nl">
      <div className="nl-header">
        <div className="nl-title-row">
          <span className="nl-dot" style={{ background: courseColor }} />
          <div>
            <div className="nl-h" style={{ color: courseColor }}>{courseCode}</div>
            <div className="nl-sub">{courseName}</div>
          </div>
          <span className="nl-count">{COURSE_NOTES.length}</span>
        </div>
        <div className="nl-search-row">
          <span className="nl-search-icon">⌕</span>
          <input className="nl-search" placeholder="Search lectures…" />
        </div>
        <div className="nl-sort-row">
          <span>Lecture ↓</span>
          <button className="nl-icon-btn" title="Filter">▾</button>
        </div>
      </div>
      <div className="nl-rows">
        {COURSE_NOTES.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            active={n.id === activeId}
            onClick={() => onSelect(n.id)}
            color={courseColor}
          />
        ))}
      </div>
    </section>
  );
}
