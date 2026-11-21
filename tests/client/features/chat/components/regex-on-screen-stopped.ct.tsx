// @subject packages/client/src/features/chat/components/regex-on-screen-group.tsx
// The On screen roster's Stopped mark, through a real stop: a display script that overruns the display pass's Worker
// deadline on a real transcript row is stopped, and the room's roster marks that script's row stopped and no other.
// The defects it catches are a roster that lists a stopped script as if it still ran on this device, and a mark that
// outlives an edit to the stopped pattern, which the display pass runs again.

import type { UserId } from "@orb/kit/ids";
import { absenceWindow, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { REGEX_SCRIPT_ENABLED_SETTING } from "#client/features/chat/lib/regex-section-model.ts";
import { regexBrowserStoppedReason } from "#client/features/chat/lib/regex-stop-copy.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { TranscriptBesideTabBusStory } from "./_chat-forks-stories.tsx";
import { GHOST_ROOM_PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-forks-stories/TranscriptBesideTabBusStory";
const UTC = "UTC";
/** Backtracks exponentially on a run of `a` that does not end the line: at forty, for longer than any test runs. */
const RUNAWAY = { name: "Runaway", findRegex: "(a+)+$", replaceString: "MATCHED" } as const;
const RUNAWAY_TEXT = `${"a".repeat(40)}!`;
/** The runaway's pattern once its author fixes it: it matches the whole row at once. */
const FIXED_FIND = "^a+!$";
const MEMBER_PASSWORD = "stopped-member-password";
// How long a notice that would be raised has to show itself: well past a toast's own mount.
const NOTICE_WINDOW_MS = 1000;
const TALL_PAGE_HEIGHT = 4000;
const STEADY = { name: "Steady", findRegex: "STEADYMARK", replaceString: "steady" } as const;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

const PROCEDURES = [
  ...GHOST_ROOM_PROCEDURES,
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listGlobal",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;

/** A roster row, by its script's title. */
function rosterRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** The roster's warning mark on a row: the stopped state, read by its tone rather than its words. */
function stoppedMark(row: ReturnType<Page["locator"]>): ReturnType<Page["locator"]> {
  return row.locator('[data-slot="badge"][data-tone="warning"]');
}

test("a display script the Worker stops on a real row is marked stopped until its pattern is edited, and a steady one never is", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { chatId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const created: Awaited<ReturnType<typeof owner.regex.createScript>>[] = [];
  for (const script of [RUNAWAY, STEADY]) {
    const row = await owner.regex.createScript({ input: { ...script, targets: ["AI_OUTPUT", "USER_INPUT"], passes: ["display"] } });
    await owner.regex.attachGlobal({ scriptId: row.id });
    created.push(row);
  }
  const [runaway] = created;
  const { messages } = await owner.chat.listMessages({ chatId, limit: 1 });
  const newest = messages.at(-1);
  if (runaway === undefined || newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await owner.chat.editMessage({ chatId, messageId: newest.id, content: RUNAWAY_TEXT, timeZone: UTC });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(owner, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  // The server's own announcement of the library edit below, which is what the page refreshes its scripts on.
  await forwardUserEvent(page, root, "regexChanged", cleanup);
  await corpusMedia();
  await mount<typeof TranscriptBesideTabBusStory>(STORY, { chatId, isHost: (await owner.chat.getChat({ chatId })).viewerIsHost });

  // The stop itself: the row keeps its own text, and one notice is raised.
  const row = page.locator(`[data-message-id="${newest.id}"]`);
  await expect(row.getByText(RUNAWAY_TEXT, { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);

  await page.getByRole("button", { name: /^Regex/u }).click();
  // The positive control: both scripts are listed, so a missing mark is not a missing row.
  await expect(rosterRow(page, STEADY.name)).toHaveCount(1);
  await expect(stoppedMark(rosterRow(page, RUNAWAY.name))).toHaveCount(1);
  await expect(stoppedMark(rosterRow(page, STEADY.name))).toHaveCount(0);

  // The author fixes the pattern in their library.
  await owner.regex.updateScript({ scriptId: runaway.id, input: { findRegex: FIXED_FIND } });

  // The edited script runs again: the row draws, the roster lists the new pattern, and the mark is gone.
  await expect(row.getByText(RUNAWAY.replaceString, { exact: true })).toBeVisible();
  await expect(rosterRow(page, RUNAWAY.name).getByText(FIXED_FIND, { exact: false })).toHaveCount(1);
  await expect(stoppedMark(rosterRow(page, RUNAWAY.name))).toHaveCount(0);
});

test("a script whose row is on screen when the Worker stops it raises no notice beside the row's own mark", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { chatId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  // The story's page does not scroll, so the whole tab has to fit for the roster row to be in view.
  await page.setViewportSize({ width: 1280, height: TALL_PAGE_HEIGHT });
  // The script starts as its fixed form, so nothing stops until the reader has the roster open.
  const runaway = await owner.regex.createScript({ input: { ...RUNAWAY, findRegex: FIXED_FIND, targets: ["AI_OUTPUT", "USER_INPUT"], passes: ["display"] } });
  await owner.regex.attachGlobal({ scriptId: runaway.id });
  const newest = (await owner.chat.listMessages({ chatId, limit: 1 })).messages.at(-1);
  if (newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await owner.chat.editMessage({ chatId, messageId: newest.id, content: RUNAWAY_TEXT, timeZone: UTC });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(owner, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "regexChanged", cleanup);
  await corpusMedia();
  await mount<typeof TranscriptBesideTabBusStory>(STORY, { chatId, isHost: (await owner.chat.getChat({ chatId })).viewerIsHost });
  const row = page.locator(`[data-message-id="${newest.id}"]`);
  await expect(row.getByText(RUNAWAY.replaceString, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Regex/u }).click();
  await expect(rosterRow(page, RUNAWAY.name)).toHaveCount(1);
  // The reader has the row in view, which is what makes its mark enough.
  await rosterRow(page, RUNAWAY.name).scrollIntoViewIfNeeded();
  await expect(rosterRow(page, RUNAWAY.name)).toBeInViewport({ ratio: 1 });

  // The author breaks the pattern again in their library: the page runs it, and the Worker stops it.
  await owner.regex.updateScript({ scriptId: runaway.id, input: { findRegex: RUNAWAY.findRegex } });
  await expect(stoppedMark(rosterRow(page, RUNAWAY.name))).toHaveCount(1);
  await expect(row.getByText(RUNAWAY_TEXT, { exact: true })).toBeVisible();
  await absenceWindow(page, NOTICE_WINDOW_MS);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
});

test("a member's stopped host script points at the host, because the member's rows hold no switch for it", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const memberId: UserId | undefined = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no second human");
  }
  const { chatId } = await soloRoom(root);
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  await member.invites.redeemInvite({ token: (await host.invites.createInvite({ chatId, input: {} })).token });
  const script = await host.regex.createScript({ input: { ...RUNAWAY, targets: ["AI_OUTPUT", "USER_INPUT"], passes: ["display"] } });
  await host.regex.attachToChat({ chatId, scriptId: script.id });
  const newest = (await host.chat.listMessages({ chatId, limit: 1 })).messages.at(-1);
  if (newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await host.chat.editMessage({ chatId, messageId: newest.id, content: RUNAWAY_TEXT, timeZone: UTC });
  const { cookie } = await captureCookieAuth(root, await root.principalFor(memberId), MEMBER_PASSWORD);
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config", { headers: { cookie } })).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(member, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page, { awaitRooms: [], frames: [] });
  await corpusMedia();
  await mount<typeof TranscriptBesideTabBusStory>(STORY, { chatId, isHost: (await member.chat.getChat({ chatId })).viewerIsHost });
  await page.getByRole("button", { name: /^Regex/u }).click();

  const row = rosterRow(page, RUNAWAY.name);
  // The positive control: the member's row is stopped and holds no switch, so the reason has no control of the row's to name.
  await expect(stoppedMark(row)).toHaveCount(1);
  await expect(row.getByRole("switch")).toHaveCount(0);
  const reason = row.locator('[data-slot="regex-stop-reason"]');
  await expect(reason.getByText(regexBrowserStoppedReason("host"), { exact: true })).toBeVisible();
  await expect(reason).not.toContainText(REGEX_SCRIPT_ENABLED_SETTING);
});
