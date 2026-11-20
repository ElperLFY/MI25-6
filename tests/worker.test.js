import test from "node:test";
import assert from "node:assert/strict";

test("data Worker bootstraps with bundled JSZip and a message handler", async () => {
  const previousSelf = globalThis.self;
  const previousOnMessage = globalThis.onmessage;
  const previousJSZip = globalThis.JSZip;

  globalThis.self = globalThis;

  try {
    await import("../JS/workers/data.worker.js");

    assert.equal(typeof globalThis.JSZip?.loadAsync, "function");
    assert.equal(typeof globalThis.onmessage, "function");
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;

    if (previousOnMessage === undefined) delete globalThis.onmessage;
    else globalThis.onmessage = previousOnMessage;

    if (previousJSZip === undefined) delete globalThis.JSZip;
    else globalThis.JSZip = previousJSZip;
  }
});
