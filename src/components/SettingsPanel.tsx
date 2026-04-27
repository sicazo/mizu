interface SettingsPanelProps {
  onClose: () => void;
  onResetOnboarding: () => void;
}

export default function SettingsPanel({ onClose, onResetOnboarding }: SettingsPanelProps) {
  const icalUrl = localStorage.getItem("mizu-ical-url") || "";
  const coursesRaw = localStorage.getItem("mizu-courses");
  const courseCount = coursesRaw ? JSON.parse(coursesRaw).length : 0;

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
