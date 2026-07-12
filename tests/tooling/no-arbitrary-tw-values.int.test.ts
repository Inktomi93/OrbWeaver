// Self-test for the `no-arbitrary-tw-values` gate (scripts/check/gates/no-arbitrary-tw-values.ts,
// registered in report.ts's ALL_CHECKS) — design-enforcement.md §3, the last PLANNED gate in the doc.
// Drives the Check directly over an in-memory ts-morph project (never the real tree), proving: a
// scoped-utility value arbitrary fires, a variant modifier on a value arbitrary still fires, a
// variant-SELECTOR bracket (data-[...]:, has-[...]:, etc.) does NOT fire, a token-driven body (--, var(,
// calc() does NOT fire, content-['...'] is out of scope, and BOTH ratchet arms (ALLOWLIST suppression +
// stale-entry) hold — via a factory-injected registry (the createNoInteractiveRoleInFeatures precedent).
// FLAGS/PASSES use an EMPTY injected registry (not the live export) — the live ALLOWLIST is non-empty (2
// real token-less arbitraries), so testing against a synthetic tree through the live export would
// spuriously fire the stale-entry arm on every case; the live gate itself is proven against the real tree
// by tests/tooling/check-gates.int.test.ts's fixture.
import { createNoArbitraryTwValues } from "../../scripts/check/gates/no-arbitrary-tw-values.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const CLIENT_FEAT = "packages/client/src/features/demo/components/thing.tsx";
const UI_FILE = "packages/ui/src/primitives/demo/demo.tsx";
const INJECTED_ALLOWLISTED = "packages/client/src/features/demo/components/legacy-arbitrary.tsx";

/** A source file rendering the given className string as its sole export. */
function withClassName(className: string): string {
  return `export const G = <div className="${className}" />;\n`;
}

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live ALLOWLIST noise. */
const gate = createNoArbitraryTwValues({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createNoArbitraryTwValues({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a scoped-utility value arbitrary", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("w-[137px]") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(CLIENT_FEAT);
});

test("fires on a variant-prefixed value arbitrary (hover:w-[...])", () => {
  const v = gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("hover:w-[137px]") }));
  expect(v).toHaveLength(1);
});

test("fires in packages/ui/src too", () => {
  const v = gate.run(ctxFor({ [UI_FILE]: withClassName("text-[13px]") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(UI_FILE);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean when the bracket body is a CSS var reference", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("w-[var(--sidebar-width)]") }))).toEqual(
    [],
  );
});

test("clean when the bracket body is calc(...)", () => {
  expect(
    gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("translate-x-[calc(var(--a)-var(--b))]") })),
  ).toEqual([]);
});

test("clean on a variant-SELECTOR bracket (not a terminal value bracket)", () => {
  expect(
    gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("data-[state=open]:opacity-100") })),
  ).toEqual([]);
});

test("clean on has-[...]: selector bracket", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("has-[:focus-visible]:ring-2") }))).toEqual(
    [],
  );
});

test("clean on content-['...'] (out of scope utility)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("before:content-['']") }))).toEqual([]);
});

test("clean on an unscoped utility carrying a bracket (out of scope)", () => {
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: withClassName("fill-[#fff]") }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a value arbitrary in an allowlisted file — known token-less debt", () => {
  expect(
    gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: withClassName("w-[137px]") })),
  ).toEqual([]);
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const v = gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: withClassName("w-full") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const v = gateWithAllowlist.run(ctxFor({ [CLIENT_FEAT]: withClassName("w-full") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
