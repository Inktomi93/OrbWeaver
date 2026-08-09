// The composer-draft store's BOUNDS — the half of the 2026-08-09 reload-persistence pick that is pure
// logic and therefore belongs in node, not in a browser. The RELOAD itself is the CT's
// (composer-draft-store.ct.tsx): rehydration happens at module init, so only a real `page.reload()` can
// observe it. What is testable here is what the persisted blob is ALLOWED to contain — an unbounded
// scopeKey→text map in an origin-wide ~5MB localStorage is the failure this store must not become.
//
// Exercised through the non-hook `__readComposerDraftsForTest` snapshot (the `recent-models-store.test.ts`
// posture — the reactive `useComposerDraft` needs a React render).

import { __readComposerDraftsForTest, __resetComposerDrafts, COMPOSER_DRAFT_CAP, migrateComposerDraft, setComposerDraft } from "@orb/client/state";
import { beforeEach, describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("composer-draft store", () => {
  beforeEach(() => {
    __resetComposerDrafts(); // reset the module singleton between tests.
  });

  test("an unseen scope has no entry at all (absence, not an empty string)", () => {
    expect(__readComposerDraftsForTest()["never-typed"]).toBeUndefined();
  });

  test("typing then clearing leaves the room with an empty draft in memory", () => {
    setComposerDraft("room-a", "half a sentence");
    expect(__readComposerDraftsForTest()["room-a"]).toBe("half a sentence");
    setComposerDraft("room-a", "");
    expect(__readComposerDraftsForTest()["room-a"]).toBe("");
  });

  test("the touched key is RE-SEATED last — key order is most-recently-typed-last (the cap's eviction order)", () => {
    setComposerDraft("room-a", "a");
    setComposerDraft("room-b", "b");
    setComposerDraft("room-c", "c");
    // Re-typing in the OLDEST room must move it to the front of the eviction queue's safe end, or the cap
    // would drop the room the user is actively working in.
    setComposerDraft("room-a", "a again");
    expect(Object.keys(__readComposerDraftsForTest())).toEqual(["room-b", "room-c", "room-a"]);
  });

  test("migrate carries the text to the new scope key and empties the old one", () => {
    setComposerDraft("draft-key", "in flight");
    migrateComposerDraft("draft-key", "chat-id");
    const drafts = __readComposerDraftsForTest();
    expect(drafts["chat-id"]).toBe("in flight");
    expect(drafts["draft-key"]).toBeUndefined();
  });

  test("migrating a scope with no draft is a no-op (never writes an empty entry at the target)", () => {
    migrateComposerDraft("nothing-here", "chat-id");
    expect(__readComposerDraftsForTest()["chat-id"]).toBeUndefined();
  });

  test("typing in more rooms than the cap keeps every LIVE draft in memory (the cap is a PERSIST bound)", () => {
    for (let i = 0; i < COMPOSER_DRAFT_CAP + 3; i++) {
      setComposerDraft(`room-${i}`, `draft ${i}`);
    }
    // The bound belongs to the persist seam, not to the session: a user with more open rooms than the cap
    // must still see every draft they typed while the tab is alive. What the cap actually drops is asserted
    // against the real stored blob in composer-draft-store.ct.tsx (node has no localStorage).
    expect(Object.keys(__readComposerDraftsForTest())).toHaveLength(COMPOSER_DRAFT_CAP + 3);
    expect(__readComposerDraftsForTest()["room-0"]).toBe("draft 0");
  });
});
