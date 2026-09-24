// entry/boot/disclaimer — the one boot disclaimer block. Pins the composition rules, never the copy: which
// topics appear, which lines are security lines, and that a healthy box says nothing alarming.

import type { AuthMode } from "@orb/contracts/identity";
import type { BootDisclaimerInput } from "@orb/server/entry/boot";
import { composeBootDisclaimer } from "@orb/server/entry/boot";
import { resolveBindPosture, resolveOwnerFallbackPeers } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const NO_WARNINGS: readonly string[] = [];

function input(over: Partial<BootDisclaimerInput> = {}): BootDisclaimerInput {
  const authMode: AuthMode = over.authMode ?? "single-user";
  return {
    authMode,
    authFallback: "owner",
    breakGlass: false,
    bind: resolveBindPosture({ nodeEnv: "production", authMode, bindHost: undefined, allowDevPublicBind: false, ownerPeersDeclared: false }),
    bindWarnings: NO_WARNINGS,
    ownerPeers: resolveOwnerFallbackPeers({ authFallback: "owner", trustedPeers: undefined }),
    ownerPeerWarnings: NO_WARNINGS,
    diagnosticsWarnings: NO_WARNINGS,
    forwardHeaderUnsignedClosed: false,
    secrets: { sessionSecret: { explicit: false, keyfile: "/data/.session-secret" }, credentialsKey: { explicit: true, keyfile: "/data/.credentials-key" } },
    ...over,
  };
}

const topics = (i: BootDisclaimerInput): readonly string[] => composeBootDisclaimer(i).map((line) => line.topic);
const securityLines = (i: BootDisclaimerInput): number => composeBootDisclaimer(i).filter((line) => line.security).length;

describe("composeBootDisclaimer", () => {
  test("names the mode, the listener, the credential-less owner, the cookie rule and the secrets, in that order", () => {
    expect(topics(input({ authMode: "local", authFallback: "deny" }))).toEqual(["mode", "listen", "owner", "cookie", "secrets"]);
  });

  // Owner acceptance condition: the single-user caveat (a proxy that sends no forwarding header is not
  // seen) rides EVERY single-user boot, not only a public bind, and it is information, not an alarm.
  test("a healthy loopback single-user box carries the proxy caveat and no security line", () => {
    const healthy = input();
    expect(healthy.bind.publicBind).toBe(false);
    expect(topics(healthy)).toContain("caveat");
    expect(securityLines(healthy)).toBe(0);
  });

  test("the caveat also rides a single-user box whose declared peer set opens the listener", () => {
    const widened = resolveOwnerFallbackPeers({ authFallback: "owner", trustedPeers: "172.16.0.0/12" });
    const container = input({
      bind: resolveBindPosture({ nodeEnv: "production", authMode: "single-user", bindHost: "0.0.0.0", allowDevPublicBind: false, ownerPeersDeclared: true }),
      ownerPeers: widened,
      ownerPeerWarnings: ["widened"],
    });
    expect(topics(container)).toContain("caveat");
  });

  test.each(["local", "oidc", "forward-header"] as const)("AUTH_MODE=%s carries no single-user caveat", (authMode) => {
    expect(topics(input({ authMode, authFallback: "deny" }))).not.toContain("caveat");
  });

  // Control for the "no security line" row: every standing exposure becomes exactly one security line.
  test("each standing exposure is one security line: bind, widened peers, diagnostics, break-glass", () => {
    expect(securityLines(input({ ownerPeerWarnings: ["widened"] }))).toBe(1);
    expect(securityLines(input({ bindWarnings: ["hatch"], diagnosticsWarnings: ["ring", "token"] }))).toBe(3);
    expect(securityLines(input({ authMode: "oidc", authFallback: "owner", breakGlass: true }))).toBe(1);
  });

  test("a forward-header box with the unsigned path closed warns, but it is a closed door, not an exposure", () => {
    const lines = composeBootDisclaimer(input({ authMode: "forward-header", authFallback: "deny", forwardHeaderUnsignedClosed: true }));
    expect(lines.filter((line) => line.level === "warn")).toHaveLength(1);
    expect(lines.filter((line) => line.security)).toHaveLength(0);
  });

  test("every security line is a warn", () => {
    const lines = composeBootDisclaimer(input({ bindWarnings: ["a"], ownerPeerWarnings: ["b"], diagnosticsWarnings: ["c"] }));
    expect(lines.filter((line) => line.security).every((line) => line.level === "warn")).toBe(true);
  });
});
