// contract/params — the §7.5 dispatch axes (SOURCE_KINDS / TEXT_LENSES) are the canonical `as const`
// tuples; SourceKind / SourceLens derive from them. This pins the membership (incl. the memory chat-block
// additions — `chat-block` kind, `segment` / `digest` lenses, knowledge-cluster §1/§2) so the store
// switch's exhaustive dispatch + the db lens columns stay in lockstep with the one home.
//
// The PD-34 `StoreParams` arms (DigestStoreParams / SegmentStoreParams) are PURE TS interfaces — there is
// no zod schema to parse through, so their write shape is already `tsc`-enforced at every real producer;
// a runtime "build a literal, assert its own fields back" block would be a tautology (no production call in
// the loop) with zero coverage `tsc` doesn't already give. Removed 2026-07-10 (test-quality-review §7 R8).

import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { SourceKind, SourceLens } from "../../../../../packages/server/src/domain/embeddings/contract/params.ts";
import { SOURCE_KINDS, SOURCE_LENSES, TEXT_LENSES } from "../../../../../packages/server/src/domain/embeddings/contract/params.ts";
import { expect, test } from "../../../../support/fixtures";

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
