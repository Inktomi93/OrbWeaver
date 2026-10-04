// CT: the in-place consent review and the plugin card, through the real Plugins pane with the network stubbed.
// Each test pins what the person DECIDES on, read off the rendered screen: the plugin's own description sits
// above the ask, the permission list is drawn once, Remove weighs less than Approve, a long host list does not
// push Approve out of view, the alarm pill marks only reach that leaves the machine, and a raw error never
// reaches the card as text. The words themselves are not asserted; their data (a fixture's description, a
// fixture's raw error) is.

import { expect, test } from "@playwright/experimental-ct-react";
import { NO_IMAGE_MODEL_NOTE } from "../../../../../packages/client/src/features/plugin/lib/plugin-copy.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginsSurfaceStory } from "../_ct-stories.tsx";

type PluginRow = TrpcWireOutput<"plugin.list">[number];
type BindingView = TrpcWireOutput<"connection.listBindings">[number];

const A_PAST_INSTANT = 1_760_000_000_000;
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;

/** A never-approved plugin: off, nothing granted, the standing ask raised. */
function waitingRow(slug: string, name: string, overrides: Partial<PluginRow> = {}): PluginRow {
  return {
    id: `plugin_ctreview${slug.padEnd(13, "0")}`,
    slug,
    name,
    version: "1.0.0",
    status: "disabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["chat.read"],
    grantedCapabilities: [],
    netHosts: null,
    reconsentPending: true,
    widenedNetHosts: [],
    builtAgainst: null,
    description: `${name} exists for one fixture purpose.`,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
    ...overrides,
  };
}

async function stub(page: Parameters<typeof routeTrpc>[0], rows: readonly PluginRow[], bindings: readonly BindingView[] = []): Promise<void> {
  await routeTrpc(page, {
    "plugin.list": () => [...rows],
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
    "connection.listBindings": () => [...bindings],
  });
}

function ask(page: Parameters<typeof routeTrpc>[0], name: string): ReturnType<typeof page.getByRole> {
  return page.getByRole("alert", { name: `What ${name} asks for beyond what you've allowed` });
}

test("the review says what the plugin is for above the ask, and draws the permission list once", async ({ mount, page }) => {
  const row = waitingRow("solo", "Solo Plugin");
  await stub(page, [row]);
  await mount(<PluginsSurfaceStory />);

  const description = page.getByText(row.description, { exact: true });
  await expect(description).toBeVisible();
  const descriptionBox = await description.boundingBox();
  const askBox = await ask(page, "Solo Plugin").boundingBox();
  expect(descriptionBox === null || askBox === null).toBe(false);
  expect(descriptionBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(askBox?.y ?? 0);

  // The ask is the one home for the list while it is showing: the settled-state disclosure is not drawn.
  await expect(page.getByRole("button", { name: /^What it's allowed to do/u })).toHaveCount(0);
  await expect(page.getByText("Read this room's messages", { exact: true })).toHaveCount(1);
});

test("Remove is an outlined action that weighs less than Approve", async ({ mount, page }) => {
  await stub(page, [waitingRow("solo", "Solo Plugin")]);
  await mount(<PluginsSurfaceStory />);

  const approve = page.getByRole("button", { name: /^Approve/u });
  const remove = page.getByRole("button", { name: "Remove Solo Plugin" });
  await expect(approve).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(remove).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(remove).toHaveCSS("border-top-width", "1px");
  await expect(approve).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("a single permission reads Approve and several read Approve all, each naming its plugin", async ({ mount, page }) => {
  await stub(page, [waitingRow("solo", "Solo Plugin"), waitingRow("pair", "Pair Plugin", { declaredCapabilities: ["chat.read", "storage.kv"] })]);
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByRole("button", { name: "Approve for Solo Plugin", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve all for Pair Plugin", exact: true })).toBeVisible();
});

test("the alarm pill marks reach that leaves the machine, not a plugin that only edits or restyles messages", async ({ mount, page }) => {
  await stub(page, [
    waitingRow("polish", "Polish Plugin", { declaredCapabilities: ["chat.transform"] }),
    waitingRow("fetcher", "Fetcher Plugin", { declaredCapabilities: ["net.fetch"], netHosts: ["api.fetcher.example"] }),
  ]);
  await mount(<PluginsSurfaceStory />);

  await expect(ask(page, "Fetcher Plugin").getByText("Reaches further", { exact: true })).toHaveCount(1);
  await expect(ask(page, "Polish Plugin")).toBeVisible();
  await expect(ask(page, "Polish Plugin").getByText("Reaches further", { exact: true })).toHaveCount(0);
});

test.describe("a long host list", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("collapses behind its count so Approve stays in view, and opens on request", async ({ mount, page }) => {
    const hosts = Array.from({ length: 16 }, (_unused, index) => `host${index}.example.test`);
    await stub(page, [
      waitingRow("atlas", "Atlas Plugin", {
        declaredCapabilities: ["chat.read", "chat.quick_reply", "storage.kv", "ui.surface", "notify", "net.fetch"],
        netHosts: hosts,
      }),
    ]);
    await mount(<PluginsSurfaceStory />);

    const approve = page.getByRole("button", { name: /^Approve all for Atlas Plugin/u });
    await expect(approve).toBeVisible();
    await expect(page.getByText("host0.example.test", { exact: true })).toBeHidden();
    const approveBox = await approve.boundingBox();
    expect((approveBox?.y ?? Number.POSITIVE_INFINITY) + (approveBox?.height ?? 0)).toBeLessThanOrEqual(900);

    await ask(page, "Atlas Plugin").getByRole("button", { name: /16/u }).click();
    await expect(page.getByText("host15.example.test", { exact: true })).toBeVisible();
  });
});

test.describe("a spend permission whose model role is unset", () => {
  const painter = waitingRow("painter", "Painter Plugin", { declaredCapabilities: ["imagery.generate"] });

  test("says no model is set up yet", async ({ mount, page }) => {
    await stub(page, [painter], [{ task: "generateImage", binding: null, resolved: null, unavailableCause: null }]);
    await mount(<PluginsSurfaceStory />);

    await expect(page.getByText(NO_IMAGE_MODEL_NOTE, { exact: true })).toBeVisible();
  });

  test("stays quiet once the person has picked a model for that role", async ({ mount, page }) => {
    const picked: BindingView = {
      task: "generateImage",
      binding: {
        id: "connection_binding_ctreview",
        actorKind: "user",
        userId: USER_VIEWER.userId,
        ruleId: null,
        pluginId: null,
        task: "generateImage",
        connectionId: "user_connection_ctreview01",
      },
      resolved: null,
      unavailableCause: null,
    };
    await stub(page, [painter], [picked]);
    await mount(<PluginsSurfaceStory />);

    await expect(ask(page, "Painter Plugin")).toBeVisible();
    await expect(page.getByText(NO_IMAGE_MODEL_NOTE, { exact: true })).toHaveCount(0);
  });
});

test("a failed plugin's card keeps the raw error behind Copy instead of printing it", async ({ mount, page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const raw = "plugin UI surface 'affinity_browser' failed: ReferenceError: window is not defined";
  await stub(page, [waitingRow("broken", "Broken Plugin", { status: "errored", reconsentPending: false, grantedCapabilities: ["chat.read"], lastError: raw })]);
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Broken Plugin", { exact: true })).toBeVisible();
  await expect(page.getByText(raw, { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy the error details" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(raw);
});

test("a settled plugin keeps one update door in the card and the bundle upload in the overflow", async ({ mount, page }) => {
  await stub(page, [waitingRow("settled", "Settled Plugin", { status: "enabled", reconsentPending: false, grantedCapabilities: ["chat.read"] })]);
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByRole("switch", { name: "Turn Settled Plugin off" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Update Settled Plugin/u })).toHaveCount(0);
  await page.getByRole("button", { name: "More actions for Settled Plugin" }).click();
  await expect(page.getByRole("menuitem", { name: /bundle/u })).toBeVisible();
});
