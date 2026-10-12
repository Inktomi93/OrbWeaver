// chat-list-filter store CT — drives the hook-backed store through its module actions and asserts the read
// hook reflects each transition (the character hero "N chats ›" → filtered Chats LIST seam). A CT (not a
// plain unit test) because the store's only read surface is the reactive `useChatListCharacterFilter` hook —
// useSyncExternalStore needs a real browser render (the character-selection-store.ct.tsx posture).

import { expect, test } from "@playwright/experimental-ct-react";
import { ChatListFilterProbe, ChatListNarrowingProbe } from "./_ct-stories.tsx";

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

// #490 — the SEARCH and MONTH axes joined this store. They lived in `ChatListSurface`'s `useState`, and the
// LIST CHROME BAND (a sibling shell region, no shared React ancestor — the exact seam this store was minted
// for) therefore could not see them: the band printed `CHATS 896` over twelve narrowed rows and over "No
// matches". Same posture as the character filter above: the read surface is a reactive hook, so a CT.
test("#490 search and month set + clear independently, and neither disturbs the other", async ({ mount }) => {
  const probe = await mount(<ChatListNarrowingProbe />);
  const state = probe.locator("output");
  await expect(state).toHaveText("search=none month=none");

  await probe.getByRole("button", { name: "type a search" }).click();
  await expect(state).toHaveText("search=tamsin month=none");

  // The two axes compose — narrowing by month must not drop the search the pane is still showing.
  await probe.getByRole("button", { name: "anchor a month" }).click();
  await expect(state).toHaveText("search=tamsin month=2026-06");

  await probe.getByRole("button", { name: "clear the search" }).click();
  await expect(state).toHaveText("search=none month=2026-06");

  await probe.getByRole("button", { name: "clear the month" }).click();
  await expect(state).toHaveText("search=none month=none");
});
