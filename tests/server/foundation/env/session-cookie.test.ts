// foundation/env/session-cookie — the SESSION-COOKIE TRANSPORT posture (`SESSION_COOKIE_INSECURE`, #2413).
// The rule is pure (raw values in, a verdict + a notice + a warning list out), so every arm is unit-testable
// here; that the knob is WIRED into the parse is pinned in index.test.ts, and that the verdict reaches the
// actual cookie name/attributes is pinned in tests/server/infra/auth/modes/cookie-session.test.ts.
//
// What matters about this file is that the DEFAULT is the secure cookie and that the downgrade is never
// silent: a box serving its session credential in cleartext must say so, in words an operator can act on,
// every single boot.

import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES } from "@orb/contracts/identity";
import type { SessionCookiePostureInput } from "@orb/server/foundation/env";
import { resolveSessionCookiePosture, sessionCookieWarnings } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

function input(over: Partial<SessionCookiePostureInput> = {}): SessionCookiePostureInput {
  return { insecure: false, authMode: "local", ...over };
}

function warningsFor(over: Partial<SessionCookiePostureInput> = {}): readonly string[] {
  const resolved = input(over);
  return sessionCookieWarnings(resolved, resolveSessionCookiePosture(resolved));
}

describe("resolveSessionCookiePosture", () => {
  test("DEFAULT is the SECURE cookie — the knob unset changes nothing", () => {
    expect(resolveSessionCookiePosture(input()).secure).toBe(true);
  });

  test("insecure:true drops the Secure posture", () => {
    expect(resolveSessionCookiePosture(input({ insecure: true })).secure).toBe(false);
  });

  // The verdict is a fact about the PROCESS, never about a request: nothing in this resolver's input can be
  // supplied by a caller (no scheme, no Host, no X-Forwarded-Proto), which is what makes "a proxy can forge
  // it" unreachable by construction rather than by a reviewer remembering the rule. `AUTH_MODE` is present
  // only to make the warning say something true, so the verdict must be blind to it.
  test("the verdict is decided by the knob ALONE — AUTH_MODE never moves it", () => {
    for (const authMode of AUTH_MODES) {
      expect(resolveSessionCookiePosture(input({ authMode })).secure, `secure posture under ${authMode}`).toBe(true);
      expect(resolveSessionCookiePosture(input({ insecure: true, authMode })).secure, `insecure posture under ${authMode}`).toBe(false);
    }
  });

  test("both notices name the knob, so the boot log is actionable at the moment of confusion", () => {
    expect(resolveSessionCookiePosture(input()).notice).toContain("SESSION_COOKIE_INSECURE=true");
    expect(resolveSessionCookiePosture(input({ insecure: true })).notice).toContain("SESSION_COOKIE_INSECURE=true");
  });

  test("the secure notice names the localhost-only limitation (the symptom an operator is looking at)", () => {
    expect(resolveSessionCookiePosture(input()).notice).toContain("http://localhost");
  });
});

describe("sessionCookieWarnings", () => {
  // A healthy boot is silent — the `diagnostics.ts` contract. A warning nobody can turn off is a warning
  // everybody learns to skip, and the next real one goes with it.
  test("the SECURE posture warns about nothing, in every mode", () => {
    for (const authMode of AUTH_MODES) {
      expect(warningsFor({ authMode }), `secure posture under ${authMode}`).toEqual([]);
    }
  });

  test("the downgrade earns EXACTLY ONE standing warning", () => {
    expect(warningsFor({ insecure: true })).toHaveLength(1);
  });

  // The nag is the ONLY control on this knob (owner ruling 2026-09-18: the operator's network is their
  // choice, but the console nags), so it has to state the actual consequence — not "this is less secure".
  test("the warning states the takeover plainly: cleartext, copyable, and equal to being that user", () => {
    const [warning] = warningsFor({ insecure: true });
    expect(warning).toContain("SESSION_COOKIE_INSECURE=true");
    expect(warning).toContain("IN CLEAR");
    expect(warning).toContain("the credential");
    expect(warning).toContain("session fixation");
    // and the exit, because a warning that does not say what to type is a warning that gets ignored
    expect(warning).toContain("TLS");
  });

  test("a cookie-minting mode gets no inert-knob claim (local really is affected)", () => {
    expect(warningsFor({ insecure: true, authMode: "local" })?.[0]).not.toContain("mints no session cookie");
  });

  // A knob that changes nothing on THIS box must say so, or the operator believes they fixed their problem
  // and goes looking for a different bug. `single-user` authenticates by the peer-gated owner fallback and
  // `forward-header` by the proxy's headers — neither registers a cookie mint.
  const nonMinting: readonly AuthMode[] = ["single-user", "forward-header"];
  for (const authMode of nonMinting) {
    test(`AUTH_MODE=${authMode} is told the knob is inert on this box`, () => {
      expect(warningsFor({ insecure: true, authMode })?.[0]).toContain("mints no session cookie");
    });
  }

  // The OIDC obstacle is a SEPARATE problem the knob does not solve (the callback origin derives as https
  // unless a proxy asserts otherwise), and an operator who flips the knob expecting oidc-over-http to start
  // working must read why it still 400s instead of filing it as a second bug.
  test("AUTH_MODE=oidc is told the redirect is a separate problem, with the exact knob that fixes it", () => {
    const [warning] = warningsFor({ insecure: true, authMode: "oidc" });
    expect(warning).toContain("X-Forwarded-Proto");
    expect(warning).toContain("OIDC_REDIRECT_URIS");
  });

  test("the oidc sentence is oidc-ONLY (local, the common LAN case, is not told about a redirect)", () => {
    expect(warningsFor({ insecure: true, authMode: "local" })?.[0]).not.toContain("OIDC_REDIRECT_URIS");
  });
});
