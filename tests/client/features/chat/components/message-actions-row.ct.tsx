// CT: the per-message ACTION cluster (message-actions-row.tsx) — Edit/Hide/Fork gated to
// user+assistant rows (a system row is a room notice, not user-authored prose), Delete/Copy on every
// role, each mutation reaching the wire with the right shape (never a manual cache patch — bus-driven
// refresh, `invalidates` is only the settle-time backstop).

import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MessageActionsRowStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

const HIDE_LABEL_RE = /Hide from AI|Unhide from AI/u;
const SYSTEM_MESSAGE: MessageView = makeMessageView({ role: "system", content: "a room notice" });

test("edit/hide/fork are hidden on a system row; delete/copy stay available", async ({ mount }) => {
  const component = await mount(<MessageActionsRowStory message={SYSTEM_MESSAGE} />);

  await expect(component.getByRole("button", { name: "Edit message" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: HIDE_LABEL_RE })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Fork chat here" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Delete message" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Copy message" })).toBeVisible();
});

test("edit/hide/fork are all available on an assistant row", async ({ mount }) => {
  const component = await mount(<MessageActionsRowStory />); // default: an assistant message

  await expect(component.getByRole("button", { name: "Edit message" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Hide from AI" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Fork chat here" })).toBeVisible();
});

test("hide-from-AI fires setMessageHidden with the flipped flag", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: false });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await component.getByRole("button", { name: "Hide from AI" }).click();

  await expect.poll(() => trpc.count("chat.setMessageHidden")).toBe(1);
  expect(trpc.lastInput("chat.setMessageHidden")).toMatchObject({
    messageId: message.id,
    hidden: true,
  });
});

test("an already-hidden row shows Unhide and toggles the flag back", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: true });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await component.getByRole("button", { name: "Unhide from AI" }).click();

  await expect.poll(() => trpc.count("chat.setMessageHidden")).toBe(1);
  expect(trpc.lastInput("chat.setMessageHidden")).toMatchObject({
    messageId: message.id,
    hidden: false,
  });
});

test("delete opens a confirm dialog; confirming fires deleteMessages with this ONE messageId", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, { "chat.deleteMessages": () => null });
  const message = makeMessageView();
  const component = await mount(<MessageActionsRowStory message={message} />);

  await component.getByRole("button", { name: "Delete message" }).click();
  // The dialog portals to document.body — assert against the page, not the component root.
  await expect(page.getByText("Delete this message?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("chat.deleteMessages")).toBe(1);
  expect(trpc.lastInput("chat.deleteMessages")).toMatchObject({ messageIds: [message.id] });
});

test("delete's Cancel closes the dialog without firing the mutation", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.deleteMessages": () => null });
  const component = await mount(<MessageActionsRowStory />);

  await component.getByRole("button", { name: "Delete message" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Delete this message?")).toHaveCount(0);
  expect(trpc.count("chat.deleteMessages")).toBe(0);
});

test("fork fires forkChat with this message's seq as throughSeq", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.forkChat": () => ({ chat: { id: "chat_forked_ct" } }),
  });
  const message = makeMessageView({ seq: 7 });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await component.getByRole("button", { name: "Fork chat here" }).click();

  await expect.poll(() => trpc.count("chat.forkChat")).toBe(1);
  expect(trpc.lastInput("chat.forkChat")).toMatchObject({ chatId: message.chatId, throughSeq: 7 });
});

test("copy writes the message content to the clipboard (no network call)", async ({
  mount,
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const message = makeMessageView({ content: "copy me please" });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await component.getByRole("button", { name: "Copy message" }).click();

  const readClipboard = (): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
  await expect.poll(readClipboard).toBe("copy me please");
});
