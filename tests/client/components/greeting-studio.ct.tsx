// CT: the greeting studio (audit §3) — the tier-2 `components/` composite mounted by both the character
// editor and the chat draft greeting row. Regression guards: (1) the transform chips render BLIND from the
// `GREETING_TRANSFORMS` catalog (a card per contract entry, grouped by axis), and (2) the accept path fires
// the character-update mutation ONCE (asserting the MUTATION count via routeTrpc's recorder, not a UI
// reaction — the "assert the mutation fired" doctrine). The studio's own rewrite generation is a real
// routeTrpc-stubbed mutation returning text; Accept then persists via character.update.

import { GREETING_TRANSFORMS } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { GreetingStudioStory } from "./greeting-studio.fixtures.tsx";

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

// ── QUOTE-1: the studio PREVIEW is chat prose, so it obeys `appearance.colorQuotedSpeech` ──────────
// The greeting-preview surfaces render through the same `@orb/ui/markdown` seal a transcript row does but
// were mounting it WITHOUT `colorQuotes` — quoted speech read in the body colour in the exact place a host
// judges a greeting. `useColorQuotedSpeech` (#data) is the one home of the pref read; these two arms prove
// the wire END TO END: the ON arm asserts the COMPUTED colour against the scope's resolved
// `--color-dialogue` (never the authored class), and the OFF arm proves the render really follows the
// user's setting rather than a hardcoded `true`.
const DIALOGUE_SPAN = '[data-slot="dialogue"]';
const QUOTED_PREVIEW = "He looks up. “You're late,” he says.";

function settingsStub(colorQuotedSpeech: boolean): { userId: UserId; schemaVersion: number; config: unknown; updatedAt: number } {
  return {
    userId: castId<UserId>("user_ct"),
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech } },
    updatedAt: 0,
  };
}

/** The COMPUTED colour of the tinted span vs the scope's resolved `--color-dialogue` (markdown.ct precedent). */
function tintVsToken(span: Locator): Promise<{ readonly tint: string; readonly token: string }> {
  return span.evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el);
    const probe = document.createElement("span");
    probe.style.color = style.getPropertyValue("--color-dialogue").trim();
    el.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    return { tint: style.color, token };
  });
}

test("the studio preview tints quoted speech with the resolved --color-dialogue (pref ON)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => settingsStub(true),
    "character.rewriteGreeting": { text: QUOTED_PREVIEW, costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  const span = page.locator(DIALOGUE_SPAN);
  await expect(span).toHaveText("“You're late,”");
  const { tint, token } = await tintVsToken(span);
  expect(tint).toBe(token);
});

test("the studio preview leaves quoted speech untinted when the pref is OFF", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => settingsStub(false),
    "character.rewriteGreeting": { text: QUOTED_PREVIEW, costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect(page.getByText("He looks up.")).toBeVisible();
  await expect(page.locator(DIALOGUE_SPAN)).toHaveCount(0);
});
