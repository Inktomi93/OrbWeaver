// CT: the per-message ACTION cluster (message-actions-row.tsx) — Edit/Hide/Fork gated to
// user+assistant rows (a system row is a room notice, not user-authored prose), Delete/Copy on every
// role, each mutation reaching the wire with the right shape (never a manual cache patch — bus-driven
// refresh, `invalidates` is only the settle-time backstop).

import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MessageActionsRowStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

const HIDE_LABEL_RE = /Hide from AI|Unhide from AI/u;
const REST_DIM_RE = /\bopacity-40\b/u;
const HOVER_REVEAL_RE = /group-hover:opacity-100/u;
const FOCUS_REVEAL_RE = /group-focus-within:opacity-100/u;
const COARSE_REVEAL_RE = /pointer-coarse:opacity-100/u;
const SYSTEM_MESSAGE: MessageView = makeMessageView({ role: "system", content: "a room notice" });

// §B.1 UIP-305: the cluster rests DIM (opacity-40, still visible + clickable) and brightens to full
// opacity on hover / focus-within / coarse pointer. The reveal is a pure CSS variant (asserted
// structurally in its own test below); these interaction tests care about the MUTATION wiring, so they
// force the fully-bright state inline — decoupling "does the verb fire correctly" from the
// CSS-variant-generation of the CT bundle.
async function revealActions(component: Locator): Promise<void> {
  await component.locator("[data-slot='message-actions-row']").evaluate((el: HTMLElement) => {
    el.style.opacity = "1";
  });
}

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

test("the action cluster rests DIM (not hidden) and carries the hover/focus/coarse brighten hooks (§B.1 UIP-305)", async ({ mount }) => {
  const component = await mount(<MessageActionsRowStory />);
  const cluster = component.locator("[data-slot='message-actions-row']");

  // At rest the cluster is dim (opacity-40) — visible AND interactive, never fully hidden (§B.1: "dim-
  // at-rest → brighten-on-hover", replacing the old fully-invisible opacity-0/pointer-events-none posture).
  // Asserted on the class (not computed opacity): the CT headless env can report coarse-pointer/
  // focus-within, firing a brighten variant → computed 1; the `opacity-40` REST class is the contract.
  await expect(cluster).toHaveClass(REST_DIM_RE);

  // …and it carries all three brighten hooks: hover, keyboard focus-within (the gate-relevant parity half,
  // §4.3 rule 4), and always-on at a coarse pointer. (Asserted on the class list — a computed-style hover
  // check would depend on the CT bundle's variant generation; the class presence is the load-bearing
  // contract that these variants are wired.)
  await expect(cluster).toHaveClass(HOVER_REVEAL_RE);
  await expect(cluster).toHaveClass(FOCUS_REVEAL_RE);
  await expect(cluster).toHaveClass(COARSE_REVEAL_RE);
});

test("hide-from-AI fires setMessageHidden with the flipped flag", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: false });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await revealActions(component);
  await component.getByRole("button", { name: "Hide from AI" }).click();

  await expect.poll(() => trpc.count("chat.setMessageHidden"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.setMessageHidden")).toMatchObject({
    messageId: message.id,
    hidden: true,
  });
});

test("an already-hidden row shows Unhide and toggles the flag back", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: true });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await revealActions(component);
  await component.getByRole("button", { name: "Unhide from AI" }).click();

  await expect.poll(() => trpc.count("chat.setMessageHidden"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.setMessageHidden")).toMatchObject({
    messageId: message.id,
    hidden: false,
  });
});

test("delete opens a confirm dialog; confirming fires deleteMessages with this ONE messageId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.deleteMessages": () => null });
  const message = makeMessageView();
  const component = await mount(<MessageActionsRowStory message={message} />);

  await revealActions(component);
  await component.getByRole("button", { name: "Delete message" }).click();
  // The dialog portals to document.body — assert against the page, not the component root.
  await expect(page.getByText("Delete this message?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("chat.deleteMessages"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.deleteMessages")).toMatchObject({ messageIds: [message.id] });
});

test("delete's Cancel closes the dialog without firing the mutation", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.deleteMessages": () => null });
  const component = await mount(<MessageActionsRowStory />);

  await revealActions(component);
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

  await revealActions(component);
  await component.getByRole("button", { name: "Fork chat here" }).click();

  await expect.poll(() => trpc.count("chat.forkChat"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.forkChat")).toMatchObject({ chatId: message.chatId, throughSeq: 7 });
});

test("copy writes the message content to the clipboard (no network call)", async ({ mount, page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const message = makeMessageView({ content: "copy me please" });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await revealActions(component);
  await component.getByRole("button", { name: "Copy message" }).click();

  const readClipboard = (): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
  await expect.poll(readClipboard, { intervals: [20, 50, 100] }).toBe("copy me please");
});
