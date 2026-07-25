// The dev-only SPA-navigation bridge implementation (`__orb.nav`). Lives at the composition tier —
// sibling to main.tsx, NOT under routes/ (the route-import gate reserves feature-front-door imports for
// app-root.tsx) — because it wires the app's client-state navigation actions together, and the lib/ floor
// that homes agent-bridge.ts may not import #state/#features/#data. So the handle's IMPL is built here and
// injected into installAgentDebugHandle. Every arm calls the EXACT store action the real UI calls
// (setActiveSection, openModal, openSettingsTo, setContextTab, selectChat) — never a parallel mutation
// path — and validates ids against the canonical vocabulary tuples, returning a loud {ok:false} on a
// bad target instead of a silent no-op.

import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc } from "#data";
import { deriveChatTitle } from "#features/chat";
import type { ModalSlotId, SectionId, SettingsCategoryId } from "#state";
import { closeModal, MODAL_SLOT_IDS, openModal, openSettingsTo, SECTION_IDS, SETTINGS_CATEGORY_IDS, selectChat, setActiveSection, setContextTab } from "#state";
import type { NavResult, OrbNavHandle } from "../lib/agent-bridge";

const OK: NavResult = { ok: true };

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
      const chats = await queryClient.fetchQuery(trpc.chat.listChats.queryOptions({})).catch(() => null);
      if (chats === null) {
        return { ok: false, reason: "chat list query failed — cannot resolve the chat" };
      }
      const byId = chats.find((c) => c.id === idOrTitle);
      if (byId) {
        selectChat(byId.id);
        return OK;
      }
      // Fall back to an EXACT display-title match (the same derivation the list rows render), so a caller
      // can name a chat by what they see, not just its opaque id.
      const byTitle = chats.find((c) => deriveChatTitle(c.title, c.participantNames) === idOrTitle);
      if (byTitle) {
        selectChat(byTitle.id as ChatId);
        return OK;
      }
      return { ok: false, reason: `no chat matches id-or-title "${idOrTitle}" (${chats.length} chat(s) in list)` };
    },
    closeModal(): NavResult {
      closeModal();
      return OK;
    },
  };
}
