import { useState, useMemo } from "react";

export interface CalEvent {
  uid: string;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  description: string | null;
  sequence: number;
}

export interface DetectedCourse {
  code: string;
  name: string;
  color: string;
  lectureCount: number;
}

export const ACCENT_COLORS = [
  "#155DFF", "#805AD5", "#319795", "#D9730D",
  "#D53F8C", "#38A169", "#D69E2E", "#E53E3E", "#718096",
];

// ─── Segment types ────────────────────────────────────────────────────────────

type SegmentKind = "prefix" | "body" | "paren" | "bracket";

interface Segment {
  kind: SegmentKind;
  text: string;       // raw text including delimiters
  display: string;    // text shown in the UI chip
}

// Split an event summary into labelled segments
function parseSegments(summary: string): Segment[] {
  const segs: Segment[] = [];
  let s = summary;

  // Prefix: text before first ": " that's ≤ 25 chars and has no parens
  const prefixMatch = s.match(/^([^:(]{1,25}):\s+/);
  if (prefixMatch) {
    segs.push({ kind: "prefix", text: prefixMatch[0], display: prefixMatch[1] + ":" });
    s = s.slice(prefixMatch[0].length);
  }

  // Trailing bracket [...]
  const bracketMatch = s.match(/\s*\[[^\]]+\]\s*$/);
  let bracketSeg: Segment | null = null;
  if (bracketMatch) {
    bracketSeg = { kind: "bracket", text: bracketMatch[0], display: bracketMatch[0].trim() };
    s = s.slice(0, s.length - bracketMatch[0].length);
  }

  // Trailing paren (...)
  const parenMatch = s.match(/\s*\([^)]+\)\s*$/);
  let parenSeg: Segment | null = null;
  if (parenMatch) {
    parenSeg = { kind: "paren", text: parenMatch[0], display: parenMatch[0].trim() };
    s = s.slice(0, s.length - parenMatch[0].length);
  }

  segs.push({ kind: "body", text: s, display: s.trim() });
  if (parenSeg) segs.push(parenSeg);
  if (bracketSeg) segs.push(bracketSeg);

  return segs;
}

// ─── Extraction rule ──────────────────────────────────────────────────────────

export interface ExtractionRule {
  stripPrefix: boolean;
  stripParen: boolean;
  stripBracket: boolean;
}

export function applyExtractionRule(summary: string, rule: ExtractionRule): string {
  let s = summary;
  if (rule.stripPrefix) s = s.replace(/^[^:(]{1,25}:\s+/, "");
  if (rule.stripParen)  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  if (rule.stripBracket) s = s.replace(/\s*\[[^\]]*\]\s*$/, "");
  return s.trim();
}

function deriveCoursesFromRule(events: CalEvent[], rule: ExtractionRule): DetectedCourse[] {
  const map = new Map<string, number>();
  for (const ev of events) {
    const name = applyExtractionRule(ev.summary, rule);
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], i) => ({
      code: name,
      name,
      color: ACCENT_COLORS[i % ACCENT_COLORS.length],
      lectureCount: count,
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PatternBuilderProps {
  events: CalEvent[];
  onApply: (courses: DetectedCourse[]) => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<SegmentKind, string> = {
  prefix: "prefix",
  body: "course name",
  paren: "info in ( )",
  bracket: "tag in [ ]",
};

export default function PatternBuilder({ events, onApply, onCancel }: PatternBuilderProps) {
  const uniqueSummaries = useMemo(
    () => [...new Set(events.map((e) => e.summary))].slice(0, 20),
    [events],
  );

  const [exIdx, setExIdx] = useState(0);
  const [rule, setRule] = useState<ExtractionRule>({
    stripPrefix: true,
    stripParen: true,
    stripBracket: true,
  });

  const example = uniqueSummaries[exIdx] ?? "";
  const segments = useMemo(() => parseSegments(example), [example]);

  function toggleStrip(kind: SegmentKind) {
    if (kind === "body") return; // body is always the course name
    const key = kind === "prefix" ? "stripPrefix" : kind === "paren" ? "stripParen" : "stripBracket";
    setRule((r) => ({ ...r, [key]: !r[key] }));
  }

  function isStripped(kind: SegmentKind): boolean {
    if (kind === "body") return false;
    if (kind === "prefix") return rule.stripPrefix;
    if (kind === "paren")  return rule.stripParen;
    if (kind === "bracket") return rule.stripBracket;
    return false;
  }

  function changeExample(delta: number) {
    setExIdx((i) => (i + delta + uniqueSummaries.length) % uniqueSummaries.length);
  }

  const extracted = applyExtractionRule(example, rule);

  const preview = useMemo(() => deriveCoursesFromRule(events, rule), [events, rule]);

  return (
    <div className="pb-root">
      <p className="ob-body">
        Your event titles are split into parts below. Click any part to toggle
        whether it's included in the course name.
      </p>

      {/* Example cycler */}
      <div className="pb-example">
        <div className="pb-example-nav">
          <button className="pb-nav-btn" onClick={() => changeExample(-1)}>←</button>
          <span className="pb-example-count">{exIdx + 1} / {uniqueSummaries.length}</span>
          <button className="pb-nav-btn" onClick={() => changeExample(1)}>→</button>
        </div>

        <div className="pb-segments">
          {segments.map((seg, i) => {
            const stripped = isStripped(seg.kind);
            return (
              <button
                key={i}
                className={`pb-seg pb-seg-${seg.kind}${stripped ? " pb-seg-stripped" : " pb-seg-kept"}`}
                onClick={() => toggleStrip(seg.kind)}
                title={stripped ? `Click to include ${KIND_LABEL[seg.kind]}` : `Click to strip ${KIND_LABEL[seg.kind]}`}
                disabled={seg.kind === "body"}
              >
                <span className="pb-seg-label">{KIND_LABEL[seg.kind]}</span>
                <span className="pb-seg-text">{seg.display}</span>
                {seg.kind !== "body" && (
                  <span className="pb-seg-toggle">{stripped ? "+" : "×"}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="pb-result-row">
          <span className="pb-result-label">Course name:</span>
          <span className="pb-result-value">{extracted || <em>nothing — adjust above</em>}</span>
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="pb-preview">
          <p className="pb-preview-label">Courses this would find ({preview.length}):</p>
          <div className="pb-preview-list">
            {preview.map(({ code, lectureCount }, i) => (
              <div key={code} className="pb-preview-row">
                <span className="pb-preview-dot" style={{ background: ACCENT_COLORS[i % ACCENT_COLORS.length] }} />
                <span className="pb-preview-code" style={{ color: ACCENT_COLORS[i % ACCENT_COLORS.length] }}>{code}</span>
                <span className="pb-preview-count">{lectureCount} events</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.length === 0 && (
        <p className="ob-hint">Nothing extracted — make sure at least the course name part is kept.</p>
      )}

      <div className="ob-actions">
        <button className="ob-btn-ghost" onClick={onCancel}>← Cancel</button>
        <button
          className="ob-btn-primary"
          disabled={preview.length === 0}
          onClick={() => onApply(preview)}
        >
          Use this pattern →
        </button>
      </div>
    </div>
  );
}
