// CT: the U7 escape hatch's EMBEDDER (plugin-ui-plane #679 §6.2, seam 13) — the half of the trust boundary that
// only a real browser can prove. Three things live here and nowhere else:
//
//   1. THE SANDBOX ATTRIBUTE AS RENDERED. `sandbox="allow-scripts"` with no `allow-same-origin` is the belt
//      that survives a mis-wired route losing its response header. A unit test can assert the CONSTANT; only a
//      DOM read proves the attribute reached the element.
//   2. WINDOW IDENTITY. Every sandboxed document reports `event.origin === "null"`, so origin cannot tell OUR
//      frame from any other opaque sender on the page. The listener authenticates by `event.source ===
//      iframe.contentWindow` — and that check is unfalsifiable outside a browser, because it is about which
//      WINDOW OBJECT sent the message. Both directions are pinned: a message from the frame is honoured, and
//      a byte-identical message from a DIFFERENT window is ignored. Without the positive control the negative
//      one would pass on a listener that ignored everything.
//   3. THE FLANK LAW AS PIXELS. A frame that cannot mint renders NOTHING — not an empty labelled box. The
//      shell is drawn by `PluginFrame` itself precisely so this is true of the chrome as well as the content.
//
// The document is served by a route stub carrying the REAL response CSP, so the frame in this test is a genuine
// opaque-origin sandboxed document running its own script — not a same-origin stand-in.

import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginsSurfaceStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const CHESS_ID = castId<PluginId>("plugin_ct_chess0000000001");
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };
const HANDLE = "0123456789abcdef0123456789abcdef";
const FRAME_URL = `${PLUGIN_FRAME_ROUTE}/${HANDLE}`;

/** The frame document's REAL response policy (the `interactive` document arm at the media floor + the `data:`
 *  door — `entry/http/plugin-frame.ts` builds exactly this). Served here so the frame under test is a true
 *  opaque-origin sandboxed document rather than a same-origin lookalike. */
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

/** The board document: the plugin's own markup plus a script that reports a height and can post a host call on
 *  demand — the two things a real frame does over the one channel it has. */
const BOARD_DOC = `<!doctype html><html><head><style>body{margin:0}</style><script>
  addEventListener("message", function (e) {
    if (e.data === "orb-ct-report-height") { parent.postMessage({ orbCardFrameHeight: 640 }, "*"); }
  });
</script></head><body><div id="board" style="height:640px">CHESS BOARD</div></body></html>`;

/** An enabled installed row holding the hatch's grant. */
function enabledRow(declared: readonly string[]): Record<string, unknown> {
  return {
    id: CHESS_ID,
    slug: "chess",
    name: "Chess",
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: declared,
    grantedCapabilities: declared,
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One `listSurfaces` row for a FRAME-tier settings surface. Note what is ABSENT: any `spec`, and any document
 *  bytes — the client names a surface and the server holds the frame. */
const FRAME_SURFACE = { pluginId: CHESS_ID, id: "board", anchor: "settings", title: "Chess board", tier: "frame" };

/** Stub the tRPC reads + the doorway. `mintable: false` makes the mint fail, which is the degrade arm. */
async function setup(page: Parameters<typeof routeTrpc>[0], opts: { readonly mintable: boolean }): Promise<void> {
  await routeTrpc(page, {
    "plugin.list": () => [enabledRow(["ui.surface", "ui.frame"])],
    "plugin.listSurfaces": () => [FRAME_SURFACE],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "assets.resolveBlobRefs": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  // The MINT (POST) — a selector in, a handle URL out.
  await page.route(`**${PLUGIN_FRAME_ROUTE}`, (route) =>
    opts.mintable
      ? route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: FRAME_URL, expiresInMs: 1_800_000 }) })
      : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "no such plugin frame" }) }),
  );
  // The DOCUMENT (GET) — served with its own policy, exactly as the route does.
  await page.route(`**${FRAME_URL}`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", headers: { "content-security-policy": FRAME_CSP }, body: BOARD_DOC }),
  );
}

test("THE OWNER'S TEST — a frame surface draws its own pixels, inside the plugin-labelled shell", async ({ mount, page }) => {
  await setup(page, { mintable: true });
  await mount(<PluginsSurfaceStory />);

  const frame = page.locator('[data-slot="sandbox-frame"][data-delivery="routed"]');
  await expect(frame).toBeVisible();
  // The plugin's OWN document painted — the arbitrary pixels the declarative vocabulary cannot express.
  await expect(page.frameLocator('[data-slot="sandbox-frame"][data-delivery="routed"]').locator("#board")).toHaveText("CHESS BOARD");

  // THE IMPERSONATION WALL (§4.8): the frame is inside first-party chrome naming its author, with no opt-out,
  // and the frame element itself carries an accessible name (an iframe is focusable, so `title` IS that name).
  await expect(page.getByText("Chess", { exact: false }).first()).toBeVisible();
  await expect(frame).toHaveAttribute("title", "Chess — Chess board");

  // THE ISOLATION, as rendered. `allow-scripts` EXACTLY — never `allow-same-origin` (the combination that
  // would let the frame reach the app origin AND shed its own sandbox), never top-navigation/popups/forms. A
  // retrying attribute matcher (`toHaveAttribute`) rather than a captured `getAttribute` read: the exact
  // string match is what proves nothing extra is granted.
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(frame).toHaveAttribute("loading", "lazy");
  // It loads the ROUTED document — the only delivery whose response can carry its own policy.
  await expect(frame).toHaveAttribute("src", FRAME_URL);
});

test("WINDOW IDENTITY — the frame's own height report is honoured; a byte-identical one from another window is not", async ({ mount, page }) => {
  await setup(page, { mintable: true });
  await mount(<PluginsSurfaceStory />);
  const frame = page.locator('[data-slot="sandbox-frame"][data-delivery="routed"]');
  await expect(frame).toBeVisible();

  // THE NEGATIVE ARM, run FIRST so it cannot be satisfied by a height that was already applied. The top window
  // posts the exact payload the frame would send. `event.origin` cannot distinguish these: a sandboxed frame's
  // origin is the string "null", so an origin check would accept any opaque sender on the page. Only window
  // identity names one sender.
  await page.evaluate(() => {
    window.postMessage({ orbCardFrameHeight: 640 }, "*");
  });
  // The pre-measurement floor still stands — the impostor moved nothing.
  await expect(frame).toHaveJSProperty("style.height", "320px");

  // THE POSITIVE CONTROL. Without it the assertion above would pass on a listener that ignored EVERY message,
  // which is the shape a broken window-identity check most plausibly takes.
  await page.frameLocator('[data-slot="sandbox-frame"][data-delivery="routed"]').locator("#board").waitFor();
  await frame.evaluate((el: HTMLIFrameElement) => {
    el.contentWindow?.postMessage("orb-ct-report-height", "*");
  });
  await expect(frame).toHaveJSProperty("style.height", "640px");
});

test("A FRAME THAT CANNOT MINT RENDERS NOTHING — no empty labelled box, no broken frame (§4.9)", async ({ mount, page }) => {
  await setup(page, { mintable: false });
  await mount(<PluginsSurfaceStory />);

  // The pane itself is alive (the plugin row rendered), so this is an absence, not a blank mount.
  await expect(page.getByText("Chess", { exact: false }).first()).toBeVisible();
  await expect(page.locator('[data-slot="sandbox-frame"][data-delivery="routed"]')).toHaveCount(0);
  // …and no ORPHANED SHELL either. The shell is drawn by `PluginFrame` itself for exactly this reason: a
  // caller that wrapped the frame would leave a labelled, empty card whenever the mint failed — the "broken
  // frame in the room" the flank law forbids. The surface's own title is the tell.
  await expect(page.getByText("Chess board")).toHaveCount(0);
});
