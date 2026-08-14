// The dev-only SPA-navigation bridge implementation (`__orb.nav`). Lives at the composition tier —
// sibling to main.tsx, NOT under routes/ (the route-import gate reserves feature-front-door imports for
// app-root.tsx) — because it wires the app's client-state navigation actions together, and the lib/ floor
// that homes agent-bridge.ts may not import #state/#features/#data. So the handle's IMPL is built here and
// injected into installAgentDebugHandle. Every arm calls the EXACT store action the real UI calls
// (setActiveSection, openModal, openSettingsTo, setContextTab, selectChat) — never a parallel mutation
// path — and validates ids against the canonical vocabulary tuples, returning a loud {ok:false} on a
// bad target instead of a silent no-op.

import { CHARACTER_LIST_MAX_LIMIT } from "@orb/contracts/character";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc } from "#data";
import { deriveChatTitle } from "#lib";
import type { ModalSlotId, SectionId, SettingsCategoryId } from "#state";
import {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  openSettingsTo,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  selectCharacter,
  selectChat,
  setActiveSection,
  setContextTab,
} from "#state";
import type { NavResult, OrbNavHandle } from "../lib/agent-bridge.ts";

const OK: NavResult = { ok: true };
// One page at the server's CEILING covers a dev character library — enough to resolve any id/name without a
// keyset walk. This is a dev-drivability bridge, not a paged UI surface. (It already asked for 500 and was
// silently served 100 until 2026-08-09; the ask is the real bound now.)
const CHARACTER_NAV_PAGE_LIMIT = CHARACTER_LIST_MAX_LIMIT;
// How deep `openChat` resolves an id/title. `listChats` is keyset-paged (server ceiling 100), so this is one
// page, not a walk: a dev bridge resolves what a dev is looking at, and the refusal below states its reach
// rather than claiming the chat does not exist.
const CHAT_NAV_PAGE_LIMIT = 100;
// `openChat` targets that name a POSITION in the list instead of a chat: both mean its top row (see the
// arm's comment — `listChats` is newest-updated-first, so top row === most recent).
const CHAT_POSITION_SENTINELS = new Set(["first", "latest"]);

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
  setActiveSection("chats");
  selectChat(chatId);
}

/** Build the `__orb.nav` handle. Called from the composition root under IS_DEV; `trpc` + `queryClient`
 *  are the same singletons the app renders through, so `openChat`'s title resolution reads the very
 *  cache the chat list populates. */
export function buildAgentNav(trpc: Trpc, queryClient: QueryClient): OrbNavHandle {
  return {
    section(id: string): NavResult {
      if (!isSection(id)) {
        return reject("section", id, SECTION_IDS);
      }
      setActiveSection(id);
      return OK;
    },
    openModal(slot: string): NavResult {
      if (!isModalSlot(slot)) {
        return reject("modal slot", slot, MODAL_SLOT_IDS);
      }
      openModal(slot);
      return OK;
    },
    openSettings(category: string): NavResult {
      if (!isSettingsCategory(category)) {
        return reject("settings category", category, SETTINGS_CATEGORY_IDS);
      }
      openSettingsTo(category);
      return OK;
    },
    contextTab(name: string): NavResult {
      // The context tab is an opaque request the active surface interprets — no closed vocabulary to
      // validate against, so a non-empty name always dispatches.
      if (name === "") {
        return { ok: false, reason: "context tab name is empty" };
      }
      setContextTab(name);
      return OK;
    },
    async openChat(idOrTitle: string): Promise<NavResult> {
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
      if (CHAT_POSITION_SENTINELS.has(idOrTitle)) {
        const top = chats[0];
        if (top === undefined) {
          return { ok: false, reason: `no chat to open — "${idOrTitle}" resolves against the chat list, which is empty` };
        }
        openChatIn(top.id as ChatId);
        return OK;
      }
      const byId = chats.find((c) => c.id === idOrTitle);
      if (byId) {
        openChatIn(byId.id);
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
    },
    async openCharacter(idOrName: string): Promise<NavResult> {
      // The characters-section twin of openChat: switch the rail to Characters + select the character
      // via the SAME store action a library-row click calls (selectCharacter), never a parallel path.
      //
      // NEITHER ARM SCANS A BOUNDED PAGE ANY MORE (2026-08-13). The id arm is a direct `character.get` (a
      // read of the one row, which no page ceiling can hide), and the name arm is a SERVER SEARCH — a
      // `.find()` over one recency page made "no character matches" mean "not in the first N", which is
      // the wrong one of those for a bridge to say.
      const byId = await queryClient.fetchQuery(trpc.character.get.queryOptions({ characterId: idOrName as CharacterId })).catch(() => null);
      if (byId !== null) {
        setActiveSection("characters");
        selectCharacter(byId.id);
        return OK;
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
        setActiveSection("characters");
        selectCharacter(singleName.id as CharacterId);
        return OK;
      }
      return { ok: false, reason: `no character matches id-or-name "${idOrName}" (searched the whole library; ${String(page.totalCount)} match(es))` };
    },
    closeModal(): NavResult {
      closeModal();
      return OK;
    },
  };
}
