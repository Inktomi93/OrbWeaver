// active-chat-store CT — drives the hook-backed active-chat store through its module actions and
// asserts the read hooks reflect each transition, with THE KEY DISCIPLINE (state/active-chat-store.ts)
// as the load-bearing assertion: `sessionKey` is STABLE across a draft→committed promotion
// (`commitDraft`), so the route never remounts <ChatRoomSurface> mid-first-turn; it changes only on
// new-chat / select. Same probe posture as shell-store.ct.tsx (the store's read API is hook-only, so a
// browser render is the way to exercise it). Each test gets a fresh page → the module session counter
// restarts, so the `draft-N` keys are deterministic.

import { expect, test } from "@playwright/experimental-ct-react";
import { ActiveChatStoreProbe } from "./_ct-stories";

test("new-chat mints a fresh sessionKey each time and carries the roster seed", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // At rest: the LANDING handle (nothing selected — J1), no seed, the first session key.
  await expect(state).toHaveText("handle=landing session=draft-1 seed=none mobileSheet=none");

  // A blank new chat → a fresh draft + a NEW session key (so the composer remounts clean).
  await probe.getByRole("button", { name: "new blank" }).click();
  await expect(state).toHaveText("handle=draft:draft-2 session=draft-2 seed=none mobileSheet=none");

  // A seeded new chat (the character-library "start chat with X") → the roster rides on the draft.
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText(
    "handle=draft:draft-3 session=draft-3 seed=char_probe_aria mobileSheet=none",
  );
});

test("commitDraft promotes the handle WITHOUT changing sessionKey (no mid-turn remount)", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // Seed a draft (session=draft-2 after one new-chat click).
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText(
    "handle=draft:draft-2 session=draft-2 seed=char_probe_aria mobileSheet=none",
  );

  // First send commits the draft → the handle flips to committed, but the session key is UNCHANGED
  // (the whole point — the surface must not remount while the first generation is streaming).
  await probe.getByRole("button", { name: "commit draft" }).click();
  await expect(state).toHaveText(
    "handle=committed:chat_probe_commit session=draft-2 seed=char_probe_aria mobileSheet=none",
  );
});

test("selectChat makes an existing chat active and keys the slot by its chat id", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select chat" }).click();
  // A committed handle, the seed cleared, and the session key IS the chat id (so re-selecting the same
  // chat is idempotent and switching chats naturally remounts the slot).
  await expect(state).toHaveText(
    "handle=committed:chat_probe_select session=chat_probe_select seed=none mobileSheet=none",
  );
});

test("commitDraft is a no-op once the active chat is already committed", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select chat" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_select");

  // The active chat is no longer a draft → commitDraft must not clobber it (the guard).
  await probe.getByRole("button", { name: "commit draft" }).click();
  await expect(state).toHaveText(
    "handle=committed:chat_probe_select session=chat_probe_select seed=none mobileSheet=none",
  );
});

test("commitDraft for a stale draft does NOT hijack a NEWER active draft", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // Draft A (session=draft-2) is in flight…
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText(
    "handle=draft:draft-2 session=draft-2 seed=char_probe_aria mobileSheet=none",
  );

  // …the user starts a NEW chat (draft B, session=draft-3) before A's first send resolves.
  await probe.getByRole("button", { name: "new blank" }).click();
  await expect(state).toHaveText("handle=draft:draft-3 session=draft-3 seed=none mobileSheet=none");

  // A's late-resolving commit fires for draftKey draft-2 — the guard MUST reject it (draft-3 is active
  // now), or the handle would flip to chat A while sessionKey stays draft B's (the split-brain hijack).
  await probe.getByRole("button", { name: "commit stale draft-2", exact: true }).click();
  await expect(state).toHaveText("handle=draft:draft-3 session=draft-3 seed=none mobileSheet=none");
});

test("commitDraft for a stale draft does NOT hijack the landing state", async ({ mount }) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // Draft A (session=draft-2) is in flight…
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText(
    "handle=draft:draft-2 session=draft-2 seed=char_probe_aria mobileSheet=none",
  );

  // …the user closes it back to landing (session=draft-3) before A's first send resolves.
  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing session=draft-3 seed=none mobileSheet=none");

  // A's late-resolving commit fires for draftKey draft-2 — the guard MUST reject it (landing is not a
  // draft), or the user would be teleported out of landing into chat A they navigated away from.
  await probe.getByRole("button", { name: "commit stale draft-2", exact: true }).click();
  await expect(state).toHaveText("handle=landing session=draft-3 seed=none mobileSheet=none");
});

test("goToLanding returns to the landing handle with a fresh session key (J1)", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // Open a chat (session keyed by its id)…
  await probe.getByRole("button", { name: "select chat" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_select");

  // …then close it: the handle returns to landing + a fresh session key (so a later new-chat/select
  // remounts a clean slot). The delete-of-the-active-chat + brand/home affordance both land here.
  await probe.getByRole("button", { name: "go landing" }).click();
  await expect(state).toHaveText("handle=landing session=draft-2 seed=none mobileSheet=none");
});

test("selectChatFromList selects the chat AND closes the mobile list sheet (dual-write)", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "open list sheet" }).click();
  await expect(state).toContainText("mobileSheet=list");

  await probe.getByRole("button", { name: "select from list" }).click();
  await expect(state).toHaveText(
    "handle=committed:chat_probe_list session=chat_probe_list seed=none mobileSheet=none",
  );
});

test("chatDeletedFromList is a no-op unless the deleted chat IS the active one", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "select from list" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_list");

  // A different chat got deleted elsewhere — the active room must NOT be yanked to landing.
  await probe.getByRole("button", { name: "delete other chat" }).click();
  await expect(state).toContainText("handle=committed:chat_probe_list");

  // The ACTIVE chat got deleted — return to landing so the room never points at a dropped chat.
  await probe.getByRole("button", { name: "delete active chat" }).click();
  await expect(state).toContainText("handle=landing");
});
