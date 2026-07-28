// CT: the composer's guided-generations WAND (task #27). Drives the PRODUCTION path through the real
// `<Composer>` (the `ComposerStory` precedent, composer.ct.tsx) — routeTrpc stubs the network, the wand
// fires the real `useGuidedActions`-backed mutations. Proves: the trigger's gated states (empty draft /
// mid-flight), each item dispatches its OWN verb with the draft text as guidance (then clears the
// draft), swipe/continue's tail-assistant gate, the impersonate person picker, and — the #8 grey-out
// redesign — that a DRAFT renders the SAME four items with swipe/continue/impersonate DISABLED (never a
// swapped "Guide the opening" sibling), where "Guided response" routes to chat.startChat pre-commit.
//
// The trigger button is inline (component-scoped); the dropdown POPUP renders through a Base UI
// Portal, so every menu-item assertion uses the PAGE locator (`page.getByRole`), never `component` —
// the same split `tests/ui/primitives/menu/menu.ct.tsx` already established.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { ComposerStory } from "../_ct-stories";
import { COMPOSER_CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures";

// A `chat.getChat` roster member (F5 speaker submenu) — the speak-as-select.ct.tsx shape, homed here for
// the wand's multi-room "Guided response" submenu.
function character(key: string, name: string): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
  };
}
function roster(...members: unknown[]): unknown {
  return { participants: members };
}

// The disabled-item unlock reasons (owner ruling: name the unlock, not just "unavailable"). A DRAFT unlocks
// on the first send; a COMMITTED chat with no assistant tail needs an assistant reply to target.
const FIRST_SEND_UNLOCK = /send the first message/u;
const ASSISTANT_REPLY_UNLOCK = /assistant reply/u;

test("the wand trigger is disabled on an empty draft", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await expect(component.getByRole("button", { name: "Guided generations" })).toBeDisabled();
});

test("typing a draft enables the trigger; it opens to the committed-chat items", async ({ mount, page }) => {
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

test("Guided response fires chat.generate with the draft as guidance, then clears the composer", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.generate": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("hint at the letter");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.generate"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      guided: { action: "response", input: "hint at the letter" },
    });
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

test("Guided swipe/continue are disabled with no tail assistant message to target — reason names the unlock", async ({ mount, page }) => {
  // The default unstubbed `chat.listMessages` resolves `null` (routeTrpc header contract) — no tail.
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("steer it darker");
  await component.getByRole("button", { name: "Guided generations" }).click();

  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toBeDisabled();
  // On a COMMITTED chat with no assistant tail the reason names the assistant-reply unlock (not first-send).
  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toHaveAttribute("title", ASSISTANT_REPLY_UNLOCK);
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toHaveAttribute("title", ASSISTANT_REPLY_UNLOCK);
});

test("Guided swipe fires chat.swipe with the tail assistant messageId + guidance", async ({ mount, page }) => {
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

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.swipe"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      messageId: tail.id,
      guided: { action: "swipe", input: "more tension" },
    });
});

test("Guided continue fires chat.continueTurn with the tail assistant messageId + guidance", async ({ mount, page }) => {
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

  await expect.poll(() => trpc.count("chat.continueTurn"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.continueTurn"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      messageId: tail.id,
      guided: { action: "continue", input: "keep going softly" },
    });
});

test("Impersonate's person submenu fires chat.impersonate with the picked person", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.impersonate": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("ask about the ruins");
  await component.getByRole("button", { name: "Guided generations" }).click();
  const impersonateTrigger = page.getByRole("menuitem", { name: "Impersonate" });
  await impersonateTrigger.hover();
  await page.getByRole("menuitem", { name: "3rd person" }).click();

  await expect.poll(() => trpc.count("chat.impersonate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.impersonate"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      guided: { action: "impersonate", input: "ask about the ruins", person: "third" },
    });
});

// #8 grey-out: a DRAFT is the SAME menu as committed — four items, with swipe/continue/impersonate DISABLED
// (no canon tail / no committed turn), never a swapped "Guide the opening" sibling. The one live item,
// "Guided response", routes to chat.startChat (opening:"generate") pre-commit — same label + intent as the
// committed chat.generate, the promotion just picks the verb.
test("draft handle: SAME four items, swipe/continue/impersonate disabled — no swapped sibling menu", async ({ mount, page }) => {
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByLabel("Message", { exact: true }).fill("start mid-chase");
  await component.getByRole("button", { name: "Guided generations" }).click();

  // The old swapped sibling label is gone — the committed inventory renders on a draft too.
  await expect(page.getByRole("menuitem", { name: "Guide the opening" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Guided response" })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Impersonate" })).toBeDisabled();

  // Owner ruling: every disabled item explains itself on hover naming the unlock. On a draft that's the
  // first-send unlock (Base UI renders the item aria-disabled, so `title` surfaces on hover).
  await expect(page.getByRole("menuitem", { name: "Guided swipe" })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
  await expect(page.getByRole("menuitem", { name: "Guided continue" })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
  await expect(page.getByRole("menuitem", { name: "Impersonate" })).toHaveAttribute("title", FIRST_SEND_UNLOCK);
});

test("draft handle: 'Guided response' fires chat.startChat with a forced generate + the steer, then clears", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.startChat": () => ({ chat: { id: COMPOSER_CHAT_ID } }),
  });
  const component = await mount(<ComposerStory committed={false} />);

  await component.getByLabel("Message", { exact: true }).fill("start mid-chase");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).click();

  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.startChat"))
    .toMatchObject({
      opening: "generate",
      guided: { action: "opening", input: "start mid-chase" },
    });
  await expect(component.getByLabel("Message", { exact: true })).toHaveValue("");
});

// F1 + owner ruling 2026-07-25 — Rewrite OPENS a modal (instruction box + REWRITE_TOGGLES catalog). Apply
// composes the selected toggle fragments + the free text into ONE steer and fires the SAME chat.swipe +
// guided{action:"rewrite"} on the tail assistant message, so the correction lands as a NEW VARIANT.

// The Rewrite menu item opens the modal, pre-seeded from the composer draft; Apply fires the composed steer.
test("Rewrite opens the modal pre-seeded from the draft; Apply fires chat.swipe + guided{action:'rewrite'} (F1)", async ({ mount, page }) => {
  const tail = makeMessageView({ chatId: COMPOSER_CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("drop the anachronism, keep the tone");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Rewrite" }).click();

  // The modal is open with the instruction pre-seeded from the composer draft (the existing gesture is kept).
  const instruction = page.getByRole("textbox", { name: "Correction instruction" });
  await expect(instruction).toBeVisible();
  await expect(instruction).toHaveValue("drop the anachronism, keep the tone");

  // Apply fires the composed steer (no toggles selected ⇒ just the terminated instruction).
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.swipe"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      messageId: tail.id,
      guided: { action: "rewrite", input: "drop the anachronism, keep the tone." },
    });
});

// The toggle catalog composes: selected toggles' fragments join (catalog order) then the free text, into the
// ONE fired steer string — trpc.lastInput pins the exact composed value.
test("Rewrite toggles compose their fragments + the free text into the fired steer (F1)", async ({ mount, page }) => {
  const tail = makeMessageView({ chatId: COMPOSER_CHAT_ID, role: "assistant" });
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage([tail]),
    "chat.swipe": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("keep the plot beats");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Rewrite" }).click();

  // Flip two toggles (declared BEFORE "keep the plot beats" appends): "More concise" (id concise, first in
  // the catalog) and "Past tense" (id past-tense). Composition order is CATALOG order, not click order.
  await page.getByRole("switch", { name: "Past tense" }).click();
  await page.getByRole("switch", { name: "More concise" }).click();
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect.poll(() => trpc.count("chat.swipe"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.swipe"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      messageId: tail.id,
      guided: {
        action: "rewrite",
        input: "Make it more concise and tighter — cut filler while keeping the substance. Rewrite entirely in the past tense. keep the plot beats.",
      },
    });
});

// Rewrite disables with no tail assistant reply to correct (same gate as swipe/continue).
test("Rewrite is disabled with no tail assistant message to correct (F1)", async ({ mount, page }) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("fix it");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await expect(page.getByRole("menuitem", { name: "Rewrite" })).toBeDisabled();
});

// F3 — a FAILED guided mutation must NOT eat the typed steer (the source restores the input in `finally`).
// The wand clears the draft at fire time; on the mutation error the fired text is restored to the composer.
// RED on the old fireAndClear, which cleared unconditionally with no restore path.
test("a failed guided response restores the typed steer to the composer (F3)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.generate": () => trpcError({ message: "provider down" }) });
  const component = await mount(<ComposerStory />);

  const box = component.getByLabel("Message", { exact: true });
  await box.fill("hint at the letter");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).click();

  // Cleared optimistically at fire time, then restored once the mutation rejects.
  await expect(box).toHaveValue("hint at the letter");
});

// F3 — the fired steer joins the session recovery ring; re-opening the wand offers it back under "Recent
// steers", and picking it refills the composer (it does not re-fire — the user re-aims it).
test("a fired steer is recallable from Recent steers and refills the composer (F3)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.generate": () => ({ ok: true }) });
  const component = await mount(<ComposerStory />);

  const box = component.getByLabel("Message", { exact: true });
  await box.fill("make it rain");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).click();
  await expect(box).toHaveValue("");

  // Type something else, open the wand, recall the earlier steer.
  await box.fill("unrelated");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Recent steers" }).hover();
  await page.getByRole("menuitem", { name: "make it rain" }).click();

  await expect(box).toHaveValue("make it rain");
});

// F5 — steer + a chosen speaker in ONE chat.generate. In a multi-character room "Guided response" is a
// speaker submenu; picking a member sends BOTH the guided steer and that speakerCharacterId on the wire.
// RED on the old wand, which fired chat.generate with no speaker (the two actions were uncombinable).
test("a multi-room 'Guided response' sends the steer + chosen speaker on ONE chat.generate (F5)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
    "chat.generate": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("respond to the threat");
  await component.getByRole("button", { name: "Guided generations" }).click();
  await page.getByRole("menuitem", { name: "Guided response" }).hover();
  await page.getByRole("menuitem", { name: "Bryn" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.generate"))
    .toMatchObject({
      chatId: COMPOSER_CHAT_ID,
      speakerCharacterId: "character_bryn",
      guided: { action: "response", input: "respond to the threat" },
    });
});

test("the wand trigger is disabled while a turn is mid-flight, even with draft text", async ({ mount }) => {
  const component = await mount(<ComposerStory />);
  await component.getByLabel("Message", { exact: true }).fill("steer it darker");
  await expect(component.getByRole("button", { name: "Guided generations" })).toBeEnabled();

  await component.getByTestId("drive-begin").click();
  await component.getByTestId("drive-delta").click();

  await expect(component.getByRole("button", { name: "Guided generations" })).toBeDisabled();
});

// ── P5 — the GAME affordances (the Plot submenu + the one-shot "Offer choices") ───────────────────

// A game-chat `chat.getChat` (the rpg pointer non-null) — the wand's game-ness read.
function gameRoster(): unknown {
  return { participants: [character("aria", "Aria")], rpg: { gameId: "rpg_game_ct", mode: "lite", status: "active" } };
}
function gameView(plotProgression: boolean): unknown {
  return {
    id: "rpg_game_ct",
    chatId: COMPOSER_CHAT_ID,
    mode: "lite",
    status: "active",
    trackersReadOnly: false,
    extractionMode: "reliable",
    publicConfig: { statProfile: { attributes: [] }, immersiveHtml: true, cyoa: false, cyoaChoiceBehavior: "compose", plotProgression },
  };
}

test("a GAME chat opens the wand text-lessly; a Plot steer fires chat.generate with the gameSteer KIND", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => gameRoster(),
    "rpg.getGame": () => gameView(true),
    "chat.generate": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  // Empty composer, but a game chat — the trigger is ENABLED (the game items fire a picked KIND).
  const trigger = component.getByRole("button", { name: "Guided generations" });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  // The text-consuming primary item disables with the named unlock; the game items are live.
  await expect(page.getByRole("menuitem", { name: "Guided response" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Plot" }).hover();
  await page.getByRole("menuitem", { name: "Grounded twist" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.generate")).toMatchObject({ chatId: COMPOSER_CHAT_ID, guided: { action: "response", gameSteer: "twist" } });
});

test("'Offer choices' (M5 one-shot) fires gameSteer:'choices'; the Plot submenu is ABSENT when the knob is off", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => gameRoster(),
    "rpg.getGame": () => gameView(false),
    "chat.generate": () => ({ ok: true }),
  });
  const component = await mount(<ComposerStory />);

  await component.getByRole("button", { name: "Guided generations" }).click();
  // plotProgression OFF ⇒ NO Plot submenu (applicability — absent, never a disabled twin)…
  await expect(page.getByRole("menuitem", { name: "Plot" })).toHaveCount(0);
  // …but the one-shot "Offer choices" rides every game chat (M5 — independent of the standing cyoa mode).
  await page.getByRole("menuitem", { name: "Offer choices" }).click();

  await expect.poll(() => trpc.count("chat.generate"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.generate")).toMatchObject({ chatId: COMPOSER_CHAT_ID, guided: { action: "response", gameSteer: "choices" } });
});
