// THE §4.6 SPLIT-ARM CONVERSION DIFFERENTIAL for the four wave-5 ordinary-visitors SPLITS (#2000,
// lane p-parity-tier2a). One legacy descriptor became TWO final policies in each case, so the legacy
// gate's behaviour is now the behaviour of the two policies TOGETHER and nothing else compares the union.
// Conformance (`ordinary-visitors-family.test.ts`) runs each policy's own rows and is structurally blind
// to this: a proof row rewritten after conversion only proves the new code agrees with itself.
//
// THE FOUR SPLITS, all carved out of `4885cde80` (2026-09-11), so the frozen legacy SHA is the single
// commit before it — `5dd83aaa4`, verified by `git show 5dd83aaa4:<path> | grep -c GateDescriptor` = 2 on
// all four parents:
//
//   no-raw-egress                      → no-raw-egress            + no-rejected-cors-proxy
//   persistence-boundary               → persistence-boundary     + persisted-store-registry
//   registry-assembly-at-door-only     → registry-assembly-…      + no-mutating-register-api
//   no-inline-types                    → no-inline-types          + no-inline-domain-interface
//
// WHAT THIS FILE ASSERTS, AND WHY IT IS SHAPED LIKE THIS. §4.6 requires comparing FINDINGS, POPULATIONS
// AND TOOL ERRORS — a population table alone is one third of the rule. So every legacy example is replayed
// through the frozen legacy `runPass` over its own file map AND through `runPolicyPass` over the two final
// policies, and the declared row below states all three for both sides. Every delta is therefore visible
// and classified rather than averaged into a verdict.
//
// AND EVERY ROW CARRIES ITS COVERAGE NUMBER FIRST (`splitArm`) — how many findings the LEGACY side
// produced on the arm that moved. A clean differential over an arm the legacy suite never exercised is
// evidence of nothing, and a split is exactly where that bites: the arms carved into a sibling are the
// awkward ones nobody wrote proof rows for, which is often WHY they were carved out. Asserting the ZERO
// per example is what stops the next reader reading a vacuous replay as a passing one.
//
// THE MEASURED LEGACY-SIDE COVERAGE OF EACH MOVED ARM, read before anything else in this file:
//   `no-rejected-cors-proxy`      — 1 of 9 legacy examples (mustFlag[1], a StringLiteral). The four other
//                                   subscribed literal kinds have ZERO legacy coverage.
//   `no-mutating-register-api`    — 1 of 4 (mustFlag[1], a method in a feature file). The site the split
//                                   EXISTS for — a `register` declaration INSIDE the door — has ZERO.
//   `no-inline-domain-interface`  — 2 of 9 (mustFlag[1], mustFlag[4]). Its population fence (an exported
//                                   interface OUTSIDE `domain/**`) has ZERO.
//   `persisted-store-registry`    — unregistered-name arm 2 of 5; STALE arm ZERO of 9, because the legacy
//                                   `finalize` self-guarded on a real-tree anchor no legacy example loads.
// Where the number is zero the successor proof below is CONSTRUCTED from the arm's own trigger conditions
// instead of replayed, and each constructed block names the cut that turns it red.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as domainInterface } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as registerApi } from "../../../../tooling/src/verify/gates/no-mutating-register-api.ts";
import { gate as rawEgress } from "../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as corsProxy } from "../../../../tooling/src/verify/gates/no-rejected-cors-proxy.ts";
import { DEVICE_LOCAL_REGISTRY, gate as persistedStoreRegistry } from "../../../../tooling/src/verify/gates/persisted-store-registry.ts";
import { gate as persistenceBoundary } from "../../../../tooling/src/verify/gates/persistence-boundary.ts";
import { gate as registryDoor } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/split-arm-parity";
/** `4885cde80~1` — the last commit on which all four parents were single legacy `GateDescriptor`s. */
const BASE = "5dd83aaa42c85c361d321fe56bf13063c93edf17";

type Files = Readonly<Record<string, string>>;

/** One finding, reduced to the vocabulary both engines can be compared in. */
interface Seen {
  readonly file: string;
  readonly line: number;
  readonly token: string | undefined;
  readonly message: string;
  readonly policyId: string | undefined;
}

/** What one replay produced. All three halves of §4.6, never just the population. */
interface Replay {
  readonly findings: readonly string[];
  readonly population: number;
  readonly toolErrors: readonly string[];
}

/** ONE in-memory workspace for every replay in this file, cleared between them — the same substrate
 *  `ops/policy-conformance.ts` uses, and for the same reason: a fresh `Project` per scenario re-parses the
 *  default lib files on every `getTypeChecker()`, which is most of this file's wall clock. */
const SHARED = new Project({ useInMemoryFileSystem: true });

function removeSources(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    project.removeSourceFile(sourceFile);
  }
}

function projectOf(files: Files): Project {
  removeSources(SHARED);
  for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
    SHARED.createSourceFile(`${ROOT}/${path}`, source);
  }
  return SHARED;
}

function exampleFiles(example: GateExample, fallback: string): Files {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

function rel(file: string): string {
  return file.startsWith(`${ROOT}/`) ? file.slice(ROOT.length + 1) : file;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right));
}

type Label = (seen: Seen, files: Files) => string;

function legacyReplay(gate: GateDescriptor, files: Files, label: Label): Replay {
  const project = projectOf(files);
  const result = runPass([gate], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return {
    findings: sorted(
      (result.gates[0]?.findings ?? []).map((finding) =>
        label({ file: rel(finding.file), line: finding.line, token: finding.token, message: finding.message ?? gate.message, policyId: undefined }, files),
      ),
    ),
    population: Object.keys(files).filter((path) => gate.scanRoot?.(path) ?? true).length,
    toolErrors: sorted(result.toolErrors.map((error) => `${error.gate}/${error.phase}`)),
  };
}

function finalReplay(policies: readonly GatePolicy[], files: Files, label: Label): Replay {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies: [...policies], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
  const population = new Set<string>();
  for (const owner of result.policies) {
    for (const path of owner.population.effectiveSourcePaths) {
      population.add(path);
    }
  }
  return {
    findings: sorted(
      result.authority.effectiveFindings.map((finding) =>
        label(
          {
            file: rel(finding.file),
            line: finding.line,
            token: finding.token,
            message: finding.message ?? messageOf.get(finding.policyId) ?? "",
            policyId: finding.policyId,
          },
          files,
        ),
      ),
    ),
    population: population.size,
    toolErrors: sorted([
      ...result.toolErrors.map((error) => `${error.policyId}/${error.phase}`),
      ...result.factErrors.map((error) => `${error.factId}/${error.phase}`),
    ]),
  };
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

/** The pre-conversion descriptor, extracted at `BASE` and shimmed so its three relative contract/lib
 *  imports resolve from the scratch directory it is written into. */
async function frozenLegacyGate(scratch: string, legacyPath: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${legacyPath}`], { encoding: "utf8" });
  const target = join(scratch, basename(legacyPath));
  writeFileSync(
    target,
    source
      .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
      .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
      .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`),
  );
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(legacyPath)}`)) as { readonly gate: GateDescriptor }).gate;
}

/** One declared comparison. `splitArm` is the LEGACY-side count of findings on the arm that MOVED, and it
 *  is read first: a zero makes everything after it a population/outcome receipt, not catch parity. */
interface Scenario {
  readonly why: string;
  readonly files: Files;
  readonly splitArm: number;
  readonly legacy: readonly string[];
  readonly final: readonly string[];
  readonly legacyErrors?: readonly string[];
  readonly finalErrors?: readonly string[];
}

interface Comparison {
  readonly legacy: GateDescriptor;
  readonly policies: readonly GatePolicy[];
  readonly label: Label;
  readonly isSplitArm: (finding: string) => boolean;
}

/** Replay every scenario through BOTH engines and assert the declared triple. Returns the number of
 *  comparisons so each test can pin its own scenario count — a dropped row would otherwise be silent. */
function runScenarios({ legacy, policies, label, isSplitArm }: Comparison, scenarios: readonly Scenario[]): number {
  for (const [index, scenario] of scenarios.entries()) {
    const tag = `#${index} ${scenario.why}`;
    const before = legacyReplay(legacy, scenario.files, label);
    const after = finalReplay(policies, scenario.files, label);
    expect(before.findings.filter(isSplitArm).length, `${tag} — LEGACY-SIDE COVERAGE of the moved arm`).toBe(scenario.splitArm);
    expect(before.findings, `${tag} — legacy findings`).toEqual(sorted(scenario.legacy));
    expect(after.findings, `${tag} — final findings`).toEqual(sorted(scenario.final));
    expect(before.toolErrors, `${tag} — legacy tool errors`).toEqual(sorted(scenario.legacyErrors ?? []));
    expect(after.toolErrors, `${tag} — final tool errors`).toEqual(sorted(scenario.finalErrors ?? []));
  }
  return scenarios.length;
}

function legacyScenarios(legacy: GateDescriptor, fallback: string): readonly Files[] {
  return [...legacy.mustFlag, ...legacy.mustPass].map((example) => exampleFiles(example, fallback));
}

// ─── 1. no-raw-egress → no-raw-egress + no-rejected-cors-proxy ───────────────────────────────────────────
// The corsproxy half moved because its AUTHORITY differs: routing egress through the named-rejected proxy
// has no home that may do it, so the policy is HARD and carries no suppression door, while raw `fetch` is
// reviewed-grant. The legacy descriptor could not hold both.

const EGRESS_LEGACY = "tooling/src/verify/gates/no-raw-egress.ts";
const EGRESS_POLICIES = [rawEgress, corsProxy];

function egressLabel(seen: Seen): string {
  if (seen.policyId !== undefined) {
    return `${seen.policyId === "no-rejected-cors-proxy" ? "CORSPROXY" : "FETCH"} ${seen.file}`;
  }
  if (seen.message.includes("stale FETCH_SANCTIONED zone")) {
    return "STALE-ZONE";
  }
  return `${seen.token === "corsproxy.io" ? "CORSPROXY" : "FETCH"} ${seen.file}`;
}

const isCorsProxy = (finding: string): boolean => finding.startsWith("CORSPROXY ");

/** The three template fixtures the corsproxy arm's uncovered kinds need. Each carries a REAL interpolation,
 *  which is the only way to produce a `TemplateHead` / `TemplateMiddle` / `TemplateTail` node, so the
 *  placeholder-in-a-string rule is suppressed on exactly those lines. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a fixture string — a real TemplateHead node is what the row exercises.
const TEMPLATE_HEAD_FIXTURE = "export const proxy = (u: string): string => `https://corsproxy.io/?url=${u}`;\n";
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a fixture string — a real TemplateMiddle node is what the row exercises.
const TEMPLATE_MIDDLE_FIXTURE = "export const proxy = (s: string, u: string): string => `${s}://corsproxy.io/?url=${u}`;\n";
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a fixture string — a real TemplateTail node is what the row exercises.
const TEMPLATE_TAIL_FIXTURE = "export const proxy = (s: string): string => `${s}://corsproxy.io/?url=`;\n";

test("no-raw-egress: the corsproxy half replays identically, and every other delta is the grant move", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, EGRESS_LEGACY);
  const files = legacyScenarios(legacy, "packages/server/src/domain/x/verb.ts");
  const at = (index: number): Files => files[index] as Files;
  const compared = runScenarios({ legacy, policies: EGRESS_POLICIES, label: egressLabel, isSplitArm: isCorsProxy }, [
    {
      why: "legacy mustFlag[0] — a bare fetch in an unsanctioned zone. THE SIBLING'S arm, 1:1",
      files: at(0),
      splitArm: 0,
      legacy: ["FETCH packages/server/src/domain/hub/verbs/browse.ts"],
      final: ["FETCH packages/server/src/domain/hub/verbs/browse.ts"],
    },
    {
      why: "legacy mustFlag[1] — THE ONLY LEGACY EXAMPLE THAT EXERCISES THE MOVED ARM. The founding StringLiteral, byte-identical on both sides",
      files: at(1),
      splitArm: 1,
      legacy: ["CORSPROXY packages/server/src/domain/hub/lib/x.ts"],
      final: ["CORSPROXY packages/server/src/domain/hub/lib/x.ts"],
    },
    {
      why: "legacy mustFlag[2] — the de-sanctioned imagery verb; sibling arm, 1:1",
      files: at(2),
      splitArm: 0,
      legacy: ["FETCH packages/server/src/domain/imagery/verbs/generate-picture.ts"],
      final: ["FETCH packages/server/src/domain/imagery/verbs/generate-picture.ts"],
    },
    {
      why: "legacy mustFlag[3] — CLASSIFIED: the stale-ZONE finalize arm was RETIRED, not split. Its successor is the central reviewed-grant liveness table, which is why the final reports the provider file itself rather than a stale directory row. Not this lane's arm, recorded so the delta is not silent",
      files: at(3),
      splitArm: 0,
      legacy: ["STALE-ZONE"],
      final: ["FETCH packages/server/src/infra/providers/vllm/engine/client.ts"],
    },
    {
      why: "legacy mustPass[0] — safeFetch and a method .fetch pass in both engines",
      files: at(4),
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "legacy mustPass[1] — CLASSIFIED EXEMPTION-MECHANISM MOVE: the `FETCH_SANCTIONED` regex zone became a per-FILE reviewed grant, so the site is now REPORTED and licensed by a row rather than hidden by a directory. `reviewedGrants: []` here, so the raw candidate shows",
      files: at(5),
      splitArm: 0,
      legacy: [],
      final: ["FETCH packages/server/src/infra/providers/vllm/engine/client.ts"],
    },
    {
      why: "legacy mustPass[2] — the same mechanism move on the infra/network zone",
      files: at(6),
      splitArm: 0,
      legacy: [],
      final: ["FETCH packages/server/src/infra/network/openai-models.ts"],
    },
    {
      why: "legacy mustPass[3] — THE TOOL-ERROR DELTA, and it is the runtime being stricter: a fixture holding only `@client` admits ZERO paths for both server policies, which the final engine calls a `[population]` tool error while the legacy scan simply looked at nothing. Silence about zero admissions is what §4.8 removed",
      files: at(7),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["no-raw-egress/population", "no-rejected-cors-proxy/population"],
    },
    {
      why: "legacy mustPass[4] — both zones earned; the same grant move, on two files",
      files: at(8),
      splitArm: 0,
      legacy: [],
      final: ["FETCH packages/server/src/infra/network/egress.ts", "FETCH packages/server/src/infra/providers/vllm/engine/client.ts"],
    },
  ]);
  expect(compared).toBe(legacy.mustFlag.length + legacy.mustPass.length);
});

// CONSTRUCTED successor proof for the four subscribed literal kinds the legacy corpus never reached, and
// for the ONE place the two engines genuinely disagree on this arm.
test("no-rejected-cors-proxy: the arm's four uncovered spellings, and the duplicate the split removed", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, EGRESS_LEGACY);
  const host = "packages/server/src/domain/hub/lib";
  const compared = runScenarios({ legacy, policies: EGRESS_POLICIES, label: egressLabel, isSplitArm: isCorsProxy }, [
    {
      why: "THE ONE REAL FINDING DIFFERENCE ON THIS ARM: legacy subscribed `CallExpression` for the fetch half and then applied a TEXT test to every non-fetch call, so a call whose source text contains the host was reported TWICE — once on the call, once on the literal inside it. The split dropped the CallExpression subscription, so the site is one finding. A duplicate on one occurrence is also unwaivable by construction, which is moot here (the policy is HARD) and would not have been in the ordinary sibling",
      files: { [`${host}/call.ts`]: 'export const proxy = String("https://corsproxy.io/?url=");\n' },
      splitArm: 2,
      legacy: [`CORSPROXY ${host}/call.ts`, `CORSPROXY ${host}/call.ts`],
      final: [`CORSPROXY ${host}/call.ts`],
    },
    {
      why: "`TemplateHead` — zero legacy examples, and the header's 'any part of a template' claim. Dropping `TemplateHead` from `STRING_KINDS` kills this",
      files: { [`${host}/head.ts`]: TEMPLATE_HEAD_FIXTURE },
      splitArm: 1,
      legacy: [`CORSPROXY ${host}/head.ts`],
      final: [`CORSPROXY ${host}/head.ts`],
    },
    {
      why: "`TemplateMiddle` — the host in a quasi that is neither head nor tail",
      files: { [`${host}/middle.ts`]: TEMPLATE_MIDDLE_FIXTURE },
      splitArm: 1,
      legacy: [`CORSPROXY ${host}/middle.ts`],
      final: [`CORSPROXY ${host}/middle.ts`],
    },
    {
      why: "`TemplateTail` — the host in the closing quasi",
      files: { [`${host}/tail.ts`]: TEMPLATE_TAIL_FIXTURE },
      splitArm: 1,
      legacy: [`CORSPROXY ${host}/tail.ts`],
      final: [`CORSPROXY ${host}/tail.ts`],
    },
    {
      why: "`NoSubstitutionTemplateLiteral` — the backtick spelling with no interpolation",
      files: { [`${host}/bare.ts`]: "export const proxy = `https://corsproxy.io/?url=`;\n" },
      splitArm: 1,
      legacy: [`CORSPROXY ${host}/bare.ts`],
      final: [`CORSPROXY ${host}/bare.ts`],
    },
    {
      why: "A COMMENT NAMING THE BAN IS NOT A VIOLATION in either engine — only literal nodes are delivered",
      files: { [`${host}/why.ts`]: "// D61 rejected routing egress through corsproxy.io.\nexport const proxy = null;\n" },
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "THE POPULATION PORT, both sides: the legacy `scanRoot` was `packages/server/src`, and `@server` reproduces it — the identical literal in `@client` is nothing to either engine. The server anchor keeps the fixture from tool-erroring on zero admissions",
      files: {
        [`${host}/anchor.ts`]: "export const anchor = 1;\n",
        "packages/client/src/features/x/proxy.ts": 'export const proxy = "https://corsproxy.io/?url=";\n',
      },
      splitArm: 0,
      legacy: [],
      final: [],
    },
  ]);
  expect(compared).toBe(7);
});

// ─── 2. persistence-boundary → persistence-boundary + persisted-store-registry ───────────────────────────
// The registry half moved because `DEVICE_LOCAL_REGISTRY` is authoritative DATA under HARD authority, not
// an exemption table, while the raw-storage file list became reviewed grants.

const PERSISTENCE_LEGACY = "tooling/src/verify/gates/persistence-boundary.ts";
const PERSISTENCE_POLICIES = [persistenceBoundary, persistedStoreRegistry];
const PERSIST_DOORS: Files = {
  "packages/client/src/state/create-persisted-store.ts": "export declare function createPersistedStore(name: string, initial: () => unknown): unknown;\n",
  "packages/client/src/state/create-entity-draft-store.ts": "export declare function createEntityDraftStore(options: { name: string }): unknown;\n",
};
/** The final stale arm's real-tree anchor — deliberately NOT a factory home (§4.4a mode-(B)). */
const STALE_ANCHOR = "packages/client/src/main.tsx";
const REGISTERED = Object.keys(DEVICE_LOCAL_REGISTRY);

function persistenceLabel(seen: Seen): string {
  if (seen.message.includes("classifies nothing") || seen.message.includes("DEVICE_LOCAL_REGISTRY entry has NO")) {
    return `STALE ${/"(?<name>[^"]+)"/u.exec(seen.message)?.groups?.["name"] ?? "?"}`;
  }
  if (seen.policyId === "persisted-store-registry" || (seen.token ?? "").startsWith("unregistered persist")) {
    return `REGISTRY ${seen.file}`;
  }
  return `RAW ${seen.file} ${seen.token ?? "?"}`;
}

const isRegistryArm = (finding: string): boolean => finding.startsWith("REGISTRY ") || finding.startsWith("STALE ");

/** Every registry row reported stale, which is what an empty client tree means to both engines. */
const allStale = (...persisted: readonly string[]): readonly string[] => REGISTERED.filter((name) => !persisted.includes(name)).map((name) => `STALE ${name}`);

test("persistence-boundary: the registry half needs the FACTORY DOOR in the fileset, which no legacy row carried", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, PERSISTENCE_LEGACY);
  const files = legacyScenarios(legacy, "packages/client/src/features/x/x.ts");
  const at = (index: number): Files => files[index] as Files;
  // Every legacy row that exercises the registry arm does so by CALLEE TEXT, so none of them contains the
  // factory home. The final policy resolves identity through that home and RECEIPTS it, so the honest
  // answer on a doorless fileset is a refusal — never a silent zero. That refusal IS the delta.
  const refused = ["persisted-store-registry/receipt"];
  const compared = runScenarios({ legacy, policies: PERSISTENCE_POLICIES, label: persistenceLabel, isSplitArm: isRegistryArm }, [
    {
      why: "legacy mustFlag[0] — a raw localStorage read; the sibling's arm, 1:1",
      files: at(0),
      splitArm: 0,
      legacy: ["RAW packages/client/src/features/x/x.ts localStorage"],
      final: ["RAW packages/client/src/features/x/x.ts localStorage"],
      finalErrors: refused,
    },
    {
      why: "legacy mustFlag[1] — an unregistered persist name. LEGACY-SIDE COVERAGE 1, and the final REFUSES instead of reporting: the fixture contains no `create-persisted-store.ts`, so the identity home is unresolvable and the population receipt fails closed. That is the designed answer, and the row below replays the same bytes WITH the door",
      files: at(1),
      splitArm: 1,
      legacy: ["REGISTRY packages/client/src/state/x.ts"],
      final: [],
      finalErrors: refused,
    },
    {
      why: "legacy mustFlag[2] — the `as string` wrapped literal, same refusal for the same reason",
      files: at(2),
      splitArm: 1,
      legacy: ["REGISTRY packages/client/src/state/x.ts"],
      final: [],
      finalErrors: refused,
    },
    {
      why: "legacy mustPass[0] — CLASSIFIED EXEMPTION-MECHANISM MOVE on the sibling: `main.tsx` was a `RAW_STORAGE_ALLOWLIST` file and is a reviewed grant now, so it is reported and licensed by a row",
      files: at(3),
      splitArm: 0,
      legacy: [],
      final: ["RAW packages/client/src/main.tsx localStorage"],
      finalErrors: refused,
    },
    {
      why: "legacy mustPass[1] — a REGISTERED name passes in both engines (the final by refusing to judge a doorless fileset, which is the same outcome for a different and better reason)",
      files: at(4),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: refused,
    },
  ]);
  expect(compared).toBe(legacy.mustFlag.length + legacy.mustPass.length);
});

test("persisted-store-registry: the unregistered-name arm with its door, and the STALE arm no legacy row could reach", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, PERSISTENCE_LEGACY);
  const importPersisted = 'import { createPersistedStore } from "./create-persisted-store.ts";\n';
  const compared = runScenarios({ legacy, policies: PERSISTENCE_POLICIES, label: persistenceLabel, isSplitArm: isRegistryArm }, [
    {
      why: "CATCH PARITY FOR THE MOVED ARM, once the fixture carries the door the identity reader needs: legacy mustFlag[1]'s bytes, plus the factory home AND `main.tsx`, so BOTH engines' stale arms are live and the only discriminator left is the unregistered name. Both report it at the same site. (The 14 STALE rows ride along because no registered name is persisted in this fileset; they are equal on both sides and are the next rows' subject)",
      files: {
        ...PERSIST_DOORS,
        [STALE_ANCHOR]: "export const boot = null;\n",
        "packages/client/src/state/x.ts": `${importPersisted}export const s = createPersistedStore("unregistered-name", () => ({}));\n`,
      },
      splitArm: REGISTERED.length + 1,
      legacy: ["REGISTRY packages/client/src/state/x.ts", ...allStale()],
      final: ["REGISTRY packages/client/src/state/x.ts", ...allStale()],
    },
    {
      why: "AND THE STRONGER READER: the same mint under an ALIAS. The legacy check compared the callee's text, so it saw nothing; the final resolves the declaration. A catch the conversion ADDED",
      files: {
        ...PERSIST_DOORS,
        [STALE_ANCHOR]: "export const boot = null;\n",
        "packages/client/src/state/x.ts":
          'import { createPersistedStore as persist } from "./create-persisted-store.ts";\nexport const s = persist("unregistered-name", () => ({}));\n',
      },
      splitArm: REGISTERED.length,
      legacy: allStale(),
      final: ["REGISTRY packages/client/src/state/x.ts", ...allStale()],
    },
    {
      why: "THE COUNTERFACTUAL the legacy text compare got wrong: a LOCAL function named `createPersistedStore` persists nothing. Legacy accused it; the final does not",
      files: {
        ...PERSIST_DOORS,
        [STALE_ANCHOR]: "export const boot = null;\n",
        "packages/client/src/features/x/local.ts":
          'function createPersistedStore(name: string): string {\n  return name;\n}\nexport const s = createPersistedStore("unregistered-name");\n',
      },
      splitArm: REGISTERED.length + 1,
      legacy: ["REGISTRY packages/client/src/features/x/local.ts", ...allStale()],
      final: allStale(),
    },
    {
      why: "THE ANCHOR MOVE, and the reason this block is CONSTRUCTED rather than replayed. Legacy gated its stale arm on the PERSIST DOOR being loaded; the final gates on `main.tsx`, because gating staleness on the door would silence the arm inside every fixture that resolves the door. So a doors-only fileset fires all 14 rows in legacy and NONE in the final. No legacy example loads either anchor, so this difference was invisible to a replay",
      files: PERSIST_DOORS,
      splitArm: REGISTERED.length,
      legacy: allStale(),
      final: [],
    },
    {
      why: "THE STALE ARM ITSELF, both engines, with each one's anchor present: an empty client tree makes every registry row a classification that outlives its subject. Delete the `for (const name of Object.keys(DEVICE_LOCAL_REGISTRY))` loop in `persisted-store-registry.ts` and this row and the next are the ones that die",
      files: { ...PERSIST_DOORS, [STALE_ANCHOR]: "export const boot = null;\n" },
      splitArm: REGISTERED.length,
      legacy: allStale(),
      final: allStale(),
    },
    {
      why: "THE STALE ARM'S OTHER SIDE: one registered name is persisted, so exactly that row survives and the rest ratchet down — identically in both engines",
      files: {
        ...PERSIST_DOORS,
        [STALE_ANCHOR]: "export const boot = null;\n",
        "packages/client/src/state/shell-store.ts": `${importPersisted}export const s = createPersistedStore("shell", () => ({}));\n`,
      },
      splitArm: REGISTERED.length - 1,
      legacy: allStale("shell"),
      final: allStale("shell"),
    },
  ]);
  expect(compared).toBe(6);
});

// ─── 3. registry-assembly-at-door-only → registry-assembly-at-door-only + no-mutating-register-api ───────
// The `register()` ban moved because its POPULATION differs: assembly is legal at the door, a mutating
// register API is legal nowhere. Folding both arms into one descriptor under the final contract would have
// blinded the ban inside exactly the modules that do the most registering.

const REGISTRY_LEGACY = "tooling/src/verify/gates/registry-assembly-at-door-only.ts";
const REGISTRY_POLICIES = [registryDoor, registerApi];
/** The assembly policy resolves its factories through this home and receipts it; without the file in the
 *  fileset its run REFUSES, which is why every scenario below that is about `register` still carries it. */
const REGISTRY_HOME: Files = {
  "packages/client/src/lib/registry.ts":
    "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
};

function registryLabel(seen: Seen): string {
  const register = seen.policyId === "no-mutating-register-api" || (seen.policyId === undefined && seen.token === "register");
  return `${register ? "REGISTER" : "ASSEMBLY"} ${seen.file}`;
}

const isRegisterArm = (finding: string): boolean => finding.startsWith("REGISTER ");

test("registry-assembly-at-door-only: the register() ban replays 1:1, and the assembly half becomes an identity read", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, REGISTRY_LEGACY);
  const files = legacyScenarios(legacy, "packages/client/src/features/x/lib/x.ts");
  const at = (index: number): Files => files[index] as Files;
  const compared = runScenarios({ legacy, policies: REGISTRY_POLICIES, label: registryLabel, isSplitArm: isRegisterArm }, [
    {
      why: "legacy mustFlag[0] — a createRegistry call in a feature. The final REFUSES rather than reporting: the fixture imports the factory from `#lib`, which resolves to nothing, and the assembly policy receipts its project home instead of reporting a silent zero. The sibling's arm and its designed answer",
      files: at(0),
      splitArm: 0,
      legacy: ["ASSEMBLY packages/client/src/features/x/lib/x-section.ts"],
      final: [],
      finalErrors: ["registry-assembly-at-door-only/receipt"],
    },
    {
      why: "legacy mustFlag[1] — THE ONLY LEGACY EXAMPLE THAT EXERCISES THE MOVED ARM: a mutating `register()` method in a feature file. Byte-identical on both sides",
      files: at(1),
      splitArm: 1,
      legacy: ["REGISTER packages/client/src/lib/x.ts"],
      final: ["REGISTER packages/client/src/lib/x.ts"],
      finalErrors: ["registry-assembly-at-door-only/receipt"],
    },
    {
      why: "legacy mustPass[0] — `main.tsx`, the door. Legacy tested the path in the visitor; the final SUBTRACTS the door from the assembly policy's population, so the fixture admits nothing for it and tool-errors. Same outcome, stricter about measuring nothing",
      files: at(2),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["registry-assembly-at-door-only/population"],
    },
    {
      why: "legacy mustPass[1] — a `compose/` module, the same population subtraction",
      files: at(3),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["registry-assembly-at-door-only/population"],
    },
  ]);
  expect(compared).toBe(legacy.mustFlag.length + legacy.mustPass.length);
});

test("no-mutating-register-api: the sites the split EXISTS for, which no legacy example visited", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, REGISTRY_LEGACY);
  const body = "export const registry = {\n  register(id: string): void {\n    void id;\n  },\n};\n";
  const compared = runScenarios({ legacy, policies: REGISTRY_POLICIES, label: registryLabel, isSplitArm: isRegisterArm }, [
    {
      why: "THE WHOLE REASON FOR THE SPLIT, and it had ZERO legacy coverage: a mutating `register` INSIDE `main.tsx`. Legacy judged it because its scanRoot was all client source; the final judges it because `no-mutating-register-api` keeps the WHOLE `@client` population while its sibling subtracts the door. Narrow this policy's population to the sibling's and this row is the one that dies",
      files: { ...REGISTRY_HOME, "packages/client/src/main.tsx": body },
      splitArm: 1,
      legacy: ["REGISTER packages/client/src/main.tsx"],
      final: ["REGISTER packages/client/src/main.tsx"],
    },
    {
      why: "the same site in a `compose/` module — the other half of the subtraction the sibling makes and this policy must not",
      files: { ...REGISTRY_HOME, "packages/client/src/compose/sections.ts": "export function register(id: string): void {\n  void id;\n}\n" },
      splitArm: 1,
      legacy: ["REGISTER packages/client/src/compose/sections.ts"],
      final: ["REGISTER packages/client/src/compose/sections.ts"],
    },
    {
      why: "the CONST-BOUND ARROW spelling, uncovered by the legacy corpus and reproduced exactly",
      files: { ...REGISTRY_HOME, "packages/client/src/features/x/lib/arrow.ts": "export const register = (id: string): void => {\n  void id;\n};\n" },
      splitArm: 1,
      legacy: ["REGISTER packages/client/src/features/x/lib/arrow.ts"],
      final: ["REGISTER packages/client/src/features/x/lib/arrow.ts"],
    },
    {
      why: "a NON-FUNCTION binding named `register` registers nothing — the value-shape fence, preserved",
      files: { ...REGISTRY_HOME, "packages/client/src/lib/data.ts": 'export const register = { id: "a" };\n' },
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "THE POPULATION PORT: the legacy scanRoot was `packages/client/src/`, and `@client` reproduces it — the identical declaration in `@server` is nothing to either engine",
      files: { ...REGISTRY_HOME, "packages/server/src/domain/tool-use/registry.ts": "export function register(id: string): void {\n  void id;\n}\n" },
      splitArm: 0,
      legacy: [],
      final: [],
    },
  ]);
  expect(compared).toBe(5);
});

// ─── 4. no-inline-types → no-inline-types + no-inline-domain-interface ───────────────────────────────────
// The interface arm moved because its POPULATION differs: legacy judged an exported `interface` only under
// `packages/server/src/domain/**` while judging type aliases across the whole corpus. One policy has one
// population, so the narrower arm became its own policy at exactly its old width.

const INLINE_LEGACY = "tooling/src/verify/gates/no-inline-types.ts";
const INLINE_POLICIES = [inlineTypes, domainInterface];

/** Legacy reports the declaration node and carries ONE message for both arms, so the arm is read off the
 *  fixture line the finding points at — the only identity the legacy engine exposes here. */
function inlineLabel(seen: Seen, files: Files): string {
  if (seen.policyId !== undefined) {
    return `${seen.policyId === "no-inline-domain-interface" ? "INTERFACE" : "TYPE"} ${seen.file}`;
  }
  const line = (files[seen.file] ?? "").split("\n")[seen.line - 1] ?? "";
  return `${line.trimStart().startsWith("export interface") ? "INTERFACE" : "TYPE"} ${seen.file}`;
}

const isInterfaceArm = (finding: string): boolean => finding.startsWith("INTERFACE ");

test("no-inline-types: both arms replay 1:1, and the type-HOME rows become zero-admission tool errors", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, INLINE_LEGACY);
  const files = legacyScenarios(legacy, "packages/server/src/domain/x/verb.ts");
  const at = (index: number): Files => files[index] as Files;
  const compared = runScenarios({ legacy, policies: INLINE_POLICIES, label: inlineLabel, isSplitArm: isInterfaceArm }, [
    {
      why: "legacy mustFlag[0] — an exported type alias in a verb; the sibling's arm, 1:1",
      files: at(0),
      splitArm: 0,
      legacy: ["TYPE packages/server/src/domain/x/verb.ts"],
      final: ["TYPE packages/server/src/domain/x/verb.ts"],
    },
    {
      why: "legacy mustFlag[1] — AN EXERCISED MOVED ARM: an exported interface in a verb, reported by both engines at the same file",
      files: at(1),
      splitArm: 1,
      legacy: ["INTERFACE packages/server/src/domain/x/verb.ts"],
      final: ["INTERFACE packages/server/src/domain/x/verb.ts"],
    },
    {
      why: "legacy mustFlag[2] — an exported zod schema; the sibling's arm, 1:1",
      files: at(2),
      splitArm: 0,
      legacy: ["TYPE packages/server/src/domain/x/verb.ts"],
      final: ["TYPE packages/server/src/domain/x/verb.ts"],
    },
    {
      why: "legacy mustFlag[3] — a tool's ops/ exporting a shape. The interface policy's population admits nothing here (`@server` under `domain/**`), which the final engine reports as a population tool error while still reporting the type alias",
      files: at(3),
      splitArm: 0,
      legacy: ["TYPE tooling/src/snap/ops/capture.ts"],
      final: ["TYPE tooling/src/snap/ops/capture.ts"],
      finalErrors: ["no-inline-domain-interface/population"],
    },
    {
      why: "legacy mustFlag[4] — THE SECOND EXERCISED MOVED ARM (#408, `domain/rpg/tools/`): a domain tool subsystem is domain code, and both engines still say so",
      files: at(4),
      splitArm: 1,
      legacy: ["INTERFACE packages/server/src/domain/rpg/tools/apply.ts"],
      final: ["INTERFACE packages/server/src/domain/rpg/tools/apply.ts"],
    },
    {
      why: "legacy mustPass[0] — the `contract/` type home. Legacy tested the path in the visitor and passed; the final SUBTRACTS the home from both populations, so a home-only fixture admits zero paths and tool-errors. No catch changed: the site is out of the subject in both engines",
      files: at(5),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["no-inline-domain-interface/population", "no-inline-types/population"],
    },
    { why: "legacy mustPass[1] — an UNEXPORTED alias, passing in both", files: at(6), splitArm: 0, legacy: [], final: [] },
    {
      why: "legacy mustPass[2] — `tooling/src/_shared/`, the same population subtraction",
      files: at(7),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["no-inline-domain-interface/population", "no-inline-types/population"],
    },
    {
      why: "legacy mustPass[3] — a tool's `contract/` slot, likewise",
      files: at(8),
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["no-inline-domain-interface/population", "no-inline-types/population"],
    },
  ]);
  expect(compared).toBe(legacy.mustFlag.length + legacy.mustPass.length);
});

test("no-inline-domain-interface: the narrowing the split had to PRESERVE, which no legacy mustPass row covered", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, INLINE_LEGACY);
  const iface = "export interface Foo {\n  readonly x: string;\n}\n";
  const domainAnchor: Files = { "packages/server/src/domain/x/anchor.ts": "export const anchor = 1;\n" };
  const compared = runScenarios({ legacy, policies: INLINE_POLICIES, label: inlineLabel, isSplitArm: isInterfaceArm }, [
    {
      why: "THE POPULATION FENCE THE SPLIT EXISTS TO KEEP, with ZERO legacy coverage: legacy judged an exported interface ONLY under `packages/server/src/domain/**`, so infra is silent. Widen this policy's population past `under: packages/server/src/domain/**` and this row is the one that dies — and it would have been a silent new accusation on every infra/transport/foundation module",
      files: { ...domainAnchor, "packages/server/src/infra/network/egress.ts": iface },
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "the other half of the same fence: a CLIENT component's exported prop interface is a different question, and neither engine answers it. The interface policy admits nothing from this fileset, which the final reports honestly",
      files: { "packages/client/src/features/x/panel.ts": "export interface Props {\n  readonly x: string;\n}\n" },
      splitArm: 0,
      legacy: [],
      final: [],
      finalErrors: ["no-inline-domain-interface/population"],
    },
    {
      why: "`notUnder: **/contract/**` ported from the legacy `isTypeHome` `/contract/` clause — an interface in the domain's own contract slot passes in both engines",
      files: { ...domainAnchor, "packages/server/src/domain/x/contract/types.ts": iface },
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "`notNamed: *.test.ts` ported from the legacy `.test.ts` clause — the test mirror is a type home in both engines",
      files: { ...domainAnchor, "packages/server/src/domain/x/verb.test.ts": iface },
      splitArm: 0,
      legacy: [],
      final: [],
    },
    {
      why: "an UNEXPORTED interface in a domain verb is file-local: no finding in either engine, and the `hasExportKeyword` test is what says so",
      files: { "packages/server/src/domain/x/verb.ts": "interface Foo {\n  readonly x: string;\n}\nexport const use = (value: Foo): string => value.x;\n" },
      splitArm: 0,
      legacy: [],
      final: [],
    },
  ]);
  expect(compared).toBe(5);
});
