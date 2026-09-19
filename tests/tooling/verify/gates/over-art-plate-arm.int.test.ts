// The `over-art-plate-arm` FAMILY (a declared singleton: `lib/over-art-plate.ts#judgeStylesheets` has one
// policy consumer, because the plate ALGEBRA is this gate's own).
//
// What lives here is what a proof row structurally cannot express:
//
//   §4.2 the POSITIVE IDENTITY ARM — all THREE assertions (`effectiveFindings []`, `waivedFindings 1`,
//        `authorityAlarms []`), because an over-broad or duplicate marker alarms WITHOUT changing the
//        finding count — plus its discrimination control, which flips the marker's position and expects the
//        ALARM. This arm is also the SUCCESSOR PROOF for the retired private `@over-art-plate-ok`
//        vocabulary: its HONOURED half is now the central engine's, and its three refusal halves
//        (MALFORMED · STALE · OVER-EXEMPTING) are the central engine's too, proven once in
//        `tests/tooling/verify/lib/ordinary-waiver.test.ts` rather than re-proven per gate.
//   §6.3 the REFUSAL for `authored-css`. The family drive pins no effective findings, the named
//        population-phase tool error, an incomplete owner, and this policy withheld; its healthy twin also
//        pins the resource receipt with `unresolved: 0`.
//   ARM D on a REAL-TREE-ANCHORED corpus: a whole-tree claim guarded on the anchor stylesheet, so no
//        conformance fixture reaches it and cutting it comes back clean for that reason alone.
//   THE WARNING-DEBT SHAPE. `gate:contract` refuses a gate-owned `*.baseline.json` outright, so the four
//        surfaces alive at mint are `severity: "warning"` + a declared `workItem` owner rather than a
//        ratchet. That is a DOWNGRADE of an enforcement bar, so it is pinned rather than left to a reader's
//        inference: the live findings must still be REPORTED (debt is never silence) and must carry the
//        warning severity. The OWNER'S NUMBER is deliberately NOT pinned — see that test's comment.
//   §4.6 the CONVERSION DIFFERENTIAL, both sides nonzero: the legacy descriptor's live set over the REAL
//        tree, replayed through the converted reader.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as overArtPlateArm } from "../../../../tooling/src/verify/gates/over-art-plate-arm.ts";
import { judgeStylesheets } from "../../../../tooling/src/verify/lib/over-art-plate.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { loadAuthoredCss } from "../../../../tooling/src/verify/ops/resource-tree.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ANCHOR = "packages/client/src/styles/globals.css";
const KEEP = { "packages/ui/src/styles/keep.css": ".keep {\n  color: var(--color-foreground);\n}\n" } as const;
const COMPOSER_RULE = 'html[data-blur-composer] [data-slot="composer"] {\n  background-color: color-mix(in oklab, var(--color-sidebar) 70%, transparent);\n}\n';

function pass(scratch: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  for (const [rel, text] of Object.entries(files)) {
    const absolute = join(scratch, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return runPolicyPass({
    knownPolicies: [overArtPlateArm],
    policies: [overArtPlateArm],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId: "over-art-plate-arm", phase: "population", message: expect.stringContaining(fragment) }],
    owners: [["over-art-plate-arm", "incomplete"]],
    withheld: ["over-art-plate-arm"],
  };
}

test("over-art-plate-arm keeps its declared proofs", () => {
  expect(verifyPolicyProofs([overArtPlateArm])).toEqual([]);
});

test("§4.2 — the exact waiver at the SELECTOR SUBJECT suppresses, waives one, and alarms not at all", ({ scratch }) => {
  const result = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/g.css": `/* @orb-waive over-art-plate-arm([data-slot="composer"]): a probe surface that can never sit over the wallpaper. */\n${COMPOSER_RULE}`,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("§4.2 control — a marker naming a subject that is not here ALARMS as a dead position", ({ scratch }) => {
  // This is the successor to the legacy STALE arm, which the reader used to hand-roll: the position is
  // well-formed and names nothing, and the underlying violation still REDs.
  const result = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/g.css": `/* @orb-waive over-art-plate-arm([data-slot="no-such-thing"]): a position that is not here. */\n${COMPOSER_RULE}`,
  });

  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["ordinary-waiver"]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
});

test("§4.5 — an empty CSS corpus REFUSES at the population phase rather than reporting a clean tree", ({ scratch }) => {
  const result = pass(scratch, { "packages/ui/src/keep.ts": "export const keep = 1;\n" });

  expect(refusalShape(result)).toEqual(populationRefusal("resource declaration authored-css"));
});

test("a complete run files one resource receipt per declaration with nothing unresolved", ({ scratch }) => {
  const result = pass(scratch, { ...KEEP, "packages/client/src/styles/g.css": ".plain {\n  color: var(--color-foreground);\n}\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts.map(({ kind, source, unresolved }) => ({ kind, source, unresolved })))).toEqual([
    [{ kind: "resource", source: "authored-css", unresolved: 0 }],
  ]);
});

test("ARM D — a real-tree corpus with ZERO recognised glass rules is BLIND, not clean", ({ scratch }) => {
  // No conformance fixture can carry the anchor without also carrying glass rules, which is why this pin is
  // here: the §4.1 cut of the tripwire comes back clean purely because the guard suppressed it everywhere.
  const result = pass(scratch, {
    ...KEEP,
    [ANCHOR]: ".plain {\n  color: var(--color-foreground);\n}\n",
  });

  expect(result.authority.effectiveFindings.map(({ file, message }) => [file, message ?? ""])).toEqual([
    [ANCHOR, expect.stringContaining("BLINDNESS TRIPWIRE")],
  ]);
});

test("THE BAR IS BACK — a new unpaired glass surface REDS at error, never warning, never silence", ({ scratch }) => {
  // The debt this policy carried as `severity: "warning"` + a live `workItem` (#2326) burned to zero at #2389
  // (all four subjects took their `--color-reading-plate` light arm), and the header's own flip condition was
  // taken on 2026-09-19: `severity: "error"`, no `workItem`; authority stays `ordinary` because #1171's NO-FILL
  // exemption and the §4.2 identity rows ARE an exact waiver at the selector subject (see the gate header).
  // `ErrorGatePolicy` FORBIDS a `workItem`, so the posture is compile-time; what only a RUN proves is that a
  // planted glass surface is stamped `error` (not warning, not silence).
  const result = pass(scratch, { ...KEEP, [ANCHOR]: COMPOSER_RULE });

  expect(overArtPlateArm.severity).toBe("error");
  expect(overArtPlateArm.authority).toBe("ordinary");
  expect(result.authority.effectiveFindings.map(({ token, severity }) => [token, severity])).toEqual([['[data-slot="composer"]', "error"]]);
});

test("§4.6 differential — the four legacy keys are BURNED DOWN on the real tree, and the zero is measured", ({ repoRoot }) => {
  // READ THE LEGACY SIDE FIRST (guide §6.4). The legacy descriptor's live set is what its committed ledger
  // budgeted — that ledger WAS the legacy side's recorded output, and it was NOT zero (four rows, quoted
  // below from `over-art-plate-arm.baseline.json` at `6977b977b` before this conversion deleted it). This
  // test is still the only place those four keys are recorded, which is why they stay spelled out:
  //
  //   packages/client/src/styles/globals.css::[data-slot="composer"]::--color-sidebar
  //   packages/client/src/styles/globals.css::[data-slot="message-bubble"]::--color-ai-bubble
  //   packages/client/src/styles/globals.css::[data-slot="message-bubble"]::--color-system-bubble
  //   packages/client/src/styles/globals.css::[data-slot="message-bubble"]::--color-user-bubble
  //
  // RE-DERIVED AGAINST THE TREE 2026-09-19 (#2469): a replay now produces NONE of them, and they are gone
  // because the PRODUCT was repaired — `d4e226a2e` ("over-art plate arms for composer+bubbles", #2389) gave
  // every one of those four subjects its `--color-reading-plate` light arm. The differential therefore
  // asserts the burn-down rather than the historical set; pinning the old four would assert that the debt
  // is still owed.
  //
  // THE ZERO OWES A POSITIVE CONTROL, and `glassRules` is it: a reader that stopped recognising translucent
  // rules at all would report an empty live set too. This asserts that the same pass still recognises glass
  // on the same corpus, so the empty set is "every recognised surface pairs a plate arm", never "I could
  // not look". (The scratch-corpus arm above plants a plateless composer rule and still catches it.)
  const corpus = loadAuthoredCss(createResourceReader({ root: repoRoot }));
  expect(corpus.status).toBe("ready");
  // The not-ready arm feeds an EMPTY corpus rather than short-circuiting: `glassRules` then reads 0 and the
  // control below fails loudly, where an optional chain would have let a refused read pass as a burn-down.
  const judged = judgeStylesheets(corpus.status === "ready" ? corpus.value : []);

  expect([...judged.live.keys()].toSorted((a, b) => a.localeCompare(b))).toEqual([]);
  expect(judged.glassRules).toBeGreaterThan(0);
});
