// CT: the U7 escape hatch's EMBEDDER (seam 13) — the half of the trust boundary that
// only a real browser can prove. Four things live here and nowhere else:
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
//   4. THE HOST-CALL RELAY (#106). A frame's call reaches `plugin.uiHostCall` under the frame's OWN plugin id,
//      taken from the mount. The server gate (`fn ∈ UI_PROXYABLE ∩ the stored grant`, owner-scoped) cannot tell
//      which of the caller's own plugins a message came from, so the embedder's binding of frame to plugin id is
//      the one control that stops a frame from borrowing a sibling plugin's grants. Pinned here through the real
//      settings anchor: a granted call is answered, an ungranted one gets the reason-free refusal, a message
//      naming another plugin's id still travels under the frame's own, and the in-flight budget holds. Through
//      the real tool-card anchor: a chat-scoped call goes out scoped to the transcript's room.
//
// The document is served by a route stub carrying the REAL response CSP, so the frame in this test is a genuine
// opaque-origin sandboxed document running its own script — not a same-origin stand-in.

import {
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_FRAME_CALL_REFUSED,
  PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX,
  PLUGIN_FRAME_ROUTE,
} from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CHAT_ID } from "../../chat/fixtures.ts";
import { PluginsSurfaceStory, PluginToolCardStory } from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];
type PluginSurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

const A_PAST_INSTANT = 1_760_000_000_000;
const CHESS_ID = castId<PluginId>("plugin_ct_chess0000000001");
/** A SIBLING plugin the same user installed, holding a grant Chess does not (`global_vars`). It registers no
 *  surface: it exists so a Chess frame has a real, owned, better-granted id to try to borrow. */
const VAULT_ID = castId<PluginId>("plugin_ct_vault0000000001");
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" } satisfies TrpcWireOutput<"sessions.me">;
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

/** The board document: the plugin's own markup plus a script that reports a height and posts host calls on
 *  demand — the two things a real frame does over the one channel it has. `orbCtPost` carries the EXACT
 *  messages the test wants the frame to send (so a hostile shape is authored here, not smoothed by a helper);
 *  every `orbPluginFrameResult` the embedder answers lands as `#r-<callId>` holding the result verbatim. */
const BOARD_DOC = `<!doctype html><html><head><style>body{margin:0}</style><script>
  addEventListener("message", function (e) {
    var d = e.data;
    if (d === "orb-ct-report-height") { parent.postMessage({ orbCardFrameHeight: 640 }, "*"); return; }
    if (d && d.orbCtPost) { d.orbCtPost.forEach(function (m) { parent.postMessage(m, "*"); }); return; }
    if (d && d.orbPluginFrameResult) {
      var out = document.createElement("output");
      out.id = "r-" + d.orbPluginFrameResult.callId;
      out.textContent = JSON.stringify(d.orbPluginFrameResult);
      document.getElementById("results").appendChild(out);
    }
  });
</script></head><body><div id="board" style="height:640px">CHESS BOARD</div><div id="results"></div></body></html>`;

const FRAME_SELECTOR = '[data-slot="sandbox-frame"][data-delivery="routed"]';

/** What Chess's stored grant holds. `global_vars` is deliberately absent: it is the grant Vault holds and a
 *  Chess frame must not be able to borrow. */
const CHESS_GRANTS: PluginListRow["grantedCapabilities"] = ["ui.surface", "ui.frame", "storage.kv", "chat.read"];

/** What each installed plugin's STORED grant holds — the server gate's input. */
const STORED_GRANTS: ReadonlyMap<string, readonly string[]> = new Map([
  [CHESS_ID, CHESS_GRANTS],
  [VAULT_ID, ["global_vars", "storage.kv"]],
]);

/** A stand-in for the server's re-gate (`verbs/ui-host-call.ts`), built from the SAME contracts tables: an
 *  owned plugin, a proxyable fn, and the fn's capability in that plugin's stored grant, else a refusal whose
 *  message names the missing grant (the server's own wording). The real ladder is pinned by
 *  `tests/server/domain/plugin/verbs/ui-host-call.int.test.ts`; what THIS file proves is the client half: which
 *  plugin id the relay sends, and that no refusal reason reaches the frame. Each answer names the plugin whose
 *  grant served it, so a borrowed grant would be visible in the frame's own DOM. */
function gatedHostCall(input: TrpcInput<"plugin.uiHostCall">): TrpcWireOutput<"plugin.uiHostCall"> | ReturnType<typeof trpcError> {
  const grants = STORED_GRANTS.get(input.pluginId);
  if (grants === undefined || !isUiProxyableHostFunction(input.fn) || !grants.includes(HOST_FUNCTION_CAPABILITY[input.fn])) {
    return trpcError({ code: "BAD_REQUEST", message: `plugin host: this plugin has not been granted the capability ${input.fn} needs` });
  }
  return { resultJson: JSON.stringify(`${input.pluginId}:${input.fn}`) };
}

/** One bridge call, in the frame's wire shape. `extra` adds keys a hostile frame might invent. */
function frameCall(callId: string, fn: string, args: unknown, extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return { orbPluginFrameCall: { callId, fn, args, ...extra } };
}

/** Have the frame post `messages` to its parent from inside its own window, the only sender the embedder
 *  accepts. Waits for the frame's script to be live first. */
async function postFromFrame(page: Page, messages: readonly unknown[]): Promise<void> {
  await page.frameLocator(FRAME_SELECTOR).locator("#board").waitFor();
  await page.locator(FRAME_SELECTOR).evaluate((el: HTMLIFrameElement, posted) => {
    el.contentWindow?.postMessage({ orbCtPost: posted }, "*");
  }, messages);
}

/** The result the frame received for `callId`, as the frame's own DOM holds it. */
function frameResult(frame: FrameLocator, callId: string): Locator {
  return frame.locator(`#r-${callId}`);
}

function refused(callId: string): string {
  return JSON.stringify({ callId, ok: false, error: PLUGIN_FRAME_CALL_REFUSED });
}

function answered(callId: string, value: unknown): string {
  return JSON.stringify({ callId, ok: true, value });
}

/** An enabled installed row holding the hatch's grant. */
function enabledRow(declared: PluginListRow["declaredCapabilities"]): PluginListRow {
  return {
    id: CHESS_ID,
    slug: "chess",
    name: "Chess",
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    updateSource: null,
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
const FRAME_SURFACE = {
  pluginId: CHESS_ID,
  id: "board",
  anchor: "settings",
  title: "Chess board",
  tier: "frame",
} satisfies PluginSurfaceRow;

/** Stub the tRPC reads + the doorway. `mintable: false` makes the mint fail, which is the degrade arm.
 *  `hostCall` answers `plugin.uiHostCall`; the default is the grant-table stand-in above. */
async function setup(
  page: Page,
  opts: {
    readonly mintable: boolean;
    readonly hostCall?: TrpcRoutes<"plugin.uiHostCall">["plugin.uiHostCall"];
    readonly surface?: PluginSurfaceRow;
  },
): Promise<TrpcRecorder> {
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [enabledRow(CHESS_GRANTS), { ...enabledRow(["global_vars", "storage.kv"]), id: VAULT_ID, slug: "vault", name: "Vault" }],
    "plugin.listSurfaces": () => [opts.surface ?? FRAME_SURFACE],
    "plugin.getSurfaceState": () => null,
    "plugin.getLog": () => [],
    "plugin.uiHostCall": opts.hostCall ?? gatedHostCall,
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
  return recorder;
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

test("HOST CALLS — a granted call is relayed under the frame's own plugin id and answered; an ungranted one is refused without a reason", async ({
  mount,
  page,
}) => {
  const recorder = await setup(page, { mintable: true });
  await mount(<PluginsSurfaceStory />);
  const frame = page.frameLocator(FRAME_SELECTOR);

  await postFromFrame(page, [frameCall("granted", "storage.get", ["opening"]), frameCall("ungranted", "variables.get", ["secret"])]);

  // Answered with the relay's value, parsed back out of the proc's `resultJson`.
  await expect(frameResult(frame, "granted")).toHaveText(answered("granted", `${CHESS_ID}:storage.get`));
  // Refused with the one-word refusal. The server's message names the missing capability; the frame must not
  // learn it (the grant-versus-no-such-function oracle the contract withholds).
  await expect(frameResult(frame, "ungranted")).toHaveText(refused("ungranted"));

  // Both calls crossed the wire under the frame's own id, each with its args as positional JSON.
  await expect
    .poll(() => recorder.inputs("plugin.uiHostCall"))
    .toEqual([
      { pluginId: CHESS_ID, fn: "storage.get", argsJson: JSON.stringify(["opening"]) },
      { pluginId: CHESS_ID, fn: "variables.get", argsJson: JSON.stringify(["secret"]) },
    ]);
});

test("HOST CALLS — a message naming a sibling plugin's id cannot borrow that plugin's grants", async ({ mount, page }) => {
  const recorder = await setup(page, { mintable: true });
  await mount(<PluginsSurfaceStory />);
  const frame = page.frameLocator(FRAME_SELECTOR);

  // Vault holds `global_vars`; Chess does not. The frame names Vault's real, owned id in both places a hostile
  // document could put it: inside the call envelope and beside it.
  await postFromFrame(page, [
    frameCall("inside", "variables.get", ["secret"], { pluginId: VAULT_ID }),
    { ...frameCall("beside", "variables.get", ["secret"]), pluginId: VAULT_ID },
  ]);

  await expect(frameResult(frame, "inside")).toHaveText(refused("inside"));
  await expect(frameResult(frame, "beside")).toHaveText(refused("beside"));
  // Exactly two calls, both under Chess's id, so a relay that sent nothing at all cannot pass as "no escalation".
  await expect
    .poll(() => recorder.inputs("plugin.uiHostCall").map((input) => (input as { readonly pluginId: PluginId }).pluginId))
    .toEqual([CHESS_ID, CHESS_ID]);
});

test("HOST CALLS — a tool-card frame's chat-scoped call goes out scoped to the transcript's room", async ({ mount, page }) => {
  const toolWireName = "plugin_chess_move";
  const recorder = await setup(page, {
    mintable: true,
    surface: { pluginId: CHESS_ID, id: "move_card", anchor: "tool-card", title: "Chess move", tier: "frame", toolWireName },
  });
  const record = { toolCallId: "call_ct_chess_move", name: toolWireName, arguments: "{}", result: "{}", isError: false, durationMs: 5 };
  await mount(<PluginToolCardStory activeChatId={CHAT_ID} records={[record]} />);
  const frame = page.frameLocator(FRAME_SELECTOR);

  await postFromFrame(page, [frameCall("history", "chat.listMessages", [{ limit: 5 }])]);

  await expect(frameResult(frame, "history")).toHaveText(answered("history", `${CHESS_ID}:chat.listMessages`));
  // The room is the mount's, never the frame's: the frame named none.
  await expect
    .poll(() => recorder.inputs("plugin.uiHostCall"))
    .toEqual([{ pluginId: CHESS_ID, fn: "chat.listMessages", argsJson: JSON.stringify([{ limit: 5 }]), chatId: CHAT_ID }]);
});

test("HOST CALLS — the in-flight budget refuses the call past the cap and frees its slots on settle", async ({ mount, page }) => {
  const hold = trpcHold();
  const recorder = await setup(page, { mintable: true, hostCall: hold });
  await mount(<PluginsSurfaceStory />);
  const frame = page.frameLocator(FRAME_SELECTOR);

  const burst = Array.from({ length: PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX + 1 }, (_, i) => frameCall(`b${i}`, "storage.get", ["opening"]));
  await postFromFrame(page, burst);

  // The call past the cap is refused locally and never reaches the wire, while the ones under it are held open.
  const over = `b${PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX}`;
  await expect(frameResult(frame, over)).toHaveText(refused(over));
  await expect.poll(() => recorder.count("plugin.uiHostCall")).toBe(PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX);
  await expect(frameResult(frame, "b0")).toHaveCount(0);

  hold.release({ resultJson: JSON.stringify("e4") });
  for (let i = 0; i < PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX; i += 1) {
    await expect(frameResult(frame, `b${i}`)).toHaveText(answered(`b${i}`, "e4"));
  }
  // The settled calls returned their slots: the next call is relayed, not refused.
  await postFromFrame(page, [frameCall("after", "storage.get", ["opening"])]);
  await expect(frameResult(frame, "after")).toHaveText(answered("after", "e4"));
  await expect.poll(() => recorder.count("plugin.uiHostCall")).toBe(PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX + 1);
});
