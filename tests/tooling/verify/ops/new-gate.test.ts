// THE SCAFFOLD IS A TEACHING SURFACE, and until 2026-09-12 it taught the RETIRED contract (#2102). Every
// gate minted by `pnpm gate:new` was born with an `ExemptionTable`, a `scanRoot` predicate and
// `visit`/`finalize` hooks — a private exemption table that §12.5 bans in a final policy outright — plus a
// ritual pointing at `GATE-AUTHORING.md` and a `check-gates.repo.int.test.ts` fixture. A generator that
// emits a banned shape does not merely fail once: it manufactures the violation, signed by the repo's own
// tool, for every gate anybody scaffolds.
//
// A string check alone would be a weak pin — "the word ExemptionTable is absent" says nothing about
// whether the emitted module is a VALID policy. So the load-bearing arm LOADS what the scaffold wrote,
// through the REAL `defineGate` (by absolute file URL, so the brand WeakSet is the production one — a
// copied contract would refuse every fixture as unbranded), and runs the emitted proof rows through the
// REAL conformance driver. Both directions: the legacy vocabulary is gone, AND what replaced it is a
// policy the contract accepts and whose own rows pass on arrival.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import { gate as policyFamilyReaders } from "../../../../tooling/src/verify/gates/policy-family-readers.ts";
import { gate as policySoundness } from "../../../../tooling/src/verify/gates/policy-soundness.ts";
import { loadMixedGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { markdownTables } from "../../../../tooling/src/verify/lib/markdown-tables.ts";
import { loadPolicyCorpus } from "../../../../tooling/src/verify/lib/policy-loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { runNewGate } from "../../../../tooling/src/verify/ops/new-gate.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES_REL = "tooling/src/verify/gates";
const NAME = "probe-scaffolded-gate";
const SINGLETON_REASON = "This new predicate has no shared production dependency";
const SINGLETON_ARGS = ["--singleton-reason", SINGLETON_REASON] as const;
/** Historical #2102 regression sentinels; the loader below owns complete contract validation. */
const RETIRED_VOCABULARY = ["ExemptionTable", "GateDescriptor", "scanRoot", "scopeSafety", "docRow", "finalize", "fileLoaded", "REAL_TREE_ANCHOR"] as const;

function scaffold(scratch: string): string {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  expect(runNewGate(scratch, [NAME, ...SINGLETON_ARGS])).toBe(0);
  return readFileSync(join(scratch, GATES_REL, `${NAME}.ts`), "utf8");
}

test("the scaffold emits no retired-contract vocabulary", ({ scratch }) => {
  const emitted = scaffold(scratch);
  // RED-FIRST: the pre-2026-09-12 template contained every one of these.
  expect(RETIRED_VOCABULARY.filter((spelling) => emitted.includes(spelling))).toEqual([]);
  expect(emitted).toContain("defineGate");
  expect(emitted).toContain(`id: "${NAME}"`);
  expect(emitted).toContain(SINGLETON_REASON);
  expect(emitted).toContain(`family: "${NAME}"`);
  expect(emitted).toContain("// POPULATION:");
  expect(emitted).toContain("// RETIRED MARKERS:");
  expect(emitted).not.toContain("Header budget is 5 lines");
  // A positive control on the reader itself: the same filter over the legacy shape names it, so an empty
  // result above is a measurement and not a search that silently matched nothing.
  expect(
    RETIRED_VOCABULARY.filter((spelling) =>
      "const ALLOWLIST: ExemptionTable = {};\nconst gate: GateDescriptor = { scanRoot, scopeSafety, docRow, finalize, fileLoaded, REAL_TREE_ANCHOR };".includes(
        spelling,
      ),
    ),
  ).toEqual([...RETIRED_VOCABULARY]);
});

test("what the scaffold emits LOADS as a final policy and its own proof rows pass on arrival", async ({ repoRoot, scratch }) => {
  const emitted = scaffold(scratch);
  // The emitted module imports its contract relatively, which only resolves inside the real gates
  // directory; pointing that ONE specifier at the real file is what lets this run outside the corpus,
  // and it is the production module, so the brand is the production brand.
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const loadable = join(scratch, GATES_REL, `${NAME}.ts`);
  writeFileSync(loadable, emitted.replace('from "../contract/policy.ts"', `from ${JSON.stringify(contract)}`));

  const corpus = await loadPolicyCorpus(scratch);
  expect(corpus.files).toEqual([`${GATES_REL}/${NAME}.ts`]);
  expect(corpus.gates.map((gate) => gate.id)).toEqual([NAME]);
  // The scaffold is GREEN ON ARRIVAL: its placeholder predicate bites its own mustFlag fixture and leaves
  // its mustPass fixture alone, so `pnpm check:policy-conformance` stays a verdict about the author's work
  // rather than about the template's stub.
  expect(verifyPolicyProofs(corpus.gates)).toEqual([]);
});

test("the final-only loader rejects an actual legacy descriptor accepted by the mixed loader", async ({ scratch }) => {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  writeFileSync(
    join(scratch, GATES_REL, `${NAME}.ts`),
    `export const gate = { name: "${NAME}", docRow: "legacy", status: "active", scopeSafety: "incremental-safe", message: "legacy", run: () => undefined, mustFlag: [{ files: {}, why: "legacy catch" }], mustPass: [{ files: {}, why: "legacy pass" }] };`,
  );
  const mixed = await loadMixedGateCorpus(scratch);
  expect(mixed.roster).toEqual([{ path: `${GATES_REL}/${NAME}.ts`, contract: "legacy", id: NAME }]);
  await expect(loadPolicyCorpus(scratch)).rejects.toThrow("must export exactly one `gate` created by defineGate");
});

test("the emitted final module passes production policy-soundness and its planted legacy-field control fails", ({ repoRoot, scratch }) => {
  const emitted = scaffold(scratch);
  const project = new Project({ useInMemoryFileSystem: true });
  const contractPath = "tooling/src/verify/contract/policy.ts";
  const contract = project.createSourceFile(join(scratch, contractPath), readFileSync(join(repoRoot, contractPath), "utf8"));
  const source = project.createSourceFile(join(scratch, GATES_REL, `${NAME}.ts`), emitted);
  expect(source.getImportDeclarationOrThrow("../contract/policy.ts").getModuleSpecifierSourceFile()).toBe(contract);
  const drive = (): ReturnType<typeof runPolicyPass> => {
    const result = runPolicyPass({
      knownPolicies: [policySoundness],
      policies: [policySoundness],
      root: scratch,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.policies.map(({ owner }) => owner)).toEqual([{ status: "success", population: "complete" }]);
    return result;
  };
  expect(drive().authority.effectiveFindings).toEqual([]);
  source.replaceWithText(emitted.replace("create: (ctx)", "run: () => undefined,\n  create: (ctx)"));
  const broken = drive();
  expect(broken.authority.effectiveFindings).toHaveLength(1);
  expect(broken.authority.effectiveFindings[0]?.message).toContain("run");
});

test("scaffold output and CLI help route to the final policy guide", { timeout: scaledBudget(30_000) }, async ({ scratch, runCli }) => {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  const created = await runCli("verify", ["new-gate", NAME, ...SINGLETON_ARGS], { cwd: scratch });
  const help = await runCli("verify", ["new-gate", "--help"]);
  await expect(created).toExitWith(0);
  await expect(help).toExitWith(0);
  expect(created.stdout).toContain("GATE-AUTHORING.md` is the final policy guide");
  expect(created.stdout).toContain("gate-authoring-legacy-2026-09-13.md");
  expect(created.stdout).not.toContain("bump the");
  expect(help.stdout).toContain("final defineGate policy");
});

// Family choice is explicit before the file is written; malformed input cannot silently mint a policy.
test.for([
  [NAME],
  [NAME, "--singleton-reason", ""],
  [NAME, "--singleton-reason", "  "],
  [NAME, "--singleton-reason", "why\nexport const injected = 1"],
  [NAME, "--singleton-reason", "why\u2028export const injected = 1"],
  [NAME, "--family", "theme"],
  [NAME, "--family-of", "peer"],
  [NAME, "--dependency", "tooling/src/verify/lib/shared.ts#subjects"],
  [NAME, ...SINGLETON_ARGS, "--family-of", "peer", "--dependency", "tooling/src/verify/lib/shared.ts#subjects"],
  [NAME, ...SINGLETON_ARGS, ...SINGLETON_ARGS],
  [NAME, ...SINGLETON_ARGS, "extra"],
])("invalid family choice %j refuses before writing", (args, { scratch }) => {
  mkdirSync(join(scratch, GATES_REL), { recursive: true });
  expect(() => runNewGate(scratch, args)).toThrow();
  expect(existsSync(join(scratch, GATES_REL, `${NAME}.ts`))).toBe(false);
});

const SHARED_PATH = "tooling/src/verify/lib/shared.ts";
const DEPENDENCY = `${SHARED_PATH}#subjects`;
const SHARED_ARGS = ["--family-of", "peer", "--dependency", DEPENDENCY] as const;

/** Real canonical contract origin and two same-file declarations: a filename-only match must fail. */
function plantFamily(root: string, repoRoot: string, create: string, prelude = ""): void {
  for (const path of [GATES_REL, "tooling/src/verify/lib", "tooling/src/verify/contract"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, "tsconfig.json"), '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","target":"ESNext"}}');
  writeFileSync(join(root, "tooling/src/verify/contract/policy.ts"), readFileSync(join(repoRoot, "tooling/src/verify/contract/policy.ts"), "utf8"));
  writeFileSync(join(root, SHARED_PATH), 'export const subjects = ["__ORB_GATE_PLACEHOLDER__"] as const; export const unrelated = ["other"] as const;');
  writeFileSync(
    join(root, GATES_REL, "peer.ts"),
    `import { defineGate } from "../contract/policy.ts";
import { subjects as shared } from "../lib/shared.ts";
${prelude}
export const gate = defineGate({ id: "peer", family: "probe-family", ${create} });`,
  );
}

test.for([
  "create: () => ({ evaluate: () => shared.length })",
  "create() { return { evaluate: () => shared.length }; }",
])("shared choice resolves canonical alias and method roots: %s", (create, { scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, create);
  expect(runNewGate(scratch, [NAME, ...SHARED_ARGS])).toBe(0);
  const emitted = readFileSync(join(scratch, GATES_REL, `${NAME}.ts`), "utf8");
  expect(emitted).toContain('family: "probe-family"');
  expect(emitted).toContain(DEPENDENCY);
  expect(emitted).not.toContain('from "../lib/shared.ts"');
});

test.for([
  ["create: () => ({ evaluate: () => 1 })", ""],
  ["create: () => ({ evaluate: () => 1 }), mustFlag: [proof]", "const proof = shared.length;"],
  ["create: () => ({ evaluate: () => (null as unknown as typeof shared) })", ""],
] as const)("a declared dependency needs production reach: %s", ([create, prelude], { scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, create, prelude);
  expect(() => runNewGate(scratch, [NAME, ...SHARED_ARGS])).toThrow(/production dependency/u);
  expect(existsSync(join(scratch, GATES_REL, `${NAME}.ts`))).toBe(false);
});

test("shared choice rejects a different declaration in the same file and accepts the actual subject", ({ scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, "create: () => ({ evaluate: () => shared.length })");
  expect(() => runNewGate(scratch, [NAME, "--family-of", "peer", "--dependency", `${SHARED_PATH}#unrelated`])).toThrow(/production dependency/u);
  expect(existsSync(join(scratch, GATES_REL, `${NAME}.ts`))).toBe(false);
  expect(runNewGate(scratch, [NAME, ...SHARED_ARGS])).toBe(0);
});

test.for([
  ["missing-peer", DEPENDENCY],
  ["peer", `${SHARED_PATH}#missingDeclaration`],
  ["peer", "tooling/src/verify/contract/policy.ts#defineGate"],
  ["peer", "tooling/src/verify/lib/../lib/shared.ts#subjects"],
] as const)("shared choice refuses an unestablished selector: %s %s", ([peer, dependency], { scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, "create: () => ({ evaluate: () => shared.length })");
  expect(() => runNewGate(scratch, [NAME, "--family-of", peer, "--dependency", dependency])).toThrow(/production dependency/u);
  expect(existsSync(join(scratch, GATES_REL, `${NAME}.ts`))).toBe(false);
});

test("a local defineGate namesake cannot provide family identity", ({ scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, "create: () => ({ evaluate: () => shared.length })");
  const path = join(scratch, GATES_REL, "peer.ts");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace('import { defineGate } from "../contract/policy.ts";', "function defineGate(value: unknown) { return value; }"),
  );
  expect(() => runNewGate(scratch, [NAME, ...SHARED_ARGS])).toThrow("not a canonical final gate");
  expect(existsSync(join(scratch, GATES_REL, `${NAME}.ts`))).toBe(false);
});

test("shared draft stays visible to Q08 until actual production consumption is authored", ({ scratch, repoRoot }) => {
  plantFamily(scratch, repoRoot, "create: () => ({ evaluate: () => shared.length })");
  expect(runNewGate(scratch, [NAME, ...SHARED_ARGS])).toBe(0);
  const project = new Project({ tsConfigFilePath: join(scratch, "tsconfig.json") });
  const source = project.getSourceFileOrThrow(join(scratch, GATES_REL, `${NAME}.ts`));
  const emitted = source.getFullText();
  const drive = (): ReturnType<typeof runPolicyPass> => {
    const result = runPolicyPass({
      knownPolicies: [policyFamilyReaders],
      policies: [policyFamilyReaders],
      root: scratch,
      project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.toolErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.policies.map(({ owner }) => owner)).toEqual([{ status: "success", population: "complete" }]);
    return result;
  };
  const draft = drive();
  expect(draft.authority.effectiveFindings.some((finding) => finding.file.endsWith(`${NAME}.ts`))).toBe(true);
  // The canonical vocabulary now drives the predicate itself; no unused import or nominal void-read.
  source.replaceWithText(
    `import { subjects } from "../lib/shared.ts";\n${emitted}`.replace(
      "node.getText() === BANNED_IDENTIFIER",
      "subjects.some(subject => node.getText() === subject)",
    ),
  );
  expect(drive().authority.effectiveFindings).toEqual([]);
});

// This authoring surface's enforcer references must be authored links, not an unmaintained list in a test.
const GUIDE = "tooling/src/verify/gates/GATE-AUTHORING.md";
const ENFORCER_HEADING = "11. Enforcers and review obligations";
const KEBAB_CITATION = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u;
// The guide table uses direct, single-line local links. The shared reader owns GFM row boundaries;
// unsupported citation forms refuse instead of silently disappearing from the pin's population.
function enforcerCellLinks(cell: string): readonly string[] {
  const links: string[] = [];
  const unlinked = cell.replace(/\[([^\]\n]+)\]\(([^\s()]+)\)/gu, (_match, _label: string, target: string) => {
    if (target.startsWith("#") || target.includes("://")) {
      throw new Error("enforcer references require direct local links");
    }
    links.push(target);
    return "";
  });
  if (unlinked.includes("[") || unlinked.includes("]")) {
    throw new Error("unsupported enforcer citation");
  }
  for (const match of unlinked.matchAll(/`([^`]+)`/gu)) {
    const token = match[1] ?? "";
    if (KEBAB_CITATION.test(token)) {
      throw new Error(`unlinked enforcer: ${token}`);
    }
  }
  return links;
}

function enforcerLinks(text: string): readonly string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `## ${ENFORCER_HEADING}`);
  if (start < 0) {
    throw new Error("missing enforcer section");
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /u.test(line));
  const section = end < 0 ? rest : rest.slice(0, end);
  if (section.some((line) => /^\s*(?:```|~~~)/u.test(line))) {
    throw new Error("enforcer table must not be fenced");
  }
  const tables = markdownTables(section);
  if (tables.length !== 1) {
    throw new Error("expected one enforcer table");
  }
  const rows = tables.flatMap((table) => table.rows);
  if (rows.length === 0) {
    throw new Error("empty enforcer table");
  }
  const links = rows.flatMap((row) => {
    const cell = row.cells[1];
    if (cell === undefined) {
      throw new Error("missing enforcer cell");
    }
    return enforcerCellLinks(cell);
  });
  if (links.length === 0) {
    throw new Error("no enforcer links");
  }
  return links;
}

function missingEnforcers(text: string, guidePath: string): readonly string[] {
  return enforcerLinks(text).filter((target) => !existsSync(resolve(dirname(guidePath), target.split("#")[0] ?? target)));
}

test("guide enforcers resolve from authored links, with a planted missing-target control", ({ repoRoot }) => {
  const path = join(repoRoot, GUIDE);
  const guide = readFileSync(path, "utf8");
  const targets = enforcerLinks(guide);
  expect(targets.length).toBeGreaterThan(0);
  expect(missingEnforcers(guide, path)).toEqual([]);
  const target = targets[0];
  expect(target).toBeDefined();
  const missing = "./__missing-authoring-enforcer__.ts";
  const section = guide.indexOf(`## ${ENFORCER_HEADING}`);
  const broken = guide.slice(0, section) + guide.slice(section).replace(`](${target})`, `](${missing})`);
  expect(missingEnforcers(broken, path)).toEqual([missing]);
});

test("enforcer pin rejects a vanished section, table and unlinked module", () => {
  const linked = `## ${ENFORCER_HEADING}\n\n| Mechanism | Enforcer |\n| - | - |\n| scope | [real-reader](./real-reader.ts) |\n`;
  expect(enforcerLinks(linked)).toEqual(["./real-reader.ts"]);
  expect(() => enforcerLinks("# unrelated")).toThrow("missing enforcer section");
  expect(() => enforcerLinks(`## ${ENFORCER_HEADING}\n\nNo table.`)).toThrow("expected one enforcer table");
  expect(() => enforcerLinks(linked.replace("[real-reader](./real-reader.ts)", "`missing-reader`"))).toThrow("unlinked enforcer: missing-reader");
});
