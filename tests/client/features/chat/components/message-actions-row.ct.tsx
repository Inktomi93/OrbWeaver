// CT: the per-message ACTION cluster (message-actions-row.tsx) — D66 A3 collapse: Edit/Fork inline,
// Hide/Copy/Delete under a ⋯ RowActionsMenu. Edit/Hide/Fork gated to user+assistant rows (a system row
// is a room notice, not user-authored prose), Copy/Delete on every role, each mutation reaching the wire
// with the right shape (never a manual cache patch — bus-driven refresh, `invalidates` is only the
// settle-time backstop).

import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MessageActionsRowStory } from "../_ct-stories";
import { makeMessageView } from "../fixtures";

const HIDE_LABEL_RE = /Hide from AI|Unhide from AI/u;
const COPY_RE = /Copy/u;
const DELETE_RE = /Delete/u;
const REST_HIDDEN_RE = /\bopacity-0\b/u;
const REST_INERT_RE = /\bpointer-events-none\b/u;
const HOVER_REVEAL_RE = /group-hover:opacity-100/u;
const FOCUS_REVEAL_RE = /group-focus-within:opacity-100/u;
const COARSE_REVEAL_RE = /pointer-coarse:opacity-100/u;
const MENU_TRIGGER = "More message actions";
const SYSTEM_MESSAGE: MessageView = makeMessageView({ role: "system", content: "a room notice" });

// A3: the cluster rests HIDDEN (opacity-0 / pointer-events-none) and reveals on hover / focus-within /
// coarse pointer. The reveal is a pure CSS variant (asserted structurally in its own test below); these
// interaction tests care about the MUTATION wiring, so they force the fully-revealed + interactive state
// inline — decoupling "does the verb fire correctly" from the CSS-variant-generation of the CT bundle.
// `pointer-events` is restored too or the pointer-events-none rest state would swallow the click.
async function revealActions(component: Locator): Promise<void> {
  await component.locator("[data-slot='message-actions-row']").evaluate((el: HTMLElement) => {
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  });
}

/** Reveal the cluster, then open the ⋯ menu (Hide/Copy/Delete live inside it now). */
async function openActionsMenu(component: Locator): Promise<void> {
  await revealActions(component);
  await component.getByRole("button", { name: MENU_TRIGGER }).click();
}

/** Menu items portal to the page body — resolve them off the page, never the component root. */
function menuItem(page: Page, name: RegExp | string): Locator {
  return page.getByRole("menuitem", { name });
}

test("edit/fork inline + hide gated on a system row; copy/delete stay in the ⋯ menu", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory message={SYSTEM_MESSAGE} />);

  // A system row exposes no inline Edit/Fork and no Hide menu item…
  await expect(component.getByRole("button", { name: "Edit message" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Fork chat here" })).toHaveCount(0);
  await openActionsMenu(component);
  await expect(menuItem(page, HIDE_LABEL_RE)).toHaveCount(0);
  // …but Copy + Delete stay available for every role.
  await expect(menuItem(page, COPY_RE)).toBeVisible();
  await expect(menuItem(page, DELETE_RE)).toBeVisible();
});

test("edit/fork are inline, hide/copy/delete live in the ⋯ menu on an assistant row", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory />); // default: an assistant message

  await expect(component.getByRole("button", { name: "Edit message" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Fork chat here" })).toBeVisible();
  await openActionsMenu(component);
  await expect(menuItem(page, "Hide from AI")).toBeVisible();
  await expect(menuItem(page, COPY_RE)).toBeVisible();
  await expect(menuItem(page, DELETE_RE)).toBeVisible();
});

test("the action cluster rests HIDDEN + inert and carries the hover/focus/coarse reveal hooks (A3)", async ({ mount }) => {
  const component = await mount(<MessageActionsRowStory />);
  const cluster = component.locator("[data-slot='message-actions-row']");

  // At rest the cluster is fully hidden (opacity-0) AND non-interactive (pointer-events-none) — A3
  // amends the old dim-at-rest posture: a resting turn shows ZERO always-on action icons. Asserted on
  // the class (not computed opacity): the CT headless env can report coarse-pointer/focus-within, firing
  // a reveal variant → computed 1; the `opacity-0 pointer-events-none` REST class is the contract.
  await expect(cluster).toHaveClass(REST_HIDDEN_RE);
  await expect(cluster).toHaveClass(REST_INERT_RE);

  // …and it carries all three reveal hooks: hover, keyboard focus-within (the gate-relevant parity half,
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

  await openActionsMenu(component);
  await menuItem(page, "Hide from AI").click();

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

  await openActionsMenu(component);
  await menuItem(page, "Unhide from AI").click();

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

  await openActionsMenu(component);
  await menuItem(page, DELETE_RE).click();
  // The dialog portals to document.body — assert against the page, not the component root.
  await expect(page.getByText("Delete this message?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("chat.deleteMessages"), { intervals: [20, 50, 100] }).toBe(1);
  expect(trpc.lastInput("chat.deleteMessages")).toMatchObject({ messageIds: [message.id] });
});

test("delete's Cancel closes the dialog without firing the mutation", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.deleteMessages": () => null });
  const component = await mount(<MessageActionsRowStory />);

  await openActionsMenu(component);
  await menuItem(page, DELETE_RE).click();
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

  await openActionsMenu(component);
  await menuItem(page, COPY_RE).click();

  const readClipboard = (): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
  await expect.poll(readClipboard, { intervals: [20, 50, 100] }).toBe("copy me please");
});
