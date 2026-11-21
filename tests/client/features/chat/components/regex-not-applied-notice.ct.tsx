// @subject packages/client/src/features/chat/lib/turn-warning-surface.ts
// A host regex script a server pass did not apply, as the host's room shows it. The room bus carries the server's
// warning, which names the script by id only. The room raises one notice that names the script from the host's own
// library and updates in place, and the On screen roster marks that script. A replayed warning raises nothing new,
// and an id the library does not hold still renders. Scripts past a turn's naming cap arrive as one count, which joins
// the same notice. A replay or a later turn's same count raises nothing; a higher count raises it once with that count.
// That the event reaches only the host is the server's delivery, tested on its side.

import { contextToggleLabel } from "@orb/client/lib";
import type { RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import { REGEX_NOT_APPLIED_OVERFLOW_CODE } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import { ID_PREFIX } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeOrbSocket } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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
import { FIRST_SEQ, HISTORY, PROMPT_ONLY, rosterRow, rowAnchor, SENTINEL, SLOW, sectionRow, serveHostedRoom, warning } from "./regex-stop-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
// More reconnects than the case waits through before it closes the notice; each one is a dropped connection.
const RECONNECTS_UNTIL_CLOSED = 1000;
// The scripts a turn left past the naming cap.
const OVERFLOW = 3;
const UNKNOWN: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "did_not_compile", pass: "ai_output" };
const PHONE_WIDTH = 390;
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

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
  await seedShellState(page, { activeSection: "chats" });
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
  await expect(row.getByText(regexNotAppliedReason(HISTORY.cause, HISTORY.pass, "switch"), { exact: true })).toBeVisible();
  // The toast points at no row, so it names no switch.
  await expect(
    noticeToast(
      page,
      regexNotAppliedNotice([
        { name: null, ...UNKNOWN },
        { name: SLOW.name, ...HISTORY },
      ]),
    ),
  ).not.toContainText(REGEX_SCRIPT_ENABLED_SETTING);
});

test("a stopped script's long name stays whole beside its mark at phone width", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const long = { name: "Fix narrator quotation marks", findRegex: "LONGMARK", replaceString: "long" } as const;
  const script = await host.regex.createScript({ input: { ...long, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: script.id });
  await seedShellState(page, { activeSection: "chats" });
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
  await seedShellState(page, { activeSection: "chats" });
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
  await seedShellState(page, { activeSection: "chats" });
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
  await expect(row).toBeInViewport({ ratio: 1 });
  // The script is also a row of its tier, and the roster's row is the one that takes focus.
  await expect(sectionRow(page, SLOW.name)).toHaveCount(2);
  await expect(rowAnchor(page, "regex-on-screen", SLOW.name)).toBeFocused();
  await expect(rowAnchor(page, "regex-tier", SLOW.name)).not.toBeFocused();
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
  await seedShellState(page, { activeSection: "chats" });
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
  await expect(row.getByText(regexNotAppliedReason(HISTORY.cause, HISTORY.pass, "switch"), { exact: true })).toBeVisible();
  // The reason sends the reader to a control that is on this row: the script's own switch, which is off everywhere.
  await expect(row.locator('[data-slot="regex-stop-reason"]')).toContainText(REGEX_SCRIPT_ENABLED_SETTING);
  await expect(row.getByRole("switch", { name: new RegExp(`^${REGEX_SCRIPT_ENABLED_SETTING}`, "u") })).toBeVisible();
  // The action lands on this row, whole in view and focused, as it does on the roster's.
  await expect(row).toBeInViewport({ ratio: 1 });
  await expect(rowAnchor(page, "regex-tier", PROMPT_ONLY.name)).toBeFocused();
});

test("a skipped script whose row is already on screen raises no notice beside it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const slow = await host.regex.createScript({ input: { ...SLOW, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: slow.id });
  await seedShellState(page, { activeSection: "chats" });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  // The report comes after the reader has opened the Regex section: the first connection serves nothing, and the next one serves
  // the report and then a warning with its own notice, so that notice showing means the report before it was handled.
  const frames = [
    warning(chatId, slow.id, HISTORY, FIRST_SEQ),
    { channel: "chat", chatId, seq: FIRST_SEQ + 1, event: { type: "warning", chatId, ...SENTINEL } } as const,
  ];
  let reported = false;
  const socket = await routeOrbSocket(page, {
    awaitRooms: [{ channel: "chat", chatId }],
    dropConnectionCount: RECONNECTS_UNTIL_CLOSED,
    frames: (): Promise<readonly StreamFrame[]> => Promise.resolve(reported ? frames : []),
  });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await page.getByRole("tab", { name: CHAT_CONTEXT_TAB_LABELS.settings, exact: true }).click();
  await page.getByRole("button", { name: /^Regex/u }).click();
  await expect(rosterRow(page, SLOW.name)).toBeVisible();
  reported = true;

  await expect(noticeToast(page, warningNotice(SENTINEL))).toBeVisible();
  // The row marks the stop, so the report was handled; and the notice that would repeat it was never raised.
  await expect(rosterRow(page, SLOW.name).getByText(REGEX_NOT_APPLIED_MARK, { exact: true })).toBeVisible();
  await expect(noticeToast(page, regexNotAppliedNotice([{ name: SLOW.name, ...HISTORY }]))).toHaveCount(0);
});

test("a notice that names no script in the library offers the tab, not a row", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const unknownId = root.idSource.typeId(ID_PREFIX.regexScript);
  await seedShellState(page, { activeSection: "chats" });
  await serveHostedRoom(page, { root, corpus, host, chatId });
  const socket = await routeOrbSocket(page, { awaitRooms: [{ channel: "chat", chatId }], frames: [warning(chatId, unknownId, UNKNOWN, FIRST_SEQ)] });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await socket.served();

  const notice = noticeToast(page, regexNotAppliedNotice([{ name: null, ...UNKNOWN }]));
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: REGEX_STOP_OPEN_ROOM_NAME, exact: true })).toBeVisible();
  await expect(notice.getByRole("button", { name: REGEX_STOP_OPEN_SCRIPT_NAME, exact: true })).toHaveCount(0);
});
