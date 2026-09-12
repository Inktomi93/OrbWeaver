// The family net for the two Playwright poll laws (#121) AND their §4.6 SPLIT-ARM DIFFERENTIAL (#2000,
// p-parity-tier1).
//
// `ct-poll-schedule-and-paint-health` exists BECAUSE one legacy descriptor carried three arms: ARM A (a
// shared `intervals` schedule) and ARM B (an unbarriered untrusted trigger) are per-node occurrence checks,
// while ARM C — the founding-file blindness tripwire — is a whole-population question. The split gave A+B
// `execution: "selected-files"` and C `execution: "entire-population"`, so the legacy gate's behaviour is
// now the behaviour of both policies together. This file compares them against the frozen legacy
// descriptor at `bd56189ba`, the commit immediately before `47c35b61c` split them.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies.
//   2. THE BLINDNESS GUARD CHANGED MECHANISM. The legacy `finalize` self-guarded on a REAL-TREE ANCHOR
//      (`fileLoaded(packages/db/src/schema/index.ts)`) so a conformance mini-project could not "prove" the
//      founding file rotted. The final health policy has no anchor: it narrows its own POPULATION to the
//      founding file (`{ in: ["@tests"], under: ["tests/client/lib/**"], named: ["motion-stats.ct.tsx"] }`)
//      and declares `execution: "entire-population"`, so a narrowed request defers it. Over a two-file
//      fixture the two therefore disagree by design, which is why ARM A+B are replayed against the
//      occurrence policy and ARM C gets its own successor proof below with the legacy anchor present.
//   3. ARM C's ANCHOR_GONE SUB-ARM WAS RETIRED INTO A TOOL ERROR. The legacy reported a gate-owned finding
//      on line 1 of the gate module when the founding file was missing. Under the final contract that
//      population resolves to zero admitted paths from a NON-EMPTY `@tests` candidate set, which
//      `resolvePopulation` REFUSES — louder, not quieter, and the successor test below asserts the refusal
//      verbatim rather than trusting the module header's claim of it.
//   4. ARM C's FOUR CONTENT sub-arms survive unchanged in wording, but are anchored on the FOUNDING FILE
//      itself rather than on the gate module (same reason as 3 — the gate module is outside `@tests`).
//
// THE FINDING THIS DIFFERENTIAL PRODUCED (reported to #2000/#2005): the legacy corpus NEVER EXERCISED ARM
// C. None of the legacy gate's 7 mustFlag / 7 mustPass examples loads `packages/db/src/schema/index.ts`, so
// `finalize` returned at its first line in every one of them — the arm the split carried out into its own
// policy was covered by zero legacy rows. The successor proof below is therefore CONSTRUCTED from the
// legacy arm's own trigger conditions, not replayed from its corpus.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as occurrence } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/ct-poll-schedule-and-paint-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a shared poll schedule and an unbarriered evaluate trigger are flagged, and the founding anchor stays sound", () => {
  expect(verifyPolicyProofs([occurrence, health])).toEqual([]);
});

const ROOT = "/ct-poll-schedule-and-paint";
/** The commit immediately before `47c35b61c` split the gate — the last one carrying all three arms. */
const BASE = "bd56189bacbd0b4c79103fc10fe94d5499d9f3fd";
const LEGACY_PATH = "tooling/src/verify/gates/ct-poll-schedule-and-paint.ts";
/** The legacy finalize's real-tree anchor — present on the legacy side of the ARM C proof ONLY. */
const LEGACY_REAL_RUN_ANCHOR = "packages/db/src/schema/index.ts";
const FOUNDING_ANCHOR = "tests/client/lib/motion-stats.ct.tsx";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "tests/x.ct.tsx"]: example.files } : example.files;
}

/** ONE comparable line per finding. ARM C's content sub-arms are identified by their wording (which the
 *  conversion preserved verbatim) plus the shape they name, so the classified anchor move cannot hide a
 *  sub-arm going quiet; everything else is an occurrence finding compared by position and token. */
function verdictOf(
  findings: readonly { readonly file: string; readonly line: number; readonly token?: string; readonly message: string }[],
): readonly string[] {
  return findings
    .map((finding) => {
      const blind = /exercises (?<what>.+?) any more —/u.exec(finding.message)?.groups?.["what"];
      if (blind !== undefined) {
        return `ARM-C blind: ${blind}`;
      }
      return finding.message.includes("is no longer at") ? "ARM-C anchor-gone" : `OCCURRENCE ${finding.file}:${finding.line} ${finding.token ?? "<no token>"}`;
    })
    .toSorted((left, right) => left.localeCompare(right));
}

function legacyVerdict(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return verdictOf((result.gates[0]?.findings ?? []).map((finding) => ({ ...finding, message: finding.message ?? gate.message })));
}

interface FinalRun {
  readonly lines: readonly string[];
  readonly refusals: readonly string[];
}

function finalRun(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): FinalRun {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies: [...policies], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
  return {
    lines: verdictOf(result.authority.effectiveFindings.map((finding) => ({ ...finding, message: finding.message ?? messageOf.get(finding.policyId) ?? "" }))),
    // Collected so a refusal can never read as "zero findings, therefore clean" — the run must be shown to
    // have HAPPENED before its emptiness means anything.
    refusals: [...result.factErrors.map(({ factId, phase }) => `${factId}:${phase}`), ...result.toolErrors.map(({ phase, message }) => `${phase}: ${message}`)],
  };
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

/** The frozen legacy descriptor. Its two relative imports are rewritten to file URLs (the copy lives
 *  outside the checkout); `lib/pass.ts` changed only additively since BASE, and `fileLoaded` is untouched. */
async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the occurrence half reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples.length).toBeGreaterThan(0);
  let flagged = 0;
  for (const example of examples) {
    const files = legacyFiles(example);
    const label = `${occurrence.id}: ${example.why}`;
    // The legacy finalize self-guarded OFF here (classified difference 2) — which is exactly the coverage
    // gap this differential found, and what makes the legacy verdict a pure ARM A+B verdict.
    expect(Object.keys(files), label).not.toContain(LEGACY_REAL_RUN_ANCHOR);
    const before = legacyVerdict(legacy, files);
    expect(
      before.filter((line) => line.startsWith("ARM-C")),
      `${label}: the legacy corpus must not reach the moved arm`,
    ).toEqual([]);
    const after = finalRun([occurrence], files);
    expect(after.refusals, label).toEqual([]);
    expect(after.lines, label).toEqual(before);
    flagged += before.length;
  }
  expect(flagged).toBeGreaterThan(0);
});

// ─── SUCCESSOR PROOF for ARM C (§4.6) ───────────────────────────────────────────────────────────────────
// Constructed, not replayed: the legacy corpus never armed `finalize` (asserted above). The founding-file
// sources below are minimal carriers of the four shapes ARM C counts, each rotted one shape at a time.
const HEALTHY_FOUNDING =
  'import { expect, test } from "@playwright/experimental-ct-react";\n' +
  "function settlePaint(page) { return page.evaluate(() => requestAnimationFrame(() => {})); }\n" +
  'test("g", async ({ page }) => {\n' +
  '  const button = page.getByRole("button");\n' +
  "  await settlePaint(page);\n" +
  "  await button.evaluate((el) => el.click());\n" +
  "  await expect.poll(async () => (await read(page)).cls, { intervals: [50, 100, 200, 250] }).toBeGreaterThan(0);\n" +
  "});\n";
/** The same file with its schedule reached by identifier — ARM A's legal shape gone, everything else kept. */
const NO_FRESH_SCHEDULE = HEALTHY_FOUNDING.replace("{ intervals: [50, 100, 200, 250] }", "POLL_OPTS");
/** The same file with no helper reaching requestAnimationFrame — ARM B's derived barrier vocabulary gone. */
const NO_BARRIER = HEALTHY_FOUNDING.replace("page.evaluate(() => requestAnimationFrame(() => {}))", "Promise.resolve()");

const ARM_C_SCENARIOS: readonly { readonly why: string; readonly source: string; readonly expected: readonly string[] }[] = [
  { why: "HEALTHY — the founding file still exercises all four shapes", source: HEALTHY_FOUNDING, expected: [] },
  {
    why: "ROT — ARM A's legal shape (a freshly-minted schedule) is gone from the founding file",
    source: NO_FRESH_SCHEDULE,
    expected: ["ARM-C blind: no freshly-minted poll schedule (ARM A's legal shape)"],
  },
  {
    why: "ROT — ARM B's derived barrier vocabulary is gone from the founding file",
    source: NO_BARRIER,
    // Deleting the barrier necessarily arms ARM B on the same file as well (the trigger is now unbarriered
    // ahead of a motion poll), and BOTH engines say so — which is the point: the split did not move the
    // occurrence arm's verdict when the health arm's input changed.
    expected: ["ARM-C blind: no presented-paint barrier helper (ARM B's derived vocabulary)", `OCCURRENCE ${FOUNDING_ANCHOR}:6 evaluate`],
  },
];

test("the health half reproduces the legacy ARM C content sub-arms the legacy corpus never reached", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  for (const scenario of ARM_C_SCENARIOS) {
    // The legacy side needs its real-tree anchor to open the guard; the final health policy's population
    // admits only the founding file, so the extra `packages/db` file is inert to it.
    const files = { [FOUNDING_ANCHOR]: scenario.source, [LEGACY_REAL_RUN_ANCHOR]: "export const schema = {};\n" };
    expect(legacyVerdict(legacy, files), `legacy: ${scenario.why}`).toEqual(scenario.expected);
    const after = finalRun([occurrence, health], files);
    expect(after.refusals, `final: ${scenario.why}`).toEqual([]);
    expect(after.lines, `final: ${scenario.why}`).toEqual(scenario.expected);
  }
});

test("ARM C's retired anchor-gone sub-arm became a LOUDER population refusal, not a dropped rule", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  // A tree with tests on it but no founding file at all — the exact scenario ANCHOR_GONE existed for.
  const files = {
    "tests/client/features/other.ct.tsx": 'import { test } from "@playwright/experimental-ct-react";\ntest("g", async () => {});\n',
    [LEGACY_REAL_RUN_ANCHOR]: "export const schema = {};\n",
  };
  // LEGACY: one gate-owned finding on line 1 of the gate module.
  expect(legacyVerdict(legacy, files)).toEqual(["ARM-C anchor-gone"]);
  // FINAL: the population itself refuses — the candidate set is non-empty and the named anchor admits
  // nothing, so the run cannot start. A refusal is an exit-2 tool error, never a silent clean.
  const after = finalRun([health], files);
  expect(after.lines).toEqual([]);
  expect(after.refusals).toHaveLength(1);
  expect(after.refusals[0]).toContain("admitted zero paths");
});
