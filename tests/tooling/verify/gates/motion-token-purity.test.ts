// The `motion-token-purity` FAMILY (a declared singleton — its true sibling `no-raw-color-in-css` cannot be
// re-declared from this lane, so both stay under their own ids).
//
// What lives here is what a proof row structurally cannot express:
//
//   §4.2 the POSITIVE IDENTITY ARM — all THREE assertions (`effectiveFindings []`, `waivedFindings 1`,
//        `authorityAlarms []`), because an over-broad or duplicate marker alarms WITHOUT changing the
//        finding count — plus its discrimination control. These two also stand in for the retired
//        file-level `ALLOWLIST` and its hand-rolled STALE_ENTRY arm: the exemption is now per-site and its
//        staleness is the central engine's dead-position alarm.
//   §6.3 the REFUSAL for `authored-css`. The family drive pins no effective findings, the named
//        population-phase tool error, an incomplete owner, and this policy withheld; those runtime-state
//        assertions are stronger than refusal-text matching alone.
//   the TWO-GRAMMAR COLLISION, measured. `@orb-waive` and `biome-ignore` both bind ONLY to the comment
//        immediately above their subject, so a subject line that already spends that slot on a required
//        suppression cannot also carry a waiver. That is why the reduced-motion floor is a POPULATION
//        CARVE-OUT here rather than a waived site, and the pin below is what stops a future reader
//        "simplifying" the carve-out into a marker that cannot bind.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as motionTokenPurity } from "../../../../tooling/src/verify/gates/motion-token-purity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const KEEP = { "packages/ui/src/styles/keep.css": ".keep {\n  transition: opacity var(--motion-base) var(--ease-out-expo);\n}\n" } as const;
const LOOP = ".orb-weave-shimmer {\n  animation: orb-weave-shimmer var(--motion-breathe) ease-in-out infinite;\n}\n";

function pass(scratch: string, files: Readonly<Record<string, string>>): PolicyPassResult {
  for (const [rel, text] of Object.entries(files)) {
    const absolute = join(scratch, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return runPolicyPass({
    knownPolicies: [motionTokenPurity],
    policies: [motionTokenPurity],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay: files },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("motion-token-purity keeps its declared proofs", () => {
  expect(verifyPolicyProofs([motionTokenPurity])).toEqual([]);
});

test("§4.2 — the exact waiver at the reported literal suppresses, waives one, and alarms not at all", ({ scratch }) => {
  const result = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/globals.css": `.a {\n  /* @orb-waive motion-token-purity(ease-in-out): a continuous decorative loop; nothing coordinates with it. */\n${LOOP.split("\n")[1] ?? ""}\n}\n`,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("§4.2 control — a marker naming a literal that is not on that line ALARMS as a dead position", ({ scratch }) => {
  const result = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/globals.css": `.a {\n  /* @orb-waive motion-token-purity(ease-out): a continuous decorative loop; nothing coordinates with it. */\n${LOOP.split("\n")[1] ?? ""}\n}\n`,
  });

  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["ordinary-waiver"]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
});

test("§4.5 — an empty CSS corpus REFUSES at the population phase rather than reporting a clean tree", ({ scratch }) => {
  const result = pass(scratch, { "packages/ui/src/keep.ts": "export const keep = 1;\n" });

  expect({
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  }).toEqual({
    findings: [],
    toolErrors: [{ policyId: "motion-token-purity", phase: "population", message: expect.stringContaining("resource declaration authored-css") }],
    owners: [["motion-token-purity", "incomplete"]],
    withheld: ["motion-token-purity"],
  });
});

test("THE COLLISION — a waiver separated from its subject by another comment cannot bind, which is why the reduced-motion floor is a carve-out", ({
  scratch,
}) => {
  // Measured 2026-09-11 and pinned here because it decided a PREDICATE: the two live reduced-motion kill
  // durations already spend the adjacent-comment slot on a required `biome-ignore lint/complexity/
  // noImportantStyles`, so they are structurally unwaivable. A future reader who "simplifies" the carve-out
  // into a marker gets THIS, not a green.
  const stacked = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/x.css":
      ".a {\n  /* @orb-waive motion-token-purity(ease-in-out): the loop. */\n  /* biome-ignore lint/complexity/noImportantStyles: the a11y floor. */\n  animation: orb-x var(--motion-breathe) ease-in-out infinite;\n}\n",
  });

  expect(stacked.authority.authorityAlarms.map(({ message }) => message)).toEqual([expect.stringContaining("cannot bind through comment trivia")]);
});

test("THE CARVE-OUT is DURATION-only: the reduced-motion kill value is silent and a raw easing beside it is not", ({ scratch }) => {
  // A separate scratch root on purpose — `pass` materializes into the root and the resource reader then
  // sees EVERY file under it, so two fixtures in one test would bleed one arm's findings into the other's.
  const floor = pass(scratch, {
    ...KEEP,
    "packages/client/src/styles/y.css":
      "@media (prefers-reduced-motion: reduce) {\n  * {\n    animation-duration: 0.01ms !important;\n    transition-timing-function: ease-out !important;\n  }\n}\n",
  });

  expect(floor.authority.effectiveFindings.map(({ line, token }) => [line, token])).toEqual([[4, "ease-out"]]);
});
