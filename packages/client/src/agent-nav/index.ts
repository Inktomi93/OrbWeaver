// The dev-only SPA-navigation bridge implementation (`__orb.nav`). Lives at the composition tier —
// sibling to main.tsx, NOT under routes/ (the route-import gate reserves feature-front-door imports for
// app-root.tsx) — because it wires the app's client-state navigation actions together, and the lib/ floor
// that homes agent-bridge.ts may not import #state/#features/#data. So the handle's IMPL is built here and
// injected into installAgentDebugHandle. Every arm calls the EXACT store action the real UI calls
// (setActiveSection, openModal, openConfigTo, revealContextPanel, selectChat) — never a parallel mutation
// path — and validates ids against the canonical vocabulary tuples (the context tab against the mounted
// surface's PUBLISHED ids), returning a loud {ok:false} on a bad target instead of a silent no-op.
//
// A VOCABULARY THAT MAY BE EMPTY IS NOT A VOCABULARY (issue #656). The static tuples above exist at import
// time; the context-tab set is PUBLISHED BY A MOUNT EFFECT and is empty for a beat after every navigation.
// Validating against it while empty validated vacuously — the arm dispatched an unresolvable string and
// reported `ok:true` on a panel showing a different tab. `resolveContextTab` below waits on the panel's own
// publish (bounded) and verifies the landing; that is why it, alone among the arms, is async.

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import { CHAT_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc } from "#data";
import { deriveChatTitle } from "#lib";
import type { ConfigGroupId, ModalSlotId, PublishedContextTab, SectionId } from "#state";
import {
  activeChatId,
  CONFIG_GROUP_IDS,
  closeModal,
  getAvailableContextTabIds,
  getAvailableContextTabs,
  getContextTab,
  MODAL_SLOT_IDS,
  openConfigTo,
  openModal,
  revealContextPanel,
  SECTION_IDS,
  selectCharacter,
  selectChat,
  setActiveSection,
  setFocusMode,
  subscribeShellState,
} from "#state";
import type { NavResult, OrbNavCapabilities, OrbNavHandle } from "../lib/agent-bridge.ts";
import { markAgentNavigation } from "../lib/motion-stats.ts";
import { resolvePanelRequest } from "./panel-request.ts";

const OK: NavResult = { ok: true };
// One page at the server's CEILING covers a dev character library — enough to resolve any id/name without a
// keyset walk. This is a dev-drivability bridge, not a paged UI surface. (It already asked for 500 and was
// silently served 100 until 2026-08-09; the ask is the real bound now.)
const CHARACTER_NAV_PAGE_LIMIT = CHARACTER_LIST_MAX_LIMIT;
// How deep `openChat` resolves an id/title. `listChats` is keyset-paged (server ceiling 100), so this is one
// page, not a walk: a dev bridge resolves what a dev is looking at, and the refusal below states its reach
// rather than claiming the chat does not exist.
const CHAT_NAV_PAGE_LIMIT = CHAT_LIST_MAX_LIMIT;
// `openChat` targets that name a POSITION in the LIST instead of a chat: both mean its top row (see the
// arm's comment — `listChats` is newest-CONVERSATION-first, so top row === most recent).
const CHAT_LIST_POSITION_IDS = ["first", "latest"] as const;
const CHAT_LIST_POSITION_SENTINELS = new Set<string>(CHAT_LIST_POSITION_IDS);
// The SESSION sentinel — the room the shell is showing right now, read off the active-chat pointer and
// resolved WITHOUT the list. It is not a list position: a just-created room is an unlisted husk, so
// `latest` resolves a DIFFERENT chat than the one on screen (2026-08-15: a probe message landed in the
// wrong room because of exactly that). Kept distinct from the list sentinels so the two never share a path.
const ACTIVE_CHAT_SENTINEL = "current";
/** The full positional vocabulary `openChat` accepts, as reported by `capabilities().chatPositions`. */
const CHAT_POSITION_IDS = [...CHAT_LIST_POSITION_IDS, ACTIVE_CHAT_SENTINEL] as const;
const CHAT_ID_PREFIX = `${ID_PREFIX.chat}_`;

// How long `contextTab` waits for the CONTEXT panel to publish a vocabulary that RESOLVES the request
// (issue #656). It is a deadline on the panel's OWN mount signal, never a sleep: the common case returns on
// the very first store write. The bound exists so a genuinely absent panel — a `single`-kind context, a
// closed shell, a surface with no tabs at all — FAILS LOUDLY instead of hanging a probe. 2s is far above a
// mount+publish (one effect after paint) and far below the harness's 10s readiness gate, so a refusal from
// here is a real "this surface has no such tab", not a timing artifact.
const CONTEXT_TAB_SETTLE_MS = 2000;

function reject(kind: string, id: string, allowed: readonly string[]): NavResult {
  return { ok: false, reason: `unknown ${kind} "${id}" — expected one of: ${allowed.join(", ")}` };
}

function isSection(id: string): id is SectionId {
  return (SECTION_IDS as readonly string[]).includes(id);
}
function isModalSlot(id: string): id is ModalSlotId {
  return (MODAL_SLOT_IDS as readonly string[]).includes(id);
}
function isConfigGroup(id: string): id is ConfigGroupId {
  return (CONFIG_GROUP_IDS as readonly string[]).includes(id);
}

/** Select a chat AND put the shell where that chat is visible — the exact pair a chat-row click performs.
 *  Selecting alone reported `{ok:true}` while nothing on screen changed whenever the rail sat on another
 *  section (2026-08-01: `openChat` "succeeded" from the characters section and the caller went on to probe a
 *  pane that was never rendered). An arm that cannot take effect must compose what it needs or refuse; this
 *  one composes, exactly like its `openCharacter` sibling. */
function openChatIn(chatId: ChatId): void {
  markAgentNavigation();
  setActiveSection("chats");
  selectChat(chatId);
}

async function resolveDirectChatId(idOrTitle: string, trpc: Trpc, queryClient: QueryClient): Promise<ChatId | null> {
  if (!idOrTitle.startsWith(CHAT_ID_PREFIX)) {
    return null;
  }
  // The real tRPC boundary validates the complete TypeID. Prefix routing here only decides whether the
  // caller named an opaque id or a display title; an invalid id simply falls through to the honest miss.
  // @orb-gate-ignore caught-failure-ownership(promise:fetchQuery): a fetch failure is indistinguishable from an invalid id here — both collapse to the honest "not found" the caller already handles. Ends if this arm stops sharing its miss path with the invalid-id case.
  const chat = await queryClient.fetchQuery(trpc.chat.getChat.queryOptions({ chatId: idOrTitle as ChatId })).catch(() => null);
  return chat?.id ?? null;
}

/** The `"current"` arm: the room the shell is showing right now, read off the active-chat pointer with NO
 *  list query in the path. Refuses loudly on the landing surface — "nothing is open" is an answer, opening
 *  an arbitrary room is not. Re-selecting the already-active chat is idempotent, and the composed
 *  `setActiveSection("chats")` is the point when the rail has wandered elsewhere. */
function resolveActiveChat(): NavResult {
  const active = activeChatId();
  if (active === null) {
    return { ok: false, reason: `no chat is open — "${ACTIVE_CHAT_SENTINEL}" resolves the ACTIVE room and the shell is on the landing surface` };
  }
  openChatIn(active);
  return OK;
}

/** The LIST-resolved arms: the `first`/`latest` positional sentinels and the exact-display-title match,
 *  both against one keyset page of `listChats`. Split out of `openChat` so the session/id arms above it
 *  stay list-free and the whole verb stays under the complexity ceiling. */
async function resolveListedChat(idOrTitle: string, trpc: Trpc, queryClient: QueryClient): Promise<NavResult> {
  // The list may not be loaded yet (a fresh nav straight to open a chat) — fetch through the SAME
  // query the chat list uses, so this reads/populates the identical cache entry.
  // @orb-gate-ignore caught-failure-ownership(promise:fetchQuery): the rejection is converted into an explicit `ok:false` NavResult the caller consumes as the verdict. Ends if this arm stops returning the failure as a NavResult.
  const page = await queryClient.fetchQuery(trpc.chat.listChats.queryOptions({ limit: CHAT_NAV_PAGE_LIMIT })).catch(() => null);
  if (page === null) {
    return { ok: false, reason: "chat list query failed — cannot resolve the chat" };
  }
  const chats = page.items;
  // POSITIONAL sentinels — "open whatever chat is on top" without first learning an id. `listChats`
  // returns newest-CONVERSATION-first (#150 — the room you last spoke in, not the row last written) and
  // the list surface renders that order unsorted, so the top ROW and
  // the most-RECENT chat are the same row; both spellings resolve to it (a caller reaching for "latest"
  // and one reaching for "first" mean the same thing here, and inventing a difference would be a lie).
  // Reserved words by design: a chat literally titled "first"/"latest" is reachable by its id.
  if (CHAT_LIST_POSITION_SENTINELS.has(idOrTitle)) {
    const top = chats[0];
    if (top === undefined) {
      return { ok: false, reason: `no chat to open — "${idOrTitle}" resolves against the chat list, which is empty` };
    }
    openChatIn(top.id as ChatId);
    return OK;
  }
  // Fall back to an EXACT display-title match (the same derivation the list rows render), so a caller
  // can name a chat by what they see, not just its opaque id. Titles are NOT unique (the dev DB holds
  // two "Group UX review — 3 cast" chats) — REFUSE loudly on a multi-match rather than silently picking
  // one, so the caller disambiguates with the id (its unknown-target sibling's contract).
  const byTitle = chats.filter((c) => deriveChatTitle(c.title, c.participantNames) === idOrTitle);
  if (byTitle.length > 1) {
    return { ok: false, reason: `ambiguous title "${idOrTitle}" matches ${byTitle.length} chats — use the chat id` };
  }
  const singleTitle = byTitle[0];
  if (singleTitle !== undefined) {
    openChatIn(singleTitle.id as ChatId);
    return OK;
  }
  // The REFUSAL names its own reach: `listChats` is keyset-paged, so a miss means "not in the most
  // recent N", never "does not exist" — a dev bridge that says the wrong one of those costs an hour.
  return {
    ok: false,
    reason: `no chat matches id-or-title "${idOrTitle}" (searched the ${chats.length} most recent of ${page.totalCount} chat(s))`,
  };
}

/** The outcome of matching a requested tab name against ONE reading of the published vocabulary: the stable
 *  id, the ids a label matched more than once, or nothing (which may only mean "not published yet"). */
type ContextTabMatch =
  | { readonly kind: "resolved"; readonly id: string }
  | { readonly kind: "ambiguous"; readonly ids: readonly string[] }
  | { readonly kind: "unmatched"; readonly available: readonly PublishedContextTab[] };

/** Match `requested` (a stable id OR a visible label, case-insensitively) against the tabs published RIGHT
 *  NOW. Pure over one reading — the caller decides whether an `unmatched` is a typo or an unmounted panel. */
function matchContextTab(requested: string): ContextTabMatch {
  const available = getAvailableContextTabs();
  const exactId = available.find((tab) => tab.id === requested);
  if (exactId !== undefined) {
    return { kind: "resolved", id: exactId.id };
  }
  const normalized = requested.toLocaleLowerCase();
  const byLabel = available.filter((tab) => tab.label.toLocaleLowerCase() === normalized);
  if (byLabel.length > 1) {
    return { kind: "ambiguous", ids: byLabel.map((tab) => tab.id) };
  }
  const single = byLabel[0];
  return single === undefined ? { kind: "unmatched", available } : { kind: "resolved", id: single.id };
}

/** Wait until `read()` returns a value, or give up at `deadlineMs` and return `null`.
 *
 *  DRIVEN BY THE STORE'S OWN CHANGE SIGNAL, NEVER A SLEEP (issue #656): a tabbed CONTEXT surface publishes
 *  its ids from a mount effect, so "the panel is ready" is a store write, and a fixed sleep would be exactly
 *  the settle-guess that made the bug survivable-looking. The deadline is the loud-failure floor. */
async function awaitShellValue<T>(read: () => T | null, deadlineMs: number): Promise<T | null> {
  const immediate = read();
  if (immediate !== null) {
    return immediate;
  }
  return await new Promise<T | null>((resolve) => {
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: T | null): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe?.();
      unsubscribe = null;
      resolve(value);
    };
    timer = setTimeout((): void => finish(null), deadlineMs);
    unsubscribe = subscribeShellState((): void => {
      const value = read();
      if (value !== null) {
        finish(value);
      }
    });
  });
}

/** The tab the mounted panel is ACTUALLY showing, or `null` when no tabbed surface is mounted.
 *
 *  This is `useContextTabSelection`'s rule read from the outside, not a second copy of it: that resolver
 *  shows the stored `contextTab` only while it is still VISIBLE (published by the mounted surface) and
 *  otherwise falls back to the default/first tab. So a stored id the surface publishes IS the active tab —
 *  and a stored id it does not publish is precisely the fell-back case this arm must never call `ok`. */
function activeContextTab(): string | null {
  const published = getAvailableContextTabIds();
  if (published.length === 0) {
    return null;
  }
  const stored = getContextTab();
  return stored !== null && published.includes(stored) ? stored : null;
}

/** THE CONTEXT-TAB ARM (issue #656 — the false `ok:true` that poisoned every one-call probe chain).
 *
 *  WHAT WENT WRONG: the old arm validated the request against the published tab-id set and, when that set
 *  was EMPTY, treated "nothing to validate against" as permission to dispatch — an empty set validates
 *  vacuously. But the set is empty for a whole beat after `--open-chat`, because the panel publishes from a
 *  MOUNT EFFECT; so the first call wrote the raw LABEL ("This chat") as the stored tab id, the resolver saw
 *  an id it does not publish, fell back to Members — and the bridge returned `ok:true`. Every design-audit
 *  and snap chain that navigated with a single call censused MEMBERS while reporting the This-chat surface.
 *
 *  THE CONTRACT NOW: a navigation step that cannot verify its landing must not report success. Resolve
 *  against a vocabulary that EXISTS (waiting on the panel's own publish, bounded), then verify the tab the
 *  panel actually landed on. Every failure is distinguishable by its reason — an empty name, an ambiguous
 *  label, an unknown name against a published set, a panel that never published, and a landing that
 *  disagrees with the request are five different sentences, because a probe's next move differs for each. */
async function resolveContextTab(name: string): Promise<NavResult> {
  const requested = name.trim();
  if (requested === "") {
    return { ok: false, reason: "context tab name is empty" };
  }
  let match = matchContextTab(requested);
  if (match.kind === "unmatched") {
    // The panel may simply not be mounted yet. OPEN it — with NO tab argument, because writing the
    // unresolved request is the false-ok itself — and wait for its own publish to resolve the name. The
    // wait also covers a set that GROWS after mount (a game chat's rpg tabs land with their query).
    markAgentNavigation();
    revealContextPanel();
    match = (await awaitShellValue((): ContextTabMatch | null => {
      const attempt = matchContextTab(requested);
      return attempt.kind === "unmatched" ? null : attempt;
    }, CONTEXT_TAB_SETTLE_MS)) ?? { kind: "unmatched", available: getAvailableContextTabs() };
  }
  if (match.kind === "ambiguous") {
    return { ok: false, reason: `ambiguous context tab label "${requested}" matches: ${match.ids.join(", ")}` };
  }
  if (match.kind === "unmatched") {
    return {
      ok: false,
      reason:
        match.available.length === 0
          ? `no tabbed context surface published any tabs within ${CONTEXT_TAB_SETTLE_MS}ms — "${requested}" could not be resolved, so the panel was NOT switched`
          : `unknown context tab "${requested}" — the mounted context surface offers: ${match.available.map((tab) => `${tab.id} (${tab.label})`).join(", ")}`,
    };
  }
  // COMPOSE the reveal, never a bare request (the `openChatIn` precedent: an arm that cannot take effect
  // must open what it needs). `setContextTab` alone left a collapsed panel unmounted, so the stored tab
  // was read by nothing — `revealContextPanel` opens the panel AND sets the tab, so the switch is visible.
  const resolved = match.id;
  markAgentNavigation();
  revealContextPanel(resolved);
  // THE LANDING CHECK. Bounded rather than immediate because a reveal can re-mount the panel (the sheet/dock
  // regimes), which republishes and momentarily reports nothing active.
  const landed = await awaitShellValue((): true | null => (activeContextTab() === resolved ? true : null), CONTEXT_TAB_SETTLE_MS);
  if (landed === null) {
    return {
      ok: false,
      reason: `context tab "${requested}" resolved to "${resolved}" but the mounted panel settled on "${activeContextTab() ?? "no tabbed surface"}"`,
    };
  }
  return OK;
}

/** Build the `__orb.nav` handle. Called from the composition root under IS_DEV; `trpc` + `queryClient`
 *  are the same singletons the app renders through, so `openChat`'s title resolution reads the very
 *  cache the chat list populates. */
export function buildAgentNav(trpc: Trpc, queryClient: QueryClient): OrbNavHandle {
  return {
    capabilities(): OrbNavCapabilities {
      const contextTabs = [...getAvailableContextTabIds()];
      return {
        sections: [...SECTION_IDS],
        modalSlots: [...MODAL_SLOT_IDS],
        configGroups: [...CONFIG_GROUP_IDS],
        contextTabs,
        contextTabNames: [...getAvailableContextTabs()],
        contextTabsPublished: contextTabs.length > 0,
        chatPositions: [...CHAT_POSITION_IDS],
      };
    },
    section(id: string): NavResult {
      if (!isSection(id)) {
        return reject("section", id, SECTION_IDS);
      }
      markAgentNavigation();
      setActiveSection(id);
      return OK;
    },
    openModal(slot: string): NavResult {
      if (!isModalSlot(slot)) {
        return reject("modal slot", slot, MODAL_SLOT_IDS);
      }
      markAgentNavigation();
      openModal(slot);
      return OK;
    },
    openConfig(group: string, sub?: string): NavResult {
      if (!isConfigGroup(group)) {
        return reject("config group", group, CONFIG_GROUP_IDS);
      }
      markAgentNavigation();
      // The EXACT deep link a feature fires ("configure memory" from a chat surface lands ON the memory
      // section): the section switch, the group expansion and the anchor landing are one store write.
      openConfigTo(group, sub);
      return OK;
    },
    async contextTab(name: string): Promise<NavResult> {
      return await resolveContextTab(name);
    },
    async openChat(idOrTitle: string): Promise<NavResult> {
      // RESOLUTION ORDER, cheapest and most-specific first — each tier is a strictly narrower claim:
      //   1. "current" — the SESSION pointer. No query at all. It exists because `latest` resolves against
      //      LISTED chats, so a room created seconds ago (an unlisted husk until the list refetches) makes
      //      `latest` name a DIFFERENT chat than the one on screen (2026-08-15: a probe message landed in
      //      the wrong room). A caller reaching for "the room I am in" must never get a list guess.
      //   2. an opaque chat id — a direct read, so old/hidden-husk/temporary chats stay agent-operable
      //      (a bounded recent-page scan made a perfectly valid id unreachable).
      //   3. the LIST arms — `first`/`latest` and the exact display title.
      // The sentinels are RESERVED WORDS by design: a chat literally titled "current"/"first"/"latest" is
      // reachable by its id, exactly as the title arm's ambiguity refusal points a caller at the id.
      if (idOrTitle === ACTIVE_CHAT_SENTINEL) {
        return resolveActiveChat();
      }
      const directId = await resolveDirectChatId(idOrTitle, trpc, queryClient);
      if (directId !== null) {
        openChatIn(directId);
        return OK;
      }
      return await resolveListedChat(idOrTitle, trpc, queryClient);
    },
    async openCharacter(idOrName: string): Promise<NavResult> {
      // The characters-section twin of openChat: switch the rail to Characters + select the character
      // via the SAME store action a library-row click calls (selectCharacter), never a parallel path.
      //
      // NEITHER ARM SCANS A BOUNDED PAGE ANY MORE (2026-08-13). The id arm is a direct `character.get` (a
      // read of the one row, which no page ceiling can hide), and the name arm is a SERVER SEARCH — a
      // `.find()` over one recency page made "no character matches" mean "not in the first N", which is
      // the wrong one of those for a bridge to say.
      //
      // The id arm is PREFIX-GATED like `resolveDirectChatId`: probing `character.get` with a display
      // name 404s and react-query retries it — six console errors per name-based nav, reddening every
      // harness run that uses this bridge. Prefix routing decides id-vs-name; the tRPC boundary still
      // validates the complete TypeID, and an invalid id falls through to the honest name arm.
      if (idOrName.startsWith(`${ID_PREFIX.character}_`)) {
        // @orb-gate-ignore caught-failure-ownership(promise:fetchQuery): a fetch failure is indistinguishable from an invalid id — the id arm falls through to the honest name-search arm below, same as resolveDirectChatId. Ends if this arm stops sharing its miss path with the invalid-id case.
        const byId = await queryClient.fetchQuery(trpc.character.get.queryOptions({ characterId: idOrName as CharacterId })).catch(() => null);
        if (byId !== null) {
          markAgentNavigation();
          setActiveSection("characters");
          selectCharacter(byId.id);
          return OK;
        }
      }
      // @orb-gate-ignore caught-failure-ownership(promise:fetchQuery): the rejection is converted into an explicit `ok:false` NavResult the caller consumes as the verdict. Ends if this arm stops returning the failure as a NavResult.
      const page = await queryClient.fetchQuery(trpc.character.list.queryOptions({ limit: CHARACTER_NAV_PAGE_LIMIT, search: idOrName })).catch(() => null);
      if (page === null) {
        return { ok: false, reason: "character list query failed — cannot resolve the character" };
      }
      // Names are NOT unique — REFUSE loudly on a multi-match (openChat's ambiguity contract), so the
      // caller disambiguates with the character id. The EXACT-name test still runs here: the server's
      // search is a substring match across name/handle/pitch/tags, which is the right net to cast and the
      // wrong one to select from.
      const byName = page.items.filter((ch) => ch.name === idOrName);
      if (byName.length > 1) {
        return { ok: false, reason: `ambiguous name "${idOrName}" matches ${byName.length} characters — use the character id` };
      }
      const singleName = byName[0];
      if (singleName !== undefined) {
        markAgentNavigation();
        setActiveSection("characters");
        selectCharacter(singleName.id as CharacterId);
        return OK;
      }
      return { ok: false, reason: `no character matches id-or-name "${idOrName}" (searched the whole library; ${String(page.totalCount)} match(es))` };
    },
    closeModal(): NavResult {
      markAgentNavigation();
      closeModal();
      return OK;
    },
    async panel(name: string, mode: string): Promise<NavResult> {
      return await resolvePanelRequest(name, mode);
    },
    focus(on: boolean): NavResult {
      markAgentNavigation();
      setFocusMode(on);
      return OK;
    },
  };
}
