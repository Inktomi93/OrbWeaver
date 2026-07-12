// Self-test for the `no-off-token-radius-shadow` gate (scripts/check/gates/no-off-token-radius-shadow.ts,
// registered in report.ts's ALL_CHECKS) — design-enforcement.md §3, DC8 rollup-audit blind spot. Drives
// the Check directly over an in-memory ts-morph project (never the real tree), proving: a default-scale
// `rounded-*`/`shadow-*` utility fires, a variant modifier on one still fires, a THEMED radius/shadow name
// does NOT fire, `rounded-none`/`shadow-none` (deliberate opt-out) does NOT fire, `drop-shadow-*` (a
// different CSS property) does NOT fire, the preset lane is structurally excluded, and BOTH ratchet arms
// (ALLOWLIST suppression + stale-entry) hold — via a factory-injected registry (the
// createNoArbitraryTwValues precedent).
// FLAGS/PASSES use an EMPTY injected registry (not the live export). The live ALLOWLIST is now empty (the
// overlay-primitive family was retuned onto `shadow-overlay`), but the injected registry keeps this
// self-test independent of the live one either way; the live gate is proven against the real tree by
// pnpm check:structure's own run (the ALLOWLIST's `seenAllowlisted` bookkeeping).
import { createNoOffTokenRadiusShadow } from "../../scripts/check/gates/no-off-token-radius-shadow.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const CLIENT_FEAT = "packages/client/src/features/demo/components/thing.tsx";
const UI_FILE = "packages/ui/src/primitives/demo/demo.tsx";
const PRESET_FILE = "packages/client/src/features/preset/components/thing.tsx";
const INJECTED_ALLOWLISTED = "packages/client/src/features/demo/components/legacy-shadow.tsx";

/** A source file rendering the given className string as its sole export. */
function withClassName(className: string): string {
  return `export const G = <div className="${className}" />;\n`;
}

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live ALLOWLIST noise. */
const gate = createNoOffTokenRadiusShadow({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createNoOffTokenRadiusShadow({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a default-scale radius utility (rounded-lg)", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("rounded-lg") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(CLIENT_FEAT);
});

test("fires on a default-scale shadow utility (shadow-md)", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("shadow-md") }));
  expect(v).toHaveLength(1);
});

test("fires on bare shadow", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("shadow") }));
  expect(v).toHaveLength(1);
});

test("fires on a variant-prefixed off-token shadow (hover:shadow-lg)", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("hover:shadow-lg") }));
  expect(v).toHaveLength(1);
});

test("fires in packages/ui/src too", () => {
  const v = gate.run(ctxFor({ [UI_FILE]: withClassName("rounded-xl") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(UI_FILE);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on a themed radius name (rounded-card)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("rounded-card") }))).toEqual([]);
});

test("clean on a themed shadow name (shadow-overlay)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("shadow-overlay") }))).toEqual([]);
});

test("clean on rounded-none (deliberate opt-out, not a magic value)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("rounded-none") }))).toEqual([]);
});

test("clean on shadow-none (deliberate opt-out, not a magic value)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("shadow-none") }))).toEqual([]);
});

test("clean on drop-shadow-sm (a different CSS property/namespace)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("drop-shadow-sm") }))).toEqual([]);
});

test("clean in the preset lane (structurally excluded, mid-revamp)", () => {
  expect(gate.run(ctxFor({ [PRESET_FILE]: withClassName("rounded-lg shadow-md") }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses an off-token utility in an allowlisted file — known pre-existing debt", () => {
  expect(
    gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: withClassName("shadow-lg") })),
  ).toEqual([]);
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const v = gateWithAllowlist.run(
    ctxFor({ [INJECTED_ALLOWLISTED]: withClassName("shadow-overlay") }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const v = gateWithAllowlist.run(ctxFor({ [CLIENT_FEAT]: withClassName("shadow-overlay") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
