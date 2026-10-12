import type { BlockKey, MemoryQueryOptions, MemoryRetrievalMode } from "@orb/contracts/search";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

// `BlockKey` and `MemoryQueryOptions` are plain interfaces with no schema, so their shape is a compile-time contract.

// `scopedCharacterId` is ALWAYS a real `CharacterId` (inv 8): the synthetic group-as-character for the shared
// bucket (solo/merged/narrator), a cast character for scoped. There is no `''` sentinel and no null.
test("BlockKey is (chatId, tier, blockIdx, scopedCharacterId) with a real CharacterId and no sentinel", () => {
  expectTypeOf<BlockKey>().toEqualTypeOf<{ chatId: ChatId; tier: number; blockIdx: number; scopedCharacterId: CharacterId }>();
});

test("MemoryQueryOptions scopes by chat first-class, takes optional candidates and egocentric text, and carries flat retrieval knobs", () => {
  // Chat scope is first-class (not collapsed to owner): the scope nests the chat id directly.
  expectTypeOf<MemoryQueryOptions["scope"]>().toEqualTypeOf<{ chat: ChatId }>();
  expectTypeOf<MemoryQueryOptions["ownerId"]>().toEqualTypeOf<UserId>();
  expectTypeOf<MemoryQueryOptions["mode"]>().toEqualTypeOf<MemoryRetrievalMode>();
  // The retrieval cut and the mixC rerank cut ride the wire as flat knobs.
  expectTypeOf<MemoryQueryOptions["retrieveK"]>().toEqualTypeOf<number>();
  expectTypeOf<MemoryQueryOptions["rerankTo"]>().toEqualTypeOf<number>();
  // Candidates, query text and the scoped bucket are optional: the full-pool and owner-wide scans omit them.
  expectTypeOf<MemoryQueryOptions["candidates"]>().toEqualTypeOf<BlockKey[] | undefined>();
  expectTypeOf<MemoryQueryOptions["queryText"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<MemoryQueryOptions["scopedCharacterId"]>().toEqualTypeOf<CharacterId | undefined>();
  expectTypeOf<Pick<MemoryQueryOptions, "candidates" | "queryText" | "scopedCharacterId">>().toEqualTypeOf<{
    candidates?: BlockKey[] | undefined;
    queryText?: string | undefined;
    scopedCharacterId?: CharacterId | undefined;
  }>();
});
