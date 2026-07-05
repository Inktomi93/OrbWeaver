// CT: the composer's guided-generations WAND (task #27). Drives the PRODUCTION path through the real
// `<Composer>` (the `ComposerStory` precedent, composer.ct.tsx) — routeTrpc stubs the network, the wand
// fires the real `useGuidedActions`-backed mutations. Proves: the trigger's gated states (empty draft /
// mid-flight), each item dispatches its OWN verb with the draft text as guidance (then clears the
// draft), swipe/continue's tail-assistant gate, the impersonate person picker, and the draft handle's
// degenerate "Guide the opening".
//
// The trigger button is inline (component-scoped); the dropdown POPUP renders through a Base UI
// Portal, so every menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` —
// the same split `tests/ui/primitives/menu/menu.ct.tsx` already established.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures";

test("the wand trigger is disabled on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: "Guided generations" })).toBeDisabled();
});

test("typing a draft enables the trigger; it opens to the committed-chat items", async ({
  mount,
  page,
}) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("steer it darker");

  const trigger = component.getByRole("button", { name: "Guided generations" });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  await expect(page.getByRole("menuitem", { name: "Guided response" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Impersonate" })).toBeVisible();
});

test("Guided response fires chat.generate with the draft as guidance, then clears the composer", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { "chat.generate": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("hint at the letter");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).click();

  await expect.poll(() => trpc.count("chat.generate")).toBe(1);
  expect(trpc.lastInput("chat.generate")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    guided: { action: "response", input: "hint at the letter" },
  });
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("Guided swipe/continue are disabled with no tail assistant message to target", async ({
  mount,
  page,
}) => {
  // The default unstubbed `chat.listMessages` resolves `null` (routeTrpc header contract) — no tail.
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("steer it darker");
  await component.getByRole("button", { name: "Guided generations" }).click();

  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toBeDisabled();
});

test("Guided swipe fires chat.swipe with the tail assistant messageId + guidance", async ({
  mount,
  page,
}) => {
  const tail = makeMessageView({ chatId: COMPOSER_CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("more tension");
  await component.getByRole("button", { name: "Guided generations" }).click();
  const swipeItem = page.getByRole("menuitem", { name: "Guided swipe" });
  await expect(swipeItem).toBeEnabled();
  await swipeItem.click();

  await expect.poll(() => trpc.count("chat.swipe")).toBe(1);
  expect(trpc.lastInput("chat.swipe")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    messageId: tail.id,
    guided: { action: "swipe", input: "more tension" },
  });
});

test("Guided continue fires chat.continueTurn with the tail assistant messageId + guidance", async ({
  mount,
  page,
}) => {
  const tail = makeMessageView({ chatId: COMPOSER_CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.continueTurn": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("keep going softly");
  await component.getByRole("button", { name: "Guided generations" }).click();
  const continueItem = page.getByRole("menuitem", { name: "Guided continue" });
  await expect(continueItem).toBeEnabled();
  await continueItem.click();

  await expect.poll(() => trpc.count("chat.continueTurn")).toBe(1);
  expect(trpc.lastInput("chat.continueTurn")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    messageId: tail.id,
    guided: { action: "continue", input: "keep going softly" },
  });
});

test("Impersonate's person submenu fires chat.impersonate with the picked person", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { "chat.impersonate": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("ask about the ruins");
  await component.getByRole("button", { name: "Guided generations" }).click();
  const impersonateTrigger = page.getByRole("menuitem", { name: "Impersonate" });
  await impersonateTrigger.hover();
  await page.getByRole("menuitem", { name: "3rd person" }).click();

  await expect.poll(() => trpc.count("chat.impersonate")).toBe(1);
  expect(trpc.lastInput("chat.impersonate")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    guided: { action: "impersonate", input: "ask about the ruins", person: "third" },
  });
});

test("draft handle: shows only 'Guide the opening', which fires chat.startChat with a forced generate + the steer", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByLabel("Message", { exact: true }).fill("start mid-chase");
  await component.getByRole("button", { name: "Guided generations" }).click();

  await expect(page.getByRole("menuitem", { name: "Guide the opening" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Guided response" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Guide the opening" }).click();

  await expect.poll(() => trpc.count("chat.startChat")).toBe(1);
  expect(trpc.lastInput("chat.startChat")).toMatchObject({
    opening: "generate",
    guided: { action: "opening", input: "start mid-chase" },
  });
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("the wand trigger is disabled while a turn is mid-flight, even with draft text", async ({
  mount,
}) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("steer it darker");
  await expect(component.getByRole("button", { name: "Guided generations" })).toBeEnabled();

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();

  await expect(component.getByRole("button", { name: "Guided generations" })).toBeDisabled();
});
