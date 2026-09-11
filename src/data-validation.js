export const REQUIRED_FIELDS = [
  "record_id",
  "country",
  "latitude",
  "longitude",
  "sample_date",
  "analyte",
  "concentration",
  "unit",
  "matrix",
  "source_url",
];

export const FIELD_LABELS = {
  record_id: "Record ID",
  country: "Country",
  water_source_id: "Water source ID",
  water_source_name: "Water source name",
  latitude: "Latitude",
  longitude: "Longitude",
  sample_date: "Sample date",
  analyte: "Analyte",
  concentration: "Concentration",
  unit: "Unit",
  matrix: "Matrix",
  population_density: "Population density (people/km²)",
  upstream_rivers: "Upstream rivers",
  downstream_rivers: "Downstream rivers",
  directly_connected_lakes_reservoirs: "Directly connected lakes/reservoirs",
  connected_water_bodies: "Connected water bodies",
  source_url: "Record source URL",
};

const HEADER_ALIASES = {
  id: "record_id",
  record: "record_id",
  recordid: "record_id",
  lat: "latitude",
  latitude_dd: "latitude",
  lon: "longitude",
  lng: "longitude",
  longitude_dd: "longitude",
  date: "sample_date",
  sampling_date: "sample_date",
  parameter: "analyte",
  determinand: "analyte",
  value: "concentration",
  concentration_value: "concentration",
  unit_of_measure: "unit",
  sample_matrix: "matrix",
  source_id: "water_source_id",
  waterbody_id: "water_source_id",
  water_source: "water_source_name",
  population_density_per_km2: "population_density",
  connected_lakes: "directly_connected_lakes_reservoirs",
  url: "source_url",
};

const GERMANY_BOUNDS = { minLat: 47, maxLat: 55.2, minLon: 5.5, maxLon: 15.5 };

export function normalizeHeader(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return HEADER_ALIASES[normalized] ?? normalized;
}

export function normalizeRecord(record) {
  const normalized = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    const field = normalizeHeader(key);
    if (!field || field in normalized) continue;
    normalized[field] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text ?? "").replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values) =>
    headers.reduce((record, header, columnIndex) => {
      if (header) record[header] = values[columnIndex] ?? "";
      return record;
    }, {}),
  );
}

export function parseJson(text) {
  const parsed = JSON.parse(String(text ?? ""));
  const records = Array.isArray(parsed) ? parsed : parsed?.records;
  if (!Array.isArray(records)) {
    throw new Error("JSON must contain an array of records or a records array property.");
  }
  return records.map(normalizeRecord);
}

function issue(code, severity, message, rowIndex = null, field = null) {
  return { code, severity, message, rowIndex, field };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isGermany(value) {
  return ["de", "deu", "germany", "deutschland"].includes(String(value ?? "").trim().toLowerCase());
}

function nonNegativeInteger(value) {
  return /^\\d+$/.test(String(value ?? "").trim());
}

export function validateMetadata(metadata = {}) {
  const issues = [];
  if (!String(metadata.source_name ?? "").trim()) {
    issues.push(issue("metadata-source-name", "error", "Add the official dataset or publisher name."));
  }
  const sourceUrl = String(metadata.source_url ?? "").trim();
  if (!sourceUrl) {
    issues.push(issue("metadata-source-url", "error", "Add the official landing page or download URL."));
  } else if (!/^https:\/\//i.test(sourceUrl)) {
    issues.push(issue("metadata-source-url-scheme", "error", "Use an HTTPS source URL."));
  }
  for (const field of ["publication_date", "retrieved_at"]) {
    const value = String(metadata[field] ?? "").trim();
    if (value && !isValidDate(value)) {
      issues.push(issue(`metadata-${field}`, "error", `${field.replace("_", " ")} must use YYYY-MM-DD.`));
    }
  }
  return issues;
}

export function validateRecords(records = []) {
  const normalizedRecords = records.map(normalizeRecord);
  const seenIds = new Map();
  const rows = normalizedRecords.map((record, index) => {
    const rowIssues = [];
    for (const field of REQUIRED_FIELDS) {
      if (String(record[field] ?? "").trim() === "" && field !== "concentration") {
        rowIssues.push(issue("missing-required-field", "error", `${FIELD_LABELS[field]} is required.`, index, field));
      }
    }

    const concentration = String(record.concentration ?? "").trim();
    if (concentration !== "" && (!Number.isFinite(Number(concentration)) || Number(concentration) < 0)) {
      rowIssues.push(issue("invalid-concentration", "error", "Concentration must be a non-negative number.", index, "concentration"));
    }

    if (record.record_id) {
      if (seenIds.has(record.record_id)) {
        rowIssues.push(issue("duplicate-record-id", "error", `Record ID duplicates row ${seenIds.get(record.record_id) + 1}.`, index, "record_id"));
      } else {
        seenIds.set(record.record_id, index);
      }
    }
    if (record.country && !isGermany(record.country)) {
      rowIssues.push(issue("not-germany", "error", "This prototype accepts Germany records only.", index, "country"));
    }

    for (const field of ["upstream_rivers", "downstream_rivers", "directly_connected_lakes_reservoirs"]) {
      if (String(record[field] ?? "").trim() !== "" && !nonNegativeInteger(record[field])) {
        rowIssues.push(issue("invalid-count", "error", `${FIELD_LABELS[field]} must be a non-negative whole number.`, index, field));
      }
    }
    if (String(record.population_density ?? "").trim() !== "" &&
        (!Number.isFinite(Number(record.population_density)) || Number(record.population_density) < 0)) {
      rowIssues.push(issue("invalid-population-density", "error", "Population density must be a non-negative number.", index, "population_density"));
    }

    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      rowIssues.push(issue("invalid-latitude", "error", "Latitude must be a number between -90 and 90.", index, "latitude"));
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      rowIssues.push(issue("invalid-longitude", "error", "Longitude must be a number between -180 and 180.", index, "longitude"));
    }
    if (Number.isFinite(latitude) && Number.isFinite(longitude) &&
        (latitude < GERMANY_BOUNDS.minLat || latitude > GERMANY_BOUNDS.maxLat ||
         longitude < GERMANY_BOUNDS.minLon || longitude > GERMANY_BOUNDS.maxLon)) {
      rowIssues.push(issue("outside-germany-bounds", "warning", "Coordinates fall outside the approximate Germany bounding box; verify the location.", index, "latitude"));
    }

    if (record.sample_date && !isValidDate(String(record.sample_date))) {
      rowIssues.push(issue("invalid-sample-date", "error", "Sample date must use a real YYYY-MM-DD date.", index, "sample_date"));
    } else if (record.sample_date && String(record.sample_date) > new Date().toISOString().slice(0, 10)) {
      rowIssues.push(issue("future-sample-date", "error", "Sample date cannot be in the future.", index, "sample_date"));
    }

    if (record.unit && !/[a-zµμ]+\s*\/\s*l/i.test(String(record.unit))) {
      rowIssues.push(issue("unrecognized-unit", "warning", "Unit is not recognized as a concentration-per-litre unit; verify it before analysis.", index, "unit"));
    }
    if (record.source_url && !/^https:\/\//i.test(String(record.source_url))) {
      rowIssues.push(issue("insecure-record-url", "error", "Record source URL must use HTTPS.", index, "source_url"));
    }

    const connectionFields = [record.upstream_rivers, record.downstream_rivers, record.directly_connected_lakes_reservoirs];
    const connected = connectionFields.every((value) => nonNegativeInteger(value))
      ? connectionFields.reduce((total, value) => total + Number(value), 0)
      : "";
    return { record: { ...record, connected_water_bodies: connected }, issues: rowIssues };
  });

  const issues = rows.flatMap(({ issues: rowIssues }) => rowIssues);
  const errors = issues.filter(({ severity }) => severity === "error").length;
  const warnings = issues.filter(({ severity }) => severity === "warning").length;
  return {
    rows,
    issues,
    summary: {
      loaded: rows.length,
      valid: rows.filter(({ issues: rowIssues }) => !rowIssues.some(({ severity }) => severity === "error")).length,
      errors,
      warnings,
    },
  };
}

export function serializeCsv(records = []) {
  const fields = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [fields.map(escape).join(","), ...records.map((record) => fields.map((field) => escape(record[field])).join(","))].join("\n");
}

export function prepareExport(validation) {
  return validation.rows
    .filter(({ issues }) => !issues.some(({ severity }) => severity === "error"))
    .map(({ record }) => record);
}
