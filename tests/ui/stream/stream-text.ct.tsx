// CT: the stream seal's plain-text display (ui-package-design §6.3.1) — the TTFT shimmer before any
// content, `useSmoothText`'s paced reveal once characters arrive, and the reduced-motion passthrough.
//
// `StreamText`'s own root IS the mounted element (no wrapping div) — assertions target the `mount()`
// locator directly (`component`), never `component.locator(...)`, which searches DESCENDANTS.
import { StreamText } from "@orb/ui/stream";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";

const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");

test("TTFT: shows the shimmer before any text has arrived", async ({ mount }) => {
  const component = await mount(<StreamText text="" status="streaming" shimmerLabel="Generating a reply…" />);
  await expect(component).toHaveAttribute("data-slot", "stream-shimmer");
  await expect(component).toHaveAccessibleName("Generating a reply…");
  // RENDERED, not just present — the primitive-level guard complementing the surface-level
  // message-list-surface.ct.tsx pending-phase test (a collapsed-to-0-width shimmer is invisible even
  // though every assertion above still passes).
  await expect(component).toBeVisible();
  const box = await component.boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box?.width).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box?.height).toBeGreaterThan(0);
});

test("reveals progressively: a slow-paced target is not fully visible immediately, then catches up", async ({ mount }) => {
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={10} />);
  // Immediately after mount, the pacer hasn't ticked yet — the full target isn't on screen (either
  // the shimmer is still showing, or a not-yet-caught-up prefix is).
  await expect(component).not.toHaveText(LONG_TEXT);
  // The backlog-drain catch-up (~1s time constant, ui-package-design §6.3.1) lands the full text
  // well within the default assertion timeout.
  await expect(component).toHaveText(LONG_TEXT);
  await expect(component).toHaveAttribute("data-slot", "stream-text");
});

test("reduced motion: the target is revealed instantly, with no pacing lag", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={1} />);
  await expect(component).toHaveText(LONG_TEXT);
});

test("done status renders the full text immediately, with no shimmer", async ({ mount }) => {
  const component = await mount(<StreamText text="already complete" status="done" />);
  await expect(component).toHaveAttribute("data-slot", "stream-text");
  await expect(component).toHaveText("already complete");
});

test("hidden-tab flush: a backgrounded tab reveals the full target immediately, not paced", async ({ mount, page }) => {
  // cps=1 would take ~4 minutes to pace 240 chars — without the hidden-tab flush this assertion
  // would time out. rAF doesn't fire in a real hidden tab, so the pacer flushes on visibilitychange
  // instead of relying on a frame it will never get.
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={1} />);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(component).toHaveText(LONG_TEXT);
});

// A DIFFERENT stream of the same order of length — long enough that a cursor left at the end of
// LONG_TEXT would cover most of it, which is exactly the #1498 defect's shape.
const SECOND_TEXT = Array.from({ length: 40 }, (_, i) => `token${i}`).join(" ");
/** The window a stopped loop is observed OVER. ~24 vsyncs: a loop that re-arms cannot hide in it. */
const HIDDEN_OBSERVE_MS = 400;

/** A real elapsed wait, node-side (biome's `noPlaywrightWaitForTimeout`): the assertion below is the
 *  ABSENCE of frame requests, which has no state to wait FOR — the trace itself is the assertion. */
async function observeWindow(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, HIDDEN_OBSERVE_MS);
  });
}

/** Count every `requestAnimationFrame` the page asks for from here on. */
async function countFrameRequests(page: Page): Promise<void> {
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding — a counter this file writes and reads, not a fabricated view type. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const store = globalThis as unknown as { __orbRafCalls?: number };
    store.__orbRafCalls = 0;
    const native = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      store.__orbRafCalls = (store.__orbRafCalls ?? 0) + 1;
      return native(cb);
    };
  });
}

async function readFrameRequests(page: Page): Promise<number> {
  // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (the counter installed above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return await page.evaluate(() => (globalThis as unknown as { __orbRafCalls?: number }).__orbRafCalls ?? 0);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden: boolean) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isHidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

// #1498 — A HIDDEN TAB STOPS THE LOOP INSTEAD OF RE-ARMING IT. The hidden branch flushed the backlog and
// then unconditionally asked for another frame, so a tab that keeps receiving frames while
// `visibilityState` reads hidden (screen capture, a headless browser) burned a callback per vsync
// flushing a reveal nobody was watching. Stopping is safe because the return trip re-arms.
test("hidden tab: the frame loop STOPS while hidden and resumes when the tab comes back", async ({ mount, page }) => {
  await countFrameRequests(page);
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={1} />);
  await setHidden(page, true);
  // The flush is the settled state this barriers on — the loop is quiet only after it has happened.
  await expect(component).toHaveText(LONG_TEXT);

  const armedWhenHidden = await readFrameRequests(page);
  await observeWindow();
  expect(await readFrameRequests(page)).toBe(armedWhenHidden);

  // …AND THE LOOP IS NOT DEAD: back in view, new text is paced again rather than frozen at the flush.
  await setHidden(page, false);
  await component.update(<StreamText text={`${LONG_TEXT} and more arrived`} status="streaming" cps={1} />);
  await expect(component).toHaveText(`${LONG_TEXT} and more arrived`);
  expect(await readFrameRequests(page)).toBeGreaterThan(armedWhenHidden);
});

// #1498 — A SECOND STREAM STARTS AT ZERO. `shown`/the float cursor are per-MOUNT and the ghost row
// outlives a turn: with the cursor parked where the last stream ENDED, the first paint of the next one
// jumped straight to that many of ITS characters. The in-loop rewind could not catch it — that only fires
// when the new target is SHORTER than the old cursor, and it needs a frame that has not happened yet.
test("a second stream is paced from the beginning, not from where the last one ended", async ({ mount, page }) => {
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={1} />);
  await expect(component).toHaveText(LONG_TEXT);
  await component.update(<StreamText text={LONG_TEXT} status="done" cps={1} />);
  await expect(component).toHaveText(LONG_TEXT);

  // The defect is a FIRST PAINT, so it is recorded rather than polled for: every rendered length from the
  // restart onward lands in a trace that is READ once the second stream has fully settled.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding — the trace array this test writes and reads back. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const store = globalThis as unknown as { __orbRevealTrace?: number[] };
    store.__orbRevealTrace = [];
    new MutationObserver(() => {
      store.__orbRevealTrace?.push(document.body.textContent?.length ?? 0);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });

  await component.update(<StreamText text={SECOND_TEXT} status="streaming" cps={1} />);
  await expect(component).toHaveText(SECOND_TEXT);

  // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (the trace installed above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const trace = await page.evaluate(() => (globalThis as unknown as { __orbRevealTrace?: number[] }).__orbRevealTrace ?? []);
  // POSITIVE CONTROL: an observer that recorded nothing would make every claim below vacuously true.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the second stream is asserted fully rendered above, so the trace is a CLOSED history — a later sample could only append.
  expect(trace.length).toBeGreaterThan(0);
  // The reveal was SEEN near its start. A cursor carried over from the first stream shows ~LONG_TEXT.length
  // characters on the very first commit and never dips below it.
  expect(Math.min(...trace)).toBeLessThan(LONG_TEXT.length / 2);
});
