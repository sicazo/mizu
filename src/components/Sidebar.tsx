interface NavRowProps {
  icon?: string;
  label: string;
  count?: number;
  active?: boolean;
  accent?: string;
  onClick: () => void;
  meta?: string;
  mono?: boolean;
}

function NavRow({ icon, label, count, active, accent, onClick, meta, mono }: NavRowProps) {
  const style = active && accent ? { background: `${accent}1A`, color: accent } : undefined;
  return (
    <div className={`sb-row${active ? " sb-row-active" : ""}`} style={style} onClick={onClick}>
      {accent ? (
        <span className="sb-dot" style={{ background: accent }} />
      ) : (
        <span className="sb-icon">{icon}</span>
      )}
      <span className={`sb-label${mono ? " sb-label-mono" : ""}`}>{label}</span>
      {meta && <span className="sb-meta">{meta}</span>}
      {count != null && (
        <span
          className="sb-count"
          style={active && accent ? { background: accent, color: "#fff" } : undefined}
        >
          {count.toLocaleString()}
        </span>
      )}
    </div>
  );
}

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  courses: Record<string, { code: string; name: string; color: string }>;
}

export default function Sidebar({ activeId, onSelect, courses }: SidebarProps) {
  const courseEntries = Object.entries(courses);

  return (
    <aside className="sb">
      <div className="sb-vault">
        <span className="sb-mark">水</span>
        <span className="sb-vault-name">Mizu</span>
        <span className="sb-vault-status" title="Synced">●</span>
      </div>

      <div className="sb-section">
        <NavRow icon="◉" label="Today"    active={activeId === "today"}    onClick={() => onSelect("today")} />
        <NavRow icon="▤" label="Schedule" active={activeId === "schedule"} onClick={() => onSelect("schedule")} />
        <NavRow icon="%" label="Grades"   active={activeId === "grades"}   onClick={() => onSelect("grades")} />
      </div>

      {courseEntries.length > 0 && (
        <div className="sb-section">
          <div className="sb-group-header">
            <span>COURSES</span>
          </div>
          {courseEntries.map(([id, c]) => (
            <NavRow
              key={id}
              label={c.code}
              accent={c.color}
              active={activeId === id}
              onClick={() => onSelect(id)}
              mono
            />
          ))}
        </div>
      )}

      <div className="sb-section">
        <div className="sb-group-header"><span>VAULT</span></div>
        <NavRow icon="◯" label="All notes" count={0}  active={activeId === "all"}      onClick={() => onSelect("all")} />
        <NavRow icon="✦" label="Pinned"    count={0}  active={activeId === "pinned"}   onClick={() => onSelect("pinned")} />
        <NavRow icon="▦" label="Concepts"  count={0}  active={activeId === "concepts"} onClick={() => onSelect("concepts")} />
      </div>

      <div className="sb-foot">Synced · just now</div>
    </aside>
  );
}
