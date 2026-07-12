// Self-test for the `empty-state-has-action` gate (scripts/check/gates/empty-state-has-action.ts,
// registered in report.ts's ALL_CHECKS) — design-enforcement.md §3.2, D62 (rule-1 "no dead ends"
// mechanical half). Drives the Check directly over an in-memory ts-morph project (never the real tree),
// proving: a dead-end `<EmptyState>` fires, `action=` and a spread attribute both satisfy it, and BOTH
// ratchet arms (ALLOWLIST suppression + stale-entry) hold — via a factory-injected registry (the
// createNoInteractiveRoleInFeatures precedent). FLAGS/PASSES use an EMPTY injected registry (not the live
// export) — the live ALLOWLIST is non-empty (7 real dead-end files awaiting a CTA design call), so testing
// against a synthetic tree through the live export would spuriously fire the stale-entry arm on every
// case; the live gate itself is proven against the real tree by tests/tooling/check-gates.int.test.ts's
// fixture.
import { createEmptyStateHasAction } from "../../scripts/check/gates/empty-state-has-action.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const FEAT = "packages/client/src/features/demo/surfaces/thing-surface.tsx";
const INJECTED_ALLOWLISTED = "packages/client/src/features/demo/surfaces/legacy-empty.tsx";

/** A source file rendering the given self-closing `<EmptyState .../>` attrs as its sole export. */
function emptyState(attrs: string): string {
  return `export const G = <EmptyState ${attrs} />;\n`;
}

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live ALLOWLIST noise. */
const gate = createEmptyStateHasAction({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createEmptyStateHasAction({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on an EmptyState with no action prop", () => {
  const v = gate.run(ctxFor({ [FEAT]: emptyState('title="Nothing here"') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(FEAT);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean when action= is present", () => {
  expect(
    gate.run(ctxFor({ [FEAT]: emptyState('title="Nothing here" action={<Button>Go</Button>}') })),
  ).toEqual([]);
});

test("clean when a spread attribute might carry action (conditional CTA)", () => {
  expect(
    gate.run(
      ctxFor({ [FEAT]: emptyState('title="Nothing here" {...(cond ? { action: 1 } : {})}') }),
    ),
  ).toEqual([]);
});

test("ignores an EmptyState outside features/**", () => {
  const uiFile = "packages/ui/src/primitives/empty-state/demo.tsx";
  expect(gate.run(ctxFor({ [uiFile]: emptyState('title="x"') }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a dead-end render in an allowlisted file — known debt", () => {
  expect(
    gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: emptyState('title="Nothing here"') })),
  ).toEqual([]);
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const v = gateWithAllowlist.run(
    ctxFor({
      [INJECTED_ALLOWLISTED]: emptyState('title="x" action={<Button>Go</Button>}'),
    }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const v = gateWithAllowlist.run(
    ctxFor({ [FEAT]: emptyState('title="x" action={<Button>Go</Button>}') }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
