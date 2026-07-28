// E2E globalSetup — establishes KNOWN DB state over each mode-project's tRPC API BEFORE any spec runs, so the
// suite stops depending on ambient DB drift (the reason a wiped/latched library silently reddened the whole
// suite — see reports/tooling/PLAYWRIGHT-E2E-SPEEDUP.md, Finding 2). Runs ONCE (Playwright globalSetup),
// AFTER every project's webServer is up; it iterates the mode projects (support/modes.ts) and seeds EACH
// stack by its own origin. Per mode:
//   1. ≥1 CHARACTER exists — the library→chat flow needs a card. The boot seeder is a one-shot per-user latch;
//      a wiped library won't re-seed, so if the API reports zero we author a deterministic anchor.
//   2. ≥1 committed CHAT with ≥1 durable message — the persistence/sequence/injection/multi-tab specs reuse
//      an existing chat; seeding one model-free (chat.startChat) keeps the non-live suite MODEL-FREE.
//   3. The routing roleDefaults pinned to the local vLLM engine (the @live specs' coherent chat wire).
//   4. LOCAL mode ONLY: the multi-user seed (localMultiUser AppSetting on + a member account) by shelling the
//      dev `scripts/dev/multi-user-seed.ts` — the ONE source of truth for that sequence, not a reimplementation.
//
// Seed via API, not UI — faster + more reliable, and it runs against the SAME running stack the specs hit.
// The un-credentialed 127.0.0.1 owner-fallback seam resolves the owner in every mode (single-user always;
// local/forward-header on a local origin), so these seed calls need no login.

import { execFileSync } from "node:child_process";
import process from "node:process";
import type { ModeProject } from "./modes";
import { LOCAL_MEMBER, LOCAL_OWNER, MODE_PROJECTS } from "./modes";

// A deterministic anchor card authored only when the library is empty (a wiped-and-latched DB).
const ANCHOR_HANDLE = "e2e-anchor";
const ANCHOR = {
  handle: ANCHOR_HANDLE,
  name: "E2E Anchor",
  description: "Deterministic e2e anchor character (globalSetup seed).",
  greetings: [{ text: "Hello from the e2e anchor." }],
};

interface CharacterListPage {
  readonly items: readonly { readonly id: string; readonly handle: string }[];
}

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

/** A batch GET query against a SPECIFIC base URL (mode-scoped — globalSetup seeds each stack by its origin). */
async function query<T>(baseUrl: string, procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}`);
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e seed: ${procedure} query failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

/** A batch mutation against a SPECIFIC base URL (the owner-fallback seam ⇒ no cookie/CSRF needed). */
async function mutation<T>(baseUrl: string, procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: input }),
  });
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e seed: ${procedure} mutation failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

/** Ensure ≥1 character exists; return the id of a usable one (prefer the anchor, else the first present). */
async function ensureCharacter(baseUrl: string): Promise<string> {
  const page = await query<CharacterListPage>(baseUrl, "character.list", {});
  const anchor = page.items.find((c) => c.handle === ANCHOR_HANDLE);
  if (anchor !== undefined) {
    return anchor.id;
  }
  const first = page.items[0];
  if (first !== undefined) {
    return first.id;
  }
  const created = await mutation<{ readonly id: string }>(baseUrl, "character.create", { input: ANCHOR });
  return created.id;
}

/** Ensure ≥1 committed chat exists (model-free) so the reuse path in support/chat-room.ts always hits. */
async function ensureChat(baseUrl: string, characterId: string): Promise<void> {
  const chats = await query<readonly unknown[]>(baseUrl, "chat.listChats", {});
  if (chats.length > 0) {
    return;
  }
  await mutation(baseUrl, "chat.startChat", { characterIds: [characterId] });
}

/** Pin every role to the local vLLM engine on its LIVE wire (the ONLY coherent local chat wire since D109). */
async function pinRouting(baseUrl: string): Promise<void> {
  await mutation(baseUrl, "settings.updateUserSettingsSection", {
    section: "routing",
    patch: {
      roleDefaults: {
        chat: { api: "chat-completions", source: "vllm" },
        agent: { api: "chat-completions", source: "vllm" },
        summarize: { api: "chat-completions", source: "vllm" },
        embed: { source: "vllm" },
        rerank: { source: "vllm" },
        imageEmbed: { source: "vllm" },
        generateImage: { source: "openrouter" },
      },
    },
  });
}

/** LOCAL mode: shell the dev multi-user seed against THIS stack's backend origin (the owner-fallback seam is
 *  a local-origin request, so it hits 127.0.0.1 directly). Single source of truth for the seed sequence —
 *  resetPassword(owner) → updateAppSettings{localMultiUser:true} → createUser(member) → verify. */
function seedMultiUser(mode: ModeProject): void {
  // Invoke the tsx CLI's JS entry directly with node (the `.bin/tsx` shim is a bash script — running it via
  // `process.execPath` would feed node a shell script). `tsx/dist/cli.mjs` is the real Node entry.
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/dev/multi-user-seed.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SEED_BASE_URL: mode.backendUrl,
      FIXTURE_OWNER_HANDLE: LOCAL_OWNER.handle,
      FIXTURE_OWNER_PASSWORD: LOCAL_OWNER.password,
      FIXTURE_MEMBER_HANDLE: LOCAL_MEMBER.handle,
      FIXTURE_MEMBER_PASSWORD: LOCAL_MEMBER.password,
    },
  });
}

/** Seed one mode-project's stack (the common library/chat/routing floor + the local multi-user seed). */
async function seedMode(mode: ModeProject): Promise<void> {
  const characterId = await ensureCharacter(mode.baseUrl);
  await ensureChat(mode.baseUrl, characterId);
  await pinRouting(mode.baseUrl);
  if (mode.seedMultiUser) {
    seedMultiUser(mode);
  }
}

/** Playwright `globalSetup` — runs once, after the webServers are up, before the first spec. Seeds EVERY
 *  mode-project's stack that actually BOOTED (a `--project=<name>`-scoped run boots only that project's
 *  webServer, so a fetch to a non-booted origin would hang — we probe /api/auth/config first and skip the
 *  ones that don't answer). Seeding is idempotent, so a full run seeds all three. */
export default async function globalSetup(): Promise<void> {
  // Probe every mode's origin in parallel; seed only the stacks that actually booted (distinct DBs/ports ⇒
  // seeding them concurrently is safe — no shared state).
  const booted = await Promise.all(
    MODE_PROJECTS.map((mode) =>
      fetch(`${mode.backendUrl}/api/auth/config`)
        .then((r) => r.ok)
        .catch(() => false),
    ),
  );
  await Promise.all(MODE_PROJECTS.filter((_, i) => booted[i] === true).map(seedMode));
}
