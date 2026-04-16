import { useEffect, useMemo, useState } from "react";
import {
  analyzeDataset,
  cleanDataset,
  downloadDatasetFile,
  downloadReport,
  listWorkflows,
  saveWorkflow
} from "./api";

const FEATURE_STORIES = [
  {
    id: "upload",
    eyebrow: "◌",
    title: "التحليل التلقائي",
    body: "اكتشاف فوري لأنواع البيانات، القيم المفقودة، والتكرار.",
    accent: "amber"
  },
  {
    id: "analysis",
    eyebrow: "✦",
    title: "التنظيف الذكي",
    body: "معالجة تلقائية للقيم الشاذة والفارغة باستخدام خوارزميات متقدمة.",
    accent: "teal"
  },
  {
    id: "automation",
    eyebrow: "⌁",
    title: "المساعد الشخصي",
    body: "دردشة تفاعلية لتنفيذ أوامر التنظيف والتحويل بلغة طبيعية.",
    accent: "coral"
  },
  {
    id: "workflow",
    eyebrow: "◳",
    title: "أتمتة العمليات",
    body: "حفظ خطوات التنظيف لتطبيقها تلقائياً على الملفات المستقبلية.",
    accent: "teal"
  },
  {
    id: "reports",
    eyebrow: "□",
    title: "تصدير التقارير",
    body: "ملخص PDF تفصيلي لكل التعديلات والإحصائيات التي تمت.",
    accent: "amber"
  },
  {
    id: "api",
    eyebrow: "↗",
    title: "دعم الـ API",
    body: "ربط مباشر للمنصة مع مشاريعك وتطبيقاتك الخارجية.",
    accent: "coral"
  }
];

function createDefaultManualState() {
  return {
    drop_columns: [],
    target_column: "",
    remove_duplicates: true,
    drop_missing_rows_threshold: "",
    fill_numeric_strategy: "median",
    fill_text_strategy: "mode",
    text_constant: "unknown",
    convert_datetimes: true,
    encode_categoricals: false,
    remove_outliers: false,
    outlier_zscore_threshold: 3,
    scale_numeric: false,
    filter_rules: []
  };
}

function buildRequest(mode, manualState) {
  return {
    mode,
    manual: {
      ...manualState,
      target_column: manualState.target_column || null,
      drop_missing_rows_threshold:
        manualState.drop_missing_rows_threshold === ""
          ? null
          : Number(manualState.drop_missing_rows_threshold),
      outlier_zscore_threshold: Number(manualState.outlier_zscore_threshold || 3),
      filter_rules: manualState.filter_rules
        .filter((rule) => rule.column && rule.value !== "")
        .map((rule) => ({
          column: rule.column,
          operator: rule.operator,
          value: rule.value
        }))
    }
  };
}

function applyRequestToManualState(request) {
  const manual = request?.manual || {};
  return {
    drop_columns: manual.drop_columns || [],
    target_column: manual.target_column || "",
    remove_duplicates: manual.remove_duplicates ?? true,
    drop_missing_rows_threshold:
      manual.drop_missing_rows_threshold === null || manual.drop_missing_rows_threshold === undefined
        ? ""
        : String(manual.drop_missing_rows_threshold),
    fill_numeric_strategy: manual.fill_numeric_strategy || "median",
    fill_text_strategy: manual.fill_text_strategy || "mode",
    text_constant: manual.text_constant || "unknown",
    convert_datetimes: manual.convert_datetimes ?? true,
    encode_categoricals: manual.encode_categoricals ?? false,
    remove_outliers: manual.remove_outliers ?? false,
    outlier_zscore_threshold: manual.outlier_zscore_threshold ?? 3,
    scale_numeric: manual.scale_numeric ?? false,
    filter_rules: (manual.filter_rules || []).map((rule) => ({
      column: rule.column,
      operator: rule.operator,
      value: String(rule.value ?? "")
    }))
  };
}

function AppIntegrated() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [cleanResult, setCleanResult] = useState(null);
  const [mode, setMode] = useState("auto");
  const [manualState, setManualState] = useState(createDefaultManualState());
  const [workflowName, setWorkflowName] = useState("");
  const [workflows, setWorkflows] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
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

  const currentRequest = useMemo(() => buildRequest(mode, manualState), [mode, manualState]);

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
  }, [analysis, cleanResult, workflows]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (activeModal) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activeModal]);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const result = await listWorkflows();
      setWorkflows(result.items || []);
    } catch {
      setWorkflows([]);
    }
  }

  async function handleAnalyze(selectedFile) {
    setFile(selectedFile);
    setError("");
    setStatusMessage("");
    setCleanResult(null);
    setIsLoading(true);

    try {
      const result = await analyzeDataset(selectedFile);
      setAnalysis(result);
      setMode("auto");
      setManualState(createDefaultManualState());
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
    setStatusMessage("");
    setIsLoading(true);
    try {
      const result = await cleanDataset(file, currentRequest);
      setCleanResult(result);
    setStatusMessage("تم تنفيذ التنظيف بنجاح.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveWorkflow() {
    if (!workflowName.trim()) {
      setError("Enter a workflow name first.");
      return;
    }
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      await saveWorkflow(workflowName, currentRequest);
      setWorkflowName("");
      await loadWorkflows();
      setStatusMessage("تم حفظ سير العمل بنجاح.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport(format) {
    if (!file) return;
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      await downloadDatasetFile(file, currentRequest, format);
      setStatusMessage(`تم تنزيل الملف بصيغة ${format === "excel" ? "Excel" : "CSV"}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReport() {
    if (!file) return;
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      await downloadReport(file, currentRequest);
      setStatusMessage("تم تنزيل تقرير PDF.");
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

  function toggleDropColumn(name) {
    setManualState((current) => ({
      ...current,
      drop_columns: current.drop_columns.includes(name)
        ? current.drop_columns.filter((item) => item !== name)
        : [...current.drop_columns, name]
    }));
  }

  function addFilterRule() {
    setManualState((current) => ({
      ...current,
      filter_rules: [...current.filter_rules, { column: "", operator: "equals", value: "" }]
    }));
  }

  function updateFilterRule(index, key, value) {
    setManualState((current) => ({
      ...current,
      filter_rules: current.filter_rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, [key]: value } : rule
      )
    }));
  }

  function removeFilterRule(index) {
    setManualState((current) => ({
      ...current,
      filter_rules: current.filter_rules.filter((_, ruleIndex) => ruleIndex !== index)
    }));
  }

  return (
    <div className="page-shell rtl-shell" dir="rtl" lang="ar">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero" data-reveal>
        <div className="hero-copy">
          <p className="eyebrow">SMART DATA CLEANER</p>
          <h1>نظّف بياناتك بذكاء واحترافية.</h1>
          <p className="hero-body">ارفع ملفاتك، حلل بياناتك، وجهزها للذكاء الاصطناعي بضغطة زر.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={handleClean} disabled={!analysis || isLoading}>
              {isLoading ? "جاري المعالجة..." : "تنظيف البيانات"}
            </button>
            <button className="secondary-button" onClick={() => setActiveModal("workflow")}>سير العمل</button>
          </div>
          <div className="mode-toggle premium-toggle" aria-label="Cleaning modes">
            <button className={mode === "auto" ? "mode-pill active" : "mode-pill"} onClick={() => setMode("auto")}>
              <span>Auto</span>
              <small>تنظيف تلقائي</small>
            </button>
            <button className={mode === "manual" ? "mode-pill active" : "mode-pill"} onClick={() => setMode("manual")}>
              <span>Manual</span>
              <small>تحكم يدوي</small>
            </button>
          </div>
        </div>

        <aside className="hero-panel">
          <div className="glass-card hero-preview">
            <p className="mini-label">المزايا</p>
            <ul className="stack-list">
              <li>رفع CSV و Excel بالسحب والإفلات.</li>
              <li>تنظيف تلقائي ويدوي من نفس الواجهة.</li>
              <li>حفظ خطواتك وإعادة استخدامها لاحقًا.</li>
              <li>تصدير ملفاتك وتقاريرك بسرعة.</li>
            </ul>
          </div>
          <div className="glass-card highlight-card">
            <span className="signal" />
            <p className="mini-label">الحالة</p>
            <h2>{statusMessage || "جاهز لرفع ملف وبدء التنظيف مباشرة."}</h2>
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
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} hidden />
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
          <p className="mini-label">الملف الحالي</p>
          <h2>{file ? file.name : "لم يتم اختيار ملف بعد"}</h2>
          <p>{error || "ارفع ملفًا لعرض التحليل والتنظيف والتصدير."}</p>
        </div>
      </section>

      <section className="feature-story-grid minimal-features">
        {FEATURE_STORIES.map((story, index) => (
          <article key={story.id} data-reveal className={`feature-story accent-${story.accent}`} style={{ transitionDelay: `${index * 80}ms` }}>
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
              <StatCard key={card.label} label={card.label} value={card.value} tone={card.tone} delay={index * 90} />
            ))}
          </section>

          <section className="dashboard-grid">
            <article className="glass-card dashboard-panel wide" data-reveal>
              <div className="panel-header">
                <div>
                  <p className="mini-label">نظرة عامة</p>
                  <h2>لوحة مختصرة وواضحة لنتائج التحليل.</h2>
                </div>
                <div className="inline-actions">
                  <button className="secondary-button" onClick={() => handleExport("csv")}>CSV</button>
                  <button className="secondary-button" onClick={() => handleExport("excel")}>Excel</button>
                  <button className="secondary-button" onClick={handleReport}>PDF</button>
                </div>
              </div>

              <div className="chips">
                {analysis.profile.summary.smart_suggestions.map((item) => (
                  <span key={item} className="chip chip-suggestion">{item}</span>
                ))}
              </div>

              <div className="insight-grid">
                <div className="insight-list">
                  <p className="mini-label">التنبيهات</p>
                  <ul className="stack-list">
                    {alerts.length ? alerts.map((alert) => (
                      <li key={`${alert.column}-${alert.text}`}><strong>{alert.column}:</strong> {alert.text}</li>
                    )) : <li>لا توجد تنبيهات حرجة في هذا الملف.</li>}
                  </ul>
                </div>
                <div className="target-card">
                  <p className="mini-label">الهدف المقترح</p>
                  <div className="chips">
                    {analysis.profile.summary.target_candidates.map((item) => (
                      <span key={item} className="chip">{item}</span>
                    ))}
                  </div>
                  <p className="muted-copy">يمكنك تحديد العمود الهدف وتطبيق الترميز والفلترة والتحجيم من الوضع اليدوي.</p>
                </div>
              </div>
            </article>

            <article className="glass-card dashboard-panel" data-reveal>
              <p className="mini-label">أتمتة العمليات</p>
              <h2>احفظ إعداداتك وطبّقها لاحقًا.</h2>
              <div className="workflow-editor">
                <input className="text-input" placeholder="اسم سير العمل" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
                <button className="primary-button" onClick={handleSaveWorkflow} disabled={!analysis || isLoading}>حفظ</button>
              </div>
              <div className="workflow-stack">
                {workflows.length ? workflows.slice(0, 4).map((workflow) => (
                  <button
                    key={workflow.workflow_id}
                    className="workflow-card"
                    onClick={() => {
                      setMode(workflow.request.mode);
                      setManualState(applyRequestToManualState(workflow.request));
                      setStatusMessage(`Applied workflow: ${workflow.name}`);
                    }}
                  >
                    <strong>{workflow.name}</strong>
                    <span>{new Date(workflow.created_at).toLocaleString()}</span>
                  </button>
                )) : <p className="muted-copy">لا توجد عمليات محفوظة بعد.</p>}
              </div>
            </article>
          </section>

          <section className="glass-card control-panel" data-reveal>
            <div className="panel-header">
              <div>
                <p className="mini-label">الوضع اليدوي</p>
                <h2>تحكم كامل بالتنظيف والتحويل والفلترة.</h2>
              </div>
            </div>

            <div className="control-grid">
              <div className="control-block">
                <label className="field-label">العمود الهدف</label>
                <select className="select-input" value={manualState.target_column} onChange={(event) => setManualState((current) => ({ ...current, target_column: event.target.value }))}>
                  <option value="">بدون تحديد</option>
                  {analysis.profile.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                </select>
              </div>
              <div className="control-block check-grid">
                <Toggle label="حذف الصفوف المكررة" checked={manualState.remove_duplicates} onChange={(checked) => setManualState((current) => ({ ...current, remove_duplicates: checked }))} />
                <Toggle label="تحويل الأعمدة الزمنية" checked={manualState.convert_datetimes} onChange={(checked) => setManualState((current) => ({ ...current, convert_datetimes: checked }))} />
                <Toggle label="ترميز الأعمدة النصية" checked={manualState.encode_categoricals} onChange={(checked) => setManualState((current) => ({ ...current, encode_categoricals: checked }))} />
                <Toggle label="إزالة القيم الشاذة" checked={manualState.remove_outliers} onChange={(checked) => setManualState((current) => ({ ...current, remove_outliers: checked }))} />
                <Toggle label="تحجيم الأعمدة الرقمية" checked={manualState.scale_numeric} onChange={(checked) => setManualState((current) => ({ ...current, scale_numeric: checked }))} />
              </div>
              <div className="control-block">
                <label className="field-label">معالجة الفراغات الرقمية</label>
                <select className="select-input" value={manualState.fill_numeric_strategy} onChange={(event) => setManualState((current) => ({ ...current, fill_numeric_strategy: event.target.value }))}>
                  <option value="median">Median</option>
                  <option value="mean">Mean</option>
                  <option value="zero">Zero</option>
                  <option value="none">Do nothing</option>
                </select>
              </div>
              <div className="control-block">
                <label className="field-label">معالجة الفراغات النصية</label>
                <select className="select-input" value={manualState.fill_text_strategy} onChange={(event) => setManualState((current) => ({ ...current, fill_text_strategy: event.target.value }))}>
                  <option value="mode">Mode</option>
                  <option value="constant">Constant</option>
                  <option value="none">Do nothing</option>
                </select>
              </div>
              <div className="control-block">
                <label className="field-label">القيمة النصية البديلة</label>
                <input className="text-input" value={manualState.text_constant} onChange={(event) => setManualState((current) => ({ ...current, text_constant: event.target.value }))} />
              </div>
              <div className="control-block">
                <label className="field-label">حد الصفوف الناقصة</label>
                <input className="text-input" type="number" step="0.05" min="0" max="1" value={manualState.drop_missing_rows_threshold} onChange={(event) => setManualState((current) => ({ ...current, drop_missing_rows_threshold: event.target.value }))} placeholder="0.4" />
              </div>
              <div className="control-block">
                <label className="field-label">حد القيم الشاذة</label>
                <input className="text-input" type="number" step="0.1" min="0" value={manualState.outlier_zscore_threshold} onChange={(event) => setManualState((current) => ({ ...current, outlier_zscore_threshold: event.target.value }))} />
              </div>
            </div>

            <div className="selection-section">
              <p className="mini-label">حذف الأعمدة</p>
              <div className="chips">
                {analysis.profile.columns.map((column) => (
                  <button key={column.name} className={manualState.drop_columns.includes(column.name) ? "chip chip-active" : "chip"} onClick={() => toggleDropColumn(column.name)}>
                    {column.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="selection-section">
              <div className="panel-header">
                <div>
                  <p className="mini-label">قواعد الفلترة</p>
                  <h3>فلترة الصفوف قبل التصدير أو التدريب.</h3>
                </div>
                <button className="secondary-button" onClick={addFilterRule}>إضافة</button>
              </div>
              <div className="filter-stack">
                {manualState.filter_rules.length ? manualState.filter_rules.map((rule, index) => (
                  <div key={index} className="filter-row">
                    <select className="select-input" value={rule.column} onChange={(event) => updateFilterRule(index, "column", event.target.value)}>
                      <option value="">العمود</option>
                      {analysis.profile.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                    </select>
                    <select className="select-input" value={rule.operator} onChange={(event) => updateFilterRule(index, "operator", event.target.value)}>
                      <option value="equals">يساوي</option>
                      <option value="not_equals">لا يساوي</option>
                      <option value="greater_than">أكبر من</option>
                      <option value="less_than">أصغر من</option>
                      <option value="contains">يحتوي</option>
                    </select>
                    <input className="text-input" value={rule.value} onChange={(event) => updateFilterRule(index, "value", event.target.value)} placeholder="القيمة" />
                    <button className="secondary-button" onClick={() => removeFilterRule(index)}>حذف</button>
                  </div>
                )) : <p className="muted-copy">لا توجد قواعد فلترة بعد.</p>}
              </div>
            </div>
          </section>

          <section className="table-section glass-card" data-reveal>
            <div className="panel-header">
              <div>
                <p className="mini-label">تحليل الأعمدة</p>
                <h2>تشخيص واضح ومباشر لكل عمود.</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>العمود</th>
                    <th>النوع</th>
                    <th>الفراغ %</th>
                    <th>التفرد %</th>
                    <th>التوزيع</th>
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
              <p className="mini-label">قبل التنظيف</p>
              <h2>معاينة مباشرة للبيانات الأصلية.</h2>
              <DatasetTable rows={analysis.preview_before} />
            </article>
            {cleanResult ? (
              <article className="glass-card preview-panel">
                <p className="mini-label">بعد التنظيف</p>
                <h2>مقارنة سريعة وواضحة بعد المعالجة.</h2>
                <DatasetTable rows={cleanResult.preview_after} />
              </article>
            ) : (
              <article className="glass-card preview-panel empty-state-panel">
                <p className="mini-label">بعد التنظيف</p>
                <h2>ستظهر المعاينة هنا بعد التنفيذ.</h2>
                <p className="muted-copy">شغّل الوضع التلقائي أو اليدوي لعرض الفرق الكامل.</p>
              </article>
            )}
          </section>

          {cleanResult ? (
            <section className="glass-card execution-panel" data-reveal>
              <div className="panel-header">
                <div>
                  <p className="mini-label">سجل التنفيذ</p>
                  <h2>الخطوات المطبقة على البيانات.</h2>
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
          <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setActiveModal("")}>X</button>
            <p className="eyebrow">سير العمل</p>
            <h2>احفظه مرة وطبّقه متى شئت.</h2>
            <ul className="stack-list">
              <li>حفظ خطوات التنظيف محليًا داخل التطبيق.</li>
              <li>إعادة تطبيقها على الملفات القادمة من نفس اللوحة.</li>
              <li>الإبقاء على التصدير والتقارير في نفس المكان.</li>
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

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
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
            {keys.map((key) => <th key={key}>{key}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {keys.map((key) => <td key={`${index}-${key}`}>{String(row[key] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AppIntegrated;
