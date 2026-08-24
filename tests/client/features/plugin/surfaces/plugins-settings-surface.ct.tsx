// CT: the C7 plugin CLIENT surface (plugins-settings-surface · plugin-install-card · plugin-grant-list ·
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
// THE WIDENED-REACH RE-CONSENT CASE is the last test and the one that most needs a rendered receipt. The
// server lands a reach-widening upgrade `disabled` (`domain/plugin/verbs/upgrade.ts`), and this asserts the
// row SAYS WHAT WIDENED — the new capability by name and consequence, the new host verbatim — plus the true
// consequence: the extra permissions are NOT granted, because there is no re-grant verb (`setEnabled` takes
// `{pluginId, enabled}` and activates with the stored grant). "It stayed off" alone is not legibility.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PluginsSurfaceStory, SnippetConsoleStory } from "../_ct-stories.tsx";

const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
/** The `FileTrigger`'s own hidden input — the UPGRADE feeder on an installed row (a different primitive
 *  from the install card's dropzone, so a different slot). */
const FILE_TRIGGER_INPUT = '[data-slot="file-trigger-input"]';
const CHAT = castId<ChatId>("chat_ct_plugin_0001");
/** The re-consent row's accessible name carries "(new in this update)" after the label, so match by prefix. */
const NEW_LORE_CAPABILITY = /^Write lorebook entries/u;
const A_PAST_INSTANT = 1_760_000_000_000;

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
 *  tests, never re-typed here). */
const INSTALLED_ROW = {
  id: "plugin_ct0000000000000000001",
  slug: "weather-teller",
  name: "Weather Teller",
  version: "1.0.0",
  status: "disabled",
  origin: "upload",
  grantedCapabilities: ["chat.read", "net.fetch"],
  builtAgainst: null,
  consecutiveCrashes: 0,
  lastError: null,
  installedAt: A_PAST_INSTANT,
  updatedAt: A_PAST_INSTANT,
};

/** Drop a bundle into the install card's dropzone through the picker feeder. */
async function pickBundle(page: Page, manifest: ManifestFixture): Promise<void> {
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: `${manifest.id}.zip`, mimeType: "application/zip", buffer: bundle(manifest) });
}

test("the grant screen names every declared permission, its consequence, and the exact hosts it can reach", async ({ mount, page }) => {
  await routeTrpc(page, { "plugin.list": () => [] });
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

test("unchecking a permission installs the NARROWED subset, not what the bundle asked for", async ({ mount, page }) => {
  // The list read is STATEFUL so the test can barrier on a SETTLED rendered state — the installed row
  // appearing after the write's own invalidate — rather than on a toast or an in-flight flash.
  let installed = false;
  const recorder: TrpcRecorder = await routeTrpc(page, {
    "plugin.list": () => (installed ? [INSTALLED_ROW] : []),
    "plugin.install": () => {
      installed = true;
      return { ...INSTALLED_ROW, grantedCapabilities: ["chat.read", "net.fetch"] };
    },
  });
  await mount(<PluginsSurfaceStory />);
  await pickBundle(page, WEATHER_MANIFEST);

  // The default is the full ask, CONFIRMED — the design's "a paranoid owner may grant less" is the lever,
  // not the default. Then the owner takes the spendy one away.
  await page.getByRole("checkbox", { name: "Ask for a reply on its own" }).click();
  await page.getByRole("button", { name: "Install" }).click();

  // SETTLED: the row is in the list and the confirm step is gone.
  await expect(page.getByRole("switch", { name: "Turn Weather Teller on" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);

  const input = recorder.lastInput("plugin.install") as { grant: string[] } | undefined;
  expect(input?.grant).toEqual(["chat.read", "net.fetch"]);
});

test("a bundle that is not a plugin is refused with a reason, before anything is uploaded", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "plugin.list": () => [] });
  await mount(<PluginsSurfaceStory />);

  await page.locator(DROPZONE_INPUT).setInputFiles({
    name: "not-a-plugin.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "readme.txt": strToU8("hello") })),
  });

  await expect(page.getByRole("alert")).toContainText("manifest.json");
  // Nothing was sent: a refusal a person can read costs no round trip.
  // ONESHOT-OK: the preceding `toContainText` settled on the refusal, and the refusal is raised BEFORE any
  // network call by construction (the bundle read is local) — there is no in-flight install to race.
  expect(recorder.count("plugin.install")).toBe(0);
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
  });
  await mount(<PluginsSurfaceStory />);

  await expect(page.getByText("Weather Teller")).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  // The granted set is readable WITHOUT turning it on — consent you can re-read is consent you can revisit.
  await page.getByRole("button", { name: "What Weather Teller is allowed to do" }).click();
  await expect(page.getByText("Read this room's messages")).toBeVisible();
  await expect(page.getByText("Reach the internet")).toBeVisible();
  // It was granted a SUBSET at install; the row must not show the one it never got.
  await expect(page.getByText("Ask for a reply on its own")).toHaveCount(0);

  await page.getByRole("switch", { name: "Turn Weather Teller on" }).click();
  // SETTLED: the invalidate repainted the row from the server's new truth.
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  // ONESHOT-OK: the "On" assertion above settled on the post-invalidate repaint, which the stub only serves
  // AFTER `plugin.setEnabled` was called and recorded — the call is provably complete at this read.
  expect(recorder.lastInput("plugin.setEnabled")).toEqual({ pluginId: INSTALLED_ROW.id, enabled: true });
});

test("an upgrade that WIDENS reach says exactly what widened, and that the extra permissions were not granted", async ({ mount, page }) => {
  // The server's verdict for a reach-widening upgrade: the row lands `disabled` at the NEW version, and the
  // grant is `normalizeGrant(newDeclared, priorGranted)` — the INTERSECTION, so the newly-declared
  // capability is NOT in it. The list read follows the upgrade so the surface shows the post-upgrade truth.
  let upgraded = false;
  const upgradedRow = { ...INSTALLED_ROW, version: "2.0.0", status: "disabled", grantedCapabilities: ["chat.read", "net.fetch"] };
  await routeTrpc(page, {
    "plugin.list": () => [upgraded ? upgradedRow : INSTALLED_ROW],
    "plugin.upgrade": () => {
      upgraded = true;
      return upgradedRow;
    },
    "plugin.getLog": () => [],
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
  // WHAT widened — the new capability by its own name and consequence, not a bare count.
  await expect(notice).toContainText("Write lorebook entries");
  await expect(notice).toContainText("lorebooks already attached to the room");
  // The new capability renders UNCHECKED: that IS the stored grant, and seeing the box empty is how a
  // person reads "asked for, not allowed".
  await expect(notice.getByRole("checkbox", { name: NEW_LORE_CAPABILITY })).not.toBeChecked();
  // Both destinations verbatim: the host list IS the reach for net.fetch, and consent is to the SET.
  await expect(notice).toContainText("collector.elsewhere.example");
  await expect(notice).toContainText("api.weather.example");
  // …and NEITHER is marked "New" — which host changed is not derivable client-side (the `PluginView`
  // projection carries no prior `netHosts`), so a mark here would be an invented claim on a consent
  // screen. This assertion is the fence: an earlier revision badged EVERY host, including the one
  // carried forward unchanged.
  await expect(notice.getByText("New", { exact: true })).toHaveCount(1);
  // The TRUE consequence. There is no re-grant verb, so "turn it back on to confirm" would be a lie.
  await expect(notice).toContainText("did not grant the extra permissions");
  await expect(notice).toContainText("remove it and install the new bundle");
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
  // ONESHOT-OK: the output region above settled on this run's OWN response, so the call it counts has
  // already returned; nothing else in the story can call the proc.
  expect(recorder.count("plugin.runSnippet")).toBe(1);
});
