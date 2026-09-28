// Scripted plugin surfaces at the page, dialog, and tool-card host anchors.
// Each case enters through the production page, dialog, or transcript mount and drives a real QuickJS guest.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ExtensionsPageStory, PluginDialogBodyStory, PluginToolCardStory } from "../_ct-stories.tsx";

type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

const PAGE_PLUGIN_ID = castId<PluginId>("plugin_ct_page_scripted001");
const DIALOG_PLUGIN_ID = castId<PluginId>("plugin_ct_dialog00000001");
const TOOL_PLUGIN_ID = castId<PluginId>("plugin_ct_tool_scripted001");
const TOOL_WIRE_NAME = "plugin_scripteddemo_draw";
const GUEST_BOOT_TIMEOUT_MS = 15_000;
const A_PAST_INSTANT = 1_760_000_000_000;
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;

function pluginRow(id: PluginId, name: string): TrpcWireOutput<"plugin.list">[number] {
  return {
    id,
    slug: "scripteddemo",
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

function scriptedSurface(pluginId: PluginId, id: string, anchor: PluginSurfaceRow["anchor"], title: string): PluginSurfaceRow {
  return {
    pluginId,
    id,
    anchor,
    title,
    tier: "scripted",
    ...(anchor === "tool-card" ? { toolName: "draw", toolWireName: TOOL_WIRE_NAME } : {}),
  };
}

function routes(pluginId: PluginId, pluginName: string, surface: PluginSurfaceRow): TrpcRoutes<"plugin.list" | "plugin.listSurfaces"> {
  return { "plugin.list": () => [pluginRow(pluginId, pluginName)], "plugin.listSurfaces": () => [surface] };
}

function guestSource(surfaceId: string, label: string): string {
  return `
    const ui = orb.ui(1);
    let count = 0;
    function draw() {
      ui.render(${JSON.stringify(surfaceId)}, { kind: "stack", children: [
        { kind: "text", voice: "label", value: ${JSON.stringify(label)} + " state " + count },
        { kind: "button", actionId: "advance", label: "Advance " + ${JSON.stringify(label)} },
      ]});
    }
    ui.onEvent((event) => {
      if (event.event.type === "action" && event.event.actionId === "advance") { count += 1; draw(); }
    });
    draw();
  `;
}

async function setupGuest(page: Parameters<typeof routeTrpc>[0], rows: TrpcRoutes<"plugin.list" | "plugin.listSurfaces">, source: string): Promise<void> {
  await routeTrpc(page, {
    ...rows,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await page.route("**/api/plugin-ui/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/octet-stream", headers: { "X-Content-Type-Options": "nosniff" }, body: source }),
  );
}

async function expectGuestInteraction(page: Parameters<typeof routeTrpc>[0], label: string): Promise<void> {
  await expect(page.getByText(`${label} state 0`)).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  await page.getByRole("button", { name: `Advance ${label}` }).click();
  await expect(page.getByText(`${label} state 1`)).toBeVisible();
}

test("a scripted page boots its guest inside the page attribution shell and delivers local events", async ({ mount, page }) => {
  const surface = scriptedSurface(PAGE_PLUGIN_ID, "page_panel", "page", "Scripted page");
  await setupGuest(page, routes(PAGE_PLUGIN_ID, "Page Plugin", surface), guestSource(surface.id, "Page guest"));

  await mount(<ExtensionsPageStory selectKey={{ pluginId: PAGE_PLUGIN_ID, surfaceId: surface.id }} />);

  await expect(page.getByTestId("plugin-page-attribution")).toContainText("Page Plugin");
  await expectGuestInteraction(page, "Page guest");
});

test("a scripted dialog boots its guest inside the house dialog body and delivers local events", async ({ mount, page }) => {
  const surface = scriptedSurface(DIALOG_PLUGIN_ID, "board", "dialog", "Scripted board");
  await setupGuest(page, routes(DIALOG_PLUGIN_ID, "Dialog Plugin", surface), guestSource(surface.id, "Dialog guest"));

  await mount(<PluginDialogBodyStory />);

  await expect(page.getByRole("group", { name: "Dialog Plugin — Scripted board" })).toBeVisible();
  await expectGuestInteraction(page, "Dialog guest");
});

test("a selected scripted page distinguishes booting from a ready guest with no tree", async ({ mount, page }) => {
  const surface = scriptedSurface(PAGE_PLUGIN_ID, "page_panel", "page", "Scripted page");
  await routeTrpc(page, {
    ...routes(PAGE_PLUGIN_ID, "Page Plugin", surface),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  let releaseSource = (): void => {
    throw new Error("the plugin source request did not start");
  };
  await page.route("**/api/plugin-ui/**", async (route) => {
    await new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "orb.ui(1);" });
  });

  await mount(<ExtensionsPageStory selectKey={{ pluginId: PAGE_PLUGIN_ID, surfaceId: surface.id }} />);
  await expect(page.getByText("Loading plugin content…", { exact: true })).toBeVisible();
  releaseSource();
  await expect(page.getByText("This plugin has no content to show here yet.", { exact: true })).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  await expect(page.getByTestId("plugin-page-attribution")).toContainText("Page Plugin");
});

test("a failed selected scripted dialog keeps attribution and retries into ready content", async ({ mount, page }) => {
  const surface = scriptedSurface(DIALOG_PLUGIN_ID, "board", "dialog", "Scripted board");
  await routeTrpc(page, {
    ...routes(DIALOG_PLUGIN_ID, "Dialog Plugin", surface),
    "plugin.getLog": () => [],
    "plugin.reportUiCrash": () => null,
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  let requestCount = 0;
  await page.route("**/api/plugin-ui/**", (route) => {
    requestCount += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: requestCount === 1 ? "throw new Error('boot failed');" : guestSource(surface.id, "Dialog guest"),
    });
  });

  await mount(<PluginDialogBodyStory />);
  const shell = page.getByRole("group", { name: "Dialog Plugin — Scripted board" });
  await expect(shell).toBeVisible();
  await expect(shell.getByText("Couldn't load this plugin content.", { exact: true })).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  await shell.getByRole("button", { name: "Retry", exact: true }).click();
  await expectGuestInteraction(page, "Dialog guest");
});

test("a scripted tool card replaces the generic record only after its guest publishes, then delivers local events", async ({ mount, page }) => {
  const surface = scriptedSurface(TOOL_PLUGIN_ID, "tool_panel", "tool-card", "Scripted draw");
  await setupGuest(page, routes(TOOL_PLUGIN_ID, "Tool Plugin", surface), guestSource(surface.id, "Tool guest"));
  const record: ToolCallRecord = {
    toolCallId: "call_scripted",
    name: TOOL_WIRE_NAME,
    arguments: "{}",
    result: '{"drawn":"The Road"}',
    isError: false,
    durationMs: 12,
  };

  const component = await mount(<PluginToolCardStory records={[record]} />);

  await expect(component.getByRole("group", { name: "Tool Plugin — Scripted draw" })).toBeVisible();
  await expectGuestInteraction(page, "Tool guest");
  await expect(component.locator('[data-slot="tool-call-block"]')).toHaveCount(0);
});
