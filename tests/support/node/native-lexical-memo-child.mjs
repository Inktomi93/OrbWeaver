// One native Program exercises independent admission bounds and combined readonly-pass retention.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { test } from "node:test";
import { ts } from "ts-morph";

const NAME_CAPACITY = 65_536;
const POSITION_CAPACITY = 1_048_576;
const NAME_UNIT_CAPACITY = 8_388_608;
const BULK_POSITIONS = POSITION_CAPACITY - NAME_CAPACITY;
const RETAINED_LIMIT_BYTES = 64 * 1024 * 1024;
const options = { includeDefinitionDisplay: false };
await test("native lexical admission bounds and combined retained ownership", () => {
  assert.equal(typeof globalThis.gc, "function");
  const giantName = `long${"x".repeat(NAME_UNIT_CAPACITY)}`;
  const files = new Map([
    ["/names.ts", `export interface Names {${Array.from({ length: NAME_CAPACITY }, (_, index) => `k${String(index).padStart(5, "0")}:number;`).join("")}}`],
    ["/bulk.ts", `export const bulk=1; export const uses=[${Array.from({ length: BULK_POSITIONS - 1 }, () => "bulk").join(",")}];`],
    ["/spill.ts", `export const spill=1; export const uses=[${Array.from({ length: NAME_CAPACITY + 1 }, () => "spill").join(",")}];`],
    ["/long.ts", `export const ${giantName}=1;`],
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
  const names = program.getSourceFile("/names.ts");
  assert.ok(names);
  const declaration = names.statements.find(ts.isInterfaceDeclaration);
  assert.ok(declaration);
  const queries = [{ file: "/bulk.ts", position: files.get("/bulk.ts").indexOf("bulk") }];
  for (const property of declaration.members) {
    queries.push({ file: names.fileName, position: property.name.getStart(names) });
  }
  const sourceTexts = new Set(files.values());
  const indexOf = String.prototype.indexOf;
  let scans = 0;
  String.prototype.indexOf = function (search, start) {
    if (start === 0 && sourceTexts.has(this)) {
      scans++;
    }
    return indexOf.call(this, search, start);
  };
  const event = (phase, detail = {}) => {
    const row = { phase, elapsedMs: performance.now() - started, ...detail };
    if (phase === "complete") {
      writeFileSync(process.argv[2], JSON.stringify(row));
    }
    console.log(JSON.stringify(row));
  };
  function measure(query, selected = queries) {
    scans = 0;
    const hash = createHash("sha256");
    let references = 0;
    for (const { file, position } of selected) {
      const groups = query.findReferences(file, position, options);
      assert.ok(groups);
      for (const group of groups) {
        hash.update(JSON.stringify(group.definition)).update("\n");
        for (const reference of group.references) {
          hash.update(JSON.stringify(reference)).update("\n");
          references++;
        }
        hash.update("group-end\n");
      }
    }
    return { hash: hash.digest("hex"), references, scans };
  }
  function retainedHeap() {
    globalThis.gc({ type: "major", execution: "sync" });
    return process.memoryUsage().heapUsed;
  }
  let pass;
  try {
    const expected = measure(service);
    assert.equal(expected.references, BULK_POSITIONS + NAME_CAPACITY);
    event("native-warm", expected);
    pass = service.createReadonlyReferencePass();
    const before = retainedHeap();
    const populated = measure(pass);
    assert.deepEqual({ ...populated, scans: expected.scans }, expected);
    const populatedHeap = retainedHeap();
    event("memo-populated", { before, populatedHeap, ...populated });
    const warm = measure(pass);
    assert.deepEqual({ ...warm, scans: expected.scans }, expected);
    assert.equal(warm.scans, 1, "the first key beyond capacity must still execute the native full-file scan");
    const warmHeap = retainedHeap();
    const incrementalRetainedBytes = Math.max(populatedHeap, warmHeap) - before;
    assert.ok(incrementalRetainedBytes > 0 && incrementalRetainedBytes <= RETAINED_LIMIT_BYTES, `combined memos retained ${incrementalRetainedBytes} bytes`);
    event("memo-warm", { warmHeap, incrementalRetainedBytes, ...warm });
    pass.dispose();
    assert.equal(service.getProgram(), program);
    const disposedHeap = retainedHeap();
    const releasedBytes = Math.max(populatedHeap, warmHeap) - disposedHeap;
    assert.ok(releasedBytes >= incrementalRetainedBytes * 0.9, "disposed pass retained lexical/token tables with its service alive");
    assert.throws(() => pass.findReferences("/bulk.ts", 13, options), /disposed/);
    pass = service.createReadonlyReferencePass();
    measure(pass, queries.slice(0, 1));
    const spill = [{ file: "/spill.ts", position: files.get("/spill.ts").indexOf("spill") }];
    const nativeSpill = measure(service, spill);
    const coldSpill = measure(pass, spill);
    const warmSpill = measure(pass, spill);
    assert.deepEqual(coldSpill, nativeSpill);
    assert.deepEqual(warmSpill, nativeSpill);
    assert.ok(warmSpill.scans > 0, "position saturation must retain native fallback even with key room");
    const long = [{ file: "/long.ts", position: 13 }];
    const nativeLong = measure(service, long);
    const coldLong = measure(pass, long);
    const warmLong = measure(pass, [{ file: "/long.ts", position: 14 }]);
    assert.deepEqual(coldLong, nativeLong);
    assert.deepEqual(warmLong, nativeLong);
    assert.ok(warmLong.scans > 0, "name-unit saturation must retain native fallback even with key room");
    pass.dispose();
    const ordinary = measure(service, [queries[1]]);
    assert.ok(ordinary.scans > 0);
    const runtime = ts.sys.getExecutingFilePath();
    event("complete", {
      passed: true,
      pid: process.pid,
      nameCapacity: NAME_CAPACITY,
      positionCapacity: POSITION_CAPACITY,
      nameUnitCapacity: NAME_UNIT_CAPACITY,
      inputQueries: queries.length,
      before,
      populatedHeap,
      warmHeap,
      disposedHeap,
      incrementalRetainedBytes,
      releasedBytes,
      warmScans: warm.scans,
      nativeFingerprint: expected.hash,
      referenceRows: expected.references,
      runtime,
      runtimeVersion: ts.version,
      runtimeSha256: createHash("sha256").update(readFileSync(runtime)).digest("hex"),
      maxRssKiB: process.resourceUsage().maxRSS,
      gcDisturbedRepresentationOnly: true,
    });
  } finally {
    String.prototype.indexOf = indexOf;
    pass?.dispose();
    service.dispose();
  }
});
