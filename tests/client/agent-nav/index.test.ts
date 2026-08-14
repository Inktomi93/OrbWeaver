// Unit: `buildAgentNav` (agent-nav/index.ts) — the `__orb.nav` dev-navigation bridge. Proves the
// registered surface actually DISPATCHES: every arm calls the EXACT store action a real UI click calls
// (spied via `@orb/client/state`, never a parallel mutation path — the file header's own invariant), and
// every closed-vocabulary arm REFUSES loudly on an unknown target instead of a silent no-op. `trpc`/
// `queryClient` are faked to the minimal shape `fetchQuery(queryOptions())` needs — this bridge does no
// I/O of its own beyond that read, so a real server is not required to prove the dispatch contract.

import { buildAgentNav } from "@orb/client/agent-nav";
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
  chats: { readonly id: string; readonly title: string | null; readonly participantNames: readonly string[] }[],
  characters: { readonly id: string; readonly name: string }[],
  // biome-ignore lint/suspicious/noExplicitAny: the return is a minimal structural fake of the full Trpc proxy — the bridge only touches the branches built below.
): any {
  return {
    chat: {
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

  expect(nav.openModal("settings")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("settings");

  spy.mockClear();
  expect(nav.openModal("bogus-slot").ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test("openSettings() dispatches openSettingsTo; an unknown category refuses", () => {
  const spy = vi.spyOn(state, "openSettingsTo");
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.openSettings("appearance")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("appearance");

  spy.mockClear();
  expect(nav.openSettings("bogus-category").ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test("contextTab() REVEALS the panel on a tab the mounted surface published; refuses empty + unknown", () => {
  // `revealContextPanel` is the real UI deep-link action (opens the panel AND sets the tab); the bridge
  // composes it instead of a bare `setContextTab`, so a collapsed panel actually switches. It is mocked so
  // the DECISION (dispatch vs loud refusal) is the subject, exactly as the openChat arm spies `selectChat`.
  const spy = vi.spyOn(state, "revealContextPanel").mockImplementation((): void => undefined);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  // Empty is refused before anything is read.
  expect(nav.contextTab("").ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();

  // A tabbed surface is mounted → its ids are the vocabulary. A published tab reveals; a typo refuses loud.
  state.publishContextTabIds(["runs", "setup", "versions"]);
  expect(nav.contextTab("setup")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("setup");

  spy.mockClear();
  const rejected = nav.contextTab("stpu");
  expect(rejected.ok).toBe(false);
  expect(rejected.ok ? "" : rejected.reason).toContain("runs, setup, versions");
  expect(spy).not.toHaveBeenCalled();
});

test("contextTab() best-effort reveals when NO tabbed context surface is mounted (nothing to validate against)", () => {
  const spy = vi.spyOn(state, "revealContextPanel").mockImplementation((): void => undefined);
  // No published tabs — the panel is closed or the context is `single`-kind, so the opaque request stands.
  state.publishContextTabIds([]);
  const nav = buildAgentNav(fakeTrpc([], []), new RealQueryClient() as QueryClient);

  expect(nav.contextTab("lore")).toEqual({ ok: true });
  expect(spy).toHaveBeenCalledExactlyOnceWith("lore");
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
