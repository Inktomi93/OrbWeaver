// Self-test for the `no-off-token-inline-style` gate (scripts/check/gates/no-off-token-inline-style.ts,
// registered in report.ts's ALL_CHECKS) — design-enforcement.md §3, the inline/imperative token-enforcement
// arm the className + CSS gates can't see. Drives the Check directly over an in-memory ts-morph project
// (never the real tree), proving: a raw-literal JSX inline `style={{…}}` fires, an imperative `.style.x =
// "raw"` fires, a `.style.setProperty("prop","raw")` fires, a `var(--…)` inline value (JSX + imperative)
// does NOT fire, a bare `0` no-op does NOT fire, a DYNAMIC value does NOT fire, a non-token property does
// NOT fire, an allowlisted sink is suppressed, and BOTH ratchet arms hold — via a factory-injected registry
// (the createNoOffTokenRadiusShadow / createMotionTokenPurity precedent).
// FLAGS/PASSES use an EMPTY injected registry (not the live export). The injected registry keeps this
// self-test independent of the live ALLOWLIST; the live gate is proven against the real tree by pnpm
// check:structure's own run (the ALLOWLIST's `seenAllowlisted` bookkeeping).
import { createNoOffTokenInlineStyle } from "../../scripts/check/gates/no-off-token-inline-style.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const CLIENT_FEAT = "packages/client/src/features/demo/components/thing.tsx";
const UI_FILE = "packages/ui/src/primitives/demo/demo.ts";
const INJECTED_ALLOWLISTED = "packages/ui/src/charts/demo/legacy-canvas.ts";

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live ALLOWLIST noise. */
const gate = createNoOffTokenInlineStyle({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createNoOffTokenInlineStyle({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a raw-literal JSX inline style (borderRadius: '8px')", () => {
  const v = gate.run(
    ctxFor({ [CLIENT_FEAT]: 'export const G = <div style={{ borderRadius: "8px" }} />;\n' }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(CLIENT_FEAT);
});

test("fires on a raw hex color in a JSX inline style", () => {
  const v = gate.run(
    ctxFor({ [CLIENT_FEAT]: 'export const G = <div style={{ color: "#fff" }} />;\n' }),
  );
  expect(v).toHaveLength(1);
});

test("fires on an imperative `.style.x = 'raw'` assignment", () => {
  const src = 'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "8px";\n}\n';
  expect(gate.run(ctxFor({ [UI_FILE]: src }))).toHaveLength(1);
});

test("fires on an imperative `.style.setProperty('gap', 'raw')`", () => {
  const src =
    'export function f(el: HTMLElement): void {\n  el.style.setProperty("gap", "12px");\n}\n';
  expect(gate.run(ctxFor({ [UI_FILE]: src }))).toHaveLength(1);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on a var(--…) JSX inline style (on-token, just inline)", () => {
  const src = 'export const G = <div style={{ borderRadius: "var(--radius-card)" }} />;\n';
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: src }))).toEqual([]);
});

test("clean on an imperative `.style.x = 'var(--…)'`", () => {
  const src =
    'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "var(--radius-card)";\n}\n';
  expect(gate.run(ctxFor({ [UI_FILE]: src }))).toEqual([]);
});

test("clean on a bare `0` no-op inline value", () => {
  const src = "export const G = <div style={{ margin: 0 }} />;\n";
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: src }))).toEqual([]);
});

test("clean on a DYNAMIC inline value (identifier — conservative, not chased)", () => {
  const src = "export const G = ({ r }: { r: string }) => <div style={{ borderRadius: r }} />;\n";
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: src }))).toEqual([]);
});

test("clean on a non-token property (width — out of this gate's scope)", () => {
  const src = 'export const G = <div style={{ width: "137px" }} />;\n';
  expect(gate.run(ctxFor({ [CLIENT_FEAT]: src }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a raw-literal inline style in an allowlisted sink — known off-Tailwind sink", () => {
  const src =
    'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "9999px";\n}\n';
  expect(gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: src }))).toEqual([]);
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const src =
    'export function f(el: HTMLElement): void {\n  el.style.borderRadius = "var(--radius-card)";\n}\n';
  const v = gateWithAllowlist.run(ctxFor({ [INJECTED_ALLOWLISTED]: src }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const src = "export const G = <div style={{ margin: 0 }} />;\n";
  const v = gateWithAllowlist.run(ctxFor({ [CLIENT_FEAT]: src }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
