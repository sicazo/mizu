import {
  type CalEvent,
  type Course,
  matchToCourse,
  isExamEvent,
  sortByStart,
  formatTime,
  formatDate,
} from "../lib/events";

const MOCK_NOTES = [
  { id: "n14", title: "Eigenvalues · intuition",   lecture: 14,   date: "Wed 11 Mar" },
  { id: "n13", title: "Basis changes",              lecture: 13,   date: "Mon 9 Mar"  },
  { id: "n12", title: "Determinants — geometric",   lecture: 12,   date: "Fri 6 Mar"  },
  { id: "ps",  title: "Problem set 5 · scratch",   lecture: null, date: "Tue 10 Mar" },
  { id: "study", title: "Midterm review notes",    lecture: null, date: "1w ago"      },
];

interface Props {
  course: Course;
  courseId: string;
  events: CalEvent[];
  courses: Record<string, Course>;
  onOpenNotes: () => void;
}

export default function CourseOverview({ course, courseId, events, courses, onOpenNotes }: Props) {
  const now = new Date();

  const courseEvents = sortByStart(
    events.filter((ev) => matchToCourse(ev.summary, { [courseId]: course }) !== null)
  );

  const upcoming = courseEvents.filter(
    (ev) => ev.start && new Date(ev.start) > now && !isExamEvent(ev.summary)
  ).slice(0, 5);

  const upcomingExams = courseEvents.filter(
    (ev) => ev.start && new Date(ev.start) > now && isExamEvent(ev.summary)
  ).slice(0, 3);

  const locations = Array.from(
    new Set(courseEvents.map((ev) => ev.location).filter(Boolean))
  ) as string[];

  return (
    <section className="cov">
      <div className="cov-head">
        <div>
          <div className="cov-eyebrow">COURSE</div>
          <div className="cov-h1">
            <span className="cov-code" style={{ color: course.color }}>{course.code}</span>
          </div>
          {course.name !== course.code && (
            <div className="cov-name">{course.name}</div>
          )}
        </div>
        <div className="cov-dot-bg" style={{ background: course.color }} />
      </div>

      <div className="cov-grid">
        {/* ── Left column: schedule + exams ── */}
        <div className="cov-col">
          <div className="cov-section-head">Upcoming classes</div>
          {upcoming.length === 0 ? (
            <div className="cov-empty">No upcoming classes</div>
          ) : (
            <div className="cov-events">
              {upcoming.map((ev) => (
                <div key={ev.uid} className="cov-ev">
                  <div className="cov-ev-bar" style={{ background: course.color }} />
                  <div className="cov-ev-body">
                    <div className="cov-ev-title">{ev.summary}</div>
                    <div className="cov-ev-meta">
                      {ev.start && (
                        <span className="cov-ev-date">{formatDate(ev.start)}</span>
                      )}
                      {ev.start && ev.end && (
                        <>
                          <span className="cov-ev-sep">·</span>
                          <span className="cov-ev-time">{formatTime(ev.start)}–{formatTime(ev.end)}</span>
                        </>
                      )}
                      {ev.location && (
                        <>
                          <span className="cov-ev-sep">·</span>
                          <span className="cov-ev-loc">{ev.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {upcomingExams.length > 0 && (
            <>
              <div className="cov-section-head" style={{ marginTop: 28 }}>Exams</div>
              <div className="cov-events">
                {upcomingExams.map((ev) => (
                  <div key={ev.uid} className="cov-ev cov-ev-exam">
                    <div className="cov-ev-bar" style={{ background: "var(--accent-red)" }} />
                    <div className="cov-ev-body">
                      <div className="cov-ev-title">{ev.summary}</div>
                      <div className="cov-ev-meta">
                        {ev.start && (
                          <span className="cov-ev-date">{formatDate(ev.start)}</span>
                        )}
                        {ev.start && ev.end && (
                          <>
                            <span className="cov-ev-sep">·</span>
                            <span className="cov-ev-time">{formatTime(ev.start)}–{formatTime(ev.end)}</span>
                          </>
                        )}
                        {ev.location && (
                          <>
                            <span className="cov-ev-sep">·</span>
                            <span className="cov-ev-loc">{ev.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="cov-exam-badge">EXAM</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right column: info + notes ── */}
        <div className="cov-col">
          {/* Info card */}
          <div className="cov-section-head">Info</div>
          <div className="cov-info-card">
            <div className="cov-info-row">
              <span className="cov-info-label">Events total</span>
              <span className="cov-info-value">{courseEvents.length}</span>
            </div>
            {locations.length > 0 && (
              <div className="cov-info-row">
                <span className="cov-info-label">Location</span>
                <span className="cov-info-value">{locations[0]}{locations.length > 1 ? ` +${locations.length - 1}` : ""}</span>
              </div>
            )}
            <div className="cov-info-row">
              <span className="cov-info-label">Notes</span>
              <span className="cov-info-value">{MOCK_NOTES.length}</span>
            </div>
          </div>

          {/* Recent notes */}
          <div className="cov-section-head" style={{ marginTop: 28 }}>Recent notes</div>
          <div className="cov-notes">
            {MOCK_NOTES.slice(0, 4).map((n) => (
              <div key={n.id} className="cov-note-row" onClick={onOpenNotes}>
                <div className="cov-note-left">
                  {n.lecture != null ? (
                    <span className="cov-note-lect" style={{ background: `${course.color}1A`, color: course.color }}>
                      L{n.lecture}
                    </span>
                  ) : (
                    <span className="cov-note-lect cov-note-lect-plain">—</span>
                  )}
                </div>
                <span className="cov-note-title">{n.title}</span>
                <span className="cov-note-date">{n.date}</span>
              </div>
            ))}
          </div>
          <button className="cov-notes-btn" onClick={onOpenNotes}
            style={{ borderColor: `${course.color}40`, color: course.color }}>
            Open notes →
          </button>
        </div>
      </div>
    </section>
  );
}
