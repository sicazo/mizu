import {
  type CalEvent,
  type Course,
  isEventToday,
  isHappeningNow,
  isEventThisWeek,
  formatTime,
  matchToCourse,
  sortByStart,
  groupByDay,
  formatDayHeading,
} from "../lib/events";

interface Props {
  events: CalEvent[];
  courses: Record<string, Course>;
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

export default function TodayView({ events, courses }: Props) {
  const today = new Date();
  const dayLabel = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const todayItems = buildTodayEvents(events, courses);
  const weekAhead = buildWeekAhead(events, courses);
  const classesLeft = todayItems.filter((t) => t.status !== "done").length;
  const courseList = Object.values(courses);

  return (
    <section className="today">
      <div className="today-head">
        <div>
          <div className="today-eyebrow">TODAY</div>
          <div className="today-h1">{dayLabel}</div>
        </div>
        {todayItems.length > 0 && (
          <div className="today-stat">
            <span className="today-stat-num">{classesLeft}</span>
            <span className="today-stat-lbl">events left</span>
          </div>
        )}
      </div>

      <div className="today-grid">
        {/* ── Schedule column ── */}
        <div className="today-col">
          <div className="today-col-head">Schedule</div>
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
                    ...(status === "now"
                      ? { borderColor: color, background: `color-mix(in oklab, ${color} 6%, transparent)` }
                      : {}),
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
                      {status === "now" && (
                        <span className="tcl-now-badge" style={{ background: color }}>NOW</span>
                      )}
                      {status === "done" && (
                        <span className="tcl-done-badge">✓ done</span>
                      )}
                    </div>
                    <div className="tcl-title">{ev.summary}</div>
                    {ev.location && <div className="tcl-room">{ev.location}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Overview column ── */}
        <div className="today-col">
          {courseList.length > 0 && (
            <>
              <div className="today-col-head">Courses</div>
              <div className="tov-courses">
                {courseList.map((c) => {
                  const key = c.code.toLowerCase().replace("-", "");
                  const count = events.filter((ev) => matchToCourse(ev.summary, { [key]: c }) !== null).length;
                  return (
                    <div key={c.code} className="tov-course">
                      <span className="tov-dot" style={{ background: c.color }} />
                      <div className="tov-course-info">
                        <span className="tov-code" style={{ color: c.color }}>{c.code}</span>
                        <span className="tov-name">{c.name !== c.code ? c.name : ""}</span>
                      </div>
                      {count > 0 && <span className="tov-count">{count} events</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {weekAhead.length > 0 && (
            <>
              <div className="today-col-head" style={{ marginTop: courseList.length > 0 ? 28 : 0 }}>
                Rest of week
              </div>
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

          {courseList.length === 0 && weekAhead.length === 0 && (
            <div className="today-empty">
              {events.length === 0 ? "No calendar data yet" : "Nothing else this week"}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
