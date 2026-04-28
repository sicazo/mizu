interface TitleBarProps {
  breadcrumb: string[];
  onTogglePalette: () => void;
  onToggleAi: () => void;
}

export default function TitleBar({ breadcrumb, onTogglePalette, onToggleAi }: TitleBarProps) {
  return (
    <div className="tb">
      <div className="tb-center">
        <div className="bc">
          {breadcrumb.map((seg, i) => (
            <span key={i} style={{ display: "contents" }}>
              <span className={i === breadcrumb.length - 1 ? "bc-current" : undefined}>{seg}</span>
              {i < breadcrumb.length - 1 && <span className="bc-sep">/</span>}
            </span>
          ))}
        </div>
      </div>
      <div className="tb-right">
        <button className="tb-btn" onClick={onTogglePalette} title="Command palette">
          <span className="kbd">⌘K</span>
        </button>
        <button className="tb-btn" onClick={onToggleAi} title="Ask Mizu">
          <span style={{ fontFamily: "'Yu Mincho', 'Hiragino Mincho ProN', serif", fontSize: 14, color: "#155DFF" }}>水</span>
        </button>
      </div>
    </div>
  );
}
