import { useState } from "react";
import { type GradeThresholds } from "../App";

const GRADE_LABELS: Record<number, string> = {
  1: "sehr gut",
  2: "gut",
  3: "befriedigend",
  4: "ausreichend",
  5: "mangelhaft",
};

interface SettingsPanelProps {
  onClose: () => void;
  onResetOnboarding: () => void;
  thresholds: GradeThresholds;
  onThresholdsChange: (t: GradeThresholds) => void;
}

export default function SettingsPanel({ onClose, onResetOnboarding, thresholds, onThresholdsChange }: SettingsPanelProps) {
  const icalUrl = localStorage.getItem("mizu-ical-url") || "";
  const coursesRaw = localStorage.getItem("mizu-courses");
  const courseCount = coursesRaw ? JSON.parse(coursesRaw).length : 0;

  const [draft, setDraft] = useState<GradeThresholds>({ ...thresholds });

  function handleThresholdInput(grade: 1 | 2 | 3 | 4 | 5, raw: string) {
    const val = Math.min(100, Math.max(0, Number(raw) || 0));
    const next = { ...draft, [grade]: val };
    setDraft(next);
    onThresholdsChange(next);
  }

  function handleReset() {
    localStorage.removeItem("mizu-setup-complete");
    localStorage.removeItem("mizu-ical-url");
    localStorage.removeItem("mizu-courses");
    onResetOnboarding();
  }

  return (
    <section className="sp">
      <div className="sp-header">
        <span className="sp-title">Settings</span>
        <button className="ai-close" onClick={onClose} title="Close">×</button>
      </div>

      <div className="sp-body">
        <div className="sp-section">
          <div className="sp-section-label">CALENDAR</div>
          <div className="sp-field">
            <span className="sp-field-label">iCal URL</span>
            <span className="sp-field-value" title={icalUrl}>
              {icalUrl || <span className="sp-field-empty">Not set</span>}
            </span>
          </div>
          <div className="sp-field">
            <span className="sp-field-label">Courses</span>
            <span className="sp-field-value">{courseCount} detected</span>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-label">GRADE THRESHOLDS</div>
          <p className="sp-hint">Minimum % required for each note. Note 6 is everything below Note 5.</p>
          <div className="sp-grade-grid">
            {([1, 2, 3, 4, 5] as const).map((g) => (
              <div key={g} className="sp-grade-row">
                <span className="sp-grade-num">Note {g}</span>
                <span className="sp-grade-label">{GRADE_LABELS[g]}</span>
                <div className="sp-grade-input-wrap">
                  <input
                    className="sp-grade-input"
                    type="number"
                    min={0}
                    max={100}
                    value={draft[g]}
                    onChange={(e) => handleThresholdInput(g, e.target.value)}
                  />
                  <span className="sp-grade-pct">%</span>
                </div>
              </div>
            ))}
            <div className="sp-grade-row sp-grade-row-muted">
              <span className="sp-grade-num">Note 6</span>
              <span className="sp-grade-label">ungenügend</span>
              <span className="sp-grade-auto">below Note 5</span>
            </div>
          </div>
        </div>

        <div className="sp-section">
          <div className="sp-section-label">SETUP</div>
          <p className="sp-hint">
            Re-run the setup to change your iCal URL, re-parse your calendar, or adjust which courses appear in the sidebar.
          </p>
          <button className="sp-danger-btn" onClick={handleReset}>
            Redo onboarding
          </button>
        </div>
      </div>
    </section>
  );
}
