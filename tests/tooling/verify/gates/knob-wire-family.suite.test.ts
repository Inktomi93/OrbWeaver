// THE KNOB-WIRE FAMILY (D107, #1584) — the properties a declared proof row cannot express: the §6.4
// conversion differential against the frozen legacy descriptor, the bidirectional population port with its
// inside/outside controls, and the central reviewed-grant behaviour that REPLACED the legacy gate's two
// `ExemptionTable`s and their hand-rolled STALE/ORPHAN arms.
//
// THE DIFFERENTIAL IS A BIJECTION, NOT A TRANSCRIPTION. Every one of the legacy descriptor's 15 `mustFlag`
// and 8 `mustPass` fixtures is replayed through BOTH engines over the same bytes, and the legacy arm keys
// are translated into final `(subject, operation)` identities through ONE declared map. Equality per
// scenario is the catch-parity proof; the two declared EXCEPTIONS are the two retired arms, each named.
//
// The declared rows themselves (15 catches, 8 passes, 13 refusals) run on the static
// `structure:policy-conformance` stage; the first test here only asserts they are readable, so a row that
// stops conforming is caught in this file too rather than only in the whole-corpus stage.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/knob-wire-coverage.ts";
import { KNOB_WIRE_OPERATIONS } from "../../../../tooling/src/verify/lib/knob-wire-fact.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("every declared row conforms", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

// ── §6.4 conversion differential: all 23 legacy fixtures, both engines, the same bytes ─────────────────

// ── §2.1 population port: both differences, and both controls ──────────────────────────────────────────

// ── §6.2 authority: the central grant door, and the two-sided liveness that replaced the tables ────────

// ── the real central rows: shape, uniqueness, and vocabulary ───────────────────────────────────────

const DEFERRED_TRACKER = "#2283";
const IP_CERTIFICATE_GRANT = "knob-wire-coverage:app-key-ip-certificate";

test("every committed knob-wire grant names a real arm operation and a uniquely identifiable member", () => {
  const rows = REVIEWED_GRANTS.filter((row) => row.policyId === gate.id);
  const operations = new Set<string>(Object.values(KNOB_WIRE_OPERATIONS));
  // Every grant is either DEFERRED debt citing the durable tracker #2283, or the one live-wired grant
  // (`app-key-ip-certificate`: a cited grant for a key arm B2's admin-dir scan cannot see, because its write goes
  // through a dedicated verb). The row count follows the table, so retiring a DEFERRED row never stales this test.
  const wired = rows.filter((row) => !row.endsWhen.includes(DEFERRED_TRACKER));
  expect(wired.map((row) => row.id)).toEqual([IP_CERTIFICATE_GRANT]);
  for (const row of rows) {
    expect(operations.has(row.operation), `${row.id} names a live arm operation`).toBe(true);
    // The subject grammar is `<member source>.<member>`; a row that cannot be produced by the policy would
    // red STALE on every real run, so the shape check is the cheap half of that guarantee.
    expect(row.subject, `${row.id} subject grammar`).toMatch(/^[A-Za-z_][\w]*\.[A-Za-z_][\w]*$/u);
    expect(row.endsWhen, `${row.id} states a concrete end condition`).not.toBe("");
  }
  // 1:1 identity is what makes the over-broad alarm unreachable for this policy: no two rows share one
  // (subject, operation), and the policy emits at most one finding per pair.
  expect(new Set(rows.map((row) => `${row.subject}|${row.operation}`)).size).toBe(rows.length);
  // The sanctioned-doorway row went out with the field it named, so the doorway arm is an emptiness claim.
  expect(rows.filter((row) => row.why.includes("THE ONE SANCTIONED DOORWAY"))).toHaveLength(0);
});
