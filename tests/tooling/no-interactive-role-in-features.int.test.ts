// Self-test for the LIVE `no-interactive-role-in-features` gate (scripts/check/gates/
// no-interactive-role-in-features.ts, registered in report.ts's ALL_CHECKS) — closes the layout-kit
// interactive-role escape hatch (a role-carrying `<Row>` forges a widget that dodges the compose-only +
// raw-intrinsic belts, UI-Gates-and-Lessons.md §8). Drives the Check directly over an in-memory ts-morph
// project (never the real tree), proving: every WIDGET role shape fires (static string, braced literal,
// conditional literal), structural/live-region roles + `data-role` + non-feature (seal) files stay clean,
// and BOTH ratchet arms hold. The live BURN_DOWN went EMPTY 2026-07-09 (the founding persona-panel-row
// entry burned down same-day), so the ratchet arms are driven through the factory with an INJECTED
// registry (the createEnforcementRegistryParity precedent) — they stay covered regardless of live state.
import {
  createNoInteractiveRoleInFeatures,
  noInteractiveRoleInFeatures,
} from "../../scripts/check/gates/no-interactive-role-in-features.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const FEAT = "packages/client/src/features/demo/components/thing.tsx";
const INJECTED_ALLOWLISTED = "packages/client/src/features/demo/components/legacy-row.tsx";

/** A `<Row>` (a declared local stand-in for the layout kit) carrying the given `role=` attribute text. */
function row(roleAttr: string): string {
  return `declare function Row(props: { role?: string; tabIndex?: number; children?: unknown }): unknown;\nexport const G = <Row ${roleAttr}>hi</Row>;\n`;
}

/** The gate with ONE injected burn-down entry — the ratchet arms' test double. */
const gateWithAllowlist = createNoInteractiveRoleInFeatures({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a static widget-role string", () => {
  const v = noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: row('role="button"') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(FEAT);
});

test("fires on a braced string-literal widget role", () => {
  // biome-ignore lint/security/noSecrets: a JSX role attribute (gate INPUT), not a secret.
  const input = row('role={"checkbox"}');
  const v = noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: input }));
  expect(v).toHaveLength(1);
});

test("fires on a conditional expression carrying a banned literal", () => {
  const v = noInteractiveRoleInFeatures.run(
    // `cond` is an undeclared identifier — the fixture is PARSED (never executed/typechecked), so this
    // is a valid conditional carrying the banned literal without any ambient nondeterminism.
    ctxFor({ [FEAT]: row('role={cond ? "button" : undefined}') }),
  );
  expect(v).toHaveLength(1);
});

test("fires on each of a spread of widget roles", () => {
  const files: Record<string, string> = {};
  for (const r of ["menuitem", "tab", "slider", "treeitem", "gridcell"]) {
    files[`packages/client/src/features/demo/components/${r}.tsx`] = row(`role="${r}"`);
  }
  expect(noInteractiveRoleInFeatures.run(ctxFor(files))).toHaveLength(5);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on a structural/live-region role (not a widget)", () => {
  expect(noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: row('role="list"') }))).toEqual([]);
});

test("clean on the img presentation role", () => {
  expect(noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: row('role="img"') }))).toEqual([]);
});

test("ignores data-role — the attribute name must be exactly `role`", () => {
  expect(noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: row('data-role="button"') }))).toEqual(
    [],
  );
});

test("ignores a seal file outside features (the @orb/ui list-row/card legally use the widget role)", () => {
  const seal = "packages/ui/src/primitives/list-row/list-row.tsx";
  expect(noInteractiveRoleInFeatures.run(ctxFor({ [seal]: row('role="button"') }))).toEqual([]);
});

test("live registry is EMPTY: a clean tree yields zero violations (no phantom stale entries)", () => {
  expect(noInteractiveRoleInFeatures.run(ctxFor({ [FEAT]: row('role="list"') }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a hand-roll in an allowlisted (burn-down) file — known debt", () => {
  expect(gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: row('role="button"') }))).toEqual(
    [],
  );
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const v = gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: row('role="list"') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const v = gateWithAllowlist.run(ctxFor({ [FEAT]: row('role="list"') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
