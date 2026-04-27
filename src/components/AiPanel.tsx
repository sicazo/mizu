interface AiPanelProps {
  onClose: () => void;
}

export default function AiPanel({ onClose }: AiPanelProps) {
  return (
    <section className="ai">
      <div className="ai-header">
        <span className="ai-title">
          Ask{" "}
          <span style={{ fontFamily: "'Yu Mincho', 'Hiragino Mincho ProN', serif", color: "#155DFF" }}>水</span>
        </span>
        <button className="ai-close" onClick={onClose} title="Close">×</button>
      </div>
      <div className="ai-scroll">
        <div className="ai-suggest">
          <div className="ai-suggest-label">Try asking</div>
          <button className="ai-chip">Quiz me on this lecture</button>
          <button className="ai-chip">Summarize lectures 11–14</button>
          <button className="ai-chip">Explain like Prof. Hodgson</button>
        </div>
        <div className="ai-msg ai-msg-user">
          <div className="ai-bubble ai-bubble-user">Quiz me on eigenvalues.</div>
        </div>
        <div className="ai-msg ai-msg-assist">
          <div className="ai-bubble ai-bubble-assist">
            From <span className="ai-cite">MATH-201 · Lecture 14</span>:
            <div className="ai-q">
              <span className="ai-q-num">1.</span> What does it mean
              geometrically for a vector to be an eigenvector of a
              transformation A?
            </div>
            <div className="ai-q">
              <span className="ai-q-num">2.</span> Write the characteristic
              equation used to find eigenvalues.
            </div>
            <div className="ai-q">
              <span className="ai-q-num">3.</span> Why is the trivial
              solution v = 0 excluded from the definition?
            </div>
          </div>
        </div>
        <div className="ai-msg ai-msg-assist">
          <div className="ai-typing"><span /><span /><span /></div>
        </div>
      </div>
      <div className="ai-input-wrap">
        <textarea className="ai-input" placeholder="Ask anything from your courses or vault…" rows={2} />
        <div className="ai-input-foot">
          <span className="ai-model">claude · haiku</span>
          <button className="ai-send">Send ↵</button>
        </div>
      </div>
    </section>
  );
}
