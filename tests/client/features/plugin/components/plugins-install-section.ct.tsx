// CT: the C7 plugin CLIENT surface (the Installed + Add-a-plugin config sections · plugin-install-card · plugin-grant-list ·
// plugin-row) over the REAL tRPC path with a stubbed network (routeTrpc).
//
// THE LOAD-BEARING ASSERTIONS ARE THE CONSENT ONES, because the grant screen is the security surface of this
// feature (#24): a person must be able to see EXACTLY what they are agreeing to. So these tests assert
// through what a person can read — the capability's plain-English CONSEQUENCE, the money mark on a SPEND
// capability, the verbatim `netHosts` entries — never through a testid or the wire vocabulary. A screen that
// rendered `turn.trigger` as a bare wire string would pass a testid assertion and fail the requirement.
//
// The bundle is a REAL zip built with the same `fflate` the surface reads it back with, fed through the
// PICKER feeder (`setInputFiles` on the dropzone's own input). That path is the point: no server verb
// projects a declared capability list from un-installed bytes, so the grant screen's list can only come from
// a client-side manifest read, and a story that passed the list in as a prop would prove nothing.
//
// THE WIDENED-REACH RE-CONSENT CASE is the one that most needs a rendered receipt. The server lands a
// reach-widening upgrade `disabled` (`domain/plugin/verbs/upgrade.ts`) with `reconsentPending: true`, and
// these assert the row SAYS WHAT WIDENED — the new capability by name and consequence, the new host
// verbatim AND MARKED, the carried-forward host verbatim and UNMARKED — then drive the REAL escape path
// (`plugin.setGrant`) end to end, at both ask sizes: one outstanding capability and two.
//
// CONSENT IS APPROVE-ALL / DENY (#1855, owner ruling, `5e713309e`). Every arm below that used to tick a
// per-capability box now reads the list as the read-only statement it is and presses ONE button. The CT was
// not swept with that landing, which is what board row #2390 was: five tests clicking checkboxes the product
// had deliberately disabled. Each rewritten arm carries its own before/after note rather than a bare new
// assertion, because the claims INVERTED and a reader meeting only the new text would not know a recorded
// ruling (#658's per-row granularity) was superseded rather than forgotten.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { PluginsSurfaceStory, SnippetConsoleStory } from "../_ct-stories.tsx";

const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
/** The `FileTrigger`'s own hidden input — the UPGRADE feeder on an installed row (a different primitive
 *  from the install card's dropzone, so a different slot). */
const FILE_TRIGGER_INPUT = '[data-slot="file-trigger-input"]';
const CHAT = castId<ChatId>("chat_ct_plugin_0001");
/** A re-consent row's accessible name carries the "New" pill after the label, so match by prefix. (A prefix
 *  matcher is right for a row whose identity is the point and wrong for the NAME's own shape — the exact-name
 *  pin near the bottom of this file owns that, and is what caught a run-on these regexes matched happily.) */
const NEW_LORE_CAPABILITY = /^Write world book entries/u;
/** Same prefix-match reason: the spendy capability a partial re-consent deliberately leaves unticked. */
const NEW_TURN_CAPABILITY = /^Ask for a reply on its own/u;
/** The re-consent notice's own escape action — named by the plugin, since a settings pane can hold several. */
const REMOVE_WEATHER_TELLER = /^Remove Weather Teller/u;
const A_PAST_INSTANT = 1_760_000_000_000;
/** The surface reads `sessions.me` to gate the admin-only "Distribute to everyone" section (D147(d)). Every
 *  test here drives PER-USER plugin management, so the viewer is a plain user: `isAdmin` is false, the
 *  distribute contribution resolves out, and the pane renders exactly its own two sections. Fed (not left
 *  inert) so that admin gate runs LIVE under these mounts rather than answering an unstubbed `null`. */
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };
/** The bare-`host` tell the old starter shipped (#683) — a property read off `host` with no owning `.`/word
 *  before it (so `orb.host(1)` itself doesn't false-positive). */
const BARE_HOST_RE = /(?<![.\w])host\./u;
/** The top-level-`await` tell the old starter shipped (#683) — `evalCode` runs script mode, not module mode,
 *  so this shape is a QuickJS PARSE ERROR, not merely bad style. */
const TOP_LEVEL_AWAIT_RE = /^\s*(?:const|let|var)\s+\w+\s*=\s*await\s/mu;
const ORB_HOST_CALL_RE = /orb\.host\(1\)/u;

interface ManifestFixture {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly hostVersion: 1;
  readonly entry: "main.js";
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly netHosts?: readonly string[];
}

/** A REAL bundle: the two entries the funnel admits, zipped with the engine the surface unzips with. */
function bundle(manifest: ManifestFixture): Buffer {
  const zipped = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "main.js": strToU8("export function activate() {}\n"),
  });
  return Buffer.from(zipped);
}

const WEATHER_MANIFEST: ManifestFixture = {
  id: "weather-teller",
  name: "Weather Teller",
  version: "1.0.0",
  hostVersion: 1,
  entry: "main.js",
  description: "Tells the room what the weather is doing.",
  capabilities: ["chat.read", "turn.trigger", "net.fetch"],
  netHosts: ["api.weather.example"],
};

/** The installed row the list read serves — a plain wire literal (the shape is pinned by the router + domain
 *  tests, never re-typed here). `declaredCapabilities` includes `turn.trigger`, which `grantedCapabilities`
 *  does NOT — a paranoid owner's own choice at install, not a system-forced refusal, so `reconsentPending`
 *  stays `false` even though declared ⊄ granted (the distinction the field exists to draw, #650 P1-1). */
const INSTALLED_ROW = {
  id: "plugin_ct0000000000000000001",
  slug: "weather-teller",
  name: "Weather Teller",
  version: "1.0.0",
  status: "disabled",
  origin: "upload",
  sourceUrl: null,
  // A HAND upload of something this build does not ship: nothing can serve it a newer version, so the server
  // names no update source and the row offers no update-check affordance at all (#1740).
  updateSource: null,
  declaredCapabilities: ["chat.read", "turn.trigger", "net.fetch"],
  grantedCapabilities: ["chat.read", "net.fetch"],
  netHosts: ["api.weather.example"],
  reconsentPending: false,
  // The recorded host delta of a pending re-consent (#659). Empty here in lockstep with the flag — the db
  // CHECK makes any other pairing unwritable, so a fixture carrying one on a settled row would be a state
  // the server cannot produce.
  widenedNetHosts: [],
  builtAgainst: null,
  consecutiveCrashes: 0,
  lastError: null,
  installedAt: A_PAST_INSTANT,
  updatedAt: A_PAST_INSTANT,
};

/** A `url`-ORIGIN installed row (U8 2b): fetched from a remembered `sourceUrl`, so the pane offers the auto
 *  update-check + one-click upgrade. Kept deliberately simple (one granted capability, no netHosts) so the
 *  reach-widening assertion below is crisp. `updateSource` is the SERVER's own answer to "who can serve the
 *  next version" (#1740) — the field the row gates its update affordance on, not `origin`. */
const URL_INSTALLED_ROW = {
  ...INSTALLED_ROW,
  id: "plugin_ct0000000000000000010",
  slug: "url-teller",
  name: "URL Teller",
  origin: "url",
  sourceUrl: "https://plugins.example.com/url-teller.zip",
  updateSource: "url",
  declaredCapabilities: ["chat.read"],
  grantedCapabilities: ["chat.read"],
  netHosts: null,
};

/** A SEEDED SHOWCASE row (#1740): it arrived as an `upload` like any hand install and has no remembered URL —
 *  the server is what knows this build ships a bundle under its slug, and says so with
 *  `updateSource: "showcase"`. This is the DIVERGED case (the owner took it over), which is precisely the one
 *  the boot auto-upgrade passes over, so this one-click is the only path a newer bundle has to it. */
const SHOWCASE_ROW = {
  ...INSTALLED_ROW,
  id: "plugin_ct0000000000000000011",
  slug: "oracle-deck",
  name: "Oracle Deck",
  version: "1.1.0",
  origin: "upload",
  sourceUrl: null,
  updateSource: "showcase",
  declaredCapabilities: ["chat.read"],
  grantedCapabilities: ["chat.read"],
  netHosts: null,
};

/** The row the showcase one-click's server verb returns: the SHIPPED version, and nothing widened — so the
 *  outcome is the plain success arm rather than the re-consent wall (the widening half is already pinned on the
 *  url twin, and it is the same `upgrade` verb underneath either way). */
const SHOWCASE_UPGRADED_ROW = { ...SHOWCASE_ROW, version: "1.2.0" };

/** What the one-click upgrade's server verb returns for a REACH-WIDENING update: the NEW version, `disabled`,
 *  `reconsentPending: true`, and a newly-declared capability the prior grant never confirmed — so the SAME
 *  ReConsentNotice the file upgrade drives renders from the refetched row. Origin/sourceUrl carry forward (the
 *  upgrade never changes where it was installed from). */
const URL_WIDENED_ROW = {
  ...URL_INSTALLED_ROW,
  version: "2.0.0",
  declaredCapabilities: ["chat.read", "worldinfo.write"],
  grantedCapabilities: ["chat.read"],
  reconsentPending: true,
  widenedNetHosts: [],
};

/** Drop a bundle into the install card's dropzone through the picker feeder. */
async function pickBundle(page: Page, manifest: ManifestFixture): Promise<void> {
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: `${manifest.id}.zip`, mimeType: "application/zip", buffer: bundle(manifest) });
}

/** A caller-supplied plugin-bundle URL — the client never fetches it; `plugin.previewFromUrl` does, on the
 *  server, through the egress guard. */
const WEATHER_URL = "https://plugins.example/weather-teller.zip";

test("the grant screen names every declared permission, its consequence, and the exact hosts it can reach", async ({ mount, page }) => {
  await routeTrpc(page, { "plugin.list": () => [], "plugin.listSurfaces": () => [], "sessions.me": () => USER_VIEWER });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Nothing installed yet.", { exact: false })).toBeVisible();
  await pickBundle(page, WEATHER_MANIFEST);

  // The bundle's own identity, so a person knows WHAT they are about to trust.
  await expect(page.getByText("Weather Teller 1.0.0")).toBeVisible();
  await expect(page.getByText("Tells the room what the weather is doing.")).toBeVisible();

  // Each declared capability in the person's words, with the consequence spelled out — not the wire spelling.
  await expect(page.getByText("Read this room's messages")).toBeVisible();
  await expect(page.getByText("Sees recent messages and the room's variables", { exact: false })).toBeVisible();
  await expect(page.getByText("Ask for a reply on its own")).toBeVisible();
  await expect(page.getByText("Reach the internet")).toBeVisible();
  // The wire vocabulary never reaches the screen.
  await expect(page.getByText("turn.trigger")).toHaveCount(0);

  // SPEND is marked as a word, never colour alone, and only on the capability that actually spends.
  await expect(page.getByText("Costs money")).toHaveCount(1);

  // `net.fetch` is parameterized by its allowlist, so the HOSTS are the reach and must be legible verbatim.
  await expect(page.getByText("api.weather.example")).toBeVisible();

  // A person is told the outcome before they commit to it.
  await expect(page.getByText("It will be installed turned off.", { exact: false })).toBeVisible();
});

test("the grant screen shows the ui.surface consent line when a plugin declares its own surfaces (#679 U0)", async ({ mount, page }) => {
  // THE U0 DONE-CRITERIA: a plugin declaring `ui.surface` reaches the consent screen with the new line, in the
  // person's own words — the whole point of landing the capability member ahead of its rendering surface (U1).
  await routeTrpc(page, { "plugin.list": () => [], "plugin.listSurfaces": () => [], "sessions.me": () => USER_VIEWER });
  await mount(<PluginsSurfaceStory />);
  await pickBundle(page, {
    id: "panel-plugin",
    name: "Panel Plugin",
    version: "1.0.0",
    hostVersion: 1,
    entry: "main.js",
    description: "Draws its own settings panel.",
    capabilities: ["ui.surface"],
  });

  await expect(page.getByText("Panel Plugin 1.0.0")).toBeVisible();
  // The new line, by its plain-English label and consequence — never the `ui.surface` wire spelling.
  await expect(page.getByText("Show its own panels and controls")).toBeVisible();
  await expect(page.getByText("always inside a box labelled with the plugin's name", { exact: false })).toBeVisible();
  await expect(page.getByText("ui.surface")).toHaveCount(0);
  // Benign band: ui.surface renders only for the installer, house-drawn — it neither spends nor reaches further.
  await expect(page.getByText("Costs money")).toHaveCount(0);
  await expect(page.getByText("Reaches further")).toHaveCount(0);
});

// APPROVE-ALL / DENY, AND THIS ARM USED TO ASSERT THE OPPOSITE (#1855, owner ruling, landed `5e713309e`).
// It was "unchecking a permission installs the NARROWED subset, not what the bundle asked for", and it drove
// a real per-row checkbox. The owner replaced cherry-picking with two choices: approve the whole declared set,
// or cancel — "unchecking capabilities the plugin declares rarely leaves a working plugin, and it taught
// people to tick boxes without reading" (plugin-install-card.tsx's header carries the ruling verbatim).
//
// SO THE CLAIM INVERTED, AND BOTH HALVES ARE PINNED HERE, because a ruling this shape fails in two opposite
// ways: a list that is still editable (the old behaviour surviving the copy change), and an install that
// sends something OTHER than the full ask (a narrowing the person was never offered, which is worse than the
// feature it replaced). The screen is read-only AND the wire carries the whole manifest set.
test("#1855: the consent list is read-only and Install grants the FULL declared set", async ({ mount, page }) => {
  // The list read is STATEFUL so the test can barrier on a SETTLED rendered state — the installed row
  // appearing after the write's own invalidate — rather than on a toast or an in-flight flash.
  let installed = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => (installed ? [{ ...INSTALLED_ROW, grantedCapabilities: WEATHER_MANIFEST.capabilities }] : []),
    "plugin.install": () => {
      installed = true;
      return { ...INSTALLED_ROW, grantedCapabilities: WEATHER_MANIFEST.capabilities };
    },
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);
  await pickBundle(page, WEATHER_MANIFEST);

  // EVERY declared row is shown as already-granted and NOT operable. Asserted through `toBeDisabled` rather
  // than through a click that times out: a timeout proves the click failed, never that the control is
  // deliberately inert, and it costs 15s per row to say so.
  const spendyRow = page.getByRole("checkbox", { name: "Ask for a reply on its own" });
  await expect(spendyRow).toBeChecked();
  await expect(spendyRow).toBeDisabled();
  // …and NOTHING on the consent screen is operable, not merely this one row — the fence is the count, because
  // a per-row assertion passes on a screen where one arm quietly stayed live.
  await expect(page.getByRole("checkbox", { disabled: false })).toHaveCount(0);
  // The editable arm's tell was a pointer cursor over the whole label block; its absence is what says the
  // affordance is gone to the EYE, not just to the DOM (#650 P1-3 is this exact defect one property down).
  await expect(page.getByText("Sees recent messages and the room's variables", { exact: false })).toHaveCSS("cursor", "auto");

  await page.getByRole("button", { name: "Install" }).click();

  // SETTLED: the row is in the list and the confirm step is gone.
  await expect(page.getByRole("switch", { name: "Turn Weather Teller on" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);
  // The WHOLE manifest set, in the manifest's own order — never a subset, and never a set this screen
  // recomputed. A person who did not want all of it had Cancel.
  await expect.poll(async () => (recorder.lastInput("plugin.install") as { grant: string[] } | undefined)?.grant).toEqual([...WEATHER_MANIFEST.capabilities]);
});

test("a bundle that is not a plugin is refused with a reason, before anything is uploaded", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "plugin.list": () => [], "plugin.listSurfaces": () => [], "sessions.me": () => USER_VIEWER });
  await mount(<PluginsSurfaceStory />);

  await page.locator(DROPZONE_INPUT).setInputFiles({
    name: "not-a-plugin.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "readme.txt": strToU8("hello") })),
  });

  await expect(page.getByRole("alert")).toContainText("manifest.json");
  // Nothing was sent: a refusal a person can read costs no round trip.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding `toContainText` settled on the refusal, and the refusal is raised BEFORE any network call by construction (the bundle read is local) — there is no in-flight install to race.
  expect(recorder.count("plugin.install")).toBe(0);
});

test("installing from a URL previews the manifest on the server, shows the SAME consent screen, and installs from the link", async ({ mount, page }) => {
  // U8 seam 15. The client NEVER fetches the bytes — a person pastes a link, `plugin.previewFromUrl` fetches
  // it through the server egress guard and returns the MANIFEST, and the SAME grant screen a file install
  // shows is built from it. The list read is stateful so the barrier is the SETTLED installed row, not a flash.
  let installed = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => (installed ? [INSTALLED_ROW] : []),
    "plugin.previewFromUrl": () => WEATHER_MANIFEST,
    "plugin.installFromUrl": () => {
      installed = true;
      return INSTALLED_ROW;
    },
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await page.getByRole("textbox", { name: "Plugin URL" }).fill(WEATHER_URL);
  await page.getByRole("button", { name: "Fetch" }).click();

  // The ONE shared consent surface — the bundle's identity, each capability in the person's words, and the
  // verbatim host — from a manifest the client never fetched. Never the wire vocabulary.
  await expect(page.getByText("Weather Teller 1.0.0")).toBeVisible();
  await expect(page.getByText("Read this room's messages")).toBeVisible();
  await expect(page.getByText("Ask for a reply on its own")).toBeVisible();
  await expect(page.getByText("Reach the internet")).toBeVisible();
  await expect(page.getByText("api.weather.example")).toBeVisible();
  await expect(page.getByText("turn.trigger")).toHaveCount(0);
  // The preview carried exactly the URL the person pasted.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the consent screen above only renders after previewFromUrl's own response settled, so its recorded input is final.
  expect(recorder.lastInput("plugin.previewFromUrl")).toEqual({ url: WEATHER_URL });

  await page.getByRole("button", { name: "Install" }).click();

  // SETTLED: the row is in the list and the confirm step is gone.
  await expect(page.getByRole("switch", { name: "Turn Weather Teller on" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);
  // The install went through the LINK verb (no bytes uploaded — `plugin.install` was never called), carrying
  // the URL and the full confirmed grant.
  await expect.poll(async () => recorder.lastInput("plugin.installFromUrl")).toEqual({ url: WEATHER_URL, grant: ["chat.read", "turn.trigger", "net.fetch"] });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the installFromUrl lastInput poll + the visible row above prove the URL path SETTLED, so the mutually-exclusive `plugin.install` (byte-upload) count is final at read-time.
  expect(recorder.count("plugin.install")).toBe(0);
});

test("an unreachable or blocked URL shows one leak-free line, and never forwards the server's reason", async ({ mount, page }) => {
  // U8 leak-free requirement: unreachable / refused / not-a-plugin are INDISTINGUISHABLE on the screen, or the
  // surface becomes an SSRF oracle. The server's own error is leak-free-but-detailed (it names the reason
  // band); the client collapses EVERY preview failure to one fixed line and never forwards `error.message`.
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [],
    "plugin.previewFromUrl": () =>
      trpcError({
        code: "BAD_REQUEST",
        message: "could not fetch a plugin bundle from https://plugins.example/x.zip (unreachable, refused, or not a permitted destination)",
      }),
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await page.getByRole("textbox", { name: "Plugin URL" }).fill(WEATHER_URL);
  await page.getByRole("button", { name: "Fetch" }).click();

  // ONE honest line, no oracle.
  await expect(page.getByRole("alert")).toContainText("Couldn't fetch a plugin from that URL");
  // The server's distinguishing tail — the phrase that would separate a block from an unreachable host —
  // NEVER reaches the screen.
  await expect(page.getByText("not a permitted destination")).toHaveCount(0);
  // No consent screen and nothing installed: a failed probe costs no install.
  await expect(page.getByText("What it's asking for")).toHaveCount(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the leak-free alert + the absent consent screen above prove the preview FAILED and settled, so no install could have followed — the `plugin.installFromUrl` count is final at read-time.
  expect(recorder.count("plugin.installFromUrl")).toBe(0);
});

test("an installed plugin says whether it is on and what it is allowed to do", async ({ mount, page }) => {
  // Stateful again, so the toggle's barrier is the SETTLED "On" the invalidate repaints — not the
  // optimistic flash, which exists only while the write is in flight.
  let enabled = false;
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [{ ...INSTALLED_ROW, status: enabled ? "enabled" : "disabled" }],
    "plugin.setEnabled": () => {
      enabled = true;
      return null; // the verb resolves void; the stub answers a JSON-encodable nothing
    },
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Weather Teller")).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  // The granted set is readable WITHOUT turning it on — consent you can re-read is consent you can revisit.
  // The disclosure's accessible name CONTAINS its visible words (WCAG 2.5.3, side-eye 2026-08-29 P3-4) —
  // the old "What Weather Teller is allowed to do" re-ordered them and a voice-control user saying the
  // words on the screen could not match the control.
  await page.getByRole("button", { name: "What it's allowed to do — Weather Teller" }).click();
  await expect(page.getByText("Read this room's messages")).toBeVisible();
  await expect(page.getByText("Reach the internet")).toBeVisible();
  // THE ASKED-VS-ALLOWED PAIR (#650 P1-2): it was granted a SUBSET at install (`turn.trigger` declared, not
  // granted), and the disclosure now says so rather than omitting the row entirely — the fix this row exists
  // to prove. `"Ask for a reply on its own"` is VISIBLE (the label still renders) and its control column
  // reads "Not granted" (P1-3's statement, not a disabled checkbox).
  await expect(page.getByText("Ask for a reply on its own")).toBeVisible();
  await expect(page.getByText("Not granted")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Ask for a reply on its own" })).toHaveCount(0);

  await page.getByRole("switch", { name: "Turn Weather Teller on" }).click();
  // SETTLED: the invalidate repainted the row from the server's new truth.
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the "On" assertion above settled on the post-invalidate repaint, which the stub only serves AFTER `plugin.setEnabled` was called and recorded — the call is provably complete at this read.
  expect(recorder.lastInput("plugin.setEnabled")).toEqual({ pluginId: INSTALLED_ROW.id, enabled: true });
});

test("a same-task repeat admits one enable write, owns only its plugin row, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const siblingRow = { ...INSTALLED_ROW, id: "plugin_ct0000000000000000002", name: "Rain Teller", slug: "rain-teller" };
  const recorder = await routeTrpc(page, {
    "plugin.list": () => [INSTALLED_ROW, siblingRow],
    "plugin.setEnabled": held,
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  const first = page.getByRole("switch", { name: "Turn Weather Teller on" });
  const sibling = page.getByRole("switch", { name: "Turn Rain Teller on" });
  await first.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await held.requested;

  // THE PENDING SWITCH IS NAMED "off", NOT "on". `useSetPluginEnabled` carries an OPTIMISTIC update that
  // flips the cached row's `status` the moment the write starts, and the switch's aria-label follows STATE
  // (a4b008957) — so while the held mutation is in flight this control announces the act it now offers.
  // The commit that made the label state-derived did not sweep this assertion, which had pinned the old
  // static name; re-anchored here rather than weakened, because the rename IS the correct behaviour.
  const firstPending = page.getByRole("switch", { name: "Turn Weather Teller off" });
  await expect(firstPending).toBeDisabled();
  await expect(sibling).toBeEnabled();
  await expect.poll(() => recorder.count("plugin.setEnabled")).toBe(1);

  held.release(trpcError());
  await expect(first).toBeEnabled();
  await first.click();
  await expect.poll(() => recorder.count("plugin.setEnabled")).toBe(2);
});

test("an upgrade that WIDENS reach says exactly what widened, and Allow closes the loop for real", async ({ mount, page }) => {
  // The server's verdict for a reach-widening upgrade: the row lands `disabled` at the NEW version with
  // `reconsentPending: true`, and the grant is `normalizeGrant(newDeclared, priorGranted)` — the
  // INTERSECTION, so the newly-declared capability is NOT in it. `declaredCapabilities`/`netHosts` carry the
  // full new ask, `widenedNetHosts` carries the recorded host delta; the re-consent notice is DERIVED from
  // these fields (plugin-row.tsx), not from a local snapshot the upgrade response handed the row — so the
  // list read alone is what drives the notice.
  let upgraded = false;
  let allowed = false;
  const upgradedRow = {
    ...INSTALLED_ROW,
    version: "2.0.0",
    status: "disabled",
    declaredCapabilities: ["chat.read", "net.fetch", "worldinfo.write"],
    grantedCapabilities: ["chat.read", "net.fetch"],
    netHosts: ["api.weather.example", "collector.elsewhere.example"],
    reconsentPending: true,
    // ONE of the two hosts is new. `api.weather.example` came forward from v1 unchanged and is deliberately
    // NOT in here — that asymmetry inside a single fixture is what makes the badge assertions below mean
    // something rather than just counting.
    widenedNetHosts: ["collector.elsewhere.example"],
  };
  // `setGrant` grants the WHOLE declared set and clears BOTH halves of the recorded refusal — the server's
  // own settled truth after the confirm, never faked client-side.
  const allowedRow = { ...upgradedRow, grantedCapabilities: upgradedRow.declaredCapabilities, reconsentPending: false, widenedNetHosts: [] };
  const recorder = await routeTrpc(page, {
    "plugin.list": () => {
      if (!upgraded) {
        return [INSTALLED_ROW];
      }
      return [allowed ? allowedRow : upgradedRow];
    },
    "plugin.upgrade": () => {
      upgraded = true;
      return upgradedRow;
    },
    "plugin.setGrant": () => {
      allowed = true;
      return allowedRow;
    },
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  // v2 asks for a capability the owner never confirmed AND adds a second egress host.
  await page.locator(FILE_TRIGGER_INPUT).setInputFiles({
    name: "weather-teller-2.zip",
    mimeType: "application/zip",
    buffer: bundle({
      ...WEATHER_MANIFEST,
      version: "2.0.0",
      capabilities: ["chat.read", "net.fetch", "worldinfo.write"],
      netHosts: ["api.weather.example", "collector.elsewhere.example"],
    }),
  });

  const notice = page.getByRole("alert").filter({ hasText: "stayed off" });
  await expect(notice).toBeVisible();
  // THE NOTICE IS A LEADING ACCENT RULE, NOT A BORDERED BOX, AND CARRIES NO FILL (side-eye 2026-08-29
  // residual P3 + the badge-AA guarantee). A full `/40` warning border nested a second box inside the
  // plugin Card's own border (box-in-box, cheap at ~390px); a `bg-warning/10` fill composited the badge
  // pills' translucent tints under AA ("New" 4.44:1, "Reaches further" 4.19:1). So the boundary is a
  // 2px solid left rule with a transparent ground — a regression to either a full box or a tinted fill
  // fails HERE, not just to the eye.
  await expect(notice).toHaveCSS("border-left-width", "2px");
  await expect(notice).toHaveCSS("border-top-width", "0px");
  await expect(notice).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // The row-level status also stops reading as a plain "Off" (P1-1) — the same durable flag that raised
  // the notice is what this badge reads, so the two can never disagree.
  await expect(page.getByText("Off — asked for more than you allowed")).toBeVisible();
  // WHAT widened — the new capability by its own name and consequence, not a bare count…
  await expect(notice).toContainText("Write world book entries");
  await expect(notice).toContainText("world books already attached to the room");
  // …and the host count too, which used to be un-nameable: the server compares against the PRIOR manifest,
  // and nothing persisted it until `widenedNetHosts` (#659). "It can now also reach one new host" is the
  // decision a person can make; "re-read these hostnames" is not.
  await expect(notice).toContainText("adds a new host it can reach");

  // THE ROWS ARE READ-ONLY, AND THIS ARM USED TO ASSERT THE OPPOSITE (#1855, `5e713309e`). Three shapes have
  // stood here: a DISABLED checkbox beside a sentence saying the plugin wanted exactly that permission (#650
  // P1-3 — a control that looked live and silently did nothing); then a REALLY interactive row (#658), the
  // same editable arm install used; and now approve-all/deny, by owner ruling, on BOTH surfaces at once.
  //
  // P1-3's finding is NOT re-opened by that, and this is the assertion that proves it rather than asserting
  // it: an ungranted row no longer renders a checkbox AT ALL. It renders the "Not granted" word-mark beside
  // the name it refuses, which is the one shape P1-3 said was honest — the defect was specifically an empty
  // box that looked tickable, not a statement.
  await expect(notice.getByRole("checkbox", { name: NEW_LORE_CAPABILITY })).toHaveCount(0);
  await expect(notice.getByText("Not granted")).toHaveCount(1);
  // The rows already granted keep their checkbox ("you already have this" is a true state), and every one of
  // them is inert — the count is the fence, so a surviving live arm anywhere in the notice reds here.
  await expect(notice.getByRole("checkbox", { name: "Read this room's messages" })).toBeChecked();
  await expect(notice.getByRole("checkbox", { name: "Reach the internet" })).toBeChecked();
  await expect(notice.getByRole("checkbox", { disabled: false })).toHaveCount(0);

  // Both destinations verbatim: the host list IS the reach for net.fetch, and consent is to the SET…
  await expect(notice).toContainText("collector.elsewhere.example");
  await expect(notice).toContainText("api.weather.example");
  // …and EXACTLY the one the server recorded as new wears the mark. This assertion replaces the older fence
  // ("no host is ever badged"), and it is deliberately written from BOTH sides, because the defect the old
  // fence caught was a revision that badged EVERY host including the one carried forward unchanged from v1.
  // A count alone would pass that bug the moment a second badge appeared anywhere, so the marks are read
  // per LIST ITEM instead.
  const newHost = notice.getByRole("listitem").filter({ hasText: "collector.elsewhere.example" });
  const carriedHost = notice.getByRole("listitem").filter({ hasText: "api.weather.example" });
  await expect(newHost.getByText("New", { exact: true })).toHaveCount(1);
  await expect(carriedHost.getByText("New", { exact: true })).toHaveCount(0);
  // RENDERED, not merely present. The badge sits after a raw hostname — the widest, least-breakable string
  // on this surface — inside the settings pane's REAL 560px column, so a mark that existed in the DOM and
  // fell off the right edge would read to a person as "no host is new". Measured against the notice's own
  // box rather than a hardcoded px.
  const badge = newHost.getByText("New", { exact: true });
  await expect(badge).toBeVisible();
  const badgeBox = await badge.boundingBox();
  const noticeBox = await notice.boundingBox();
  expect(badgeBox === null || noticeBox === null).toBe(false);
  expect((badgeBox?.x ?? 0) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual((noticeBox?.x ?? 0) + (noticeBox?.width ?? 0));

  // THE ESCAPE ACTION LIVES INSIDE THE NOTICE (P1-3): a reachable control right here, not three UI regions
  // away behind the row's unrelated ⋯ menu, and it is now a REAL path (P1-1), not a dead end.
  await expect(notice.getByRole("button", { name: REMOVE_WEATHER_TELLER })).toBeVisible();

  // The owner approves the whole ask. ONE act — the per-row tick this test used to perform is gone, and the
  // button's own words are what changed with it ("Allow selected" → "Approve all"), so a revision that kept
  // the old label beside the new behaviour reds here rather than reading as a working screen.
  await notice.getByRole("button", { name: "Approve all" }).click();

  // SETTLED: barrier on the notice clearing (the server's own post-grant truth) BEFORE reading the recorder
  // — the mutation is provably complete only once the invalidate has repainted the row.
  await expect(notice).toHaveCount(0);
  await expect(page.getByText("Off — asked for more than you allowed")).toHaveCount(0);
  // The ANTI-TOCTOU ECHO: the server refuses a `setGrant` whose `acknowledgedNetHosts` doesn't match its
  // own manifest, so the client MUST send exactly the host list it RENDERED (`plugin.netHosts`) — not an
  // empty array, not a client-computed guess. Both hosts are echoed, including the one carried forward from
  // v1 — the echo is about what was RENDERED, which is why it survived the #1855 rewrite unchanged.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settle assertions above prove the call completed before this read.
  expect(recorder.lastInput("plugin.setGrant")).toEqual({
    pluginId: INSTALLED_ROW.id,
    grant: upgradedRow.declaredCapabilities,
    acknowledgedNetHosts: upgradedRow.netHosts,
  });
});

// A MULTI-CAPABILITY ASK, AND THE CLIENT'S PARTIAL PATH IS GONE (#1855, `5e713309e`).
//
// THIS ARM USED TO BE "a PARTIAL re-consent records exactly the narrower subset, and the notice keeps saying
// so" — #658's granularity, driven end to end: tick ONE of the two newly-declared capabilities, and watch the
// headline drop from two outstanding to one while the notice stayed up. The owner removed the client half of
// that. The SERVER is untouched and still takes an arbitrary subset (`setGrant` still computes
// `pendingReconsent` honestly for a partial one), so nothing below claims the server lost the capability —
// what is pinned is that this SCREEN no longer offers it.
//
// IT IS A DIFFERENT CLAIM FROM THE SINGLE-OUTSTANDING ARM ABOVE, which is why it survives as its own test
// rather than collapsing into it: the plural COUNT grammar ("2 permissions"), a notice carrying TWO "Not
// granted" statements at once, and — the fence that matters — one "Approve all" recording the WHOLE declared
// set rather than "prior grant plus whatever was ticked". The old code path would have produced the latter,
// and against a two-capability ask the two answers actually differ.
test("#1855: a two-capability re-consent counts both, offers no partial path, and Approve all grants the whole ask", async ({ mount, page }) => {
  let upgraded = false;
  let partiallyAllowed = false;
  const upgradedRow = {
    ...INSTALLED_ROW,
    version: "2.0.0",
    status: "disabled",
    declaredCapabilities: ["chat.read", "turn.trigger", "net.fetch", "worldinfo.write"],
    grantedCapabilities: ["chat.read", "net.fetch"],
    netHosts: ["api.weather.example", "collector.elsewhere.example"],
    reconsentPending: true,
    widenedNetHosts: ["collector.elsewhere.example"],
  };
  // The server's settled row after the approve: the whole ask is granted and BOTH halves of the recorded
  // refusal clear. Named `allowedRow` for what it is — the partial arm this fixture used to model has no
  // client path left to reach it.
  const allowedRow = {
    ...upgradedRow,
    grantedCapabilities: upgradedRow.declaredCapabilities,
    reconsentPending: false,
    widenedNetHosts: [],
  };
  const recorder = await routeTrpc(page, {
    "plugin.list": () => {
      if (!upgraded) {
        return [INSTALLED_ROW];
      }
      return [partiallyAllowed ? allowedRow : upgradedRow];
    },
    "plugin.upgrade": () => {
      upgraded = true;
      return upgradedRow;
    },
    "plugin.setGrant": () => {
      partiallyAllowed = true;
      return allowedRow;
    },
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await page.locator(FILE_TRIGGER_INPUT).setInputFiles({
    name: "weather-teller-2.zip",
    mimeType: "application/zip",
    buffer: bundle({
      ...WEATHER_MANIFEST,
      version: "2.0.0",
      capabilities: ["chat.read", "turn.trigger", "net.fetch", "worldinfo.write"],
      netHosts: ["api.weather.example", "collector.elsewhere.example"],
    }),
  });

  const notice = page.getByRole("alert").filter({ hasText: "stayed off" });
  // TWO capabilities are outstanding, and the headline counts them in the PLURAL grammar — the singular
  // sentence is what the one-outstanding arm above reads, so this is the branch that pin does not cover.
  await expect(notice).toContainText("asks for 2 permissions you hadn't allowed and adds a new host it can reach");
  // BOTH outstanding rows render as statements, and NEITHER is a control: the count is the fence, because a
  // per-name assertion would pass on a notice where the other row stayed live.
  await expect(notice.getByText("Not granted")).toHaveCount(2);
  await expect(notice.getByRole("checkbox", { name: NEW_LORE_CAPABILITY })).toHaveCount(0);
  await expect(notice.getByRole("checkbox", { name: NEW_TURN_CAPABILITY })).toHaveCount(0);
  await expect(notice.getByRole("checkbox", { disabled: false })).toHaveCount(0);
  // …and there is no second door beside "Approve all" and "Remove" — a surviving "Allow selected" would be
  // the old partial path still reachable behind new copy.
  await expect(notice.getByRole("button", { name: "Allow selected" })).toHaveCount(0);

  await notice.getByRole("button", { name: "Approve all" }).click();

  // SETTLED: barrier on the notice clearing (the server's own post-grant truth) BEFORE reading the recorder,
  // so the mutation is provably complete. The headline sentence is derived from the SERVER's
  // `grantedCapabilities`, never from a local draft — there is no draft left to pass on.
  await expect(notice).toHaveCount(0);
  await expect(page.getByText("Off — asked for more than you allowed")).toHaveCount(0);

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settle assertions above prove the call completed before this read. THE WHOLE DECLARED SET, all four — against a TWO-capability ask this is what separates approve-all from the retired "prior grant plus what was ticked", which would have recorded three. The host echo is about what was RENDERED, so both hosts ride regardless.
  expect(recorder.lastInput("plugin.setGrant")).toEqual({
    pluginId: INSTALLED_ROW.id,
    grant: upgradedRow.declaredCapabilities,
    acknowledgedNetHosts: upgradedRow.netHosts,
  });
});

test("url plugin one-click update; a widening one lands disabled pending re-consent (U8 2b)", async ({ mount, page }) => {
  // The one-click path: "Check for updates" runs the server batch check; a newer version surfaces "Update to X";
  // clicking it re-fetches the REMEMBERED source (the input names NO url) through the SAME upgrade verb the file
  // path uses — so a reach-widening update lands the row `disabled` and the SAME ReConsentNotice renders. Never
  // silent. The list is stateful so the barrier is the SETTLED widened row, not an in-flight flash.
  let upgraded = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [upgraded ? URL_WIDENED_ROW : URL_INSTALLED_ROW],
    "plugin.checkForUpdates": () => [{ pluginId: URL_INSTALLED_ROW.id, status: "update-available", newVersion: "2.0.0" }],
    "plugin.upgradeFromStoredUrl": () => {
      upgraded = true;
      return URL_WIDENED_ROW;
    },
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("URL Teller")).toBeVisible();
  await page.getByRole("button", { name: "Check URL Teller for updates" }).click();

  // SETTLED: the one-click affordance appears only once the check's response has rendered, and it NAMES the
  // target version — the act is legible before the click.
  const updateButton = page.getByRole("button", { name: "Update URL Teller to 2.0.0" });
  await expect(updateButton).toBeVisible();

  await updateButton.click();

  // SETTLED: the re-consent notice (the SAME consent surface the file upgrade drives) appears from the refetched
  // widened row — the update did NOT silently apply.
  const notice = page.getByRole("alert").filter({ hasText: "stayed off" });
  await expect(notice).toBeVisible();
  await expect(page.getByText("Off — asked for more than you allowed")).toBeVisible();
  // What widened — the new capability by its own plain-English name (never the wire spelling).
  await expect(notice).toContainText("Write world book entries");

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the notice settle above proves the mutation completed; the one-click input names ONLY the pluginId (no url) because the server re-fetches the remembered `sourceUrl` (the whole point of 2b).
  expect(recorder.lastInput("plugin.upgradeFromStoredUrl")).toEqual({ pluginId: URL_INSTALLED_ROW.id });
});

test("a DIVERGED seeded showcase plugin offers the same one-click, served by the bundled copy (#1740)", async ({ mount, page }) => {
  // THE ROW #1740 EXISTS FOR: an upload-origin seeded example with NO remembered URL, which the boot
  // auto-upgrade deliberately leaves alone because its owner took it over. The affordance is the SAME
  // UpdateCheckRow the url install gets — one row, two sources — and the source the server named on the row is
  // what decides which verb the click fires. The list is stateful so the barrier is the SETTLED upgraded row.
  let upgraded = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => [upgraded ? SHOWCASE_UPGRADED_ROW : SHOWCASE_ROW],
    "plugin.checkForUpdates": () => [{ pluginId: SHOWCASE_ROW.id, status: "update-available", newVersion: "1.2.0" }],
    "plugin.upgradeFromShowcase": () => {
      upgraded = true;
      return SHOWCASE_UPGRADED_ROW;
    },
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Oracle Deck")).toBeVisible();
  await page.getByRole("button", { name: "Check Oracle Deck for updates" }).click();

  // SETTLED: the one-click appears only once the check's verdict has rendered, and NAMES the shipped version.
  const updateButton = page.getByRole("button", { name: "Update Oracle Deck to 1.2.0" });
  await expect(updateButton).toBeVisible();

  await updateButton.click();

  // SETTLED on the REFETCHED row: the pane reports the version that actually landed, which is the durable
  // truth (the transient verdict is dropped) — the whole point of reading the server's own row back.
  await expect(page.getByText("Version 1.2.0", { exact: false })).toBeVisible();

  // The SOURCE is the assertion — a showcase row must drive `upgradeFromShowcase` (which packs the shipped
  // bundle) and must never reach the stored-url verb, which would throw `PluginNoSourceUrlError` on a row
  // that has no remembered source. Polled: the recorder is written by the mutation's own microtask.
  await expect.poll(() => recorder.lastInput("plugin.upgradeFromShowcase")).toEqual({ pluginId: SHOWCASE_ROW.id });
  await expect.poll(() => recorder.count("plugin.upgradeFromStoredUrl")).toBe(0);
});

test("an up-to-date url plugin says so; a file plugin offers no update check (U8 2b)", async ({ mount, page }) => {
  await routeTrpc(page, {
    // A url plugin (checkable) beside a file plugin (INSTALLED_ROW, origin "upload" — no remembered source).
    "plugin.list": () => [URL_INSTALLED_ROW, INSTALLED_ROW],
    "plugin.checkForUpdates": () => [{ pluginId: URL_INSTALLED_ROW.id, status: "up-to-date" }],
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  // The FILE install has no source to re-fetch, so it exposes NO update-check affordance at all.
  await expect(page.getByRole("button", { name: "Check Weather Teller for updates" })).toHaveCount(0);

  // The URL install offers it; checking reports up-to-date in the person's own words.
  await page.getByRole("button", { name: "Check URL Teller for updates" }).click();
  await expect(page.getByText("Up to date", { exact: false })).toBeVisible();
});

// ── The 2026-08-29 rework pins: header reflow, tap floors, the inert-on hint ───────────────────────────────

/** A row mid re-consent — the LONG status badge ("Off — asked for more than you allowed") and the notice.
 *  Shape mirrors the widened-upgrade fixture: declared ⊋ granted, `reconsentPending: true`. */
const PENDING_ROW = {
  ...INSTALLED_ROW,
  version: "2.0.0",
  declaredCapabilities: ["chat.read", "net.fetch", "worldinfo.write"],
  grantedCapabilities: ["chat.read", "net.fetch"],
  reconsentPending: true,
};

/** Two boxes overlap iff both axes overlap — the header-collision read (side-eye 2026-08-29 P2-1). */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("at a phone-width pane the LONG status badge never collides with the row's controls (P2-1)", async ({ mount, page }) => {
  // The measured defect: at ~390px the whitespace-nowrap badge overflowed the min-w-0 identity column and
  // painted UNDER the shrink-0 toggle + Update cluster (the switch knob sat on top of "…more than…"). The
  // fix is a wrap-capable name row + the header stacking its controls below the identity at @max-md — so
  // the pin is geometric: the badge's box is disjoint from the toggle's AND the Update button's, and it
  // stays inside the pane.
  await routeTrpc(page, { "plugin.list": () => [PENDING_ROW], "plugin.getLog": () => [], "plugin.listSurfaces": () => [], "sessions.me": () => USER_VIEWER });
  await mount(<PluginsSurfaceStory width={390} />);

  const badge = page.getByText("Off — asked for more than you allowed");
  await expect(badge).toBeVisible();
  // ONE polled composite read (the mount animation settles under the poll; three separate one-shot reads
  // would each sample mid-transition): badge ∩ switch, badge ∩ update, and the badge's right edge vs the
  // 390px pane — the overflow that made the collision possible in the first place.
  await expect
    .poll(
      async () => {
        const badgeBox = await badge.boundingBox();
        const switchBox = await page.getByRole("switch", { name: "Turn Weather Teller on" }).boundingBox();
        const updateBox = await page.getByRole("button", { name: "Update Weather Teller from a bundle" }).boundingBox();
        if (badgeBox === null || switchBox === null || updateBox === null) {
          return "a box was null";
        }
        return {
          badgeHitsSwitch: overlaps(badgeBox, switchBox),
          badgeHitsUpdate: overlaps(badgeBox, updateBox),
          badgeInsidePane: badgeBox.x + badgeBox.width <= 390,
        };
      },
      { intervals: [50, 100, 200, 400] },
    )
    .toEqual({ badgeHitsSwitch: false, badgeHitsUpdate: false, badgeInsidePane: true });
});

test("a plugin switched ON with nothing granted says so on its status badge (owner observation, 2026-08-29)", async ({ mount, page }) => {
  // Enabled-but-inert: every capability "Not granted" means the plugin runs and can reach nothing — the
  // least-privilege posture working as designed, but "I turned it on and nothing happened" needed an answer
  // on the row itself.
  const inertRow = { ...INSTALLED_ROW, status: "enabled", declaredCapabilities: ["chat.read"], grantedCapabilities: [], netHosts: null };
  await routeTrpc(page, { "plugin.list": () => [inertRow], "plugin.getLog": () => [], "plugin.listSurfaces": () => [], "sessions.me": () => USER_VIEWER });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("On — nothing granted yet")).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toHaveCount(0);
});

// The two disclosures are the only doors to "what can this plugin do" and "what has it done" — measured
// 746×16 with `::after` resolving `content: none` (side-eye 2026-08-29 P2-3), below WCAG 2.5.8's 24px on
// ANY pointer. `size="control"` pins the pointer-conditional `--spacing-control-sm` floor; this is the
// coarse (44px) arm, the automation rule-row's own pin shape.
test.describe("coarse pointer — the disclosure triggers meet the touch floor (P2-3)", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  test("both plugin-row disclosures are reachable with a finger", async ({ mount, page }) => {
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, {
      "plugin.list": () => [INSTALLED_ROW],
      "plugin.getLog": () => [],
      "plugin.listSurfaces": () => [],
      "sessions.me": () => USER_VIEWER,
    });
    await mount(<PluginsSurfaceStory width={390} />);

    const floor = await touchFloorPx(page);
    expect(floor).toBeGreaterThanOrEqual(44);
    const allowed = page.getByRole("button", { name: "What it's allowed to do — Weather Teller" });
    await expect(allowed).toBeVisible();
    // The box IS the target (`size="control"` is a real min-height, not an overflowing pseudo) — the same
    // measured-choice note as the automation pin this mirrors.
    await expect.poll(async () => (await allowed.boundingBox())?.height, { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
    const activity = page.getByRole("button", { name: "Recent activity for Weather Teller" });
    await expect.poll(async () => (await activity.boundingBox())?.height, { intervals: [20, 50, 100, 200] }).toBeGreaterThanOrEqual(floor);
  });
});

// THE CONSENT ROW'S CONTROL SITS BESIDE ITS OWN WORDS (side-eye 2026-08-29 P2-2, the half that survives).
// The prior `Field orientation="horizontal"` shape docked the checkbox in the fixed control column at the
// row's FAR edge, so the box reporting on a capability that grants net access / model spend / message rewrite
// sat ~400px of dead gap away from the words describing it, at the 560-746px pane. The fix is a
// checkbox-LEADING row (plugin-grant-list.tsx), and that geometry is what this pins.
//
// THE OTHER HALF OF P2-2 IS RETIRED WITH ITS ARM, and this test used to be named for it: "clicking a
// capability's CONSEQUENCE text toggles its grant". That finding was about a HIT TARGET — only an 18×18
// square was clickable, so the fix wrapped the name, pills and consequence in a bare `<label htmlFor>`. #1855
// (`5e713309e`, owner ruling) made the list read-only on every surface, so there is nothing to toggle and no
// target to widen; the label wrapper went with it. A test that kept clicking the sentence would be asserting
// an affordance the owner deliberately removed.
//
// What replaces it here is the fence that the removal was CLEAN: no wrapping label survives to advertise a
// target that does nothing, and the words carry no pointer cursor — the rendered tell #650 P1-3 is about.
test("a consent row's box leads its own words, and the words advertise no target (P2-2)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [],
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);
  await pickBundle(page, WEATHER_MANIFEST);

  // The install screen shows the full ask as granted, so every row here carries its (inert) box.
  const readBox = page.getByRole("checkbox", { name: "Read this room's messages" });
  await expect(readBox).toBeChecked();

  // ADJACENCY, on the settled screen: the control LEADS its words. The old shape put it right of them, a
  // `justify-between` pane width away — so "is the box left of its label, within one row gap" is exactly the
  // geometry that moved.
  const boxRect = await readBox.boundingBox();
  const wordsRect = await page.getByText("Read this room's messages", { exact: true }).boundingBox();
  expect(boxRect === null || wordsRect === null).toBe(false);
  expect(boxRect?.x ?? 0).toBeLessThan(wordsRect?.x ?? 0);
  expect((wordsRect?.x ?? 0) - ((boxRect?.x ?? 0) + (boxRect?.width ?? 0))).toBeLessThanOrEqual(24);

  // NO LABEL WRAPS THE TEXT any more. Asserted through the accessibility tree rather than through the DOM
  // tag: a `<label htmlFor>` over a live control is what Playwright reports as a clickable label, and its
  // absence is the structural half of "the words are a statement, not a control".
  const consequence = page.getByText("Sees recent messages and the room's variables", { exact: false });
  await expect(consequence).toBeVisible();
  await expect.poll(async () => await consequence.evaluate((el: Element) => el.closest("label") !== null)).toBe(false);
  // …and the RENDERED half: a pointer cursor over a statement promises a click that cannot happen. This is
  // the exact property #650 P1-3 measured on the old disabled-checkbox shape, read one level out.
  await expect(consequence).toHaveCSS("cursor", "auto");
});

// THE GRANT CHECKBOX'S ACCESSIBLE NAME IS EXACT (side-eye 2026-08-29 P3-5, and its first fix's correction).
// Composed from the label element, the badge pills concatenated into the name and a screen reader read
// "Write lorebook entries (new in this update)NewReaches further" on every changed row. The first fix moved
// the name to `aria-label`, which Base UI's own generated `aria-labelledby` silently outranks — so the run-on
// survived and GREW to swallow the consequence sentence as well. The name is now an explicit
// `aria-labelledby` naming exactly the label node and, on a re-consent row, the "New" pill.
//
// `exact` IS THE PIN. Every other name assertion in this file is a prefix regex or a substring, and all of
// them match the run-on — which is precisely why the first fix shipped broken behind a green suite. This
// asserts what a screen reader actually says, so the consequence appearing in the NAME is a failure here.
//
// The VISIBLE half of the same finding: "(new in this update)" is gone from the rendered label, because the
// "New" badge 8px away said the identical thing twice.
//
// #1855 NARROWED WHAT THIS CAN ASK, AND THE NARROWING IS STATED RATHER THAN QUIETLY DROPPED. The ruling made
// the grant list read-only, and an UNGRANTED row now renders a "Not granted" statement instead of a checkbox
// (plugin-grant-list.tsx's header) — so the row that carried BOTH pills, the strictest name case this test
// was written for, has no accessible name left to be wrong about. The run-on defect can only exist where a
// name exists, so the exact-name claim moves to a GRANTED row (which still renders its box) and the changed
// row is pinned by the three things it renders instead. The one claim genuinely lost: the "New" mark no
// longer rides a NAME on that row. That is the owner's call, recorded here so a reader does not read the
// smaller assertion as drift.
test("a re-consent row's checkbox name is exactly its label, with no badge run-on (P3-5)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [PENDING_ROW],
    "plugin.getLog": () => [],
    "plugin.listSurfaces": () => [],
    "sessions.me": () => USER_VIEWER,
  });
  await mount(<PluginsSurfaceStory />);

  const notice = page.getByRole("alert").filter({ hasText: "stayed off" });
  await expect(notice).toBeVisible();
  // A GRANTED row is the case this pin still owns: it renders a checkbox, so it HAS a computed name, and that
  // name must be exactly the label — not the label plus its two pills plus the consequence.
  await expect(notice.getByRole("checkbox", { name: "Read this room's messages", exact: true })).toHaveCount(1);
  // THE NEWLY-ASKED ROW IS NO LONGER A CHECKBOX (#1855, `5e713309e`): it is a "Not granted" statement, so it
  // computes no accessible name at all and the "New" mark is plain adjacent text rather than part of one.
  // This arm used to assert `name: "Write world book entries New"` on a live control; the run-on defect it
  // pins (a name swallowing the badge text and the consequence) can only exist where a name exists, so the
  // claim moves to the row that still has one and the changed row is pinned by what it now renders.
  await expect(notice.getByRole("checkbox", { name: NEW_LORE_CAPABILITY })).toHaveCount(0);
  await expect(notice.getByText("Write world book entries", { exact: true })).toHaveCount(1);
  await expect(notice.getByText("Not granted", { exact: true })).toHaveCount(1);
  // Both pills are still on the screen and still in the a11y tree as plain text; they are simply not a NAME.
  await expect(notice.getByText("New", { exact: true })).toHaveCount(1);
  // `net.fetch` wears the same mark, so this counts 2 — the claim is that the pill still RENDERS, not that
  // this row is the only risky one.
  await expect(notice.getByText("Reaches further", { exact: true }).first()).toBeVisible();
  // The visible label never repeats what the badge beside it already says.
  await expect(notice.getByText("(new in this update)", { exact: false })).toHaveCount(0);
});

test("the snippet console shows what a run logged, and shows a contained failure instead of hanging", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    "plugin.runSnippet": () => ({ logLines: ["3 messages"], error: "TypeError: host.nope is not a function" }),
  });
  await mount(<SnippetConsoleStory chatId={CHAT} />);

  await expect(page.getByText("write room variables only if you host the room", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();

  const output = page.getByRole("status", { name: "Snippet output" });
  await expect(output).toContainText("3 messages");
  // The contained `error` is DATA, not a throw — a REPL that swallowed it would look like a hang.
  await expect(output).toContainText("TypeError: host.nope is not a function");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the output region above settled on this run's OWN response, so the call it counts has already returned; nothing else in the story can call the proc.
  expect(recorder.count("plugin.runSnippet")).toBe(1);
});

test("a fresh console's shipped starter is code that can actually run — no top-level await, no bare `host`", async ({ mount, page }) => {
  // #683: the old starter used top-level `await` (a QuickJS PARSE ERROR — evalCode runs script mode, not
  // module mode) and called bare `host` (undefined — the realm entry is `orb.host(1)`, realm.ts). This pins
  // the SENT source is real, runnable code by construction: the textarea is untouched, Run is clicked, and
  // the responder proves the exact source that would reach the sandbox on a fresh console's FIRST press.
  const recorder = await routeTrpc(page, {
    "plugin.runSnippet": () => ({ logLines: ["5 messages"] }),
  });
  await mount(<SnippetConsoleStory chatId={CHAT} />);
  const snippet = page.getByLabel("Snippet code");
  await expect(snippet).toHaveValue(ORB_HOST_CALL_RE);
  await expect(snippet).not.toHaveValue(BARE_HOST_RE);
  await expect(snippet).not.toHaveValue(TOP_LEVEL_AWAIT_RE);
  const starter = await snippet.inputValue();

  await page.getByRole("button", { name: "Run" }).click();

  // SETTLED: the log line the stub returned for exactly the starter's own source proves the first Run is a
  // real run, not the parse-error path this issue exists to catch.
  const output = page.getByRole("status", { name: "Snippet output" });
  await expect(output).toContainText("5 messages");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the toContainText barrier above only passes once the stubbed runSnippet response has RENDERED, so the recorder's last input is settled — no later call can race this read.
  expect(recorder.lastInput("plugin.runSnippet")).toEqual({ chatId: CHAT, code: starter });
});

test("a parse failure says it never ran, with the line — never the empty-log lie", async ({ mount, page }) => {
  // #683 part 2: before `errorKind` existed, an empty `logLines` + a set `error` rendered BOTH "It ran and
  // logged nothing." and the raw engine message — a caption that is a lie for a snippet that never started
  // executing. This drives the deliberately-broken-snippet arm and pins the copy no longer says that.
  await routeTrpc(page, {
    "plugin.runSnippet": () => ({ logLines: [], error: "expecting ';'", errorKind: "parse", errorLine: 1 }),
  });
  await mount(<SnippetConsoleStory chatId={CHAT} />);

  await page.getByLabel("Snippet code").fill("const x = ;");
  await page.getByRole("button", { name: "Run" }).click();

  const output = page.getByRole("status", { name: "Snippet output" });
  await expect(output).toContainText("Didn't run — syntax error at line 1: expecting ';'");
  await expect(output.getByText("It ran and logged nothing.")).toHaveCount(0);
});
