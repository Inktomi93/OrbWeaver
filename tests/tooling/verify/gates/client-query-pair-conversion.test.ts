// Conformance entry for the CLIENT QUERY/STORE PAIR of #1584: two legacy `GateDescriptor` modules
// (`zustand-selector-derived`, `windowed-infinite-query`) converted into THREE final policies. They are
// grouped by CONVERSION WAVE and nothing else — §5b.4 of docs/design/gate-runtime-standardization.md is
// explicit that a theme is not a family. Two families are represented:
//
//   zustand-selector-derived   — a declared SINGLETON. Its subject is the callee's TEXT; its converted
//                                sibling `zustand-selector-stability` resolves the callee's TYPE. Neither
//                                subject reader subsumes the other and they share no `lib/` computation.
//   windowed-infinite-query    — windowed-infinite-query + windowed-infinite-query-health, split at
//                                conversion because the blindness tripwire is `hard` + `entire-population`
//                                while the occurrence arms are `ordinary` + `selected-files`.
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER. Every declared
// `mustFlag`/`mustPass` row already executes on the static bar (`structure:policy-conformance`). What a row
// structurally CANNOT assert — and what therefore lives here — is the §4.2 triple (`effectiveFindings []`,
// `waivedFindings 1`, `authorityAlarms []`), the §4.5 refusal pin for the `-health` policy's derived
// population, and the §4.6 fixture-level differential against the frozen legacy descriptors.
//
// §4.3 (reviewed grants) does not apply: all three declare `facts: []` / `resources: []` and none is
// `authority: "reviewed-grant"`.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as windowedInfiniteQuery } from "../../../../tooling/src/verify/gates/windowed-infinite-query.ts";
import { gate as windowedInfiniteQueryHealth } from "../../../../tooling/src/verify/gates/windowed-infinite-query-health.ts";
import { gate as zustandSelectorDerived } from "../../../../tooling/src/verify/gates/zustand-selector-derived.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/client-query-pair-conversion";
const CONFORMANCE_TIMEOUT_MS = scaledBudget(300_000);
const DIFFERENTIAL_TIMEOUT_MS = scaledBudget(120_000);

const WAVE: readonly GatePolicy[] = [windowedInfiniteQuery, windowedInfiniteQueryHealth, zustandSelectorDerived];

/** The commits immediately before each conversion — the last ones carrying the legacy descriptors. */
const LEGACY = [
  { id: "zustand-selector-derived", base: "68c8f42d6", defaultAt: "packages/client/src/state/x.ts" },
  { id: "windowed-infinite-query", base: "67366da91", defaultAt: "packages/client/src/features/x/hooks/x.ts" },
] as const;

/** One in-population file for a legacy example that plants none under `@client`; `resolvePopulation`
 *  throws on a zero-path expression, where the legacy `scanRoot` predicate simply admitted nothing. */
const FILLER_PATH = "packages/client/src/state/__filler.ts";
const FILLER_SOURCE = "export const filler = 1;\n";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test(
  "the wave's three policies keep their founding, near-miss, fence and identity fixtures",
  () => {
    expect(verifyPolicyProofs(WAVE)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). A proof row's relative import that resolves to NOTHING
// makes every identity row pass by FAIL-CLOSURE while conformance still reports green. `windowed-infinite-
// query` has a row whose whole claim is that an options const is read THROUGH an import door, so a dangling
// specifier there would silently retire the conversion's one deliberate catch widening.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test(
  "every relative import in every proof of this wave resolves inside the proof's own file map",
  () => {
    const shared = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
    const dangling: string[] = [];
    let sequence = 0;
    for (const policy of WAVE) {
      for (const { proof } of policyProofRows(policy)) {
        sequence += 1;
        const root = `${ROOT}-proof-${sequence}`;
        const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
        dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
        for (const file of files) {
          shared.removeSourceFile(file);
        }
      }
    }
    expect(dangling).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// §4.2 ORDINARY MARKER IDENTITY — one POSITIVE arm per ordinary policy, all three assertions. Two of the
// three are invisible to the module's own `mustPass` twin, which is why they live here.
// ---------------------------------------------------------------------------------------------------
test("a waiver at the STORE HOOK NAME binds the zustand-selector-derived finding", () => {
  const waived = passOf(zustandSelectorDerived, {
    "packages/client/src/state/waived.ts":
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n" +
      "// @orb-waive zustand-selector-derived(useXStore): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      "export const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a waiver at `maxPages` binds the windowed-infinite-query finding — and ONE marker is enough because the arms were merged", () => {
  // The legacy descriptor reported this cap TWICE (one finding per arm) on the same carrier with tokens no
  // authored text matches. Under the central grammar both would derive `maxPages`, every marker would be
  // `over-broad`, and the site would be unwaivable. This arm is the proof that the merge fixed that: ONE
  // marker, ONE consumption, zero alarms, on a fixture where BOTH arms bite.
  const waived = passOf(windowedInfiniteQuery, {
    "packages/client/src/features/chat/hooks/both.ts":
      "const rows = items.filter((r) => r.starred);\n" +
      "export const q = (trpc) =>\n" +
      "  trpc.chat.list.infiniteQueryOptions(\n" +
      "    { limit: 50 },\n" +
      "    // @orb-waive windowed-infinite-query(maxPages): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      "    { maxPages: 5, getNextPageParam: (p) => p.nextCursor },\n" +
      "  );\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// The DISCRIMINATION control, run ONCE for the wave (§4.2). A marker naming a position the policy does not
// report must suppress NOTHING and must ALARM — otherwise both arms above are green for the wrong reason.
test("THE DISCRIMINATION CONTROL: a waiver naming a dead position suppresses nothing and alarms", () => {
  const mismatched = passOf(zustandSelectorDerived, {
    "packages/client/src/state/waived.ts":
      "declare const useXStore: (sel: (s: { a: number; b: number }) => unknown) => unknown;\n" +
      "// @orb-waive zustand-selector-derived(useYStore): names a position this carrier does not bind.\n" +
      "export const v = useXStore((s) => ({ a: s.a, b: s.b }));\n",
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "zustand-selector-derived" }]);
});

// ---------------------------------------------------------------------------------------------------
// §4.5 DERIVED-POPULATION REFUSAL — the tripwire's verdict is about a tree it may not have been given.
// ---------------------------------------------------------------------------------------------------
test("windowed-infinite-query-health REFUSES when the client population is empty", () => {
  const empty = passOf(windowedInfiniteQueryHealth, { "packages/server/src/domain/x/verbs/x.ts": "export const x = 1;\n" });

  expect(empty.toolErrors).toMatchObject([{ policyId: "windowed-infinite-query-health", phase: "population" }]);
  expect(empty.toolErrors[0]?.message).toMatch(/admitted zero paths/u);
  expect(empty.authority.effectiveFindings).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// §4.6 THE FIXTURE-LEVEL DIFFERENTIAL. The real-corpus replay is VACUOUS for both modules and saying so is
// part of the receipt: `maxPages` is extinct under packages/client/src (re-derived 2026-09-12, zero property
// assignments), so a real-tree windowed replay is 0 → 0 on both sides and proves nothing. The method that
// reaches catch parity is this one — replay each LEGACY example's own file map through the frozen legacy
// dispatcher and through the final family, and compare the reported SITES.
// ---------------------------------------------------------------------------------------------------
interface Hit {
  readonly file: string;
  readonly line: number;
}

function sortHits(hits: readonly Hit[]): readonly Hit[] {
  return [...hits].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function legacyFiles(example: GateExample, defaultAt: string): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? defaultAt]: example.files } : example.files;
}

/** The final side needs at least one `@client` path or the population resolver throws; the legacy side is
 *  blind to a file its `scanRoot` rejects, so the filler is invisible to both engines' verdicts. */
function adapted(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.keys(files).some((path) => path.startsWith("packages/client/src/")) ? files : { ...files, [FILLER_PATH]: FILLER_SOURCE };
}

function legacyHits(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly Hit[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  return sortHits((result.gates[0]?.findings ?? []).map((finding) => ({ file: finding.file, line: finding.line })));
}

function finalHits(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): readonly Hit[] {
  const result = runPolicyPass({ knownPolicies: policies, policies, root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  return sortHits(result.authority.effectiveFindings.map((finding) => ({ file: finding.file, line: finding.line })));
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

/** A frozen legacy descriptor, imported from a scratch copy OUTSIDE the repo so nothing is planted here. */
async function frozenLegacyGate(scratch: string, id: string, base: string): Promise<GateDescriptor> {
  const path = `tooling/src/verify/gates/${id}.ts`;
  const source = execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${id}`)) as { readonly gate: GateDescriptor }).gate;
}

const FINAL_BY_LEGACY: Readonly<Record<string, readonly GatePolicy[]>> = {
  "zustand-selector-derived": [zustandSelectorDerived],
  "windowed-infinite-query": [windowedInfiniteQuery, windowedInfiniteQueryHealth],
};

test(
  "the final policies name the same NODES as the frozen legacy descriptors on every legacy example",
  async ({ scratch }) => {
    for (const { id, base, defaultAt } of LEGACY) {
      const legacy = await frozenLegacyGate(scratch, id, base);
      const examples = [...legacy.mustFlag, ...legacy.mustPass];
      // The legacy row counts, asserted so a silently shrunk replay cannot read as a clean differential.
      expect({ id, rows: examples.length }).toEqual({ id, rows: id === "zustand-selector-derived" ? 15 : 7 });
      for (const example of examples) {
        const files = adapted(legacyFiles(example, defaultAt));
        expect({ id, why: (example.why ?? "").slice(0, 70), sites: finalHits(FINAL_BY_LEGACY[id] ?? [], files) }).toEqual({
          id,
          why: (example.why ?? "").slice(0, 70),
          sites: legacyHits(legacy, files),
        });
      }
    }
  },
  DIFFERENTIAL_TIMEOUT_MS,
);

// THE ONE CLASSIFIED INTENDED DIFFERENCE, measured on a fixture LEGACY NEVER HAD (see the zero-coverage
// test below). A cap where BOTH arms bite: legacy reports the same node TWICE, once per arm, with tokens
// `maxPages/no-rewind` and `maxPages/client-lens` — neither authored text, so neither could ever bind a
// central marker, and both would derive `maxPages` on one carrier and make every waiver `over-broad`. The
// final policy reports it ONCE. FLAGGED NODES UNCHANGED; cardinality 2 → 1. Classification: merged arms /
// retired token vocabulary, with the message carrying the judgment the token used to.
const BOTH_ARMS = {
  "packages/client/src/features/chat/hooks/both.ts":
    "const rows = items.filter((r) => r.starred);\nexport const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions({ limit: 50 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
};

test(
  "§4.6 CLASSIFIED DIFFERENCE: a both-arms cap goes 2 findings → 1 at the SAME node, and the arms move to the message",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, "windowed-infinite-query", "67366da91");
    const before = legacyHits(legacy, BOTH_ARMS);
    const after = finalHits([windowedInfiniteQuery, windowedInfiniteQueryHealth], BOTH_ARMS);

    expect(before).toHaveLength(2);
    expect(after).toHaveLength(1);
    // Same NODE, which is the half that must not have changed.
    expect(new Set(before.map((hit) => `${hit.file}:${hit.line}`))).toEqual(new Set(after.map((hit) => `${hit.file}:${hit.line}`)));

    const result = runPolicyPass({
      knownPolicies: [windowedInfiniteQuery],
      policies: [windowedInfiniteQuery],
      root: ROOT,
      project: projectOf(BOTH_ARMS),
      reviewedGrants: [],
      failOnWarnings: false,
    });
    // The judgment legacy carried in two tokens now rides one message, and the position is authored text.
    expect(result.authority.effectiveFindings.map((finding) => finding.token)).toEqual(["maxPages"]);
    expect(result.authority.effectiveFindings[0]?.message).toContain("ARMS: no-rewind + client-lens.");
  },
  DIFFERENTIAL_TIMEOUT_MS,
);

// THE COVERAGE STATEMENT the §4.6 rule owes for a SPLIT, asserted rather than written in prose: the two
// behaviours the conversion changed are reached by ZERO legacy examples, so the replay above is silent about
// them and their successor proofs are the constructed `mustFlag` rows in the modules themselves.
test("the two conversion-changed behaviours have ZERO legacy coverage, which is why they got constructed successor rows", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, "windowed-infinite-query", "67366da91");
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  const filesOf = (example: GateExample): string => (typeof example.files === "string" ? example.files : Object.values(example.files).join("\n"));

  // (1) THE BLINDNESS TRIPWIRE. Legacy's `finalize` fired only when a `packages/client/src/data/` file was
  // loaded; not one legacy example plants one, so the arm carved into `-health` was never exercised.
  const armedBlindness = examples.filter((example) => Object.keys(legacyFiles(example, "x")).some((path) => path.includes("packages/client/src/data/")));
  expect(armedBlindness).toEqual([]);

  // (2) THE TWO-ARM CARDINALITY MERGE. No legacy example makes BOTH arms bite on one cap (a lens in the file
  // AND an unrecoverable rewind), so the 2 → 1 finding change is invisible to the replay.
  const bothArms = examples.filter((example) => {
    const source = filesOf(example);
    return source.includes("maxPages") && source.includes(".filter(") && !source.includes("getPreviousPageParam: (p) =>");
  });
  expect(bothArms).toEqual([]);
});
