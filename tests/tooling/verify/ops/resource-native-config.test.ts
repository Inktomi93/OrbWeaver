import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadNativeConfig } from "../../../../tooling/src/verify/ops/resource-native-config.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** `loadNativeConfig` walks the whole tracked+untracked inventory through git; unit-level reads need a real repo. */
function gitInit(root: string): void {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

test("loads a ready snapshot from disk, its paths and member count reflecting the whole authored transaction", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), 'export default { test: { include: ["tests/disk.test.ts"] } };');
  gitInit(scratch);
  const options = { root: scratch };
  const result = loadNativeConfig(createResourceReader(options), options, "vitest");
  expect(result).toMatchObject({
    status: "ready",
    paths: ["vitest.config.ts"],
    value: {
      runner: "vitest",
      config: "vitest.config.ts",
      selectors: expect.arrayContaining([{ owner: "root", field: "test.include", values: ["tests/disk.test.ts"] }]),
    },
  });
  expect(result.status === "ready" ? result.members : -1).toBeGreaterThan(0);
});

test("an edited overlay changes the observed selectors beyond what disk-only success would certify", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), 'import { ROWS } from "./rows.js"; export default { test: { include: ROWS } };');
  writeFileSync(join(scratch, "rows.js"), 'export const ROWS = ["tests/disk.test.ts"];');
  gitInit(scratch);
  const overlayOptions = { root: scratch, overlay: { "rows.js": 'export const ROWS = ["tests/overlay.test.ts"];' } };
  const overlaid = loadNativeConfig(createResourceReader(overlayOptions), overlayOptions, "vitest");
  expect(overlaid).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([{ owner: "root", field: "test.include", values: ["tests/overlay.test.ts"] }]) },
  });
  expect(overlaid.paths).toEqual(["rows.js", "vitest.config.ts"]);

  // The unmodified disk reader for the SAME root proves the overlay result above is not just the disk value —
  // a disk-only read of this root produces a different selector, so disk-only success cannot certify the overlay.
  const diskOptions = { root: scratch };
  const diskOnly = loadNativeConfig(createResourceReader(diskOptions), diskOptions, "vitest");
  expect(diskOnly).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([{ owner: "root", field: "test.include", values: ["tests/disk.test.ts"] }]) },
  });
});

// The same closure proof for the OTHER two runners (#1584 resume step 2: a native observation must
// evaluate the virtual bytes the ResourceReader transaction represents, and disk-only success cannot
// certify an edited overlay). `ops/config-snapshot.int.test.ts` proves the process boundary stages helper
// bytes for both; these two arms prove it at the seam a POLICY actually consumes — `loadNativeConfig` —
// and each carries the disk-only counter-read that shows the unedited tree would have reported the other
// value, so the overlay result cannot be a disk read wearing an overlay's name.
test("an edited ESLint overlay changes the observed selectors, and the disk-only read of the same root does not", ({ scratch }) => {
  writeFileSync(join(scratch, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(scratch, "eslint.config.js"), 'import { FILES } from "./selector-values.js";\nexport default [{ name: "disk", files: FILES }];\n');
  writeFileSync(join(scratch, "selector-values.js"), 'export const FILES = ["disk/**/*.js"];\n');
  gitInit(scratch);

  const overlayOptions = { root: scratch, overlay: { "selector-values.js": 'export const FILES = ["src/**/*.js"];\n' } };
  const overlaid = loadNativeConfig(createResourceReader(overlayOptions), overlayOptions, "eslint");
  expect(overlaid).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([expect.objectContaining({ owner: "config[0]:disk", field: "files", value: "src/**/*.js" })]) },
  });

  const diskOptions = { root: scratch };
  const diskOnly = loadNativeConfig(createResourceReader(diskOptions), diskOptions, "eslint");
  expect(diskOnly).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([expect.objectContaining({ owner: "config[0]:disk", field: "files", value: "disk/**/*.js" })]) },
  });
});

test("an edited dependency-cruiser overlay changes the observed selectors, and the disk-only read of the same root does not", ({ scratch }) => {
  writeFileSync(
    join(scratch, ".dependency-cruiser.cjs"),
    'const { PATH } = require("./depcruise-helper.cjs");\nmodule.exports = { forbidden: [{ name: "r", from: { path: PATH }, to: {} }] };\n',
  );
  writeFileSync(join(scratch, "depcruise-helper.cjs"), 'exports.PATH = "^disk/";\n');
  gitInit(scratch);

  const overlayOptions = { root: scratch, overlay: { "depcruise-helper.cjs": 'exports.PATH = "^overlay/";\n' } };
  const overlaid = loadNativeConfig(createResourceReader(overlayOptions), overlayOptions, "depcruise");
  expect(overlaid).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([expect.objectContaining({ field: "path", value: "^overlay/" })]) },
  });

  const diskOptions = { root: scratch };
  const diskOnly = loadNativeConfig(createResourceReader(diskOptions), diskOptions, "depcruise");
  expect(diskOnly).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([expect.objectContaining({ field: "path", value: "^disk/" })]) },
  });
});

test("an overlay deletion removes the deleted path from the reported inventory", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), 'export default { test: { include: ["tests/disk.test.ts"] } };');
  writeFileSync(join(scratch, "extra.txt"), "unrelated tracked file");
  gitInit(scratch);
  const options = { root: scratch, overlay: { "extra.txt": null } };
  const result = loadNativeConfig(createResourceReader(options), options, "vitest");
  expect(result.status).toBe("ready");
  expect(result.paths).toEqual(["vitest.config.ts"]);
});

test("refuses an unknown native config id before any disk or repository read", ({ scratch }) => {
  // No git init: reaching the repository-inventory step would throw, so a clean refusal here proves the
  // unknown-id check runs first.
  const options = { root: scratch };
  const result = loadNativeConfig(createResourceReader(options), options, "forged" as never);
  expect(result).toMatchObject({ status: "unresolved", paths: [], members: 0, reason: expect.stringContaining("unknown native config: forged") });
});

test("refuses a missing root config before touching the repository inventory", ({ scratch }) => {
  // No git init here either, for the same reason: this only proves the short-circuit if reaching git would fail.
  const options = { root: scratch };
  const result = loadNativeConfig(createResourceReader(options), options, "vitest");
  expect(result.status).toBe("missing");
});

test("refuses an empty root config before touching the repository inventory", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), "");
  const options = { root: scratch };
  const result = loadNativeConfig(createResourceReader(options), options, "vitest");
  expect(result.status).toBe("empty");
});

test("refuses malformed executable config content after a valid repository inventory resolves", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), "export default {");
  gitInit(scratch);
  const options = { root: scratch };
  const result = loadNativeConfig(createResourceReader(options), options, "vitest");
  expect(result).toMatchObject({ status: "unresolved", members: 0, paths: ["vitest.config.ts"], reason: expect.any(String) });
});

test("does not catch its own repository-inventory failure — callers outside ResourceHost's cache must handle the throw", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), 'export default { test: { include: ["tests/x.test.ts"] } };');
  // Deliberately no git init: the root config read succeeds, so the next step (git ls-files) is reached and fails.
  const options = { root: scratch };
  expect(() => loadNativeConfig(createResourceReader(options), options, "vitest")).toThrow();
});
