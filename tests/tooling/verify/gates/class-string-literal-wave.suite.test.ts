// Conformance entry for the two client class-STRING policies converted to the final `defineGate` contract
// (#1584, lane p-class-string-pair): `class-token-splice` and `scroll-container-positioned`. Each is a
// SINGLETON family under its own id — neither shares a `lib/` subject reader with a sibling, and each
// module's header carries the FAMILY decision with its reason. They sit in one file because they converted
// in one lane over one population (`@client` + `@ui`), not because they are one family.
//
// Both retired an exemption mechanism with NO ROWS TO PORT (`scroll-container-positioned`'s `ALLOWLIST` was
// `{}` from its own landing commit; `class-token-splice` never had one), and the MARKER CENSUS for both is
// ZERO — no `@orb-gate-ignore` for either id exists anywhere on the tree, so nothing was translated and
// nothing could be dropped.
//
// Proof ownership: docs/law/gate-runtime-standardization.md §6.2.
// WHAT THIS FILE ADDS OVER THE CONFORMANCE STAGE. `pnpm check:policy-conformance` already runs every
// declared row on the static tier, so the first test is the wave's bite receipt and nothing more. The
// §6.2 arms below exist because a `mustPass` row asserts neither `waivedFindings === 1` nor, separately,
// that the suppression came from THIS policy's own position: a row that stopped flagging for an unrelated
// reason would pass it. The triple — zero effective, exactly one waived, zero authority alarms — is the arm.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as classTokenSplice } from "../../../../tooling/src/verify/gates/class-token-splice.ts";
import { gate as scrollContainerPositioned } from "../../../../tooling/src/verify/gates/scroll-container-positioned.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FAMILY: readonly GatePolicy[] = [classTokenSplice, scrollContainerPositioned];

// This test concentrates both policies' whole proof sets into ONE test, so the per-test default walks into
// a timeout that reads exactly like an assertion failure as the sets grow. `scaledBudget` also grows with
// box load.
const CONFORMANCE_TIMEOUT_MS = scaledBudget(180_000);

const ROOT = "/class-string-literal-wave";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test(
  "the class-string wave keeps its founding, near-miss, declared-limit and fence fixtures",
  () => {
    expect(verifyPolicyProofs(FAMILY)).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

// ---------------------------------------------------------------------------------------------------
// §6.2 ORDINARY MARKER IDENTITY, one positive arm per policy. Both report a token the author can read off
// the source: `scroll-container-positioned` the whitespace-split CLASS TOKEN, `class-token-splice` the
// INTERPOLATED EXPRESSION at the offending junction. Neither position is guessable from the message,
// which is why each policy's `fix` spells it out.
// ---------------------------------------------------------------------------------------------------
test("an ordinary waiver at the scroll token this policy reports suppresses exactly one finding", () => {
  const waived = passOf(scrollContainerPositioned, {
    "packages/client/src/features/x/pane.tsx":
      "// @orb-waive scroll-container-positioned(overflow-y-auto): the proof's stand-in reason and its end condition.\n" +
      `export const G = <div className="min-h-0 flex-1 overflow-y-auto" />;\n`,
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("an ordinary waiver at the interpolated expression this policy reports suppresses exactly one finding", () => {
  const waived = passOf(classTokenSplice, {
    "packages/ui/src/probe.tsx":
      'const side = "end";\n' +
      "// @orb-waive class-token-splice(side): the proof's stand-in reason and its end condition.\n" +
      "const x = <div className={`inset-${side}-0 p-2`} />;\n",
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE ANCHOR the two arms above rest on. `class-token-splice` is the only one of the pair whose reported
// position MOVED in conversion (legacy passed no token, so the runtime derived one), and the position it
// now supplies is a DERIVED fallback whenever the anchor's own text carries a paren or a newline — which a
// call always does, and which the marker grammar's `[^()\r\n]+` position group cannot hold. Pinned here
// rather than only in a proof row because the fallback is what makes the call arm waivable at all.
// ---------------------------------------------------------------------------------------------------
test("a splice on a CALL is reported at the derived paren-free token, not at the call text", () => {
  const flagged = passOf(classTokenSplice, {
    "packages/client/src/probe.ts": "const x = cn(`text-${someRuntimeThing()}`);\n",
  });

  expect(flagged.authority.effectiveFindings).toMatchObject([{ policyId: "class-token-splice", token: "someRuntimeThing" }]);
  expect(flagged.authority.authorityAlarms).toEqual([]);
});
