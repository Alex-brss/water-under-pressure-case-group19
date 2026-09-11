import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const scorePath = new URL('../data/generated/germany_nuts3_priority.json', import.meta.url);
const boundaryPath = new URL('../data/generated/germany_nuts3_boundaries.geojson', import.meta.url);
const mapPath = new URL('../map.html', import.meta.url);

test('the Germany map reads the generated local score dataset instead of deriving pseudo-priorities', async () => {
  const map = await readFile(mapPath, 'utf8');

  assert.match(map, /const scoreUrl = 'data\/generated\/germany_nuts3_priority\.json'/);
  assert.match(map, /const nutsUrl = 'data\/generated\/germany_nuts3_boundaries\.geojson'/);
  assert.match(map, /vendor\/leaflet\/leaflet\.js/);
  assert.match(map, /vendor\/leaflet\/leaflet\.css/);
  assert.doesNotMatch(map, /gisco-services\.ec\.europa\.eu|unpkg\.com/);
  assert.match(map, /regionsByNutsId = new Map\(scoreData\.regions/);
  assert.match(map, /function assignTerciles\(regions\)/);
  assert.match(map, /function scoreFor\(region\)/);
  assert.match(map, /priorityByNutsId\.set\(region\.nuts3_id, priority\)/);
  assert.doesNotMatch(map, /score >= 67|score >= 34/);
  assert.match(map, /relative ranking across German regions, not an absolute risk threshold/);
  assert.match(map, /joinedCount/);
  assert.match(map, /id="region-details"/);
  assert.match(map, /function updateInspector\(/);
  assert.match(map, /function tooltipHtml\(/);
  assert.match(map, /Base score/);
  assert.match(map, /Enriched score/);
  assert.match(map, /WISE pesticide available/);
  assert.match(map, /WISE nutrient available/);
  assert.match(map, /A missing WISE measurement is not a lack of regional data/);
  assert.match(map, /PFAS-associated industrial sites<\/dt>/);
  assert.match(map, /Sector method<\/dt>/);
  assert.match(map, /PFAS-associated sectors/);
  assert.doesNotMatch(map, /bindPopup\(/);
  assert.match(map, /Promise\.allSettled/);
  assert.match(map, /Local score data are empty/);
  assert.match(map, /Local NUTS 3 boundaries have an unexpected structure/);
  assert.match(map, /window\.location\.protocol === 'file:'/);
  assert.match(map, /cannot read the local score dataset/);
  assert.doesNotMatch(map, /function getPriority\(/);
});

test('local boundary snapshot covers the same German NUTS 3 identifiers as the score dataset', async () => {
  const boundaries = JSON.parse(await readFile(boundaryPath, 'utf8')).features;
  const { regions } = JSON.parse(await readFile(scorePath, 'utf8'));
  const scoreIds = new Set(regions.map(region => region.nuts3_id));

  assert.equal(boundaries.length, 400);
  assert.equal(boundaries.filter(feature => feature.properties?.CNTR_CODE === 'DE').length, 400);
  assert.deepEqual(new Set(boundaries.map(feature => feature.properties.NUTS_ID)), scoreIds);
});

test('the map library is vendored for local-only runtime', async () => {
  await access(new URL('../vendor/leaflet/leaflet.js', import.meta.url));
  await access(new URL('../vendor/leaflet/leaflet.css', import.meta.url));
});

test('generated regional scores contain all values displayed by the map', async () => {
  const { regions } = JSON.parse(await readFile(scorePath, 'utf8'));

  assert.equal(regions.length, 400);
  assert.equal(new Set(regions.map(region => region.nuts3_id)).size, regions.length);
  for (const region of regions) {
    assert.match(region.nuts3_id, /^DE[A-Z0-9]{3}$/);
    assert.equal(typeof region.nuts3_name, 'string');
    assert.ok(Number.isFinite(region.priority_score) || region.priority_score === null);
    assert.ok(Number.isFinite(region.base_priority_score) || region.base_priority_score === null);
    assert.equal(typeof region.score_variant, 'string');
    assert.ok(Number.isFinite(region.population) || region.population === null);
    assert.ok(Number.isInteger(region.industrial_site_count));
    assert.equal(typeof region.filter_method, 'string');
  }
});

test('the mandatory base score covers every region while optional enrichments preserve score coverage', async () => {
  const { regions } = JSON.parse(await readFile(scorePath, 'utf8'));

  assert.equal(regions.filter(region => Number.isFinite(region.base_priority_score)).length, 400);
  assert.equal(regions.filter(region => Number.isFinite(region.priority_score)).length, 400);
  assert.ok(regions.every(region => region.priority_score >= 0 && region.priority_score <= 100));
});

test('all four WISE availability cases retain a valid score', async () => {
  const { regions } = JSON.parse(await readFile(scorePath, 'utf8'));
  const wiseCases = new Map();
  for (const region of regions) {
    const key = `${Number.isFinite(region.pesticide_concentration_mean)}:${Number.isFinite(region.nutrient_concentration_mean)}`;
    wiseCases.set(key, [...(wiseCases.get(key) ?? []), region]);
  }

  for (const key of ['false:false', 'true:false', 'false:true', 'true:true']) {
    const caseRegions = wiseCases.get(key) ?? [];
    assert.ok(caseRegions.length > 0, `expected the ${key} WISE availability case`);
    assert.ok(caseRegions.every(region => Number.isFinite(region.priority_score)));
  }
});
