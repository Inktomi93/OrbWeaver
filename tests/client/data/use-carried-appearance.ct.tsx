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

const NO_DRAFT: readonly CharacterId[] = [];
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
        { id: "cp_h", kind: "human", characterId: null, displayName: "Nate", leftSeq: null },
        { id: "cp_a", kind: "character", characterId: ARIA, displayName: "Aria", leftSeq: null },
      ],
      background: null,
    }),
  });

  await mount(<CarriedAppearanceCastStory chatId={chatId} draftCharacterIds={NO_DRAFT} />);

  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria");
});

test("DRAFT: the founding cards project, with the viewer's own implicit single human seat", async ({ mount, page }) => {
  await routeCards(page);

  await mount(<CarriedAppearanceCastStory chatId={null} draftCharacterIds={[ARIA]} />);

  // humans=1 is what makes the takeover rules fire at all — a draft is single-human by construction.
  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria");
});

test("DRAFT: a two-card founding cast carries BOTH — never one at a time", async ({ mount, page }) => {
  await routeCards(page);

  await mount(<CarriedAppearanceCastStory chatId={null} draftCharacterIds={[ARIA, BRYN]} />);

  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria+Bryn");
});

test("DRAFT: a partially-loaded cast reads `pending`, never a smaller (falsely true-solo) cast", async ({ mount, page }) => {
  let releaseBryn: (() => void) | undefined;
  const brynHeld = new Promise<void>((resolve) => {
    releaseBryn = resolve;
  });
  await routeCards(page);
  // Hold ONLY Bryn's card (registered after routeTrpc ⇒ runs first, LIFO; falls through for the rest).
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes(BRYN)) {
      await brynHeld;
    }
    await route.fallback();
  });

  await mount(<CarriedAppearanceCastStory chatId={null} draftCharacterIds={[ARIA, BRYN]} />);

  // Aria has landed and Bryn has not. A cast of [Aria] here would read as TRUE-SOLO and paint her card's
  // background over what is actually a group draft — the exact flash this all-or-nothing rule prevents.
  await expect(page.getByTestId("carried-cast")).toHaveText("pending");

  releaseBryn?.();
  await expect(page.getByTestId("carried-cast")).toHaveText("humans=1 cards=Aria+Bryn");
});

test("LANDING and a BLANK draft carry nothing (the viewer's own chrome)", async ({ mount, page }) => {
  await routeCards(page);

  await mount(<CarriedAppearanceCastStory chatId={null} draftCharacterIds={NO_DRAFT} />);

  // No chat and no cast — the `undefined` floor every consumer maps to "the viewer's own chrome".
  await expect(page.getByTestId("carried-cast")).toHaveText("pending");
});

test("a FAILED card read degrades to nothing carried — decoration never throws into a consumer's boundary", async ({ mount, page }) => {
  await routeCards(page);
  // A 500 on the card read (registered after routeTrpc ⇒ runs first, LIFO). The failure must be ABSORBED:
  // appearance is decoration, so a consumer's error boundary must never see it.
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("character.get")) {
      await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":{"message":"card read exploded"}}' });
      return;
    }
    await route.fallback();
  });

  await mount(<CarriedAppearanceCastStory chatId={null} draftCharacterIds={[ARIA]} />);

  // The reader still rendered (no error boundary swallowed it) and reports the safe floor.
  await expect(page.getByTestId("carried-cast")).toHaveText("pending");
});
