// CT: the jump-to-latest pill (jump-to-latest-pill.tsx) + its `useJumpToLatest` integration. Proves
// the pill chrome (inert-when-hidden a11y, singular/plural label, held-count, click + keyboard), AND —
// over the REAL `<MessageList>` seal — the two P0 acceptance criteria side-eye reproduced 2026-07-13:
// the pill state derives from the reader's ACTUAL scroll position (settle-sampled geometry), not the
// seal's follow-INTENT signal which desyncs when virtual-core writes scrollTop during a re-measure —
//   #1 scrolled far up + an arrival must KEEP the pill shown with the count (not "caught up");
//   #2 a click must jump to the tail AND hide the pill.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { JumpToLatestPillStory, JumpToLatestRegressionStory } from "../_jump-to-latest-stories.tsx";

const PILL = '[data-slot="jump-to-latest"]';
const NEW_MESSAGE = /new message/;

/** Snapshot the handle's live distance-from-end into the readout, returning it (auto-retryable). */
async function readDistance(component: Locator): Promise<number> {
  await component.getByTestId("read-dist").click();
  return Number(await component.getByTestId("dist").innerText());
}

test("hidden by default: inert + out of the tab order + out of the AT tree", async ({ mount }) => {
  const component = await mount(<JumpToLatestPillStory />);
  const wrapper = component.locator('[data-slot="jump-to-latest"]');
  const button = wrapper.locator("button");
  await expect(wrapper).toHaveAttribute("aria-hidden", "true");
  await expect(button).toHaveAttribute("tabindex", "-1");
});

test("shown: a real, tab-reachable button with a singular/plural count label", async ({ mount }) => {
  const component = await mount(<JumpToLatestPillStory />);
  const button = component.locator('[data-slot="jump-to-latest"] button');

  await component.getByTestId("ctl-inc").click(); // count → 1
  await component.getByTestId("ctl-toggle").click(); // visible
  await expect(component.locator('[data-slot="jump-to-latest"]')).not.toHaveAttribute("aria-hidden");
  await expect(button).toHaveAttribute("tabindex", "0");
  await expect(button).toHaveAccessibleName("Jump to latest, 1 new message");

  await component.getByTestId("ctl-inc").click(); // count → 2
  await expect(button).toHaveAccessibleName("Jump to latest, 2 new messages");
});

test("click fires onJump", async ({ mount }) => {
  const component = await mount(<JumpToLatestPillStory />);
  await component.getByTestId("ctl-inc").click();
  await component.getByTestId("ctl-toggle").click();
  await component.locator('[data-slot="jump-to-latest"] button').click();
  await expect(component.getByTestId("jumps")).toHaveText("1");
});

test("keyboard: the pill is focusable and Enter activates it (real <button> semantics)", async ({ mount }) => {
  const component = await mount(<JumpToLatestPillStory />);
  await component.getByTestId("ctl-inc").click();
  await component.getByTestId("ctl-toggle").click();
  const button = component.locator('[data-slot="jump-to-latest"] button');
  await button.focus();
  await expect(button).toBeFocused();
  await button.press("Enter");
  await expect(component.getByTestId("jumps")).toHaveText("1");
  await button.press("Space");
  await expect(component.getByTestId("jumps")).toHaveText("2");
});

test("held-count: the label keeps the last count while hiding (no '0 new messages' flash)", async ({ mount }) => {
  const component = await mount(<JumpToLatestPillStory />);
  const button = component.locator('[data-slot="jump-to-latest"] button');
  await component.getByTestId("ctl-inc").click();
  await component.getByTestId("ctl-inc").click(); // count → 2
  await component.getByTestId("ctl-toggle").click(); // visible
  await expect(button).toHaveAccessibleName("Jump to latest, 2 new messages");

  // Count resets to 0 as the reader returns to the tail — the label must NOT flash "0".
  await component.getByTestId("ctl-zero").click();
  await expect(button).toHaveAccessibleName("Jump to latest, 2 new messages");
});

test("P0#1: scrolled far up + a message arrives → pill STAYS visible with the count (not 'caught up')", async ({ mount }) => {
  const component = await mount(<JumpToLatestRegressionStory />);
  const scroll = component.locator('[data-slot="message-list-scroll"]');
  await expect(scroll).toBeVisible();

  // Scroll to the very top; wait for the settle sampler to register "not at tail" (no fixed timeout).
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(component.getByTestId("at-tail")).toHaveText("false");

  // A message arrives below the fold.
  await component.getByTestId("arrive").click();

  // The reader is still far from the tail AND the pill is shown with the count.
  await expect.poll(() => readDistance(component)).toBeGreaterThan(500);
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");
  await expect(component.locator(`${PILL} button`)).toHaveAccessibleName(NEW_MESSAGE);
});

test("P0#1 (settle race): live→false ONE commit before the canon bump must NOT drop the count to 0", async ({ mount }) => {
  const component = await mount(<JumpToLatestRegressionStory />);
  const scroll = component.locator('[data-slot="message-list-scroll"]');
  await expect(scroll).toBeVisible();

  await scroll.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(component.getByTestId("at-tail")).toHaveText("false");

  const pillButton = component.locator(`${PILL} button`);

  // A live turn streams below the fold: `live` true, canon count unchanged (the ghost is not canon).
  await component.getByTestId("toggle-live").click();
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");
  await expect(pillButton).toHaveAccessibleName("Jump to latest, 1 new message");

  // THE RACE: the turn-phase store commits `live→false` a full render BEFORE the canon query grows.
  // A raw `messagesCount - snapshot + live` reads 0 here and self-hides; the latch must hold it at 1.
  await component.getByTestId("toggle-live").click();
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");
  await expect(pillButton).toHaveAccessibleName("Jump to latest, 1 new message");

  // The committed reply lands (canon +1) — still one unread, still shown.
  await component.getByTestId("arrive").click();
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");
  await expect(pillButton).toHaveAccessibleName("Jump to latest, 1 new message");

  // A second genuine arrival raises the latch — the count reaches 2.
  await component.getByTestId("toggle-live").click();
  await expect(pillButton).toHaveAccessibleName("Jump to latest, 2 new messages");
});

test("PD-147: an armed pin-prompt pin suppresses the false pill (spacer void ≠ scrolled away)", async ({ mount }) => {
  const component = await mount(<JumpToLatestRegressionStory />);
  const scroll = component.locator('[data-slot="message-list-scroll"]');
  await expect(scroll).toBeVisible();

  // Scroll away so the raw geometry reads "not at tail" and the pill would normally fire on an arrival —
  // this stands in for the pin spacer's ~viewport-tall void inflating distance-from-bottom.
  await scroll.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(component.getByTestId("at-tail")).toHaveText("false");
  await component.getByTestId("arrive").click();
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");

  // Arm the pin: the surface knows the prompt is pinned + streaming, so the pill must treat the reader
  // as at-tail (newest content is on-screen) and hide — no "N new" over visible content. The armed
  // window also syncs the unread snapshot to the live count.
  await component.getByTestId("toggle-pin").click();
  await expect(component.getByTestId("at-tail")).toHaveText("true");
  await expect(component.locator(PILL)).toHaveAttribute("aria-hidden", "true");

  // Un-pin without moving: the geometry is still scrolled up (at-tail false), but the snapshot synced
  // through the armed window, so the earlier "1 new" does NOT resurrect — the pill stays hidden.
  await component.getByTestId("toggle-pin").click();
  await expect(component.getByTestId("at-tail")).toHaveText("false");
  await expect(component.locator(PILL)).toHaveAttribute("aria-hidden", "true");
});

test("P0#2: clicking the pill jumps to the tail AND hides the pill", async ({ mount }) => {
  const component = await mount(<JumpToLatestRegressionStory />);
  const scroll = component.locator('[data-slot="message-list-scroll"]');
  await expect(scroll).toBeVisible();

  await scroll.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(component.getByTestId("at-tail")).toHaveText("false");
  await component.getByTestId("arrive").click();
  await expect(component.locator(PILL)).not.toHaveAttribute("aria-hidden");

  // Click the pill → it scrolls to the tail, the settle sampler re-reads "at tail", and it hides.
  await component.locator(`${PILL} button`).click();
  await expect(component.getByTestId("at-tail")).toHaveText("true");
  await expect.poll(() => readDistance(component)).toBeLessThanOrEqual(2);
  await expect(component.locator(PILL)).toHaveAttribute("aria-hidden", "true");
});
