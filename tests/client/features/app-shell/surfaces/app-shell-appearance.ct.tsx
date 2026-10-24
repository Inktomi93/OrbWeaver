// The shell's appearance effects as the browser renders them: what its root stamps reach, and what survives it.
import { REDUCED_MOTION_ATTR } from "@orb/client/state";
import { createShellAmbientReads, routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";
import type { ShellToPendingStory } from "./_shell-handover-stories.tsx";

const HANDOVER = "tests/client/features/app-shell/surfaces/_shell-handover-stories/ShellToPendingStory";
// The reduced-motion floor writes `animation-duration: 0.01ms`, a literal with no token; anything under a
// millisecond is floored, and the unfloored glyph runs at the resolved `--motion-breathe`.
const FLOORED_MS = 1;

function glyphDurationMs(splash: Locator): Promise<number> {
  return splash.locator("svg").evaluate((glyph) => {
    const raw = getComputedStyle(glyph).animationDuration;
    return Number.parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
  });
}

function breatheTokenMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.animationDuration = "var(--motion-breathe)";
    document.body.append(probe);
    const raw = getComputedStyle(probe).animationDuration;
    probe.remove();
    return Number.parseFloat(raw) * (raw.endsWith("ms") ? 1 : 1000);
  });
}

/** Serve the shell on the corpus viewer's settings with the app's reduced-motion setting under test. */
async function routeReducedMotion(page: Page, corpus: CorpusWire, reducedMotion: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: "no-preference", contrast: "no-preference", colorScheme: "dark" });
  const [captured] = corpus.reads["settings.getUserSettings"];
  if (captured === undefined) {
    throw new Error("The corpus has no settings capture");
  }
  const settings = captured.output;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    "settings.getUserSettings": () => ({
      ...settings,
      config: { ...settings.config, appearance: { ...settings.config.appearance, reducedMotion } },
    }),
  });
}

/** Once the shell has stamped the flag, replace it with the router's pending mark. */
async function handOver(page: Page, reducedMotion: boolean): Promise<Locator> {
  await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, String(reducedMotion));
  await page.getByRole("button", { name: "Hand over", exact: true }).click();
  const splash = page.getByRole("status", { name: "Loading", exact: true });
  await expect(splash).toBeVisible();
  return splash;
}

test("the pending mark that replaces the shell keeps the app's reduced-motion flag, and its shimmer stops", async ({ corpus, mount, page }) => {
  await routeReducedMotion(page, corpus, true);
  await mount<typeof ShellToPendingStory>(HANDOVER, {});
  const splash = await handOver(page, true);
  await expect(page.locator("html")).toHaveAttribute(REDUCED_MOTION_ATTR, "true");
  await expect.poll(() => glyphDurationMs(splash)).toBeLessThan(FLOORED_MS);
});

test("with the app's reduced motion off the pending mark leaves no stale flag, and its shimmer runs", async ({ corpus, mount, page }) => {
  await routeReducedMotion(page, corpus, false);
  await mount<typeof ShellToPendingStory>(HANDOVER, {});
  const splash = await handOver(page, false);
  await expect(page.locator("html")).not.toHaveAttribute(REDUCED_MOTION_ATTR, /.*/u);
  await expect.poll(() => glyphDurationMs(splash)).toBe(await breatheTokenMs(page));
});
