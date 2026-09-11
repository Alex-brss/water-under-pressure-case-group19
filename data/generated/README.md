# Germany NUTS 3 PFAS-priority dataset

`germany_nuts3_priority.json` is the analytical input for the Germany-only NUTS 3 map. Regenerate it with:

```sh
/Users/alexandrebrosseau/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-germany-pfas-priority-data.mjs
```

No API key or secret is used. The generator queries four public sources:

- the EEA Industrial Emissions Portal's public IED Site Map, for 2024 German industrial sites;
- Eurostat's public `demo_r_pjanaggr3` endpoint, for 2025 population by NUTS 3 region;
- Eurostat GISCO's 2024 NUTS 3 boundaries, to define the German regional table and as a spatial fallback for sites with no valid NUTS 3 attribute.
- Copernicus EU-Hydro's public River Network REST service, for principal river-corridor connectivity (Strahler orders 6–9).

The Industrial Emissions Portal exposes `eprtr_sectors` and `eea_activities`, so the generator filters the proxy sectors chemistry, metals/surface treatment, paper/wood and textile. It retains only records with valid point coordinates, de-duplicates by `InspireSiteId`, and records excluded or unmatched site counts in `quality_checks`.

Every regional row includes these core fields:

`nuts3_id`, `nuts3_name`, `area_km2`, `population_density_per_km2`, `base_priority_score`, `pesticide_concentration_mean`, `nutrient_concentration_mean`, `industrial_site_count`, `water_network_segment_count`, `water_network_length_km`, `water_connectivity_raw`, the component indices, `priority_score`, `score_variant`, and `data_status`.

Exposure, total population, population density, WISE observations, and the water-connectivity proxy are each normalised separately to 0–100. The base score uses only exposure, population, and density, so it remains available where optional observations are absent. The final score adds any available WISE pesticide, WISE nutrient, and connectivity components; their available weights are renormalised to sum to 100.

The base-score proportions are `45:25:15` for exposure, population, and population density, rescaled to 100. In a fully enriched score, the available component weights are exposure `34.4118`, population `19.1176`, population density `11.4706`, WISE pesticide `15`, WISE nutrient `10`, and connectivity `10`; any absent optional component is removed before the remaining weights are normalised to 100.

The connectivity proxy is the EU-Hydro main-river-corridor length weighted by Strahler order and assigned by segment midpoint to a NUTS 3 region. It is not a hydrological transport model. This tool helps water operators pre-prioritize water sources that need further assessment. The score is indicative: the underlying industrial, pesticide, nutrient, population, and connectivity data do not determine whether a water source complies with regulatory standards, and industrial sites and connected river corridors are proxies rather than evidence of PFAS contamination, population exposure, or a health risk. The NUTS 3 boundaries come from Eurostat GISCO (2024) and provide regional context; they are not the exact boundaries of water sources or catchments.

## Map runtime safeguards

The published map reads only prepared project assets at runtime: `germany_nuts3_priority.json` and the 400-region GISCO snapshot in `germany_nuts3_boundaries.geojson`. Leaflet is also vendored under `vendor/leaflet/`; the page makes no API, database, or third-party library request and needs no key. Before replacing either snapshot, validate that it is non-empty, has the expected NUTS 3 identifiers, and that every score-region code joins to a boundary. The map keeps the boundary layer visible in grey when the score snapshot is unavailable, and provides a readable status for missing, empty, or malformed local sources.
