// CT: the composer's GUIDED CLUSTER (W-D — replaces composer-wand.ct). Drives the PRODUCTION path through
// the real `<Composer>` (the ComposerStory precedent): routeTrpc stubs the network, the cluster fires the
// real `useGuidedActions` / `useComposerUtilities` mutations. Proves: the four dual-mode icons ALWAYS render
// (never hidden/swapped); Response fires generate (committed) / startChat (draft), empty AND with the
// afterAssistant nudge flag on an assistant tail; Swipe KEEPS the steer (no composer clear — the reroll
// ergonomic) while Response/Continue CONSUME it; Simple send fires chat.commitMessage; the phase matrix
// disables swipe/continue/impersonate on a draft with a legible reason.
//
// The trigger buttons are inline (component-scoped); menu POPUPs render through a Base UI Portal, so
// menu-item assertions use the PAGE locator (`page.getByRole`), never `component` (the menu.ct.tsx split).

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures";

const RESPONSE = "Generate reply";
const RESPONSE_DRAFT = "Generate opening";
const TAIL_ASSISTANT_ID = castId<MessageId>("message_ct_tail_assistant");

test("all four guided icons ALWAYS render on a committed chat (never hidden/swapped)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // committed, empty composer
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Regenerate" })).toBeVisible();
  await expect(component.getByRole("button", { name: RESPONSE })).toBeVisible();
  await expect(component.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("Response on an EMPTY committed composer fires a PLAIN generate (no steer object)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.generate": () => ({}) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: RESPONSE }).click();
  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.generate") as { guided?: unknown; afterAssistant?: boolean };
  expect(input.guided).toBeUndefined(); // empty composer ⇒ no steer object
  expect(input.afterAssistant).toBe(true); // still nudged on an assistant tail
});

test("Response fires chat.generate with the typed steer + afterAssistant on an assistant tail", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.generate": () => ({}) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("textbox", { name: "Message" }).fill("make her angrier");
  await component.getByRole("button", { name: RESPONSE }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  const input = trpc.lastInput("chat.generate") as { guided?: { input?: string }; afterAssistant?: boolean };
  expect(input.guided?.input).toBe("make her angrier");
  expect(input.afterAssistant).toBe(true);
  // Response CONSUMES the steer — the composer clears.
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

test("Response on a DRAFT fires chat.startChat opening:generate (Generate opening)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }) });
  const component = await mount(<ComposerStory committed={false} />);

  const btn = component.getByRole("button", { name: RESPONSE_DRAFT });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll above settled the recorder at exactly 1 call, so lastInput is stable at read.
  expect(trpc.lastInput("chat.startChat")).toMatchObject({ opening: "generate" });
});

test("Swipe KEEPS the steer (reroll again with the same guidance — no composer clear)", async ({ mount, page }) => {
  // The tail is resolved by useGuidedActions' own chat.listMessages read — stub it with an assistant tail so
  // fireSwipe has a target (the prop only feeds the composer's own tailRole).
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, { "chat.listMessages": () => makeMessagesPage([tail]), "chat.swipe": () => ({ ok: true }) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  const box = component.getByRole("textbox", { name: "Message" });
  await box.fill("darker tone");
  const btn = component.getByRole("button", { name: "Regenerate with this steering" });
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // The steer STAYS — the reroll ergonomic (reroll again without re-typing).
  await expect(box).toHaveValue("darker tone");
});

test("phase matrix: a DRAFT disables Swipe/Continue/Impersonate with a legible reason; Response stays live", async ({ mount }) => {
  const component = await mount(<ComposerStory committed={false} />);
  // aria-disabled (focusableWhenDisabled) — visible + hoverable, never hidden.
  await expect(component.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeDisabled();
  // Response is always live (Generate opening on a draft).
  await expect(component.getByRole("button", { name: RESPONSE_DRAFT })).toBeEnabled();
});

test("Simple send fires chat.commitMessage (post without generating) and clears the composer", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.commitMessage": () => ({ chat: { id: COMPOSER_CHAT_ID } }) });
  const component = await mount(<ComposerStory />);

  const box = component.getByRole("textbox", { name: "Message" });
  await box.fill("just a note, no reply");
  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Simple send" }).click();

  await expect.poll(() => trpc.count("chat.commitMessage"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll above settled the recorder at exactly 1 call, so lastInput is stable at read.
  expect(trpc.lastInput("chat.commitMessage")).toMatchObject({ content: "just a note, no reply" });
  await expect(box).toHaveValue("");
});
