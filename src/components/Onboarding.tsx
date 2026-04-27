import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import PatternBuilder, {
  type CalEvent,
  type DetectedCourse,
  type ExtractionRule,
  ACCENT_COLORS,
  applyExtractionRule,
} from "./PatternBuilder";

export type { DetectedCourse };

interface OnboardingProps {
  onComplete: (courses: DetectedCourse[], icalUrl: string) => void;
}

// ─── Strategy A: DEPT-NNN course codes ───────────────────────────────────────

const COURSE_CODE_RE = /\b([A-Za-z]{2,5})[-\s]?(\d{3,4})\b/;

function tryCodeStrategy(events: CalEvent[]): DetectedCourse[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const ev of events) {
    const m = ev.summary.match(COURSE_CODE_RE);
    if (!m) continue;
    const code = `${m[1].toUpperCase()}-${m[2]}`;
    if (!map.has(code)) {
      const name = ev.summary
        .replace(new RegExp(`\\b${m[1]}[-\\s]?${m[2]}\\b`, "i"), "")
        .replace(/^[-–—·:,\s]+|[-–—·:,\s]+$/g, "")
        .trim();
      map.set(code, { name: name || code, count: 0 });
    }
    map.get(code)!.count++;
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, { name, count }], i) => ({
      code, name, lectureCount: count,
      color: ACCENT_COLORS[i % ACCENT_COLORS.length],
    }));
}

// ─── Strategy B: strip prefix + trailing parens/brackets ─────────────────────

function tryNameStrategy(events: CalEvent[]): DetectedCourse[] {
  // Detect which strips are useful by checking prevalence across events
  const hasPrefix    = events.filter(e => /^[^:(]{1,25}:\s+/.test(e.summary)).length > events.length * 0.1;
  const hasParen     = events.filter(e => /\([^)]+\)\s*$/.test(e.summary)).length  > events.length * 0.3;
  const hasBracket   = events.filter(e => /\[[^\]]+\]\s*$/.test(e.summary)).length  > events.length * 0.1;

  const rule: ExtractionRule = {
    stripPrefix:  hasPrefix,
    stripParen:   hasParen,
    stripBracket: hasBracket,
  };

  const map = new Map<string, number>();
  for (const ev of events) {
    const name = applyExtractionRule(ev.summary, rule);
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }

  // Only trust this strategy if multiple events share the same course name
  const grouped = [...map.entries()].filter(([, count]) => count >= 2);
  if (grouped.length === 0) return [];

  return grouped
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => ({
      code: name, name, lectureCount: count,
      color: ACCENT_COLORS[i % ACCENT_COLORS.length],
    }));
}

function autoDetect(events: CalEvent[]): DetectedCourse[] {
  const byCode = tryCodeStrategy(events);
  if (byCode.length > 0) return byCode;
  return tryNameStrategy(events);
}

// ─── Step dots ────────────────────────────────────────────────────────────────

type Step = "welcome" | "calendar" | "courses";
const STEPS: Step[] = ["calendar", "courses"];

function StepDots({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  if (idx === -1) return null;
  return (
    <div className="ob-dots">
      {STEPS.map((_, i) => (
        <span key={i} className={`ob-dot${i === idx ? " ob-dot-active" : i < idx ? " ob-dot-done" : ""}`} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [courses, setCourses] = useState<DetectedCourse[]>([]);
  const [showPatternBuilder, setShowPatternBuilder] = useState(false);

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await invoke<CalEvent[]>("fetch_calendar", { url: url.trim() });
      setEvents(fetched);
      const detected = autoDetect(fetched);
      setCourses(detected);
      setShowPatternBuilder(detected.length === 0 && fetched.length > 0);
      setStep("courses");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function updateCourse(index: number, field: keyof DetectedCourse, value: string) {
    setCourses((prev) => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  function removeCourse(index: number) {
    setCourses((prev) => prev.filter((_, i) => i !== index));
  }

  function handleComplete() {
    localStorage.setItem("mizu-setup-complete", "1");
    localStorage.setItem("mizu-ical-url", url.trim());
    localStorage.setItem("mizu-courses", JSON.stringify(courses));
    onComplete(courses, url.trim());
  }

  return (
    <div className="ob-shell">
      {/* Left brand panel */}
      <div className="ob-brand">
        <div className="ob-brand-inner">
          <div className="ob-brand-mark">水</div>
          <div className="ob-brand-name">Mizu</div>
          <p className="ob-brand-tag">Your academic life,<br />in plain markdown.</p>
        </div>
        <div className="ob-brand-foot">
          <StepDots current={step} />
        </div>
      </div>

      {/* Right content panel */}
      <div className="ob-content">
        {step === "welcome" && (
          <div className="ob-pane">
            <p className="ob-eyebrow">Welcome</p>
            <h1 className="ob-h1">Notes that flow.</h1>
            <p className="ob-body">
              Mizu keeps your courses, lectures, grades, and vault in one place —
              local files, plain markdown, git-versioned. Your notes outlive the app.
            </p>
            <div className="ob-feature-list">
              <div className="ob-feature">
                <span className="ob-feature-dot" style={{ background: "#155DFF" }} />
                <span>Courses with per-lecture notes and grade tracking</span>
              </div>
              <div className="ob-feature">
                <span className="ob-feature-dot" style={{ background: "#319795" }} />
                <span>Schedule pulled from your iCal</span>
              </div>
              <div className="ob-feature">
                <span className="ob-feature-dot" style={{ background: "#805AD5" }} />
                <span>Ask Mizu — AI that reads your own notes back to you</span>
              </div>
            </div>
            <button className="ob-btn-primary" onClick={() => setStep("calendar")}>
              Set up your courses →
            </button>
          </div>
        )}

        {step === "calendar" && (
          <div className="ob-pane">
            <p className="ob-eyebrow">Step 1 of 2</p>
            <h2 className="ob-h2">Add your calendar</h2>
            <p className="ob-body">
              Paste your iCal URL — Mizu reads it to find your courses and schedule.
              Your link stays on your device, never leaves it.
            </p>
            <div className="ob-field">
              <label className="ob-label" htmlFor="ical-url">iCal URL</label>
              <input
                id="ical-url"
                className="ob-input"
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder="webcal://…  or  https://…/calendar.ics"
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                disabled={loading}
                autoFocus
              />
              <p className="ob-hint">
                Find this in your university portal under "Export calendar" or "Subscribe".
              </p>
              {error && <div className="ob-error">{error}</div>}
            </div>
            <div className="ob-actions">
              <button className="ob-btn-ghost" onClick={() => setStep("welcome")}>← Back</button>
              <button className="ob-btn-primary" onClick={handleFetch} disabled={loading || !url.trim()}>
                {loading ? <><span className="ob-spinner" /> Reading calendar…</> : "Fetch calendar →"}
              </button>
            </div>
            <button className="ob-skip" onClick={() => { setCourses([]); setEvents([]); setShowPatternBuilder(false); setStep("courses"); }}>
              Skip — I'll add courses manually
            </button>
          </div>
        )}

        {step === "courses" && (
          <div className="ob-pane">
            {showPatternBuilder ? (
              <>
                <p className="ob-eyebrow">Step 2 of 2 · Custom detection</p>
                <h2 className="ob-h2">Tell Mizu where the course name is</h2>
                <PatternBuilder
                  events={events}
                  onApply={(detected) => { setCourses(detected); setShowPatternBuilder(false); }}
                  onCancel={() => setShowPatternBuilder(false)}
                />
              </>
            ) : (
              <>
                <p className="ob-eyebrow">Step 2 of 2</p>
                <h2 className="ob-h2">
                  {courses.length > 0
                    ? `Found ${courses.length} course${courses.length === 1 ? "" : "s"}`
                    : "No courses detected"}
                </h2>
                <p className="ob-body">
                  {courses.length > 0
                    ? "Edit names or colors, then open Mizu."
                    : "Mizu couldn't detect courses automatically. You can adjust how it reads your event titles."}
                </p>

                {courses.length > 0 && (
                  <div className="ob-courses">
                    {courses.map((c, i) => (
                      <div key={c.code} className="ob-course-row">
                        <input
                          type="color"
                          className="ob-color-swatch"
                          value={c.color}
                          onChange={(e) => updateCourse(i, "color", e.target.value)}
                          title="Pick color"
                        />
                        <input
                          className="ob-course-name-input ob-course-name-full"
                          value={c.name}
                          onChange={(e) => updateCourse(i, "name", e.target.value)}
                          placeholder="Course name"
                        />
                        <span className="ob-course-count">{c.lectureCount} events</span>
                        <button className="ob-remove-btn" onClick={() => removeCourse(i)} title="Remove">×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="ob-actions">
                  <button className="ob-btn-ghost" onClick={() => setStep("calendar")}>← Back</button>
                  <button className="ob-btn-primary" onClick={handleComplete}>
                    Open Mizu →
                  </button>
                </div>

                {events.length > 0 && (
                  <button className="ob-skip" onClick={() => setShowPatternBuilder(true)}>
                    {courses.length > 0 ? "Adjust detection pattern" : "Teach Mizu the pattern →"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
