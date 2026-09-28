// CT: `useChatsSelectionTitle` — what the MOBILE topbar calls the open room. A hook, so it is driven
// through a probe component under the real data layer, over the REAL `#state` active-chat pointer
// (`selectChat`, the exact action the chats list fires).
//
// IT HAD TWO ARMS AND THEY DRIFTED (side-eye 2026-08-07 finding 1): the DRAFT arm read `cast[0]?.data?.name`
// while the desktop cluster joined the whole cast, so a three-hander read "Aldric Vane" on the phone. Both
// arms were made to call one function — and then draft mode was deleted outright (D166), so there is ONE
// arm and nothing left to drift: a room has a chat row, and the canonical authored-title → character-names
// → untitled chain is its answer.
//
// This is a DATA statement, not a layout one, so it needs no coarse emulation: the topbar prints the same
// string at every width and the phone's only extra is that `truncate` may clip it — which is a geometry
// fact about the topbar, not about the title this hook returns.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatsSelectionTitleStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";
import { makeParticipant } from "./_support.ts";

/** THE ROSTER READ THIS HOOK NOW MAKES (#1676): with no room open the phone's topbar is the only place left
 *  to print the roster's size, so the hook composes the census the LIST band's shed title took with it. Fed
 *  ambiently here — every test below has a room OPEN, where the census is deliberately not the answer, so a
 *  roster of three is the fixture that would EXPOSE a leak of it rather than hide one. */
const ROSTER_OF_THREE: TrpcRoutes<"chat.listChats"> = {
  "chat.listChats": chatListResponder([1, 2, 3].map((n) => makeChatSummary({ id: `chat_ct_title_${String(n)}` }))),
};

test("the open room's stored title IS the mobile screen title", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_OF_THREE, "chat.getChat": { title: "The Ashfall Road", participants: [], identities: [] } });

  await mount(<ChatsSelectionTitleStory />);

  // The PAGE locator: `CtDataProviders` renders the probe outside the mount's component wrapper.
  await expect(page.getByTestId("selection-title")).toHaveText("The Ashfall Road");
});

test("a seeded character names an untitled new room on mobile through the canonical fallback", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...ROSTER_OF_THREE,
    "chat.getChat": { title: "", participants: [makeParticipant({ displayName: "Elias Thorn" })], identities: [] },
  });

  await mount(<ChatsSelectionTitleStory />);

  await expect(page.getByTestId("selection-title")).toHaveText("Elias Thorn");
});

test("a truly blank room uses the canonical untitled fallback instead of the section name or roster census", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_OF_THREE, "chat.getChat": { title: "", participants: [], identities: [] } });

  await mount(<ChatsSelectionTitleStory />);

  await expect(page.getByTestId("selection-title")).toHaveText("Untitled chat");
});
