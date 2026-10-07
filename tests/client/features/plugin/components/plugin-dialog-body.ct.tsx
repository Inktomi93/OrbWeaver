// Scripted plugin surfaces at the page, dialog, and tool-card host anchors.
// Each case enters through the production page, dialog, or transcript mount and drives a real QuickJS guest.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { ReactElement } from "react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
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
    description: "A fixture plugin.",
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

async function setupGuest(
  page: Parameters<typeof routeTrpc>[0],
  rows: TrpcRoutes<"plugin.list" | "plugin.listSurfaces">,
  source: string,
  hostCall: TrpcRoutes<"plugin.uiHostCall"> | Record<string, never> = {},
): Promise<void> {
  await routeTrpc(page, {
    ...rows,
    ...hostCall,
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
  const requestGate = Promise.withResolvers<() => void>();
  await page.route("**/api/plugin-ui/**", async (route) => {
    await new Promise<void>((release) => requestGate.resolve(release));
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "orb.ui(1);" });
  });

  await mount(<ExtensionsPageStory selectKey={{ pluginId: PAGE_PLUGIN_ID, surfaceId: surface.id }} />);
  await expect(page.getByText("Loading plugin content…", { exact: true })).toBeVisible();
  const releaseSource = await requestGate.promise;
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
  const source = `
    const ui = orb.ui(1);
    let count = 0;
    function draw() {
      ui.render(${JSON.stringify(surface.id)}, { kind: "stack", children: [
        { kind: "text", voice: "label", value: "Tool guest state " + count },
        { kind: "text", voice: "body", value: { $state: "result.drawn" } },
        { kind: "button", actionId: "advance", label: "Advance Tool guest" },
      ]});
    }
    ui.onEvent((event) => {
      if (event.event.type === "action" && event.event.actionId === "advance") { count += 1; draw(); }
    });
    draw();
  `;
  await setupGuest(page, routes(TOOL_PLUGIN_ID, "Tool Plugin", surface), source);
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
  await expect(component.getByText("The Road", { exact: true })).toBeVisible();
  await expect(component.locator('[data-slot="tool-call-block"]')).toHaveCount(0);
});

const SCRIPTED_ANCHORS = [
  { anchor: "page", pluginId: PAGE_PLUGIN_ID, surfaceId: "page_panel", title: "Scripted page", pluginName: "Page Plugin", label: "Page guest" },
  { anchor: "dialog", pluginId: DIALOG_PLUGIN_ID, surfaceId: "board", title: "Scripted board", pluginName: "Dialog Plugin", label: "Dialog guest" },
  { anchor: "tool-card", pluginId: TOOL_PLUGIN_ID, surfaceId: "tool_panel", title: "Scripted draw", pluginName: "Tool Plugin", label: "Tool guest" },
] as const;

const SCRIPTED_TOOL_RECORD: ToolCallRecord = {
  toolCallId: "call_scripted",
  name: TOOL_WIRE_NAME,
  arguments: "{}",
  result: '{"drawn":"The Road"}',
  isError: false,
  durationMs: 12,
};

/** The production mount for one scripted anchor: the Extensions page, the house dialog body, or a transcript tool card. */
function anchorStory({ anchor, pluginId, surfaceId }: (typeof SCRIPTED_ANCHORS)[number]): ReactElement {
  if (anchor === "page") {
    return <ExtensionsPageStory selectKey={{ pluginId, surfaceId }} />;
  }
  if (anchor === "dialog") {
    return <PluginDialogBodyStory />;
  }
  return <PluginToolCardStory records={[SCRIPTED_TOOL_RECORD]} />;
}

/** A guest whose one proxied host call reports back, in its own tree, whether the host granted or refused it. */
function hostCallGuestSource(surfaceId: string, label: string): string {
  return `
    const ui = orb.ui(1);
    let outcome = "pending";
    function draw() {
      ui.render(${JSON.stringify(surfaceId)}, { kind: "text", voice: "label", value: ${JSON.stringify(label)} + " host call " + outcome });
    }
    ui.host.storage.get("k").then(() => { outcome = "granted"; draw(); }, () => { outcome = "refused"; draw(); });
    draw();
  `;
}

for (const target of SCRIPTED_ANCHORS) {
  const { anchor, pluginId, surfaceId, title, pluginName, label } = target;
  const surface = scriptedSurface(pluginId, surfaceId, anchor, title);

  test(`unmounting the ${anchor} anchor terminates its scripted guest worker`, async ({ mount, page }) => {
    await setupGuest(page, routes(pluginId, pluginName, surface), guestSource(surfaceId, label));
    const guestStarted = page.waitForEvent("worker", { predicate: (candidate) => candidate.url().includes("ui-guest"), timeout: GUEST_BOOT_TIMEOUT_MS });

    const component = await mount(anchorStory(target));
    await expectGuestInteraction(page, label);
    const guest = await guestStarted;
    const terminated = guest.waitForEvent("close", { timeout: GUEST_BOOT_TIMEOUT_MS });

    await component.unmount();

    // The worker owns the QuickJS context and is the guest's only channel to host calls and state; its close
    // event is the browser's own report that `terminate()` ran.
    await terminated;
    await expect(page.getByText(`${label} state 1`)).toHaveCount(0);
  });

  test(`a host call refused for a guest at the ${anchor} anchor reaches the guest as a refusal`, async ({ mount, page }) => {
    await setupGuest(page, routes(pluginId, pluginName, surface), hostCallGuestSource(surfaceId, label), {
      "plugin.uiHostCall": () => trpcError({ code: "FORBIDDEN", message: "plugin capability not granted: storage.kv" }),
    });

    await mount(anchorStory(target));

    await expect(page.getByText(`${label} host call refused`, { exact: true })).toBeVisible({ timeout: GUEST_BOOT_TIMEOUT_MS });
  });
}
