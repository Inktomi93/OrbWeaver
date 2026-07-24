// CT: the ⋯ chat-options menu's turn actions (chat-options-menu.tsx, F2). From the header there is no draft
// text, so Continue/Regenerate/Impersonate fire `useGuidedActions` with an EMPTY steer — which must OMIT the
// `guided` object ENTIRELY (FINAL-Chat-Tab-Redesign §6.4, owner-ruled). An empty-but-present `guided` would
// resolve the guided template into a dangling scaffold server-side (`steer.input ?? ""`), polluting the
// prompt of every header-menu turn. These prove the PAYLOAD shape: the verb fires, with no `guided` key.
//
// The trigger button is inline (component-scoped); the menu POPUP renders through a Base UI Portal, so every
// menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` (the composer-wand.ct.tsx
// precedent). Continue/Regenerate gate on a tail assistant slot, so `chat.listMessages` is stubbed with one.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatOptionsMenuStory } from "../_ct-stories";
import { CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures";

test("header-menu Continue fires chat.continueTurn with NO guided object (plain, empty steer)", async ({ mount, page }) => {
  const tail = makeMessageView({ chatId: CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.continueTurn": () => ({ ok: true }),
  });
  const component = await mount(<ChatOptionsMenuStory />);

  await component.getByRole("button", { name: "Chat options" }).click();
  const continueItem = page.getByRole("menuitem", { name: "Continue" });
  await expect(continueItem).toBeEnabled();
  await continueItem.click();

  await expect.poll(() => trpc.count("chat.continueTurn"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.continueTurn");
  expect(input).toMatchObject({ chatId: CHAT_ID, messageId: tail.id });
  expect(input).not.toHaveProperty("guided");
});

test("header-menu Regenerate fires chat.swipe with NO guided object", async ({ mount, page }) => {
  const tail = makeMessageView({ chatId: CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => ({ ok: true }),
  });
  const component = await mount(<ChatOptionsMenuStory />);

  await component.getByRole("button", { name: "Chat options" }).click();
  const regenerateItem = page.getByRole("menuitem", { name: "Regenerate" });
  await expect(regenerateItem).toBeEnabled();
  await regenerateItem.click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.swipe");
  expect(input).toMatchObject({ chatId: CHAT_ID, messageId: tail.id });
  expect(input).not.toHaveProperty("guided");
});

test("header-menu Impersonate fires chat.impersonate with NO guided object (person dropped too)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.impersonate": () => ({ ok: true }) });
  const component = await mount(<ChatOptionsMenuStory />);

  await component.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Impersonate" }).hover();
  await page.getByRole("menuitem", { name: "3rd person" }).click();

  await expect.poll(() => trpc.count("chat.impersonate"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.impersonate");
  expect(input).toMatchObject({ chatId: CHAT_ID });
  // An empty steer omits the WHOLE object — including `person`; an unsteered impersonate has no {{person}}
  // to place, so the kit resolver falls back to its "first" default server-side.
  expect(input).not.toHaveProperty("guided");
});

// ── #8 grey-out (owner ruling 2026-07-24: "i fucking hate things hiding and when it's disabled on hover
// tell why") — the DRAFT arm renders the IDENTICAL item set to a committed chat: nothing HIDDEN, the
// canon-requiring actions DISABLED, and EVERY disabled item carries a hover reason NAMING the unlock
// condition. `committed={false}` is the ONE seam. The pre-ruling "Delete/Download OMITTED on draft" pins
// are flipped ON PURPOSE — those items now RENDER disabled. ────────────────────────────────────────────

// The full row label set the ⋯ menu renders (committed + draft, character-gated rows included via withCast).
const FULL_ITEM_SET = [
  "New chat with same cast",
  "Continue",
  "Regenerate",
  "Impersonate",
  "Invite people…",
  "Hand off host…",
  "Select messages…",
  "Chat overrides…",
  "Preview request…",
  "Injections…",
  "Rename",
  "Download transcript",
  "Close chat",
  "Delete chat",
];

// The items DISABLED on a draft (everything that needs a committed server row / canon), each with a reason.
const DRAFT_DISABLED = [
  "Continue",
  "Regenerate",
  "Impersonate",
  "Invite people…",
  "Hand off host…",
  "Select messages…",
  "Preview request…",
  "Rename",
  "Download transcript",
  "Delete chat",
];
// The items that stay LIVE on a draft (canon-less: the unified draft context-config tabs + navigation).
const DRAFT_ENABLED = ["New chat with same cast", "Chat overrides…", "Injections…", "Close chat"];
// The unlock-condition reason must NAME when it becomes available, not just say "unavailable".
const UNLOCK_REASON = /send|assistant reply/u;
const ASSISTANT_REPLY_UNLOCK = /assistant reply/u;
const FIRST_SEND_UNLOCK = /send the first message/u;

test("#8: a DRAFT renders the IDENTICAL item set — nothing hidden, canon-requiring items disabled", async ({ mount, page }) => {
  const component = await mount(<ChatOptionsMenuStory committed={false} multiHumanCapable={true} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // Every row is present (no item HIDDEN on a draft) — the identical set a committed chat shows.
  await Promise.all(FULL_ITEM_SET.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeVisible()));
  // The canon-requiring items are DISABLED; the canon-less config/nav items stay LIVE.
  await Promise.all(DRAFT_DISABLED.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeDisabled()));
  await Promise.all(DRAFT_ENABLED.map((label) => expect(page.getByRole("menuitem", { name: label, exact: true })).toBeEnabled()));
});

test("#8: every DRAFT-disabled item carries a hover reason that names the unlock condition", async ({ mount, page }) => {
  const component = await mount(<ChatOptionsMenuStory committed={false} multiHumanCapable={true} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // Base UI renders a disabled menu item as div[role=menuitem] aria-disabled (NOT native-disabled), so it
  // still receives hover and the `title` reason surfaces. Assert BOTH: aria-disabled true + a `title` that
  // names WHEN it unlocks (contains "send"/"assistant reply" — the unlock condition, not "unavailable").
  await Promise.all(
    DRAFT_DISABLED.map(async (label) => {
      const item = page.getByRole("menuitem", { name: label, exact: true });
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).toHaveAttribute("title", UNLOCK_REASON);
    }),
  );
  // On a DRAFT every disabled item names the first-send unlock (sending also produces the first assistant
  // reply, so "send the first message" is the one true precondition — the assistant-reply reason is for a
  // COMMITTED chat with no assistant tail, pinned separately below).
  await expect(page.getByRole("menuitem", { name: "Continue", exact: true })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
});

test("#8: on a COMMITTED chat with no assistant tail, Continue/Regenerate name the assistant-reply unlock", async ({ mount, page }) => {
  // A committed chat whose latest row is NOT an assistant reply (empty transcript here) — the turn-steering
  // items disable, but the reason is the assistant-reply unlock, NOT the draft's first-send unlock.
  await routeTrpc(page, { "chat.listMessages": () => makeMessagesPage([]) });
  const component = await mount(<ChatOptionsMenuStory withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  const continueItem = page.getByRole("menuitem", { name: "Continue", exact: true });
  await expect(continueItem).toBeDisabled();
  await expect(continueItem).toHaveAttribute("title", ASSISTANT_REPLY_UNLOCK);
  // A committed chat's Rename/Delete/Download are ENABLED (there IS a server row) — the committed baseline.
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Download transcript", exact: true })).toBeEnabled();
});

test("#8: a DRAFT-disabled item is not activatable (Playwright refuses to click a disabled menu item)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.continueTurn": () => ({ ok: true }) });
  const component = await mount(<ChatOptionsMenuStory committed={false} withCast={true} />);
  await component.getByRole("button", { name: "Chat options" }).click();

  // A disabled menu item is non-actionable — a click waits for enabled and TIMES OUT (activation prevented).
  // The short timeout keeps the negative-path assertion fast; the verb must never fire.
  const continueItem = page.getByRole("menuitem", { name: "Continue", exact: true });
  await expect(continueItem.click({ timeout: 1500 })).rejects.toThrow();
  // ONESHOT-OK: reads AFTER the click rejection settled — the disabled item never activated, so no
  // later call can fire; a zero here is final, not a mid-transition sample.
  expect(trpc.count("chat.continueTurn")).toBe(0);
});
