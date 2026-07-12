// Self-test for the `no-raw-interactive-intrinsics` gate (scripts/check/gates/
// no-raw-interactive-intrinsics.ts, registered in report.ts's ALL_CHECKS) — design-enforcement.md §3.2,
// D62. Drives the Check directly over an in-memory ts-morph project (never the real tree), proving: each
// banned intrinsic fires, an `<a>` without `href` stays legal, app-shell is exempt, and BOTH ratchet arms
// (BURN_DOWN suppression + stale-entry) hold — via a factory-injected registry (the
// createNoInteractiveRoleInFeatures precedent). FLAGS/PASSES use an EMPTY injected registry (not the live
// export) — the live BURN_DOWN is non-empty (3 real hidden file-input offenders), so testing against a
// synthetic tree through the live export would spuriously fire the stale-entry arm on every case; the live
// gate itself is proven against the real tree by tests/tooling/check-gates.int.test.ts's fixture.
import { createNoRawInteractiveIntrinsics } from "../../scripts/check/gates/no-raw-interactive-intrinsics.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const FEAT = "packages/client/src/features/demo/components/thing.tsx";
const INJECTED_ALLOWLISTED = "packages/client/src/features/demo/components/legacy-input.tsx";

/** A source file rendering the given self-closing JSX snippet as the sole export. */
function src(jsx: string): string {
  return `export const G = ${jsx};\n`;
}

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live BURN_DOWN noise. */
const gate = createNoRawInteractiveIntrinsics({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createNoRawInteractiveIntrinsics({
  [INJECTED_ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a raw <button>", () => {
  const v = gate.run(ctxFor({ [FEAT]: src('<button type="button">Go</button>') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.file).toBe(FEAT);
});

test("fires on a raw <input>", () => {
  const v = gate.run(ctxFor({ [FEAT]: src('<input type="text" />') }));
  expect(v).toHaveLength(1);
});

test("fires on a raw <select>", () => {
  const v = gate.run(ctxFor({ [FEAT]: src("<select><option>a</option></select>") }));
  expect(v).toHaveLength(1);
});

test("fires on a raw <textarea>", () => {
  const v = gate.run(ctxFor({ [FEAT]: src("<textarea />") }));
  expect(v).toHaveLength(1);
});

test("fires on an <a> carrying href", () => {
  const v = gate.run(ctxFor({ [FEAT]: src('<a href="/x">go</a>') }));
  expect(v).toHaveLength(1);
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on an <a> with no href (not interactive)", () => {
  expect(gate.run(ctxFor({ [FEAT]: src('<a name="top">top</a>') }))).toEqual([]);
});

test("clean in app-shell (shell-tier exempt)", () => {
  const shellFile = "packages/client/src/features/app-shell/components/g.tsx";
  expect(gate.run(ctxFor({ [shellFile]: src("<button>Go</button>") }))).toEqual([]);
});

test("clean outside features (a ui/ primitive legally hosts the raw element)", () => {
  const uiFile = "packages/ui/src/primitives/button/button.tsx";
  expect(gate.run(ctxFor({ [uiFile]: src("<button>Go</button>") }))).toEqual([]);
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a raw intrinsic in an allowlisted (burn-down) file — known debt", () => {
  expect(
    gateWithAllowlist.run(
      ctxFor({ [INJECTED_ALLOWLISTED]: src('<input type="file" hidden={true} />') }),
    ),
  ).toEqual([]);
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  const v = gateWithAllowlist.run(
    ctxFor({ [INJECTED_ALLOWLISTED]: "export const G = <div />;\n" }),
  );
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  const v = gateWithAllowlist.run(ctxFor({ [FEAT]: "export const G = <div />;\n" }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});
