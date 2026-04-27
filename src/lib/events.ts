export interface CalEvent {
  uid: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  description: string | null;
  sequence: number;
}

export interface Course {
  code: string;
  name: string;
  color: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function loadStoredEvents(): CalEvent[] {
  try { return JSON.parse(localStorage.getItem("mizu-events") || "[]"); }
  catch { return []; }
}

export function saveEvents(events: CalEvent[]) {
  localStorage.setItem("mizu-events", JSON.stringify(events));
}

// ─── Course matching ──────────────────────────────────────────────────────────

function stripSummary(summary: string): string {
  return summary
    .replace(/^[^:(]{1,25}:\s+/, "")   // strip "Prüfung: " prefix
    .replace(/\s*\([^)]*\)\s*$/, "")   // strip "(Prof)" suffix
    .replace(/\s*\[[^\]]*\]\s*$/, "")  // strip "[Tag]" suffix
    .trim();
}

export function isExamEvent(summary: string): boolean {
  return /^[^:(]{1,25}:\s+/.test(summary);
}

export function matchToCourse(
  summary: string,
  courses: Record<string, Course>,
): { id: string; course: Course } | null {
  const stripped = stripSummary(summary).toLowerCase();
  for (const [id, course] of Object.entries(courses)) {
    if (
      stripped === course.name.toLowerCase() ||
      stripped === course.code.toLowerCase()
    ) {
      return { id, course };
    }
  }
  return null;
}

export function courseNameFromSummary(summary: string): string {
  return stripSummary(summary);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function localDate(iso: string): Date {
  return new Date(iso);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isEventToday(ev: CalEvent): boolean {
  if (!ev.start) return false;
  return isSameDay(localDate(ev.start), new Date());
}

export function isEventThisWeek(ev: CalEvent): boolean {
  if (!ev.start) return false;
  const d = localDate(ev.start);
  const now = new Date();
  // Mon → Sun of current week
  const mon = startOfDay(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return d >= mon && d <= sun;
}

export function isEventUpcoming(ev: CalEvent): boolean {
  if (!ev.start) return false;
  return localDate(ev.start) > new Date();
}

export function isHappeningNow(ev: CalEvent): boolean {
  if (!ev.start || !ev.end) return false;
  const now = new Date();
  return localDate(ev.start) <= now && localDate(ev.end) >= now;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function formatDayHeading(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (isSameDay(d, tom)) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

// ─── Event sorting ────────────────────────────────────────────────────────────

export function sortByStart(events: CalEvent[]): CalEvent[] {
  return [...events].sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
}

// Group events by calendar date (YYYY-MM-DD key)
export function groupByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const ev of sortByStart(events)) {
    if (!ev.start) continue;
    const key = new Date(ev.start).toLocaleDateString("en-CA"); // YYYY-MM-DD
    const arr = map.get(key) ?? [];
    arr.push(ev);
    map.set(key, arr);
  }
  return map;
}
