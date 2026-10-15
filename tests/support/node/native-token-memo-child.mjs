// Full-cap native lookup parity and retained memo allocation share one live language-service Program.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { test } from "node:test";
import { ts } from "ts-morph";

const CAPACITY = 524_288;
const EXTRA_REFERENCES = 16;
const RETAINED_LIMIT_BYTES = 64 * 1024 * 1024;
const options = { includeDefinitionDisplay: false };
await test("native token memo capacity and retained ownership", () => {
  assert.equal(typeof globalThis.gc, "function");
  const files = new Map([
    ["/base.ts", "export const value=1;\n"],
    ["/consumer.ts", `import {value} from './base'; export const uses=[${Array.from({ length: CAPACITY + EXTRA_REFERENCES }, () => "value").join(",")}];\n`],
  ]);
  const compilerOptions = { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.d.ts",
    getProjectVersion: () => "0",
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const text = files.get(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    readFile: (file) => files.get(file),
    fileExists: (file) => files.has(file),
  };
  const started = performance.now();
  const service = ts.createLanguageService(host);
  const program = service.getProgram();
  assert.ok(program);
  const consumer = program.getSourceFile("/consumer.ts");
  assert.ok(consumer);
  const originalChildren = consumer.getChildren;
  let traversals = 0;
  consumer.getChildren = function (...args) {
    traversals++;
    return originalChildren.apply(this, args);
  };
  const event = (phase, detail = {}) => {
    const row = { phase, elapsedMs: performance.now() - started, ...detail };
    if (phase === "complete") {
      writeFileSync(process.argv[2], JSON.stringify(row));
    }
    console.log(JSON.stringify(row));
  };
  function measure(query) {
    traversals = 0;
    const groups = query.findReferences("/base.ts", files.get("/base.ts").indexOf("value"), options);
    assert.ok(groups);
    const hash = createHash("sha256");
    let references = 0;
    for (const group of groups) {
      hash.update(JSON.stringify(group.definition)).update("\n");
      for (const reference of group.references) {
        hash.update(JSON.stringify(reference)).update("\n");
        references++;
      }
      hash.update("group-end\n");
    }
    return { hash: hash.digest("hex"), groups: groups.length, references, traversals };
  }
  function retainedHeap() {
    globalThis.gc({ type: "major", execution: "sync" });
    return process.memoryUsage().heapUsed;
  }
  let pass;
  try {
    const expected = measure(service);
    assert.ok(expected.references >= CAPACITY + EXTRA_REFERENCES);
    event("native-warm", expected);
    pass = service.createReadonlyReferencePass();
    const before = retainedHeap();
    const populated = measure(pass);
    assert.deepEqual({ ...populated, traversals: expected.traversals }, expected);
    const populatedHeap = retainedHeap();
    event("memo-populated", { before, populatedHeap, ...populated });
    const warm = measure(pass);
    assert.deepEqual({ ...warm, traversals: expected.traversals }, expected);
    assert.ok(warm.traversals > 0, "positions beyond the global cap must execute native fallback");
    assert.ok(warm.traversals < EXTRA_REFERENCES * 4, "admitted positions must reuse the actual native lookup");
    const warmHeap = retainedHeap();
    const incrementalRetainedBytes = Math.max(populatedHeap, warmHeap) - before;
    assert.ok(incrementalRetainedBytes > 0);
    assert.ok(incrementalRetainedBytes <= RETAINED_LIMIT_BYTES, `memo retained ${incrementalRetainedBytes} bytes`);
    event("memo-warm", { warmHeap, incrementalRetainedBytes, ...warm });
    pass.dispose();
    assert.equal(service.getProgram(), program);
    assert.throws(() => pass.findReferences("/base.ts", 13, options), /disposed/);
    const disposedHeap = retainedHeap();
    const releasedBytes = Math.max(populatedHeap, warmHeap) - disposedHeap;
    assert.ok(releasedBytes >= incrementalRetainedBytes * 0.9, "disposed pass retained its native position table while the service stayed alive");
    const after = measure(service);
    assert.deepEqual({ ...after, traversals: expected.traversals }, expected);
    assert.ok(after.traversals >= CAPACITY, "ordinary lookup must remain native after disposing the memo");
    const runtime = ts.sys.getExecutingFilePath();
    event("complete", {
      passed: true,
      pid: process.pid,
      capacity: CAPACITY,
      inputReferences: CAPACITY + EXTRA_REFERENCES,
      before,
      populatedHeap,
      warmHeap,
      disposedHeap,
      incrementalRetainedBytes,
      releasedBytes,
      nativeFallbackTraversals: warm.traversals,
      defaultTraversals: expected.traversals,
      nativeFingerprint: expected.hash,
      referenceRows: expected.references,
      runtime,
      runtimeVersion: ts.version,
      runtimeSha256: createHash("sha256").update(readFileSync(runtime)).digest("hex"),
      maxRssKiB: process.resourceUsage().maxRSS,
      gcDisturbedRepresentationOnly: true,
    });
  } finally {
    pass?.dispose();
    consumer.getChildren = originalChildren;
    service.dispose();
  }
});
