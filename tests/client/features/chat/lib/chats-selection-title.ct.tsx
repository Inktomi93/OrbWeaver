// CT: `useChatsSelectionTitle` — what the MOBILE topbar calls the open room. A hook, so it is driven
// through a probe component under the real data layer, over the REAL `#state` active-chat pointer
// (`selectChat`, the exact action the chats list fires).
//
// IT HAD TWO ARMS AND THEY DRIFTED (side-eye 2026-08-07 finding 1): the DRAFT arm read `cast[0]?.data?.name`
// while the desktop cluster joined the whole cast, so a three-hander read "Aldric Vane" on the phone. Both
// arms were made to call one function — and then draft mode was deleted outright
// (chat-creation-draft-mode-replacement.md §4.1, R1), so there is ONE arm and nothing left to drift: a room
// has a chat row, and the row's title is the answer.
//
// This is a DATA statement, not a layout one, so it needs no coarse emulation: the topbar prints the same
// string at every width and the phone's only extra is that `truncate` may clip it — which is a geometry
// fact about the topbar, not about the title this hook returns.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatsSelectionTitleStory } from "../_ct-stories.tsx";

test("the open room's stored title IS the mobile screen title", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": { title: "The Ashfall Road", participants: [], cast: [] } });

  await mount(<ChatsSelectionTitleStory />);

  // The PAGE locator: `CtDataProviders` renders the probe outside the mount's component wrapper.
  await expect(page.getByTestId("selection-title")).toHaveText("The Ashfall Road");
});

test("an UNTITLED room yields null — the shell prints the section label rather than an invented name", async ({ mount, page }) => {
  // Stored titles are "" until renamed; the mobile topbar must not print an empty string OR a fabricated
  // one. `null` is the honest answer, and the shell's own fallback takes it from there.
  await routeTrpc(page, { "chat.getChat": { title: "", participants: [], cast: [] } });

  await mount(<ChatsSelectionTitleStory />);

  await expect(page.getByTestId("selection-title")).toHaveText("(null)");
});
