// @subject packages/client/src/features/chat/lib/turn-warning-surface.ts
// A host regex script a server pass did not apply, as the host's room shows it. The room bus carries the server's
// warning, which names the script by id only. The room raises one notice that names the script from the host's own
// library and updates in place, and the On screen roster marks that script. A replayed warning raises nothing new,
// and an id the library does not hold still renders. Scripts past a turn's naming cap arrive as one count, which joins
// the same notice. A replay or a later turn's same count raises nothing; a higher count raises it once with that count.
// That the event reaches only the host is the server's delivery, tested on its side.

import { contextToggleLabel } from "@orb/client/lib";
import type { ChatWarning, RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import { REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  noticeToast,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_CONTEXT_TAB_LABELS } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import { REGEX_SCRIPT_ENABLED_SETTING } from "#client/features/chat/lib/regex-section-model.ts";
import {
  REGEX_NOT_APPLIED_MARK,
  REGEX_STOP_OPEN_ROOM_NAME,
  REGEX_STOP_OPEN_SCRIPT_NAME,
  regexNotAppliedReason,
} from "#client/features/chat/lib/regex-stop-copy.ts";
import { regexNotAppliedNotice, warningNotice } from "#client/features/chat/lib/warning-notice.ts";
import { ALERTS_REGION_NAME, TOAST_CLOSE_NAME } from "#ui/primitives/toast/toast-names.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import { findHostedRoom } from "./hosted-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// Past any sequence the corpus room holds, so the scripted frames land as new live events.
const FIRST_SEQ = 1_000_000;
// The This-chat tab's reads, past the room's own set.
const THIS_CHAT_PROCEDURES = [
  "chat.getGroupConfig",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listGlobal",
  "regex.listScripts",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "automation.listRules",
] as const;
// More reconnects than the case waits through before it closes the notice; each one is a dropped connection.
const RECONNECTS_UNTIL_CLOSED = 1000;
const SLOW = { name: "Slow history", findRegex: "SLOWMARK", replaceString: "slow" } as const;
// A script only the prompt passes run: the On screen roster never lists it.
const PROMPT_ONLY = { name: "Prompt history", findRegex: "PROMPTMARK", replaceString: "prompt" } as const;
const HISTORY: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "row_deadline", pass: "prompt_history" };
// The scripts a turn left past the naming cap.
const OVERFLOW = 3;
// A warning with its own notice: once it shows, every frame sent before it was handled.
const SENTINEL: ChatWarning = { code: "provider_refused" };
const UNKNOWN: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "did_not_compile", pass: "ai_output" };
const PHONE_WIDTH = 390;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

function warning(
  chatId: ChatId,
  scriptId: RegexScriptId,
  at: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass },
  seq: number,
): StreamFrame {
  return { channel: "chat", chatId, seq, event: { type: "warning", chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId, ...at } };
}

/** A row of the Regex section by its script's title, wherever the section draws it: a tier group's or the On screen roster's. */
function sectionRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-section"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** A roster row, by its script's title. */
function rosterRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];

/** Serve the host's room with its This chat reads. */
async function serveHostedRoom(
  page: Page,
  { root, corpus, host, chatId }: { readonly root: Harness; readonly corpus: Corpus; readonly host: Caller; readonly chatId: ChatId },
): Promise<void> {
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      ...THIS_CHAT_PROCEDURES,
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
  });
}

test("a skipped host script raises one named notice that a replay does not repeat, and the roster marks it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const slow = await host.regex.createScript({ input: { ...SLOW, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: slow.id });
  // An id the host's library has never held: a script deleted since the turn ran reads the same.
  const unknownId = root.idSource.typeId(ID_PREFIX.regexScript);
  // The last frame is the one before it again, as a later turn's history pass or a reconnect's replay sends it.
  // The reads first: the socket stub, routed last, answers its own request and passes the rest to them.
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
    frames: [
      warning(chatId, unknownId, UNKNOWN, FIRST_SEQ),
      warning(chatId, slow.id, HISTORY, FIRST_SEQ + 1),
      warning(chatId, slow.id, HISTORY, FIRST_SEQ + 2),
    ],
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  // One notice, updated in place: two scripts, the one the library does not hold first, and the newest named from the
  // host's library.
  await expect(
    noticeToast(
      page,
      regexNotAppliedNotice([
        { name: null, ...UNKNOWN },
        { name: SLOW.name, ...HISTORY },
      ]),
    ),
  ).toBeVisible();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);

  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await page.getByRole("tab", { name: CHAT_CONTEXT_TAB_LABELS.settings, exact: true }).click();
  await page.getByRole("button", { name: /^Regex/u }).click();
  const row = rosterRow(page, SLOW.name);
  // The positive control: the row is listed, so a missing mark is not a missing row.
  await expect(row).toHaveCount(1);
  await expect(row.getByText(REGEX_NOT_APPLIED_MARK, { exact: true })).toBeVisible();
  // The reason is on screen under the row, not only spoken.
  await expect(row.getByText(regexNotAppliedReason(HISTORY.cause, HISTORY.pass), { exact: true })).toBeVisible();
});

test("a stopped script's long name stays whole beside its mark at phone width", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const long = { name: "Fix narrator quotation marks", findRegex: "LONGMARK", replaceString: "long" } as const;
  const script = await host.regex.createScript({ input: { ...long, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: script.id });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, script.id, HISTORY, FIRST_SEQ)] });
  await page.setViewportSize({ width: PHONE_WIDTH, height: 900 });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await page.getByRole("tab", { name: CHAT_CONTEXT_TAB_LABELS.settings, exact: true }).click();
  await page.getByRole("button", { name: /^Regex/u }).click();
  const row = rosterRow(page, long.name);
  await expect(row.getByText(REGEX_NOT_APPLIED_MARK, { exact: true })).toBeVisible();
  const title = row.locator('[data-slot="list-row-title"]');
  // Positive control: the title is drawn, so a zero overflow is not an unmeasured node.
  expect(await title.evaluate((node) => node.clientWidth)).toBeGreaterThan(0);
  expect(await title.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
});

test("scripts past a turn's naming cap join the notice as a count that a replay or a later turn's same count never raises again", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const slow = await host.regex.createScript({ input: { ...SLOW, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: slow.id });
  const overflow = (count: number, seq: number): StreamFrame => ({
    channel: "chat",
    chatId,
    seq,
    event: { type: "warning", chatId, code: REGEX_NOT_APPLIED_OVERFLOW_CODE, count },
  });
  const sentinel = (seq: number): StreamFrame => ({ channel: "chat", chatId, seq, event: { type: "warning", chatId, ...SENTINEL } });
  // Each connection serves the frames of the phase the case has reached, and ends without a close, so the client keeps
  // reconnecting; a repeat of a phase's frames is a replay the seq guard drops. The first connection opened after a
  // close serves the next phase.
  const phases: readonly (readonly StreamFrame[])[] = [
    [warning(chatId, slow.id, HISTORY, FIRST_SEQ), overflow(OVERFLOW, FIRST_SEQ + 1)],
    // A later turn: the same script and cause, the same count under its own seq, then a frame with its own notice.
    [warning(chatId, slow.id, HISTORY, FIRST_SEQ + 2), overflow(OVERFLOW, FIRST_SEQ + 3), sentinel(FIRST_SEQ + 4)],
    // A turn after that, with more scripts past the cap: new failures, so the notice comes back with the new count.
    [overflow(OVERFLOW + 2, FIRST_SEQ + 5)],
  ];
  let phase = 0;
  // The reads first: the socket stub, routed last, answers its own request and passes the rest to them.
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
    dropConnectionCount: RECONNECTS_UNTIL_CLOSED,
    frames: (): Promise<readonly StreamFrame[]> => Promise.resolve(phases[phase] ?? []),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();
  const toasts = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).locator('[data-slot="toast-root"]');
  const close = async (notice: ReturnType<typeof noticeToast>): Promise<void> => {
    await notice.getByRole("button", { name: TOAST_CLOSE_NAME, exact: true }).click();
    await expect(notice).toHaveCount(0);
    phase += 1;
  };

  const first = noticeToast(page, regexNotAppliedNotice([{ name: SLOW.name, ...HISTORY }], OVERFLOW));
  await expect(first).toBeVisible();
  // Closed, so a notice raised again would show again rather than update in place unseen.
  await close(first);

  // Once the sentinel shows, every frame before it was handled, and the closed notice stayed closed.
  const said = noticeToast(page, warningNotice(SENTINEL));
  await expect(said).toBeVisible();
  await expect(toasts).toHaveCount(1);
  await close(said);

  // The positive control: a higher count raises the notice once, showing that turn's count and not a running sum.
  await expect(noticeToast(page, regexNotAppliedNotice([{ name: SLOW.name, ...HISTORY }], OVERFLOW + 2))).toBeVisible();
  await expect(toasts).toHaveCount(1);
});

test("the notice's action lands on the stopped script's row and leaves the roster uncovered", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const slow = await host.regex.createScript({ input: { ...SLOW, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: slow.id });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, slow.id, HISTORY, FIRST_SEQ)] });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  const notice = noticeToast(page, regexNotAppliedNotice([{ name: SLOW.name, ...HISTORY }]));
  await expect(notice).toBeVisible();
  // The context panel is shut and its Regex section is closed, so the row is nowhere on screen until the action runs.
  await expect(rosterRow(page, SLOW.name)).toHaveCount(0);
  await notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true }).click();

  // The notice has gone, so it covers nothing; the row is on screen, in view, and holds focus.
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
  const row = rosterRow(page, SLOW.name);
  await expect(row).toBeVisible();
  await expect(row).toBeInViewport();
  const item = page
    .locator('[data-slot="regex-on-screen"] [role="listitem"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(SLOW.name, { exact: true }) });
  await expect(item).toBeFocused();
});

test("a stopped script only the prompt passes run is marked, with its reason, on its own tier row where the notice's action lands", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const script = await host.regex.createScript({ input: { ...PROMPT_ONLY, targets: ["AI_OUTPUT"], passes: ["prompt"] } });
  await host.regex.attachGlobal({ scriptId: script.id });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, script.id, HISTORY, FIRST_SEQ)] });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  const notice = noticeToast(page, regexNotAppliedNotice([{ name: PROMPT_ONLY.name, ...HISTORY }]));
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true }).click();

  // The action opens the Regex section; the script is not an on-screen one, so its tier row is the only row it has.
  const row = sectionRow(page, PROMPT_ONLY.name);
  await expect(row).toHaveCount(1);
  await expect(rosterRow(page, PROMPT_ONLY.name)).toHaveCount(0);
  await expect(row.getByText(REGEX_NOT_APPLIED_MARK, { exact: true })).toBeVisible();
  await expect(row.getByText(regexNotAppliedReason(HISTORY.cause, HISTORY.pass), { exact: true })).toBeVisible();
  // The reason sends the reader to a control that is on this row: the script's own switch, which is off everywhere.
  expect(regexNotAppliedReason(HISTORY.cause, HISTORY.pass)).toContain(REGEX_SCRIPT_ENABLED_SETTING);
  await expect(row.getByRole("switch", { name: new RegExp(`^${REGEX_SCRIPT_ENABLED_SETTING}`, "u") })).toBeVisible();
});

test("a notice that names no script in the library offers the tab, not a row", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const unknownId = root.idSource.typeId(ID_PREFIX.regexScript);
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, unknownId, UNKNOWN, FIRST_SEQ)] });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  const notice = noticeToast(page, regexNotAppliedNotice([{ name: null, ...UNKNOWN }]));
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: REGEX_STOP_OPEN_ROOM_NAME, exact: true })).toBeVisible();
  await expect(notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true })).toHaveCount(0);
});
