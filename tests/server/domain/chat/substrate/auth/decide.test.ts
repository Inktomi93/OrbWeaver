// Pure decision-core tests (the chat design doc Part III §11). No I/O — the deciders take an already-loaded membership +
// the INJECTED `can()` seam (the real admin `can` is wired in, proving the unified seam — the `host`
// verdict lives in `can()`, chat only re-expresses it as its leak-free/coded error). `assertParticipant` is the
// leak-free PRESENCE half (a load miss → not-found), which is NOT a `can()` decision.
import type { Principal } from "@orb/contracts/identity";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { ChatNotFoundError, ChatOperationError } from "../../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { assertAuthorOrHost, assertHost, assertParticipant } from "../../../../../../packages/server/src/domain/chat/substrate/auth/index.ts";
import { principal as makePrincipal } from "../../../../../support/factories/principal.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_x");
const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");

/** A chat-resource principal (role `user` — the global role is irrelevant to the chat resource axis; the
 *  authority signal is the loaded `chat_participants` role passed to the deciders). */
function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** Capture a thrown value WITHOUT an expect inside the catch (biome `noConditionalExpect`). */
function thrown(fn: () => unknown): unknown {
  let captured: unknown;
  try {
    fn();
  } catch (err) {
    captured = err;
  }
  return captured; // undefined when fn did not throw
}

describe("assertParticipant — present-membership gate (leak-free DATA half)", () => {
  test("a loaded membership passes through unchanged", () => {
    const membership = { chat: { id: CHAT }, role: "member" } as const;
    expect(assertParticipant(membership, CHAT)).toBe(membership);
  });

  test("a miss is a leak-free not-found", () => {
    expect(() => assertParticipant(undefined, CHAT)).toThrow(ChatNotFoundError);
  });
});

describe("assertHost — host-authority via the injected can() seam", () => {
  test("a host passes", () => {
    expect(() => assertHost(can, principal(ALICE), "host", CHAT)).not.toThrow();
  });

  test("a member is refused with the not_host code (the seam denied; chat re-expresses)", () => {
    const err = thrown(() => assertHost(can, principal(ALICE), "member", CHAT));
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("assertAuthorOrHost — edit/delete gate via the seam", () => {
  test("the host overrides any slot, including a character-authored (null-author) row", () => {
    expect(() => assertAuthorOrHost(can, { principal: principal(ALICE), role: "host", authorUserId: BOB }, CHAT)).not.toThrow();
    expect(() => assertAuthorOrHost(can, { principal: principal(ALICE), role: "host", authorUserId: null }, CHAT)).not.toThrow();
  });

  test("a member may act on their own slot", () => {
    expect(() => assertAuthorOrHost(can, { principal: principal(ALICE), role: "member", authorUserId: ALICE }, CHAT)).not.toThrow();
  });

  test("a member is refused another member's slot with the not_author code", () => {
    const err = thrown(() => assertAuthorOrHost(can, { principal: principal(ALICE), role: "member", authorUserId: BOB }, CHAT));
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
  });

  test("a null-authored slot is host-only for a member (not_author)", () => {
    const err = thrown(() => assertAuthorOrHost(can, { principal: principal(ALICE), role: "member", authorUserId: null }, CHAT));
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
  });
});

describe("lineage gating is per-ancestor (a fork grants no parent membership)", () => {
  test("each ancestor's membership is decided independently", () => {
    const memberAncestor = { role: "member" } as const;
    expect(() => assertParticipant(memberAncestor, castId<ChatId>("chat_a"))).not.toThrow();
    expect(() => assertParticipant(undefined, castId<ChatId>("chat_b"))).toThrow(ChatNotFoundError);
  });
});
