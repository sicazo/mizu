import { useState, useEffect } from "react";

const COMMANDS = [
  {
    section: "NAVIGATION",
    items: [
      { label: "Open vault…",      kbd: "⌘O" },
      { label: "Go to today",      kbd: "⌘T" },
      { label: "Toggle sidebar",   kbd: "⌘\\" },
      { label: "Toggle AI panel",  kbd: "⌘J" },
    ],
  },
  {
    section: "CREATE",
    items: [
      { label: "New note",         kbd: "⌘N" },
      { label: "New course…",      kbd: "" },
      { label: "New lecture note", kbd: "" },
    ],
  },
  {
    section: "AI",
    items: [
      { label: "Ask the vault…",        kbd: "Space" },
      { label: "Summarize this note",   kbd: "" },
      { label: "Find related notes",    kbd: "" },
      { label: "Quiz me on this lecture", kbd: "" },
    ],
  },
];

interface CommandPaletteProps {
  onClose: () => void;
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredSections = COMMANDS.map((s) => ({
    ...s,
    items: s.items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())),
  })).filter((s) => s.items.length > 0);

  let highlighted: string | null = null;
  outer: for (const s of filteredSections) {
    for (const it of s.items) { highlighted = it.label; break outer; }
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search-row">
          <input
            className="cmd-search"
            placeholder="Search commands or type a space for AI…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="cmd-rows">
          {filteredSections.map((s) => (
            <div key={s.section} className="cmd-section">
              <div className="cmd-section-label">{s.section}</div>
              {s.items.map((it) => (
                <div
                  key={it.label}
                  className={`cmd-row${it.label === highlighted ? " cmd-row-active" : ""}`}
                >
                  <span>{it.label}</span>
                  {it.kbd && <span className="cmd-kbd">{it.kbd}</span>}
                </div>
              ))}
            </div>
          ))}
          {filteredSections.length === 0 && (
            <div className="cmd-empty">No commands match "{q}"</div>
          )}
        </div>
        <div className="cmd-foot">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
