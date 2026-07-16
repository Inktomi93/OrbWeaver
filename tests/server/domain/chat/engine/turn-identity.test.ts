// engine/turn-identity — the D19 triple resolution + the §5/inv-3 max-pro-sub-by-proxy refusal (pure).

import type { CredentialSource } from "@orb/contracts/connection";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { assertMaxProSubConsent, resolveOwnerConsented, resolveTurnIdentity } from "../../../../../packages/server/src/domain/chat/engine/turn-identity";
import { expect, test } from "../../../../support/fixtures";

const CALLER = castId<UserId>("user_caller");
const HOST = castId<UserId>("user_host");
const CHAIN_STARTER = castId<UserId>("user_chain");

describe("resolveTurnIdentity — the D19 triple", () => {
  test("a direct send: triggeredBy = the caller, runAsUserId = the host", () => {
    expect(resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST })).toEqual({
      triggeredBy: CALLER,
      runAsUserId: HOST,
    });
  });

  test("an auto-mode turn: triggeredBy = the chain-starter (not the caller)", () => {
    expect(
      resolveTurnIdentity({
        principalUserId: CALLER,
        hostUserId: HOST,
        triggeredBy: CHAIN_STARTER,
      }),
    ).toEqual({ triggeredBy: CHAIN_STARTER, runAsUserId: HOST });
  });

  test("runAsUserId is ALWAYS the host — never the caller (D19)", () => {
    expect(resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST }).runAsUserId).toBe(HOST);
  });
});

const consent = (over: { source?: CredentialSource; triggeredBy?: UserId; runAsUserId?: UserId; ownerConsent?: boolean }): void =>
  assertMaxProSubConsent({
    source: over.source ?? "max-pro-sub",
    identity: {
      triggeredBy: over.triggeredBy ?? CALLER,
      runAsUserId: over.runAsUserId ?? HOST,
    },
    ownerConsent: over.ownerConsent ?? false,
  });

describe("assertMaxProSubConsent — the by-proxy belt (fail-closed)", () => {
  test("max-pro-sub by proxy WITHOUT consent → consent_required", () => {
    let caught: unknown;
    try {
      consent({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ChatOperationError);
    expect((caught as ChatOperationError).code).toBe("consent_required");
  });

  test("max-pro-sub by proxy WITH owner consent → allowed", () => {
    expect(() => consent({ ownerConsent: true })).not.toThrow();
  });

  test("max-pro-sub SELF-triggered (triggeredBy === host) → allowed without consent", () => {
    expect(() => consent({ triggeredBy: HOST })).not.toThrow();
  });

  test("a non-hosted source (vllm) by proxy → not gated (local compute is count-budgeted, not consented)", () => {
    expect(() => consent({ source: "vllm" })).not.toThrow();
  });
});

const ownerConsented = (over: { triggeredBy?: UserId; runAsUserId?: UserId; ownerConsent?: boolean }): boolean =>
  resolveOwnerConsented({
    identity: {
      triggeredBy: over.triggeredBy ?? CALLER,
      runAsUserId: over.runAsUserId ?? HOST,
    },
    ownerConsent: over.ownerConsent ?? false,
  });

describe("resolveOwnerConsented — the D17 verdict as a VALUE (post-belt)", () => {
  test("SELF-triggered (triggeredBy === runAsUserId) → true even without owner consent (owner-initiated)", () => {
    expect(ownerConsented({ triggeredBy: HOST, ownerConsent: false })).toBe(true);
  });

  test("BY-PROXY without owner consent → false (the belt would have refused a hosted turn already)", () => {
    expect(ownerConsented({ triggeredBy: CALLER, ownerConsent: false })).toBe(false);
  });

  test("BY-PROXY WITH owner consent → true (the owner consented to non-owner use)", () => {
    expect(ownerConsented({ triggeredBy: CALLER, ownerConsent: true })).toBe(true);
  });

  // The load-bearing pairing: whenever the max-pro-sub belt does NOT throw, the derived verdict is true —
  // the two independent D17 checks (the throwing assert + the value the firewall re-verifies) never disagree.
  test("NEVER disagrees with assertMaxProSubConsent on a max-pro-sub turn", () => {
    const cases: readonly { triggeredBy: UserId; ownerConsent: boolean }[] = [
      { triggeredBy: HOST, ownerConsent: false }, // self-triggered: passes belt, verdict true
      { triggeredBy: HOST, ownerConsent: true }, // self-triggered + consent: passes belt, verdict true
      { triggeredBy: CALLER, ownerConsent: true }, // by-proxy + consent: passes belt, verdict true
    ];
    for (const c of cases) {
      // The belt does not throw for any of these …
      expect(() => consent({ triggeredBy: c.triggeredBy, ownerConsent: c.ownerConsent })).not.toThrow();
      // … and the value the firewall re-verifies is affirmatively true (no independent disagreement).
      expect(ownerConsented(c)).toBe(true);
    }
    // The one refused shape: by-proxy, no consent — the belt throws AND the verdict is false (both deny).
    expect(() => consent({ triggeredBy: CALLER, ownerConsent: false })).toThrow(ChatOperationError);
    expect(ownerConsented({ triggeredBy: CALLER, ownerConsent: false })).toBe(false);
  });
});
