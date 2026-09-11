# Water Under Pressure — ATELIA × ESCP Starter Kit

> This repo is your starting point. Codex should read this README first.

## How to Get Started

This repo is a **template**: click **Fork** (top right), not "Use this template." Fork keeps your copy linked back to the original — that's what lets ATELIA automatically find every team's work, without anyone needing to send a link.

Once you've forked it, add your teammates as collaborators (Settings → Collaborators on your fork), and leave the visibility as **Public** — don't switch it to Private, or we lose access to your work.

## The Brief

The full brief is in `WATER_Case_Brief.md`. Unlike the other case, there's no single company or fixed decision here — you choose the angle. The list of real, free public data sources you can build on is in `data/PUBLIC_SOURCES.md`.

One-sentence summary: Europe's water stress became a visible economic story in 2026 — droughts, record-low rivers, industrial shutdown risk, and a wave of EU investment. Your job is to pick a real problem inside that story and build a tool that helps someone make a better decision about it, using real public data.

## Rule #1 — Prompt Logging Is Automatic

This repo includes an `AGENTS.md` file, which Codex reads automatically at the start of every task — you don't need to open or edit it. The first time you talk to Codex in a new conversation, it will ask for your **student ID**. Answer it, and from then on Codex logs every prompt you send it — automatically, verbatim — into `prompts/<your-id>/session-*.md`, without you doing anything else.

**You don't fill this in by hand.** Your only job is to make sure that log file gets committed along with your code changes — Codex writes it, but you still need to include it when your pull request is created and merged. If a pull request only has code changes and no updated log file, that's a sign something didn't get logged.

Why we're doing this: it's not to monitor you. It's what lets us understand, at the end, how you reasoned — not just what you produced. A good result reached with a clear prompt from the start isn't scored the same as a good result reached after fifteen random attempts.

## Rule #2 — Before You Code, Ask Yourself These Questions

Check each box in this README as you go — not at the end, while you're working:

- [x] **Data**: what data does your tool actually pull, and from where? If you're using a live public API, is any of it rate-limited or does it require an API key? The map uses a prepared German NUTS 3 dataset built from European Industrial Emissions Portal sites in PFAS-associated sectors and Eurostat population/density; WISE water-quality values and Copernicus EU-Hydro connectivity are optional enrichments where available. The separate introduction workbench can also request public Eurostat and WISE data in the browser when the user asks it to.
- [x] **API keys**: if a source requires a free API key (a couple in `data/PUBLIC_SOURCES.md` do), where is it stored? Never hardcoded in a file committed to GitHub. (A valid answer: "we only used sources that don't require a key.") We only use public sources that do not require an API key, and the repository contains no key-handling code for these sources.
- [x] **Deployment**: if you deployed a live demo, does any endpoint expose your API key, or return unfiltered raw data to any visitor? The deployed map is a static Vercel page with no backend endpoint and no API key; it reads local prepared assets only. The introduction workbench can make direct, user-triggered browser requests to public Eurostat/WISE services and displays up to 200 public WISE rows, rather than proxying them through a server.
- [x] **Attribution**: are you using real public data appropriately — no claim that estimated or invented numbers are official figures? The sources, retrieval approach, formulas, and proxy limitations are documented in `data/generated/README.md`. The interface and methodology explicitly describe the result as indicative pre-prioritisation: industrial sites are pressure proxies, not evidence of PFAS contamination, health risk, or non-compliance.
- [x] **Storage**: if you downloaded a snapshot of a dataset instead of calling it live, did you commit it to the repo? If so, is it small enough to be reasonable, and is its source clearly documented? The map serves committed, pre-computed local snapshots rather than calling APIs at runtime: `germany_nuts3_priority.json` is 384 KiB and the companion 400-region boundary snapshot is 996 KiB. Both are versioned in the repository and their sources and refresh instructions are documented in `data/generated/README.md`.
- [x] **Robustness**: what happens if the user gives an empty, inconsistent, or unexpected input? What happens if the external data source is temporarily down? The import workbench validates required fields, duplicate records, German coverage, coordinates, HTTPS provenance, and malformed CSV/JSON, and blocks invalid rows from prepared export. The map reports missing, empty, or malformed local snapshots without crashing; browser API failures show a readable error, while the mandatory baseline still gives all 400 regions a valid score and tests cover all four WISE-availability cases.
- [x] **Explainability**: can you explain to someone non-technical why your tool does what it does, and which real data it's actually built on? The map explains that it ranks regions relatively using industrial pressure, population, and density, then refines the score with available WISE and connectivity data. Its methodology banner and detailed dataset documentation state the real sources, the optional enrichments, and the limits of the proxy.
- [x] **Business relevance**: does your prototype solve a real, specific problem for a real kind of user — or is it an interesting technical build with no clear "who is this for"? It is aimed at German water utilities and public authorities choosing which NUTS 3 regions to investigate first for possible PFAS-related pressure. It supports triage rather than regulatory or health-risk decisions, so it identifies where further assessment may be warranted rather than claiming contamination.

These questions aren't here to slow you down — they're part of what's being evaluated. A thoughtful answer to one of them is worth more than an extra feature nobody asked for.

## What We Expect at the End

- A prototype that works, even partially, using at least one real public data source
- Your prompt log (`prompts/<your-id>/session-*.md`) committed and up to date
- A short paragraph below, written in business language (not technical), explaining what you built, for whom, and why
- A live URL (Vercel or similar) if you deployed it — not required to still get credit, but expected if you did

## Our Approach

We built a pre-prioritisation map that helps a German water utility or public authority decide which NUTS 3 regions to investigate first for potential PFAS-related pressure. It combines two key-free public data sources: the European Industrial Emissions Portal (industrial sites, filtered to PFAS-associated sectors like chemicals, surface treatment, paper, and textiles) as an *exposure* proxy, and Eurostat population and density as a *consequence* measure. All 400 of Germany's NUTS 3 regions receive a score from this robust baseline; where public water-quality measurements (WISE pesticides/nutrients) and hydrological connectivity exist, the score is refined further. Regions are ranked relatively (upper/middle/lower third) so a decision-maker sees at a glance where attention is most warranted. It is explicitly an *indicative pre-prioritisation*: an industrial site is a pressure proxy, not proof of PFAS contamination, a health risk, or non-compliance.

## Current prototype

The first workstream now has a local-only PFAS data-preparation workbench in `src/`. Open `src/index.html` through a static web server to configure source provenance, import a future CSV or JSON file, review validation findings, and export record-level prepared data. No public observations are bundled or fetched yet. The scope and handoff contract are documented in `docs/DATA_PREPARATION.md`.

Separately, the Germany-only NUTS 3 analytical input for the PFAS priority map is generated in `data/generated/germany_nuts3_priority.json`. It uses the EEA Industrial Emissions Portal, WISE Freshwater, Eurostat population, Eurostat GISCO boundaries, and Copernicus EU-Hydro main-river corridors, all without an API key. Its mandatory 0–100 base score combines industrial pressure, population, and population density for every region. WISE pesticide/nutrient observations and hydrological connectivity refine that score only where available; missing optional observations are removed and the remaining weights are normalised to 100. The map runs from prepared local score and NUTS 3 boundary snapshots, with no API, database, or third-party library request at viewing time. See `data/generated/README.md` for the formula, sources, safeguards, and limitations.

## Deployment and data-security boundary

The Vercel-hosted interface is suitable for sharing public German source data and the validation workflow. In this prototype, operator-specific CSV/JSON files are processed in the browser and are not uploaded. This must not be described as a complete production security architecture: before storing operator data, add authentication, role-based authorization, encryption at rest and in transit, tenant separation, audit logging, retention/deletion controls, and server-side input validation. Never place API keys in browser code or committed files.

## Refresh and analytical-data contract

The normalized record shape is designed for future map and analytical tools: every record has a German water-source identifier and coordinates, a dated observation, analyte/concentration fields, population density, and three connectivity counts. `connected_water_bodies` is derived deterministically from those counts. Every ingestion refresh must retain the official source URL and retrieval date, reject records outside Germany, and preserve missing measurements rather than filling them. WISE concentrations are converted to a common `µg/L` unit before regional means and score indices are calculated; unsupported units are excluded rather than mixed into the score. Eurostat can be refreshed from its public API without a key; WISE and EU-Hydro should be refreshed by a scheduled server-side ingestion job that downloads official releases, validates them, and publishes a versioned Germany-only snapshot. Vercel cron or an external scheduler can trigger that job once a secure backend and storage are added.
