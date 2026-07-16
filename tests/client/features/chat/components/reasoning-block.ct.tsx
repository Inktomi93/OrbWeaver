// CT: the TTFT reasoning affordance — force-open + ticking "Thinking… Ns" while thinking, auto-collapse
// to the frozen "Thought for Ns" the instant thinking ends, and a user toggle permanently overriding the
// auto behavior (UI-Gates §11.6 golden checkpoint companion; the client-determinism gate — the elapsed
// counter is a plain interval tick, never a wall-clock read, so `page.clock` drives it deterministically
// instead of a real 1000ms wait per tick).

import { expect, test } from "@playwright/experimental-ct-react";
import { ReasoningBlockStory } from "../_ct-stories";

const ONE_SECOND_MS = 1000;
const THINKING_LABEL = /Thinking/u;

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
