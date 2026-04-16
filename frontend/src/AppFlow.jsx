import { useEffect, useMemo, useState } from "react";
import {
  analyzeDataset,
  cleanDataset,
  downloadDatasetFile,
  downloadReport,
  listWorkflows,
  saveWorkflow
} from "./api";

const FEATURES = [
  { icon: "⊕", title: "رفع ملفات متعددة", text: "أضف أكثر من ملف وانتقل بينها من نفس الواجهة قبل بدء التنظيف." },
  { icon: "◌", title: "التحليل التلقائي", text: "اكتشاف فوري لأنواع البيانات، القيم المفقودة، والتكرار." },
  { icon: "✦", title: "التنظيف الذكي", text: "تنظيف تلقائي أو يدوي للقيم الفارغة والتكرار والأعمدة غير الضرورية." },
  { icon: "⌁", title: "تصدير الملفات", text: "تنزيل البيانات بعد التنظيف بصيغ CSV وExcel مباشرة من نفس الواجهة." },
  { icon: "◳", title: "أتمتة العمليات", text: "حفظ خطوات التنظيف لتطبيقها تلقائياً على الملفات المستقبلية." },
  { icon: "□", title: "تصدير التقارير", text: "ملخص PDF تفصيلي لكل التعديلات والإحصائيات التي تمت." },
  { icon: "↗", title: "دعم الـ API", text: "ربط مباشر للمنصة مع مشاريعك وتطبيقاتك الخارجية." }
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

function areAllTogglesEnabled(state) {
  return [
    state.remove_duplicates,
    state.convert_datetimes,
    state.encode_categoricals,
    state.remove_outliers,
    state.scale_numeric
  ].every(Boolean);
}

function buildRequest(mode, manualState) {
  return {
    mode,
    manual: {
      ...manualState,
      target_column: manualState.target_column || null,
      drop_missing_rows_threshold:
        manualState.drop_missing_rows_threshold === "" ? null : Number(manualState.drop_missing_rows_threshold),
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

function AppFlow() {
  const [hasStarted, setHasStarted] = useState(false);
  const [introClosing, setIntroClosing] = useState(false);
  const [file, setFile] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [cleanResult, setCleanResult] = useState(null);
  const [mode, setMode] = useState("");
  const [manualState, setManualState] = useState(createDefaultManualState());
  const [workflowName, setWorkflowName] = useState("");
  const [workflows, setWorkflows] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const currentRequest = useMemo(() => buildRequest(mode || "auto", manualState), [mode, manualState]);

  const stats = useMemo(() => {
    if (!analysis) return [];
    const summary = cleanResult ? cleanResult.profile_after.summary : analysis.profile.summary;
    return [
      { label: "Rows", value: summary.rows },
      { label: "Columns", value: summary.columns },
      { label: "Missing Data", value: summary.missing_cells },
      { label: "Duplicate Data", value: summary.duplicate_rows }
    ];
  }, [analysis, cleanResult]);

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

  function startApp() {
    setIntroClosing(true);
    setTimeout(() => {
      setHasStarted(true);
      setIntroClosing(false);
    }, 650);
  }

  async function handleAnalyze(selectedFile) {
    setFile(selectedFile);
    setError("");
    setStatusMessage("");
    setCleanResult(null);
    setMode("");
    setManualState(createDefaultManualState());
    setIsLoading(true);
    try {
      const result = await analyzeDataset(selectedFile);
      setAnalysis(result);
      const paymentMethodColumn = result.profile.columns.find(
        (column) => column.name.trim().toLowerCase() === "payment method"
      );
      if (paymentMethodColumn) {
        setManualState((current) => ({
          ...createDefaultManualState(),
          drop_columns: [paymentMethodColumn.name]
        }));
      }
      setStatusMessage("تم رفع الملف وتحليل البيانات بنجاح.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsDragging(false);
    }
  }

  function mergeFiles(nextFiles) {
    setUploadedFiles((current) => {
      const existingKeys = new Set(current.map((item) => `${item.name}-${item.size}-${item.lastModified}`));
      const additions = nextFiles.filter((item) => !existingKeys.has(`${item.name}-${item.size}-${item.lastModified}`));
      return [...current, ...additions];
    });
  }

  function handleFileBatch(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    mergeFiles(files);
    handleAnalyze(files[0]);
  }

  function resetFiles() {
    setFile(null);
    setUploadedFiles([]);
    setAnalysis(null);
    setCleanResult(null);
    setMode("");
    setManualState(createDefaultManualState());
    setWorkflowName("");
    setStatusMessage("");
    setError("");
  }

  async function handleClean() {
    if (!file || !analysis) return;
    if (!mode) {
      setError("يرجى اختيار الوضع التلقائي أو اليدوي أولاً.");
      return;
    }
    setError("");
    setStatusMessage("");
    setIsLoading(true);
    try {
      const result = await cleanDataset(file, currentRequest);
      setCleanResult(result);
      setStatusMessage("تم تنظيف البيانات بنجاح.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveWorkflow() {
    if (!workflowName.trim()) {
      setError("يرجى كتابة اسم لإعدادات التخصيص.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      await saveWorkflow(workflowName, currentRequest);
      setWorkflowName("");
      await loadWorkflows();
      setStatusMessage("تم حفظ اعدادات التخصيص.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport(format) {
    if (!file) return;
    setError("");
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

  function toggleAllManualOptions(checked) {
    setManualState((current) => ({
      ...current,
      remove_duplicates: checked,
      convert_datetimes: checked,
      encode_categoricals: checked,
      remove_outliers: checked,
      scale_numeric: checked
    }));
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFileBatch(event.dataTransfer.files);
  }

  return (
    <div className="page-shell rtl-shell app-flow" dir="rtl" lang="ar">
      {!hasStarted ? (
        <section className={introClosing ? "start-screen exiting" : "start-screen"}>
          <div className="start-card">
            <p className="eyebrow">SMART DATA CLEANER</p>
            <h1>
              مرحبا بك في ROUTE AI
              <span>حيث الدقة والذكاء والاحترافية</span>
            </h1>
            <p className="hero-body">منصة ذكية لتنظيف البيانات وتحليلها وتجهيزها بخطوات واضحة وسريعة.</p>
            <button className="primary-button start-button" onClick={startApp}>ابدأ رحلتك</button>
          </div>
        </section>
      ) : null}

      <main className={hasStarted ? `flow-content visible${analysis ? "" : " pre-upload"}` : "flow-content"}>
        <section className="upload-stage glass-card">
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
              multiple
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                handleFileBatch(event.target.files);
              }}
              hidden
            />
            <label htmlFor="file-input" className="dropzone-content">
              <span className="dropzone-icon">+</span>
              <div>
                <strong>ضع الملف هنا أو اضغط للاختيار</strong>
                <p>يدعم CSV و Excel مع السحب والإفلات وإضافة أكثر من ملف.</p>
              </div>
            </label>
            <div className="dropzone-glow" />
          </div>
          <div className="upload-meta">
            <p className="mini-label">حالة الملف</p>
            <h2>{file ? file.name : "لم يتم اختيار ملف بعد"}</h2>
            <p>{error || statusMessage || "ابدأ برفع ملف لتحليل البيانات."}</p>
            {uploadedFiles.length ? (
              <div className="selection-section uploaded-files-section">
                <div className="panel-header">
                  <p className="mini-label">الملفات المضافة</p>
                  <button type="button" className="secondary-button reset-files-button" onClick={resetFiles}>
                    إعادة ضبط الملفات
                  </button>
                </div>
                <div className="chips">
                  {uploadedFiles.map((item) => (
                    <button
                      key={`${item.name}-${item.size}-${item.lastModified}`}
                      className={file && item.name === file.name && item.size === file.size ? "chip chip-active" : "chip"}
                      onClick={() => handleAnalyze(item)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {analysis ? (
          <>
            <section className="glass-card mode-stage">
              <div className="stage-heading">
                <p className="mini-label">اختيار الوضع</p>
                <h2>حدد طريقة التنظيف المناسبة لملفك.</h2>
              </div>
              <div className="mode-toggle premium-toggle">
                <button className={mode === "auto" ? "mode-pill active" : "mode-pill"} onClick={() => setMode("auto")}>
                  <span>Auto</span>
                  <small>تنظيف تلقائي كامل</small>
                </button>
                <button className={mode === "manual" ? "mode-pill active" : "mode-pill"} onClick={() => setMode("manual")}>
                  <span>Manual</span>
                  <small>تحكم يدوي تفصيلي</small>
                </button>
              </div>
            </section>

            {mode ? (
              <>
                <div className="stats-header">
                  <p className="mini-label">الإحصائيات</p>
                  <h3>{cleanResult ? "البيانات بعد التنظيف" : "البيانات قبل التنظيف"}</h3>
                </div>
                <section className="stats-grid compact-stats">
                  {stats.map((card) => (
                    <article key={card.label} className="stat-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </article>
                  ))}
                </section>
              </>
            ) : null}

            {mode === "auto" ? (
              <section className="glass-card save-panel">
                <div className="panel-header">
                  <div>
                    <p className="mini-label">حفظ الإعدادات</p>
                    <h3>احفظ إعدادات الوضع التلقائي لتستخدمها لاحقًا</h3>
                    <p className="field-help">يمكنك حفظ هذا الإعداد الحالي ثم إعادة تطبيقه لاحقًا بضغطة واحدة</p>
                  </div>
                </div>
                <div className="workflow-editor">
                  <input className="text-input" placeholder="اسم الإعدادات" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
                  <button className="primary-button" onClick={handleSaveWorkflow} disabled={isLoading}>حفظ الإعدادات</button>
                </div>
                <div className="workflow-stack">
                  {workflows.length ? workflows.slice(0, 4).map((workflow) => (
                    <button
                      key={workflow.workflow_id}
                      className="workflow-card"
                      onClick={() => {
                        setMode(workflow.request.mode);
                        setManualState(applyRequestToManualState(workflow.request));
                        setStatusMessage(`تم تطبيق الإعدادات: ${workflow.name}`);
                      }}
                    >
                      <strong>{workflow.name}</strong>
                      <span>{new Date(workflow.created_at).toLocaleString()}</span>
                    </button>
                  )) : <p className="muted-copy">لا توجد إعدادات محفوظة بعد.</p>}
                </div>
              </section>
            ) : null}

            {mode === "manual" ? (
              <section className="glass-card control-panel">
                <div className="stage-heading">
                  <p className="mini-label">التحكم اليدوي</p>
                  <h2>خصص خطوات التنظيف كما تريد</h2>
                  <p className="section-help">عدّل الخيارات التالية لتحديد طريقة تنظيف بياناتك</p>
                </div>

                <div className="control-grid">
                  <div className="control-block">
                    <label className="field-label">العمود الهدف</label>
                    <p className="field-help">اختر العمود الرئيسي الذي تريد التنبؤ به أو الاحتفاظ به كمخرج نهائي</p>
                    <select className="select-input" value={manualState.target_column} onChange={(event) => setManualState((current) => ({ ...current, target_column: event.target.value }))}>
                      <option value="">بدون تحديد</option>
                      {analysis.profile.columns.map((column) => (
                        <option key={column.name} value={column.name}>{column.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="control-block check-grid">
                    <label className="select-all-toggle inline-select-all">
                      <span>تحديد الكل</span>
                      <input
                        type="checkbox"
                        checked={areAllTogglesEnabled(manualState)}
                        onChange={(event) => toggleAllManualOptions(event.target.checked)}
                      />
                    </label>
                    <Toggle label="حذف الصفوف المكررة" description="يزيل الصفوف المتكررة من البيانات" checked={manualState.remove_duplicates} onChange={(checked) => setManualState((current) => ({ ...current, remove_duplicates: checked }))} />
                    <Toggle label="تحويل الأعمدة الزمنية" description="يحوّل النصوص التي تشبه التواريخ إلى تواريخ فعلية" checked={manualState.convert_datetimes} onChange={(checked) => setManualState((current) => ({ ...current, convert_datetimes: checked }))} />
                    <Toggle label="ترميز الأعمدة النصية" description="يحوّل الفئات النصية إلى قيم رقمية" checked={manualState.encode_categoricals} onChange={(checked) => setManualState((current) => ({ ...current, encode_categoricals: checked }))} />
                    <Toggle label="إزالة القيم الشاذة" description="يحذف القيم غير الطبيعية البعيدة عن النمط العام" checked={manualState.remove_outliers} onChange={(checked) => setManualState((current) => ({ ...current, remove_outliers: checked }))} />
                    <Toggle label="تحجيم الأعمدة الرقمية" description="يجعل القيم الرقمية على نطاق متقارب" checked={manualState.scale_numeric} onChange={(checked) => setManualState((current) => ({ ...current, scale_numeric: checked }))} />
                  </div>

                  <div className="control-block">
                    <label className="field-label">معالجة الفراغات الرقمية</label>
                    <p className="field-help">اختر طريقة تعبئة الخلايا الرقمية الفارغة</p>
                    <select className="select-input" value={manualState.fill_numeric_strategy} onChange={(event) => setManualState((current) => ({ ...current, fill_numeric_strategy: event.target.value }))}>
                      <option value="median">Median</option>
                      <option value="mean">Mean</option>
                      <option value="zero">Zero</option>
                      <option value="none">None</option>
                    </select>
                  </div>

                  <div className="control-block">
                    <label className="field-label">معالجة الفراغات النصية</label>
                    <p className="field-help">اختر طريقة تعبئة الخلايا النصية الفارغة</p>
                    <select className="select-input" value={manualState.fill_text_strategy} onChange={(event) => setManualState((current) => ({ ...current, fill_text_strategy: event.target.value }))}>
                      <option value="mode">Mode</option>
                      <option value="constant">Constant</option>
                      <option value="none">None</option>
                    </select>
                  </div>

                  <div className="control-block">
                    <label className="field-label">القيمة البديلة</label>
                    <p className="field-help">تُستخدم فقط عند اختيار قيمة ثابتة للنصوص الفارغة</p>
                    <input className="text-input" value={manualState.text_constant} onChange={(event) => setManualState((current) => ({ ...current, text_constant: event.target.value }))} />
                  </div>

                  <div className="control-block">
                    <label className="field-label">حد الصفوف الناقصة</label>
                    <p className="field-help">يحذف الصفوف التي تحتوي على عدد كبير من القيم الناقصة</p>
                    <input className="text-input" type="number" step="0.05" min="0" max="1" value={manualState.drop_missing_rows_threshold} onChange={(event) => setManualState((current) => ({ ...current, drop_missing_rows_threshold: event.target.value }))} placeholder="0.4" />
                  </div>

                  <div className="control-block">
                    <label className="field-label">حد القيم الشاذة</label>
                    <p className="field-help">الرقم الأكبر يبقي صفوفًا أكثر والرقم الأصغر يحذف قيماً شاذة أكثر</p>
                    <input className="text-input" type="number" step="0.1" min="0" value={manualState.outlier_zscore_threshold} onChange={(event) => setManualState((current) => ({ ...current, outlier_zscore_threshold: event.target.value }))} />
                  </div>
                </div>

                <div className="selection-section">
                  <p className="mini-label">الأعمدة المحذوفة</p>
                  <p className="field-help">اختر الأعمدة التي تريد حذفها بالكامل من البيانات</p>
                  <div className="chips">
                    {analysis.profile.columns.map((column) => (
                      <button key={column.name} className={manualState.drop_columns.includes(column.name) ? "chip chip-active" : "chip"} onClick={() => toggleDropColumn(column.name)}>
                        {column.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="selection-section">
                  <p className="mini-label">الهدف المقترح</p>
                  <p className="field-help">هذه أعمدة يقترحها النظام كهدف، ويمكنك حذف الأعمدة الأخرى إذا كانت غير مهمة.</p>
                  <div className="chips">
                    {analysis.profile.summary.target_candidates.map((item) => (
                      <span key={item} className="chip">{item}</span>
                    ))}
                  </div>
                </div>

                <div className="selection-section">
                  <div className="panel-header">
                    <div>
                      <p className="mini-label">الفلترة</p>
                      <h3>إضافة شروط مخصصة على الصفوف.</h3>
                      <p className="field-help">احتفظ فقط بالصفوف التي تطابق الشروط التي تضيفها هنا</p>
                    </div>
                    <button className="secondary-button" onClick={addFilterRule}>إضافة</button>
                  </div>
                  <div className="filter-stack">
                    {manualState.filter_rules.length ? manualState.filter_rules.map((rule, index) => (
                      <div key={index} className="filter-row">
                        <select className="select-input" value={rule.column} onChange={(event) => updateFilterRule(index, "column", event.target.value)}>
                          <option value="">العمود</option>
                          {analysis.profile.columns.map((column) => (
                            <option key={column.name} value={column.name}>{column.name}</option>
                          ))}
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

                <div className="selection-section workflow-panel">
                  <div className="panel-header">
                    <div>
                      <p className="mini-label">حفظ اعدادات التخصيص</p>
                      <h3>احفظ إعدادات التحكم اليدوي وطبّقها لاحقًا.</h3>
                      <p className="field-help">احفظ هذه الإعدادات اليدوية لتعيد استخدامها لاحقًا بضغطة واحدة</p>
                    </div>
                  </div>
                  <div className="workflow-editor">
                    <input className="text-input" placeholder="اسم الإعدادات" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
                    <button className="primary-button" onClick={handleSaveWorkflow} disabled={isLoading}>حفظ اعدادات التخصيص</button>
                  </div>
                  <div className="workflow-stack">
                    {workflows.length ? workflows.slice(0, 4).map((workflow) => (
                      <button
                        key={workflow.workflow_id}
                        className="workflow-card"
                        onClick={() => {
                          setMode(workflow.request.mode);
                          setManualState(applyRequestToManualState(workflow.request));
                          setStatusMessage(`تم تطبيق اعدادات التخصيص: ${workflow.name}`);
                        }}
                      >
                        <strong>{workflow.name}</strong>
                        <span>{new Date(workflow.created_at).toLocaleString()}</span>
                      </button>
                    )) : <p className="muted-copy">لا توجد إعدادات محفوظة بعد.</p>}
                  </div>
                </div>
              </section>
            ) : null}

            {mode ? (
              <section className="post-clean-layout">
                <article className="glass-card preview-panel preview-panel-large">
                  <p className="mini-label">المعاينة</p>
                  <h2>{cleanResult ? "البيانات بعد التنظيف" : "البيانات قبل التنظيف"}</h2>
                  <DatasetTable rows={cleanResult ? cleanResult.preview_after : analysis.preview_before} />
                  {!cleanResult ? (
                    <div className="clean-action-bar">
                      <button className="primary-button large-clean-button" onClick={handleClean} disabled={isLoading}>
                        {isLoading ? "جاري التنظيف..." : "بدء التنظيف"}
                      </button>
                    </div>
                  ) : null}
                </article>

                <article className="glass-card result-side-panel">
                  <p className="mini-label">تنزيل الملف</p>
                  {cleanResult ? (
                    <>
                      <div className="workflow-stack">
                        <button className="secondary-button" onClick={() => handleExport("csv")}>تنزيل CSV</button>
                        <button className="secondary-button" onClick={() => handleExport("excel")}>تنزيل Excel</button>
                        <button className="secondary-button" onClick={handleReport}>تنزيل PDF</button>
                      </div>
                    </>
                  ) : (
                    <p className="muted-copy">ابدأ التنظيف أولاً لتفعيل تنزيل الملف والتقرير.</p>
                  )}
                </article>
              </section>
            ) : null}
          </>
        ) : null}

        <section className="feature-story-grid minimal-features features-last">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-story glass-card">
              <p className="eyebrow">{feature.icon}</p>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-copy">
        <span className="toggle-title">{label}</span>
        {description ? <span className="toggle-help">{description}</span> : null}
      </span>
    </label>
  );
}

function DatasetTable({ rows }) {
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const keys = Object.keys(rows[0] || {});

  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (!rows.length || !keys.length) {
    return <p className="muted-copy">لا توجد بيانات للمعاينة.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleRows = rows.slice(startIndex, startIndex + pageSize);

  return (
    <>
      <div className="table-meta">
        <span>إجمالي الصفوف: {rows.length}</span>
        <span>الصفحة {safePage} من {totalPages}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {keys.map((key) => <th key={key}>{key}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={startIndex + index}>
                {keys.map((key) => <td key={`${startIndex + index}-${key}`}>{String(row[key] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default AppFlow;

