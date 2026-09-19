// CT: the per-message ACTION cluster (message-actions-row.tsx) — D66 A3 collapse: Edit/Fork inline,
// Hide/Copy/Delete under a ⋯ RowActionsMenu. Edit/Hide/Fork gated to user+assistant rows (a system row
// is a room notice, not user-authored prose), Copy/Delete on every role, each mutation reaching the wire
// with the right shape (never a manual cache patch — bus-driven refresh, `invalidates` is only the
// settle-time backstop).

import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME, MESSAGE_FORK_NAME } from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { MessageActionsRowStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, makeMessageView } from "../fixtures.ts";

const HIDE_LABEL_RE = /Hide from AI|Unhide from AI/u;
const COPY_RE = /Copy/u;
const DELETE_RE = /Delete/u;
const REST_HIDDEN_RE = /\bopacity-0\b/u;
const REST_INERT_RE = /\bpointer-events-none\b/u;
const HOVER_REVEAL_RE = /group-hover:opacity-100/u;
const FOCUS_REVEAL_RE = /group-focus-within:opacity-100/u;
const COARSE_REVEAL_RE = /pointer-coarse:opacity-100/u;
const MENU_TRIGGER = MESSAGE_ACTIONS_MENU_NAME;
const UNDO_CONTINUE = "Undo last continuation";
const REVERT_CONTINUE = "Re-apply continuation";
const NEEDS_CONTINUATION_REASON = "Continue this reply first — there's no added text to undo yet";
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
  await expect(component.getByRole("button", { name: MESSAGE_EDIT_NAME })).toHaveCount(0);
  await expect(component.getByRole("button", { name: MESSAGE_FORK_NAME })).toHaveCount(0);
  await openActionsMenu(component);
  await expect(menuItem(page, HIDE_LABEL_RE)).toHaveCount(0);
  // …but Copy + Delete stay available for every role.
  await expect(menuItem(page, COPY_RE)).toBeVisible();
  await expect(menuItem(page, DELETE_RE)).toBeVisible();
});

test("edit/fork are inline, hide/copy/delete live in the ⋯ menu on an assistant row", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory />); // default: an assistant message

  await expect(component.getByRole("button", { name: MESSAGE_EDIT_NAME })).toBeVisible();
  await expect(component.getByRole("button", { name: MESSAGE_FORK_NAME })).toBeVisible();
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
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: false });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await openActionsMenu(component);
  await menuItem(page, "Hide from AI").click();

  await expect.poll(() => trpc.count("chat.setMessageHidden"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.setMessageHidden"))
    .toMatchObject({
      messageId: message.id,
      hidden: true,
    });
});

test("an already-hidden row shows Unhide and toggles the flag back", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.setMessageHidden": () => ({ ok: true }) });
  const message = makeMessageView({ excludedFromPrompt: true });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await openActionsMenu(component);
  await menuItem(page, "Unhide from AI").click();

  await expect.poll(() => trpc.count("chat.setMessageHidden"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.setMessageHidden"))
    .toMatchObject({
      messageId: message.id,
      hidden: false,
    });
});

test("delete opens a confirm dialog; confirming fires deleteMessages with this ONE messageId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.deleteMessages": () => null });
  const message = makeMessageView();
  const component = await mount(<MessageActionsRowStory message={message} />);

  await openActionsMenu(component);
  await menuItem(page, DELETE_RE).click();
  // The dialog portals to document.body — assert against the page, not the component root.
  await expect(page.getByText("Delete this message?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => trpc.count("chat.deleteMessages"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.deleteMessages")).toMatchObject({ messageIds: [message.id] });
});

test("delete's Cancel closes the dialog without firing the mutation", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.deleteMessages": () => null });
  const component = await mount(<MessageActionsRowStory />);

  await openActionsMenu(component);
  await menuItem(page, DELETE_RE).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("Delete this message?")).toHaveCount(0);
  await expect.poll(() => trpc.count("chat.deleteMessages")).toBe(0);
});

test("fork fires forkChat with this message's seq as throughSeq", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.forkChat": () => ({ chat: { id: "chat_forked_ct" } }),
  });
  const message = makeMessageView({ seq: 7 });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await revealActions(component);
  await component.getByRole("button", { name: MESSAGE_FORK_NAME }).click();

  await expect.poll(() => trpc.count("chat.forkChat"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.forkChat")).toMatchObject({ chatId: message.chatId, throughSeq: 7 });
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

// ── The continue undo/redo pair (F2) — the ⋯ menu items, phase-gated on the shown swipe's `hasContinuation`.
//    Assistant-only (the sole role that carries a D26 continue snapshot); disabled-with-reason, never hidden.

test("a NON-continued assistant reply renders both items DISABLED with the continuation-needed reason (never hidden)", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory message={makeMessageView({ hasContinuation: false })} />);

  await openActionsMenu(component);
  // Base UI renders a disabled MenuItem as div[role=menuitem] aria-disabled — the item is PRESENT (not
  // hidden) with the phase-gate reason on `title` (the disabled-affordance law).
  await Promise.all(
    [UNDO_CONTINUE, REVERT_CONTINUE].map(async (label) => {
      const item = menuItem(page, label);
      await expect(item).toBeVisible();
      await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(item).toHaveAttribute("title", NEEDS_CONTINUATION_REASON);
    }),
  );
});

test("a CONTINUED assistant reply enables both items (no disabled reason)", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory message={makeMessageView({ hasContinuation: true })} />);

  await openActionsMenu(component);
  await Promise.all(
    [UNDO_CONTINUE, REVERT_CONTINUE].map(async (label) => {
      const item = menuItem(page, label);
      await expect(item).toBeVisible();
      await expect(item).not.toHaveAttribute("aria-disabled", "true");
    }),
  );
});

test("a non-assistant row exposes NEITHER continuation item (only assistant replies continue)", async ({ mount, page }) => {
  const component = await mount(<MessageActionsRowStory message={makeMessageView({ role: "user", hasContinuation: true })} />);

  await openActionsMenu(component);
  await expect(menuItem(page, UNDO_CONTINUE)).toHaveCount(0);
  await expect(menuItem(page, REVERT_CONTINUE)).toHaveCount(0);
});

test("Undo last continuation fires undoContinue with this chatId + messageId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.undoContinue": () => null });
  const message = makeMessageView({ hasContinuation: true });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await openActionsMenu(component);
  await menuItem(page, UNDO_CONTINUE).click();

  await expect.poll(() => trpc.count("chat.undoContinue"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.undoContinue")).toMatchObject({ chatId: message.chatId, messageId: message.id });
});

test("Re-apply continuation fires revertContinue with this chatId + messageId", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.revertContinue": () => null });
  const message = makeMessageView({ hasContinuation: true });
  const component = await mount(<MessageActionsRowStory message={message} />);

  await openActionsMenu(component);
  await menuItem(page, REVERT_CONTINUE).click();

  await expect.poll(() => trpc.count("chat.revertContinue"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.revertContinue")).toMatchObject({ chatId: message.chatId, messageId: message.id });
});

test("a DISABLED (non-continued) item does not fire the mutation on click", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.undoContinue": () => null });
  const component = await mount(<MessageActionsRowStory message={makeMessageView({ hasContinuation: false })} />);

  await openActionsMenu(component);
  // A disabled Base UI MenuItem is aria-disabled (still clickable in the DOM) — force the click past the
  // menu's own pointer guard to prove the HANDLER's own `!hasContinuation` guard also holds.
  await menuItem(page, UNDO_CONTINUE).click({ force: true });

  await expect.poll(() => trpc.count("chat.undoContinue")).toBe(0);
});
