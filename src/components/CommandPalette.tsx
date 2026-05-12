import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  section: string;
  label: string;
  kbd?: string;
  run: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  commands: PaletteCommand[];
}

export default function CommandPalette({ onClose, commands }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(needle));
  }, [commands, q]);

  const sections = useMemo(() => {
    const grouped = new Map<string, PaletteCommand[]>();
    for (const cmd of filtered) {
      const list = grouped.get(cmd.section) ?? [];
      list.push(cmd);
      grouped.set(cmd.section, list);
    }
    return Array.from(grouped.entries()).map(([section, items]) => ({ section, items }));
  }, [filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [q]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  function execute(cmd: PaletteCommand) {
    cmd.run();
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) execute(cmd);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, filtered, onClose]);

  // Build a flat list with stable indices for hover tracking
  const flatItems = useMemo(() => filtered, [filtered]);

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search-row">
          <input
            ref={inputRef}
            className="cmd-search"
            placeholder="Search commands…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="cmd-rows">
          {sections.map((s) => (
            <div key={s.section} className="cmd-section">
              <div className="cmd-section-label">{s.section}</div>
              {s.items.map((it) => {
                const idx = flatItems.indexOf(it);
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={it.id}
                    className={`cmd-row${isActive ? " cmd-row-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => execute(it)}
                  >
                    <span>{it.label}</span>
                    {it.kbd && <span className="cmd-kbd">{it.kbd}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {sections.length === 0 && <div className="cmd-empty">No commands match "{q}"</div>}
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
