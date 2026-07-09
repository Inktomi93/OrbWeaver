// parseChatMetadata + getGroupConfig/getRoomOverrides — the `chats.metadata` parse seam (chat.md Part I
// §metadata + the "metadata strict/lazy-parse fault isolation" load-bearing rule). The ONE file in the chat
// contract slice with runtime behavior. Pins: full round-trip (group + roomOverrides + opening +
// providerRouting), the per-sub-blob fault isolation (a malformed sub-blob does NOT nuke its siblings), the
// providerRouting LEAF sub-parse (leaves to connection), and the default-applying accessors. Plus a few
// compile-time shape pins for representative param/result/view types.

import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  getGroupConfig,
  getRoomOverrides,
  parseChatMetadata,
} from "../../../../../packages/server/src/domain/chat/contract/metadata.ts";
import type {
  CreateInviteParams,
  RedeemInviteParams,
  SendParams,
} from "../../../../../packages/server/src/domain/chat/contract/params.ts";
import type {
  CreateInviteResult,
  TurnOutcome,
} from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import type { ChatSummary } from "../../../../../packages/server/src/domain/chat/contract/views.ts";
import { expect, test } from "../../../../support/fixtures";

describe("parseChatMetadata", () => {
  test("round-trips a full metadata blob (group + roomOverrides + opening + providerRouting)", () => {
    const raw = {
      group: { output: "per-speaker", policy: "list" },
      roomOverrides: { scenario: "a tavern at dusk", mainPrompt: "stay in character" },
      opening: "greet-all",
      providerRouting: { order: ["Anthropic"], sort: "price" },
    };
    const parsed = parseChatMetadata(raw);

    // group is parsed AND fully-defaulted (the lenient input fills the omitted knobs).
    expect(parsed.group?.output).toBe("per-speaker");
    expect(parsed.group?.policy).toBe("list");
    expect(parsed.group?.output === "per-speaker" ? parsed.group.cardScope : undefined).toBe(
      "merged",
    );
    expect(parsed.roomOverrides).toEqual({
      scenario: "a tavern at dusk",
      mainPrompt: "stay in character",
    });
    expect(parsed.opening).toBe("greet-all");
    // providerRouting LEAVES to the connection sub-parse — extracted verbatim.
    expect(parsed.providerRouting).toEqual({ order: ["Anthropic"], sort: "price" });
  });

  test("an empty / absent blob parses to all-absent sub-blobs", () => {
    expect(parseChatMetadata(null)).toEqual({});
    expect(parseChatMetadata(undefined)).toEqual({});
    expect(parseChatMetadata({})).toEqual({});
    expect(parseChatMetadata("not-an-object")).toEqual({});
  });

  test("FAULT ISOLATION: a malformed sub-blob does NOT nuke its siblings", () => {
    const raw = {
      group: { output: "bogus-discriminator" }, // fails the discriminated union
      roomOverrides: { scenario: "survives" }, // valid
      opening: "greet-all", // valid
    };
    const parsed = parseChatMetadata(raw);
    expect(parsed.group).toBeUndefined(); // the bad sub-blob heals to absent
    expect(parsed.roomOverrides).toEqual({ scenario: "survives" }); // the sibling is intact
    expect(parsed.opening).toBe("greet-all");
  });

  test("a stray key fails the strict roomOverrides sub-blob (isolated to undefined)", () => {
    const parsed = parseChatMetadata({ roomOverrides: { notAField: 1 } });
    expect(parsed.roomOverrides).toBeUndefined();
  });

  test("a corrupt providerRouting sub-blob heals to absent (never throws)", () => {
    expect(parseChatMetadata({ providerRouting: "nope" }).providerRouting).toBeUndefined();
    expect(parseChatMetadata({ providerRouting: 42 }).providerRouting).toBeUndefined();
  });
});

describe("getGroupConfig / getRoomOverrides", () => {
  test("return the canonical defaults for an absent / corrupt blob", () => {
    expect(getGroupConfig(null)).toEqual(DEFAULT_GROUP_CONFIG);
    expect(getGroupConfig({ group: { output: "bogus" } })).toEqual(DEFAULT_GROUP_CONFIG);
    expect(getRoomOverrides(null)).toEqual(DEFAULT_ROOM_OVERRIDES);
    expect(getRoomOverrides({ roomOverrides: { strayKey: true } })).toEqual(DEFAULT_ROOM_OVERRIDES);
  });

  test("return the parsed sub-blob when present + valid", () => {
    const group = getGroupConfig({ group: { output: "narrator", policy: "natural" } });
    expect(group.output).toBe("narrator");
    expect(getRoomOverrides({ roomOverrides: { postHistory: "jailbreak text" } })).toEqual({
      postHistory: "jailbreak text",
    });
  });
});

// ── Representative compile-time shape pins (param / result / view) ─────────────
// These never run a meaningful assertion — they exist so a drift in a representative contract shape is a
// `tsc` error in the test build (the contract is the API verb-impl chunks build against).
describe("representative contract shapes", () => {
  test("param / result / view literals satisfy their contracts", () => {
    const sendParams = {
      principal: {
        userId: "u_1" as UserId,
        role: "user",
        handle: "alex" as never,
        externalId: null,
        via: "cookie",
      },
      chatId: "chat_1" as ChatId,
      content: "hello",
    } satisfies SendParams;

    const outcome = {
      messages: [],
      aborted: false,
    } satisfies TurnOutcome;

    const summary = {
      id: "chat_1" as ChatId,
      title: null,
      star: false,
      archived: false,
      parentChatId: null,
      lastMessageAt: null,
      messageCount: 0,
      participantNames: [],
      participantCharacterIds: [],
      createdAt: 0,
      updatedAt: 0,
    } satisfies ChatSummary;

    // Invite / membership-lifecycle param shapes (the chokepoint surface — Part III §2).
    const createInvite = {
      principal: sendParams.principal,
      chatId: "chat_1" as ChatId,
      input: {},
    } satisfies CreateInviteParams;

    const redeemInvite = {
      principal: sendParams.principal,
      input: { token: "raw-token" },
    } satisfies RedeemInviteParams;

    expect(sendParams.content).toBe("hello");
    expect(outcome.aborted).toBe(false);
    expect(summary.id).toBe("chat_1");
    expect(createInvite.input).toEqual({});
    expect(redeemInvite.input.token).toBe("raw-token");
    // `MessageId` + `CreateInviteResult` are referenced as type-only pins (heavy shapes not constructed).
    const _mid: MessageId | null = null;
    const _cir: CreateInviteResult | null = null;
    expect(_mid).toBeNull();
    expect(_cir).toBeNull();
  });
});
