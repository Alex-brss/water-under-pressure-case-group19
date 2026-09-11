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

async function checkEurostat() {
  const status = $("#eurostat-status");
  status.textContent = "Checking the public Eurostat API…";
  status.dataset.type = "neutral";
  try {
    const endpoint = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/tgs00024?geo=DE";
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Eurostat returned HTTP ${response.status}.`);
    const payload = await response.json();
    const count = Array.isArray(payload.value) ? payload.value.length : Object.keys(payload.value ?? {}).length;
    status.textContent = `Live Eurostat response received for Germany: ${count} population-density observations. No API key used.`;
    status.dataset.type = "success";
  } catch (error) {
    status.textContent = `Eurostat could not be reached from this browser: ${error.message}`;
    status.dataset.type = "error";
  }
}

async function loadWise() {
  const status = $("#wise-status");
  status.textContent = "Loading official WISE observations…";
  status.dataset.type = "neutral";
  const query = "select countryCode, monitoringSiteName, phenomenonTimeReferenceYear, resultMeanValue, resultUom, lat, lon from [WISE_Indicators].[v6r1].[AggregatedData_Pesticides] where countryCode = 'DE' and phenomenonTimeReferenceYear = 2023";
  try {
    const byWaterBodyQuery = "select countryCode, phenomenonTimeReferenceYear, resultMeanValue, resultUom, lat, lon from [WISE_Indicators].[v6r1].[AggregatedDataByWaterBody] where countryCode = 'DE' and phenomenonTimeReferenceYear = 2023";
    const urls = [query, byWaterBodyQuery].map((item) => `https://discodata.eea.europa.eu/sql?query=${encodeURIComponent(item)}&p=1&nrOfHits=1000`);
    const responses = await Promise.all(urls.map((url) => fetch(url, { headers: { Accept: "application/json" } })));
    if (responses.some((response) => !response.ok)) throw new Error("WISE returned an HTTP error.");
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (payloads.some((payload) => payload.errors?.length)) throw new Error("WISE returned a query error.");
    const fields = ["countryCode", "monitoringSiteName", "phenomenonTimeReferenceYear", "resultMeanValue", "resultUom", "lat", "lon"];
    const rows = [
      ...(payloads[0].results ?? []).map((record) => ({ ...record, wiseTable: "AggregatedData_Pesticides" })),
      ...(payloads[1].results ?? []).map((record) => ({ ...record, monitoringSiteName: "no data is available", wiseTable: "AggregatedDataByWaterBody" })),
    ].filter((record) => record.countryCode === "DE" && record.phenomenonTimeReferenceYear === 2023 &&
      (record.resultMeanValue === null || Number.isFinite(Number(record.resultMeanValue))) &&
      Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lon)));
    const head = $("#wise-head");
    const body = $("#wise-body");
    head.replaceChildren(); body.replaceChildren();
    const header = document.createElement("tr");
    fields.forEach((field) => { const cell = document.createElement("th"); cell.textContent = field; header.append(cell); });
    head.append(header);
    rows.slice(0, 200).forEach((record) => {
      const row = document.createElement("tr");
      fields.forEach((field) => { const cell = document.createElement("td"); cell.textContent = record[field] === null || record[field] === undefined || record[field] === "" ? "no data is available" : String(record[field]); row.append(cell); });
      body.append(row);
    });
    status.textContent = rows.length ? `Loaded ${rows.length} coherent official Germany/2023 WISE observations from both tables (showing up to 200).` : "No data is available for Germany in 2023.";
    status.dataset.type = "success";
  } catch (error) {
    status.textContent = `WISE could not be reached: ${error.message}`;
    status.dataset.type = "error";
  }
}

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
$("#load-eurostat").addEventListener("click", checkEurostat);
$("#load-wise").addEventListener("click", loadWise);
for (const field of metadataFields) $(`#${field}`).addEventListener("input", runValidation);
$("#recheck").addEventListener("click", runValidation);
$("#export-prepared").addEventListener("click", () => {
  download("prepared-german-water-records.csv", serializeCsv(prepareExport(state.validation)), "text/csv;charset=utf-8");
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
