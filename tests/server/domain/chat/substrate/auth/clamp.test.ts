// The per-member visibility clamps: the D22 member-card field clamp (chat.md Part III §7/§11) and the D16
// `joinHistoryVisibility` canon floor (bottom of this file).
import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, MemberCardView, MemberCardVisibility, MessageView } from "@orb/contracts/chat";
import type { AssetId, CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  clampMemberCard,
  isBelowHistoryFloor,
  NO_HISTORY_FLOOR,
  resolveCardVisibility,
  resolveHistoryFloorSeq,
} from "../../../../../../packages/server/src/domain/chat/substrate/auth";
import { expect, test } from "../../../../../support/fixtures";

const CHAR = castId<CharacterId>("character_aria");
const AVATAR = castId<AssetId>("asset_aria");
const AVATAR_HASH = "hash_aria";

// A fully-populated canonical card — every clampable field set, so a null in the output means "clamped out".
const FULL_CARD: CharacterCard = {
  name: "Aria",
  description: "a desc",
  personality: "curious",
  scenario: "a tavern",
  greetings: [{ text: "hello" }],
  exampleMessages: "ex",
  systemPrompt: "sys",
  postHistoryInstructions: "jb",
  depthPrompt: { depth: 4, prompt: "note" },
  creatorNotes: "notes",
  creator: "nate",
  cardVersion: "1.0",
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  regexScripts: [],
  extensions: null,
  residualData: null,
  avatarAssetId: AVATAR,
  refinery: null,
};

const TAGS = ["fantasy", "rogue"];
const LORE = ["lore entry"];

function clampAt(visibility: MemberCardVisibility): MemberCardView {
  return clampMemberCard({
    characterId: CHAR,
    card: FULL_CARD,
    tags: TAGS,
    lore: LORE,
    avatarHash: AVATAR_HASH,
    visibility,
  });
}

describe("clampMemberCard — each level reveals exactly its fields", () => {
  test("name-avatar: only the floor (name + avatar)", () => {
    const v = clampAt("name-avatar");
    expect(v.name).toBe("Aria");
    expect(v.avatarAssetId).toBe(AVATAR);
    expect(v.avatarHash).toBe(AVATAR_HASH);
    expect(v.description).toBeNull();
    expect(v.tags).toBeNull();
    expect(v.lore).toBeNull();
    expect(v.systemPrompt).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("sheet: presentable identity, but no lore and no internals", () => {
    const v = clampAt("sheet");
    expect(v.description).toBe("a desc");
    expect(v.personality).toBe("curious");
    expect(v.scenario).toBe("a tavern");
    expect(v.greetings).toEqual(["hello"]);
    expect(v.exampleMessages).toBe("ex");
    expect(v.tags).toEqual(TAGS);
    expect(v.creatorNotes).toBe("notes");
    expect(v.lore).toBeNull();
    expect(v.systemPrompt).toBeNull();
    expect(v.postHistoryInstructions).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("sheet+lore: adds the rendered world-info, still no internals", () => {
    const v = clampAt("sheet+lore");
    expect(v.lore).toEqual(LORE);
    expect(v.description).toBe("a desc");
    expect(v.systemPrompt).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("full: the prompt-steering internals are revealed", () => {
    const v = clampAt("full");
    expect(v.systemPrompt).toBe("sys");
    expect(v.postHistoryInstructions).toBe("jb");
    expect(v.authorsNoteDepth).toBe(4);
    expect(v.lore).toEqual(LORE);
    expect(v.tags).toEqual(TAGS);
    // avatarHash is the always-present floor (never clamped by visibility) — same as avatarAssetId.
    expect(v.avatarHash).toBe(AVATAR_HASH);
  });

  test("the projection echoes the level it was clamped to", () => {
    expect(clampAt("sheet").visibility).toBe("sheet");
    expect(clampAt("full").visibility).toBe("full");
  });
});

describe("resolveCardVisibility — the host always sees full", () => {
  test("host → full regardless of the configured level; a member → the configured level", () => {
    expect(resolveCardVisibility("host", "name-avatar")).toBe("full");
    expect(resolveCardVisibility("host", "sheet")).toBe("full");
    expect(resolveCardVisibility("member", "sheet")).toBe("sheet");
    expect(resolveCardVisibility("member", "name-avatar")).toBe("name-avatar");
  });
});

// ── The D16 join-history floor (the second clamp in this module) ───────────────────────────────────────
// `joinHistoryVisibility` is persisted `.notNull().default("full")` — an invited member sees the room's whole
// history by default, and `from-join` is the host's OPT-IN per-participant restriction. The mechanism was
// once persisted but NEVER read by any code path: a `from-join` member invited at seq 7 still received the
// entire pre-join transcript AND a full durable-event replay.
// These pin the pure half — the floor number and the per-bus-event verdict; the read paths that consume
// them are pinned in `verbs/read.int.test.ts` and `verbs/fork.int.test.ts`.

describe("resolveHistoryFloorSeq — the persisted policy becomes a canon floor", () => {
  // The floor is INCLUSIVE: floor 7 admits seq 7 (the row AT the member's join) and withholds only seq < 7 —
  // pinned on the verdict side by the `viewAt(7)` / `deltaFor(7)` cases below.
  test("from-join floors at the member's OWN joinSeq; full is unclamped", () => {
    expect(resolveHistoryFloorSeq({ joinSeq: 7, joinHistoryVisibility: "from-join" })).toBe(7);
    expect(resolveHistoryFloorSeq({ joinSeq: 7, joinHistoryVisibility: "full" })).toBe(NO_HISTORY_FLOOR);
  });

  test("a born-here seat (joinSeq 0) is unclamped under EITHER policy — the default never clamps a founder", () => {
    expect(resolveHistoryFloorSeq({ joinSeq: 0, joinHistoryVisibility: "from-join" })).toBe(NO_HISTORY_FLOOR);
    expect(resolveHistoryFloorSeq({ joinSeq: 0, joinHistoryVisibility: "full" })).toBe(NO_HISTORY_FLOOR);
  });
});

describe("isBelowHistoryFloor — the ONE verdict both the durable replay and the live fan-out ask", () => {
  const chatId = castId<ChatId>("chat_room");
  const messageId = castId<MessageId>("message_x");
  const viewAt = (seq: number): MessageView => ({ seq }) as unknown as MessageView; // FABRICATION-OK: only `.seq` is read by the verdict.
  /** A streamed token chunk anchored to the canon slot it is filling (`slotSeq` — stamped by the engine's
   *  ONE emit site from the target it already resolved: the loaded slot for swipe/continue, `maxSeq + 1` for
   *  a new slot). This anchor is what makes raw transcript text decidable at all. */
  const deltaFor = (slotSeq: number): ChatBusEvent => ({ type: "delta", chatId, slotSeq, delta: { chatId, kind: "text", text: "secret tokens" } });

  test("an unclamped caller (floor 0) is never withheld anything — including raw deltas", () => {
    expect(isBelowHistoryFloor(deltaFor(1), NO_HISTORY_FLOOR)).toBe(false);
    expect(isBelowHistoryFloor({ type: "messageCommitted", chatId, messageId, view: viewAt(1) }, NO_HISTORY_FLOOR)).toBe(false);
  });

  test("a view-carrying event is decided on the view's own seq (below floor = withheld, at floor = kept)", () => {
    expect(isBelowHistoryFloor({ type: "messageCommitted", chatId, messageId, view: viewAt(6) }, 7)).toBe(true);
    expect(isBelowHistoryFloor({ type: "messageCommitted", chatId, messageId, view: viewAt(7) }, 7)).toBe(false);
    expect(isBelowHistoryFloor({ type: "messageEdited", chatId, messageId, view: viewAt(2) }, 7)).toBe(true);
    // The case a cursor clamp alone cannot catch: a POST-join EDIT of a PRE-join row rides a high durable
    // seq with a low view seq — the content is still pre-join, so the verdict is content-keyed.
    expect(isBelowHistoryFloor({ type: "reasoningEdited", chatId, messageId, view: viewAt(1) }, 7)).toBe(true);
  });

  test("a delta is decided on its target SLOT's seq — pre-join tokens withheld, post-join tokens DELIVERED", () => {
    // THE LEAK, closed: the host swipes/continues a PRE-join slot, so its tokens stream below the floor.
    expect(isBelowHistoryFloor(deltaFor(2), 7)).toBe(true);
    expect(isBelowHistoryFloor(deltaFor(6), 7)).toBe(true);
    // THE RESTORATION: a turn writing at/above the caller's own join floor streams to them (the floor is
    // INCLUSIVE — slot 7 at floor 7 is delivered). Blanket-withholding here un-streams a host-restricted
    // member for a whole live turn they are entitled to watch.
    expect(isBelowHistoryFloor(deltaFor(7), 7)).toBe(false);
    expect(isBelowHistoryFloor(deltaFor(8), 7)).toBe(false);
  });

  test("id-only + room-lifecycle payloads carry no canon content, so they ride through a clamp", () => {
    expect(isBelowHistoryFloor({ type: "messageCommitted", chatId, messageId }, 7)).toBe(false);
    expect(isBelowHistoryFloor({ type: "messagesDeleted", chatId, messageIds: [messageId] }, 7)).toBe(false);
    expect(isBelowHistoryFloor({ type: "chatUpdated", chatId }, 7)).toBe(false);
  });
});
