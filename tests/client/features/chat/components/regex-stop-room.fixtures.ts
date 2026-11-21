import type { ChatWarning, RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import { REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { createShellAmbientReads, ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import type { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];

/** Past any sequence the corpus room holds, so the scripted frames land as new live events. */
export const FIRST_SEQ = 1_000_000;
/** A script the display pass and the prompt passes both run: the On screen roster lists it, and so does its tier. */
export const SLOW = { name: "Slow history", findRegex: "SLOWMARK", replaceString: "slow" } as const;
/** A script only the prompt passes run: the On screen roster never lists it. */
export const PROMPT_ONLY = { name: "Prompt history", findRegex: "PROMPTMARK", replaceString: "prompt" } as const;
export const HISTORY: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } = { cause: "row_deadline", pass: "prompt_history" };
/** A warning with its own notice: once it shows, every frame sent before it was handled. */
export const SENTINEL: ChatWarning = { code: "provider_refused" };

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

export function warning(
  chatId: ChatId,
  scriptId: RegexScriptId,
  at: { readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass },
  seq: number,
): StreamFrame {
  return { channel: "chat", chatId, seq, event: { type: "warning", chatId, code: REGEX_SCRIPT_NOT_APPLIED_CODE, scriptId, ...at } };
}

/** A row of the Regex section by its script's title, wherever the section draws it: a tier group's or the On screen roster's. */
export function sectionRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-section"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** A roster row, by its script's title. */
export function rosterRow(page: Page, name: string): ReturnType<Page["locator"]> {
  return page
    .locator('[data-slot="regex-on-screen"] [data-slot="list-row-root"]')
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** The frame that takes focus when a notice's action lands on a row, by its script's title: the roster's or a tier group's. */
export function rowAnchor(page: Page, group: "regex-on-screen" | "regex-tier", name: string): ReturnType<Page["locator"]> {
  return page
    .locator(`[data-slot="${group}"] [data-slot="regex-row-anchor"]`)
    .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
}

/** Serve the host's room with its This chat reads. The case seeds the shell's Chats section first (`seedShellState`), which is browser-world. */
export async function serveHostedRoom(
  page: Page,
  { root, corpus, host, chatId }: { readonly root: Harness; readonly corpus: Corpus; readonly host: Caller; readonly chatId: ChatId },
): Promise<void> {
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
