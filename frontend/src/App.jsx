import { useEffect, useMemo, useState } from "react";
import { analyzeDataset, cleanDataset } from "./api";

const AUTO_PAYLOAD = {
  mode: "auto",
  manual: {
    drop_columns: [],
    target_column: null,
    remove_duplicates: true,
    drop_missing_rows_threshold: null,
    fill_numeric_strategy: "median",
    fill_text_strategy: "mode",
    text_constant: "unknown",
    convert_datetimes: true,
    encode_categoricals: false,
    remove_outliers: false,
    outlier_zscore_threshold: 3,
    scale_numeric: false,
    filter_rules: []
  }
};

const FEATURE_STORIES = [
  {
    id: "upload",
    eyebrow: "Drag, Drop, Detect",
    title: "Upload files with a living dropzone that reacts to every movement.",
    body:
      "The interface highlights file readiness in real time, helping users feel confident while dropping CSV and Excel datasets.",
    accent: "amber"
  },
  {
    id: "analysis",
    eyebrow: "Auto Insight",
    title: "Surface missing values, suspected IDs, data types, and distribution cues instantly.",
    body:
      "Each section reveals progressively as the user scrolls, turning the dashboard into a guided data quality story instead of a static table.",
    accent: "teal"
  },
  {
    id: "automation",
    eyebrow: "AI + Workflow",
    title: "Expose intelligent actions, reusable workflows, and assistant prompts with elegant motion.",
    body:
      "AI Assistant and Workflow Automation appear as premium feature panels with smooth modal transitions and contextual calls to action.",
    accent: "coral"
  }
];

const WORKFLOW_STEPS = [
  "Profile columns and detect schema drift",
  "Recommend smart cleaning actions",
  "Apply auto or manual transformations",
  "Compare before and after with downloadable output"
];

function App() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [cleanResult, setCleanResult] = useState(null);
  const [mode, setMode] = useState("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [activeModal, setActiveModal] = useState("");

  const alerts = useMemo(() => {
    if (!analysis) return [];
    return analysis.profile.columns.flatMap((column) =>
      column.smart_alerts.map((text) => ({ column: column.name, text }))
    );
  }, [analysis]);

  const summaryCards = useMemo(() => {
    if (!analysis) return [];
    return [
      { label: "Rows", value: analysis.profile.summary.rows, tone: "amber" },
      { label: "Columns", value: analysis.profile.summary.columns, tone: "teal" },
      { label: "Missing Cells", value: analysis.profile.summary.missing_cells, tone: "coral" },
      { label: "Duplicate Rows", value: analysis.profile.summary.duplicate_rows, tone: "sky" }
    ];
  }, [analysis]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
    );

    const elements = document.querySelectorAll("[data-reveal]");
    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [analysis, cleanResult]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (activeModal) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activeModal]);

  async function handleAnalyze(selectedFile) {
    setFile(selectedFile);
    setError("");
    setCleanResult(null);
    setIsLoading(true);

    try {
      const result = await analyzeDataset(selectedFile);
      setAnalysis(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsDragging(false);
    }
  }

  async function handleClean() {
    if (!file) return;
    setError("");
    setIsLoading(true);

    try {
      const result = await cleanDataset(file, { ...AUTO_PAYLOAD, mode });
      setCleanResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) handleAnalyze(droppedFile);
  }

  function onFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) handleAnalyze(selectedFile);
  }

  function modalContent() {
    if (activeModal === "assistant") {
      return {
        title: "AI Assistant Preview",
        description:
          "Users will be able to issue natural-language requests like 'clean missing values' or 'drop likely ID columns' and turn them into structured cleaning steps.",
        bullets: [
          "Translate human instructions into cleaning payloads",
          "Explain why a column was flagged",
          "Prepare prompts for downstream AI models"
        ]
      };
    }

    return {
      title: "Workflow Automation Preview",
      description:
        "Save the current cleaning sequence, reapply it to future files, and build repeatable dataset preparation pipelines across teams.",
      bullets: [
        "Record cleaning decisions as reusable steps",
        "Replay workflows on similar datasets",
        "Prepare export and reporting actions automatically"
      ]
    };
  }

  const modal = modalContent();

  return (
    <div className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero" data-reveal>
        <div className="hero-copy">
          <p className="eyebrow">Smart Data Cleaner & Preprocessor</p>
          <h1>Build trust in messy datasets with a polished, intelligent workspace.</h1>
          <p className="hero-body">
            A refined interface for profiling, cleaning, and preparing data with smooth motion,
            scroll-driven reveal sections, and AI-ready workflow design.
          </p>

          <div className="hero-actions">
            <button className="primary-button" onClick={handleClean} disabled={!analysis || isLoading}>
              {isLoading ? "Processing..." : "Clean Data"}
            </button>
            <button className="secondary-button" onClick={() => setActiveModal("assistant")}>
              Explore AI Assistant
            </button>
          </div>

          <div className="mode-toggle" aria-label="Cleaning modes">
            <button
              className={mode === "auto" ? "mode-pill active" : "mode-pill"}
              onClick={() => setMode("auto")}
            >
              <span>Auto Mode</span>
              <small>One-click enhancement</small>
            </button>
            <button
              className={mode === "manual" ? "mode-pill active" : "mode-pill"}
              onClick={() => setMode("manual")}
            >
              <span>Manual Mode</span>
              <small>Fine-grained control</small>
            </button>
          </div>
        </div>

        <aside className="hero-panel">
          <div className="glass-card hero-preview">
            <p className="mini-label">Live Capabilities</p>
            <ul className="stack-list">
              <li>CSV / Excel drag & drop upload</li>
              <li>Smart alerts for missing values and ID-like columns</li>
              <li>Before / after cleaning preview</li>
              <li>Animated dashboard sections on scroll</li>
            </ul>
          </div>
          <div className="glass-card highlight-card">
            <span className="signal" />
            <p className="mini-label">Current Focus</p>
            <h2>Responsive HTML-first experience with React interactivity and motion design.</h2>
          </div>
        </aside>
      </header>

      <section className="upload-band" data-reveal>
        <div
          className={isDragging ? "dropzone is-dragging" : "dropzone"}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <input
            id="file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFileChange}
            hidden
          />
          <label htmlFor="file-input" className="dropzone-content">
            <span className="dropzone-icon">+</span>
            <div>
              <strong>Drag & Drop your dataset</strong>
              <p>Drop CSV or Excel files here, or click to browse from your device.</p>
            </div>
          </label>
          <div className="dropzone-glow" />
        </div>

        <div className="glass-card upload-status">
          <p className="mini-label">Dataset Status</p>
          <h2>{file ? file.name : "No file selected yet"}</h2>
          <p>{error || "Upload a dataset to unlock profiling, alerts, and cleaning previews."}</p>
        </div>
      </section>

      <section className="feature-story-grid">
        {FEATURE_STORIES.map((story, index) => (
          <article
            key={story.id}
            data-reveal
            className={`feature-story accent-${story.accent}`}
            style={{ transitionDelay: `${index * 80}ms` }}
          >
            <p className="eyebrow">{story.eyebrow}</p>
            <h2>{story.title}</h2>
            <p>{story.body}</p>
          </article>
        ))}
      </section>

      {analysis ? (
        <>
          <section className="stats-grid">
            {summaryCards.map((card, index) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                tone={card.tone}
                delay={index * 90}
              />
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="glass-card dashboard-panel wide" data-reveal>
              <div className="panel-header">
                <div>
                  <p className="mini-label">Analysis Overview</p>
                  <h2>Automatic dataset profiling with readable visual hierarchy.</h2>
                </div>
                <button className="secondary-button" onClick={() => setActiveModal("workflow")}>
                  Preview Workflow
                </button>
              </div>

              <div className="chips">
                {analysis.profile.summary.smart_suggestions.map((item) => (
                  <span key={item} className="chip chip-suggestion">
                    {item}
                  </span>
                ))}
              </div>

              <div className="insight-grid">
                <div className="insight-list">
                  <p className="mini-label">Alerts</p>
                  <ul className="stack-list">
                    {alerts.length ? (
                      alerts.map((alert) => (
                        <li key={`${alert.column}-${alert.text}`}>
                          <strong>{alert.column}:</strong> {alert.text}
                        </li>
                      ))
                    ) : (
                      <li>No critical alerts detected for this dataset.</li>
                    )}
                  </ul>
                </div>

                <div className="target-card">
                  <p className="mini-label">Suggested Target Columns</p>
                  <div className="chips">
                    {analysis.profile.summary.target_candidates.map((item) => (
                      <span key={item} className="chip">
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="muted-copy">
                    Manual target selection, encoding, filtering, scaling, and outlier actions can
                    plug into this layout next.
                  </p>
                </div>
              </div>
            </article>

            <article className="glass-card dashboard-panel" data-reveal>
              <p className="mini-label">Workflow Automation</p>
              <h2>Capture user actions as a reusable cleaning recipe.</h2>
              <ol className="workflow-list">
                {WORKFLOW_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>

            <article className="glass-card dashboard-panel" data-reveal>
              <p className="mini-label">AI Assistant</p>
              <h2>Guide users with smart prompts that feel conversational and actionable.</h2>
              <div className="assistant-prompts">
                <button className="prompt-card">Clean missing values smartly</button>
                <button className="prompt-card">Drop low-impact columns</button>
                <button className="prompt-card">Prepare target for modeling</button>
              </div>
            </article>
          </section>

          <section className="table-section glass-card" data-reveal>
            <div className="panel-header">
              <div>
                <p className="mini-label">Column Profiling</p>
                <h2>Readable diagnostics for every feature.</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Missing %</th>
                    <th>Unique %</th>
                    <th>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.profile.columns.map((column) => (
                    <tr key={column.name}>
                      <td>{column.name}</td>
                      <td>{column.inferred_type}</td>
                      <td>{(column.missing_ratio * 100).toFixed(1)}%</td>
                      <td>{(column.unique_ratio * 100).toFixed(1)}%</td>
                      <td>{column.distribution_hint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="preview-section" data-reveal>
            <article className="glass-card preview-panel">
              <p className="mini-label">Raw Dataset Preview</p>
              <h2>See the uploaded data immediately.</h2>
              <DatasetTable rows={analysis.preview_before} />
            </article>

            {cleanResult ? (
              <article className="glass-card preview-panel">
                <p className="mini-label">Cleaned Preview</p>
                <h2>Compare before and after with motion-friendly layout.</h2>
                <DatasetTable rows={cleanResult.preview_after} />
              </article>
            ) : (
              <article className="glass-card preview-panel empty-state-panel">
                <p className="mini-label">After Cleaning</p>
                <h2>The cleaned comparison will appear here.</h2>
                <p className="muted-copy">
                  Use the animated Clean Data button to populate the before/after comparison view.
                </p>
              </article>
            )}
          </section>

          {cleanResult ? (
            <section className="glass-card execution-panel" data-reveal>
              <div className="panel-header">
                <div>
                  <p className="mini-label">Execution Timeline</p>
                  <h2>Cleaning steps applied to the dataset.</h2>
                </div>
              </div>
              <div className="timeline">
                {cleanResult.execution.map((step, index) => (
                  <article key={`${step.name}-${index}`} className="timeline-step">
                    <span className="timeline-index">{index + 1}</span>
                    <div>
                      <h3>{step.name}</h3>
                      <p>{step.details}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {activeModal ? (
        <div className="modal-backdrop" onClick={() => setActiveModal("")}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button className="modal-close" onClick={() => setActiveModal("")}>
              ×
            </button>
            <p className="eyebrow">Interactive Preview</p>
            <h2>{modal.title}</h2>
            <p className="modal-copy">{modal.description}</p>
            <ul className="stack-list">
              {modal.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, tone, delay }) {
  return (
    <article className={`stat-card tone-${tone}`} data-reveal style={{ transitionDelay: `${delay}ms` }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DatasetTable({ rows }) {
  const keys = Object.keys(rows[0] || {});

  if (!rows.length || !keys.length) {
    return <p className="muted-copy">No rows available for preview.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {keys.map((key) => (
                <td key={`${index}-${key}`}>{String(row[key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
