// parseChatMetadata + getGroupConfig/getRoomOverrides — the `chats.metadata` parse seam (chat.md Part I
// §metadata + the "metadata strict/lazy-parse fault isolation" load-bearing rule). The ONE file in the chat
// contract slice with runtime behavior. Pins: full round-trip (group + roomOverrides + opening +
// providerRouting), the per-sub-blob fault isolation (a malformed sub-blob does NOT nuke its siblings), the
// providerRouting LEAF sub-parse (leaves to connection), and the default-applying accessors. Plus a few
// compile-time shape pins for representative param/result/view types.

import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { getGroupConfig, getRoomOverrides, parseChatMetadata } from "../../../../../packages/server/src/domain/chat/contract/metadata.ts";
import type { CreateInviteParams, RedeemInviteParams, SendParams } from "../../../../../packages/server/src/domain/chat/contract/params.ts";
import type { CreateInviteResult, TurnOutcome } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
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
    expect(parsed.group?.output === "per-speaker" ? parsed.group.cardScope : undefined).toBe("merged");
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

  // RETIRED KEY at the REAL read seam (owner ruling 2026-08-01): `authorsNote` left the allowlist — the
  // per-chat author's note is a `chat_injections` row. A blob still CARRYING one is debris (pre-launch, no
  // migration): the strict sub-blob rejects it and `.catch(undefined)` heals the whole roomOverrides slot to
  // absent — field-scoped to that sub-blob, so its metadata SIBLINGS (opening, background, …) survive.
  test("a stored authorsNote is debris: the roomOverrides sub-blob heals to absent, siblings survive", () => {
    const parsed = parseChatMetadata({
      roomOverrides: { scenario: "a quiet tavern", authorsNote: { prompt: "Whisper it.", depth: 1, role: "user" } },
      opening: "greet-all",
    });
    expect(parsed.roomOverrides).toBeUndefined();
    expect(parsed.opening).toBe("greet-all");
    // The pre-#22 bare-string shape is debris too.
    expect(parseChatMetadata({ roomOverrides: { authorsNote: "Keep it tense." } }).roomOverrides).toBeUndefined();
  });

  test("a corrupt providerRouting sub-blob heals to absent (never throws)", () => {
    expect(parseChatMetadata({ providerRouting: "nope" }).providerRouting).toBeUndefined();
    expect(parseChatMetadata({ providerRouting: 42 }).providerRouting).toBeUndefined();
  });

  test("BG-C: the background sub-blob round-trips (source-only) and fills field defaults", () => {
    const parsed = parseChatMetadata({ background: { kind: "external", externalUrl: "https://cdn.example/bg.jpg" } });
    expect(parsed.background).toEqual({
      kind: "external",
      seededId: "",
      externalUrl: "https://cdn.example/bg.jpg",
      assetId: "",
      assetHash: "",
      mime: "",
      provenanceUrl: "",
    });
  });

  test("BG-C: a corrupt background sub-blob heals to absent WITHOUT nuking its siblings (fault isolation)", () => {
    const parsed = parseChatMetadata({ background: 42, roomOverrides: { scenario: "survives" } });
    expect(parsed.background).toBeUndefined();
    expect(parsed.roomOverrides).toEqual({ scenario: "survives" });
    // A per-field failure inside the blob degrades that field, never the whole sub-blob (the themeBackground
    // lenient posture) — a bad kind heals to "none", the rest still parse.
    expect(parseChatMetadata({ background: { kind: "bogus", externalUrl: "https://cdn.example/x.jpg" } }).background).toEqual({
      kind: "none",
      seededId: "",
      externalUrl: "https://cdn.example/x.jpg",
      assetId: "",
      assetHash: "",
      mime: "",
      provenanceUrl: "",
    });
  });

  test("RPG: the opaque {gameId} pointer round-trips (the foreign-schema sync signal, rpg-design/05 §2.1)", () => {
    const gameId = mintTypeId(ID_PREFIX.rpgGame);
    // `engaged` heals to `true` via the schema default (#40 front-door toggle mirror — a pre-toggle pointer
    // with no `engaged` field reads ENGAGED, mirroring `chatRpgPointerSchema`'s `.default(true)`).
    expect(parseChatMetadata({ rpg: { gameId } }).rpg).toEqual({ gameId, engaged: true });
  });

  test("RPG: a corrupt rpg pointer HEALS to absent WITHOUT nuking its siblings (§6.2)", () => {
    // A garbage blob, a wrong-prefix id, and a missing gameId all heal to absent — never throw.
    expect(parseChatMetadata({ rpg: 7, roomOverrides: { scenario: "survives" } }).rpg).toBeUndefined();
    expect(parseChatMetadata({ rpg: 7, roomOverrides: { scenario: "survives" } }).roomOverrides).toEqual({ scenario: "survives" });
    expect(parseChatMetadata({ rpg: { gameId: "not-a-typeid" } }).rpg).toBeUndefined();
    expect(parseChatMetadata({ rpg: { gameId: mintTypeId(ID_PREFIX.chat) } }).rpg).toBeUndefined();
    expect(parseChatMetadata({ rpg: {} }).rpg).toBeUndefined();
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
        handle: "nate" as never,
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
      lastMessagePreview: null,
      isGame: false,
      viewerRole: "host",
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
