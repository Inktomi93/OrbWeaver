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
import { REGEX_NOT_APPLIED_MARK, regexNotAppliedReason } from "#client/features/chat/lib/regex-stop-copy.ts";
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
const HISTORY: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "row_deadline", pass: "prompt_history" };
// The scripts a turn left past the naming cap.
const OVERFLOW = 3;
// A warning with its own notice: once it shows, every frame sent before it was handled.
const SENTINEL: ChatWarning = { code: "provider_refused" };
const UNKNOWN: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "did_not_compile", pass: "ai_output" };
test.use({ viewport: { width: 1280, height: 1000 }, isMobile: false, hasTouch: false });

function warning(
  chatId: ChatId,
  scriptId: RegexScriptId,
  at: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass },
  seq: number,
): StreamFrame {
  return { channel: "chat", chatId, seq, event: { type: "warning", chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId, ...at } };
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
