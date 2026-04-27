import {
  type CalEvent,
  type Course,
  matchToCourse,
  sortByStart,
  isSameDay,
  isHappeningNow,
  formatTime,
} from "../lib/events";


interface Props {
  events: CalEvent[];
  courses: Record<string, Course>;
}

const DEFAULT_COLOR = "#64748b";

function getColor(ev: CalEvent, courses: Record<string, Course>): string {
  return matchToCourse(ev.summary, courses)?.course.color ?? DEFAULT_COLOR;
}

function buildAgenda(events: CalEvent[]) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + 28);

  const upcoming = sortByStart(
    events.filter((ev) => {
      if (!ev.start) return false;
      const start = new Date(ev.start);
      // include events that haven't ended yet (or are today)
      const end = ev.end ? new Date(ev.end) : start;
      return end >= now && start <= cutoff;
    })
  );

  // group by calendar date
  const map = new Map<string, CalEvent[]>();
  for (const ev of upcoming) {
    if (!ev.start) continue;
    const key = new Date(ev.start).toLocaleDateString("en-CA");
    const arr = map.get(key) ?? [];
    arr.push(ev);
    map.set(key, arr);
  }

  return Array.from(map.entries()).map(([key, dayEvents]) => {
    const date = new Date(dayEvents[0].start!);
    const isToday = isSameDay(date, now);
    return { key, date, isToday, events: dayEvents };
  });
}

export default function ScheduleView({ events, courses }: Props) {
  const agenda = buildAgenda(events);

  return (
    <section className="sched">
      <div className="sched-head">
        <div className="sched-eyebrow">SCHEDULE</div>
        <div className="sched-h1">Upcoming</div>
      </div>

      {agenda.length === 0 ? (
        <div className="sched-empty">
          {events.length === 0
            ? "No calendar connected yet. Set one up in Settings."
            : "Nothing upcoming in the next 28 days."}
        </div>
      ) : (
        <div className="sched-agenda">
          {agenda.map(({ key, date, isToday, events: dayEvs }) => (
            <div key={key} className={`sched-day${isToday ? " sched-day-today" : ""}`}>
              <div className="sched-day-aside">
                <div className="sched-day-num">{date.getDate()}</div>
                <div className="sched-day-name">
                  {isToday ? "Today" : date.toLocaleDateString("en-GB", { weekday: "short" })}
                </div>
                {isToday && <div className="sched-today-dot" />}
              </div>
              <div className="sched-day-events">
                {dayEvs.map((ev) => {
                  const color = getColor(ev, courses);
                  const now_happening = isHappeningNow(ev);
                  const done = ev.end && new Date(ev.end) < new Date();
                  return (
                    <div
                      key={ev.uid}
                      className={`sched-ev${now_happening ? " sched-ev-now" : ""}${done ? " sched-ev-done" : ""}`}
                      style={{ "--c": color } as React.CSSProperties}
                    >
                      <div className="sched-ev-bar" style={{ background: color }} />
                      <div className="sched-ev-body">
                        <div className="sched-ev-title">{ev.summary}</div>
                        <div className="sched-ev-meta">
                          {ev.start && (
                            <span className="sched-ev-time">
                              {formatTime(ev.start)}
                              {ev.end && ` – ${formatTime(ev.end)}`}
                            </span>
                          )}
                          {ev.location && (
                            <>
                              <span className="sched-ev-sep">·</span>
                              <span className="sched-ev-loc">{ev.location}</span>
                            </>
                          )}
                          {now_happening && (
                            <span className="sched-now-chip" style={{ background: color }}>NOW</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
