// CT: the greeting studio (audit §3) — the tier-2 `components/` composite mounted by both the character
// editor and the chat draft greeting row. Regression guards: (1) the transform chips render BLIND from the
// `GREETING_TRANSFORMS` catalog (a card per contract entry, grouped by axis), and (2) the accept path fires
// the character-update mutation ONCE (asserting the MUTATION count via routeTrpc's recorder, not a UI
// reaction — the "assert the mutation fired" doctrine). The studio's own rewrite generation is a real
// routeTrpc-stubbed mutation returning text; Accept then persists via character.update.

import { GREETING_TRANSFORMS } from "@orb/contracts/preset";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc";
import { GreetingStudioStory } from "./greeting-studio.fixtures";

test("chips render BLIND from the GREETING_TRANSFORMS catalog (one toggle per contract entry)", async ({ mount, page }) => {
  await routeTrpc(page, {});
  await mount(<GreetingStudioStory />);

  // Every catalog transform's label appears as a toggle — the client never hardcodes the list.
  await Promise.all(GREETING_TRANSFORMS.map((t) => expect(page.getByRole("button", { name: t.label, exact: true })).toBeVisible()));
  // And there are exactly as many toggle chips as catalog entries (no stray/missing chip).
  await expect(page.locator('[data-slot="toggle"]')).toHaveCount(GREETING_TRANSFORMS.length);
});

test("Rewrite generates, then Accept fires the character-update mutation exactly once", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    // The studio's rewrite generation returns text; character.update is the accept-persist target.
    "character.rewriteGreeting": { text: "A revised, formal greeting.", costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  // Pick a transform chip, then Rewrite → the generation fires and the preview renders the returned text.
  await page.getByRole("button", { name: "Past tense", exact: true }).click();
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect(page.getByText("A revised, formal greeting.")).toBeVisible();
  await expect.poll(() => trpc.count("character.rewriteGreeting")).toBe(1);

  // Accept → the character-update mutation fires ONCE (the durable append). Assert the MUTATION count.
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect.poll(() => trpc.count("character.update"), { intervals: [20, 50, 100] }).toBe(1);
});

test("the composed steer rides the rewrite input (selected transform fragment + base greeting)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "character.rewriteGreeting": { text: "done", costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  await page.getByRole("button", { name: "Present tense", exact: true }).click();
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect.poll(() => trpc.count("character.rewriteGreeting")).toBe(1);

  // The wire input carries the base greeting + the composed steer (the present-tense fragment).
  const input = trpc.lastInput("character.rewriteGreeting") as { greeting?: string; steer?: string };
  expect(input.greeting).toBe("Hello there, traveller.");
  expect(input.steer).toContain("present tense");
});
