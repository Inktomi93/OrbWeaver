// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// @subject packages/client/src/data/use-display-scripts.ts
// The room's On screen roster, through the context tab's Regex section over the composed corpus server. Each case
// names the defect it catches: a display script listed where it is not attached, a member shown the host's scripts
// after the host switched sharing off, a room that never touched sharing not sharing, the host's switch reading off
// in that room or not stopping it, the room's scripts not running before the viewer's own, a script the room's tier lever or
// master holds off missing from the roster or not saying which switch holds it, and a row whose source words are cut
// off by its pattern.
import type { RegexTierKey } from "@orb/contracts/chat";
import { REGEX_VIEWER_SOURCE } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ChatId, UserId } from "@orb/kit/ids";
import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  REGEX_OFF_MARK,
  REGEX_SHARE_DISPLAY_SETTING,
  regexRosterOffReason,
  regexTierKicker,
  regexTierLever,
} from "#client/features/chat/lib/regex-section-model.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.setHostDisplayScripts",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listScripts",
  "regex.listGlobal",
  "regex.listDisplayScripts",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

function displayScript(name: string): ReturnType<typeof createRegexScriptSchema.parse> {
  return createRegexScriptSchema.parse({ name, findRegex: "x", replaceString: "y", targets: ["AI_OUTPUT"], passes: ["display"], enabled: true });
}

async function hostRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      return { chatId: room.id, host };
    }
  }
  throw new Error("The corpus has no room the owner hosts");
}

/** A room the corpus's second human hosts and the owner joins as a plain member. */
async function memberRoom(
  root: Harness,
  memberIdentities: { readonly sharedMember: { readonly viewer: { readonly userId: UserId } } } | undefined,
): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly viewer: Caller }> {
  const hostUserId = memberIdentities?.sharedMember.viewer.userId;
  if (hostUserId === undefined) {
    throw new Error("The corpus has no second human");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(hostUserId);
  const viewer = await root.internalCallerFor(root.ownerId);
  const chatId = (await host.chat.startChat({ characterIds: [], opening: "none" })).chat.id;
  await viewer.invites.redeemInvite({ token: (await host.invites.createInvite({ chatId, input: {} })).token });
  return { chatId, host, viewer };
}

/** Serve the tab as one caller, and say whether that caller hosts the room as the room's own read does. */
async function serveAs(root: Harness, page: Page, caller: Caller, chatId: ChatId): Promise<{ readonly chatId: ChatId; readonly isHost: boolean }> {
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, TAB_PROCEDURES));
  return { chatId, isHost: (await caller.chat.getChat({ chatId })).viewerIsHost };
}

/** One roster row, by its script's title. */
function rosterRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** The roster's running rows' titles, in the order it draws them. The viewer's switched-off Everywhere scripts
 *  follow them and are not part of the served set, so a row carrying the Off mark is left out. */
async function rosterTitles(page: Page): Promise<string[]> {
  const rows = page.locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]');
  const titles: string[] = [];
  for (const row of await rows.all()) {
    if ((await row.getByText(REGEX_OFF_MARK, { exact: true }).count()) === 0) {
      titles.push((await row.locator('[data-slot="list-row-title"]').textContent()) ?? "");
    }
  }
  return titles;
}

test("the host's roster lists a display script attached to the room and not one that is attached nowhere", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const attached = await host.regex.createScript({ input: displayScript("Tint the room") });
  await host.regex.createScript({ input: displayScript("Loose tint") });
  await host.regex.attachToChat({ chatId, scriptId: attached.id });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, await serveAs(root, page, host, chatId));
  await page.getByRole("button", { name: /^Regex/u }).click();

  // The server's read is the oracle for what runs; the roster must draw exactly it.
  const served = (await host.regex.listDisplayScripts({ chatId })).map((entry) => entry.script.name);
  expect(served).toContain(attached.name);
  await expect.poll(() => rosterTitles(page)).toEqual(served);
});

test("a member whose host switched sharing off sees only their own Everywhere scripts", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, viewer } = await memberRoom(root, corpus.memberIdentities);
  const hostTint = await host.regex.createScript({ input: displayScript("Host tint") });
  await host.regex.attachToChat({ chatId, scriptId: hostTint.id });
  await host.chat.setHostDisplayScripts({ chatId, enabled: false });
  const own = await viewer.regex.createScript({ input: displayScript("My tint") });
  await viewer.regex.attachGlobal({ scriptId: own.id });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, await serveAs(root, page, viewer, chatId));
  await page.getByRole("button", { name: /^Regex/u }).click();

  const served = await viewer.regex.listDisplayScripts({ chatId });
  // The positive control: the read did answer, with the member's own script as a viewer entry.
  expect(served.some((entry) => entry.script.id === own.id && entry.from === REGEX_VIEWER_SOURCE)).toBe(true);
  await expect.poll(() => rosterTitles(page)).toEqual(served.map((entry) => entry.script.name));
  expect(await rosterTitles(page)).not.toContain(hostTint.name);
});

test("a member whose host never touched sharing sees the room's scripts first, and only their own row carries a switch", async ({
  corpus,
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, host, viewer } = await memberRoom(root, corpus.memberIdentities);
  const hostTint = await host.regex.createScript({ input: displayScript("Host tint") });
  await host.regex.attachToChat({ chatId, scriptId: hostTint.id });
  const own = await viewer.regex.createScript({ input: displayScript("My tint") });
  await viewer.regex.attachGlobal({ scriptId: own.id });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, await serveAs(root, page, viewer, chatId));
  await page.getByRole("button", { name: /^Regex/u }).click();

  const titles = (await viewer.regex.listDisplayScripts({ chatId })).map((entry) => entry.script.name);
  expect(titles.indexOf(hostTint.name)).toBeGreaterThanOrEqual(0);
  expect(titles.indexOf(hostTint.name)).toBeLessThan(titles.indexOf(own.name));
  await expect.poll(() => rosterTitles(page)).toEqual(titles);
  await expect(rosterRow(page, own.name).getByRole("switch")).toHaveCount(1);
  await expect(rosterRow(page, hostTint.name).getByRole("switch")).toHaveCount(0);
});

test("the host's sharing switch reads on in a room that never touched it, and switching it off takes the room's scripts off a member's screen", async ({
  corpus,
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, host, viewer } = await memberRoom(root, corpus.memberIdentities);
  const hostTint = await host.regex.createScript({ input: displayScript("Host tint") });
  await host.regex.attachToChat({ chatId, scriptId: hostTint.id });
  const memberSees = async (): Promise<readonly string[]> => (await viewer.regex.listDisplayScripts({ chatId })).map((entry) => entry.script.id);
  // The positive control: the untouched room shares, so the member's read carries the host's script.
  expect(await memberSees()).toContain(hostTint.id);
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, await serveAs(root, page, host, chatId));
  await page.getByRole("button", { name: /^Regex/u }).click();

  const share = page.getByRole("switch", { name: REGEX_SHARE_DISPLAY_SETTING, exact: true });
  await expect(share).toBeChecked();
  // The switch reads back through the room's bus event, which this mount has no socket for, so the case reads the
  // stored flag and the member's read instead of the redrawn switch.
  await share.click();
  await expect.poll(async () => (await host.chat.getChat({ chatId })).hostDisplayScripts).toBe(false);
  expect(await memberSees()).not.toContain(hostTint.id);
});

for (const { label, lever, off } of [
  { label: "its tier's lever", lever: { kind: "tier", tier: "chat", enabled: false }, off: "tier" },
  { label: "the room's master switch", lever: { kind: "master", enabled: false }, off: "room" },
] as const) {
  test(`a room script held off by ${label} is listed as off, at its tier, with the switch named`, async ({ mount, page, corpusMedia }) => {
    await using root = await createCorpusHarness();
    const { chatId, host } = await hostRoom(root);
    const script = await host.regex.createScript({ input: displayScript("Room panel") });
    await host.regex.attachToChat({ chatId, scriptId: script.id });
    const served = async (): Promise<readonly string[]> => (await host.regex.listDisplayScripts({ chatId })).map((entry) => entry.script.id);
    // The positive control: the script runs on screen until the switch is flipped.
    expect(await served()).toContain(script.id);
    await host.chat.setRegexAllow({ chatId, lever });
    expect(await served()).not.toContain(script.id);
    await corpusMedia();
    await mount<typeof ChatContextTabStory>(TAB_STORY, await serveAs(root, page, host, chatId));
    await page.getByRole("button", { name: /^Regex/u }).click();

    const row = rosterRow(page, script.name);
    await expect(row.getByText(REGEX_OFF_MARK, { exact: true })).toBeVisible();
    const noNames = new Map<RegexTierKey, string>();
    // The subtitle opens with the axes glyphs, so the tier is the words after them.
    await expect(row.locator('[data-slot="list-row-subtitle"]')).toContainText(regexTierKicker("chat", noNames));
    await expect(row.locator('[data-slot="regex-on-screen-off-reason"]')).toHaveText(regexRosterOffReason(off, regexTierLever("chat", noNames)) ?? "");
  });
}

// A pattern far wider than any panel, so it must truncate, and the row's source words must still show whole.
const LONG_PATTERN = `<status_panel>${"(?:[^<]+)".repeat(24)}</status_panel>`;

for (const { label, viewport, width } of [
  { label: "a phone", viewport: { width: 390, height: 844 }, width: 358 },
  { label: "a narrow desktop panel", viewport: { width: 1280, height: 900 }, width: 320 },
] as const) {
  test(`at ${label}, a roster row shows whose script it is and where it runs from in full while its pattern truncates`, async ({
    mount,
    page,
    corpusMedia,
  }) => {
    await page.setViewportSize(viewport);
    await using root = await createCorpusHarness();
    const { chatId, host } = await hostRoom(root);
    const script = await host.regex.createScript({
      input: createRegexScriptSchema.parse({ name: "Long panel", findRegex: LONG_PATTERN, replaceString: "", targets: ["AI_OUTPUT"], passes: ["display"] }),
    });
    await host.regex.attachToChat({ chatId, scriptId: script.id });
    await corpusMedia();
    await mount<typeof ChatContextTabStory>(TAB_STORY, { ...(await serveAs(root, page, host, chatId)), width });
    await page.getByRole("button", { name: /^Regex/u }).click();

    const row = rosterRow(page, script.name);
    const measure = (selector: string): Promise<{ readonly wide: number; readonly box: number; readonly tall: number; readonly high: number }> =>
      row
        .locator(selector)
        .evaluate((element) => ({ wide: element.scrollWidth, box: element.clientWidth, tall: element.scrollHeight, high: element.clientHeight }));
    // The positive control: the pattern line overflows and is cut, so the measure below reads a row under pressure.
    const pattern = await measure('[data-slot="regex-on-screen-pattern"]');
    expect(pattern.wide).toBeGreaterThan(pattern.box + LAYOUT_SUBPIXEL_PX);
    const source = await measure('[data-slot="list-row-subtitle"]');
    expect(source.box).toBeGreaterThan(0);
    expect(source.wide).toBeLessThanOrEqual(source.box + LAYOUT_SUBPIXEL_PX);
    expect(source.tall).toBeLessThanOrEqual(source.high + LAYOUT_SUBPIXEL_PX);
  });
}
