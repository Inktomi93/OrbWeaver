// The memory view's status follows the room's switches, the build's own aged-out rule and the caller's floor, and the
// strike input refuses a key whose hash is not a stored content hash.
import { memoryOffReason, memoryViewStatus, strikeMemoryInputSchema } from "@orb/contracts/chat";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ROOM = { maxSeq: 20, verbatimWindow: 8, blockSize: 8, storedItems: 0, listedItems: 0 } as const;

test("the app switch outranks the host's", () => {
  expect(memoryOffReason({ appModeOff: true, hostEnabled: false })).toBe("app-off");
  expect(memoryOffReason({ appModeOff: false, hostEnabled: false })).toBe("host-off");
  expect(memoryOffReason({ appModeOff: false, hostEnabled: true })).toBeNull();
});

test("a caller whose floor hides every stored summary is told so, not that memory is still pending", () => {
  expect(memoryViewStatus({ ...ROOM, storedItems: 3, listedItems: 3 })).toEqual({ kind: "ready" });
  expect(memoryViewStatus({ ...ROOM, storedItems: 3, listedItems: 0 })).toEqual({ kind: "before-your-history" });
});

test("a chat is too short until a whole block sits outside the protected window, then waits for its first summary", () => {
  expect(memoryViewStatus({ ...ROOM, maxSeq: 15 })).toEqual({ kind: "too-short" });
  expect(memoryViewStatus({ ...ROOM, maxSeq: 16 })).toEqual({ kind: "pending" });
});

test("a strike key carries a stored content hash, and anything else is refused", () => {
  const ids = createSeededIds();
  const item = { tier: 0, blockIdx: 1, scopedCharacterId: mintTypeId(ID_PREFIX.character, ids.next), contentHash: "a".repeat(64) };
  expect(strikeMemoryInputSchema.parse({ item })).toEqual({ item });
  expect(strikeMemoryInputSchema.safeParse({ item: { ...item, contentHash: "not-a-hash" } }).success).toBe(false);
  expect(strikeMemoryInputSchema.safeParse({ item: { ...item, tier: -1 } }).success).toBe(false);
});
