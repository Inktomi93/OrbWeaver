// CT: the Tier-S plugin UI-surface render path (plugin-ui-plane #679 U1, part 3) over the REAL tRPC path with a
// stubbed network. The surfaces mount INSIDE the plugin row's first-party labelled shell (§4.5/§4.8), driven by
// `plugin.listSurfaces`; a button round-trips through `plugin.invokeUiAction`; published state arrives via
// `plugin.getSurfaceState`. The load-bearing assertions:
//
//   1. THE U1 DONE-CRITERIA (the affinity-tracker demo): its settings panel renders, its button round-trips,
//      and its state updates LIVE. The state read is STATEFUL so the barrier is a SETTLED rendered state (the
//      summary the post-invoke invalidate repaints), never an in-flight flash.
//   2. THE IMAGE OWNER-SCOPE GATE (plugin-secrev): an `image` node whose assetId the installer does NOT own
//      (`assets.resolveBlobRefs` returns nothing for it) renders the EMPTY placeholder — never an <img> to
//      another user's blob. The owned arm proves the resolve actually renders an image when it IS owned.
//   3. THE CAPS: a spec that fails client-side validation renders a safe fallback, never a crash.
//   4. RENDERER COVERAGE: a spec mixing container/display/form kinds renders each as a house control.

import { BLOB_ROUTE } from "@orb/contracts/assets";
import type { PluginId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PluginsSurfaceStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
/** A valid 1×1 transparent PNG — served for the OWNED blob so its <img> loads instead of tripping the
 *  broken-media fallback (message-media.tsx onError). */
const ONE_PX_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };
const AFFINITY_ID = castId<PluginId>("plugin_ct_affinity000001");

/** An enabled installed row — the plugin row the surface panel mounts inside. The list-read shape is pinned by
 *  the router/domain tests, never re-typed here. */
function enabledRow(id: PluginId, name: string): Record<string, unknown> {
  return {
    id,
    slug: "affinity-tracker",
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    consecutiveCrashes: 0,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One `listSurfaces` row: the serializable meta + pluginId (the onAction handle stays server-side). */
function surface(pluginId: PluginId, id: string, spec: unknown): Record<string, unknown> {
  return { pluginId, id, anchor: "settings", title: "Affinity readings", tier: "static", spec };
}

/** The affinity-tracker panel spec (the shape its upgraded main.js registers). */
const AFFINITY_SPEC = {
  kind: "stack",
  gap: "block",
  children: [
    { kind: "text", voice: "gloss", value: "A private summary of the warmth readings this plugin has taken across your rooms." },
    {
      kind: "keyValue",
      rows: [
        { key: "Chats tracked", value: { $state: "trackedChats" } },
        { key: "Average warmth", value: { $state: "averageLabel" } },
      ],
    },
    { kind: "meter", label: "Average warmth", max: 10, value: { $state: "averageWarmth" } },
    { kind: "text", value: { $state: "summary" } },
    { kind: "button", actionId: "refresh", label: "Refresh readings", variant: "outline" },
  ],
};

const AFFINITY_STATE = {
  trackedChats: 3,
  averageWarmth: 6.2,
  averageLabel: "6.2 / 10",
  summary: "Tracking 3 chats, at an average warmth of 6.2 out of 10.",
};

test("THE U1 DONE-CRITERIA — the affinity-tracker panel renders, its button round-trips, and state updates live", async ({ mount, page }) => {
  // STATEFUL state read: null until the action fires, then the summary — so the barrier below settles on the
  // post-invoke invalidate's repaint, not an optimistic flash (there is none).
  let refreshed = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Affinity Tracker")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "affinity_summary", AFFINITY_SPEC)],
    "plugin.getSurfaceState": () => (refreshed ? AFFINITY_STATE : null),
    "plugin.invokeUiAction": () => {
      refreshed = true;
      return null;
    },
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  // The panel renders inside the labelled shell: the plugin name + the surface title + its controls.
  await expect(page.getByText("A private summary of the warmth readings", { exact: false })).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh readings" });
  await expect(refresh).toBeVisible();

  await refresh.click();

  // SETTLED: the summary the invalidate repainted from the server's new state. It exists ONLY after the state
  // read flips (post-invoke), so this barrier cannot pass on the pre-click empty panel.
  await expect(page.getByText("Tracking 3 chats, at an average warmth of 6.2 out of 10.")).toBeVisible();
  // The round-trip fired with the whole action shape (no chat scope on a settings surface).
  // ONESHOT-OK: the settled summary above proves the mutation + its invalidate completed before this read.
  expect(recorder.lastInput("plugin.invokeUiAction")).toEqual({ pluginId: AFFINITY_ID, surfaceId: "affinity_summary", actionId: "refresh", values: {} });
});

test("the image owner-scope gate — a foreign assetId renders the placeholder, an OWNED one renders the image", async ({ mount, page }) => {
  // MINTED, never hand-written — the `image` node's assetId is `typeIdSchema`-validated at render, so a
  // literal would fail the spec and fall to the caps fallback instead of exercising the owner-scope gate.
  const foreignId = mintTypeId(ID_PREFIX.asset);
  const ownedId = mintTypeId(ID_PREFIX.asset);
  const spec = {
    kind: "stack",
    children: [
      { kind: "image", assetId: foreignId, alt: "someone else's private art" },
      { kind: "image", assetId: ownedId, alt: "my own art" },
    ],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Image Plugin")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "gallery", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    // The OWNER-SCOPED resolve returns a ref ONLY for the owned id — the foreign id is absent (server WHERE
    // owner_id = caller). A hash is enough for the client to build the blob url.
    "assets.resolveBlobRefs": () => [{ assetId: ownedId, hash: "0".repeat(64), mime: "image/png" }],
    "sessions.me": () => USER_VIEWER,
  });
  // Serve the OWNED blob so the positive control settles: MessageMedia swaps a 404'd <img> for its
  // broken-media fallback (message-media.tsx onError), which would race the count assertion. A valid 1×1 PNG
  // lets the owned <img> stay mounted. The FOREIGN id never requests a blob (its ref is absent), so this route
  // is only ever hit by the owner-scoped one — the gate under test is unchanged.
  await page.route(`**${BLOB_ROUTE}/**`, (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(ONE_PX_PNG_B64, "base64") }));
  await mount(<PluginsSurfaceStory />);

  // The FOREIGN asset never becomes an <img> — it is the empty placeholder carrying its alt, never a blob.
  await expect(page.getByText("someone else's private art")).toBeVisible();
  await expect(page.locator('img[alt="someone else\'s private art"]')).toHaveCount(0);
  // The OWNED asset DOES render an <img> pointing at its blob (the positive control — the resolve isn't inert).
  await expect(page.locator('img[alt="my own art"]')).toHaveCount(1);
});

test("a spec that fails client-side validation renders a safe fallback, never a crash", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Broken Plugin")],
    // `iframe` is not a node kind — the client re-validation (the caps + closed union) rejects it.
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "broken", { kind: "iframe", src: "https://evil.example" })],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("couldn't be displayed", { exact: false })).toBeVisible();
});

test("renderer coverage — a spec mixing container, display, and form kinds renders each as a house control", async ({ mount, page }) => {
  const spec = {
    kind: "stack",
    children: [
      { kind: "section", kicker: "Settings", children: [{ kind: "text", value: "A configurable panel." }] },
      { kind: "badge", text: "Ready", intent: "success" },
      { kind: "textField", name: "api_key", label: "API key", placeholder: "sk-…" },
      { kind: "toggle", name: "enabled", label: "Enabled", value: true },
      { kind: "select", name: "mode", label: "Mode", options: [{ value: "fast", label: "Fast" }], value: "fast" },
      { kind: "confirmButton", actionId: "reset", label: "Reset", confirmTitle: "Reset everything?" },
    ],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Kitchen Sink")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "sink", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("A configurable panel.")).toBeVisible();
  await expect(page.getByText("Ready")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "API key" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enabled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
});
