// @subject packages/client/src/features/plugin/components/plugin-surface-renderer.tsx
// A real guest's page hides and shows nodes through `when` and names its grid's empty line through a binding; the
// production Extensions page renders what the guest last published, and an action's publish repaints it in place.
import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginSurfaceSpecSchema } from "@orb/contracts/plugin";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { PLUGIN_GRID_EMPTY_DEFAULT } from "#client/features/plugin/lib/plugin-surface-names.ts";
import type { PluginPresentationPageStory } from "../_ct-stories.tsx";

const STORY = "tests/client/features/plugin/_ct-stories/PluginPresentationPageStory";
const SURFACE_ID = "ledger";
const OPENED = "Ledger opened";
const MARKER = "Page marker";
const PAGER = "Previous page";
const FLIP = "Flip pager";
const MISSING_PATH = "Shown on a missing path";
const NEVER = "Hidden by a literal";
const EMPTY_LINE = "Nothing in the ledger yet.";
const WIDTH = 390;

const SPEC = pluginSurfaceSpecSchema.parse({
  kind: "stack",
  children: [
    { kind: "text", value: OPENED },
    {
      kind: "row",
      gap: "field",
      children: [
        { kind: "button", actionId: "prev", label: PAGER, variant: "outline", when: { $state: "previous" } },
        { kind: "text", value: MARKER },
      ],
    },
    { kind: "text", value: MISSING_PATH, when: { $state: "absent.path" } },
    { kind: "text", value: NEVER, when: false },
    { kind: "button", actionId: "flip", label: FLIP },
    { kind: "grid", tilesFrom: { $state: "tiles" }, empty: { $state: "emptyLine" } },
    { kind: "grid", tilesFrom: { $state: "tiles" }, empty: { $state: "absent.line" } },
  ],
});

// The guest keeps the pager flag itself and republishes it from the action handler, before the action settles.
const GUEST = `const host = orb.host(1);
let previous = false;
const publish = () => host.ui.setState(${JSON.stringify(SURFACE_ID)}, { previous, tiles: [], emptyLine: ${JSON.stringify(EMPTY_LINE)} });
host.ui.register({ id: ${JSON.stringify(SURFACE_ID)}, anchor: "page", title: "Ledger", tier: "static", spec: ${JSON.stringify(SPEC)}, onAction: async (action) => {
  if (action.actionId === "flip") { previous = !previous; }
  await publish();
} });
void publish();`;

/** The left edge of a painted element, so a hidden sibling's slot shows up as a shifted neighbour. */
async function leftEdge(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the element has no painted box");
  }
  return box.x;
}

test.use({ viewport: { width: WIDTH, height: 844 }, hasTouch: true, isMobile: true });

test("a bound `when` follows the guest's publish live, a missing path shows its node, and a hidden node leaves no slot", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const manifest = pluginManifestSchema.parse({
    id: "ledger-visibility",
    name: "Ledger visibility witness",
    description: "A static page whose nodes appear and disappear with the state its guest publishes.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const installed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, GUEST, root.clock.now())).toString("base64"),
    grant: ["ui.surface"],
  });
  const plugin = await caller.plugin.setGrant({ pluginId: installed.id, grant: ["ui.surface"], acknowledgedNetHosts: [], enable: true });
  await expect.poll(() => caller.plugin.getSurfaceState({ pluginId: plugin.id, surfaceId: SURFACE_ID })).toMatchObject({ previous: false });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "plugin.list",
      "plugin.listSurfaces",
      "plugin.getSurfaceState",
      "plugin.invokeUiAction",
    ]),
  );
  await mount<typeof PluginPresentationPageStory>(STORY, { pluginId: plugin.id, surfaceId: SURFACE_ID, width: WIDTH });
  const body = page.locator('[data-plugin-surface-scale="page"]').getByRole("group");
  const opened = body.getByText(OPENED, { exact: true });
  const marker = body.getByText(MARKER, { exact: true });
  const previous = body.getByRole("button", { name: PAGER, exact: true });

  await expect(opened).toBeVisible();
  await expect(body.getByText(MISSING_PATH, { exact: true })).toBeVisible();
  await expect(body.getByText(NEVER, { exact: true })).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  // With its only sibling hidden, the marker opens its row: the hidden button left no slot or gap before it.
  expect(await leftEdge(marker)).toBeCloseTo(await leftEdge(opened), 0);
  await expect(body.getByText(EMPTY_LINE, { exact: true })).toBeVisible();
  await expect(body.getByText(PLUGIN_GRID_EMPTY_DEFAULT, { exact: true })).toBeVisible();

  await body.getByRole("button", { name: FLIP, exact: true }).click();
  await expect(previous).toBeVisible();
  const previousBox = await previous.boundingBox();
  if (previousBox === null) {
    throw new Error("the shown pager has no painted box");
  }
  expect(await leftEdge(marker)).toBeGreaterThanOrEqual(previousBox.x + previousBox.width);
  await previous.focus();
  await expect(previous).toBeFocused();

  await body.getByRole("button", { name: FLIP, exact: true }).click();
  await expect(previous).toHaveCount(0);
  expect(await leftEdge(marker)).toBeCloseTo(await leftEdge(opened), 0);
});
