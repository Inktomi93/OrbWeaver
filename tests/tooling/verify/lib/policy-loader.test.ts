import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
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
  readonly secondDescriptor?: boolean;
}

function moduleSource(repoRoot: string, id: string, options: ModuleOptions = {}): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const analysis = options.analysis ?? "syntax";
  const proofMode = options.proofMode ?? "source";
  const population = options.population ?? '"@tooling"';
  const exportName = options.exportName ?? "gate";
  const proofPath = proofMode === "resource" ? "resources/policy.json" : "tooling/src/proof.ts";
  const descriptor = `defineGate({
    id: ${JSON.stringify(id)},
    family: ${JSON.stringify(options.family ?? id)},
    authority: "hard",
    severity: "error",
    population: ${population},
    analysis: ${JSON.stringify(analysis)},
    execution: "selected-files",
    message: "fixture policy",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: ${JSON.stringify(proofMode)}, files: { ${JSON.stringify(proofPath)}: "export const planted = true;\\n" }, why: "founding defect" }],
    mustPass: [{ mode: ${JSON.stringify(proofMode)}, files: { ${JSON.stringify(proofPath)}: "export const clean = true;\\n" }, why: "nearest legal shape" }],
    ${options.extra ?? ""}
  } as never)`;
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
    "resource-without-resource.ts": moduleSource(repoRoot, "resource-without-resource", { analysis: "resource", proofMode: "resource" }).replace(
      /resources\/policy\.json/gu,
      "tooling/src/proof.ts",
    ),
  };
  for (const [name, source] of Object.entries(invalidRows)) {
    const root = join(scratch, name.replace(".ts", ""));
    writeModules(root, { [name]: source });
    await expect(loadPolicyCorpus(root)).rejects.toThrow(/proof|example|mode|files|why|resource/i);
  }
});
