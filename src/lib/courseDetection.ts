export interface CalendarEventLike {
  summary: string;
}

export interface DetectedCourseCandidate {
  code: string;
  name: string;
  lectureCount: number;
}

const COURSE_CODE_RE = /\b([A-Za-z]{2,5})[-\s]?(\d{3,4})\b/;

export function detectCoursesFromEvents(events: CalendarEventLike[]): DetectedCourseCandidate[] {
  const byCode = new Map<string, { name: string; count: number }>();
  for (const ev of events) {
    const m = ev.summary.match(COURSE_CODE_RE);
    if (!m) continue;
    const code = `${m[1].toUpperCase()}-${m[2]}`;
    if (!byCode.has(code)) {
      const name = ev.summary
        .replace(new RegExp(`\\b${m[1]}[-\\s]?${m[2]}\\b`, "i"), "")
        .replace(/^[-–—·:,\s]+|[-–—·:,\s]+$/g, "")
        .trim();
      byCode.set(code, { name: name || code, count: 0 });
    }
    byCode.get(code)!.count++;
  }

  if (byCode.size > 0) {
    return [...byCode.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([code, value]) => ({ code, name: value.name, lectureCount: value.count }));
  }

  const hasPrefix = events.filter((e) => /^[^:(]{1,25}:\s+/.test(e.summary)).length > events.length * 0.1;
  const hasParen = events.filter((e) => /\([^)]+\)\s*$/.test(e.summary)).length > events.length * 0.3;
  const hasBracket = events.filter((e) => /\[[^\]]+\]\s*$/.test(e.summary)).length > events.length * 0.1;

  const strippedCounts = new Map<string, number>();
  for (const ev of events) {
    let summary = ev.summary;
    if (hasPrefix) summary = summary.replace(/^[^:(]{1,25}:\s+/, "");
    if (hasParen) summary = summary.replace(/\s*\([^)]*\)\s*$/, "");
    if (hasBracket) summary = summary.replace(/\s*\[[^\]]*\]\s*$/, "");
    const name = summary.trim();
    if (!name) continue;
    strippedCounts.set(name, (strippedCounts.get(name) ?? 0) + 1);
  }

  return [...strippedCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, lectureCount]) => ({ code: name, name, lectureCount }));
}
