import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel serves the priority map from the deployment root and preserves the introduction route", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const map = await readFile(new URL("../map.html", import.meta.url), "utf8");
  const introduction = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  assert.equal(config.cleanUrls, true);
  assert.deepEqual(config.rewrites, [
    { source: "/", destination: "/map.html" },
    { source: "/introduction", destination: "/src/index.html" },
    { source: "/app.js", destination: "/src/app.js" },
    { source: "/data-validation.js", destination: "/src/data-validation.js" },
    { source: "/styles.css", destination: "/src/styles.css" },
  ]);
  assert.match(map, /href="\/introduction"/);
  assert.match(introduction, /href="\/"/);
});
