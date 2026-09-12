// The standing family floor for `session-channel` — the #1950 split of the legacy `session-channel-boundary`
// descriptor into `session-channel-boundary` (ordinary occurrence, per file) and
// `session-channel-boundary-health` (hard home tripwire, whole tree). What a declared row structurally
// cannot express lives here:
//
//   §4.2 — the ordinary policy's identity arm, ALL THREE assertions (`effectiveFindings []`,
//          `waivedFindings 1`, `authorityAlarms []`), alarms first so a dead position's alarm text surfaces.
//   §4.5 — the health policy is `entire-population`: a narrowed request must DEFER rather than partially
//          run the tripwire and "discover" the home dead.
//   §4.6 — the split differential against the frozen legacy descriptor at `774231540`: every legacy
//          example replayed through the legacy `runPass` and through the UNION of both final policies,
//          with the two classified differences asserted rather than averaged: (1) TRIPWIRE ANCHOR — legacy
//          reported the blindness verdict on line 1 of the GATE MODULE ITSELF, outside `@client` and
//          therefore a path `ctx.report.file` cannot express; the health policy anchors on the real-tree
//          anchor `packages/client/src/lib/index.ts` instead; (2) POSITION — the occurrence finding moved
//          from `new BroadcastChannel` (offset 0 of the `new` expression) to the CALLEE `BroadcastChannel`
//          (four columns later), so an aliased construction is waivable at its own spelling; (3) EMPTY
//          ADMISSION — the legacy server-only declared-limit example admits nothing under `@client`, and
//          the final population resolver refuses that at the population phase where legacy visited nothing.
//          Legacy-side coverage, read first: the occurrence arm fires in 2 of 5 legacy examples and the
//          tripwire in 1 of 5 — both nonzero, so the replay is evidence for both halves of the split.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as boundary } from "../../../../tooling/src/verify/gates/session-channel-boundary.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/session-channel-boundary-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/session-channel-family";
const FAMILY: readonly GatePolicy[] = [boundary, health];
const ANCHOR = "packages/client/src/lib/index.ts";
const HOME = "packages/client/src/lib/session-channel.ts";
/** The legacy descriptor's own path — where its tripwire anchored, outside `@client`. */
const LEGACY_PATH = "tooling/src/verify/gates/session-channel-boundary.ts";
/** The commit the brief names as the legacy source; verified byte-identical to the pre-conversion module. */
const LEGACY_SHA = "774231540";
/** The occurrence position moved from the `new` keyword to the callee — `new ` is four columns. */
const CALLEE_OFFSET = 4;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: FAMILY,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("both session-channel policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY ─────────────────────────────────────────────────────────────────────────────
test("an ordinary waiver binds to the exact policy and the CALLEE position the occurrence report supplies", () => {
  const waived = passOf([boundary], {
    "packages/client/src/features/chat/lib/sync.ts":
      "// @orb-waive session-channel-boundary(BroadcastChannel): the proof's stand-in reason and its end condition.\n" +
      'export const rogue = new BroadcastChannel("chat:sync");\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a narrowed request defers the entire-population tripwire instead of declaring the home dead", () => {
  const files = {
    [ANCHOR]: "export const lib = {};\n",
    [HOME]: 'export const c = new BroadcastChannel("orb:session");\n',
  };
  const whole = passOf([health], files);
  expect(whole.toolErrors).toEqual([]);
  expect(whole.authority.effectiveFindings).toEqual([]);

  const narrowed = passOf([health], files, [ANCHOR]);
  expect(narrowed.toolErrors).toEqual([]);
  expect(narrowed.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  expect(narrowed.authority.effectiveFindings).toEqual([]);
});

// ─── §4.6 SPLIT-ARM DIFFERENTIAL ────────────────────────────────────────────────────────────────────────
function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_SHA}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Both named
  // modules are still on the tree and untouched by this conversion.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/client/src/x.ts"]: example.files } : example.files;
}

interface Verdict {
  /** One comparable line per finding: the ARM plus where and what it named. */
  readonly lines: readonly string[];
  /** Tool errors as `[phase]` — the final population REFUSES a fixture that admits nothing (difference 3). */
  readonly refusals: readonly string[];
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

function legacyVerdict(gateDescriptor: GateDescriptor, files: Readonly<Record<string, string>>): Verdict {
  const project = projectOf(files);
  const result = runPass([gateDescriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return {
    lines: sorted(
      (result.gates[0]?.findings ?? []).map((finding) =>
        finding.file === LEGACY_PATH
          ? `TRIPWIRE ${finding.file}:${finding.line}`
          : `OCCURRENCE ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`,
      ),
    ),
    refusals: result.toolErrors.map((error) => error.phase),
  };
}

/** The UNION of the two final policies — running one half alone would "prove" the missing arm away. */
function finalVerdict(files: Readonly<Record<string, string>>): Verdict {
  const result = passOf(FAMILY, files);
  return {
    lines: sorted(
      result.authority.effectiveFindings.map((finding) =>
        finding.policyId === health.id
          ? `TRIPWIRE ${finding.file}:${finding.line}`
          : `OCCURRENCE ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`,
      ),
    ),
    refusals: sorted(result.toolErrors.map((error) => `${error.policyId} ${error.phase}`)),
  };
}

/** The three CLASSIFIED differences applied to the legacy verdict, so the comparison is one `toEqual`. */
function expectedFinal(before: Verdict, files: Readonly<Record<string, string>>): Verdict {
  // DIFFERENCE 3: a fixture with NO client file admits nothing under `@client`, and the final population
  // resolver REFUSES an empty admission (a `[population]` tool error per policy) where the legacy
  // `scanRoot` simply visited nothing. Legacy's server-only declared-limit row is that fixture; the
  // converted module carries it with an added client file for exactly this reason.
  const admitsNothing = !Object.keys(files).some((path) => path.startsWith("packages/client/src/"));
  return {
    refusals: admitsNothing ? sorted(FAMILY.map((policy) => `${policy.id} population`)) : [],
    lines: before.lines.map((entry) => {
      if (entry.startsWith("TRIPWIRE ")) {
        // DIFFERENCE 1: the tripwire anchors on the real-tree anchor, not the gate module's own path.
        return `TRIPWIRE ${ANCHOR}:1`;
      }
      // DIFFERENCE 2: the occurrence position is the callee, four columns after `new`, and the token is
      // the callee text rather than `new BroadcastChannel`.
      const match = /^OCCURRENCE (?<file>[^:]+):(?<line>\d+):(?<column>\d+) new BroadcastChannel$/u.exec(entry);
      expect(match, entry).not.toBeNull();
      const groups = match?.groups ?? {};
      return `OCCURRENCE ${groups["file"]}:${groups["line"]}:${Number(groups["column"]) + CALLEE_OFFSET} BroadcastChannel`;
    }),
  };
}

test("the occurrence+health pair reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(5);
  const arms: string[] = [];
  for (const example of examples) {
    const files = legacyFiles(example);
    const before = legacyVerdict(legacy, files);
    expect(before.refusals, example.why).toEqual([]);
    arms.push(...before.lines.map((entry) => entry.split(" ")[0] ?? ""));
    expect(finalVerdict(files), example.why).toEqual(expectedFinal(before, files));
  }
  // The legacy corpus exercised BOTH arms, or this differential would be a vacuous replay.
  expect(arms.filter((arm) => arm === "OCCURRENCE")).toHaveLength(2);
  expect(arms.filter((arm) => arm === "TRIPWIRE")).toHaveLength(1);
});
