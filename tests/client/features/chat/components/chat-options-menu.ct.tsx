// CT: the ⋯ chat-options menu (chat-options-menu.tsx). #41 CONSOLIDATION: the turn actions
// (Continue / Regenerate / Impersonate) moved to the composer WAND (composer-wand.ct.tsx pins their
// payload shapes there) — this menu keeps only actions with NO wand/panel home, plus the #40 Game
// front-door section (start / pause / resume — its verbs are host-gated server-side).
//
// The trigger button is inline (component-scoped); the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` (the composer-wand.ct.tsx
// precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatOptionsMenuStory } from "../_ct-stories.tsx";
import { CHAT_ID } from "../fixtures.ts";

// ── #8 grey-out (owner ruling 2026-07-24: "i fucking hate things hiding and when it's disabled on hover
// tell why") — the DRAFT arm renders the IDENTICAL item set to a committed chat: nothing HIDDEN, the
// canon-requiring actions DISABLED, and EVERY disabled item carries a hover reason NAMING the unlock
// condition. `committed={false}` is the ONE seam. ─────────────────────────────────────────────────────

// The full row label set the ⋯ menu renders (committed + draft, character-gated rows included via withCast).
// IA de-dup (owner rule, W3c): items with a CONTEXT-panel home are GONE from the ⋯ menu — Chat settings
// (Settings tab), Preview request (Preview tab), Injections (Injections tab), and Invite / Hand off host /
// Leave (all in the Members tab); the turn actions live on the WAND (#41). "Turn on RPG" is the #40
// RPG-overlay toggle (a submenu trigger — same role=menuitem surface) — LIVE on a draft too (enabling
// the overlay is a PRE-CANON decision: the first send mints the game before the opening turn).

// The items DISABLED on a draft (everything that needs a committed server row / canon), each with a reason.
// The items that stay LIVE on a draft (canon-less: cast-based new-chat + navigation + the overlay stage).
// The unlock-condition reason must NAME when it becomes available, not just say "unavailable".
// The lifecycle-placement ABSENCE pins: no download/export item may exist in the ROOM menu.
const ANY_TRANSCRIPT = /transcript/u;
const ANY_EXPORT = /export/iu;

test("#8: a COMMITTED chat's row actions are ENABLED (there IS a server row) — the committed baseline", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const component = await mount(<ChatOptionsMenuStory withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
});

// The lifecycle one-home ruling: import/export live on the LIST side (band ghost + row kebab). The ROOM
// carries no import/export chrome — this pins the ABSENCE, so a re-scattered download can't land quietly.
test("lifecycle placement: the room ⋯ menu offers NO transcript download (its one home is the list row kebab)", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const component = await mount(<ChatOptionsMenuStory withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: ANY_TRANSCRIPT })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: ANY_EXPORT })).toHaveCount(0);
});

// ── #40: the Game front-door section — start a game from the ⋯ menu. ──────────────────────────────────

test("#40: committed 'Turn on RPG' → 'Freeform story' fires rpg.createGame (mode lite, no profile)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "rpg.createGame": () => ({ gameId: "rpg_game_ct", trackersReadOnly: false }) });
  const component = await mount(<ChatOptionsMenuStory withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await page.getByRole("menuitem", { name: "Turn on RPG" }).hover();
  await page.getByRole("menuitem", { name: "Freeform story" }).click();

  await expect.poll(() => trpc.count("rpg.createGame"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("rpg.createGame");
  expect(input).toMatchObject({ chatId: CHAT_ID, mode: "lite" });
  expect(input).not.toHaveProperty("profile"); // freeform = the create default (no packaged profile)
});
