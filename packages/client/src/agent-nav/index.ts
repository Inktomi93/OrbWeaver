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
import type { ContributorRegistry } from "#lib";
import { deriveChatTitle } from "#lib";
import type { ConfigGroupId, ConfigSectionContribution, ModalSlotId, SectionId } from "#state";
import {
  activeChatId,
  CONFIG_GROUP_IDS,
  closeModal,
  getAvailableContextTabIds,
  getAvailableContextTabs,
  MODAL_SLOT_IDS,
  openConfigTo,
  openModal,
  SECTION_IDS,
  selectCharacter,
  selectChat,
  setActiveSection,
  setFocusMode,
} from "#state";
import type { NavResult, OrbNavCapabilities, OrbNavHandle } from "../lib/agent-bridge.ts";
import { markAgentNavigation } from "../lib/motion-stats.ts";
import { resolvePanelRequest } from "./panel-request.ts";
import { resolveConfigTarget } from "./resolve-config-target.ts";
import { resolveContextTab } from "./resolve-context-tab.ts";

// Re-exported for `tests/client/agent-nav/resolve-config-target.dom.test.ts` — the export map's `"./*":
// "./src/*/index.ts"` (client package.json) means `resolve-config-target.ts` has no subpath a test can
// reach directly, and this pure function is the unit that earns its own coverage apart from the bridge's
// dispatch-through-the-store proof below.
export { resolveConfigTarget } from "./resolve-config-target.ts";

/** What `buildAgentNav` needs to validate a `sub`/`setting` address (#1638) — the config-section registry
 *  the compose door assembles, which the composition tier's OWN modules may not import
 *  (`client-compose-door-only` reserves `compose/` for main.tsx/routes/router.tsx/a compose/ sibling; this
 *  file is neither). So the registry rides down as a LAZY thunk instead: `main.tsx` dynamic-`import()`s
 *  `compose/config-sections.ts` (never a static import — that would drag the whole feature graph the
 *  registry reaches into whichever chunk imports it, the #433 boot-eval-split defect this bridge's OWN
 *  `agent-handles/index.ts` exists to avoid) and hands the resolved registry down through
 *  `installAgentHandles` → here. `null` = not loaded yet (a real race at cold boot: this module's chunk can
 *  resolve before or after `compose/config-sections.ts`'s), which `openConfig` refuses loudly rather than
 *  validating vacuously — the same posture `contextTab`'s #656 fix took for its own empty-vocabulary race,
 *  except this one needs no bounded wait: the registry is a plain module-scope object, never populated by a
 *  mount effect, so once the thunk returns non-null it is final for the tab's lifetime. Optional so every
 *  existing call site (every unit test, `agent-nav/panel-request.ct.tsx`'s story) keeps validating `sub`/
 *  `setting` structurally-only, exactly as before #1638. */
type ResolveConfigSections = () => ContributorRegistry<ConfigSectionContribution> | null;

/** #1638's registry-backed half of `openConfig`'s validation, split out so the arm itself stays under the
 *  complexity ceiling. `null` = the address is fine to dispatch; otherwise the refusal to return verbatim. */
function validateConfigSubAddress(
  group: ConfigGroupId,
  sub: string,
  setting: string | undefined,
  resolveConfigSections: ResolveConfigSections | undefined,
): NavResult | null {
  // No thunk injected at all (every pre-#1638 call site — a unit test, a story) ⇒ validate structurally
  // only, byte-identical to the pre-#1638 behavior. Distinct from "injected but not yet loaded" below,
  // which DOES refuse: an omitted thunk is a caller who never asked for this validation, a `null` return
  // from a REAL thunk is the boot-time race this whole arm exists to refuse loudly instead of vacuously.
  if (resolveConfigSections === undefined) {
    return null;
  }
  const registry = resolveConfigSections();
  if (registry === null) {
    return {
      ok: false,
      reason: `config sections not loaded yet — retry openConfig("${group}", "${sub}"${setting === undefined ? "" : `, "${setting}"`}) in a moment`,
    };
  }
  const resolved = resolveConfigTarget(group, sub, setting, registry);
  return resolved.ok ? null : resolved;
}

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
  // @orb-waive caught-failure-ownership(queryClient.fetchQuery): a fetch failure is indistinguishable from an invalid id here — both collapse to the honest "not found" the caller already handles. Ends if this arm stops sharing its miss path with the invalid-id case.
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
  // @orb-waive caught-failure-ownership(queryClient.fetchQuery): the rejection is converted into an explicit `ok:false` NavResult the caller consumes as the verdict. Ends if this arm stops returning the failure as a NavResult.
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
  // two "Group UX review — 3 characters" chats) — REFUSE loudly on a multi-match rather than silently picking
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
 *  cache the chat list populates. `resolveConfigSections` is the #1638 injection arm (see
 *  {@link ResolveConfigSections}) — optional so every pre-#1638 call site is unaffected. */
export function buildAgentNav(trpc: Trpc, queryClient: QueryClient, resolveConfigSections?: ResolveConfigSections): OrbNavHandle {
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
    openConfig(group: string, sub?: string, setting?: string): NavResult {
      if (!isConfigGroup(group)) {
        return reject("config group", group, CONFIG_GROUP_IDS);
      }
      // THE LEAF IS THE THIRD PART OF THE ADDRESS, and it used to be DROPPED (#1176, found by #926): the
      // store's `openConfigTo` has taken `(group, sub?, setting?)` since #866 S3 and the copy-link grammar
      // spells all three (`/config?to=group.sub.setting`), while this arm's signature stopped at `sub` — so
      // a drive asking for a knob landed on its section and the bridge reported `ok:true`. A bridge that
      // silently answers a NARROWER question than it was asked is the lying-instrument class this handle
      // exists to avoid, so the widening that used to be silent is now the refusal below.
      //
      // `sub`/`setting` are not a closed vocabulary here and cannot be: the only runtime index of the real
      // sections and leaves is the config-section registry assembled at the COMPOSE DOOR, which the
      // composition tier's bridge may not import (`client-compose-door-only`, and #433 keeps that graph out
      // of the boot chunk). What IS decidable without it is the address's SHAPE — a leaf is addressed
      // through its section (`ConfigSettingRef.sub` is required for exactly this reason), so a leaf handed
      // over without one names nothing and is refused instead of landing one level up.
      if (setting !== undefined && sub === undefined) {
        return { ok: false, reason: `setting "${setting}" needs its section — call openConfig("${group}", <sub>, "${setting}")` };
      }
      // #1638 — validating that `sub`/`setting` NAME a real section/leaf, over the registry injected at
      // install time (see `ResolveConfigSections`'s doc). `sub === undefined` needs no lookup — a
      // group-only address works identically whether or not the registry has finished loading — the
      // common case during the cold-boot race. A `sub` handed over BEFORE the registry loads refuses
      // loudly naming the race, never silently landing on the section like the pre-#1638 code did.
      if (sub !== undefined) {
        const refusal = validateConfigSubAddress(group, sub, setting, resolveConfigSections);
        if (refusal !== null) {
          return refusal;
        }
      }
      markAgentNavigation();
      // The EXACT deep link a feature fires ("configure memory" from a chat surface lands ON the memory
      // section): the section switch, the group expansion and the anchor landing are one store write.
      openConfigTo(group, sub, setting);
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
        // @orb-waive caught-failure-ownership(queryClient.fetchQuery): a fetch failure is indistinguishable from an invalid id — the id arm falls through to the honest name-search arm below, same as resolveDirectChatId. Ends if this arm stops sharing its miss path with the invalid-id case.
        const byId = await queryClient.fetchQuery(trpc.character.get.queryOptions({ characterId: idOrName as CharacterId })).catch(() => null);
        if (byId !== null) {
          markAgentNavigation();
          setActiveSection("characters");
          selectCharacter(byId.id);
          return OK;
        }
      }
      // @orb-waive caught-failure-ownership(queryClient.fetchQuery): the rejection is converted into an explicit `ok:false` NavResult the caller consumes as the verdict. Ends if this arm stops returning the failure as a NavResult.
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
