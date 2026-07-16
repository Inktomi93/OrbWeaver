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
