// CT: the U7 escape hatch at the PAGE and DIALOG anchors (plugin-ui-plane #679 §6.2 / #787). U7 wired the frame
// mount for chat-flank/settings/tool-card and left `page`/`dialog` at `frame: false` as a conservative U5×U7
// default; #787 is the deliberate decision that default named — the client mount now exists at both anchors, so
// `PLUGIN_ANCHOR_TIERS` admits the frame tier there. What only a real browser can prove, and what this file owns:
//
//   * A `page`-anchored FRAME renders the plugin's OWN isolated document INSIDE the page-scale shell — the §9
//     pinned attribution band (the biggest impersonation canvas in the design), with the sandboxed iframe beneath
//     it. Before #787 the same row (a frame surface carries no `spec`) rendered the "hasn't published anything"
//     gloss inside the shell — no frame at all. The rendered sandbox-frame is the whole difference.
//   * A `dialog`-anchored FRAME renders its document inside the house modal body, seeded through the SAME
//     `openPluginDialog` round-trip channel a plugin action outcome uses (the §4.5a wall: nothing opens a plugin
//     dialog directly). Before #787 the frame row rendered an EMPTY labelled shell (a frame carries no spec, so
//     the body was `null`) — the "empty labelled box" the flank law forbids.
//
// The document is served by a route stub carrying the REAL response CSP, so the frame under test is a genuine
// opaque-origin sandboxed document running its own script — not a same-origin stand-in (the plugin-frame.ct.tsx
// posture, reused).

import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ExtensionsPageStory, PluginDialogBodyStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const ORACLE_ID = castId<PluginId>("plugin_ct_oracle00000001");
const DIALOG_ID = castId<PluginId>("plugin_ct_dialog00000001");
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };
const HANDLE = "0123456789abcdef0123456789abcdef";
const FRAME_URL = `${PLUGIN_FRAME_ROUTE}/${HANDLE}`;

/** The frame document's REAL response policy (`entry/http/plugin-frame.ts`), served here so the frame under test
 *  is a true opaque-origin sandboxed document rather than a same-origin lookalike. */
const FRAME_CSP = [
  "sandbox allow-scripts",
  "script-src 'unsafe-inline'",
  "default-src 'none'",
  "img-src 'self' data:",
  "media-src 'self' data:",
  "style-src 'unsafe-inline'",
  "font-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

/** The plugin's own document — its markup plus the height-report script every real frame carries. */
const BOARD_DOC = `<!doctype html><html><head><style>body{margin:0}</style><script>
  addEventListener("message", function (e) {
    if (e.data === "orb-ct-report-height") { parent.postMessage({ orbCardFrameHeight: 480 }, "*"); }
  });
</script></head><body><div id="board" style="height:480px">CHESS BOARD</div></body></html>`;

/** One installed row as `plugin.list` projects it, holding the hatch's `ui.frame` grant. */
function pluginRow(id: PluginId, slug: string, name: string): Record<string, unknown> {
  return {
    id,
    slug,
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface", "ui.frame"],
    grantedCapabilities: ["ui.surface", "ui.frame"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One `listSurfaces` row for a FRAME-tier surface: no `spec`, no document bytes — the client names a surface and
 *  the server holds the frame. */
function frameRow(pluginId: PluginId, id: string, anchor: string, title: string): Record<string, unknown> {
  return { pluginId, id, anchor, title, tier: "frame" };
}

/** Stub the tRPC reads + the doorway (mint POST → handle URL, document GET → the policied HTML). */
async function setup(page: Parameters<typeof routeTrpc>[0], rows: Readonly<Record<string, unknown>>): Promise<void> {
  await routeTrpc(page, {
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
    ...rows,
  });
  await page.route(`**${PLUGIN_FRAME_ROUTE}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: FRAME_URL, expiresInMs: 1_800_000 }) }),
  );
  await page.route(`**${FRAME_URL}`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", headers: { "content-security-policy": FRAME_CSP }, body: BOARD_DOC }),
  );
}

const ROUTED_FRAME = '[data-slot="sandbox-frame"][data-delivery="routed"]';

test("a PAGE-anchored frame renders its own document inside the PAGE-SCALE shell (§9 band + the isolated iframe)", async ({ mount, page }) => {
  await setup(page, {
    "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck")],
    "plugin.listSurfaces": () => [frameRow(ORACLE_ID, "board_page", "page", "The Board")],
  });
  await mount(<ExtensionsPageStory selectKey={`${ORACLE_ID}:board_page`} />);

  // THE §9 WALL: a full-page frame is arbitrary HTML at the biggest impersonation scale, so it wears the pinned
  // attribution band — the plugin's name and the "Extension" kicker — that every vocabulary page wears.
  const band = page.getByTestId("plugin-page-attribution");
  await expect(band).toBeVisible();
  await expect(band).toContainText("Oracle Deck");
  await expect(band).toContainText("Extension");

  // THE FRAME ITSELF, beneath the band: the plugin's own opaque-origin document painted its own pixels. Before
  // #787 this row rendered the "hasn't published anything" gloss and no frame at all.
  const frame = page.locator(ROUTED_FRAME);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("title", "Oracle Deck — The Board");
  await expect(page.frameLocator(ROUTED_FRAME).locator("#board")).toHaveText("CHESS BOARD");
});

test("a DIALOG-anchored frame renders its own document inside the house modal body (§4.5a)", async ({ mount, page }) => {
  await setup(page, {
    "plugin.list": () => [pluginRow(DIALOG_ID, "chess", "Chess")],
    "plugin.listSurfaces": () => [frameRow(DIALOG_ID, "board", "dialog", "Chess board")],
  });
  await mount(<PluginDialogBodyStory />);

  // The modal body names its author (the impersonation wall, no opt-out) and draws the plugin's own document.
  // Before #787 a frame dialog rendered an EMPTY labelled shell — the "empty labelled box" the flank law forbids.
  const frame = page.locator(ROUTED_FRAME);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("title", "Chess — Chess board");
  await expect(page.getByText("Chess", { exact: false }).first()).toBeVisible();
  await expect(page.frameLocator(ROUTED_FRAME).locator("#board")).toHaveText("CHESS BOARD");
});
