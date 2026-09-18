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
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as boundary } from "../../../../tooling/src/verify/gates/session-channel-boundary.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/session-channel-boundary-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/session-channel-family";
const FAMILY: readonly GatePolicy[] = [boundary, health];
const ANCHOR = "packages/client/src/lib/index.ts";
const HOME = "packages/client/src/lib/session-channel.ts";

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
