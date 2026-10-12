// CT: the greeting studio (audit §3) — the tier-2 `components/` composite mounted by both the character
// editor. Regression guards: (1) the transform chips render BLIND from the `GREETING_TRANSFORMS` catalog (a
// card per contract entry, grouped by axis), and (2) Accept hands the generated text to `onAccept` ONCE. The
// studio's own rewrite generation is a real routeTrpc-stubbed mutation returning text; what the editor does
// with the accepted text (a form edit that autosaves) belongs to the editor, not to this component.

import { GREETING_TRANSFORMS } from "@orb/contracts/preset";
import type { TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { GreetingStudioStory } from "./greeting-studio.fixtures.tsx";

test("chips render BLIND from the GREETING_TRANSFORMS catalog (one toggle per contract entry)", async ({ mount, page }) => {
  // Every mount of GreetingStudio reads `settings.getUserSettings` (its preview colors quoted speech via
  // `useColorQuotedSpeech`, #data) — feeding the plain default runs that read for real instead of degrading
  // through the unstubbed-null branch this test has nothing to do with.
  await routeTrpc(page, { "settings.getUserSettings": () => settingsStub(false) });
  await mount(<GreetingStudioStory />);

  // Every catalog transform's label appears as a toggle — the client never hardcodes the list.
  await Promise.all(GREETING_TRANSFORMS.map((t) => expect(page.getByRole("button", { name: t.label, exact: true })).toBeVisible()));
  // And there are exactly as many toggle chips as catalog entries (no stray/missing chip).
  await expect(page.locator('[data-slot="toggle"]')).toHaveCount(GREETING_TRANSFORMS.length);
});

test("Rewrite generates, then Accept hands the result to onAccept exactly once", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settingsStub(false),
    "character.rewriteGreeting": { text: "A revised, formal greeting.", costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  // Pick a transform chip, then Rewrite → the generation fires and the preview renders the returned text.
  await page.getByRole("button", { name: "Past tense", exact: true }).click();
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect(page.getByText("A revised, formal greeting.")).toBeVisible();
  await expect.poll(() => trpc.count("character.rewriteGreeting")).toBe(1);

  // Accept → `onAccept` receives the previewed text ONCE.
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("list", { name: "Accepted greetings" }).getByRole("listitem")).toHaveText(["A revised, formal greeting."]);
});

// ARM B (the templating fork, rows 53-73): the transform picks ride the wire as KINDS — the fragment BYTES
// are resolved and joined SERVER-side from the preset's prose slots. The wire carries `transforms` (ids, in
// catalog order) + the host's own free text, never composed template text.
test("the transform picks ride the rewrite input as KINDS — no fragment bytes leave the browser", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settingsStub(false),
    "character.rewriteGreeting": { text: "done", costUsd: null },
  });
  await mount(<GreetingStudioStory />);

  // Flip a LATER catalog member first — the wire list is CATALOG order, not click order.
  await page.getByRole("button", { name: "Present tense", exact: true }).click();
  await page.getByRole("button", { name: "Second person", exact: true }).click();
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect.poll(() => trpc.count("character.rewriteGreeting")).toBe(1);
  await expect.poll(async () => trpc.requireLastInput("character.rewriteGreeting").greeting).toBe("Hello there, traveller.");
  await expect.poll(async () => trpc.requireLastInput("character.rewriteGreeting").transforms).toStrictEqual(["second-person", "present-tense"]);
  // The free-text box was untouched, so the steer is empty — and the fragment bytes stayed server-side.
  await expect.poll(async () => trpc.requireLastInput("character.rewriteGreeting").steer).toBe("");
  await expect.poll(async () => JSON.stringify(trpc.lastInput("character.rewriteGreeting"))).not.toContain("immediate and ongoing");
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

function settingsStub(colorQuotedSpeech: boolean): TrpcWireOutput<"settings.getUserSettings"> {
  return userSettingsView({ appearance: { colorQuotedSpeech } });
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
