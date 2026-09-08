// Unit: `buildAgentNav` (agent-nav/index.ts) — the `__orb.nav` dev-navigation bridge. Proves the
// registered surface actually DISPATCHES: every arm calls the EXACT store action a real UI click calls
// (spied via `@orb/client/state`, never a parallel mutation path — the file header's own invariant), and
// every closed-vocabulary arm REFUSES loudly on an unknown target instead of a silent no-op. `trpc`/
// `queryClient` are faked to the minimal shape `fetchQuery(queryOptions())` needs — this bridge does no
// I/O of its own beyond that read, so a real server is not required to prove the dispatch contract.

import { buildAgentNav } from "@orb/client/agent-nav";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigGroupId, ConfigSectionContribution } from "@orb/client/state";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn needs the module namespace object to wrap the REAL exported action (the dispatch-proof this file exists for).
import * as state from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClient as RealQueryClient } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_agentnav_a");
const CHARACTER_ID = castId<CharacterId>("character_agentnav_a");

// Minimal fake of the `Trpc` proxy — only the `.queryOptions()` shape `queryClient.fetchQuery` needs.
function fakeTrpc(
  chats: { readonly id: ChatId; readonly title: string | null; readonly participantNames: readonly string[] }[],
  characters: { readonly id: CharacterId; readonly name: string }[],
  directChats: { readonly id: ChatId }[] = chats,
  // biome-ignore lint/suspicious/noExplicitAny: the return is a minimal structural fake of the full Trpc proxy — the bridge only touches the branches built below.
): any {
  return {
    chat: {
      getChat: {
        queryOptions: (args: { readonly chatId: ChatId }): { queryKey: unknown[]; queryFn: () => Promise<(typeof directChats)[number]> } => ({
          queryKey: ["chat", "getChat", args],
          queryFn: (): Promise<(typeof directChats)[number]> => {
            const match = directChats.find((chat) => chat.id === args.chatId);
            if (match === undefined) {
              return Promise.reject(new Error("not found"));
            }
            return Promise.resolve(match);
          },
        }),
      },
      listChats: {
        queryOptions: (args: unknown): { queryKey: unknown[]; queryFn: () => Promise<{ items: typeof chats; totalCount: number }> } => ({
          queryKey: ["chat", "listChats", args],
          queryFn: () => Promise.resolve({ items: chats, totalCount: chats.length }),
        }),
      },
    },
    character: {
      get: {
        queryOptions: (args: { readonly characterId: CharacterId }): { queryKey: unknown[]; queryFn: () => Promise<(typeof characters)[number] | null> } => ({
          queryKey: ["character", "get", args],
          queryFn: () => Promise.resolve(characters.find((c) => c.id === args.characterId) ?? null),
        }),
      },
      list: {
        queryOptions: (args: {
          readonly search?: string;
        }): { queryKey: unknown[]; queryFn: () => Promise<{ items: typeof characters; totalCount: number }> } => ({
          queryKey: ["character", "list", args],
          queryFn: () => Promise.resolve({ items: characters, totalCount: characters.length }),
        }),
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("capabilities() exposes canonical targets and the mounted surface's published context tabs", () => {
  state.publishContextTabIds(["runs", "setup"]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.capabilities()).toEqual({
    sections: ["home", "chats", "characters", "corpus", "config", "extensions", "databank", "presets", "refinery", "analytics"],
    modalSlots: [
      "command",
      "newChat",
      "you",
      "addDocument",
      "reauth",
      "imagine",
      "imageDetail",
      "imageEdit",
      "pluginDialog",
      "pluginCommandArgs",
      "savedRosters",
    ],
    // The closed config-group vocabulary (#866 S1, owner fork F-1): the nine settings groups + the four collections.
    configGroups: [
      "personas",
      "appearance",
      "chat-behavior",
      "workloads",
      "backup",
      "connections",
      "automation",
      "admin",
      "tags",
      "regex",
      "worldInfo",
      "rosterPreset",
      "plugins",
    ],
    contextTabs: ["runs", "setup"],
    contextTabNames: [
      { id: "runs", label: "runs" },
      { id: "setup", label: "setup" },
    ],
    contextTabsPublished: true,
    chatPositions: ["first", "latest", "current"],
  });
});

test("section() dispatches setActiveSection with the exact id and returns ok:true", () => {
  const spy = vi.spyOn(state, "setActiveSection");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = nav.section("characters");

  expect(result).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("characters");
});

test("section() REFUSES an unknown section id — no store call, a loud ok:false", () => {
  const spy = vi.spyOn(state, "setActiveSection");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = nav.section("not-a-real-section");

  expect(result.ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test("openModal() dispatches the real openModal action; an unknown slot refuses without dispatching", () => {
  const spy = vi.spyOn(state, "openModal");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.openModal("newChat")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("newChat");

  spy.mockClear();
  expect(nav.openModal("bogus-slot").ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test("openConfig() dispatches openConfigTo (group + optional sub); an unknown group refuses", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.openConfig("appearance")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("appearance", undefined, undefined);

  spy.mockClear();
  // A collection is a config group too (F-1): the SAME verb reaches it, and a sub rides through.
  expect(nav.openConfig("tags")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("tags", undefined, undefined);
  spy.mockClear();
  expect(nav.openConfig("chat-behavior", "world-info")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("chat-behavior", "world-info", undefined);

  spy.mockClear();
  expect(nav.openConfig("bogus-group").ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

// The LEAF leg (#1176, found by #926). `openConfigTo` has taken a third `setting` argument since #866 S3
// and the copy-link grammar spells all three parts, but this arm's signature stopped at `sub` — so the
// third argument was SILENTLY DROPPED and a drive asking for a knob landed on its section with `ok:true`.
// These assert THROUGH the store action (what a real "Related" link click dispatches), because the return
// value was already `{ok:true}` while the argument was being thrown away: a passing `ok` is the defect.
test("openConfig() carries the setting LEAF through to openConfigTo — the third argument is not dropped", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.openConfig("appearance", "sizing", "chat-width")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("appearance", "sizing", "chat-width");
});

test("openConfig() REFUSES a setting handed over without its section, and dispatches nothing", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  // A leaf is addressed THROUGH its section (`ConfigSettingRef.sub` is required for the same reason), so a
  // bare leaf names nothing. Landing on the group would be the bridge answering a narrower question than it
  // was asked — the silent-widening shape this whole arm exists to refuse.
  const result = nav.openConfig("appearance", undefined, "chat-width");

  expect(result.ok).toBe(false);
  // The refusal NAMES the leaf it could not place — a bare `ok:false` sends a drive hunting for the wrong
  // mistake (the group vocabulary), which is what `reject()` already spells out for the other arms.
  expect(result.ok ? "" : result.reason).toContain("chat-width");
  expect(spy).not.toHaveBeenCalled();
});

// ── #1638: the registry-backed leg — a `sub`/`setting` that NAMES nothing real ────────────────────────
// Every test above builds `nav` with NO third argument, so `openConfig` validates `sub`/`setting`
// structurally only (byte-identical to pre-#1638) — that is the coverage proving the injection is truly
// OPTIONAL. These build `nav` WITH a fake registry (the shape `compose/config-sections.ts` assembles) to
// prove the arm that needed it.
const FIXTURE_GROUP = "appearance" as ConfigGroupId;
const fixtureSection: ConfigSectionContribution = {
  id: "appearance-sizing",
  anchor: FIXTURE_GROUP,
  nav: { id: "sizing", label: "Sizing", settings: [{ id: "chat-width", label: "Chat width", teach: { none: "test fixture" } }] },
  body: () => null,
};

test("openConfig() validates sub/setting against an INJECTED registry — a real target dispatches", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const registry = createContributorRegistry<ConfigSectionContribution>("test-fixture", [fixtureSection]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient, () => registry);

  expect(nav.openConfig("appearance", "sizing", "chat-width")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("appearance", "sizing", "chat-width");
});

test("openConfig() REFUSES an unknown sub against an injected registry — no dispatch, nearest real sub named", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const registry = createContributorRegistry<ConfigSectionContribution>("test-fixture", [fixtureSection]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient, () => registry);

  const result = nav.openConfig("appearance", "bogus-sub");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("bogus-sub");
  expect(result.ok ? "" : result.reason).toContain("sizing");
  expect(spy).not.toHaveBeenCalled();
});

test("openConfig() REFUSES an unknown setting against an injected registry — no dispatch, nearest real leaf named", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const registry = createContributorRegistry<ConfigSectionContribution>("test-fixture", [fixtureSection]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient, () => registry);

  const result = nav.openConfig("appearance", "sizing", "bogus-setting");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("bogus-setting");
  expect(result.ok ? "" : result.reason).toContain("chat-width");
  expect(spy).not.toHaveBeenCalled();
});

test("openConfig() with a sub, when the injected thunk has not loaded the registry yet, REFUSES loudly — never validates vacuously", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient, () => null);

  const result = nav.openConfig("appearance", "sizing");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("not loaded yet");
  expect(spy).not.toHaveBeenCalled();
});

test("openConfig() with NO sub, when the injected thunk has not loaded, still dispatches — no lookup needed", () => {
  const spy = vi.spyOn(state, "openConfigTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient, () => null);

  expect(nav.openConfig("appearance")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("appearance", undefined, undefined);
});

// ── contextTab: the arm that must not report a landing it cannot see (issue #656) ────────────────────
// These assert through the STORE — what the mounted panel would actually show (`getContextTab()` that the
// surface also publishes = `useContextTabSelection`'s active tab) — never through the return value, because
// a false `ok:true` IS the defect. `revealContextPanel` is deliberately NOT mocked here: the landed tab is
// the subject, and a mocked reveal writes nothing to land on.

/** Put the store back to "no tabbed surface mounted, no tab requested" — the state a fresh navigation is in. */
function resetContextTabs(): void {
  state.publishContextTabIds([]);
  state.setContextTab(null);
}

test("contextTab() LANDS the requested tab when the panel publishes AFTER the call — the #656 defect pin", async () => {
  // The exact live shape: `--context-tab "This chat"` fired immediately after `--open-chat`, while the panel
  // has not run its publish effect yet. The old arm read an EMPTY vocabulary, treated "nothing to validate
  // against" as permission, and stored the raw LABEL — which the resolver cannot match, so it fell back to
  // Members while the bridge said ok:true. The arm must instead WAIT for the publish and land `settings`.
  resetContextTabs();
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const pending = nav.contextTab("This chat");
  setTimeout(() => {
    state.publishContextTabs([
      { id: "settings", label: "This chat" },
      { id: "members", label: "Members" },
    ]);
  }, 25);

  expect(await pending).toEqual({ ok: true });
  // The LANDING, read the way the panel resolves it: the stored tab is one the mounted surface publishes.
  expect(state.getContextTab()).toBe("settings");
  expect(state.getAvailableContextTabIds()).toContain("settings");
});

test("contextTab() refuses LOUDLY when no tabbed context surface ever publishes — the other direction", async () => {
  resetContextTabs();
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = await nav.contextTab("lore");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("no tabbed context surface published any tabs");
  // And it left NO lie behind: the unresolvable request was never stored as a tab id.
  expect(state.getContextTab()).toBeNull();
});

test("contextTab() REVEALS a published tab, and refuses an empty name + a typo with DISTINGUISHABLE reasons", async () => {
  resetContextTabs();
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  // Empty is refused before anything is read or opened.
  const empty = await nav.contextTab("");
  expect(empty.ok).toBe(false);
  expect(empty.ok ? "" : empty.reason).toContain("empty");

  // A tabbed surface is mounted → its ids are the vocabulary. A published tab lands.
  state.publishContextTabIds(["runs", "setup", "versions"]);
  expect(await nav.contextTab("setup")).toEqual({ ok: true });
  expect(state.getContextTab()).toBe("setup");

  // A typo is a DIFFERENT failure from "nothing published" — it names the offered vocabulary, and the
  // previously-landed tab is untouched (a refusal never moves the panel).
  const rejected = await nav.contextTab("stpu");
  expect(rejected.ok).toBe(false);
  expect(rejected.ok ? "" : rejected.reason).toContain("runs (runs), setup (setup), versions (versions)");
  expect(rejected.ok ? "" : rejected.reason).not.toContain("published any tabs");
  expect(state.getContextTab()).toBe("setup");
});

test("contextTab() accepts the unique visible label and lands its stable id", async () => {
  resetContextTabs();
  state.publishContextTabs([
    { id: "settings", label: "This chat" },
    { id: "rpg.game", label: "Game" },
  ]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(await nav.contextTab("game")).toEqual({ ok: true });
  expect(state.getContextTab()).toBe("rpg.game");

  expect(await nav.contextTab(" This chat ")).toEqual({ ok: true });
  expect(state.getContextTab()).toBe("settings");
});

test("contextTab() refuses an AMBIGUOUS label immediately rather than picking one", async () => {
  resetContextTabs();
  state.publishContextTabs([
    { id: "chat.notes", label: "Notes" },
    { id: "rpg.notes", label: "Notes" },
  ]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = await nav.contextTab("Notes");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("chat.notes, rpg.notes");
  expect(state.getContextTab()).toBeNull();
});

test("closeModal() dispatches the real closeModal action", () => {
  const spy = vi.spyOn(state, "closeModal");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.closeModal()).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledOnce();
});

test("openChat(id) composes setActiveSection('chats') + selectChat — the exact pair a chat-row click performs", async () => {
  const sectionSpy = vi.spyOn(state, "setActiveSection");
  const selectSpy = vi.spyOn(state, "selectChat");
  const trpc = fakeTrpc([{ id: CHAT_ID, title: "The Weave", participantNames: ["You"] }], []);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat(CHAT_ID);

  expect(result).toEqual({ ok: true });
  expect(sectionSpy).toHaveBeenCalledExactlyOnceWith("chats");
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHAT_ID);
});

test("openChat(id) resolves directly even when a temporary or old chat is absent from the recent list", async () => {
  const selectSpy = vi.spyOn(state, "selectChat");
  const trpc = fakeTrpc([], [], [{ id: CHAT_ID }]);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat(CHAT_ID);

  expect(result).toEqual({ ok: true });
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHAT_ID);
});

test("openChat('latest') resolves the top of the list without a caller-known id", async () => {
  const selectSpy = vi.spyOn(state, "selectChat");
  const trpc = fakeTrpc(
    [
      { id: CHAT_ID, title: "Newest", participantNames: ["You"] },
      { id: castId<ChatId>("chat_agentnav_b"), title: "Older", participantNames: ["You"] },
    ],
    [],
  );
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat("latest");

  expect(result).toEqual({ ok: true });
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHAT_ID);
});

test("openChat('current') resolves the ACTIVE room even when it is absent from the chat list (the unlisted husk)", async () => {
  // The defect `current` exists for: a just-created room is a HUSK the list query has not seen, so
  // "latest" resolves the wrong chat (last night a probe message landed in the owner's room). `current`
  // reads the active-chat pointer and never consults the list at all.
  state.selectChat(CHAT_ID);
  const selectSpy = vi.spyOn(state, "selectChat");
  const sectionSpy = vi.spyOn(state, "setActiveSection");
  const trpc = fakeTrpc([{ id: castId<ChatId>("chat_agentnav_b"), title: "Some other chat", participantNames: ["You"] }], []);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat("current");

  expect(result).toEqual({ ok: true });
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHAT_ID);
  expect(sectionSpy).toHaveBeenCalledExactlyOnceWith("chats");
});

test("openChat('current') REFUSES with a named reason when no room is open — no dispatch", async () => {
  state.goToLanding();
  const selectSpy = vi.spyOn(state, "selectChat");
  const nav = buildAgentNav(fakeTrpc([{ id: CHAT_ID, title: "The Weave", participantNames: ["You"] }], []), new RealQueryClient() as QueryClient);

  const result = await nav.openChat("current");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("no chat is open");
  expect(selectSpy).not.toHaveBeenCalled();
});

test("openChat('current') is a RESERVED word — a chat literally titled \"current\" stays reachable by its id", async () => {
  const titledCurrent = castId<ChatId>("chat_agentnav_d");
  state.selectChat(CHAT_ID);
  const selectSpy = vi.spyOn(state, "selectChat");
  const trpc = fakeTrpc([{ id: titledCurrent, title: "current", participantNames: ["You"] }], []);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  // The sentinel wins over the title — otherwise the reserved word would be ambiguous.
  expect(await nav.openChat("current")).toEqual({ ok: true });
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHAT_ID);

  selectSpy.mockClear();
  expect(await nav.openChat(titledCurrent)).toEqual({ ok: true });
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(titledCurrent);
});

test("openChat() with no id/title match REFUSES loudly, naming its search reach — no dispatch", async () => {
  const selectSpy = vi.spyOn(state, "selectChat");
  const trpc = fakeTrpc([{ id: CHAT_ID, title: "The Weave", participantNames: ["You"] }], []);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat("no-such-chat");

  expect(result.ok).toBe(false);
  expect(selectSpy).not.toHaveBeenCalled();
});

test("openChat() with an ambiguous title REFUSES rather than silently picking one", async () => {
  const selectSpy = vi.spyOn(state, "selectChat");
  const dupeId = castId<ChatId>("chat_agentnav_c");
  const trpc = fakeTrpc(
    [
      { id: CHAT_ID, title: "Group review", participantNames: ["You"] },
      { id: dupeId, title: "Group review", participantNames: ["You"] },
    ],
    [],
  );
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openChat("Group review");

  expect(result.ok).toBe(false);
  expect(selectSpy).not.toHaveBeenCalled();
});

test("openCharacter(id) dispatches setActiveSection('characters') + selectCharacter via the direct get read", async () => {
  const sectionSpy = vi.spyOn(state, "setActiveSection");
  const selectSpy = vi.spyOn(state, "selectCharacter");
  const trpc = fakeTrpc([], [{ id: CHARACTER_ID, name: "Zandik" }]);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openCharacter(CHARACTER_ID);

  expect(result).toEqual({ ok: true });
  expect(sectionSpy).toHaveBeenCalledExactlyOnceWith("characters");
  expect(selectSpy).toHaveBeenCalledExactlyOnceWith(CHARACTER_ID);
});

test("openCharacter() with no id/name match REFUSES — no dispatch", async () => {
  const selectSpy = vi.spyOn(state, "selectCharacter");
  const trpc = fakeTrpc([], [{ id: CHARACTER_ID, name: "Zandik" }]);
  const nav = buildAgentNav(trpc, new RealQueryClient() as QueryClient);

  const result = await nav.openCharacter("nobody-by-this-name");

  expect(result.ok).toBe(false);
  expect(selectSpy).not.toHaveBeenCalled();
});

// ── focus: the one arm with no channel to route wrong (regime-free — shell-store.ts's own header) ──

test("focus(true/false) dispatches the real setFocusMode flag and always succeeds", () => {
  const spy = vi.spyOn(state, "setFocusMode");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.focus(true)).toEqual({ ok: true });
  expect(spy).toHaveBeenLastCalledWith(true);

  expect(nav.focus(false)).toEqual({ ok: true });
  expect(spy).toHaveBeenLastCalledWith(false);
});

// ── panel: routing + refusal only — this suite runs in the NODE unit lane (no DOM), so it proves the
// dispatch/validation surface `panel()` owns before it ever reads the rendered `data-panel-mode` landing
// signal (`vitest.config.ts`'s "unit" project has no jsdom/happy-dom environment configured — `document`
// does not exist here). The LANDING half — the reason this bridge action exists at all, since a store write
// can land in a channel the current regime does not read — is proven where a real DOM is: the store
// primitives it delegates to (`dockListPanel`/`collapseListPanel`/`revealContextPanel`/`hideContextPanel`,
// including the #383 carry) are pinned by CT in `tests/client/state/{shell-store,list-flip-carry}.ct.tsx`,
// and the end-to-end bridge call is proven live (`pnpm snap --dirty`) in both viewport regimes.

test("panel() refuses an unknown panel name — no store dispatch", async () => {
  const dockSpy = vi.spyOn(state, "dockListPanel");
  const revealSpy = vi.spyOn(state, "revealContextPanel");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = await nav.panel("sidebar", "docked");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("sidebar");
  expect(dockSpy).not.toHaveBeenCalled();
  expect(revealSpy).not.toHaveBeenCalled();
});

test('panel() refuses an unknown mode, including the resolved-only "overlay" — no store dispatch', async () => {
  const dockSpy = vi.spyOn(state, "dockListPanel");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  const result = await nav.panel("list", "overlay");

  expect(result.ok).toBe(false);
  expect(result.ok ? "" : result.reason).toContain("overlay");
  expect(dockSpy).not.toHaveBeenCalled();
});
