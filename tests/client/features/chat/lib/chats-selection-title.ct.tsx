// CT: `useChatsSelectionTitle` — what the MOBILE topbar calls the open room. A hook, so it is driven
// through a probe component under the real data layer, over the REAL `#state` draft handle (`startNewChat`,
// the exact action the new-chat picker fires).
//
// WHY IT EXISTS (side-eye 2026-08-07 finding 1 — a REGRESSION two lanes fought over). The DRAFT arm read
// `cast[0]?.data?.name`, so a three-character group draft the desktop cluster titled
// "Aldric Vane, Sabine Veyra, Niko" read "Aldric Vane" on the phone — re-introducing at 320px exactly what
// 86a1736bc fixed at desktop width. The file's OWN header already claimed the two surfaces "resolve it the
// same way rather than each inventing a name"; nothing measured it, so the claim outlived the code.
// Both arms call `draftChatTitle` now, and this pins the two answers side by side.
//
// This is a DATA statement, not a layout one, so it needs no coarse emulation: the topbar prints the same
// string at every width and the phone's only extra is that `truncate` may clip it — which is a geometry
// fact about the topbar, not about the title this hook returns.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatsSelectionTitleDraftStory, ChatsTopbarDraftStory } from "../_ct-stories.tsx";

// MINTED ids, never hand-written literals — `typeIdSchema` validates the 26-char suffix at RUNTIME.
const ALDRIC = mintTypeId(ID_PREFIX.character);
const SABINE = mintTypeId(ID_PREFIX.character);
const NIKO = mintTypeId(ID_PREFIX.character);

const NAMES: Readonly<Record<string, string>> = {
  [ALDRIC]: "Aldric Vane",
  [SABINE]: "Sabine Veyra",
  [NIKO]: "Niko",
};

/** `character.get`, keyed by id — the founding-CARD read both draft surfaces resolve their names from. */
function routeDraftCards(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "character.get": (input: unknown): unknown => {
      const { characterId } = input as { readonly characterId: CharacterId };
      return { id: characterId, name: NAMES[characterId] ?? "Unknown", avatarHash: null, greetings: [] };
    },
  });
}

test("a GROUP draft's mobile title names the WHOLE cast, not cast[0]", async ({ mount, page }) => {
  await routeDraftCards(page);

  await mount(<ChatsSelectionTitleDraftStory characterIds={[ALDRIC, SABINE, NIKO]} />);

  // The measured defect was "Aldric Vane" — a title that names one of three people in the room.
  await expect(page.getByTestId("selection-title")).toHaveText("Aldric Vane, Sabine Veyra, Niko");
});

// The header's claim, made checkable: the two surfaces are ONE statement at two widths. Mounting them
// against the same cast and comparing the STRINGS is what a shared comment could never guarantee.
test("the mobile title and the desktop cluster's title are the same string for the same cast", async ({ mount, page }) => {
  await routeDraftCards(page);
  const cast = [ALDRIC, SABINE];

  const mobile = await mount(<ChatsSelectionTitleDraftStory characterIds={cast} />);
  await expect(page.getByTestId("selection-title")).toHaveText("Aldric Vane, Sabine Veyra");
  await mobile.unmount();

  const desktop = await mount(<ChatsTopbarDraftStory characterIds={cast} />);
  await expect(desktop.getByText("Aldric Vane, Sabine Veyra")).toBeVisible();
});

test("a SOLO draft still reads as the one name — the join is not a group-only shape", async ({ mount, page }) => {
  await routeDraftCards(page);

  await mount(<ChatsSelectionTitleDraftStory characterIds={[ALDRIC]} />);

  await expect(page.getByTestId("selection-title")).toHaveText("Aldric Vane");
});

test("a cast whose cards have not landed falls to 'New chat' — never a comma salad of empty names", async ({ mount, page }) => {
  // `character.get` unstubbed ⇒ routeTrpc's default `data:null` for every seat: the mid-load state.
  await routeTrpc(page, {});

  await mount(<ChatsSelectionTitleDraftStory characterIds={[ALDRIC, SABINE]} />);

  // "Untitled chat" (`deriveChatTitle`'s fallback) would be the COMMITTED room's word for a room that
  // exists; a pre-send draft is not one yet.
  await expect(page.getByTestId("selection-title")).toHaveText("New chat");
});
