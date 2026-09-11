import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scorePath = new URL('../data/generated/germany_nuts3_priority.json', import.meta.url);
const mapPath = new URL('../map.html', import.meta.url);

test('the Germany map reads the generated local score dataset instead of deriving pseudo-priorities', async () => {
  const map = await readFile(mapPath, 'utf8');

  assert.match(map, /const scoreUrl = 'data\/generated\/germany_nuts3_priority\.json'/);
  assert.match(map, /regionsByNutsId = new Map\(scoreData\.regions/);
  assert.match(map, /joinedCount/);
  assert.match(map, /id="region-details"/);
  assert.match(map, /function updateInspector\(/);
  assert.match(map, /WISE pesticide\/nutrient mean<\/dt>/);
  assert.match(map, /Industrial sites<\/dt>/);
  assert.match(map, /Sector method<\/dt>/);
  assert.match(map, /window\.location\.protocol === 'file:'/);
  assert.match(map, /cannot read the local score dataset/);
  assert.doesNotMatch(map, /function getPriority\(/);
});

test('generated regional scores contain all values displayed by the map', async () => {
  const { regions } = JSON.parse(await readFile(scorePath, 'utf8'));

  assert.equal(regions.length, 400);
  assert.equal(new Set(regions.map(region => region.nuts3_id)).size, regions.length);
  for (const region of regions) {
    assert.match(region.nuts3_id, /^DE[A-Z0-9]{3}$/);
    assert.equal(typeof region.nuts3_name, 'string');
    assert.ok(Number.isFinite(region.priority_score) || region.priority_score === null);
    assert.ok(Number.isFinite(region.population) || region.population === null);
    assert.ok(Number.isInteger(region.industrial_site_count));
    assert.equal(typeof region.filter_method, 'string');
  }
});
