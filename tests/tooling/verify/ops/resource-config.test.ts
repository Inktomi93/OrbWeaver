import { Project, SyntaxKind } from "ts-morph";
import { loadPackageMetadata, loadStaticConfig } from "../../../../tooling/src/verify/ops/resource-config.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function parser(): (path: string, text: string) => import("ts-morph").SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  return (path, text) => project.createSourceFile(path, text, { overwrite: true });
}

test("loads validated package scripts, dependency classes, and exports", async ({ plantedTree }) => {
  const source = JSON.stringify({
    name: "@orb/ui",
    private: true,
    scripts: { "tokens:build": "node tokens.build.ts" },
    dependencies: { "@orb/kit": "workspace:*" },
    devDependencies: { react: "catalog:" },
    exports: { "./button": "./src/primitives/button/index.ts" },
  });
  const root = await plantedTree({ "packages/ui/package.json": source });
  const result = loadPackageMetadata(createResourceReader({ root }), "ui");
  expect(result).toMatchObject({
    status: "ready",
    members: 1,
    value: {
      name: "@orb/ui",
      scripts: { "tokens:build": "node tokens.build.ts" },
      dependencies: { runtime: { "@orb/kit": "workspace:*" }, development: { react: "catalog:" } },
      exports: { "./button": "./src/primitives/button/index.ts" },
    },
  });
});

test("package metadata refuses malformed JSON, missing identity, malformed fact maps, and forged ids", async ({ plantedTree }) => {
  const malformed = await plantedTree({ "packages/ui/package.json": "{" });
  const missingName = await plantedTree({ "packages/ui/package.json": JSON.stringify({ private: true }) });
  const invalid = await plantedTree({
    "packages/ui/package.json": JSON.stringify({ name: "@orb/ui", private: true, scripts: { build: 1 } }),
  });
  expect(loadPackageMetadata(createResourceReader({ root: malformed }), "ui").status).toBe("unresolved");
  expect(loadPackageMetadata(createResourceReader({ root: missingName }), "ui").status).toBe("unresolved");
  expect(loadPackageMetadata(createResourceReader({ root: invalid }), "ui").status).toBe("unresolved");
  expect(loadPackageMetadata(createResourceReader({ root: invalid }), "forged" as never).status).toBe("unresolved");
});

test("static configs expose only anchored selection rows and count those rows", async ({ plantedTree }) => {
  const root = await plantedTree({
    "vitest.config.ts":
      'const SERIAL = ["tests/a.int.test.ts"] as const;\nexport default { test: { include: ["tests/**/*.test.ts"], exclude: [...SERIAL], globalSetup: "./tests/setup.ts" } };\n',
  });
  const result = loadStaticConfig(createResourceReader({ root }), "vitest", parser());
  expect(result).toMatchObject({
    status: "ready",
    members: 3,
    value: {
      rows: [
        { key: "include", value: "tests/**/*.test.ts", line: 2 },
        { key: "exclude", value: "tests/a.int.test.ts", line: 1 },
        { key: "globalSetup", value: "./tests/setup.ts", line: 2 },
      ],
    },
  });
});

test("static config scans property assignments once across its key families", async ({ plantedTree }) => {
  const text = 'module.exports = { forbidden: [{ from: { path: ["^a$"] }, to: { pathNot: ["^b$"] } }] };';
  const root = await plantedTree({ ".dependency-cruiser.cjs": text });
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const source = project.createSourceFile(".dependency-cruiser.cjs", text);
  const getDescendantsOfKind = source.getDescendantsOfKind.bind(source);
  let propertyScans = 0;
  source.getDescendantsOfKind = ((kind: SyntaxKind) => {
    propertyScans += Number(kind === SyntaxKind.PropertyAssignment);
    return getDescendantsOfKind(kind);
  }) as typeof source.getDescendantsOfKind;
  const result = loadStaticConfig(createResourceReader({ root }), "depcruise", () => source);
  expect(propertyScans).toBe(1);
  expect(result).toMatchObject({
    status: "ready",
    members: 2,
    value: {
      rows: [
        { key: "path", value: "^a$", line: 1 },
        { key: "pathNot", value: "^b$", line: 1 },
      ],
    },
  });
});

test("static configs refuse missing, broken, empty, cyclic, written, and dynamic rows", async ({ plantedTree }) => {
  const parse = parser();
  const missing = await plantedTree({ "keep.txt": "x" });
  const broken = await plantedTree({ "eslint.config.js": "export default [{ files: [ ;" });
  const empty = await plantedTree({ "eslint.config.js": "export default [];" });
  const cyclic = await plantedTree({ "eslint.config.js": "const A = B; const B = A; export default [{ files: A }];" });
  const written = await plantedTree({ "eslint.config.js": 'let A = ["a.ts"]; A = ["b.ts"]; export default [{ files: A }];' });
  const dynamic = await plantedTree({ "eslint.config.js": "export default [{ files: makeRows() }];" });
  expect(loadStaticConfig(createResourceReader({ root: missing }), "eslint", parse).status).toBe("missing");
  expect(loadStaticConfig(createResourceReader({ root: broken }), "eslint", parse).status).toBe("unresolved");
  expect(loadStaticConfig(createResourceReader({ root: empty }), "eslint", parse).status).toBe("empty");
  expect(loadStaticConfig(createResourceReader({ root: cyclic }), "eslint", parse).status).toBe("unresolved");
  expect(loadStaticConfig(createResourceReader({ root: written }), "eslint", parse).status).toBe("unresolved");
  expect(loadStaticConfig(createResourceReader({ root: dynamic }), "eslint", parse).status).toBe("unresolved");
  expect(loadStaticConfig(createResourceReader({ root: dynamic }), "forged" as never, parse).status).toBe("unresolved");
});

test("static collection rows refuse mutation through direct and aliased bindings", async ({ plantedTree }) => {
  const cases = {
    method: 'const A = ["a.ts"]; A.push("b.ts"); export default [{ files: A }];',
    alias: 'const A = ["a.ts"]; const B = A; B.push("b.ts"); export default [{ files: A }];',
    element: 'const A = ["a.ts"]; A[0] = "b.ts"; export default [{ files: A }];',
    call: 'const A = ["a.ts"]; Object.assign(A, ["b.ts"]); export default [{ files: A }];',
    shorthand: 'const A = ["a.ts"]; const box = { A }; box.A.push("b.ts"); export default [{ files: A }];',
    property: 'const A = ["a.ts"]; const box = { value: A }; box.value.push("b.ts"); export default [{ files: A }];',
    array: 'const A = ["a.ts"]; const box = [A]; box[0]?.push("b.ts"); export default [{ files: A }];',
    returned: 'const A = ["a.ts"]; function leak() { return A; } export default [{ files: A }];',
  };
  for (const [name, source] of Object.entries(cases)) {
    const root = await plantedTree({ "eslint.config.js": source });
    expect(loadStaticConfig(createResourceReader({ root }), "eslint", parser()).status, name).toBe("unresolved");
  }
});

test("static config refuses a parser result for different text or path", async ({ plantedTree }) => {
  const root = await plantedTree({ "eslint.config.js": 'export default [{ files: ["a.ts"] }];' });
  const reader = createResourceReader({ root });
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  expect(loadStaticConfig(reader, "eslint", () => project.createSourceFile("eslint.config.js", "export default [];"))).toMatchObject({ status: "unresolved" });
  expect(loadStaticConfig(reader, "eslint", (_path, text) => project.createSourceFile("other.config.js", text, { overwrite: true }))).toMatchObject({
    status: "unresolved",
  });
});

test("static config refuses values resolved from an undeclared imported resource", async ({ plantedTree }) => {
  const cases = [
    {
      config: 'import { ROWS } from "./rows.js"; export default [{ files: ROWS }];',
      dependency: 'export const ROWS = ["a.ts"];',
    },
    {
      config: 'import { ROW } from "./rows.js"; export default [{ files: [ROW] }];',
      dependency: 'const PREFIX = "a"; export const ROW = `${PREFIX}.ts`;',
    },
  ];
  for (const { config, dependency } of cases) {
    const root = await plantedTree({ "eslint.config.js": config });
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true, moduleResolution: 2 } });
    project.createSourceFile("rows.js", dependency);
    const result = loadStaticConfig(createResourceReader({ root }), "eslint", (path, text) => project.createSourceFile(path, text, { overwrite: true }));
    expect(result.status).toBe("unresolved");
  }
});

test("the current root package produces typed facts", ({ repoRoot }) => {
  const reader = createResourceReader({ root: repoRoot });
  expect(loadPackageMetadata(reader, "root").status).toBe("ready");
});

test("the current showcase package produces typed facts", ({ repoRoot }) => {
  const reader = createResourceReader({ root: repoRoot });
  expect(loadPackageMetadata(reader, "showcase-plugins")).toMatchObject({ status: "ready", value: { name: "@orb/showcase-plugins" } });
});

for (const id of ["eslint", "depcruise", "vitest", "playwright", "ct"] as const) {
  test(`the current ${id} config produces nonempty typed facts`, ({ repoRoot }) => {
    const reader = createResourceReader({ root: repoRoot });
    const result =
      id === "eslint" || id === "depcruise" || id === "vitest"
        ? createResourceHost({ root: repoRoot }).host.nativeConfig(id)
        : loadStaticConfig(reader, id, parser());
    expect(result.status, id).toBe("ready");
    expect(result.members, id).toBeGreaterThan(0);
  });
}
