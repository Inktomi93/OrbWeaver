// CT: the Tier-S plugin UI-surface render path (U1, part 3) over the REAL tRPC path with a
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
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { malformedOrForwardTrpcWire, routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginsSurfaceStory } from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];
type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

const A_PAST_INSTANT = 1_760_000_000_000;
/** A valid 1×1 transparent PNG — served for the OWNED blob so its <img> loads instead of tripping the
 *  broken-media fallback (message-media.tsx onError). */
const ONE_PX_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;
const AFFINITY_ID = castId<PluginId>("plugin_ct_affinity000001");

/** An enabled installed row — the plugin row the surface panel mounts inside. The list-read shape is pinned by
 *  the router/domain tests, never re-typed here. */
function enabledRow(id: PluginId, name: string): PluginListRow {
  return {
    id,
    slug: "affinity-tracker",
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
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

/** One `listSurfaces` row: the serializable meta + pluginId (the onAction handle stays server-side). */
function surface(pluginId: PluginId, id: string, spec: PluginSurfaceRow["spec"]): PluginSurfaceRow {
  return { pluginId, id, anchor: "settings", title: "Affinity readings", tier: "static", spec };
}

/** The affinity-tracker panel spec (the shape its upgraded main.js registers). */
const AFFINITY_SPEC: NonNullable<PluginSurfaceRow["spec"]> = {
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
      return { toasts: [] };
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled summary above proves the mutation + its invalidate completed before this read.
  expect(recorder.lastInput("plugin.invokeUiAction")).toEqual({ pluginId: AFFINITY_ID, surfaceId: "affinity_summary", actionId: "refresh", values: {} });
});

test("the image owner-scope gate — a foreign assetId renders the placeholder, an OWNED one renders the image", async ({ mount, page }) => {
  // MINTED, never hand-written — the `image` node's assetId is `typeIdSchema`-validated at render, so a
  // literal would fail the spec and fall to the caps fallback instead of exercising the owner-scope gate.
  const foreignId = mintTypeId(ID_PREFIX.asset);
  const ownedId = mintTypeId(ID_PREFIX.asset);
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
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

test("#820 the BUNDLE arm — a shipped path paints, and one the plugin never shipped stays a placeholder", async ({ mount, page }) => {
  // The RENDERED half of seam 11. A spec names `ui/assets/happy.png`; the renderer resolves it through the
  // plugin's OWN install-time map (`plugin.listBundleAssets`, owner-scoped server-side) and then through the
  // SAME `assets.resolveBlobRefs` a declared id rides. The negative arm is the one that matters: an unshipped
  // path must fall to the per-node placeholder, NOT poison the id set — `resolveBlobRefs` validates its whole
  // input array against the TypeID schema, so a raw path leaking in would blank every image on the surface.
  const shippedId = mintTypeId(ID_PREFIX.asset);
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "stack",
    children: [
      { kind: "image", bundleAsset: "ui/assets/happy.png", alt: "the shipped sprite" },
      { kind: "image", bundleAsset: "ui/assets/never-shipped.png", alt: "a path this plugin never shipped" },
    ],
  };
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Sprite Plugin")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "sprites", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    // The plugin holds exactly ONE bundle image; the second path is absent from its own map.
    "plugin.listBundleAssets": () => [{ path: "ui/assets/happy.png", assetId: shippedId }],
    "assets.resolveBlobRefs": () => [{ assetId: shippedId, hash: "0".repeat(64), mime: "image/png" }],
    "sessions.me": () => USER_VIEWER,
  });
  await page.route(`**${BLOB_ROUTE}/**`, (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(ONE_PX_PNG_B64, "base64") }));
  await mount(<PluginsSurfaceStory />);

  await expect(page.locator('img[alt="the shipped sprite"]')).toHaveCount(1);
  // The unshipped path paints the placeholder (alt text, no <img>) — and the shipped one above still painted,
  // which is what proves the miss was CONTAINED to its own node rather than failing the whole resolve.
  await expect(page.getByText("a path this plugin never shipped")).toBeVisible();
  await expect(page.locator('img[alt="a path this plugin never shipped"]')).toHaveCount(0);
  // Only real asset ids ever reached the owner-scoped resolve — no bundle PATH crossed as an id.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the two image assertions above settled the rendered surface, so the resolve call it is built from has already been recorded.
  expect(recorder.lastInput("assets.resolveBlobRefs")).toEqual({ assetIds: [shippedId] });
});

test("#820 a spec with NO bundle path never asks for the map — the extra read is gated on the spec", async ({ mount, page }) => {
  const ownedId = mintTypeId(ID_PREFIX.asset);
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Plain Plugin")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "plain", { kind: "image", assetId: ownedId, alt: "a declared id" })],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "plugin.listBundleAssets": () => [],
    "assets.resolveBlobRefs": () => [{ assetId: ownedId, hash: "0".repeat(64), mime: "image/png" }],
    "sessions.me": () => USER_VIEWER,
  });
  await page.route(`**${BLOB_ROUTE}/**`, (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(ONE_PX_PNG_B64, "base64") }));
  await mount(<PluginsSurfaceStory />);

  await expect(page.locator('img[alt="a declared id"]')).toHaveCount(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the rendered <img> above proves the resolve pass completed, so a map read would have fired by now.
  expect(recorder.count("plugin.listBundleAssets")).toBe(0);
});

test("a spec that fails client-side validation renders a safe fallback, never a crash", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Broken Plugin")],
    // Deliberately impossible server wire: `iframe` is outside the closed node union. This escape is the
    // subject of the test — the client must re-validate a malformed/forward payload and render its fallback.
    "plugin.listSurfaces": malformedOrForwardTrpcWire([
      {
        pluginId: AFFINITY_ID,
        id: "broken",
        anchor: "settings",
        title: "Affinity readings",
        tier: "static",
        spec: { kind: "iframe", src: "https://evil.example" },
      },
    ]),
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("couldn't be displayed", { exact: false })).toBeVisible();
});

test("renderer coverage — a spec mixing container, display, and form kinds renders each as a house control", async ({ mount, page }) => {
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
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

test("#798: a card-atlas-style detail stage shows its cover — the BOUND hero (assetFrom) resolves a fetched assetId from state and renders the art", async ({
  mount,
  page,
}) => {
  // The whole point of #798's render half: an art-medium plugin (the card-atlas hub) `net.fetchAsset`s a remote
  // cover into the installer's CAS, publishes the returned assetId in state, and a data-driven detail stage binds
  // its hero to that state path. The declared-hero path could never carry a fetched id (the spec is fixed at
  // registration); this proves the bound arm closes that gap.
  const coverId = mintTypeId(ID_PREFIX.asset);
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "masterDetail",
    stages: [
      {
        id: "detail",
        kind: "detail",
        title: "Aria",
        // The hero's id lives in PUBLISHED STATE — not the spec — so a hub whose covers are fetched at runtime can
        // show them. NO URL is spellable here (assetFrom is a $state path); the resolved id is format-gated + then
        // owner-scope-resolved server-side, exactly like a declared cover.
        hero: { assetFrom: { $state: "coverId" }, alt: "Aria's cover" },
        body: { kind: "text", value: "A wandering cartographer." },
      },
    ],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    // The plugin published the fetched cover's assetId into state (what `net.fetchAsset` would have returned).
    "plugin.getSurfaceState": () => ({ coverId }),
    "plugin.getLog": () => [],
    // The owner-scoped resolve returns a ref for the installer's OWN fetched asset — the state-bound id rides the
    // SAME resolve a declared cover does.
    "assets.resolveBlobRefs": () => [{ assetId: coverId, hash: "0".repeat(64), mime: "image/png" }],
    "sessions.me": () => USER_VIEWER,
  });
  await page.route(`**${BLOB_ROUTE}/**`, (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(ONE_PX_PNG_B64, "base64") }));
  await mount(<PluginsSurfaceStory />);

  // The stage renders, and its hero — resolved from the state-bound assetId — is a real <img> pointing at the blob.
  await expect(page.getByText("A wandering cartographer.")).toBeVisible();
  await expect(page.locator('img[alt="Aria\'s cover"]')).toHaveCount(1);
});

// ── card-atlas-hub-polish: the two rendered-fidelity pins (stickler 2026-08-29 F2 + F4) ────────────────────

/** Long enough that an UNCAPPED column visibly stretches toward the wide mount — the pre-fix defect
 *  (the detail blurb ran ~150 chars/line edge-to-edge on the populated atlas capture). */
const DETAIL_PROSE =
  "The archive keeps its own weather, and the weather keeps its own archive; every page that is read " +
  "is a page that is rewritten, and every page rewritten is a page that will be read again by someone " +
  "who does not know they are the second reader of a sentence that was never finished the first time.";

/** Far wider than the reading measure resolves (75ch ≈ 600px here), so the cap is the only thing that can
 *  hold the column's line length down. */
const WIDE_MOUNT = 2000;

test("F2: a masterDetail DETAIL stage renders its column at the house --reading-measure token, and the cap BINDS at a wide mount", async ({ mount, page }) => {
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "masterDetail",
    stages: [
      {
        id: "card",
        kind: "detail",
        title: "Aria",
        body: { kind: "markdown", value: DETAIL_PROSE },
      },
    ],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory width={WIDE_MOUNT} />);
  await expect(page.getByText("The archive keeps its own weather", { exact: false })).toBeVisible();

  // The expected px is DERIVED FROM THE TOKEN inside the column itself (same inherited font ⇒ same `ch`),
  // never a px literal — the reading-measure.suite.ct.tsx mechanism. The uncapped A/B is the planted
  // control: forcing the cap off must WIDEN the column, proving the cap (not some other constraint) is
  // what holds the line length — a pin that agreed by coincidence would fail that arm.
  const reading = await page.evaluate((selector) => {
    const column = document.querySelector(selector);
    if (column === null || !(column instanceof HTMLElement)) {
      throw new Error(`no ${selector} mounted`);
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--reading-measure)";
    column.append(probe);
    const tokenPx = probe.getBoundingClientRect().width;
    probe.remove();
    const maxWidth = getComputedStyle(column).maxWidth;
    const renderedWidth = column.getBoundingClientRect().width;
    column.style.setProperty("max-width", "none", "important");
    const uncappedWidth = column.getBoundingClientRect().width;
    column.style.removeProperty("max-width");
    return { maxWidth, tokenPx, renderedWidth, uncappedWidth };
  }, '[data-slot="plugin-detail-stage"]');

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the evaluate ran after the visible-text barrier over a STATIC spec — max-width is stylesheet state, not async state, and cannot transition after settle.
  expect(reading.maxWidth).not.toBe("none");
  expect(Math.abs(Number.parseFloat(reading.maxWidth) - reading.tokenPx)).toBeLessThanOrEqual(1);
  // The cap BINDS: released, the column stretches toward the wide mount (the A/B mutation is same-tick
  // synchronous inside the evaluate above, so all four numbers are one settled sample).
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled evaluate sample as above — geometry read synchronously inside one evaluate, no async transition between reads.
  expect(reading.uncappedWidth).toBeGreaterThan(reading.renderedWidth + 100);
});

test("F4: an empty grid renders the house EmptyState carrying the plugin's own teaching line — not a bare gloss", async ({ mount, page }) => {
  // A BOUND grid whose state resolved to zero tiles — the card-atlas pre-search page.
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "grid",
    tilesFrom: { $state: "tiles" },
    tileAction: "open_result",
    empty: "Search to begin — the atlas covers Character Tavern and RisuRealm.",
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({ tiles: [] }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  // The house pattern (icon + measured title), not one grey sentence above a void — and the plugin's own
  // teaching text is what it carries.
  await expect(page.locator('[data-slot="empty-state-root"]')).toBeVisible();
  await expect(page.getByText("Search to begin — the atlas covers Character Tavern and RisuRealm.")).toBeVisible();
});

// ── #799: the vocabulary-REACH additions — grid.loading / icon / tabs ─────────────────────────────────────
// Each spec below rides the untyped `listSurfaces` stub, so these pins COMPILE against the pre-#799 source and
// FAIL on it: an unknown `kind` is refused by the client-side caps re-validation (the safe fallback renders
// instead), and an unknown `loading` key is silently STRIPPED by the node schema so no skeleton can appear.

test("#799: a grid's bound `loading` renders the shape-matched skeleton, and it OUTRANKS both tiles and the empty line", async ({ mount, page }) => {
  // The state carries BOTH the tiles and (via the spec) a teaching empty, so this pin cannot pass by the grid
  // simply having nothing to show: only the loading arm winning explains the skeleton.
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "grid",
    tilesFrom: { $state: "tiles" },
    tileAction: "open_result",
    aspect: "portrait",
    empty: "Search to begin.",
    loading: { $state: "busy" },
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({ busy: true, tiles: [{ id: "r0", title: "Aria" }] }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.locator('[data-slot="media-tile-grid-skeleton"]')).toBeVisible();
  // …and NOT the other two states. A grid mid-fetch is neither showing last query's results nor empty.
  await expect(page.locator('[data-slot="media-tile-grid"]')).toHaveCount(0);
  await expect(page.getByText("Aria")).toHaveCount(0);
  await expect(page.getByText("Search to begin.")).toHaveCount(0);
});

test("#799: the SAME grid spec with `busy: false` shows its tiles — the loading arm is driven by state, not baked in", async ({ mount, page }) => {
  // A PLANTED CONTROL, not a defect proof: identical spec, one state value flipped. It passes against the
  // pre-#799 renderer too (which strips `loading` and shows the tiles for a different reason) — its job is
  // to rule out a skeleton that renders unconditionally, which would satisfy the pin above just as well.
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "grid",
    tilesFrom: { $state: "tiles" },
    tileAction: "open_result",
    empty: "Search to begin.",
    loading: { $state: "busy" },
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({ busy: false, tiles: [{ id: "r0", title: "Aria" }] }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Aria")).toBeVisible();
  await expect(page.locator('[data-slot="media-tile-grid-skeleton"]')).toHaveCount(0);
});

test("#799: an `icon` node renders the NAMED house glyph — labelled ones are named, unlabelled ones are decorative", async ({ mount, page }) => {
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "row",
    children: [
      { kind: "icon", name: "download", label: "Downloads" },
      { kind: "text", value: "7.4k" },
      { kind: "icon", name: "star" },
    ],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);
  await expect(page.getByText("7.4k")).toBeVisible();

  // GLYPH IDENTITY, not "an icon rendered": lucide stamps its own name as a class, so this fails if the
  // name→component map ever points `download` at the wrong glyph.
  await expect(page.locator("svg.lucide-download")).toHaveCount(1);
  await expect(page.locator("svg.lucide-star")).toHaveCount(1);
  // The label decides the a11y treatment: named when the plugin claims the glyph says something, hidden
  // (the house default for a glyph beside text) when it does not.
  await expect(page.locator('svg.lucide-download[aria-label="Downloads"]')).toHaveCount(1);
  await expect(page.locator('svg.lucide-star[aria-hidden="true"]')).toHaveCount(1);
});

test("#799: a CONSENT glyph is unspellable — an off-tuple icon name is refused by the caps, never drawn", async ({ mount, page }) => {
  // A FENCE, not a defect proof (it passes pre-#799 too, where `icon` is not a kind at all): what it guards
  // is the FUTURE — the day someone widens the tuple, this is what turns the curation from a comment into a
  // failing test. `lock` exists in the house seal and is deliberately absent from the plugin tuple, so a spec
  // naming it fails client-side validation and the whole surface renders the safe fallback.
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Impostor")],
    "plugin.listSurfaces": malformedOrForwardTrpcWire([
      {
        pluginId: AFFINITY_ID,
        id: "atlas",
        anchor: "settings",
        title: "Affinity readings",
        tier: "static",
        spec: { kind: "row", children: [{ kind: "icon", name: "lock", label: "Secure" }] },
      },
    ]),
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("couldn't be displayed", { exact: false })).toBeVisible();
  // Scoped to the PLUGIN'S OWN region (the shell's named group), not the page: the app draws its own
  // `Lock` glyphs in the surrounding Plugins chrome, and a page-wide locator would read one of THOSE as
  // the plugin's — the exact false negative this pin exists to rule out. Nothing the plugin drew survives.
  const region = page.getByRole("group", { name: "Impostor — Affinity readings" });
  await expect(region.locator("svg")).toHaveCount(0);
});

test("#799: a `tabs` node renders the house one-of-N strip and a pick round-trips the fresh value", async ({ mount, page }) => {
  // STATEFUL state read, so the barrier below settles on the POST-INVOKE repaint rather than an in-flight
  // flash: the status line exists only after the action fired.
  let picked = false;
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "stack",
    children: [
      {
        kind: "tabs",
        name: "hub",
        label: "Hub",
        actionId: "switch_hub",
        value: "tavern",
        options: [
          { value: "tavern", label: "Character Tavern" },
          { value: "realm", label: "RisuRealm" },
        ],
      },
      { kind: "text", voice: "gloss", value: { $state: "status" } },
    ],
  };
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => (picked ? { status: "Now browsing RisuRealm." } : null),
    "plugin.invokeUiAction": () => {
      picked = true;
      return { toasts: [] };
    },
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  // The house SEGMENTED strip: a radiogroup carrying its own accessible name, with every option visible at
  // once (which is the whole difference from the `select` this node is not).
  const strip = page.getByRole("radiogroup", { name: "Hub" });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole("radio")).toHaveCount(2);
  await expect(strip.getByRole("radio", { name: "Character Tavern" })).toHaveAttribute("aria-checked", "true");

  await strip.getByRole("radio", { name: "RisuRealm" }).click();

  // SETTLED: the status line the post-invoke invalidate repainted — it exists only after the state read flips.
  await expect(page.getByText("Now browsing RisuRealm.")).toBeVisible();
  await expect(strip.getByRole("radio", { name: "RisuRealm" })).toHaveAttribute("aria-checked", "true");
  await expect(strip.getByRole("radio", { name: "Character Tavern" })).toHaveAttribute("aria-checked", "false");
  // The pick IS the act, and it carries the FRESH value — not the stale draft the async state write leaves.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled status line above proves the mutation + its invalidate completed before this read.
  expect(recorder.lastInput("plugin.invokeUiAction")).toEqual({
    pluginId: AFFINITY_ID,
    surfaceId: "atlas",
    actionId: "switch_hub",
    values: { hub: "realm" },
  });
});

test("hub v1.2: a bound grid tile carrying `tags` renders its chip row — the filter vocabulary reaches the tile", async ({ mount, page }) => {
  // The tags ride PUBLISHED STATE through `pluginBoundGridTileSchema` (which STRIPS unknown keys — so this
  // pin is red against a vocabulary without the field: the schema itself is the planted control) and land as
  // the MediaTileGrid chip row. A tile without tags renders no row at all (the second tile).
  const spec: NonNullable<PluginSurfaceRow["spec"]> = { kind: "grid", tilesFrom: { $state: "tiles" }, tileAction: "open_result" };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({
      tiles: [
        { id: "r0", title: "Aria", subtitle: "cartographer · 1.2k↓", tags: ["fantasy", "vampire"] },
        { id: "r1", title: "Bram", subtitle: "untagged" },
      ],
    }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Aria")).toBeVisible();
  const tagRow = page.locator('[data-slot="media-tile-tags"]');
  await expect(tagRow).toHaveCount(1); // exactly the tagged tile's — an untagged tile renders no empty shell.
  await expect(tagRow.getByText("fantasy")).toBeVisible();
  await expect(tagRow.getByText("vampire")).toBeVisible();
});

test("hub v1.3: a BOUND select (`optionsFrom`) renders its options from published state — a per-hub sort menu is data", async ({ mount, page }) => {
  // Red-first control: against the pre-v1.3 renderer this spec either fails validation (unknown arm) or
  // crashes the select on its missing `options` — the pin cannot pass vacuously.
  const spec: NonNullable<PluginSurfaceRow["spec"]> = {
    kind: "stack",
    children: [{ kind: "select", name: "sort", label: "Sort", optionsFrom: { $state: "sortOptions" }, value: "relevance", actionId: "search" }],
  };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({
      sortOptions: [
        { value: "relevance", label: "Hub default" },
        { value: "views", label: "Most viewed" },
        { bogus: true }, // malformed entry — dropped by the resolve gate, never fatal.
      ],
    }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  const trigger = page.getByRole("combobox", { name: "Sort" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("option", { name: "Most viewed" })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2); // the malformed third entry was dropped at resolve.
});

test("hub v1.3: a BOUND keyValue (`rowsFrom`) renders its rows from published state — a per-hub stat sheet is data", async ({ mount, page }) => {
  const spec: NonNullable<PluginSurfaceRow["spec"]> = { kind: "keyValue", rowsFrom: { $state: "detail.stats" } };
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => ({
      detail: {
        stats: [
          { key: "Downloads", value: "7.4k" },
          { key: "Favorites", value: "212" },
          { key: 5 }, // malformed — dropped, never fatal.
        ],
      },
    }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Downloads")).toBeVisible();
  await expect(page.getByText("7.4k")).toBeVisible();
  await expect(page.getByText("Favorites")).toBeVisible();
  await expect(page.getByText("212")).toBeVisible();
});

test("hub v1.3: a LIVE toggle (`actionId`) fires its action on flip with the fresh value riding as an extra", async ({ mount, page }) => {
  const spec: NonNullable<PluginSurfaceRow["spec"]> = { kind: "toggle", name: "sfw", label: "SFW only", value: false, actionId: "search" };
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(AFFINITY_ID, "Card Atlas")],
    "plugin.listSurfaces": () => [surface(AFFINITY_ID, "atlas", spec)],
    "plugin.getSurfaceState": () => null,
    "plugin.invokeUiAction": () => ({ toasts: [] }),
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  const toggle = page.getByRole("switch", { name: "SFW only" });
  await expect(toggle).toBeVisible();
  await toggle.click();

  // The pick IS the act: the round-trip fires with the FRESH value (the async React state write cannot
  // race it — the select's v1.2 `extra` mechanism, same seam).
  await expect
    .poll(() => recorder.lastInput("plugin.invokeUiAction"))
    .toEqual({ pluginId: AFFINITY_ID, surfaceId: "atlas", actionId: "search", values: { sfw: "true" } });
});
