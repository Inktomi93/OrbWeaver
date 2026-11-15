// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// @subject packages/client/src/data/use-display-scripts.ts
// The room's On screen roster, through the context tab's Regex section over the composed corpus server. Each case
// names the defect it catches: a display script listed where it is not attached, a member shown the host's scripts
// the host is not sharing, and the room's scripts not running before the viewer's own.
import { REGEX_VIEWER_SOURCE } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ChatId, UserId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { REGEX_OFF_MARK } from "#client/features/chat/lib/regex-section-model.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
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

test("a member whose host is not sharing sees only their own Everywhere scripts", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, viewer } = await memberRoom(root, corpus.memberIdentities);
  const hostTint = await host.regex.createScript({ input: displayScript("Host tint") });
  await host.regex.attachToChat({ chatId, scriptId: hostTint.id });
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

test("a member whose host shares sees the room's scripts first, and only their own row carries a switch", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host, viewer } = await memberRoom(root, corpus.memberIdentities);
  const hostTint = await host.regex.createScript({ input: displayScript("Host tint") });
  await host.regex.attachToChat({ chatId, scriptId: hostTint.id });
  await host.chat.setHostDisplayScripts({ chatId, enabled: true });
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
