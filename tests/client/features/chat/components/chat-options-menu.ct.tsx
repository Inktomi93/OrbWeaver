// CT: the ⋯ chat-options menu (chat-options-menu.tsx). #41 CONSOLIDATION: the turn actions
// (Continue / Regenerate / Impersonate) moved to the composer WAND (composer-wand.ct.tsx pins their
// payload shapes there) — this menu keeps only actions with NO wand/panel home, plus the #40 Game
// front-door section (start / pause / resume — its verbs are host-gated server-side).
//
// The trigger button is inline (component-scoped); the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` (the composer-wand.ct.tsx
// precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatOptionsMenuStory } from "../_ct-stories";
import { CHAT_ID } from "../fixtures";

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
const FULL_ITEM_SET = ["New chat with same cast", "Turn on RPG", "Select messages…", "Rename", "Download transcript", "Close chat", "Delete chat"];

// The items DISABLED on a draft (everything that needs a committed server row / canon), each with a reason.
const DRAFT_DISABLED = ["Select messages…", "Rename", "Download transcript", "Delete chat"];
// The items that stay LIVE on a draft (canon-less: cast-based new-chat + navigation + the overlay stage).
const DRAFT_ENABLED = ["New chat with same cast", "Turn on RPG", "Close chat"];
// The unlock-condition reason must NAME when it becomes available, not just say "unavailable".
const UNLOCK_REASON = /send/u;
const FIRST_SEND_UNLOCK = /send the first message/u;

test("#8: a DRAFT renders the IDENTICAL item set — nothing hidden, canon-requiring items disabled", async ({ mount, page }) => {
  const component = await mount(<ChatOptionsMenuStory committed={false} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // Every row is present (no item HIDDEN on a draft) — the identical set a committed chat shows.
  await Promise.all(FULL_ITEM_SET.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible()));
  // The canon-requiring items are DISABLED; the canon-less config/nav items stay LIVE.
  await Promise.all(DRAFT_DISABLED.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeDisabled()));
  await Promise.all(DRAFT_ENABLED.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeEnabled()));
});

test("#8: every DRAFT-disabled item carries a hover reason that names the unlock condition", async ({ mount, page }) => {
  const component = await mount(<ChatOptionsMenuStory committed={false} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // Base UI renders a disabled menu item as div[role=menuitem] aria-disabled (NOT native-disabled), so it
  // still receives hover and the `title` reason surfaces. Assert BOTH: aria-disabled true + a `title` that
  // names WHEN it unlocks (contains "send" — the unlock condition, not "unavailable").
  await Promise.all(
    DRAFT_DISABLED.map(async (label) => {
      const item = page.getByRole("menuitem", { name: label, exact: true });
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).toHaveAttribute("title", UNLOCK_REASON);
    }),
  );
  // On a DRAFT every disabled item names the first-send unlock.
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
});

test("#8: a COMMITTED chat's row actions are ENABLED (there IS a server row) — the committed baseline", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const component = await mount(<ChatOptionsMenuStory withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Download transcript", exact: true })).toBeEnabled();
});

test("#8: a DRAFT-disabled item is not activatable (Playwright refuses to click a disabled menu item)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.updateChat": () => ({ ok: true }) });
  const component = await mount(<ChatOptionsMenuStory committed={false} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // A disabled menu item is non-actionable — a click waits for enabled and TIMES OUT (activation prevented).
  // The short timeout keeps the negative-path assertion fast; the verb must never fire.
  const renameItem = page.getByRole("menuitem", { name: "Rename", exact: true });
  await expect(renameItem.click({ timeout: 1500 })).rejects.toThrow();
  // ONESHOT-OK: reads AFTER the click rejection settled — the disabled item never activated, so no
  // later call can fire; a zero here is final, not a mid-transition sample.
  expect(trpc.count("chat.updateChat")).toBe(0);
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

test("#40: a DRAFT stages the overlay intent locally — the item flips to 'Turn off RPG' and back, no network", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {});
  const component = await mount(<ChatOptionsMenuStory committed={false} withCast={true} />);
  const trigger = component.getByRole("button", { name: "Chat options" });

  await trigger.click();
  await page.getByRole("menuitem", { name: "Turn on RPG" }).hover();
  await page.getByRole("menuitem", { name: "Freeform story" }).click();

  // STAGED (a local draft-config write — no verb fires pre-commit; the first send carries it).
  await trigger.click();
  const offItem = page.getByRole("menuitem", { name: "Turn off RPG" });
  await expect(offItem).toBeVisible();
  // ONESHOT-OK: staging is a SYNCHRONOUS local draft-config write (no mutation fires pre-commit), and the
  // staged re-render is already proven settled by the retrying toBeVisible above — a zero here is final.
  expect(trpc.count("rpg.createGame")).toBe(0);

  // Clearing flips back to the on-submenu (the toggle is reversible pre-send too).
  await offItem.click();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Turn on RPG" })).toBeVisible();
});
