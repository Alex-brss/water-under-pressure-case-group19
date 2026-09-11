import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel serves the static prototype from the deployment root", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.cleanUrls, true);
  assert.deepEqual(config.rewrites, [
    { source: "/", destination: "/src/index.html" },
    { source: "/app.js", destination: "/src/app.js" },
    { source: "/data-validation.js", destination: "/src/data-validation.js" },
    { source: "/styles.css", destination: "/src/styles.css" },
  ]);
});
