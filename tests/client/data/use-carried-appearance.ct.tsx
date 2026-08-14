// CT: `useCarriedAppearanceCast` — the phase-independent read of "whose card dresses this room".
//
// WHY IT EXISTS (owner dogfood 2026-08-06): the carried look — the app-root background (BG-C) and the
// room-theme takeover — used to be resolved from `chat.getChat`'s roster, which a DRAFT has none of. Every
// consumer therefore gated a card's appearance on a committed chat id, and a brand-new chat wore the
// viewer's default chrome until the first message created the row. This hook is the seam that gives both
// phases the same shape; these pins are its contract.
//
// THE FIVE PINS:
//   1. COMMITTED  → the roster projects (humans counted, characters carried).
//   2. DRAFT      → the founding CARDS project, with the viewer's single implicit human seat.
//   3. DRAFT      → a PARTIALLY-loaded cast reads `pending`, never a smaller cast (a 2-card draft must not
//                   flash as true-solo and paint the first card's background).
//   4. LANDING / blank draft → `undefined` (nothing carried; the viewer's own chrome).
//   5. A FAILED card read degrades to `undefined` — decoration never throws into a consumer's boundary.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { CarriedAppearanceCastStory } from "./_ct-stories.tsx";

const ARIA = mintTypeId(ID_PREFIX.character);
const BRYN = mintTypeId(ID_PREFIX.character);

/** A `character.get` payload carrying only what the cast reads. */
function card(id: CharacterId, name: string): Record<string, unknown> {
  return { id, name, themeOverride: null, backgroundOverride: null };
}

function routeCards(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "character.get": (input: unknown): unknown => {
      const { characterId } = input as { readonly characterId: CharacterId };
      return characterId === BRYN ? card(BRYN, "Bryn") : card(ARIA, "Aria");
    },
  });
}

test("COMMITTED: the roster projects into the cast (humans counted, characters carried)", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {
    "chat.getChat": () => ({
      participants: [
        { id: "cp_h", kind: "human", characterId: null, displayName: "Alex", leftSeq: null },
        { id: "cp_a", kind: "character", characterId: ARIA, displayName: "Aria", leftSeq: null },
      ],
      background: null,
    }),
  });

  await mount(<CarriedAppearanceCastStory chatId={chatId} />);

  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria");
});

test("LANDING and a BLANK draft carry nothing (the viewer's own chrome)", async ({ mount, page }) => {
  await routeCards(page);

  await mount(<CarriedAppearanceCastStory chatId={null} />);

  // No chat and no cast — the `undefined` floor every consumer maps to "the viewer's own chrome".
  await expect(page.getByTestId("carried-cast")).toHaveText("pending");
});
