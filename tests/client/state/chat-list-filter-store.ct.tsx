// chat-list-filter store CT — drives the hook-backed store through its module actions and asserts the read
// hook reflects each transition (the character hero "N chats ›" → filtered Chats LIST seam). A CT (not a
// plain unit test) because the store's only read surface is the reactive `useChatListCharacterFilter` hook —
// useSyncExternalStore needs a real browser render (the character-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { ChatListFilterProbe } from "./_ct-stories";

test("set applies the character filter; clear resets to the full list", async ({ mount }) => {
  const probe = await mount(<ChatListFilterProbe />);
  const state = probe.locator("output");
  // Fresh page → no filter (the Chats LIST shows every chat).
  await expect(state).toHaveText("filter=none");

  await probe.getByRole("button", { name: "set filter" }).click();
  // The stored value carries the id AND the name (the "filtered by [name] ✕" chip label).
  await expect(state).toHaveText("filter=char_ct_filter:Aria");

  await probe.getByRole("button", { name: "clear filter" }).click();
  await expect(state).toHaveText("filter=none");
});
