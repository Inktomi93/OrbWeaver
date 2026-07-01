// engine/turn-identity — the D19 triple resolution + the §5/inv-3 max-pro-sub-by-proxy refusal (pure).

import type { ChatSource } from "@orb/contracts/connection";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import {
  assertMaxProSubConsent,
  resolveTurnIdentity,
} from "../../../../../packages/server/src/domain/chat/engine/turn-identity";
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
    expect(resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST }).runAsUserId).toBe(
      HOST,
    );
  });
});

const consent = (over: {
  source?: ChatSource;
  triggeredBy?: UserId;
  runAsUserId?: UserId;
  ownerConsent?: boolean;
}): void =>
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
