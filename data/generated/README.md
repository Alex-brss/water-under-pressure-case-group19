# Germany NUTS 3 PFAS-priority dataset

`germany_nuts3_priority.json` is the analytical input for the Germany-only NUTS 3 map. Regenerate it with:

```sh
/Users/alexandrebrosseau/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/build-germany-pfas-priority-data.mjs
```

No API key or secret is used. The generator queries three public sources:

- the EEA Industrial Emissions Portal's public IED Site Map, for 2024 German industrial sites;
- Eurostat's public `demo_r_pjanaggr3` endpoint, for 2025 population by NUTS 3 region;
- Eurostat GISCO's 2024 NUTS 3 boundaries, to define the German regional table and as a spatial fallback for sites with no valid NUTS 3 attribute.

The Industrial Emissions Portal exposes `eprtr_sectors` and `eea_activities`, so the generator filters the proxy sectors chemistry, metals/surface treatment, paper/wood and textile. It retains only records with valid point coordinates, de-duplicates by `InspireSiteId`, and records excluded or unmatched site counts in `quality_checks`.

Every regional row includes these core fields:

`nuts3_id`, `nuts3_name`, `population`, `industrial_site_count`, `filter_method`, `exposure_index`, `population_index`, `priority_score`, and `data_status`.

Both exposure and population are normalised separately to 0–100. The final score is their geometric mean:

`sqrt((100 × sites / German maximum) × (100 × population / German maximum))`

This is an indicative pre-prioritisation measure only. A listed industrial site is a proxy for potential pressure; it is not evidence of PFAS contamination, population exposure, a health risk, or regulatory non-compliance.
