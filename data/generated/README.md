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

`nuts3_id`, `nuts3_name`, `area_km2`, `population`, `population_density_per_km2`, `wise_concentration_mean`, `industrial_site_count`, `water_network_segment_count`, `water_network_length_km`, `water_connectivity_raw`, the component indices, `priority_score`, and `data_status`.

Exposure, total population, population density, and the water-connectivity proxy are each normalised separately to 0–100. The final score is a transparent weighted sum:

`0.45 × exposure + 0.25 × WISE pesticide/nutrient concentration + 0.15 × population density + 0.15 × water connectivity`

The connectivity proxy is the EU-Hydro main-river-corridor length weighted by Strahler order and assigned by segment midpoint to a NUTS 3 region. It is not a hydrological transport model. This is an indicative pre-prioritisation measure only: an industrial site and a connected river corridor are proxies for potential pressure and propagation, not evidence of PFAS contamination, population exposure, a health risk, or regulatory non-compliance.
