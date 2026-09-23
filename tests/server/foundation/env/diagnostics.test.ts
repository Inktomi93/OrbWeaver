// The DIAGNOSTICS POSTURE resolver — the composed ops story for IP_ALLOWLIST × DEBUG_TOKEN ×
// WIRE_CAPTURE/RPG_TRACE. Pure, so this is the whole model's test surface.
//
// The load-bearing assertions are the two WARNING arms: they are the standing OWNER OPS items made
// self-announcing, and a warning that stops firing is exactly as silent as the exposure it names.

import type { DiagnosticsPostureInput, OwnerFallbackCredentialInput } from "@orb/server/foundation/env";
import { diagnosticsPostureWarnings, resolveDiagnosticsPosture, resolveOwnerFallbackCredential } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const SEALED: DiagnosticsPostureInput = { debugToken: undefined, ipAllowlist: undefined, wireCapture: "off", rpgTrace: "off" };

function posture(over: Partial<DiagnosticsPostureInput> = {}): ReturnType<typeof resolveDiagnosticsPosture> {
  return resolveDiagnosticsPosture({ ...SEALED, ...over });
}

describe("resolveDiagnosticsPosture", () => {
  test("the shipped posture: nothing retained, no perimeter needed, no warnings", () => {
    const p = posture();
    expect(p).toEqual({ perimeter: false, tokenConfigured: false, retaining: [], exposure: "minimal" });
    expect(diagnosticsPostureWarnings(p)).toEqual([]);
  });

  test("a recorder ON with no perimeter is `retaining-open` — the standing OWNER OPS item", () => {
    const p = posture({ wireCapture: "on" });
    expect(p.exposure).toBe("retaining-open");
    expect(p.retaining).toEqual(["WIRE_CAPTURE"]);
    const [warning] = diagnosticsPostureWarnings(p);
    // A warning that does not name the knob that closes it is a warning that gets ignored.
    expect(warning).toContain("IP_ALLOWLIST");
    expect(warning).toContain("RAW PROVIDER REQUEST BODIES");
  });

  test("the SAME recorder behind a perimeter is `retaining` — bounded, and silent", () => {
    const p = posture({ wireCapture: "on", ipAllowlist: "10.0.0.0/24" });
    expect(p.exposure).toBe("retaining");
    expect(p.perimeter).toBe(true);
    expect(diagnosticsPostureWarnings(p)).toEqual([]);
  });

  test("BOTH recorders are named in the verdict — retention is a plane, not one knob", () => {
    const p = posture({ wireCapture: "on", rpgTrace: "on" });
    expect(p.retaining).toEqual(["WIRE_CAPTURE", "RPG_TRACE"]);
    expect(diagnosticsPostureWarnings(p)[0]).toContain("WIRE_CAPTURE + RPG_TRACE");
  });

  test("RPG_TRACE alone still counts as retention — a ring is a ring", () => {
    expect(posture({ rpgTrace: "on" }).exposure).toBe("retaining-open");
  });

  test("an EMPTY IP_ALLOWLIST is not a perimeter — `parseAllowlist` yields nothing and app.ts skips the middleware", () => {
    expect(posture({ ipAllowlist: "" }).perimeter).toBe(false);
    expect(posture({ ipAllowlist: "   " }).perimeter).toBe(false);
    expect(posture({ wireCapture: "on", ipAllowlist: "" }).exposure).toBe("retaining-open");
  });

  test("a bearer token with no perimeter warns on its own — the rotation pain, stated where it is caused", () => {
    const warnings = diagnosticsPostureWarnings(posture({ debugToken: "s3cret" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("rotate");
    // …and it stops once the perimeter is armed.
    expect(diagnosticsPostureWarnings(posture({ debugToken: "s3cret", ipAllowlist: "10.0.0.0/24" }))).toEqual([]);
  });

  test("the worst posture reports BOTH items, not just the loudest one", () => {
    expect(diagnosticsPostureWarnings(posture({ debugToken: "s3cret", wireCapture: "on" }))).toHaveLength(2);
  });

  test("the posture NEVER carries the token value — it is reduced to a boolean before it leaves foundation/env", () => {
    // The whole object is what the boot log and /api/_debug/info print.
    expect(JSON.stringify(posture({ debugToken: "s3cret-do-not-log" }))).not.toContain("s3cret");
  });
});

// The CREDENTIAL plane's third arm (#1193). This resolver decides whether the un-credentialed LOOPBACK owner
// fallback is the box operator's session or an acknowledged SSO-bypass, and `entry/auth/seam.ts` carries the
// answer to the /api/_debug door. Its polarity is the whole security property, so both directions are pinned
// against the ruled hazard it is the negation of (`foundation/env/index.ts`'s production superRefine).
describe("resolveOwnerFallbackCredential", () => {
  const credential = (over: Partial<OwnerFallbackCredentialInput> = {}): boolean =>
    resolveOwnerFallbackCredential({ nodeEnv: "development", authFallback: "owner", fallbackWidened: false, ...over });

  test("a DEV box: the loopback owner IS the operator (this is the #1193 fix)", () => {
    expect(credential()).toBe(true);
    expect(credential({ nodeEnv: "test" })).toBe(true);
  });

  test("PRODUCTION is refused — a same-host proxy makes every external request a loopback peer there", () => {
    // This holds for EVERY mode, `single-user` included: prod single-user is forced to AUTH_FALLBACK=owner
    // (deny is boot-fatal there), so it is exactly the box where a proxied caller would otherwise inherit
    // the diagnostics surface — which holds more than the app does (raw provider request bodies). The prod
    // image spec leans on that belt (docs/plans/containerize/design.md), and a break-glass session is
    // refused for the same reason: whoever opened that door holds DEBUG_TOKEN.
    expect(credential({ nodeEnv: "production" })).toBe(false);
  });

  test("AUTH_FALLBACK=deny is false everywhere — there is no arm to credential", () => {
    expect(credential({ authFallback: "deny" })).toBe(false);
    expect(credential({ nodeEnv: "production", authFallback: "deny" })).toBe(false);
  });
});

// The WIDENED-PEER arm of the same credential rule (PROPOSED — spec §3.1 arm (b)). The #1193 justification
// for crediting `via:"fallback"` at the /api/_debug door is precisely that on a dev box "a loopback peer" MEANS
// "the human at this machine". `AUTH_FALLBACK_TRUSTED_PEERS` breaks that identity, so the door closes again —
// the diagnostics surface holds more than the app does (raw provider request bodies with WIRE_CAPTURE=on) and
// must not inherit a widening the operator opted into for the APP's sake.
describe("resolveOwnerFallbackCredential — a WIDENED fallback peer set is not an operator credential", () => {
  const credential = (over: Partial<OwnerFallbackCredentialInput> = {}): boolean =>
    resolveOwnerFallbackCredential({ nodeEnv: "development", authFallback: "owner", fallbackWidened: false, ...over });

  test("dev + a widened peer set → FALSE (x-debug-token is the door once the peer set stops meaning 'this machine')", () => {
    expect(credential({ fallbackWidened: true })).toBe(false);
  });

  test("dev + the UNWIDENED loopback set → TRUE, unchanged (#1193 is not weakened by the knob's existence)", () => {
    expect(credential()).toBe(true);
  });
});
