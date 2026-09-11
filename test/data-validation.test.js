import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseJson, prepareExport, serializeCsv, validateMetadata, validateRecords } from "../src/data-validation.js";

test("parses quoted CSV cells and normalizes common headers", () => {
  const records = parseCsv('id,country,lat,lon,date,parameter,value,unit_of_measure,matrix,url\n"a,1",DE,51.1,10.2,2025-04-01,PFOS,0.4,ug/L,water,https://example.test/source');
  assert.equal(records[0].record_id, "a,1");
  assert.equal(records[0].latitude, "51.1");
  assert.equal(records[0].analyte, "PFOS");
});

test("accepts a JSON records envelope", () => {
  const records = parseJson(JSON.stringify({ records: [{ record_id: "r1", country: "Germany" }] }));
  assert.deepEqual(records, [{ record_id: "r1", country: "Germany" }]);
});

test("keeps unavailable concentrations explicit and does not convert them to zero", () => {
  const result = validateRecords([{
    record_id: "r1", country: "DE", latitude: "51", longitude: "10", sample_date: "2025-01-02",
    analyte: "PFOS", concentration: "", unit: "µg/L", matrix: "surface water", source_url: "https://example.test/r1",
  }]);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.warnings, 1);
  assert.equal(result.rows[0].record.concentration_status, "unavailable");
  assert.equal(result.rows[0].record.concentration, "");
});

test("flags duplicates, non-Germany records, invalid coordinates, and insecure URLs", () => {
  const result = validateRecords([
    { record_id: "r1", country: "DE", latitude: "51", longitude: "10", sample_date: "2025-01-02", analyte: "PFOS", concentration: "1", unit: "ug/L", matrix: "water", source_url: "https://example.test/r1" },
    { record_id: "r1", country: "FR", latitude: "999", longitude: "10", sample_date: "2025-01-02", analyte: "PFOS", concentration: "-1", unit: "unknown", matrix: "water", source_url: "http://example.test/r1" },
  ]);
  const codes = new Set(result.issues.map(({ code }) => code));
  assert.ok(codes.has("duplicate-record-id"));
  assert.ok(codes.has("not-germany"));
  assert.ok(codes.has("invalid-latitude"));
  assert.ok(codes.has("invalid-concentration"));
  assert.ok(codes.has("insecure-record-url"));
});

test("metadata requires HTTPS provenance and prepared export excludes error rows", () => {
  assert.equal(validateMetadata({ source_name: "EEA", source_url: "http://example.test" }).length, 1);
  const validation = validateRecords([
    { record_id: "good", country: "DE", latitude: "51", longitude: "10", sample_date: "2025-01-02", analyte: "PFOS", concentration: "1", unit: "ug/L", matrix: "water", source_url: "https://example.test/good" },
    { record_id: "bad", country: "DE", latitude: "999", longitude: "10", sample_date: "2025-01-02", analyte: "PFOS", concentration: "1", unit: "ug/L", matrix: "water", source_url: "https://example.test/bad" },
  ]);
  const exported = prepareExport(validation);
  assert.deepEqual(exported.map(({ record_id }) => record_id), ["good"]);
  assert.match(serializeCsv(exported), /record_id/);
});
