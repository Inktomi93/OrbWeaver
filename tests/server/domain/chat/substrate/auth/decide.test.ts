// Pure decision-core tests (chat.md Part III §11). No I/O — the deciders take an already-loaded membership.
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  ChatNotFoundError,
  ChatOperationError,
} from "../../../../../../packages/server/src/domain/chat/contract/errors";
import {
  assertAuthorOrHost,
  assertHost,
  assertParticipant,
  isHost,
} from "../../../../../../packages/server/src/domain/chat/substrate/auth";

const CHAT = castId<ChatId>("chat_x");
const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");

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

describe("assertParticipant — present-membership gate", () => {
  test("a loaded membership passes through unchanged", () => {
    const membership = { chat: { id: CHAT }, role: "member" } as const;
    expect(assertParticipant(membership, CHAT)).toBe(membership);
  });

  test("a miss is a leak-free not-found", () => {
    expect(() => assertParticipant(undefined, CHAT)).toThrow(ChatNotFoundError);
  });
});

describe("isHost / assertHost — host-authority gate", () => {
  test("host passes", () => {
    expect(isHost("host")).toBe(true);
    expect(() => assertHost("host", CHAT)).not.toThrow();
  });

  test("a member is refused with the not_host code", () => {
    expect(isHost("member")).toBe(false);
    const err = thrown(() => assertHost("member", CHAT));
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });
});

describe("assertAuthorOrHost — edit/delete gate", () => {
  test("the host overrides any slot, including a character-authored row", () => {
    expect(() =>
      assertAuthorOrHost({ role: "host", principalUserId: ALICE, authorUserId: BOB }, CHAT),
    ).not.toThrow();
    expect(() =>
      assertAuthorOrHost({ role: "host", principalUserId: ALICE, authorUserId: null }, CHAT),
    ).not.toThrow();
  });

  test("a member may act on their own slot", () => {
    expect(() =>
      assertAuthorOrHost({ role: "member", principalUserId: ALICE, authorUserId: ALICE }, CHAT),
    ).not.toThrow();
  });

  test("a member is refused another member's slot", () => {
    const err = thrown(() =>
      assertAuthorOrHost({ role: "member", principalUserId: ALICE, authorUserId: BOB }, CHAT),
    );
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("a null-authored slot is host-only for a member", () => {
    expect(() =>
      assertAuthorOrHost({ role: "member", principalUserId: ALICE, authorUserId: null }, CHAT),
    ).toThrow(ChatOperationError);
  });
});

describe("lineage gating is per-ancestor (a fork grants no parent membership)", () => {
  test("each ancestor's membership is decided independently", () => {
    const memberAncestor = { role: "member" } as const;
    expect(() => assertParticipant(memberAncestor, castId<ChatId>("chat_a"))).not.toThrow();
    expect(() => assertParticipant(undefined, castId<ChatId>("chat_b"))).toThrow(ChatNotFoundError);
  });
});
