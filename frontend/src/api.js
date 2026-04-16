const API_BASE = "/api";

export async function analyzeDataset(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/datasets/analyze`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Failed to analyze dataset.");
  }

  return response.json();
}

export async function cleanDataset(file, payload) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("request_json", JSON.stringify(payload));

  const response = await fetch(`${API_BASE}/datasets/clean`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Failed to clean dataset.");
  }

  return response.json();
}

export async function listWorkflows() {
  const response = await fetch(`${API_BASE}/workflows`);
  if (!response.ok) {
    throw new Error("Failed to load workflows.");
  }
  return response.json();
}

export async function saveWorkflow(name, request) {
  const response = await fetch(`${API_BASE}/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, request })
  });

  if (!response.ok) {
    throw new Error("Failed to save workflow.");
  }

  return response.json();
}

export async function downloadDatasetFile(file, payload, format) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("request_json", JSON.stringify(payload));

  const response = await fetch(`${API_BASE}/datasets/export/${format}`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Failed to export dataset.");
  }

  const blob = await response.blob();
  const filename = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `dataset.${format === "excel" ? "xlsx" : "csv"}`;
  triggerDownload(blob, filename);
}

export async function downloadReport(file, payload) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("request_json", JSON.stringify(payload));

  const response = await fetch(`${API_BASE}/datasets/report`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("Failed to generate report.");
  }

  const blob = await response.blob();
  triggerDownload(blob, "cleaning_report.pdf");
}

function triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
