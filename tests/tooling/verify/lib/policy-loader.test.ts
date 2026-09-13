import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { refusalEnvelope } from "../../../../tooling/src/verify/lib/policy-refusal-envelope.ts";
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
  /** Defaults to `hard`; warning fixtures therefore prove that severity does not open a suppression door. */
  readonly authority?: "hard" | "ordinary" | "reviewed-grant";
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
    authority: ${JSON.stringify(options.authority ?? "hard")},
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

test("a proof link may not be an ANCESTOR of another declared destination, which would be written THROUGH it (#2333)", () => {
  const linked = (files: Record<string, string>, links: Record<string, string>): unknown =>
    resourcePolicy({ mustPass: [{ mode: "resource", files: { "biome.json": "{}", ...files }, links, why: "w" }] });
  // A link's TARGET stays free (an escaping target is a legitimate subject), so the only way a later
  // destination leaves the fixture root is by resolving through an earlier link used as a parent directory.
  expect(() => assertGatePolicyDescriptor(linked({}, { escape: "/outside", "escape/planted.ts": "target.ts" }))).toThrow(
    /links path escape is an ancestor of declared destination escape\/planted\.ts/i,
  );
  expect(() => assertGatePolicyDescriptor(linked({ "escape/planted.ts": "x" }, { escape: "/outside" }))).toThrow(
    /links path escape is an ancestor of declared destination escape\/planted\.ts/i,
  );
  // NEAR MISS: a shared string prefix is not a shared path segment; `escaped/x.ts` is a sibling of `escape`.
  expect(() => assertGatePolicyDescriptor(linked({ "escaped/x.ts": "x" }, { escape: "/outside", "escapee.ts": "/outside" }))).not.toThrow();
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

test("hard + warning is admitted only with positive warning ownership, alongside the other authority/severity pairs", () => {
  const trunk = {
    id: "authority-severity",
    family: "authority-severity",
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
  expect(() => assertGatePolicyDescriptor({ ...trunk, authority: "hard", severity: "warning", workItem: 2346 })).not.toThrow();
  expect(() => assertGatePolicyDescriptor({ ...trunk, authority: "hard", severity: "error" })).not.toThrow();
  expect(() => assertGatePolicyDescriptor({ ...trunk, authority: "ordinary", severity: "warning", workItem: 2025 })).not.toThrow();
  expect(() =>
    assertGatePolicyDescriptor({
      ...trunk,
      authority: "reviewed-grant",
      severity: "warning",
      workItem: 2025,
      mustFlag: [{ ...trunk.mustFlag[0], grant: { subject: "the-subject", operation: "the-operation" } }],
    }),
  ).not.toThrow();
  expect(() => assertGatePolicyDescriptor({ ...trunk, authority: "hard", severity: "warning" })).toThrow(/workItem.*warning|warning.*workItem/u);
});

test("direct descriptor validation requires own enumerable contract fields", () => {
  const warning = {
    id: "direct-warning",
    family: "direct-warning",
    authority: "ordinary",
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

/** A minimal valid policy to hang a `mustRefuse` arm on, one field at a time. */
function refusingPolicy(mustRefuse: unknown): unknown {
  return defineGate({
    id: "refuse-shape",
    family: "refuse-shape",
    authority: "hard",
    severity: "error",
    population: "@tooling",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "fixture",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, expect: { count: 1 }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, why: "nearest legal shape" }],
    ...(mustRefuse === undefined ? {} : { mustRefuse }),
  } as never);
}
const REFUSE_ROW = { mode: "source", files: { "tooling/src/proof.ts": "export const refuse = true;\n" }, why: "the designed refusal" } as const;

test("the mustRefuse arm is optional, never empty, and every row carries messageIncludes and nothing else in expect (§4.5b)", () => {
  // These rules shipped with #1977 and had no pin under tests/tooling until #2111 measured the gap. ABSENT is the
  // optional shape; an explicit `mustRefuse: undefined` is an own property and is refused like an empty array.
  expect(() => assertGatePolicyDescriptor(refusingPolicy(undefined))).not.toThrow();
  expect(() => assertGatePolicyDescriptor({ ...(refusingPolicy(undefined) as object), mustRefuse: undefined })).toThrow(
    /mustRefuse must contain at least one/i,
  );
  expect(() => assertGatePolicyDescriptor(refusingPolicy([]))).toThrow(/mustRefuse must contain at least one/i);
  expect(() => assertGatePolicyDescriptor(refusingPolicy([REFUSE_ROW]))).toThrow(/mustRefuse\[0\]\.expect\.messageIncludes is required/i);
  expect(() => assertGatePolicyDescriptor(refusingPolicy([{ ...REFUSE_ROW, expect: { messageIncludes: " " } }]))).toThrow(
    /messageIncludes must be a nonempty/i,
  );
  for (const [key, value] of [
    ["count", 1],
    ["countFrom", "MISSING_DRIVER"],
    ["line", 1],
    ["token", "x"],
  ] as const) {
    for (const supplied of [value, undefined]) {
      const forbidden = { ...REFUSE_ROW, expect: { messageIncludes: "BLINDNESS", [key]: supplied } };
      expect(() => assertGatePolicyDescriptor(refusingPolicy([forbidden]))).toThrow(new RegExp(`mustRefuse\\[0\\]\\.expect\\.${key} is forbidden`, "u"));
    }
  }
  expect(() => assertGatePolicyDescriptor(refusingPolicy([{ ...REFUSE_ROW, expect: { messageIncludes: "BLINDNESS" } }]))).not.toThrow();
});

test("a mustRefuse messageIncludes that names only the runner's generic refusal envelope is refused at load (#2111, #2109 item 3)", () => {
  // PER MEMBER: every envelope entry, as the whole needle, is refused — a tuple widened without a control per
  // member is the shape where one member silently never matches. The envelope's own suite proves what it holds.
  const members = refusalEnvelope();
  expect(members.length).toBeGreaterThan(50);
  for (const member of members) {
    expect(() => assertGatePolicyDescriptor(refusingPolicy([{ ...REFUSE_ROW, expect: { messageIncludes: member } }]))).toThrow(
      /names only the runner's generic refusal text/u,
    );
  }
  // A SUBSTRING of a member is generic too — containment, not equality.
  for (const needle of ["ERROR", "OWNER", "[evaluate]", "incomplete", "resolved zero members", "refused: population", "admitted zero paths from"]) {
    expect(() => assertGatePolicyDescriptor(refusingPolicy([{ ...REFUSE_ROW, expect: { messageIncludes: needle } }]))).toThrow(
      /names only the runner's generic refusal text/u,
    );
  }
  // Policy-AUTHORED text beside the generic words is admitted: the generic piece is a prefix or a slot, never the whole.
  for (const needle of [
    "BLINDNESS",
    'population "final policy modules" resolved zero members',
    "OWNER incomplete/incomplete: evaluate: BLINDNESS",
    "resource declaration json:biome is malformed",
  ]) {
    expect(() => assertGatePolicyDescriptor(refusingPolicy([{ ...REFUSE_ROW, expect: { messageIncludes: needle } }]))).not.toThrow();
  }
});

test("the second-wave kinds admit their own closed id vocabularies, and refuse anything else", () => {
  // The one POLICING surface a new resource kind touches: `resourceIds` keys each kind off its own door's
  // definition object, so this validator cannot drift from the door. Both directions per kind — the real id
  // loads, a plausible neighbour is refused by name.
  for (const request of [
    { kind: "mirror-index", id: "package-test" },
    { kind: "ledger", id: "core-path-registry" },
    { kind: "exact-file", id: "ct-boot" },
    { kind: "documents" },
    { kind: "vendor-css-surface" },
    { kind: "token-contract" },
    { kind: "devtools-closure" },
  ] as const) {
    expect(() => assertGatePolicyDescriptor(resourcePolicy({ resources: [request] }))).not.toThrow();
  }
  const malformed = (request: unknown): unknown => resourcePolicy({ resources: [request] as never });
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "mirror-index", id: "package-tests" }))).toThrow(/id is unknown for mirror-index/i);
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "ledger", id: "core-path-registries" }))).toThrow(/id is unknown for ledger/i);
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "exact-file", id: "ct-bootstrap" }))).toThrow(/id is unknown for exact-file/i);
  // An id on a kind that takes none is an unknown PROPERTY, never a silently ignored field.
  expect(() => assertGatePolicyDescriptor(malformed({ kind: "documents", id: "docs" }))).toThrow(/unknown property/i);
});

// ── #2189 (P7): THE REVIEWED-GRANT IDENTITY WITNESS, at LOAD ────────────────────────────────────────────────
//
// Validate the annotation and its required presence through the descriptor and corpus loading entrypoints.
// Removing the loader obligation must fail even if a standalone witness helper remains correct.

const GRANT_WITNESS = { subject: "the-subject", operation: "the-operation" } as const;

function grantTrunk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "grant-witness-trunk",
    family: "grant-witness-trunk",
    authority: "reviewed-grant",
    severity: "error",
    population: "@tooling",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "fixture policy",
    fix: "add an exact reviewed grant row.",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, grant: GRANT_WITNESS, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, why: "nearest legal shape" }],
    ...overrides,
  };
}

const WITNESSLESS_FLAG = [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, why: "founding defect" }] as const;

test("a reviewed-grant identity witness loads on a mustFlag row, and a SECOND valid witness stays legal", () => {
  expect(() => assertGatePolicyDescriptor(grantTrunk())).not.toThrow();
  // AT LEAST ONE, not exactly one: a policy proving a second emitted identity has supplied strictly more
  // evidence, and refusing it would price honesty as a defect.
  expect(() =>
    assertGatePolicyDescriptor(
      grantTrunk({
        mustFlag: [
          { mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, grant: GRANT_WITNESS, why: "founding defect" },
          {
            mode: "source",
            files: { "tooling/src/second.ts": "export const planted = true;\n" },
            grant: { subject: "another-subject", operation: "another-operation" },
            why: "a second emitted identity",
          },
        ],
      }),
    ),
  ).not.toThrow();
});

test("the witness is refused on every arm but mustFlag, on every authority but reviewed-grant, and blank", () => {
  const row = { mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, grant: GRANT_WITNESS, why: "nearest legal shape" };
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustPass: [row] }))).toThrow(/mustPass\[0\]\.grant is valid only for a mustFlag proof/u);
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustRefuse: [{ ...row, expect: { messageIncludes: "fixture-specific refusal" } }] }))).toThrow(
    /mustRefuse\[0\]\.grant is valid only for a mustFlag proof/u,
  );

  // `hard` has no suppression door at all and `ordinary` consumes markers — neither ever reaches `processReviewed`.
  for (const authority of ["hard", "ordinary"] as const) {
    expect(() => assertGatePolicyDescriptor(grantTrunk({ authority }))).toThrow(
      new RegExp(`mustFlag\\[0\\]\\.grant is valid only for a reviewed-grant policy, and descriptor\\.authority is "${authority}"`, "u"),
    );
  }

  for (const key of ["subject", "operation"] as const) {
    expect(() =>
      assertGatePolicyDescriptor(
        grantTrunk({
          mustFlag: [
            { mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, grant: { ...GRANT_WITNESS, [key]: "  " }, why: "w" },
          ],
        }),
      ),
    ).toThrow(new RegExp(`mustFlag\\[0\\]\\.grant\\.${key} must be a nonempty control-free string`, "u"));
  }

  expect(() =>
    assertGatePolicyDescriptor(
      grantTrunk({
        mustFlag: [
          {
            mode: "source",
            files: { "tooling/src/proof.ts": "export const planted = true;\n" },
            grant: { ...GRANT_WITNESS, why: "extra" },
            why: "w",
          },
        ],
      }),
    ),
  ).toThrow(/mustFlag\[0\]\.grant has unknown property "why"/u);
});

test("the GLOBAL witness obligation rejects a missing witness through descriptor and corpus loading", async ({ repoRoot, scratch }) => {
  const witnessless = grantTrunk({ mustFlag: WITNESSLESS_FLAG });
  expect(() => assertGatePolicyDescriptor(witnessless)).toThrow(/carries no grant identity witness.*"grant-witness-trunk".*reviewed-grant policy/su);
  expect(() => assertGatePolicyDescriptor(grantTrunk())).not.toThrow();
  for (const authority of ["hard", "ordinary"]) {
    expect(() => assertGatePolicyDescriptor(grantTrunk({ authority, mustFlag: WITNESSLESS_FLAG }))).not.toThrow();
  }

  writeModules(scratch, {
    "missing-witness.ts": moduleSource(repoRoot, "missing-witness", { authority: "reviewed-grant" }),
  });
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow(/missing-witness.*no grant identity witness/su);
});

// ── #2189 (P7, L3): AN OWN KEY WITH AN UNDEFINED VALUE IS DECLARED, NEVER ABSENT ─────────────────────────────
//
// The descriptor boundary has exactly ONE notion of "the author declared this key": OWN-PROPERTY PRESENCE.
// `exactKeys`, the mustRefuse expectation rule, the optional-arm rule and the `workItem` rule all read it that
// way — so an admission rule reading the VALUE instead admitted the one shape its own arm forbids: an own
// `grant: undefined` on a `mustPass`/`mustRefuse` row loaded silently where `grant: {…}` is refused by name.
// Unreachable from a TYPED descriptor (`exactOptionalPropertyTypes`), reachable through the `as never` cast every
// hand-built descriptor and fixture uses. The readers downstream (`proof.grant === undefined`, `proof.links ?? {}`,
// `proof.expect?.…`) all treat an undefined value as absent, so the LOAD boundary is the only place the two
// notions can be reconciled — and it reconciles them by refusing the declaration.

/** One `mustPass`-shaped row that declares `key` with an undefined value. */
function undefinedKeyRow(key: string, path = "tooling/src/proof.ts"): Record<string, unknown> {
  return { mode: "source", files: { [path]: "export const clean = true;\n" }, [key]: undefined, why: "nearest legal shape" };
}

test("an own grant: undefined is DECLARED on every forbidden arm and authority, and is never a witness (#2189 L3)", () => {
  // THE FORBIDDEN ARMS. `grant: undefined` binds nothing, so admitting it granted nothing today — but the arm rule
  // exists to refuse the ANNOTATION, and a rule refusing `{subject, operation}` while admitting the same key
  // spelled `undefined` is not the rule it states.
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustPass: [undefinedKeyRow("grant")] }))).toThrow(
    /mustPass\[0\]\.grant is valid only for a mustFlag proof/u,
  );
  expect(() =>
    assertGatePolicyDescriptor(grantTrunk({ mustRefuse: [{ ...undefinedKeyRow("grant"), expect: { messageIncludes: "fixture-specific refusal" } }] })),
  ).toThrow(/mustRefuse\[0\]\.grant is valid only for a mustFlag proof/u);

  // THE FORBIDDEN AUTHORITIES — the mustFlag arm is legal there, the grant door is not.
  for (const authority of ["hard", "ordinary"] as const) {
    expect(() => assertGatePolicyDescriptor(grantTrunk({ authority, mustFlag: [{ ...undefinedKeyRow("grant"), why: "founding defect" }] }))).toThrow(
      new RegExp(`mustFlag\\[0\\]\\.grant is valid only for a reviewed-grant policy, and descriptor\\.authority is "${authority}"`, "u"),
    );
  }

  // ON ITS ONE LEGAL POSITION IT IS STILL NOT A WITNESS. `reviewedGrantWitnessFailure` filters on
  // `proof.grant !== undefined`, so an undefined grant never counted toward the at-least-one obligation and must
  // not start: the row is refused for its SHAPE before the witness rule is reached, whether or not a real witness
  // sits beside it. (Witnessless, the old code refused too — via the witness rule — so there only the message
  // discriminates; the two-row case below was ADMITTED.)
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustFlag: [{ ...undefinedKeyRow("grant"), why: "founding defect" }] }))).toThrow(
    /mustFlag\[0\]\.grant must be an object/u,
  );
  expect(() =>
    assertGatePolicyDescriptor(
      grantTrunk({
        mustFlag: [
          { mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, grant: GRANT_WITNESS, why: "founding defect" },
          { ...undefinedKeyRow("grant", "tooling/src/second.ts"), why: "a second row, witness misspelled" },
        ],
      }),
    ),
  ).toThrow(/mustFlag\[1\]\.grant must be an object/u);

  // POSITIVE CONTROL: a legitimately ABSENT grant on mustPass/mustRefuse still loads — the fix refuses a
  // DECLARATION, never a silence.
  expect(() =>
    assertGatePolicyDescriptor(grantTrunk({ mustRefuse: [{ ...REFUSE_ROW, expect: { messageIncludes: "fixture-specific refusal" } }] })),
  ).not.toThrow();
});

test("every other proof-row and descriptor admission rule reads own-property presence too (#2189 L3)", () => {
  // The same asymmetry, at every site it had in this validator: a forbidden-here key fires its rule by name, an
  // optional key fires its value rule.
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustPass: [undefinedKeyRow("expect")] }))).toThrow(
    /mustPass\[0\]\.expect is valid only for mustFlag proofs/u,
  );
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustFlag: [{ ...undefinedKeyRow("expect"), grant: GRANT_WITNESS, why: "founding defect" }] }))).toThrow(
    /mustFlag\[0\]\.expect must be an object/u,
  );
  expect(() => assertGatePolicyDescriptor(grantTrunk({ mustPass: [undefinedKeyRow("links")] }))).toThrow(
    /mustPass\[0\]\.links is valid only in resource mode/u,
  );
  for (const [key, message] of [
    ["count", "mustFlag[0].expect.count must be a positive integer"],
    ["line", "mustFlag[0].expect.line must be a positive integer"],
    ["token", "mustFlag[0].expect.token must be a nonempty control-free string"],
    ["countFrom", "mustFlag[0].expect.countFrom must be a nonempty control-free string"],
    ["messageIncludes", "mustFlag[0].expect.messageIncludes must be a nonempty control-free string"],
  ] as const) {
    const row = {
      mode: "source",
      files: { "tooling/src/proof.ts": "export const planted = true;\n" },
      expect: { [key]: undefined },
      grant: GRANT_WITNESS,
      why: "founding defect",
    };
    expect(() => assertGatePolicyDescriptor(grantTrunk({ mustFlag: [row] }))).toThrow(message);
  }
  // The descriptor's own optional field reads the same way.
  expect(() => assertGatePolicyDescriptor(grantTrunk({ fix: undefined }))).toThrow(/descriptor\.fix must be a nonempty control-free string/u);

  // POSITIVE CONTROLS: the trunk with those keys ABSENT, and with real values in them, both still load.
  expect(() => assertGatePolicyDescriptor(grantTrunk())).not.toThrow();
  expect(() =>
    assertGatePolicyDescriptor(
      grantTrunk({
        mustFlag: [
          {
            mode: "source",
            files: { "tooling/src/proof.ts": "export const planted = true;\n" },
            expect: { count: 1, token: "planted", messageIncludes: "fixture policy" },
            grant: GRANT_WITNESS,
            why: "founding defect",
          },
        ],
      }),
    ),
  ).not.toThrow();
});
