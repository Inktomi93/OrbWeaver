// CT: `useDraftCastCards` — the ONE client read of a DRAFT's founding cards, resolved LIST-FIRST.
//
// WHY IT EXISTS (side-eye 2026-08-07 §④ P2, called "the single biggest opportunity" in that pass): every new
// draft rendered a ~2s placebo identity — the topbar read `? | ? | ? | New chat`, with no theme and no
// background — and then snapped correct. Three separately-landed fixes (title, theme, background) all looked
// broken at once, on the first frame of a room the user had just composed by hand. The cause was a KEY, not a
// latency: the draft surfaces resolved N cold `character.get` reads while the picker one frame earlier had
// resolved the same characters through `character.list`, whose row already carries `name`, `avatarHash`,
// `themeOverride` and `backgroundOverride`.
//
// THE PINS:
//   1. `character.get` is still the AUTHORITY — with no warm list, the resolver waits for it and reports it.
//   2. LIST-FIRST — a warm `character.list` page resolves a seat while its `character.get` is still in
//      flight. (This is the defect pin; its control is pin 3.)
//   3. CONTROL — the same held `character.get` with NO warm list stays `unresolved`, so pin 2 can fail.
//   4. The theme + background fields come through the list arm too, not just the name: the carried look is
//      the other half of what the placebo window broke.
//   5. A NULLISH card read is UNRESOLVED, never a dereference — a decoration resolver must not blank a topbar.
//
// The claims are RENDER-SEQUENCE claims, never timing numbers: `character.get` is held open forever, so a
// pass means the answer arrived from somewhere else, under load or not.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { DraftCastCardsListFirstStory, DraftCastCardsStory } from "./_ct-stories.tsx";

const ARIA = mintTypeId(ID_PREFIX.character);
const BRYN = mintTypeId(ID_PREFIX.character);

/** Hold every `character.get` open for the life of the test — the cold-read window, made infinite. */
async function holdCardReads(page: Page): Promise<void> {
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("character.get")) {
      await new Promise(() => undefined);
      return;
    }
    await route.fallback();
  });
}

test("the `character.get` card is the AUTHORITY — with no warm list, the resolver reports it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.get": (): unknown => ({ id: ARIA, name: "Aria", avatarHash: null, themeOverride: null, backgroundOverride: null }),
  });

  await mount(<DraftCastCardsStory characterIds={[ARIA]} />);

  await expect(page.getByTestId("draft-cast-cards")).toHaveText("Aria|-|-");
});

test("LIST-FIRST: a warm `character.list` page resolves the seat while `character.get` is still in flight", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": () => ({
      items: [
        { id: ARIA, name: "Aria", avatarHash: null, themeOverride: null, backgroundOverride: null },
        { id: BRYN, name: "Bryn", avatarHash: null, themeOverride: null, backgroundOverride: null },
      ],
      nextCursor: null,
    }),
  });
  await holdCardReads(page);

  await mount(<DraftCastCardsListFirstStory characterIds={[ARIA, BRYN]} />);

  await expect(page.getByTestId("list-warm")).toHaveText("rows=2");
  await expect(page.getByTestId("draft-cast-cards")).toHaveText("Aria|-|- Bryn|-|-");
});

// THE PLANTED POSITIVE CONTROL for the pin above. If this ever goes green, that pin has stopped being
// able to fail and stops being evidence.
test("CONTROL: the same held `character.get` with NO warm list page stays unresolved", async ({ mount, page }) => {
  await holdCardReads(page);

  await mount(<DraftCastCardsStory characterIds={[ARIA]} />);

  await expect(page.getByTestId("draft-cast-cards")).toHaveText("unresolved");
});

// The APPEARANCE half: the placebo window broke the theme and the background as well as the name, and the
// list row carries both — which is the whole reason the fix is a key change and not a prefetch.
test("LIST-FIRST carries the THEME and BACKGROUND too, not just the name", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": () => ({
      items: [{ id: ARIA, name: "Aria", avatarHash: null, themeOverride: { accent: "#ff0000" }, backgroundOverride: { kind: "color", color: "#101010" } }],
      nextCursor: null,
    }),
  });
  await holdCardReads(page);

  await mount(<DraftCastCardsListFirstStory characterIds={[ARIA]} />);

  await expect(page.getByTestId("draft-cast-cards")).toHaveText("Aria|theme|bg");
});

// A resolved-but-NULLISH card read (the harness's universal stub answers `null`, and a real query that has
// not landed answers `undefined`) is UNRESOLVED. A bare `!== undefined` here dereferenced the null and blanked
// the whole topbar — the wrong failure mode for a non-suspending decoration read.
test("a NULLISH card read reads as unresolved — it never dereferences", async ({ mount, page }) => {
  await routeTrpc(page, {});

  await mount(<DraftCastCardsStory characterIds={[ARIA]} />);

  await expect(page.getByTestId("draft-cast-cards")).toHaveText("unresolved");
});
