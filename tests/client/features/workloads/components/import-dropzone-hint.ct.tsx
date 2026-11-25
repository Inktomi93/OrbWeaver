// The backup import's drop zone hint wraps evenly: it runs onto a second line at a desktop pane and a phone pane without leaving a short
// tail of a word or two beneath a full line. The section is the production backup-import body over a corpus root.
// @subject packages/client/src/features/workloads/components/import-library-section.tsx
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { IMPORT_DROPZONE_HINT } from "#client/features/workloads/lib/import-library-names.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
/** The last line of an evenly wrapped hint is at least this share of its longest line. */
const SHORTEST_TAIL = 0.5;
const CASES = [
  { name: "a desktop pane", width: 960, scale: 1 },
  { name: "a phone pane", width: 390, scale: 1 },
  { name: "a phone pane at 200% text", width: 390, scale: 2 },
] as const;

async function lineWidths(caption: Locator): Promise<readonly number[]> {
  return await caption.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Map<number, { left: number; right: number }>();
    for (const rect of range.getClientRects()) {
      const key = Math.round(rect.top);
      const held = lines.get(key);
      lines.set(key, {
        left: Math.min(held?.left ?? Number.POSITIVE_INFINITY, rect.left),
        right: Math.max(held?.right ?? Number.NEGATIVE_INFINITY, rect.right),
      });
    }
    return [...lines.values()].map((line) => line.right - line.left);
  });
}

for (const pane of CASES) {
  test(`the drop zone hint wraps evenly in ${pane.name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page);
    await page.setViewportSize({ width: pane.width, height: 844 });
    const component = await mount<typeof ImportPreviewStory>(STORY, { width: pane.width, appearance: appearanceSettingsSchema.parse({}) });
    await setRootFontScale(page, channelName("fontScale"), pane.scale);
    const widths = await lineWidths(component.getByText(IMPORT_DROPZONE_HINT, { exact: true }));
    // The positive control: the hint did wrap, so there is a tail to judge.
    expect(widths.length).toBeGreaterThan(1);
    expect(widths.at(-1) ?? 0).toBeGreaterThanOrEqual(Math.max(...widths) * SHORTEST_TAIL - SUBPIXEL);
  });
}
