// The OWNER-FALLBACK PEER-SET posture (`AUTH_FALLBACK_TRUSTED_PEERS`, PROPOSED — docs/plans/containerize/design.md
// §3.1 arm (b)). Pure, so this is the whole model's test surface: the CSV parse that every reader shares, the
// resolved posture, and the standing boot WARNING.
//
// The load-bearing assertion is the WARNING arm. This knob makes "who can reach the socket" equal "who is the
// owner" for the ranges it names — the exact property #298 f2 removed — so a boot that stops announcing it is
// exactly as silent as the exposure it names.

import type { OwnerFallbackPeerInput } from "@orb/server/foundation/env";
import { ownerFallbackPeerWarnings, parseOwnerFallbackTrustedPeers, resolveOwnerFallbackPeers } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const UNSET: OwnerFallbackPeerInput = { authFallback: "owner", trustedPeers: undefined };

function posture(over: Partial<OwnerFallbackPeerInput> = {}): ReturnType<typeof resolveOwnerFallbackPeers> {
  return resolveOwnerFallbackPeers({ ...UNSET, ...over });
}

describe("parseOwnerFallbackTrustedPeers — the ONE parse every reader shares", () => {
  test("unset yields the empty set (the default posture: loopback only)", () => {
    expect(parseOwnerFallbackTrustedPeers(undefined)).toEqual([]);
  });

  test("an empty/whitespace value is NOT a widening — it yields nothing, like an unset knob", () => {
    expect(parseOwnerFallbackTrustedPeers("")).toEqual([]);
    expect(parseOwnerFallbackTrustedPeers("  ,  , ")).toEqual([]);
  });

  test("a comma list is trimmed, and both IP families survive", () => {
    expect(parseOwnerFallbackTrustedPeers(" 172.17.0.0/16 , fd00::/8 ")).toEqual(["172.17.0.0/16", "fd00::/8"]);
  });
});

describe("resolveOwnerFallbackPeers", () => {
  test("the shipped posture: unset ⇒ no ranges, not widened, and SILENT", () => {
    const p = posture();
    expect(p).toEqual({ ranges: [], widened: false });
    expect(ownerFallbackPeerWarnings(p)).toEqual([]);
  });

  test("ranges set with AUTH_FALLBACK=owner ⇒ widened", () => {
    const p = posture({ trustedPeers: "172.17.0.0/16" });
    expect(p.ranges).toEqual(["172.17.0.0/16"]);
    expect(p.widened).toBe(true);
  });

  test("AUTH_FALLBACK=deny makes the knob INERT — the ranges are reported, the posture is NOT widened", () => {
    // `resolve` tests `fallback === "owner"` BEFORE the peer gate, so a `deny` box admits nobody through this
    // set. Reporting the ranges anyway keeps a misconfigured deploy legible; `widened:false` is what the
    // warning and the /api/_debug credential rule key on.
    const p = posture({ authFallback: "deny", trustedPeers: "172.17.0.0/16" });
    expect(p.ranges).toEqual(["172.17.0.0/16"]);
    expect(p.widened).toBe(false);
    expect(ownerFallbackPeerWarnings(p)).toEqual([]);
  });

  test("an empty value with AUTH_FALLBACK=owner is not a widening", () => {
    expect(posture({ trustedPeers: "   " }).widened).toBe(false);
  });
});

describe("ownerFallbackPeerWarnings — the standing security line", () => {
  const warn = (raw: string): string => {
    const [line] = ownerFallbackPeerWarnings(posture({ trustedPeers: raw }));
    expect(line).toBeDefined();
    return line ?? "";
  };

  test("it NAMES the exact ranges — an operator must be able to read back what they opened", () => {
    expect(warn("172.17.0.0/16,10.8.0.0/24")).toContain("172.17.0.0/16, 10.8.0.0/24");
  });

  test("it states the grant in full: every peer inside is the OWNER with NO credential", () => {
    const line = warn("172.17.0.0/16");
    expect(line).toContain("AUTH_FALLBACK_TRUSTED_PEERS");
    expect(line).toContain("OWNER");
    expect(line).toContain("credential");
  });

  test("it names the docker NAT hazard and the mitigation that actually bounds it", () => {
    // A published port SNATs every external client to the bridge gateway, so trusting the bridge trusts
    // whoever can reach the published port. Binding the publication to the host's loopback is the control;
    // IP_ALLOWLIST is NOT (isIngressAllowed admits any private address, which is what the NAT produces).
    const line = warn("172.17.0.0/16");
    expect(line).toContain("127.0.0.1:");
    expect(line).toContain("IP_ALLOWLIST");
  });

  test("it is SILENT when the knob is unset — a healthy boot says nothing", () => {
    expect(ownerFallbackPeerWarnings(posture())).toEqual([]);
  });
});
