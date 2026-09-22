// useColorQuotedSpeech CT — the ONE home of the `appearance.colorQuotedSpeech` → `Markdown colorQuotes`
// read for prose surfaces OUTSIDE a message row (QUOTE-1: the greeting preview, the greeting studio's
// preview, the facet editor's example transcript). A message row gets the same pref through
// `resolveRowRenderPolicy`, which needs a role + participants those surfaces don't have.
//
// Load-bearing and pinned here rather than left to the greeting-studio CT (which proves the rendered TINT):
// the hook is NON-suspense and reads THROUGH to the contract default, so a preview paints before the
// settings read resolves. Two ways that goes wrong and neither is visible in a typecheck — a failed read
// blanking the tint, and a `=== true` spelling turning a blob that predates the key into "off".

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcFixtureOutput } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../support/node/route-trpc.ts";
import { ColorQuotedSpeechStory } from "./_ct-stories.tsx";

type AppearanceFixture =
  | Pick<typeof DEFAULT_USER_SETTINGS.appearance, "colorQuotedSpeech">
  | Omit<typeof DEFAULT_USER_SETTINGS.appearance, "colorQuotedSpeech">;

/** The `settings.getUserSettings` wire row carrying one appearance blob. */
function settingsWire(appearance: AppearanceFixture): TrpcFixtureOutput<"settings.getUserSettings"> {
  return { userId: castId<UserId>("user_ct"), config: { appearance } };
}

test("the pref ON projects colorQuotes=true", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => settingsWire({ ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: true }),
  });
  // The story's providers render no DOM, so the `<output>` IS the mounted root — assert on the page.
  await mount(<ColorQuotedSpeechStory />);
  await expect(page.locator("output")).toHaveText("colorQuotes=true");
});

test("the pref OFF projects colorQuotes=false (the setting really drives the render)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => settingsWire({ ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech: false }),
  });
  await mount(<ColorQuotedSpeechStory />);
  await expect(page.locator("output")).toHaveText("colorQuotes=false");
});

test("an appearance blob MISSING the key reads as ON — the contract default, never off-by-absence", async ({ mount, page }) => {
  const { colorQuotedSpeech: _dropped, ...withoutKey } = DEFAULT_USER_SETTINGS.appearance;
  await routeTrpc(page, { "settings.getUserSettings": () => settingsWire(withoutKey) });
  await mount(<ColorQuotedSpeechStory />);
  await expect(page.locator("output")).toHaveText("colorQuotes=true");
});

test("a FAILED settings read degrades to the default (ON) instead of suspending or blanking the tint", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => trpcError({ code: "UNAUTHORIZED" }) });
  await mount(<ColorQuotedSpeechStory />);
  await expect(page.locator("output")).toHaveText("colorQuotes=true");
});
