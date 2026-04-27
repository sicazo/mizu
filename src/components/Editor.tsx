interface BreadcrumbProps {
  path: string[];
  status?: string;
}

function Breadcrumb({ path, status }: BreadcrumbProps) {
  return (
    <div className="ed-bc">
      {path.map((seg, i) => (
        <span key={i} style={{ display: "contents" }}>
          <span className={i === path.length - 1 ? "ed-bc-current" : undefined}>{seg}</span>
          {i < path.length - 1 && <span className="ed-bc-sep">/</span>}
        </span>
      ))}
      {status && <span className="ed-bc-status">{status}</span>}
    </div>
  );
}

export default function Editor() {
  return (
    <section className="ed">
      <Breadcrumb path={["MATH-201", "Lecture 14", "Eigenvalues · intuition"]} status="Synced" />
      <div className="ed-scroll">
        <div className="ed-doc">
          <div className="ed-tag-row">
            <span className="ed-course-tag" style={{ background: "#155DFF1A", color: "#155DFF" }}>● MATH-201</span>
            <span className="ed-meta">Lecture 14 · Wed 11 Mar · 09:00</span>
          </div>

          <h1 className="ed-h1">Eigenvalues — intuition</h1>

          <div className="ed-frontmatter">
            <div><span className="fm-key">course</span><span className="fm-val">"MATH-201"</span></div>
            <div><span className="fm-key">lecture</span><span className="fm-val">14</span></div>
            <div><span className="fm-key">topic</span><span className="fm-val">eigenvalues, eigenvectors</span></div>
            <div><span className="fm-key">date</span><span className="fm-val">2026-03-11</span></div>
          </div>

          <p className="ed-p">
            An eigenvector of a transformation is a vector that{" "}
            <em>doesn't change direction</em> when the transformation is
            applied — it only gets scaled. The scaling factor is its
            eigenvalue. Compare with{" "}
            <a className="ed-wikilink">[[MATH-201 · Lecture 13]]</a> on basis
            changes.
          </p>

          <h2 className="ed-h2">The defining equation</h2>
          <div className="ed-math">A𝑣 = λ𝑣</div>
          <p className="ed-p">
            For a square matrix <code className="ed-code">A</code>, an
            eigenvector <code className="ed-code">v</code> satisfies the above
            for some scalar <code className="ed-code">λ</code>. Trivial
            solutions (<code className="ed-code">v = 0</code>) don't count.
          </p>

          <h2 className="ed-h2">How to find them</h2>
          <ul className="ed-ul">
            <li>Form the characteristic polynomial: <code className="ed-code">det(A − λI) = 0</code>.</li>
            <li>Solve for λ — these are the eigenvalues.</li>
            <li>For each λ, solve <code className="ed-code">(A − λI)v = 0</code> for v.</li>
          </ul>

          <blockquote className="ed-bq">
            "Eigen" is German for "own" — eigenvectors are a transformation's
            "own" directions. — Prof. Hodgson
          </blockquote>

          <h3 className="ed-h3">Connections</h3>
          <p className="ed-p">
            See <a className="ed-wikilink">[[CS-330 · PCA]]</a> for the
            applied side, and{" "}
            <a className="ed-wikilink">[[Concepts · Spectral theorem]]</a>{" "}
            for the deeper picture. Use <code className="ed-code">⌘K</code> →
            "quiz me" to test recall before Friday's problem set.
          </p>
        </div>
      </div>
    </section>
  );
}
