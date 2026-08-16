// The dev-only SPA-navigation bridge implementation (`__orb.nav`). Lives at the composition tier —
// sibling to main.tsx, NOT under routes/ (the route-import gate reserves feature-front-door imports for
// app-root.tsx) — because it wires the app's client-state navigation actions together, and the lib/ floor
// that homes agent-bridge.ts may not import #state/#features/#data. So the handle's IMPL is built here and
// injected into installAgentDebugHandle. Every arm calls the EXACT store action the real UI calls
// (setActiveSection, openModal, openSettingsTo, revealContextPanel, selectChat) — never a parallel mutation
// path — and validates ids against the canonical vocabulary tuples (the context tab against the mounted
// surface's PUBLISHED ids), returning a loud {ok:false} on a bad target instead of a silent no-op.

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc } from "#data";
import { deriveChatTitle } from "#lib";
import type { ModalSlotId, SectionId, SettingsCategoryId } from "#state";
import {
  activeChatId,
  closeModal,
  getAvailableContextTabIds,
  getAvailableContextTabs,
  MODAL_SLOT_IDS,
  openModal,
  openSettingsTo,
  revealContextPanel,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  selectCharacter,
  selectChat,
  setActiveSection,
} from "#state";
import type { NavResult, OrbNavCapabilities, OrbNavHandle } from "../lib/agent-bridge.ts";
import { markAgentNavigation } from "../lib/motion-stats.ts";

const OK: NavResult = { ok: true };
// One page at the server's CEILING covers a dev character library — enough to resolve any id/name without a
// keyset walk. This is a dev-drivability bridge, not a paged UI surface. (It already asked for 500 and was
// silently served 100 until 2026-08-09; the ask is the real bound now.)
const CHARACTER_NAV_PAGE_LIMIT = CHARACTER_LIST_MAX_LIMIT;
// How deep `openChat` resolves an id/title. `listChats` is keyset-paged (server ceiling 100), so this is one
// page, not a walk: a dev bridge resolves what a dev is looking at, and the refusal below states its reach
// rather than claiming the chat does not exist.
const CHAT_NAV_PAGE_LIMIT = 100;
// `openChat` targets that name a POSITION in the LIST instead of a chat: both mean its top row (see the
// arm's comment — `listChats` is newest-updated-first, so top row === most recent).
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

function reject(kind: string, id: string, allowed: readonly string[]): NavResult {
  return { ok: false, reason: `unknown ${kind} "${id}" — expected one of: ${allowed.join(", ")}` };
}

function isSection(id: string): id is SectionId {
  return (SECTION_IDS as readonly string[]).includes(id);
}
function isModalSlot(id: string): id is ModalSlotId {
  return (MODAL_SLOT_IDS as readonly string[]).includes(id);
}
function isSettingsCategory(id: string): id is SettingsCategoryId {
  return (SETTINGS_CATEGORY_IDS as readonly string[]).includes(id);
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
  const page = await queryClient.fetchQuery(trpc.chat.listChats.queryOptions({ limit: CHAT_NAV_PAGE_LIMIT })).catch(() => null);
  if (page === null) {
    return { ok: false, reason: "chat list query failed — cannot resolve the chat" };
  }
  const chats = page.items;
  // POSITIONAL sentinels — "open whatever chat is on top" without first learning an id. `listChats`
  // returns newest-updated-first and the list surface renders that order unsorted, so the top ROW and
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
        settingsCategories: [...SETTINGS_CATEGORY_IDS],
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
    openSettings(category: string): NavResult {
      if (!isSettingsCategory(category)) {
        return reject("settings category", category, SETTINGS_CATEGORY_IDS);
      }
      markAgentNavigation();
      openSettingsTo(category);
      return OK;
    },
    contextTab(name: string): NavResult {
      const requested = name.trim();
      if (requested === "") {
        return { ok: false, reason: "context tab name is empty" };
      }
      // The context tab is a cross-surface OPAQUE request, but the mounted surface publishes its tab ids
      // (`useContextTabSelection` → `publishContextTabIds`). When that set is KNOWN (a tabbed context panel
      // is mounted), a name outside it is a typo, not a tab — refuse loudly, exactly like the closed-vocab
      // arms above, instead of writing the request and reporting a false `ok` (the 2026-08-09 + 2026-08-14
      // drives both hit this: `{ok:true}` with the tab never switching). When the set is EMPTY the panel is
      // closed / single-kind, so there is nothing to validate against — best-effort dispatch stands.
      const available = getAvailableContextTabs();
      const exactId = available.find((tab) => tab.id === requested);
      const normalized = requested.toLocaleLowerCase();
      const byLabel = available.filter((tab) => tab.label.toLocaleLowerCase() === normalized);
      if (exactId === undefined && byLabel.length > 1) {
        return { ok: false, reason: `ambiguous context tab label "${requested}" matches: ${byLabel.map((tab) => tab.id).join(", ")}` };
      }
      const resolved = exactId?.id ?? byLabel[0]?.id;
      if (available.length > 0 && resolved === undefined) {
        return {
          ok: false,
          reason: `unknown context tab "${requested}" — the mounted context surface offers: ${available.map((tab) => `${tab.id} (${tab.label})`).join(", ")}`,
        };
      }
      // COMPOSE the reveal, never a bare request (the `openChatIn` precedent: an arm that cannot take effect
      // must open what it needs). `setContextTab` alone left a collapsed panel unmounted, so the stored tab
      // was read by nothing — `revealContextPanel` opens the panel AND sets the tab, so the switch is visible.
      markAgentNavigation();
      revealContextPanel(resolved ?? requested);
      return OK;
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
        const byId = await queryClient.fetchQuery(trpc.character.get.queryOptions({ characterId: idOrName as CharacterId })).catch(() => null);
        if (byId !== null) {
          markAgentNavigation();
          setActiveSection("characters");
          selectCharacter(byId.id);
          return OK;
        }
      }
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
  };
}
