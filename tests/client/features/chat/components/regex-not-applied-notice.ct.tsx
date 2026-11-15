// @subject packages/client/src/features/chat/lib/turn-warning-surface.ts
// A host regex script a server pass did not apply, as the host's room shows it. The room bus carries the server's
// warning, which names the script by id only. The room raises one notice that names the script from the host's own
// library and updates in place, and the On screen roster marks that script. A replayed warning raises nothing new,
// and an id the library does not hold still renders. That the event reaches only the host is the server's
// delivery, tested on its side.

import { contextToggleLabel } from "@orb/client/lib";
import type { RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import { REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
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
import { regexNotAppliedNotice } from "#client/features/chat/lib/warning-notice.ts";
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
const SLOW = { name: "Slow history", findRegex: "SLOWMARK", replaceString: "slow" } as const;
const HISTORY: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "row_deadline", pass: "prompt_history" };
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

test("a skipped host script raises one named notice that a replay does not repeat, and the roster marks it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const chatId = await findHostedRoom(host);
  const slow = await host.regex.createScript({ input: { ...SLOW, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] } });
  await host.regex.attachGlobal({ scriptId: slow.id });
  // An id the host's library has never held: a script deleted since the turn ran reads the same.
  const unknownId = root.idSource.typeId(ID_PREFIX.regexScript);

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
  // The last frame is the one before it again, as a later turn's history pass or a reconnect's replay sends it.
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
