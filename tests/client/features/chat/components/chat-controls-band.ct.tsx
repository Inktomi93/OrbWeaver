// CT: the S1 in-chat CONTROL band (interaction-direction-spec.md §3-S1) — THE MOUNT MATRIX.
//
// Every row drives the PRODUCTION path: a `chat-controls` source registry → the real
// `makeChatControlsContribution` → the chat-surface registry → the real `ChatRoomSurface`'s
// `above-composer` anchor → the real band. Nothing here mounts the band directly, because the property
// under test is the SEAM, not the component.
//
// The four laws proven here, each with its discriminator:
//   1. ZERO SOURCES RENDER NOTHING — no band, and the room's above-composer wrapper does not exist either
//      (a body returning `null` would leave that wrapper standing; the `when` predicate is what makes the
//      page identical to a build with no S1 at all). A registered source publishing an EMPTY list is the
//      neighbouring arm: the band mounts and paints no chrome.
//   2. BUSY IS PER MODE — a turn in flight disables the SEND chip (reason on `title`) while the COMPOSE
//      chip beside it stays live and the EXECUTE chip stays live. A band that reused the `:::choices`
//      block's blanket rule would pass the send arm and fail both others.
//   3. THE CAPS — one visible card + "+N pending"; four chips + "+N more".
//   4. THE STACK — cards above chips, asserted by GEOMETRY, from a fixture that publishes the chip FIRST
//      so DOM order cannot accidentally produce the right answer.
//
// Assertions go through accessible names, rendered text and geometry — @orb/ui primitives drop
// `data-testid` (the slot-only seal), so the band's own `data-slot` marks are used for structure only.

import type { CastEntry, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatControlsStory } from "../_ct-stories.tsx";
import { makeMessagesPage, makeMessageView } from "../fixtures.ts";

const BAND = '[data-slot="chat-controls"]';
const ABOVE_COMPOSER = '[data-slot="chat-above-composer"]';
const CARDS = '[data-slot="chat-control-cards"]';
const CHIPS = '[data-slot="chat-control-chips"]';

/** The room's floor reads: the transcript, the roster, and the divider's present-tense preview (an
 *  unlisted proc's `data: null` default is out-of-contract for the last one and crashes the surface). */
function routeRoom(
  page: Page,
  extra: Record<string, unknown> = {},
): Promise<{ readonly count: (p: string) => number; readonly lastInput: (p: string) => unknown }> {
  return routeTrpc(page, {
    "chat.previewContextFit": (): unknown => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: null;
      cast: readonly CastEntry[];
      group: GroupConfig;
    } => ({ participants: [], anchorPersonaId: null, cast: [], group: DEFAULT_GROUP_CONFIG }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_controls_room"), role: "assistant", content: "The corridor forks.", seq: 1 })]),
    "chat.send": (): unknown => ({ ok: true }),
    ...extra,
  });
}

test("ZERO sources: no control band, and no above-composer wrapper either (the room is unchanged)", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory source="none" />);

  // The room is really rendered (the discriminator — an empty assertion set would pass on a blank mount).
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  await expect(component.locator(BAND)).toHaveCount(0);
  await expect(component.locator(ABOVE_COMPOSER)).toHaveCount(0);
});

test("a registered source publishing NOTHING mounts the band and paints no chrome", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="empty" />);

  await expect(component.locator(BAND)).toHaveCount(1);
  await expect(component.locator(CARDS)).toHaveCount(0);
  await expect(component.locator(CHIPS)).toHaveCount(0);
});

test("chips render their labels in one row", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  await expect(component.getByRole("button", { name: "Draw your blade" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Time skip" })).toBeVisible();
  await expect(component.locator(CHIPS)).toHaveCSS("flex-direction", "row");
});

test("send mode: a chip click fires chat.send with the chip's text and leaves the composer draft alone", async ({ mount, page }) => {
  const trpc = await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  await component.getByRole("button", { name: "Draw your blade" }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  // ONESHOT-OK: the poll above already settled the recorder for this proc — the call is recorded, so its
  // input is a fixed value, not mutable async state.
  expect((trpc.lastInput("chat.send") as { readonly content?: string }).content).toBe("I draw my blade.");
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

test("compose mode: a chip click seeds THIS room's composer draft and fires NO send", async ({ mount, page }) => {
  const trpc = await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  await component.getByRole("button", { name: "Time skip" }).click();

  const composer = component.getByRole("textbox", { name: "Message" });
  await expect(composer).toHaveValue("Some hours later,");
  await expect(composer).toBeFocused();
  // ONESHOT-OK: a NEGATIVE about a synchronous click path that has already produced its full effect (the
  // draft landed and focus moved, both asserted web-first above) — there is no later moment at which a send
  // this click did not make could appear.
  expect(trpc.count("chat.send")).toBe(0);
});

test("BUSY IS PER MODE: a turn in flight disables the send chip with its reason; compose stays live", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);
  const sendChip = component.getByRole("button", { name: "Draw your blade" });
  const composeChip = component.getByRole("button", { name: "Time skip" });
  await expect(sendChip).toBeEnabled();

  // The exact call the chat-bus reducer makes on `turnStarted`.
  await component.getByTestId("drive-turn-begin").click();

  await expect(sendChip).toBeDisabled();
  await expect(sendChip).toHaveAttribute("title", "Wait for the current reply to finish, then pick");
  // THE DISCRIMINATOR: writing a draft is always legal, so the compose chip is untouched by the turn.
  await expect(composeChip).toBeEnabled();
});

test("execute mode: NOT turn-gated — it runs its own verb while a turn streams", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="execute" />);
  const roll = component.getByRole("button", { name: "Roll 1d20" });
  await component.getByTestId("drive-turn-begin").click();

  await expect(roll).toBeEnabled();
  await roll.click();
  // The SOURCE's own runner ran (the band never invents it).
  await expect(component.getByTestId("ct-control-source-ran")).toHaveText("1");
});

test("execute mode: disabled ONLY while its own call pends, with the running reason", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="execute-pending" />);
  const roll = component.getByRole("button", { name: "Roll 1d20" });

  await expect(roll).toBeDisabled();
  await expect(roll).toHaveAttribute("title", "Already running — wait for it to finish");
});

test("the chips row caps its display and discloses the remainder", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips-over-cap" />);

  await expect(component.locator(CHIPS).getByRole("button")).toHaveCount(4);
  await expect(component.getByText("+2 more")).toBeVisible();
  await expect(component.getByRole("button", { name: "Chip five" })).toHaveCount(0);
});

test("ONE visible card, its dismiss, and the pending count for the rest", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="cards-stacked" />);

  // The NEWEST (last published) card is the visible one.
  await expect(component.getByText("The newer ask")).toBeVisible();
  await expect(component.getByText("The older ask")).toHaveCount(0);
  await expect(component.getByText("+1 pending")).toBeVisible();

  // The dismiss is explicit, named, and really retires the card — the one behind it takes its place.
  await component.getByRole("button", { name: "Dismiss The newer ask" }).click();
  await expect(component.getByText("The older ask")).toBeVisible();
  await expect(component.getByText("+1 pending")).toHaveCount(0);

  // Dismissing the last one empties the band's chrome entirely.
  await component.getByRole("button", { name: "Dismiss The older ask" }).click();
  await expect(component.locator(CARDS)).toHaveCount(0);
});

test("a card's action carries its detail and runs the source's own handler", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="card" />);

  await expect(component.getByText("A short catch-up on the last scene.")).toBeVisible();
  await component.getByRole("button", { name: "Do it" }).click();
  await expect(component.getByTestId("ct-control-source-ran")).toHaveText("1");
});

test("THE STACK: cards render ABOVE chips even when the chip was published first", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="mixed" />);

  const cards = component.locator(CARDS);
  const chips = component.locator(CHIPS);
  await expect(cards).toBeVisible();
  await expect(chips).toBeVisible();
  const cardBox = await cards.boundingBox();
  const chipBox = await chips.boundingBox();
  expect(cardBox, "the card stack must have a box to compare").not.toBeNull();
  expect(chipBox, "the chip row must have a box to compare").not.toBeNull();
  expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual(chipBox?.y ?? 0);
});

test("the band sits between the transcript and the composer (the room's own track)", async ({ mount, page }) => {
  await routeRoom(page);

  const component = await mount(<ChatControlsStory fixture="chips" />);

  const band = component.locator(BAND);
  const composer = component.getByRole("textbox", { name: "Message" });
  await expect(band).toBeVisible();
  const bandBox = await band.boundingBox();
  const composerBox = await composer.boundingBox();
  expect((bandBox?.y ?? 0) + (bandBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0);
});
