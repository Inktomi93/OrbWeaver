// E2E globalSetup — establishes KNOWN DB state over the app's tRPC API BEFORE any spec runs, so the suite
// stops depending on ambient `./orbweaver.db` drift (the reason a wiped/latched library silently reddened
// the whole suite — see reports/tooling/PLAYWRIGHT-E2E-SPEEDUP.md, Finding 2). Two idempotent guarantees:
//   1. ≥1 CHARACTER exists — the library→chat flow needs a card. The boot seeder is a one-shot per-user
//      latch (entry/boot/seed-default-characters.ts): a wiped library with the latch set will NOT re-seed,
//      so we cannot rely on it. If the API reports zero characters we author one via `character.create`.
//   2. ≥1 committed CHAT exists with ≥1 durable message — the persistence/sequence/injection/multi-tab
//      specs reuse an existing chat (support/chat-room.ts `openOrCreateChat`); with one seeded here they
//      NEVER fall through to the create-via-send path, so the non-live suite is fully MODEL-FREE. A chat is
//      committed model-free by `chat.startChat` (server mints the id; the character's greeting becomes the
//      first durable assistant row — no `send`, no generation).
//
// Seed via API, not UI — faster + more reliable, and it runs against the SAME running stack the specs hit
// (playwright.config.ts webServer, single-user AUTH_MODE → no login). The tRPC batch fetch helpers live in
// support/trpc.ts (extracted so specs query the API directly too); this file only owns the seed policy.

import { trpcMutation, trpcQuery } from "./trpc";

// A deterministic anchor card authored only when the library is empty (a wiped-and-latched DB). The seeded
// default pack is preferred when present; this is the reset-safe floor.
const ANCHOR_HANDLE = "e2e-anchor";
const ANCHOR = {
  handle: ANCHOR_HANDLE,
  name: "E2E Anchor",
  description: "Deterministic e2e anchor character (globalSetup seed).",
  // A greeting so `chat.startChat` seeds a durable assistant row — the persistence spec asserts ≥1 row.
  greetings: [{ text: "Hello from the e2e anchor." }],
};

interface CharacterListPage {
  readonly items: readonly { readonly id: string; readonly handle: string }[];
}

/** Ensure ≥1 character exists; return the id of a usable one (prefer the anchor, else the first present). */
async function ensureCharacter(): Promise<string> {
  const page = await trpcQuery<CharacterListPage>("character.list", {});
  const anchor = page.items.find((c) => c.handle === ANCHOR_HANDLE);
  if (anchor !== undefined) {
    return anchor.id;
  }
  const first = page.items[0];
  if (first !== undefined) {
    // The boot-seeded default pack (or any authored card) is present — use it; don't author a duplicate.
    return first.id;
  }
  // Wiped-and-latched library: the seeder won't re-run, so author the deterministic anchor ourselves.
  const created = await trpcMutation<{ readonly id: string }>("character.create", {
    input: ANCHOR,
  });
  return created.id;
}

/** Ensure ≥1 committed chat exists (model-free) so the reuse path in support/chat-room.ts always hits. */
async function ensureChat(characterId: string): Promise<void> {
  const chats = await trpcQuery<readonly unknown[]>("chat.listChats", {});
  if (chats.length > 0) {
    return;
  }
  // `startChat` commits a real chat + seeds the character greeting as the first durable row — no model turn.
  await trpcMutation("chat.startChat", { characterIds: [characterId] });
}

/** Playwright `globalSetup` entry — runs once, after the webServer is up, before the first spec. */
export default async function globalSetup(): Promise<void> {
  const characterId = await ensureCharacter();
  await ensureChat(characterId);

  // Guarantee the tests run on vLLM using the agent-sdk backend, preventing unpredictable E2E fallbacks
  await trpcMutation("settings.updateUserSettingsSection", {
    section: "routing",
    patch: {
      roleDefaults: {
        chat: { api: "agent-sdk", source: "vllm" },
        agent: { api: "agent-sdk", source: "vllm" },
        summarize: { api: "agent-sdk", source: "vllm" },
        embed: { source: "vllm" },
        rerank: { source: "vllm" },
        imageEmbed: { source: "vllm" },
        generateImage: { source: "openrouter" },
      },
    },
  });
}
