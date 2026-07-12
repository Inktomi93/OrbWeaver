// Self-test for the `motion-token-purity` gate (scripts/check/gates/motion-token-purity.ts, registered
// in report.ts's ALL_CHECKS) — BASEUI-MOTION-AUDIT.md §5 Layer 3. The gate reads .css via fs.globSync
// (CSS isn't in the ts-morph project), so it self-tests over a REAL temp-dir fixture tree (root swapped
// to the temp dir with `ctxAt`), never the real repo. Proves: a raw duration fires, a raw easing keyword
// fires, a cubic-bezier fires, `var(--motion-*)`/`var(--ease-*)`/a co-motion `--shell-*` var does NOT,
// `linear` + `0s` do NOT, a custom-property DEFINITION (`--motion-fast: 130ms`) does NOT, a non-motion
// property does NOT, and BOTH ratchet arms (ALLOWLIST suppression + stale-entry) hold — via a
// factory-injected registry.
import { createMotionTokenPurity } from "../../scripts/check/gates/motion-token-purity.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxAt, withTree } from "./_support.ts";

const CSS = "packages/ui/src/styles/demo.css";
const CLIENT_CSS = "packages/client/src/features/demo/demo.css";
const ALLOWLISTED = "packages/ui/src/styles/legacy.css";

/** A one-rule stylesheet whose `.g` rule carries `body` — keeps every fixture string short enough to
 *  sidestep the formatter's long-line reflow (the gate scans declaration text, not the selector). */
function css(body: string): string {
  return `.g {\n  ${body}\n}\n`;
}

/** The fully-tokenized transition (a clean stylesheet) — reused across the PASSES + ratchet arms. */
const CLEAN = css("transition: transform var(--motion-base) var(--ease-out-expo);");

/** The gate with NO allowlist entries — drives FLAGS/PASSES without live ALLOWLIST noise. */
const gate = createMotionTokenPurity({});

/** The gate with ONE injected allowlist entry — the ratchet arms' test double. */
const gateWithAllowlist = createMotionTokenPurity({
  [ALLOWLISTED]: "test-injected entry (ratchet-arm coverage)",
});

// ── FLAGS ──────────────────────────────────────────────────────────────────────────────────────

test("fires on a raw duration in a transition (220ms)", () => {
  withTree({ [CSS]: css("transition: transform 220ms var(--ease-out-expo);") }, (root) => {
    const v = gate.run(ctxAt(root));
    expect(v).toHaveLength(1);
    expect(v[0]?.file).toBe(CSS);
  });
});

test("fires on a raw easing keyword (ease) in a transition", () => {
  withTree({ [CSS]: css("transition: transform var(--motion-base) ease;") }, (root) => {
    expect(gate.run(ctxAt(root))).toHaveLength(1);
  });
});

test("fires on a raw cubic-bezier easing", () => {
  const bez = css("transition: opacity var(--motion-fast) cubic-bezier(0.1, 0.2, 0.3, 1);");
  withTree({ [CSS]: bez }, (root) => {
    expect(gate.run(ctxAt(root))).toHaveLength(1);
  });
});

test("fires on a raw duration+easing in an animation shorthand (3s ease-in-out)", () => {
  withTree({ [CSS]: css("animation: spin 3s ease-in-out infinite;") }, (root) => {
    expect(gate.run(ctxAt(root))).toHaveLength(1);
  });
});

test("fires on a raw animation-duration longhand", () => {
  withTree({ [CSS]: css("animation-duration: 500ms;") }, (root) => {
    expect(gate.run(ctxAt(root))).toHaveLength(1);
  });
});

test("fires in packages/client/src too", () => {
  withTree({ [CLIENT_CSS]: css("transition: transform 220ms ease;") }, (root) => {
    const v = gate.run(ctxAt(root));
    expect(v).toHaveLength(1);
    expect(v[0]?.file).toBe(CLIENT_CSS);
  });
});

// ── PASSES ─────────────────────────────────────────────────────────────────────────────────────

test("clean on tokenized duration + easing (var(--motion-*) var(--ease-*))", () => {
  withTree({ [CSS]: CLEAN }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

test("clean on the co-motion --shell-* vars (the never-desync mechanism)", () => {
  const shellVars = css("transition: transform var(--shell-motion) var(--shell-ease);");
  withTree({ [CSS]: shellVars }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

test("clean on `linear` easing (continuous loops legitimately use it)", () => {
  withTree({ [CSS]: css("animation: sweep var(--motion-shimmer) linear infinite;") }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

test("clean on a `0s` deliberate no-transition", () => {
  withTree({ [CSS]: css("transition: transform 0s var(--ease-out-expo);") }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

test("clean on a --motion-* token DEFINITION (not one of the scanned properties)", () => {
  const def =
    ":root {\n  --motion-base: 220ms;\n  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);\n}\n";
  withTree({ [CSS]: def }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

test("clean on a non-motion property carrying a length-shaped word", () => {
  withTree({ [CSS]: css("grid-template-columns: 220px 1fr;") }, (root) => {
    expect(gate.run(ctxAt(root))).toEqual([]);
  });
});

// ── RATCHET (both arms, via the factory's injected registry) ───────────────────────────────────

test("suppresses a raw motion value in an allowlisted file — known pre-existing debt", () => {
  withTree({ [ALLOWLISTED]: css("animation: x 3s ease-in-out infinite;") }, (root) => {
    expect(gateWithAllowlist.run(ctxAt(root))).toEqual([]);
  });
});

test("ratchet-down: an allowlisted file gone clean is RED (stale entry)", () => {
  withTree({ [ALLOWLISTED]: CLEAN }, (root) => {
    const v = gateWithAllowlist.run(ctxAt(root));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("stale");
  });
});

test("ratchet-down: an allowlisted file ABSENT from the tree is also a stale entry", () => {
  withTree({ [CSS]: CLEAN }, (root) => {
    const v = gateWithAllowlist.run(ctxAt(root));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("stale");
  });
});
