# Data-preparation prototype

This workstream is intentionally limited to preparing and checking source records. It does not fetch PFAS data, create an analytical dataset, render a map, add exploration controls, or present the methodology banner assigned to another teammate.

## How to use it

Serve the repository directory with any static web server and open `src/index.html`. For example, with Python installed:

```text
python -m http.server 8000
```

Then open `http://localhost:8000/src/` and choose a CSV or JSON file. The prototype runs locally in the browser; it does not upload files or call an external API.

## Vercel deployment

This is a static deployment: there is no build step, serverless function, environment variable, API key, or database. The root `vercel.json` rewrites `/` and the three browser assets into `src/`, so the deployed site opens at its Vercel root URL rather than requiring visitors to know the source directory. Keep the repository root as the Vercel project root and leave the framework preset as “Other” (or let Vercel detect the static site).

The browser-only import behavior is intentional. A Vercel deployment does not receive uploaded files and does not persist them; each visitor prepares their own local file. When official data is added later, keep the source snapshot or a secure server-side ingestion process separate from this client-only prototype.

The blank [record template](../data/pfas-record-template.csv) defines the minimum source-record shape. JSON may be either an array or an object containing a `records` array.

## Checks performed

- required record fields are present;
- Germany-only country values are used;
- coordinates are numeric and in valid geographic ranges, with a warning for points outside an approximate Germany bounding box;
- sample dates are real `YYYY-MM-DD` dates and are not in the future;
- concentrations are non-negative numbers when reported;
- blank concentrations stay explicitly `unavailable` and are never changed to zero;
- record IDs are unique;
- record-level URLs use HTTPS;
- provenance metadata includes a publisher/dataset name and HTTPS source URL.

Rows with errors are excluded from the prepared CSV export. Warnings remain visible for human review. The separate source manifest records provenance and counts without adding measurements.

## Assumptions and limitations

- Germany is represented by `DE`, `DEU`, `Germany`, or `Deutschland`; this is a preparation filter, not a geospatial boundary authority.
- The coordinate bounding box is only a review warning. It is not used to clip or transform data.
- No unit conversion or detection-limit interpretation is performed. Values and units are preserved as supplied so the analytical-dataset owner can define those rules explicitly.
- No public-source fields are invented when absent. The source owner must supply the official source URL and dataset dates.
- CSV parsing is intentionally small and dependency-free. For a production pipeline, the team should pin a parser and add source-specific fixtures before accepting large files.

## Handoff boundary

The output is cleaned record-level data plus a provenance manifest. The next workstream should decide how to build analytical tables from it. Mapping, ranking, aggregation, exploration, and the methodology banner are deliberately out of scope here.
