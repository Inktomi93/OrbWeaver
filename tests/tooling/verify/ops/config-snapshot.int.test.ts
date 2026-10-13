// Native-loader proof for config-snapshot: executable Vitest config is observed after functions, imports,
// and derived arrays resolve, while absent optional fields remain absence and malformed selectors refuse.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { createVitest } from "vitest/node";
import { readConfigSnapshot } from "../../../../tooling/src/verify/lib/config-snapshot.ts";
import { snapshotDepcruiseConfig, snapshotVitestConfig } from "../../../../tooling/src/verify/ops/config-snapshot.ts";

const CONFIG_REL = "vitest.config.ts";
const DEPCRUISE_CONFIG_REL = ".dependency-cruiser.cjs";

async function plant(root: string, source: string): Promise<void> {
  await writeFile(join(root, CONFIG_REL), source, "utf8");
}

test("loads an async Vitest config and preserves derived selector owner/field identities", async ({ scratch }) => {
  await plant(
    scratch,
    `const suffixes = [".test.ts", ".dom.test.ts"];
export default async () => ({
  test: {
    exclude: ["reports/**"],
    projects: [
      { test: { name: "unit", include: suffixes.map((suffix) => \`tests/**/*\${suffix}\`) } },
      { test: { exclude: ["tests/tooling/**"] } },
    ],
  },
});
`,
  );

  const snapshot = await snapshotVitestConfig(scratch, CONFIG_REL);

  expect(snapshot.selectors).toContainEqual({
    owner: "project[0]:unit",
    field: "test.include",
    values: ["tests/**/*.test.ts", "tests/**/*.dom.test.ts"],
  });
  expect(snapshot.selectors).toContainEqual({ owner: "project[1]", field: "test.exclude", values: ["tests/tooling/**"] });
  expect(snapshot.selectors).not.toContainEqual(expect.objectContaining({ owner: "project[1]", field: "test.include" }));
});

test("refuses a selector that the native loader resolves to a non-string array", async ({ scratch }) => {
  await plant(scratch, "export default { test: { projects: [{ test: { include: [42] } }] } };\n");

  await expect(snapshotVitestConfig(scratch, CONFIG_REL)).rejects.toMatchObject({
    name: "AggregateError",
    message: "Failed to initialize projects. There were errors during projects setup. See below for more details.",
    errors: [expect.objectContaining({ name: "TypeError", message: "pattern.startsWith is not a function" })],
  });
});

test("refuses malformed typecheck selectors after native project resolution", async ({ scratch }) => {
  await plant(scratch, 'export default { test: { projects: [{ test: { name: "typed", typecheck: { include: [42] } } }] } };\n');

  await expect(snapshotVitestConfig(scratch, CONFIG_REL)).rejects.toThrow("project[0]:typed.typecheck.include resolved to a non-string-array selector");
});

test("loads dependency-cruiser through its public API and preserves imported, called and spread-derived selectors", async ({ scratch }) => {
  await writeFile(
    join(scratch, "depcruise-selectors.cjs"),
    'exports.paths = ["^packages/kit/src/"];\nexports.exact = (name) => "^packages/ui/src/" + name + "\\\\.ts$";\n',
    "utf8",
  );
  await writeFile(
    join(scratch, DEPCRUISE_CONFIG_REL),
    `const { exact, paths } = require("./depcruise-selectors.cjs");
module.exports = { forbidden: [{ name: "derived", from: { path: [...paths, exact("live")] }, to: { pathNot: exact("grant") } }] };
`,
    "utf8",
  );

  const snapshot = await snapshotDepcruiseConfig(scratch, DEPCRUISE_CONFIG_REL);

  expect(snapshot).toMatchObject({ runner: "depcruise", effectiveRules: 1 });
  expect(snapshot.selectors).toEqual([
    { owner: "config.forbidden:derived.from", field: "path", position: 0, value: "^packages/kit/src/" },
    { owner: "config.forbidden:derived.from", field: "path", position: 1, value: String.raw`^packages/ui/src/live\.ts$` },
    { owner: "config.forbidden:derived.to", field: "pathNot", position: 0, value: String.raw`^packages/ui/src/grant\.ts$` },
  ]);
});

test("loads the effective dependency-cruiser chain but snapshots only repository-authored selectors", async ({ scratch }) => {
  await writeFile(
    join(scratch, "depcruise-base.cjs"),
    'module.exports = { forbidden: [{ name: "base", from: { path: "^vendor-only/" }, to: {} }] };\n',
    "utf8",
  );
  await writeFile(
    join(scratch, DEPCRUISE_CONFIG_REL),
    'module.exports = { extends: "./depcruise-base.cjs", forbidden: [{ name: "root", from: { path: "^packages/kit/src/" }, to: {} }] };\n',
    "utf8",
  );

  const snapshot = await snapshotDepcruiseConfig(scratch, DEPCRUISE_CONFIG_REL);

  expect(snapshot.effectiveRules).toBe(2);
  expect(snapshot.selectors).toEqual([{ owner: "config.forbidden:root.from", field: "path", position: 0, value: "^packages/kit/src/" }]);
});

test("dependency-cruiser evaluates required helper bytes from the overlay transaction", ({ scratch }) => {
  writeFileSync(join(scratch, DEPCRUISE_CONFIG_REL), 'module.exports = { forbidden: [{ name: "disk", from: { path: "^disk/" }, to: {} }] };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
  const read = readConfigSnapshot(scratch, "depcruise", DEPCRUISE_CONFIG_REL, {
    overlay: {
      [DEPCRUISE_CONFIG_REL]:
        'const { PATH } = require("./depcruise-helper.cjs");\nmodule.exports = { forbidden: [{ name: "overlay", from: { path: PATH }, to: {} }] };\n',
      "depcruise-helper.cjs": 'exports.PATH = "^overlay/";\n',
    },
  });

  expect(read.kind === "ok" ? read.snapshot.selectors : []).toContainEqual({
    owner: "config.forbidden:overlay.from",
    field: "path",
    position: 0,
    value: "^overlay/",
  });
  expect(readFileSync(join(scratch, DEPCRUISE_CONFIG_REL), "utf8")).toContain('name: "disk"');
});

test("the process boundary observes rewritten CommonJS config instead of a stale module cache", async ({ scratch }) => {
  await writeFile(
    join(scratch, DEPCRUISE_CONFIG_REL),
    'module.exports = { forbidden: [{ name: "first", from: { path: "^packages/first/" }, to: {} }] };\n',
    "utf8",
  );
  const first = readConfigSnapshot(scratch, "depcruise", DEPCRUISE_CONFIG_REL);
  expect(first.kind === "ok" ? first.snapshot.selectors[0]?.value : first.detail).toBe("^packages/first/");

  await writeFile(
    join(scratch, DEPCRUISE_CONFIG_REL),
    'module.exports = { forbidden: [{ name: "second", from: { path: "^packages/second/" }, to: {} }] };\n',
    "utf8",
  );
  const second = readConfigSnapshot(scratch, "depcruise", DEPCRUISE_CONFIG_REL);
  expect(second.kind === "ok" ? second.snapshot.selectors[0]?.value : second.detail).toBe("^packages/second/");
});

test("materialization failures stay unreadable", ({ scratch }) => {
  writeFileSync(join(scratch, CONFIG_REL), 'export default { test: { include: ["tests/live.test.ts"] } };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
  expect(readConfigSnapshot(scratch, "vitest", CONFIG_REL, { overlay: { "node_modules/forged.js": "x" } })).toMatchObject({
    kind: "unreadable",
    detail: expect.stringContaining("non-authored"),
  });
});

test("the process boundary evaluates config and relative filesystem sidecars from one overlay transaction", ({ scratch }) => {
  writeFileSync(join(scratch, CONFIG_REL), 'export default { test: { include: ["tests/disk.test.ts"] } };\n');
  writeFileSync(join(scratch, "selector.txt"), "tests/disk.test.ts\n");
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
  const config = `import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nconst value = readFileSync(join(import.meta.dirname, "selector.txt"), "utf8").trim();\nexport default { test: { include: [value] } };\n`;

  const read = readConfigSnapshot(scratch, "vitest", CONFIG_REL, {
    overlay: { [CONFIG_REL]: config, "selector.txt": "tests/overlay.test.ts\n" },
  });

  expect(read.kind === "ok" ? read.snapshot.selectors : []).toContainEqual({
    owner: "root",
    field: "test.include",
    values: ["tests/overlay.test.ts"],
  });
  expect(readFileSync(join(scratch, CONFIG_REL), "utf8")).toContain("tests/disk.test.ts");
  expect(readFileSync(join(scratch, "selector.txt"), "utf8")).toBe("tests/disk.test.ts\n");
  const cache = join(scratch, ".cache");
  expect(existsSync(cache) ? readdirSync(cache).filter((entry) => entry.startsWith("config-snapshot-")) : []).toEqual([]);
});

test("a contained absolute symlink resolves to staged target bytes", ({ scratch }) => {
  writeFileSync(join(scratch, "selector.ts"), 'export const SELECTOR = "tests/disk.test.ts";\n');
  symlinkSync(join(scratch, "selector.ts"), join(scratch, "selector-link.ts"));
  writeFileSync(join(scratch, CONFIG_REL), 'import { SELECTOR } from "./selector-link.ts";\nexport default { test: { include: [SELECTOR] } };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);

  const read = readConfigSnapshot(scratch, "vitest", CONFIG_REL, {
    overlay: { "selector.ts": 'export const SELECTOR = "tests/staged.test.ts";\n' },
  });

  expect(read.kind === "ok" ? read.snapshot.selectors : []).toContainEqual({
    owner: "root",
    field: "test.include",
    values: ["tests/staged.test.ts"],
  });
  expect(readFileSync(join(scratch, "selector.ts"), "utf8")).toContain("tests/disk.test.ts");
});

test("the overlay transaction resolves @orb workspace imports from staged bytes", ({ repoRoot }) => {
  const helper = "tooling/src/floor/testing/test-kinds.ts";
  const original = readFileSync(join(repoRoot, helper), "utf8");
  const config = `import { VITEST_TYPECHECK_GROUP_PREFIX } from "@orb/tooling/floor/testing/test-kinds";\nexport default { test: { include: [VITEST_TYPECHECK_GROUP_PREFIX] } };\n`;
  const overlaid = readConfigSnapshot(repoRoot, "vitest", CONFIG_REL, {
    overlay: { [CONFIG_REL]: config, [helper]: 'export const VITEST_TYPECHECK_GROUP_PREFIX = "tests/staged.test.ts";\n' },
  });
  expect(overlaid.kind, overlaid.kind === "unreadable" ? overlaid.detail : "").toBe("ok");
  expect(overlaid.kind === "ok" ? overlaid.snapshot.selectors : []).toContainEqual({
    owner: "root",
    field: "test.include",
    values: ["tests/staged.test.ts"],
  });
  expect(readFileSync(join(repoRoot, helper), "utf8")).toBe(original);
});

test("the overlay transaction refuses a deleted workspace target instead of resolving the original package", ({ repoRoot }) => {
  const config =
    'import { VITEST_TYPECHECK_GROUP_PREFIX } from "@orb/tooling/floor/testing/test-kinds";\nexport default { test: { include: [VITEST_TYPECHECK_GROUP_PREFIX + "*.test.ts"] } };\n';
  const deleted = readConfigSnapshot(repoRoot, "vitest", CONFIG_REL, {
    overlay: { [CONFIG_REL]: config, tooling: null },
  });
  expect(deleted).toMatchObject({ kind: "unreadable" });
  expect(deleted.kind === "unreadable" ? deleted.detail : "").toContain('Missing "./floor/testing/test-kinds" specifier');
});

test("an overlay entry with a parent-traversal path refuses instead of escaping the stage root", ({ scratch }) => {
  writeFileSync(join(scratch, CONFIG_REL), 'export default { test: { include: ["tests/live.test.ts"] } };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
  const read = readConfigSnapshot(scratch, "vitest", CONFIG_REL, {
    overlay: { "../../escape.ts": "export const ESCAPED = true;\n" },
  });

  expect(read).toMatchObject({ kind: "unreadable" });
  expect(read.kind === "unreadable" ? read.detail : "").toContain("invalid segment");
});

test("an overlaid workspace manifest cannot redirect a package link outside the owned stage", ({ scratch }) => {
  mkdirSync(join(scratch, "tooling"));
  writeFileSync(join(scratch, "tooling/package.json"), JSON.stringify({ name: "@orb/tooling", private: true }));
  writeFileSync(join(scratch, CONFIG_REL), 'export default { test: { include: ["tests/live.test.ts"] } };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
  const escaped = join(scratch, "escaped-link");
  const read = readConfigSnapshot(scratch, "vitest", CONFIG_REL, {
    overlay: { "tooling/package.json": JSON.stringify({ name: "../../../escaped-link", private: true }) },
  });
  const leaked = lstatSync(escaped, { throwIfNoEntry: false });

  expect(read).toMatchObject({ kind: "unreadable" });
  expect(leaked).toBeUndefined();
});

test("a symlinked workspace manifest keeps its staged target bytes instead of receiving a tombstone", ({ scratch }) => {
  mkdirSync(join(scratch, "tooling/src"), { recursive: true });
  writeFileSync(join(scratch, "tooling/src/disk.ts"), 'export const SELECTOR = "tests/disk.test.ts";\n');
  writeFileSync(join(scratch, "tooling/src/overlay.ts"), 'export const SELECTOR = "tests/overlay.test.ts";\n');
  const diskManifest = { name: "@orb/tooling", private: true, exports: { "./x": "./src/disk.ts" } };
  const overlayManifest = { name: "@orb/tooling", private: true, exports: { "./x": "./src/overlay.ts" } };
  writeFileSync(join(scratch, "tooling-manifest.json"), `${JSON.stringify(diskManifest)}\n`);
  symlinkSync("../tooling-manifest.json", join(scratch, "tooling/package.json"));
  writeFileSync(join(scratch, CONFIG_REL), 'import { SELECTOR } from "@orb/tooling/x";\nexport default { test: { include: [SELECTOR] } };\n');
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);

  const read = readConfigSnapshot(scratch, "vitest", CONFIG_REL, {
    overlay: { "tooling-manifest.json": `${JSON.stringify(overlayManifest)}\n` },
  });

  expect(read.kind === "ok" ? read.snapshot.selectors : []).toContainEqual({
    owner: "root",
    field: "test.include",
    values: ["tests/overlay.test.ts"],
  });
  expect(JSON.parse(readFileSync(join(scratch, "tooling-manifest.json"), "utf8"))).toEqual(diskManifest);
});

test("refuses malformed dependency-cruiser selector values after native evaluation", async ({ scratch }) => {
  await writeFile(
    join(scratch, DEPCRUISE_CONFIG_REL),
    'module.exports = { forbidden: [{ name: "broken", from: { path: ["^packages/", 42] }, to: {} }] };\n',
    "utf8",
  );

  await expect(snapshotDepcruiseConfig(scratch, DEPCRUISE_CONFIG_REL)).rejects.toThrow("resolved to an empty or non-string selector");
});

test("Vitest natively collects exact files, not empty or directory includes, while a directory exclude is recursive", async ({ scratch }) => {
  await mkdir(join(scratch, "tests/excluded"), { recursive: true });
  await writeFile(join(scratch, "tests/live.test.ts"), "export const live = 1;\n", "utf8");
  await writeFile(join(scratch, "tests/excluded/hidden.test.ts"), "export const hidden = 1;\n", "utf8");
  await plant(
    scratch,
    `export default { test: { projects: [
  { test: { name: "empty", include: [""] } },
  { test: { name: "directory", include: ["tests"] } },
  { test: { name: "exact", include: ["tests/live.test.ts"] } },
  { test: { name: "exclude-directory", include: ["tests/**/*.test.ts"], exclude: ["tests/excluded"] } },
] } };\n`,
  );

  const vitest = await createVitest({ root: scratch, config: CONFIG_REL, run: true, watch: false });
  try {
    const collected = new Map<string, readonly string[]>();
    for (const project of vitest.projects) {
      collected.set(project.name, (await project.globTestFiles()).testFiles);
    }
    expect(collected.get("empty")).toEqual([]);
    expect(collected.get("directory")).toEqual([]);
    expect(collected.get("exact")).toEqual([join(scratch, "tests/live.test.ts")]);
    expect(collected.get("exclude-directory")).toEqual([join(scratch, "tests/live.test.ts")]);
  } finally {
    await vitest.close();
  }
});

test("Vitest accepts a globalSetup directory and executes its index module", async ({ scratch }) => {
  const marker = join(scratch, "global-setup-ran");
  await mkdir(join(scratch, "tests/setup"), { recursive: true });
  await writeFile(
    join(scratch, "tests/setup/index.ts"),
    `import { writeFileSync } from "node:fs";\nexport function setup() { writeFileSync(${JSON.stringify(marker)}, "ran"); }\n`,
    "utf8",
  );
  await writeFile(join(scratch, "tests/live.test.ts"), 'import { expect, test } from "vitest";\ntest("live", () => expect(1).toBe(1));\n', "utf8");
  await plant(scratch, 'export default { test: { include: ["tests/live.test.ts"], globalSetup: ["tests/setup"], reporters: [] } };\n');

  const vitest = await createVitest({ root: scratch, config: CONFIG_REL, run: true, watch: false, reporters: [] });
  try {
    await vitest.start();
    expect(existsSync(marker)).toBe(true);
  } finally {
    await vitest.close();
  }
});

test("dependency-cruiser rule identity refuses missing and duplicate names", async ({ plantedTree }) => {
  for (const [rules, message] of [
    ['{ from: { path: "^packages/kit/" }, to: {} }', "has no rule name"],
    ['{ name: "same", from: { path: "^packages/kit/" }, to: {} }, { name: "same", from: { path: "^packages/ui/" }, to: {} }', "duplicate rule name"],
  ] as const) {
    const root = await plantedTree({ [DEPCRUISE_CONFIG_REL]: `module.exports = { forbidden: [${rules}] };\n` });
    await expect(snapshotDepcruiseConfig(root, DEPCRUISE_CONFIG_REL)).rejects.toThrow(message);
  }
});
