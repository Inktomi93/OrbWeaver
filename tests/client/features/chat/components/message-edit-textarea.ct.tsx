// CT: the edit-in-place textarea (message-edit-textarea.tsx) — Enter saves, Esc cancels (discards the
// draft), Shift+Enter inserts a newline; Save fires `chat.editMessage` directly (never a manual cache
// patch); a no-op edit (unchanged text) just exits without firing the mutation.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MessageEditTextareaStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

test("mounts pre-focused with the message's current content, caret at the end", async ({ mount }) => {
  const message = makeMessageView({ content: "original text" });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue("original text");
  await expect(textarea).toBeFocused();
});

test("Enter (no Shift) saves via chat.editMessage with the edited content", async ({ mount, page }) => {
  const message = makeMessageView({ content: "original text" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await textarea.fill("edited text");
  await textarea.press("Enter");

  await expect.poll(() => trpc.count("chat.editMessage"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.editMessage"))
    .toMatchObject({
      chatId: message.chatId,
      messageId: message.id,
      content: "edited text",
    });
});

test("Shift+Enter inserts a newline instead of saving", async ({ mount, page }) => {
  const message = makeMessageView({ content: "line one" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await textarea.press("End");
  await textarea.press("Shift+Enter");
  await textarea.pressSequentially("line two");

  await expect(textarea).toHaveValue("line one\nline two");
  await expect.poll(() => trpc.count("chat.editMessage")).toBe(0);
});

test("Esc cancels — discards the draft (store clears → the textarea reads empty), never saves", async ({ mount, page }) => {
  const message = makeMessageView({ content: "original text" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await textarea.fill("a change I want to discard");
  await textarea.press("Escape");

  await expect.poll(() => trpc.count("chat.editMessage")).toBe(0);
  // The store's `cancelEditingMessage` deletes the draft entry; the SAME reactive textarea (the
  // story keeps it mounted regardless of edit-mode, see _ct-stories.tsx) re-renders reading the
  // hook's not-editing fallback ("") — the observable proof the draft was cleared, from the
  // BROWSER's own store instance (a node-side store read would be the wrong realm — CT runs the
  // test in node and the component in the browser, per route-trpc.ts's header note).
  await expect(textarea).toHaveValue("");
});

test("the Cancel button also discards the draft without saving", async ({ mount, page }) => {
  const message = makeMessageView({ content: "original text" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await textarea.fill("discard me");
  await component.getByRole("button", { name: "Cancel edit" }).click();

  await expect.poll(() => trpc.count("chat.editMessage")).toBe(0);
  await expect(textarea).toHaveValue("");
});

test("the Save button fires the same save path as Enter", async ({ mount, page }) => {
  const message = makeMessageView({ content: "original text" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  await component.getByRole("textbox", { name: "Edit message" }).fill("saved via button");
  await component.getByRole("button", { name: "Save edit" }).click();

  await expect.poll(() => trpc.count("chat.editMessage"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.editMessage")).toMatchObject({ content: "saved via button" });
});

test("an unchanged save (identical text) exits WITHOUT calling chat.editMessage", async ({ mount, page }) => {
  const message = makeMessageView({ content: "unchanged text" });
  const trpc = await routeTrpc(page, { "chat.editMessage": () => message });
  const component = await mount(<MessageEditTextareaStory message={message} />);

  const textarea = component.getByRole("textbox", { name: "Edit message" });
  await textarea.press("Enter");

  await expect.poll(() => trpc.count("chat.editMessage")).toBe(0);
  await expect(textarea).toHaveValue(""); // still exits edit mode (draft cleared, no save fired)
});
