import test from "node:test";
import assert from "node:assert/strict";
import { measureAsync, measureSync } from "../JS/data/diagnostics.js";

test("performance diagnostics record synchronous and asynchronous stage timings", async () => {
  const timings = [];
  const options = { timings, datasetKey: "general2025" };

  const syncResult = measureSync(options, "Parsing CSV", () => 42, { file: "civici.csv" });
  const asyncResult = await measureAsync(options, "Decompressione CSV", async () => "done", { file: "civici.csv" });

  assert.equal(syncResult, 42);
  assert.equal(asyncResult, "done");
  assert.equal(timings.length, 2);
  assert.deepEqual(timings.map(({ dataset, stage, file }) => ({ dataset, stage, file })), [
    { dataset: "general2025", stage: "Parsing CSV", file: "civici.csv" },
    { dataset: "general2025", stage: "Decompressione CSV", file: "civici.csv" }
  ]);
  assert.ok(timings.every((timing) => Number.isFinite(timing.durationMs) && timing.durationMs >= 0));
});

test("performance diagnostics do not change behavior when disabled", async () => {
  let calls = 0;
  const syncResult = measureSync(null, "ignored", () => { calls += 1; return "sync"; });
  const asyncResult = await measureAsync(null, "ignored", async () => { calls += 1; return "async"; });

  assert.equal(syncResult, "sync");
  assert.equal(asyncResult, "async");
  assert.equal(calls, 2);
});
