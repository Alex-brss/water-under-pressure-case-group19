import { writeFile } from 'node:fs/promises';

const EEA_SERVICE =
  'https://air.discomap.eea.europa.eu/arcgis/rest/services/Air/IED_SiteMap/MapServer/0/query';
const EUROSTAT_API =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_r_pjanaggr3';
const GISCO_NUTS3 =
  'https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_03M_2024_4326_LEVL_3.geojson';
const OUTPUT_PATH = 'data/generated/germany_nuts3_priority.json';
const BATCH_SIZE = 1_000;
const NUTS3_PATTERN = /^DE[A-Z0-9]{3}$/;
const FILTER_METHOD = 'secteurs PFAS associés';

// The EEA schema was checked on 2026-09-10. These are sector proxies only, not PFAS measurements.
const sectorWhere = [
  "eprtr_sectors LIKE '%CHEMICAL%'",
  "eprtr_sectors LIKE '%METALS%'",
  "eprtr_sectors LIKE '%PAPER%'",
  "eea_activities LIKE '%TEXTILE%'",
].join(' OR ');
const siteWhere = `countryCode = 'DE' AND Site_reporting_year = 2024 AND (${sectorWhere})`;

async function getJson(url, sourceName) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new Error(`${sourceName} is unavailable: ${error.message}`);
  }

  if (!response.ok) throw new Error(`${sourceName} returned HTTP ${response.status}.`);

  try {
    return await response.json();
  } catch {
    throw new Error(`${sourceName} returned an unexpected non-JSON response.`);
  }
}

function eeaQuery(params) {
  const query = new URLSearchParams({ f: 'json', ...params });
  return getJson(`${EEA_SERVICE}?${query}`, 'EEA Industrial Emissions Portal');
}

function hasValidGeometry(geometry) {
  return Number.isFinite(geometry?.x) && Number.isFinite(geometry?.y);
}

function webMercatorToWgs84({ x, y }) {
  const longitude = (x / 20_037_508.34) * 180;
  let latitude = (y / 20_037_508.34) * 180;
  latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);
  return [longitude, latitude];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crossesRay = currentY > y !== previousY > y;
    if (crossesRay && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)));
}

function nuts3FromAttributes(site, knownNuts3Codes) {
  return String(site.attributes.nuts_regions ?? '')
    .split(',')
    .map((code) => code.trim())
    .find((code) => NUTS3_PATTERN.test(code) && knownNuts3Codes.has(code));
}

function nuts3FromGeometry(site, boundaries) {
  const point = webMercatorToWgs84(site.geometry);
  return boundaries.find((boundary) => pointInPolygon(point, boundary.geometry))?.nuts3_id ?? null;
}

function sectorLabels(site) {
  const labels = [];
  const sector = String(site.attributes.eprtr_sectors ?? '').toUpperCase();
  const activity = String(site.attributes.eea_activities ?? '').toUpperCase();
  if (sector.includes('CHEMICAL')) labels.push('Chimie');
  if (sector.includes('METALS')) labels.push('Métaux / traitement de surface');
  if (sector.includes('PAPER')) labels.push('Papier / bois');
  if (activity.includes('TEXTILE')) labels.push('Textile');
  return labels;
}

async function loadBoundaries() {
  const data = await getJson(GISCO_NUTS3, 'Eurostat GISCO NUTS 3 boundaries');
  if (!Array.isArray(data.features)) throw new Error('Eurostat GISCO boundaries have no feature list.');

  const boundaries = data.features
    .filter((feature) => feature.properties?.CNTR_CODE === 'DE' && NUTS3_PATTERN.test(feature.properties?.NUTS_ID))
    .map((feature) => ({
      nuts3_id: feature.properties.NUTS_ID,
      nuts3_name: feature.properties.NAME_LATN ?? feature.properties.NUTS_NAME ?? feature.properties.NUTS_ID,
      geometry: feature.geometry,
    }));

  if (boundaries.length === 0) throw new Error('Eurostat GISCO returned no German NUTS 3 regions.');
  if (new Set(boundaries.map((boundary) => boundary.nuts3_id)).size !== boundaries.length) {
    throw new Error('Eurostat GISCO returned duplicate German NUTS 3 codes.');
  }
  return boundaries;
}

async function loadIndustrialSites() {
  const countData = await eeaQuery({ where: siteWhere, returnCountOnly: 'true' });
  if (!Number.isInteger(countData.count)) throw new Error('EEA Industrial Emissions Portal response has no valid site count.');

  const sites = [];
  for (let offset = 0; offset < countData.count; offset += BATCH_SIZE) {
    const page = await eeaQuery({
      where: siteWhere,
      outFields: 'siteName,nuts_regions,eprtr_sectors,eea_activities,InspireSiteId',
      returnGeometry: 'true',
      resultOffset: String(offset),
      resultRecordCount: String(BATCH_SIZE),
    });
    if (!Array.isArray(page.features)) throw new Error('EEA Industrial Emissions Portal response has no feature list.');
    sites.push(...page.features);
  }

  if (sites.length !== countData.count) {
    throw new Error(`EEA Industrial Emissions Portal returned ${sites.length}/${countData.count} expected sites.`);
  }
  return sites;
}

async function loadPopulation() {
  const query = new URLSearchParams({ geoLevel: 'nuts3', time: '2025', sex: 'T', age: 'TOTAL', unit: 'NR', lang: 'en' });
  const data = await getJson(`${EUROSTAT_API}?${query}`, 'Eurostat population API');
  const geo = data.dimension?.geo?.category;
  if (!geo?.index || !data.value || !Array.isArray(data.id) || !Array.isArray(data.size)) {
    throw new Error('Eurostat population API response is missing JSON-stat dimensions or values.');
  }

  const geoDimension = data.id.indexOf('geo');
  if (geoDimension === -1) throw new Error('Eurostat population API response has no geo dimension.');
  const trailingSize = data.size.slice(geoDimension + 1).reduce((total, size) => total * size, 1);

  return new Map(
    Object.entries(geo.index)
      .filter(([code]) => NUTS3_PATTERN.test(code))
      .map(([code, position]) => [code, data.value[String(position * trailingSize)] ?? null]),
  );
}

function assignAndDeduplicateSites(sites, boundaries) {
  const knownNuts3Codes = new Set(boundaries.map((boundary) => boundary.nuts3_id));
  const seenSiteIds = new Set();
  const assigned = [];
  const quality = {
    source_site_record_count: sites.length,
    duplicate_site_record_count: 0,
    excluded_invalid_coordinates_count: 0,
    excluded_no_nuts3_match_count: 0,
    matched_by_nuts_attribute_count: 0,
    matched_by_geometry_count: 0,
  };

  for (const site of sites) {
    const siteId = site.attributes?.InspireSiteId;
    if (!siteId || seenSiteIds.has(siteId)) {
      quality.duplicate_site_record_count += 1;
      continue;
    }
    seenSiteIds.add(siteId);
    if (!hasValidGeometry(site.geometry)) {
      quality.excluded_invalid_coordinates_count += 1;
      continue;
    }

    const nuts3Id = nuts3FromAttributes(site, knownNuts3Codes);
    if (nuts3Id) {
      quality.matched_by_nuts_attribute_count += 1;
      assigned.push({ nuts3_id: nuts3Id, sector_labels: sectorLabels(site) });
      continue;
    }

    const spatialNuts3Id = nuts3FromGeometry(site, boundaries);
    if (spatialNuts3Id) {
      quality.matched_by_geometry_count += 1;
      assigned.push({ nuts3_id: spatialNuts3Id, sector_labels: sectorLabels(site) });
    } else {
      quality.excluded_no_nuts3_match_count += 1;
    }
  }
  return { assigned, quality };
}

function buildRegionalTable(boundaries, population, sites) {
  const industrialByNuts3 = new Map();
  for (const site of sites) {
    const current = industrialByNuts3.get(site.nuts3_id) ?? { industrial_site_count: 0, sector_proxy_counts: {} };
    current.industrial_site_count += 1;
    for (const label of site.sector_labels) current.sector_proxy_counts[label] = (current.sector_proxy_counts[label] ?? 0) + 1;
    industrialByNuts3.set(site.nuts3_id, current);
  }

  const maxSites = Math.max(...[...industrialByNuts3.values()].map(({ industrial_site_count }) => industrial_site_count), 1);
  const validPopulation = boundaries.map(({ nuts3_id }) => population.get(nuts3_id)).filter(Number.isFinite);
  const maxPopulation = Math.max(...validPopulation, 1);

  const regions = boundaries.map((boundary) => {
    const industrial = industrialByNuts3.get(boundary.nuts3_id) ?? { industrial_site_count: 0, sector_proxy_counts: {} };
    const regionPopulation = population.get(boundary.nuts3_id) ?? null;
    const dataStatus = Number.isFinite(regionPopulation) ? 'complete' : 'missing_population';
    const exposureIndex = (industrial.industrial_site_count / maxSites) * 100;
    const populationIndex = Number.isFinite(regionPopulation) ? (regionPopulation / maxPopulation) * 100 : null;
    const priorityScore = populationIndex === null ? null : Math.sqrt(exposureIndex * populationIndex);
    return {
      nuts3_id: boundary.nuts3_id,
      nuts3_name: boundary.nuts3_name,
      population: regionPopulation,
      industrial_site_count: industrial.industrial_site_count,
      filter_method: FILTER_METHOD,
      sector_proxy_counts: industrial.sector_proxy_counts,
      exposure_index: Number(exposureIndex.toFixed(2)),
      population_index: populationIndex === null ? null : Number(populationIndex.toFixed(2)),
      priority_score: priorityScore === null ? null : Number(priorityScore.toFixed(2)),
      data_status: dataStatus,
    };
  });

  if (new Set(regions.map((region) => region.nuts3_id)).size !== regions.length) {
    throw new Error('Analytical table contains duplicate NUTS 3 rows.');
  }
  return regions.sort((left, right) => (right.priority_score ?? -1) - (left.priority_score ?? -1));
}

async function main() {
  const [boundaries, rawSites, population] = await Promise.all([loadBoundaries(), loadIndustrialSites(), loadPopulation()]);
  const { assigned, quality } = assignAndDeduplicateSites(rawSites, boundaries);
  const regions = buildRegionalTable(boundaries, population, assigned);
  const regionsWithPopulation = regions.filter(({ population: value }) => Number.isFinite(value)).length;

  const output = {
    generated_at: new Date().toISOString(),
    methodology: {
      scope: 'Germany only; NUTS 3 regions; 2024 industrial-site records and 2025 population.',
      exposure: 'Count of sites in PFAS-associated industrial proxy sectors: chemicals, metals/surface treatment, paper/wood and textile.',
      consequence: 'Eurostat population on 1 January by NUTS 3 region.',
      score: 'sqrt((100 × industrial_site_count / German maximum) × (100 × population / German maximum)).',
      limitation: 'Indicative pre-prioritisation only. An industrial site is a proxy for potential pressure, not evidence of PFAS contamination, human exposure, or regulatory non-compliance.',
    },
    sources: {
      industrial: {
        name: 'EEA Industrial Emissions Portal — IED Site Map',
        url: 'https://industry.eea.europa.eu/industrial-emissions/dataset',
        service: EEA_SERVICE.replace('/query', ''),
        reporting_year: 2024,
        sector_fields_verified: ['eprtr_sectors', 'eea_activities'],
      },
      population: {
        name: 'Eurostat — Population on 1 January by broad age group, sex and NUTS 3 region',
        url: EUROSTAT_API,
        reference_year: 2025,
      },
      boundaries: {
        name: 'Eurostat GISCO — NUTS 3 boundaries',
        url: GISCO_NUTS3,
        nuts_version: 2024,
      },
    },
    quality_checks: {
      ...quality,
      assigned_industrial_site_count: assigned.length,
      german_nuts3_region_count: regions.length,
      regions_with_population_count: regionsWithPopulation,
      missing_population_region_count: regions.length - regionsWithPopulation,
      nuts3_codes_aligned_count: regionsWithPopulation,
    },
    regions,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${regions.length} German NUTS 3 rows and assigned ${assigned.length} industrial-site proxies to ${OUTPUT_PATH}.`);
}

main().catch((error) => {
  console.error(`Unable to build Germany PFAS-priority data: ${error.message}`);
  process.exitCode = 1;
});
