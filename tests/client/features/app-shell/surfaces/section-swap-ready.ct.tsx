// A section swap into a surface with no skeleton waits for that surface's `data-ready`: the outgoing view holds while the first
// read is in flight, so the crossfade lands on a settled pane and never on a blank one. Reduced motion raises no transition.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const SETTLED_KEY = "__swapSettledReady";
const STARTED_KEY = "__swapsStarted";
// How long a swap must have held to show it did not release at its quiet interval.
const HELD_PAST_MS = 100;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Record each view transition the page starts and what `data-ready` read when its update callback settled. */
async function recordSwaps(page: Page): Promise<void> {
  await page.addInitScript(
    ([settledKey, startedKey]) => {
      if (!("startViewTransition" in document)) {
        return;
      }
      Reflect.set(globalThis, startedKey, 0);
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (update): ViewTransition => {
        Reflect.set(globalThis, startedKey, Number(Reflect.get(globalThis, startedKey)) + 1);
        const began = performance.now();
        const transition = start(update);
        transition.updateCallbackDone
          .then(() => {
            Reflect.set(globalThis, settledKey, {
              ready: document.querySelector(".shell-content [data-ready]")?.getAttribute("data-ready") ?? "absent",
              elapsed: performance.now() - began,
            });
          })
          .catch(globalThis.reportError);
        return transition;
      };
    },
    [SETTLED_KEY, STARTED_KEY] as const,
  );
}

type HeldPath = Parameters<typeof holdCorpusProcedure>[1];

/** The surface families that can render blank before their first read: each declares `data-ready` on a root that persists. */
const FAMILIES = [
  { name: "the Presets welcome pane", label: SECTION_LABELS.presets, held: "preset.list" },
  { name: "the Databank welcome pane", label: SECTION_LABELS.databank, held: "databank.bankHealth" },
  { name: "the Plugin pages empty pane", label: SECTION_LABELS.extensions, held: "plugin.list" },
] as const satisfies readonly { readonly name: string; readonly label: string; readonly held: HeldPath }[];

async function routeHeld(page: Page, corpus: Parameters<typeof createShellAmbientReads>[0], path: HeldPath): Promise<ReturnType<typeof holdCorpusProcedure>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const held = holdCorpusProcedure(caller, path);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES), ...held.routes });
  return held;
}

for (const family of FAMILIES) {
  test(`the swap into ${family.name} does not settle on an unsettled pane inside its deadline, and the pane shows once its read lands`, async ({
    corpus,
    mount,
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await recordSwaps(page);
    const held = await routeHeld(page, corpus, family.held);
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: family.label, exact: true }).click();
    await held.requested;
    // While the read is out, the surface says so.
    await expect(page.locator(".shell-content [data-ready]")).toHaveAttribute("data-ready", "false");
    // The read stays out until the swap has given up waiting, so the swap's own bound is what ends it.
    await expect.poll(() => page.evaluate((key) => Reflect.get(globalThis, key), SETTLED_KEY)).toBeDefined();
    const settled = (await page.evaluate((key) => Reflect.get(globalThis, key), SETTLED_KEY)) as { readonly ready: string; readonly elapsed: number };
    // It held well past the 48ms quiet interval that ended the wait while the pane was still unsettled.
    expect(settled.elapsed).toBeGreaterThan(HELD_PAST_MS);
    held.release();
    await expect(page.locator(".shell-content [data-ready]")).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".shell-content [data-ready]")).toHaveCSS("opacity", "1");
  });

  test(`with reduced motion no transition is raised for ${family.name}, which still waits for its read before it shows`, async ({ corpus, mount, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordSwaps(page);
    const held = await routeHeld(page, corpus, family.held);
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: family.label, exact: true }).click();
    await held.requested;
    await expect(page.locator(".shell-content [data-ready]")).toHaveCSS("opacity", "0");
    held.release();
    await expect(page.locator(".shell-content [data-ready]")).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".shell-content [data-ready]")).toHaveCSS("opacity", "1");
    expect(await page.evaluate((key) => Reflect.get(globalThis, key), STARTED_KEY)).toBe(0);
  });
}
