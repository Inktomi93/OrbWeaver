import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { assertGateFactDescriptor, assertGatePolicyDescriptor } from "../../../../tooling/src/verify/lib/policy-validation.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function writeModules(root: string, modules: Readonly<Record<string, string>>): void {
  for (const [name, source] of Object.entries(modules)) {
    const path = join(root, "tooling/src/verify/gates", name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
}

interface ModuleOptions {
  readonly analysis?: "syntax" | "types" | "resource";
  readonly family?: string;
  readonly proofMode?: "source" | "types" | "resource";
  readonly population?: string;
  readonly exportName?: string;
  readonly extra?: string;
  readonly prototype?: string;
  readonly severity?: "error" | "warning";
  readonly secondDescriptor?: boolean;
  readonly resources?: string;
}

function moduleSource(repoRoot: string, id: string, options: ModuleOptions = {}): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const analysis = options.analysis ?? "syntax";
  const proofMode = options.proofMode ?? "source";
  const population = options.population ?? '"@tooling"';
  const exportName = options.exportName ?? "gate";
  const proofPath = proofMode === "resource" ? "resources/policy.json" : "tooling/src/proof.ts";
  const fields = `{
    id: ${JSON.stringify(id)},
    family: ${JSON.stringify(options.family ?? id)},
    authority: "hard",
    severity: ${JSON.stringify(options.severity ?? "error")},
    population: ${population},
    analysis: ${JSON.stringify(analysis)},
    execution: "selected-files",
    facts: [],
    resources: ${options.resources ?? "[]"},
    message: "fixture policy",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: ${JSON.stringify(proofMode)}, files: { ${JSON.stringify(proofPath)}: "export const planted = true;\\n" }, why: "founding defect" }],
    mustPass: [{ mode: ${JSON.stringify(proofMode)}, files: { ${JSON.stringify(proofPath)}: "export const clean = true;\\n" }, why: "nearest legal shape" }],
    ${options.extra ?? ""}
  }`;
  const descriptorValue = options.prototype === undefined ? fields : `Object.assign(Object.create(${options.prototype}), ${fields})`;
  const descriptor = `defineGate(${descriptorValue} as never)`;
  return `import { defineGate } from ${JSON.stringify(contract)};\nexport const ${exportName} = ${descriptor};\n${
    options.secondDescriptor === true ? `export const second = ${descriptor};\n` : ""
  }`;
}

test("loads a valid corpus in deterministic path order", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "z-policy.ts": moduleSource(repoRoot, "z-policy"),
    "a-policy.ts": moduleSource(repoRoot, "a-policy"),
  });
  const corpus = await loadPolicyCorpus(scratch);
  expect(corpus.files).toEqual(["tooling/src/verify/gates/a-policy.ts", "tooling/src/verify/gates/z-policy.ts"]);
  expect(corpus.gates.map(({ id }) => id)).toEqual(["a-policy", "z-policy"]);
  expect(corpus.families).toEqual(["a-policy", "z-policy"]);
});

test("shared fact descriptors are branded, exact, and restricted to entire-population consumers", () => {
  const fact = defineFact({
    id: "fixture-fact",
    population: "@tooling",
    analysis: "syntax",
    resources: [],
    create: (ctx) => ({
      finish: () => {
        ctx.receipt({ kind: "population", source: "fixture-fact", members: 1 });
        return 1;
      },
    }),
  });
  expect(() => assertGateFactDescriptor(fact)).not.toThrow();
  expect(() => assertGateFactDescriptor({ ...fact })).toThrow(/defineFact|brand/i);
  expect(() => assertGateFactDescriptor(defineFact({ ...fact, extra: true } as never))).toThrow(/unknown.*extra/i);

  const policy = defineGate({
    id: "fact-consumer",
    family: "fact-consumer",
    authority: "hard",
    severity: "error",
    population: "@tooling",
    analysis: "syntax",
    execution: "selected-files",
    facts: [fact],
    resources: [],
    message: "fixture",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, why: "nearest legal shape" }],
  });
  expect(() => assertGatePolicyDescriptor(policy)).toThrow(/shared facts.*entire population|entire-population/i);

  const duplicate = defineGate({ ...policy, execution: "entire-population", facts: [fact, fact] });
  expect(() => assertGatePolicyDescriptor(duplicate)).toThrow(/duplicate.*fixture-fact/i);
});

/** A minimal valid resource policy to mutate one field of at a time. */
function resourcePolicy(overrides: Partial<Parameters<typeof defineGate>[0]> = {}): unknown {
  return defineGate({
    id: "resource-shape",
    family: "resource-shape",
    authority: "hard",
    severity: "error",
    population: { of: "none", why: "resource subjects only" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "json", id: "biome" }],
    message: "fixture",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "resource", files: { "biome.json": "{}" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { "biome.json": "{}" }, why: "nearest legal shape" }],
    ...overrides,
  } as Parameters<typeof defineGate>[0]);
}

test("an installed-package request declares a closed MODE, and `file` is required exactly for text", () => {
  expect(() => assertGatePolicyDescriptor(resourcePolicy({ resources: [{ kind: "installed-package", id: "base-ui", mode: "ast" }] }))).not.toThrow();
  expect(() =>
    assertGatePolicyDescriptor(resourcePolicy({ resources: [{ kind: "installed-package", id: "playwright-core", mode: "text", file: "browsers.json" }] })),
  ).not.toThrow();
  // The four malformed shapes below are ALREADY refused by tsc — the closed `InstalledPackageRequest` union
  // makes each one a type error, which is the stronger enforcement tier. The casts reach past it to prove
  // the RUNTIME backstop, which is what actually judges a loaded module the compiler never saw.
  const malformed = (request: unknown): unknown => resourcePolicy({ resources: [request] as never });
  // A `text` request with no file would read nothing; an `ast` request with one carries a file nobody reads.
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "installed-package", id: "base-ui", mode: "text" }))).toThrow(/file.*nonempty|unknown property/i);
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "installed-package", id: "base-ui", mode: "ast", file: "x.js" }))).toThrow(
    /unknown property.*file/i,
  );
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "installed-package", id: "base-ui", mode: "types" }))).toThrow(/mode/i);
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "installed-package", id: "nope", mode: "ast" }))).toThrow(/id is unknown/i);
});

test("the same installed package in two MODES is two declarations, not a duplicate", () => {
  // Collapsing them would let one declaration authorize the other; the mode and the named file are part of
  // the request identity.
  expect(() =>
    assertGatePolicyDescriptor(
      resourcePolicy({
        resources: [
          { kind: "installed-package", id: "base-ui", mode: "ast" },
          { kind: "installed-package", id: "base-ui", mode: "metadata" },
        ],
      }),
    ),
  ).not.toThrow();
  expect(() =>
    assertGatePolicyDescriptor(
      resourcePolicy({
        resources: [
          { kind: "installed-package", id: "base-ui", mode: "ast" },
          { kind: "installed-package", id: "base-ui", mode: "ast" },
        ],
      }),
    ),
  ).toThrow(/duplicate/i);
});

test("authored-text cannot be declared without a door that ADMITS paths", () => {
  // It reads only what a sibling admitted, so declared alone it can return nothing but `unacquired`
  // refusals — a door structurally guaranteed to answer nothing, which reads like a clean corpus.
  expect(() => assertGatePolicyDescriptor(resourcePolicy({ resources: [{ kind: "authored-text" }] }))).toThrow(/authored-text.*admits paths/i);
  expect(() =>
    assertGatePolicyDescriptor(
      resourcePolicy({ resources: [{ kind: "authored-text" }, { kind: "authored-path" }, { kind: "installed-package", id: "base-ui", mode: "ast" }] }),
    ),
  ).toThrow(/authored-text.*admits paths/i);
  expect(() => assertGatePolicyDescriptor(resourcePolicy({ resources: [{ kind: "authored-text" }, { kind: "authored-tree", id: "docs" }] }))).not.toThrow();
  // `authored-path` has no such rule: its selectors are arbitrary by design, so it stands alone.
  expect(() => assertGatePolicyDescriptor(resourcePolicy({ resources: [{ kind: "authored-path" }] }))).not.toThrow();
});

test("a proof `links` map is resource-mode only and cannot collide with a declared file", () => {
  const linked = (links: Record<string, string>): unknown =>
    resourcePolicy({ mustPass: [{ mode: "resource", files: { "biome.json": "{}" }, links, why: "w" }] });
  expect(() => assertGatePolicyDescriptor(linked({ "selector.ts": ".." }))).not.toThrow();
  // A VIRTUAL fixture has no filesystem to link on; silently ignoring the map would make the row a no-op
  // that reads like a passing symlink proof.
  const virtualLink = resourcePolicy({
    analysis: "syntax",
    population: "@tooling",
    resources: [],
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const p = 1;\n" }, why: "w" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const c = 1;\n" }, links: { "selector.ts": ".." }, why: "w" }],
  });
  expect(() => assertGatePolicyDescriptor(virtualLink)).toThrow(/links.*resource mode/i);
  // Written-and-then-linked is ambiguous: the proof would describe whichever won.
  expect(() => assertGatePolicyDescriptor(linked({ "biome.json": ".." }))).toThrow(/also a declared file/i);
  expect(() => assertGatePolicyDescriptor(linked({}))).toThrow(/links.*nonempty/i);
  expect(() => assertGatePolicyDescriptor(linked({ "/absolute.ts": ".." }))).toThrow(/repo-relative/i);
});

test("refuses an absent or empty corpus", async ({ scratch }) => {
  await expect(loadPolicyCorpus(join(scratch, "absent"))).rejects.toThrow(/zero|empty|no gate/i);
  const empty = join(scratch, "empty");
  mkdirSync(join(empty, "tooling/src/verify/gates"), { recursive: true });
  await expect(loadPolicyCorpus(empty)).rejects.toThrow(/zero|empty|no gate/i);
});

test("singleton families equal their sole id while a shared family requires at least two policies", async ({ repoRoot, scratch }) => {
  const singleton = join(scratch, "singleton");
  writeModules(singleton, { "only-policy.ts": moduleSource(repoRoot, "only-policy", { family: "stale-family" }) });
  await expect(loadPolicyCorpus(singleton)).rejects.toThrow(/singleton.*family|sole.*id/i);

  const shared = join(scratch, "shared");
  writeModules(shared, {
    "first-policy.ts": moduleSource(repoRoot, "first-policy", { family: "shared-family" }),
    "second-policy.ts": moduleSource(repoRoot, "second-policy", { family: "shared-family" }),
  });
  const corpus = await loadPolicyCorpus(shared);
  expect(corpus.families).toEqual(["shared-family"]);
  expect(corpus.gates.map(({ id }) => id)).toEqual(["first-policy", "second-policy"]);
});

test("refuses a legacy descriptor and unknown descriptor fields", async ({ repoRoot, scratch }) => {
  writeModules(scratch, { "legacy-policy.ts": `export const gate = { name: "legacy-policy", status: "active", scopeSafety: "whole-project", run() {} };\n` });
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(/defineGate|descriptor/i);

  const extraRoot = join(scratch, "extra");
  writeModules(extraRoot, { "extra-policy.ts": moduleSource(repoRoot, "extra-policy", { extra: "scanRoot: () => true," }) });
  await expect(loadPolicyCorpus(extraRoot)).rejects.toThrow(/unknown.*scanRoot/i);
});

test("refuses filename/id mismatch, duplicate ids, missing gate, and multiple descriptors", async ({ repoRoot, scratch }) => {
  const mismatch = join(scratch, "mismatch");
  writeModules(mismatch, { "file-name.ts": moduleSource(repoRoot, "other-name") });
  await expect(loadPolicyCorpus(mismatch)).rejects.toThrow(/must equal.*filename/i);

  const duplicate = join(scratch, "duplicate");
  writeModules(duplicate, { "first.ts": moduleSource(repoRoot, "same-policy"), "second.ts": moduleSource(repoRoot, "same-policy") });
  await expect(loadPolicyCorpus(duplicate)).rejects.toThrow(/duplicate.*same-policy/i);

  const missing = join(scratch, "missing");
  writeModules(missing, { "missing-policy.ts": "export const helper = true;\n" });
  await expect(loadPolicyCorpus(missing)).rejects.toThrow(/exactly one.*gate/i);

  const multiple = join(scratch, "multiple");
  writeModules(multiple, { "multiple-policy.ts": moduleSource(repoRoot, "multiple-policy", { secondDescriptor: true }) });
  await expect(loadPolicyCorpus(multiple)).rejects.toThrow(/exactly one.*descriptor/i);
});

test("validates every required axis and the population expression", async ({ repoRoot, scratch }) => {
  const invalidRows: Readonly<Record<string, string>> = {
    "bad-id.ts": moduleSource(repoRoot, "Bad_Id"),
    "bad-population.ts": moduleSource(repoRoot, "bad-population", { population: "{ in: [] }" }),
    "bad-none.ts": moduleSource(repoRoot, "bad-none", { population: '{ of: "none", why: "resource only" }' }),
    "bad-message.ts": moduleSource(repoRoot, "bad-message").replace('message: "fixture policy"', 'message: " "'),
    "bad-create.ts": moduleSource(repoRoot, "bad-create").replace("create: () => ({ evaluate: () => undefined })", "create: true"),
  };
  for (const [name, source] of Object.entries(invalidRows)) {
    const root = join(scratch, name.replace(".ts", ""));
    writeModules(root, { [name]: source });
    await expect(loadPolicyCorpus(root)).rejects.toThrow();
  }
});

test("requires a closed explicit resource declaration on every descriptor", async ({ repoRoot, scratch }) => {
  const omitted = join(scratch, "omitted-resources");
  writeModules(omitted, {
    "omitted-resources.ts": moduleSource(repoRoot, "omitted-resources").replace("    resources: [],\n", ""),
  });
  await expect(loadPolicyCorpus(omitted)).rejects.toThrow(/resources.*own enumerable|required/i);

  const invalidRows: Readonly<Record<string, string>> = {
    "unknown-kind.ts": moduleSource(repoRoot, "unknown-kind", { resources: '[{ kind: "filesystem", path: "package.json" }]' }),
    "unknown-id.ts": moduleSource(repoRoot, "unknown-id", { resources: '[{ kind: "package-metadata", id: "unknown" }]' }),
    "duplicate.ts": moduleSource(repoRoot, "duplicate", {
      resources: '[{ kind: "package-metadata", id: "root" }, { kind: "package-metadata", id: "root" }]',
    }),
    "syntax-smuggle.ts": moduleSource(repoRoot, "syntax-smuggle", { resources: '[{ kind: "package-metadata", id: "root" }]' }),
    "resource-empty.ts": moduleSource(repoRoot, "resource-empty", {
      analysis: "resource",
      proofMode: "resource",
      population: '{ of: "none", why: "resource only" }',
    }),
  };
  for (const [name, source] of Object.entries(invalidRows)) {
    const root = join(scratch, name.replace(".ts", ""));
    writeModules(root, { [name]: source });
    await expect(loadPolicyCorpus(root)).rejects.toThrow(/resource/i);
  }

  const valid = join(scratch, "valid-resource");
  writeModules(valid, {
    "valid-resource.ts": moduleSource(repoRoot, "valid-resource", {
      analysis: "resource",
      proofMode: "resource",
      population: '{ of: "none", why: "resource only" }',
      resources: '[{ kind: "package-metadata", id: "root" }]',
    }),
  });
  await expect(loadPolicyCorpus(valid)).resolves.toMatchObject({
    gates: [{ resources: [{ kind: "package-metadata", id: "root" }] }],
  });
});

test("warning debt requires one positive work-item issue and error policies cannot carry it", async ({ repoRoot, scratch }) => {
  const validWarning = join(scratch, "valid-warning");
  writeModules(validWarning, { "warning-policy.ts": moduleSource(repoRoot, "warning-policy", { severity: "warning", extra: "workItem: 1584," }) });
  await expect(loadPolicyCorpus(validWarning)).resolves.toMatchObject({
    gates: [{ id: "warning-policy", severity: "warning", workItem: 1584 }],
  });

  const invalidRows: Readonly<Record<string, { readonly source: string; readonly message: RegExp }>> = {
    "missing-work-item.ts": {
      source: moduleSource(repoRoot, "missing-work-item", { severity: "warning" }),
      message: /warning.*workItem|workItem.*warning/i,
    },
    "zero-work-item.ts": {
      source: moduleSource(repoRoot, "zero-work-item", { severity: "warning", extra: "workItem: 0," }),
      message: /workItem.*positive.*safe integer/i,
    },
    "string-work-item.ts": {
      source: moduleSource(repoRoot, "string-work-item", { severity: "warning", extra: 'workItem: "1584",' }),
      message: /workItem.*positive.*safe integer/i,
    },
    "error-work-item.ts": {
      source: moduleSource(repoRoot, "error-work-item", { extra: "workItem: 1584," }),
      message: /workItem.*forbidden.*error|error.*must not.*workItem/i,
    },
  };
  for (const [name, { source, message }] of Object.entries(invalidRows)) {
    const root = join(scratch, name.replace(".ts", ""));
    writeModules(root, { [name]: source });
    await expect(loadPolicyCorpus(root)).rejects.toThrow(message);
  }
});

test("the loader refuses prototype-supplied warning ownership", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "prototype-warning.ts": moduleSource(repoRoot, "prototype-warning", {
      severity: "warning",
      prototype: "{ workItem: 1584 }",
    }),
  });

  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(/descriptor.*direct plain object|prototype/i);
});

test("direct descriptor validation requires own enumerable contract fields", () => {
  const warning = {
    id: "direct-warning",
    family: "direct-warning",
    authority: "hard",
    severity: "warning",
    workItem: 1584,
    population: "@tooling",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "fixture policy",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, why: "nearest legal shape" }],
  };
  expect(() => assertGatePolicyDescriptor(warning)).not.toThrow();

  const prototypeWarning = Object.assign(Object.create({ workItem: 1584 }), { ...warning, workItem: undefined });
  Reflect.deleteProperty(prototypeWarning, "workItem");
  expect(() => assertGatePolicyDescriptor(prototypeWarning)).toThrow(/descriptor.*direct plain object|prototype/i);

  const hiddenWorkItem = { ...warning };
  Object.defineProperty(hiddenWorkItem, "workItem", { value: 1584, enumerable: false });
  expect(() => assertGatePolicyDescriptor(hiddenWorkItem)).toThrow(/workItem.*own enumerable/i);

  const hiddenMessage = { ...warning };
  Object.defineProperty(hiddenMessage, "message", { value: "fixture policy", enumerable: false });
  expect(() => assertGatePolicyDescriptor(hiddenMessage)).toThrow(/message.*own enumerable/i);

  expect(() => assertGatePolicyDescriptor({ ...warning, workItem: undefined })).toThrow(/workItem.*positive.*safe integer/i);
  expect(() => assertGatePolicyDescriptor({ ...warning, workItem: -1 })).toThrow(/workItem.*positive.*safe integer/i);
  expect(() => assertGatePolicyDescriptor({ ...warning, severity: "error", workItem: 1584 })).toThrow(/workItem.*forbidden.*error/i);

  const inheritedError = Object.assign(Object.create({ workItem: 1584 }), { ...warning, severity: "error" });
  Reflect.deleteProperty(inheritedError, "workItem");
  expect(() => assertGatePolicyDescriptor(inheritedError)).toThrow(/descriptor.*direct plain object|prototype/i);
});

test("proofs require explicit matching modes, nonempty path maps, and rationales", async ({ repoRoot, scratch }) => {
  const invalidRows: Readonly<Record<string, string>> = {
    "mode-mismatch.ts": moduleSource(repoRoot, "mode-mismatch", { analysis: "types", proofMode: "source" }),
    "missing-mode.ts": moduleSource(repoRoot, "missing-mode").replace('mode: "source", ', ""),
    "string-files.ts": moduleSource(repoRoot, "string-files").replace(
      'files: { "tooling/src/proof.ts": "export const planted = true;\\n" }',
      'files: "export const planted = true;"',
    ),
    "empty-files.ts": moduleSource(repoRoot, "empty-files").replace('{ "tooling/src/proof.ts": "export const planted = true;\\n" }', "{}"),
    "missing-why.ts": moduleSource(repoRoot, "missing-why").replace('why: "founding defect"', 'why: " "'),
    "must-pass-expect.ts": moduleSource(repoRoot, "must-pass-expect").replace(
      'mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, why: "nearest legal shape" }]',
      'mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, expect: { count: 1 }, why: "nearest legal shape" }]',
    ),
  };
  for (const [name, source] of Object.entries(invalidRows)) {
    const root = join(scratch, name.replace(".ts", ""));
    writeModules(root, { [name]: source });
    await expect(loadPolicyCorpus(root)).rejects.toThrow(/proof|example|mode|files|why|resource/i);
  }
});

test("resource proof file identity comes from descriptor declarations rather than extensions", async ({ repoRoot, scratch }) => {
  writeModules(scratch, {
    "typescript-resource.ts": moduleSource(repoRoot, "typescript-resource", {
      analysis: "resource",
      proofMode: "resource",
      population: '{ of: "none", why: "resource only" }',
      resources: '[{ kind: "authored-tree", id: "tooling-slot" }]',
    }).replace(/resources\/policy\.json/gu, "tooling/src/proof.ts"),
  });
  await expect(loadPolicyCorpus(scratch)).resolves.toMatchObject({ gates: [{ id: "typescript-resource" }] });
});
