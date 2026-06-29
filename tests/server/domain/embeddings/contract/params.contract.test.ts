// contract/params — the §7.5 dispatch axes (SOURCE_KINDS / TEXT_LENSES) are the canonical `as const`
// tuples; SourceKind / SourceLens derive from them. This pins the membership (incl. the memory chat-block
// additions — `chat-block` kind, `segment` / `digest` lenses, knowledge-cluster §1/§2) so the store
// switch's exhaustive dispatch + the db lens columns stay in lockstep with the one home. Also pins the new
// PD-34 StoreParams arms (DigestStoreParams / SegmentStoreParams) — the typed write surface the memory
// rework persists + the §3 recall reads back (`text` + the §2 facets; scopedCharacterId is a real
// CharacterId, inv 8 — no `''` sentinel).

import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";
import type {
  DigestStoreParams,
  SegmentStoreParams,
  SourceKind,
  SourceLens,
  StoreParams,
} from "../../../../../packages/server/src/domain/embeddings/contract/params.ts";
import {
  SOURCE_KINDS,
  SOURCE_LENSES,
  TEXT_LENSES,
} from "../../../../../packages/server/src/domain/embeddings/contract/params.ts";

const SAMPLE_CHAT_ID = castId<ChatId>("chat_sample");
const SAMPLE_CHARACTER_ID = castId<CharacterId>("character_sample");

test("SOURCE_KINDS is exactly [card, avatar, chat-block] (the producer-class axis)", () => {
  expect([...SOURCE_KINDS]).toEqual(["card", "avatar", "chat-block"]);
  // The tuple derives the union (no duplicate members; no inline re-spell).
  const all: SourceKind[] = [...SOURCE_KINDS];
  expect(new Set(all).size).toBe(SOURCE_KINDS.length);
});

test("TEXT_LENSES is exactly [card-text, segment, digest]; SOURCE_LENSES = text ++ IMAGE_LENSES", () => {
  expect([...TEXT_LENSES]).toEqual(["card-text", "segment", "digest"]);
  // SOURCE_LENSES derives from TEXT_LENSES + the canonical IMAGE_LENSES (never re-spelled).
  expect([...SOURCE_LENSES]).toEqual([...TEXT_LENSES, ...IMAGE_LENSES]);
  const all: SourceLens[] = [...SOURCE_LENSES];
  expect(new Set(all).size).toBe(SOURCE_LENSES.length);
});

test("DigestStoreParams pins the §2b digest write shape (text + facets + real-CharacterId scope)", () => {
  const digest: DigestStoreParams = {
    kind: "chat-block",
    lens: "digest",
    chatId: SAMPLE_CHAT_ID,
    scopedCharacterId: SAMPLE_CHARACTER_ID,
    isGroup: false,
    tier: 0,
    blockIdx: 3,
    text: "[Alice, Bob — the docks] Alice agreed to smuggle the relic.",
    topicAnchor: "[Alice, Bob — the docks]",
    keywords: ["Alice", "Bob", "relic"],
    contentHash: "h",
    model: "qwen3-embed",
    dim: 1024,
  };
  // The discriminant pair is (kind=chat-block, lens=digest); the arm is a member of the StoreParams union.
  const asParams: StoreParams = digest;
  expect(asParams.lens).toBe("digest");
  expect(digest.kind).toBe("chat-block");
  // scopedCharacterId is a real branded CharacterId — NOT the `''` sentinel (inv 8).
  expect(digest.scopedCharacterId).toBe(SAMPLE_CHARACTER_ID);
  expect(Object.keys(digest).sort()).toEqual(
    [
      "blockIdx",
      "chatId",
      "contentHash",
      "dim",
      "isGroup",
      "keywords",
      "kind",
      "lens",
      "model",
      "scopedCharacterId",
      "text",
      "tier",
      "topicAnchor",
    ].sort(),
  );
});

test("SegmentStoreParams pins the §2a verbatim write shape (text + seq-span)", () => {
  const segment: SegmentStoreParams = {
    kind: "chat-block",
    lens: "segment",
    chatId: SAMPLE_CHAT_ID,
    blockIdx: 3,
    seqStart: 24,
    seqEnd: 31,
    text: "Alice: meet me at the docks.\nBob: I'll bring the relic.",
    contentHash: "h",
    model: "qwen3-embed",
    dim: 1024,
  };
  const asParams: StoreParams = segment;
  expect(asParams.lens).toBe("segment");
  expect(segment.kind).toBe("chat-block");
  expect(Object.keys(segment).sort()).toEqual(
    [
      "blockIdx",
      "chatId",
      "contentHash",
      "dim",
      "kind",
      "lens",
      "model",
      "seqEnd",
      "seqStart",
      "text",
    ].sort(),
  );
});
