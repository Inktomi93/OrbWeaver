// CT: the TTFT reasoning affordance — force-open + ticking "Thinking… Ns" while thinking, auto-collapse
// to the frozen "Thought for Ns" the instant thinking ends, and a user toggle permanently overriding the
// auto behavior (UI-Gates §11.6 golden checkpoint companion; the client-determinism gate — the elapsed
// counter is a plain interval tick, never a wall-clock read, so `page.clock` drives it deterministically
// instead of a real 1000ms wait per tick).

import { expect, test } from "@playwright/experimental-ct-react";
import { ReasoningAnchorStory, ReasoningBlockStory } from "../_ct-stories.tsx";

const ONE_SECOND_MS = 1000;
const THINKING_LABEL = /Thinking/u;
const THOUGHT_LABEL = /Thought for/u;

// A tall trace, so an UNfixed (animated) collapse displaces the prose by hundreds of px — the
// `streaming-shape-churn.md` §8 fling was 350–677px. Newline-joined so the untrusted markdown seal
// renders many block paragraphs (real height, not one wrapped line).
const TALL_REASONING = Array.from({ length: 40 }, (_, i) => `Reasoning step ${i}: a full sentence of trace text to give the panel real height.`).join("\n\n");

// The prose is "anchored" if it sits within this many px of the row top after the collapse — i.e. just
// below the collapsed "Thought for Ns" header (~32px in production). An unfixed smooth fold, FROZEN by the
// injected long `--motion-layout` below, holds it hundreds of px lower.
const ANCHORED_CEILING_PX = 120;

test("TTFT: force-open with a ticking 'Thinking… Ns' label + shimmer before any reasoning is revealed", async ({ mount, page }) => {
  await page.clock.install();
  const component = await mount(<ReasoningBlockStory reasoning="" thinking={true} />);

  const trigger = component.getByRole("button", { name: "Thinking… 0s" });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByRole("status")).toBeVisible();

  await page.clock.runFor(ONE_SECOND_MS);
  await expect(component.getByRole("button", { name: "Thinking… 1s" })).toBeVisible();

  await page.clock.runFor(2 * ONE_SECOND_MS);
  await expect(component.getByRole("button", { name: "Thinking… 3s" })).toBeVisible();
});

test("reveals the growing reasoning trace as markdown while thinking", async ({ mount }) => {
  const component = await mount(<ReasoningBlockStory reasoning="Considering the **best** approach" thinking={true} />);
  await expect(component.getByText("best", { exact: false })).toBeVisible();
});

test("smoothStream off: the full reasoning trace is revealed instantly, unpaced, while thinking", async ({ mount }) => {
  // PD-146 — with `chat.smoothStream` off the reasoning block must NOT pace the reveal (useSmoothText is a
  // strict passthrough when disabled); the whole trace is present on the first render even mid-thinking.
  const full = "The complete reasoning trace shown all at once with no pacing whatsoever";
  const component = await mount(<ReasoningBlockStory reasoning={full} thinking={true} smoothStream={false} />);
  await expect(component.getByText(full)).toBeVisible();
});

test("smoothStream on: the reveal is paced (not instant), then completes as the pacer drains", async ({ mount, page }) => {
  // PD-146 — with `chat.smoothStream` on the reveal is routed through useSmoothText (rAF pacer). Unlike the
  // off case it is NOT a passthrough: at mount `shown=0`, so the full trace is absent until frames advance;
  // once enough animation time passes the pacer drains and the whole trace lands.
  await page.clock.install();
  const full = "AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD EEEEEEEEEE FFFFFFFFFF GGGGGGGGGG";
  const component = await mount(<ReasoningBlockStory reasoning={full} thinking={true} smoothStream={true} smoothStreamCps={15} />);

  await expect(component.getByText(full)).toBeHidden();

  await page.clock.runFor(10 * ONE_SECOND_MS);
  await expect(component.getByText(full)).toBeVisible();
});

test("auto-collapses to the frozen 'Thought for Ns' the instant thinking ends", async ({ mount, page }) => {
  await page.clock.install();
  const component = await mount(<ReasoningBlockStory reasoning="Some reasoning" thinking={true} />);
  await page.clock.runFor(3 * ONE_SECOND_MS);
  await expect(component.getByRole("button", { name: "Thinking… 3s" })).toBeVisible();

  // The answer's first token lands — the caller flips `thinking` to false.
  await component.update(<ReasoningBlockStory reasoning="Some reasoning" thinking={false} />);

  const trigger = component.getByRole("button", { name: "Thought for 3s" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText("Some reasoning")).toBeHidden();

  // The counter is frozen — it does not keep advancing once thinking has ended.
  await page.clock.runFor(5 * ONE_SECOND_MS);
  await expect(component.getByRole("button", { name: "Thought for 3s" })).toBeVisible();
});

test("a user toggle permanently overrides the auto force-open, surviving further reasoning growth", async ({ mount }) => {
  const component = await mount(<ReasoningBlockStory reasoning="First bit" thinking={true} />);
  const trigger = component.getByRole("button", { name: THINKING_LABEL });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  // The user manually collapses it WHILE still thinking — overriding the force-open rule.
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // More reasoning streams in — the auto rule alone would keep forcing it open; the override wins.
  await component.update(<ReasoningBlockStory reasoning="First bit, then more" thinking={true} />);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText("First bit, then more")).toBeHidden();
});

test("the user can manually re-expand after auto-collapse to read the settled reasoning trace", async ({ mount }) => {
  const component = await mount(<ReasoningBlockStory reasoning="The full settled trace" thinking={false} />);
  const trigger = component.getByRole("button", { name: "Thought for 0s" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("The full settled trace")).toBeVisible();
});

// ── AXIS 2: the SNAP collapse — the answer prose must not be flung the trace's height ──────────────────
// The proof is a SETTLED-state assertion, never a race against a 200ms fold: we inject a 100s
// `--motion-layout` so the SMOOTH Base UI fold freezes mid-collapse and holds the prose at its displaced
// position indefinitely. The AUTO collapse uses `CollapsiblePanel instant` (a `duration-[0.01ms]` literal,
// immune to `--motion-layout`), so it snaps regardless of the freeze. Against pre-fix source — where the
// panel had no `instant` arm and every close rode `--motion-layout` — the same freeze holds the prose
// hundreds of px down, so `expect(delta < ANCHORED_CEILING_PX)` reads RED (~700). Geometry only, so it
// compiles against HEAD.
test("auto-collapse SNAPS: the answer prose paints at its anchored position, not flung down the trace height", async ({ mount, page }) => {
  await page.addStyleTag({ content: "* { --motion-layout: 100s !important; }" });
  const component = await mount(<ReasoningAnchorStory reasoning={TALL_REASONING} thinking={true} showProse={false} />);
  await expect(component.getByRole("button", { name: THINKING_LABEL })).toHaveAttribute("aria-expanded", "true");

  // The answer's first token lands: thinking flips false AND the prose sibling mounts below the trace.
  await component.update(<ReasoningAnchorStory reasoning={TALL_REASONING} thinking={false} showProse={true} />);

  // The trace has snapped shut (its text is gone from the DOM — Base UI unmounts the closed panel).
  await expect(component.getByText("Reasoning step 0", { exact: false })).toBeHidden();

  // `anchor-row` IS the mounted story root, and `component` points AT that root — a
  // `component.getByTestId("anchor-row")` searches only DESCENDANTS and never matches (30s timeout).
  // Probe the root directly; `anchor-prose` is a genuine descendant so it stays a getByTestId.
  const rowBox = await component.boundingBox();
  const proseBox = await component.getByTestId("anchor-prose").boundingBox();
  expect(rowBox).not.toBeNull();
  expect(proseBox).not.toBeNull();
  const proseTopInRow = (proseBox?.y ?? 0) - (rowBox?.y ?? 0);
  expect(proseTopInRow).toBeLessThan(ANCHORED_CEILING_PX);
});

test("a MANUAL collapse keeps the smooth fold (frozen under a long duration) — only the AUTO path snaps", async ({ mount, page }) => {
  // The same 100s freeze: a MANUAL collapse (override set → smooth Base UI fold) stays frozen open, so its
  // trace text is still visible. This is the manual-fold-still-smooth pin — the auto snap above must not
  // have made EVERY collapse instant.
  await page.addStyleTag({ content: "* { --motion-layout: 100s !important; }" });
  const component = await mount(<ReasoningAnchorStory reasoning={TALL_REASONING} thinking={true} showProse={false} />);
  const trigger = component.getByRole("button", { name: THINKING_LABEL });

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // Frozen mid-fold by the 100s duration → the trace is STILL painted (a smooth transition, not a snap).
  await expect(component.getByText("Reasoning step 0", { exact: false })).toBeVisible();
});

test("autoCollapse OFF: the trace stays expanded after the answer lands (no collapse, no fling)", async ({ mount }) => {
  const component = await mount(
    <ReasoningAnchorStory reasoning="A reasoning trace worth keeping open" thinking={true} autoCollapse={false} showProse={false} />,
  );
  await expect(component.getByRole("button", { name: THINKING_LABEL })).toHaveAttribute("aria-expanded", "true");

  // The answer lands: label freezes to "Thought for Ns" but the panel STAYS OPEN (the reader closes it).
  await component.update(<ReasoningAnchorStory reasoning="A reasoning trace worth keeping open" thinking={false} autoCollapse={false} showProse={true} />);

  await expect(component.getByRole("button", { name: THOUGHT_LABEL })).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("A reasoning trace worth keeping open")).toBeVisible();
});
