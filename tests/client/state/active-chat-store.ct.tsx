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

  // Landing: an empty draft, no seed, the first session key.
  await expect(state).toHaveText("handle=draft:draft-1 session=draft-1 seed=none");

  // A blank new chat → a fresh draft + a NEW session key (so the composer remounts clean).
  await probe.getByRole("button", { name: "new blank" }).click();
  await expect(state).toHaveText("handle=draft:draft-2 session=draft-2 seed=none");

  // A seeded new chat (the character-library "start chat with X") → the roster rides on the draft.
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText("handle=draft:draft-3 session=draft-3 seed=char_probe_aria");
});

test("commitDraft promotes the handle WITHOUT changing sessionKey (no mid-turn remount)", async ({
  mount,
}) => {
  const probe = await mount(<ActiveChatStoreProbe />);
  const state = probe.locator("output");

  // Seed a draft (session=draft-2 after one new-chat click).
  await probe.getByRole("button", { name: "new with aria" }).click();
  await expect(state).toHaveText("handle=draft:draft-2 session=draft-2 seed=char_probe_aria");

  // First send commits the draft → the handle flips to committed, but the session key is UNCHANGED
  // (the whole point — the surface must not remount while the first generation is streaming).
  await probe.getByRole("button", { name: "commit draft" }).click();
  await expect(state).toHaveText(
    "handle=committed:chat_probe_commit session=draft-2 seed=char_probe_aria",
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
    "handle=committed:chat_probe_select session=chat_probe_select seed=none",
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
    "handle=committed:chat_probe_select session=chat_probe_select seed=none",
  );
});
