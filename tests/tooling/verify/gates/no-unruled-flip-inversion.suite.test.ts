// The family floor for `no-unruled-flip-inversion` (#1089) — a SINGLETON reviewed-grant policy, so this
// file is its whole family and carries every obligation a declared proof row structurally cannot express:
//
//   §6.2 — the CENTRAL grant table, which the declared `grant:` witness does not reach. Conformance builds a
//          SYNTHETIC grant from authored strings; that proves the emitted `(subject, operation)` is bindable
//          and says nothing about `lib/reviewed-grants.ts` actually carrying the row for the ruled site.
//          Both directions live here: the committed row licenses the real `tabs.tsx` path exactly once, and
//          the SAME SHAPE at another path is NOT licensed (the ruling is per-site, not a blanket pass).
//   §6.3 — REAL-CORPUS LIVENESS is DATA in `_liveness/client.ts` (a third FLIP site overlaid on the real
//          `@client` tree), run by the one liveness runner over the structure run's own corpus.
//
// THE RULING THIS POLICY ENFORCES IS PROSE: `motion-and-animation-guide.md` §1.5 admits two sites as the
// whole exception class. Only one of them writes a transform (the shell's push is CSS-owned), so the grant
// table carries exactly one row — asserted below against the policy id rather than a literal count, so
// amending §1.5 moves one place and reds here if the halves drift apart.
import { Project } from "ts-morph";
import { gate as flip } from "../../../../tooling/src/verify/gates/no-unruled-flip-inversion.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/no-unruled-flip-inversion";
const RULED_SITE = "packages/ui/src/primitives/tabs/tabs.tsx";
const FLIP_GRANTS = REVIEWED_GRANTS.filter((grant) => grant.policyId === flip.id);

/** The ruled site's own shape, reduced to the three lines that make it a FLIP: write, flush, clear. */
const GLIDE_SOURCE =
  "export function glide(node: HTMLElement, dx: number): void {\n" +
  "  node.style.transform = `translateX(${String(dx)}px)`;\n" +
  "  node.getBoundingClientRect();\n" +
  '  node.style.transform = "";\n' +
  "}\n";

function passOf(files: Readonly<Record<string, string>>, reviewedGrants: typeof FLIP_GRANTS): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [flip], policies: [flip], root: ROOT, project, reviewedGrants, failOnWarnings: false });
}

test("the DECLARED proofs hold, including the reviewed-grant identity witness", () => {
  expect(verifyPolicyProofs([flip])).toEqual([]);
});

test("§1.5's exception list and the grant table are ONE ruling: exactly the transform-writing member is ruled", () => {
  // Asserted against the policy id, never a literal count: amending §1.5 is one edit here and this row
  // moves with it. The shell's `use-list-track-flip.ts` member is deliberately ABSENT — it writes no
  // transform, so granting it would license a site the policy never judges (a stale row on arrival).
  expect(FLIP_GRANTS.map(({ subject }) => subject)).toEqual([RULED_SITE]);
  expect(FLIP_GRANTS.map(({ operation }) => operation)).toEqual(["flip-inversion"]);
  for (const grant of FLIP_GRANTS) {
    expect(grant.why, `${grant.id} — a ruling with no reason is an allowlist row`).not.toBe("");
    expect(grant.endsWhen, `${grant.id} — the end condition is the tripwire the prose list could not give`).toContain("stale");
  }
});

test("§6.2 the COMMITTED grant licenses the ruled site exactly once", () => {
  const { authority } = passOf({ [RULED_SITE]: GLIDE_SOURCE }, FLIP_GRANTS);

  expect(authority.effectiveFindings).toEqual([]);
  expect(authority.grantedFindings.map((granted) => granted.grantId)).toEqual(["no-unruled-flip-inversion:tabs-glide-indicator"]);
  // EXACTLY ONE. Two candidates under one grant license NEITHER and alarm over-broad, which is why the
  // policy's ORDER clause matters: the fixture writes `transform` twice and only the flushed write reports.
  expect(authority.reviewedGrantConsumption.map((row) => row.count)).toEqual([1]);
});

test("§6.2 the SAME SHAPE at another path is NOT licensed — the ruling is per-site", () => {
  // The acquittal's falsifier. Without it the arm above passes just as well against a grant that licenses
  // the whole policy, and "two sites are the whole exception class" would quietly become "any site".
  const thirdMember = "packages/client/src/features/gallery/components/third-member.tsx";
  const { authority } = passOf({ [thirdMember]: GLIDE_SOURCE }, FLIP_GRANTS);

  expect(authority.effectiveFindings.map((finding) => finding.subject)).toEqual([thirdMember]);
  expect(authority.grantedFindings).toEqual([]);
  expect(authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant"]);
});
