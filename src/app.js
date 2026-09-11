import {
  FIELD_LABELS,
  REQUIRED_FIELDS,
  parseCsv,
  parseJson,
  prepareExport,
  serializeCsv,
  validateMetadata,
  validateRecords,
} from "./data-validation.js";

const state = { records: [], validation: null, fileName: "" };
const $ = (selector) => document.querySelector(selector);

const metadataFields = ["source_name", "source_url", "publication_date", "retrieved_at"];
const metadata = () => Object.fromEntries(metadataFields.map((field) => [field, $(`#${field}`).value]));

function setStatus(message, type = "neutral") {
  const element = $("#import-status");
  element.textContent = message;
  element.dataset.type = type;
}

function renderSummary() {
  const summary = state.validation?.summary ?? { loaded: 0, valid: 0, errors: 0, warnings: 0 };
  $("#loaded-count").textContent = summary.loaded;
  $("#valid-count").textContent = summary.valid;
  $("#error-count").textContent = summary.errors;
  $("#warning-count").textContent = summary.warnings;
  $("#export-prepared").disabled = !state.validation || summary.errors > 0 || summary.valid === 0;
  $("#export-manifest").disabled = !state.validation;
}

function renderIssues() {
  const body = $("#issues-body");
  body.replaceChildren();
  const issues = state.validation?.issues ?? [];
  if (issues.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty">No issues detected yet. Import a CSV or JSON file to begin.</td>';
    body.append(row);
    return;
  }
  for (const current of issues.slice(0, 100)) {
    const row = document.createElement("tr");
    const cells = [
      current.severity,
      current.rowIndex === null ? "Metadata" : String(current.rowIndex + 1),
      current.field ? FIELD_LABELS[current.field] ?? current.field : "—",
      current.message,
    ];
    for (const value of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    row.firstChild.className = current.severity;
    body.append(row);
  }
}

function renderPreview() {
  const head = $("#preview-head");
  const body = $("#preview-body");
  head.replaceChildren();
  body.replaceChildren();
  const records = state.validation?.rows.map(({ record }) => record) ?? [];
  const fields = [...new Set(records.flatMap((record) => Object.keys(record)))].slice(0, 12);
  if (fields.length === 0) {
    body.innerHTML = '<tr><td class="empty">Your imported records will appear here.</td></tr>';
    return;
  }
  const headerRow = document.createElement("tr");
  for (const field of fields) {
    const cell = document.createElement("th");
    cell.textContent = FIELD_LABELS[field] ?? field;
    headerRow.append(cell);
  }
  head.append(headerRow);
  for (const record of records.slice(0, 20)) {
    const row = document.createElement("tr");
    for (const field of fields) {
      const cell = document.createElement("td");
      cell.textContent = record[field] ?? "";
      row.append(cell);
    }
    body.append(row);
  }
}

function runValidation() {
  const metadataIssues = validateMetadata(metadata());
  state.validation = validateRecords(state.records);
  state.validation.issues.unshift(...metadataIssues);
  state.validation.summary.errors += metadataIssues.filter(({ severity }) => severity === "error").length;
  state.validation.summary.warnings += metadataIssues.filter(({ severity }) => severity === "warning").length;
  renderSummary();
  renderIssues();
  renderPreview();
}

function download(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    state.records = file.name.toLowerCase().endsWith(".json") ? parseJson(text) : parseCsv(text);
    state.fileName = file.name;
    runValidation();
    setStatus(`${state.records.length} records loaded from ${file.name}.`, "success");
  } catch (error) {
    state.records = [];
    state.validation = null;
    renderSummary();
    renderIssues();
    renderPreview();
    setStatus(error.message, "error");
  }
}

$("#data-file").addEventListener("change", (event) => importFile(event.target.files[0]));
for (const field of metadataFields) $(`#${field}`).addEventListener("input", runValidation);
$("#recheck").addEventListener("click", runValidation);
$("#export-prepared").addEventListener("click", () => {
  download("prepared-pfas-records.csv", serializeCsv(prepareExport(state.validation)), "text/csv;charset=utf-8");
});
$("#export-manifest").addEventListener("click", () => {
  const manifest = {
    ...metadata(),
    input_file: state.fileName || null,
    fields_expected: REQUIRED_FIELDS,
    record_count_loaded: state.validation?.summary.loaded ?? 0,
    record_count_exportable: prepareExport(state.validation ?? { rows: [] }).length,
    generated_at: new Date().toISOString(),
  };
  download("prepared-pfas-manifest.json", JSON.stringify(manifest, null, 2), "application/json");
});

$("#retrieved_at").value = new Date().toISOString().slice(0, 10);
runValidation();
