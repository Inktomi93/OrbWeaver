// A section swap into a surface with no skeleton waits for that surface's `data-ready`: the outgoing view holds while the first
// read is in flight, so the crossfade lands on a settled pane and never on a blank one. Reduced motion raises no transition.

import { seedShellState } from "@orb/testkit/browser/spec";
import type { HeldCorpusProcedure } from "@orb/testkit/ct";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { SHELL_SWAP_DEADLINE_PROPERTY } from "#client/lib/view-transition-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const SETTLED_KEY = "__swapSettledReady";
const STARTED_KEY = "__swapsStarted";
// A frame count, not a duration: the swap's own settle polls run on timers, so a count of painted frames is a barrier that
// stretches with the machine's load. It is far past the few polls a swap that ignores `data-ready` needs to settle.
const FRAMES_PAST_QUIET = 60;
// Longer than any test runs, so only the pane's own readiness can end the swap's wait.
const DEADLINE_STYLE = `.shell-grid { ${SHELL_SWAP_DEADLINE_PROPERTY}: 600000ms; }`;

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
        const transition = start(update);
        transition.updateCallbackDone
          .then(() => {
            Reflect.set(globalThis, settledKey, document.querySelector(".shell-content [data-ready]")?.getAttribute("data-ready") ?? "absent");
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

async function routeHeld(page: Page, corpus: Parameters<typeof createShellAmbientReads>[0], path: HeldPath): Promise<HeldCorpusProcedure<HeldPath>> {
  const caller = await root.internalCallerFor(root.ownerId);
  const held = holdCorpusProcedure(caller, path);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES), ...held.routes });
  return held;
}

for (const family of FAMILIES) {
  test(`the swap into ${family.name} holds the outgoing view until the pane's first read lands, then settles on the ready pane`, async ({
    corpus,
    mount,
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await recordSwaps(page);
    const held = await routeHeld(page, corpus, family.held);
    // The swap starts from Chats: Home's tiles read these same procedures, and their own skeleton rows would hold the swap
    // to its deadline whether or not the destination declared its readiness. Each destination's list is collapsed for the
    // same reason (its rows read the held procedure behind a skeleton), so the content pane's readiness is the only thing
    // the swap can be waiting for.
    await seedShellState(page, {
      activeSection: "chats",
      panelOverrides: { databank: { list: "collapsed" }, extensions: { list: "collapsed" }, presets: { list: "collapsed" } },
    });
    await mount<typeof AppShellStory>(STORY, {});
    await page.addStyleTag({ content: DEADLINE_STYLE });
    await page.locator(".shell-rail").getByRole("button", { name: family.label, exact: true }).click();
    await held.requested;
    // While the read is out, the surface says so.
    await expect(page.locator(".shell-content [data-ready]")).toHaveAttribute("data-ready", "false");
    await page.evaluate(
      (frames) =>
        new Promise<void>((resolve) => {
          let seen = 0;
          const step = (): void => {
            seen += 1;
            if (seen >= frames) {
              resolve();
            } else {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }),
      FRAMES_PAST_QUIET,
    );
    // The swap has had far longer than it needs to settle on a pane that ignores its read, and has not: the outgoing frame holds.
    expect(await page.evaluate((key): unknown => Reflect.get(globalThis, key), SETTLED_KEY)).toBeUndefined();
    held.release();
    // It settles on a ready pane, and the pane shows.
    await expect.poll(() => page.evaluate((key): unknown => Reflect.get(globalThis, key), SETTLED_KEY)).toBe("true");
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
    expect(await page.evaluate((key): unknown => Reflect.get(globalThis, key), STARTED_KEY)).toBe(0);
  });
}
