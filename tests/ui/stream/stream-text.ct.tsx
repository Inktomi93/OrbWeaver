// CT: the stream seal's plain-text display (ui-package-design §6.3.1) — the TTFT shimmer before any
// content, `useSmoothText`'s paced reveal once characters arrive, and the reduced-motion passthrough.
//
// `StreamText`'s own root IS the mounted element (no wrapping div) — assertions target the `mount()`
// locator directly (`component`), never `component.locator(...)`, which searches DESCENDANTS.
import { StreamText } from "@orb/ui/stream";
import { expect, test } from "@playwright/experimental-ct-react";

const LONG_TEXT = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");

test("TTFT: shows the shimmer before any text has arrived", async ({ mount }) => {
  const component = await mount(
    <StreamText text="" status="streaming" shimmerLabel="Generating a reply…" />,
  );
  await expect(component).toHaveAttribute("data-slot", "stream-shimmer");
  await expect(component).toHaveAccessibleName("Generating a reply…");
});

test("reveals progressively: a slow-paced target is not fully visible immediately, then catches up", async ({
  mount,
}) => {
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={10} />);
  // Immediately after mount, the pacer hasn't ticked yet — the full target isn't on screen (either
  // the shimmer is still showing, or a not-yet-caught-up prefix is).
  await expect(component).not.toHaveText(LONG_TEXT);
  // The backlog-drain catch-up (~1s time constant, ui-package-design §6.3.1) lands the full text
  // well within the default assertion timeout.
  await expect(component).toHaveText(LONG_TEXT);
  await expect(component).toHaveAttribute("data-slot", "stream-text");
});

test("reduced motion: the target is revealed instantly, with no pacing lag", async ({
  mount,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<StreamText text={LONG_TEXT} status="streaming" cps={1} />);
  await expect(component).toHaveText(LONG_TEXT);
});

test("done status renders the full text immediately, with no shimmer", async ({ mount }) => {
  const component = await mount(<StreamText text="already complete" status="done" />);
  await expect(component).toHaveAttribute("data-slot", "stream-text");
  await expect(component).toHaveText("already complete");
});
