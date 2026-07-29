// CT: the composer's GUIDED CLUSTER (W-D — replaces composer-wand.ct). Drives the PRODUCTION path through
// the real `<Composer>` (the ComposerStory precedent): routeTrpc stubs the network, the cluster fires the
// real `useGuidedActions` / `useComposerUtilities` mutations. Proves: the four dual-mode icons ALWAYS render
// (never hidden/swapped); Response fires generate (committed) / startChat (draft), empty AND with the
// afterAssistant nudge flag on an assistant tail; Swipe KEEPS the steer (no composer clear — the reroll
// ergonomic) while Response/Continue CONSUME it; Simple send fires chat.commitMessage; Impersonate is
// NON-PERSISTING — it drafts the user's next line via chat.impersonateDraft and FILLS the composer for
// review (draft chat: commit with the DEFAULT opening so the greeting is PRESERVED, then draft the response,
// then fill the PROMOTED composer via the new chatId's draft store); the phase matrix disables swipe/continue
// on a draft with a legible reason (Impersonate + Response stay live).
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
// P3-dualmode: the guided icons' accessible name reflects the active mode — "Guided …" when the composer has text.
const RESPONSE_GUIDED = "Guided generate reply";
const RESPONSE_DRAFT = "Generate opening";
const TAIL_ASSISTANT_ID = castId<MessageId>("message_ct_tail_assistant");
const NEEDS_REPLY = /needs a reply to reroll/iu;
const PLAIN_REROLL = /plain reroll/iu;
const SWIPE_DISABLED_TITLE = /^Swipe — needs a reply to reroll/u;
const CONTINUE_DISABLED_TITLE = /^Continue — needs a reply to continue/u;
const ANY_ATTR = /.*/u;
const GROUP_LABELS = ["Input", "Reply", "Continuation", "Images"] as const;

test("all four guided icons ALWAYS render on a committed chat (never hidden/swapped)", async ({ mount }) => {
  const component = await mount(<ComposerStory />); // committed, empty composer
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeVisible();
  // Wand v2: the ⟳ icon is labeled "Swipe" (Regenerate moved into the ✨ menu as a plain reroll).
  await expect(component.getByRole("button", { name: "Swipe" })).toBeVisible();
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
  // P3-dualmode: with text present the icon is in guided mode and its accessible name says so.
  await component.getByRole("button", { name: RESPONSE_GUIDED }).click();

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
  const btn = component.getByRole("button", { name: "Swipe with this steering" });
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // The steer STAYS — the reroll ergonomic (reroll again without re-typing).
  await expect(box).toHaveValue("darker tone");
});

test("phase matrix: a DRAFT disables Swipe/Continue with a legible reason; Response + Impersonate stay live", async ({ mount }) => {
  const component = await mount(<ComposerStory committed={false} />);
  // aria-disabled (focusableWhenDisabled) — visible + hoverable, never hidden.
  await expect(component.getByRole("button", { name: "Swipe" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Continue" })).toBeDisabled();
  // Response is always live (Generate opening on a draft); Impersonate now writes the USER's opening line, so
  // it's live on a draft too (firing commits the chat + fires impersonate — proven below).
  await expect(component.getByRole("button", { name: RESPONSE_DRAFT })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Impersonate" })).toBeEnabled();
});

// The disabled guided icons render aria-disabled (focusableWhenDisabled) — NOT native-disabled — so their
// hover `title` surfaces, and the title names WHAT the button is AND why it's off ("<Label> — <reason>").
test("a DRAFT's disabled Swipe/Continue are aria-disabled (not native) with a label + reason title", async ({ mount }) => {
  const component = await mount(<ComposerStory committed={false} />);
  const swipe = component.getByRole("button", { name: "Swipe" });
  // aria-disabled pattern: the accessibility-disabled attr is set, the NATIVE disabled attr is absent (so the
  // browser doesn't swallow the hover tooltip). Mirrors [[base-ui-disabled-menuitem-title]].
  await expect(swipe).toHaveAttribute("aria-disabled", "true");
  await expect(swipe).not.toHaveAttribute("disabled", ANY_ATTR);
  await expect(swipe).toHaveAttribute("title", SWIPE_DISABLED_TITLE);
  await expect(component.getByRole("button", { name: "Continue" })).toHaveAttribute("title", CONTINUE_DISABLED_TITLE);
});

test("Impersonate on a COMMITTED chat FILLS the composer with the drafted line and persists NOTHING", async ({ mount, page }) => {
  // The NON-PERSISTING draft verb returns { text }; the composer fills with it for review. No persist mutation.
  const trpc = await routeTrpc(page, { "chat.impersonateDraft": () => ({ text: "I step into the tavern, cloak dripping." }) });
  const component = await mount(<ComposerStory />); // committed, empty composer

  await component.getByRole("button", { name: "Impersonate" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();

  await expect.poll(() => trpc.count("chat.impersonateDraft"), { intervals: [20, 50, 100] }).toBe(1);
  // The drafted line FILLS the composer (the ST review flow) — the user edits + sends normally.
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("I step into the tavern, cloak dripping.");
  // NO user turn was persisted — the (removed) persisting verb never fires; only the non-persisting draft did.
  // ONESHOT-OK: the composer-fill assertion above proves the whole async flow COMPLETED; on a committed chat
  // `fireImpersonate` never calls `commitDraft`, so `chat.startChat` is provably never invoked (stable at 0).
  expect(trpc.count("chat.startChat")).toBe(0);
});

test("Impersonate on a DRAFT commits WITH the greeting preserved (no opening:none) then FILLS the promoted composer", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
    "chat.impersonateDraft": () => ({ text: "Good evening — is there a room to spare?" }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  // The perspective picker opens on the Impersonate trigger; pick 1st person.
  await component.getByRole("button", { name: "Impersonate" }).click();
  await page.getByRole("menuitem", { name: "1st person" }).click();

  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("chat.impersonateDraft"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: both polls above settled each recorder at exactly 1 call, so the inputs are stable at read.
  // GREETING PRESERVED — the commit uses the server's DEFAULT opening policy (NO `opening` field). The first
  // attempt sent `opening:"none"`, which seeded an EMPTY chat and lost the card greeting (the owner's bug #1).
  expect(trpc.lastInput("chat.startChat")).not.toHaveProperty("opening");
  // The draft fires against the freshly-committed chat id (empty composer ⇒ no steer object).
  const imp = trpc.lastInput("chat.impersonateDraft") as { chatId?: string; guided?: unknown };
  // ONESHOT-OK: the draft poll settled its recorder at 1; the input is stable at read.
  expect(imp.chatId).toBe(COMPOSER_CHAT_ID);
  expect(imp.guided).toBeUndefined();
  // The FILL LANDS (bug #2): the drafted line is written to the NEW chatId's composer-draft store, which the
  // PROMOTED composer (draft→committed, same scopeKey now the new id) reads — proving the fill survives the
  // navigation, not landing on the unmounted draft's stale onChange.
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("Good evening — is there a room to spare?");
});

test("Impersonate on a DRAFT with a typed steer threads the steer + person, preserves the greeting, and fills the promoted composer", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
    "chat.impersonateDraft": () => ({ text: "I greet the innkeeper with a warm smile." }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByRole("textbox", { name: "Message" }).fill("greet the innkeeper warmly");
  // With text present the icon is in guided mode ("Guided impersonate").
  await component.getByRole("button", { name: "Guided impersonate" }).click();
  await page.getByRole("menuitem", { name: "3rd person" }).click();

  await expect.poll(() => trpc.count("chat.impersonateDraft"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the draft AWAITS the commit, so once its recorder settled at 1 the startChat call already fired.
  // Greeting preserved — the commit carries NO `opening` field (the server default keeps the card greeting).
  expect(trpc.lastInput("chat.startChat")).not.toHaveProperty("opening");
  // ONESHOT-OK: the draft poll above settled its recorder at 1 — the input is stable at read.
  expect(trpc.lastInput("chat.impersonateDraft")).toMatchObject({
    chatId: COMPOSER_CHAT_ID,
    guided: { action: "impersonate", input: "greet the innkeeper warmly", person: "third" },
  });
  // The typed steer is CONSUMED and REPLACED by the drafted line in the PROMOTED composer (fill survives nav).
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("I greet the innkeeper with a warm smile.");
});

test("Regenerate lives in the ✨ menu and fires a PLAIN reroll of the tail assistant (no steer)", async ({ mount, page }) => {
  // Regenerate moved into the ✨ menu (owner). It's a plain reroll — chat.swipe with NO guided object.
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, { "chat.listMessages": () => makeMessagesPage([tail]), "chat.swipe": () => ({ ok: true }) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  await page.getByRole("menuitem", { name: "Regenerate" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll settled the recorder at exactly 1 call. A PLAIN reroll carries no steer object.
  const input = trpc.lastInput("chat.swipe") as { guided?: unknown };
  expect(input.guided).toBeUndefined();
});

test("Regenerate in the ✨ menu is disabled-with-reason when there's no assistant reply to reroll", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />); // committed, user/empty tail — no assistant tail
  await component.getByRole("button", { name: "Message tools" }).click();
  const regen = page.getByRole("menuitem", { name: "Regenerate" });
  await expect(regen).toBeDisabled();
  await expect(regen).toHaveAttribute("title", NEEDS_REPLY);
});

// P1-A: Regenerate must read APART from the top-row ⟳ Swipe icon — an enabled Regenerate carries a helper
// title that names it a PLAIN reroll (ignores the typed steer), so it is not the byte-identical twin of Swipe.
test("P1-A: an enabled Regenerate carries the plain-reroll helper (distinct from the steer-aware Swipe)", async ({ mount, page }) => {
  const tail = makeMessageView({ id: TAIL_ASSISTANT_ID, role: "assistant" });
  await routeTrpc(page, { "chat.listMessages": () => makeMessagesPage([tail]) });
  const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={TAIL_ASSISTANT_ID} />);

  await component.getByRole("button", { name: "Message tools" }).click();
  const regen = page.getByRole("menuitem", { name: "Regenerate" });
  await expect(regen).toBeEnabled();
  await expect(regen).toHaveAttribute("title", PLAIN_REROLL);
});

// P2-A: the menu is regrouped with labeled groups (Base UI wires each label to its group as an aria heading).
test("P2-A: the ✨ menu is grouped with labeled sections (Input · Reply · Continuation · Images)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await Promise.all(GROUP_LABELS.map((label) => expect(page.getByRole("group", { name: label })).toBeVisible()));
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

// ── P5 game steers, re-homed into the ✨ menu (owner: "game steers go in the magic wand") ─────────────────
// The cluster reads `chat.getChat.rpg` (engaged pointer ⇒ a live game) + `rpg.getGame.publicConfig.plotProgression`
// to decide which steers render; a plot steer fires chat.generate with a trusted-template gameSteer KIND.
const GAME_CHAT = { participants: [], rpg: { gameId: "rpg_game_ct_steer", engaged: true } };

test("game steers live in the ✨ menu (Plot submenu + Offer choices) and fire a gameSteer KIND on a game chat", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => GAME_CHAT,
    "rpg.getGame": () => ({ chatId: COMPOSER_CHAT_ID, publicConfig: { plotProgression: true } }),
    "chat.generate": () => ({}),
  });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();

  // The always-present Offer choices sits directly in the Plot group; the six plot steers nest under a Plot
  // submenu (side-eye P1-B). Open the submenu, then fire one.
  await expect(page.getByRole("menuitem", { name: "Offer choices" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Plot" }).click();
  await page.getByRole("menuitem", { name: "Advance the act" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll settled the recorder at exactly 1 call. The steer rides as a trusted-template KIND.
  expect(trpc.lastInput("chat.generate")).toMatchObject({ guided: { action: "response", gameSteer: "advance" } });
});

test("Plot submenu is APPLICABILITY-gated off when plotProgression is false (Offer choices still shows)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => GAME_CHAT,
    "rpg.getGame": () => ({ chatId: COMPOSER_CHAT_ID, publicConfig: { plotProgression: false } }),
  });
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  // The whole Plot submenu is absent (never a disabled twin); Offer choices always present on a game.
  await expect(page.getByRole("menuitem", { name: "Plot", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Offer choices" })).toBeVisible();
});

test("game steers are ABSENT in the ✨ menu on a non-game chat", async ({ mount, page }) => {
  await routeTrpc(page, {}); // no rpg pointer → not a game
  const component = await mount(<ComposerStory />);
  await component.getByRole("button", { name: "Message tools" }).click();
  await expect(page.getByRole("menuitem", { name: "Offer choices" })).toHaveCount(0);
});
