import {
  type CalEvent,
  type Course,
  isEventToday,
  isEventThisWeek,
  isEventUpcoming,
  isHappeningNow,
  isExamEvent,
  formatTime,
  matchToCourse,
  sortByStart,
  groupByDay,
  formatDayHeading,
} from "../lib/events";
import type { ApiNoteSummary } from "../lib/notesApi";

interface Props {
  events: CalEvent[];
  courses: Record<string, Course>;
  allNotes: ApiNoteSummary[];
  courseSuggestions: Array<{ code: string; name: string }>;
  onAddCourse: (code: string, name: string) => void;
  onDismissCourseSuggestion: (code: string) => void;
  dismissedCourseCode: string | null;
  onUndoDismissCourseSuggestion: () => void;
  gradeAverages: Record<string, number | null>;
  thresholds: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

type Status = "done" | "now" | "next" | "later";

interface TodayEvent {
  ev: CalEvent;
  status: Status;
  color: string;
  code: string;
}

const DEFAULT_COLOR = "#64748b";

function buildTodayEvents(events: CalEvent[], courses: Record<string, Course>): TodayEvent[] {
  const todayEvents = sortByStart(events.filter(isEventToday));
  const now = new Date();
  let nextFound = false;

  return todayEvents.map((ev) => {
    const match = matchToCourse(ev.summary, courses);
    const color = match?.course.color ?? DEFAULT_COLOR;
    const code = match?.course.code ?? ev.summary.slice(0, 20);

    let status: Status;
    if (isHappeningNow(ev)) {
      status = "now";
    } else if (ev.end && new Date(ev.end) < now) {
      status = "done";
    } else if (!nextFound) {
      nextFound = true;
      status = "next";
    } else {
      status = "later";
    }

    return { ev, status, color, code };
  });
}

function buildWeekAhead(events: CalEvent[], courses: Record<string, Course>) {
  const now = new Date();
  const upcoming = events.filter((ev) => {
    if (!ev.start) return false;
    const start = new Date(ev.start);
    return start > now && isEventThisWeek(ev) && !isEventToday(ev);
  });

  const grouped = groupByDay(sortByStart(upcoming));
  return Array.from(grouped.entries()).map(([key, dayEvents]) => ({
    key,
    label: formatDayHeading(dayEvents[0].start!),
    events: dayEvents.map((ev) => ({
      ev,
      color: matchToCourse(ev.summary, courses)?.course.color ?? DEFAULT_COLOR,
    })),
  }));
}

function daysUntil(iso: string): number {
  const now = new Date();
  const d = new Date(iso);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function noteFromPct(pct: number, t: Props["thresholds"]): string {
  if (pct >= t[1]) return "1";
  if (pct >= t[2]) return "2";
  if (pct >= t[3]) return "3";
  if (pct >= t[4]) return "4";
  if (pct >= t[5]) return "5";
  return "6";
}

export default function TodayView({ events, courses, allNotes, courseSuggestions, onAddCourse, onDismissCourseSuggestion, dismissedCourseCode, onUndoDismissCourseSuggestion, gradeAverages, thresholds }: Props) {
  const today = new Date();
  const dayLabel = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const todayItems = buildTodayEvents(events, courses);
  const weekAhead = buildWeekAhead(events, courses);
  const courseList = Object.entries(courses);

  const upcoming = sortByStart(events.filter(isEventUpcoming));
  const nextEvent = upcoming[0] ?? null;
  const thisWeekCount = events.filter(isEventThisWeek).length;
  const examsSoon = upcoming.filter((ev) => ev.start && isExamEvent(ev.summary)).slice(0, 5);
  const todayDone = todayItems.filter((t) => t.status === "done").length;

  const gradedCourses = Object.values(gradeAverages).filter((v) => v != null) as number[];
  const avgGradePct = gradedCourses.length > 0
    ? gradedCourses.reduce((s, v) => s + v, 0) / gradedCourses.length
    : null;
  const atRiskCourses = courseList.filter(([id]) => {
    const g = gradeAverages[id];
    return g != null && g < thresholds[4];
  }).length;

  const courseStats = courseList
    .map(([id, course]) => {
      const matched = events.filter((ev) => matchToCourse(ev.summary, { [id]: course }) !== null);
      const next = sortByStart(
        matched.filter((ev) => ev.start && new Date(ev.start) > new Date()),
      )[0];
      const notes = allNotes.filter((n) => n.courseId === id).length;
      const avg = gradeAverages[id] ?? null;
      return { id, course, totalEvents: matched.length, notes, next, avg };
    })
    .sort((a, b) => {
      const at = a.next?.start ? new Date(a.next.start).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.next?.start ? new Date(b.next.start).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    })
    .slice(0, 8);

  return (
    <section className="today">
      <div className="today-head">
        <div>
          <div className="today-eyebrow">DASHBOARD</div>
          <div className="today-h1">{dayLabel}</div>
        </div>
      </div>

      <div className="tdb-kpis">
        <div className="tdb-kpi"><span>Today events</span><strong>{todayItems.length}</strong></div>
        <div className="tdb-kpi"><span>This week</span><strong>{thisWeekCount}</strong></div>
        <div className="tdb-kpi"><span>Courses</span><strong>{courseList.length}</strong></div>
        <div className="tdb-kpi"><span>Done today</span><strong>{todayDone}</strong></div>
        <div className="tdb-kpi"><span>Avg grade</span><strong>{avgGradePct == null ? "—" : `${avgGradePct.toFixed(1)}%`}</strong></div>
        <div className="tdb-kpi"><span>At-risk courses</span><strong>{atRiskCourses}</strong></div>
        <div className="tdb-kpi"><span>Upcoming exams</span><strong>{examsSoon.length}</strong></div>
        <div className="tdb-kpi"><span>New course proposals</span><strong>{courseSuggestions.length}</strong></div>
      </div>

      {dismissedCourseCode && (
        <div className="tdb-undo-banner">
          <span>Dismissed {dismissedCourseCode}</span>
          <button className="tov-btn" onClick={onUndoDismissCourseSuggestion}>Undo</button>
        </div>
      )}

      <div className="today-grid">
        <div className="today-col">
          <div className="today-col-head">Next up</div>
          {nextEvent?.start ? (
            <div className="tcl">
              <div className="tcl-time">
                <span className="tcl-start">{formatTime(nextEvent.start)}</span>
                <span className="tcl-end">in {daysUntil(nextEvent.start) === 0 ? "<1 day" : `${daysUntil(nextEvent.start)}d`}</span>
              </div>
              <div className="tcl-rail" style={{ background: matchToCourse(nextEvent.summary, courses)?.course.color ?? DEFAULT_COLOR }} />
              <div className="tcl-body">
                <div className="tcl-title">{nextEvent.summary}</div>
                {nextEvent.location && <div className="tcl-room">{nextEvent.location}</div>}
              </div>
            </div>
          ) : <div className="today-empty">No upcoming events</div>}

          <div className="today-col-head" style={{ marginTop: 18 }}>Today schedule</div>
          {todayItems.length === 0 ? (
            <div className="today-empty">No events today</div>
          ) : (
            <div className="today-schedule">
              {todayItems.map(({ ev, status, color, code }) => (
                <div
                  key={ev.uid}
                  className={`tcl${status === "now" ? " tcl-now-card" : ""}${status === "done" ? " tcl-done-card" : ""}`}
                  style={{
                    "--c": color,
                    ...(status === "now" ? { borderColor: color, background: `color-mix(in oklab, ${color} 6%, transparent)` } : {}),
                  } as React.CSSProperties}
                >
                  <div className="tcl-time">
                    <span className="tcl-start">{ev.start ? formatTime(ev.start) : "—"}</span>
                    <span className="tcl-end">{ev.end ? formatTime(ev.end) : ""}</span>
                  </div>
                  <div className="tcl-rail" style={{ background: color }} />
                  <div className="tcl-body">
                    <div className="tcl-row">
                      <span className="tcl-code" style={{ color }}>{code}</span>
                      {status === "now" && <span className="tcl-now-badge" style={{ background: color }}>NOW</span>}
                    </div>
                    <div className="tcl-title">{ev.summary}</div>
                    {ev.location && <div className="tcl-room">{ev.location}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="today-col">
          <div className="today-col-head">Upcoming exams / milestones</div>
          {examsSoon.length === 0 ? (
            <div className="today-empty">No upcoming exams detected</div>
          ) : (
            <div className="tov-week">
              {examsSoon.map((ev) => (
                <div key={ev.uid} className="tov-week-ev">
                  <span className="tov-ev-dot" style={{ background: matchToCourse(ev.summary, courses)?.course.color ?? DEFAULT_COLOR }} />
                  <span className="tov-ev-time">{ev.start ? formatTime(ev.start) : "—"}</span>
                  <span className="tov-ev-title">{ev.summary}</span>
                </div>
              ))}
            </div>
          )}

          <div className="today-col-head" style={{ marginTop: 22 }}>Course health</div>
          {courseStats.length === 0 ? (
            <div className="today-empty">No courses yet</div>
          ) : (
            <div className="tov-courses">
              {courseStats.map(({ id, course, totalEvents, notes, next, avg }) => (
                <div key={id} className="tov-course">
                  <span className="tov-dot" style={{ background: course.color }} />
                  <div className="tov-course-info">
                    <span className="tov-code" style={{ color: course.color }}>{course.code}</span>
                    <span className="tov-name">
                      {notes} notes · {totalEvents} calendar items{next?.start ? ` · next ${new Date(next.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                      {avg != null ? ` · ${avg.toFixed(1)}% (Note ${noteFromPct(avg, thresholds)})` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {courseSuggestions.length > 0 && (
            <>
              <div className="today-col-head" style={{ marginTop: 22 }}>Detected new courses</div>
              <div className="tov-courses">
                {courseSuggestions.map((c) => (
                  <div key={c.code} className="tov-course">
                    <span className="tov-dot" style={{ background: DEFAULT_COLOR }} />
                    <div className="tov-course-info">
                      <span className="tov-code">{c.code}</span>
                      <span className="tov-name">{c.name !== c.code ? c.name : "Detected from calendar"}</span>
                    </div>
                    <div className="tov-course-actions">
                      <button className="tov-btn" onClick={() => onAddCourse(c.code, c.name)}>Add</button>
                      <button className="tov-btn tov-btn-danger" onClick={() => onDismissCourseSuggestion(c.code)}>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {weekAhead.length > 0 && (
            <>
              <div className="today-col-head" style={{ marginTop: 22 }}>Rest of week</div>
              <div className="tov-week">
                {weekAhead.map(({ key, label, events: dayEvs }) => (
                  <div key={key} className="tov-week-day">
                    <div className="tov-day-label">{label}</div>
                    {dayEvs.map(({ ev, color }) => (
                      <div key={ev.uid} className="tov-week-ev">
                        <span className="tov-ev-dot" style={{ background: color }} />
                        <span className="tov-ev-time">{ev.start ? formatTime(ev.start) : "—"}</span>
                        <span className="tov-ev-title">{ev.summary}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
