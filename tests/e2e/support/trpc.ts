// Shared e2e tRPC fetch helpers — the ONE way both globalSetup (support/global-setup.ts) and the specs
// talk to the app's API directly, without a browser. Hand-rolls the tRPC batch wire shape (the same
// contract the client's httpBatchLink speaks) against the SAME running stack the specs hit (the vite
// front door proxies `/api` to Hono; single-user AUTH_MODE → no login). Compiled by the DOM-less node
// aggregator (tsconfig.json): node's global `fetch` (typed by @types/node), imports nothing from the
// browser client trees.
//
// WHY specs need this (not just globalSetup): the honesty specs assert DOM-vs-DB PARITY and
// settings-are-what's-used — they must read canon (chat.listMessages) and settings (getUserSettings)
// straight from the server as ground truth, and some drive a turn via chat.send with an explicit
// `intent` the UI composer can't inject (the context-cutoff spec's small `maxContextTokens` ceiling).

import process from "node:process";

// The vite front door (the specs' baseURL). Overridable; the config pins localhost:5173 (vite binds [::1]).
// biome-ignore lint/style/noProcessEnv: e2e node support reads the base-URL env exactly as global-setup.ts does (its sanctioned peer).
const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const encodeInput = (value: unknown): string => encodeURIComponent(JSON.stringify({ 0: value }));

/** A tRPC batch GET query — returns the single procedure's `result.data`. Throws on a non-2xx or error env. */
export async function trpcQuery<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1&input=${encodeInput(input)}`);
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e trpc: ${procedure} query failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

/** A tRPC batch mutation — returns the single procedure's `result.data`. Throws on a non-2xx or error env. */
export async function trpcMutation<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: input }),
  });
  const body = (await res.json()) as readonly { result?: { data?: T }; error?: unknown }[];
  const entry = body[0];
  if (!res.ok || entry?.error !== undefined || entry?.result === undefined) {
    throw new Error(`e2e trpc: ${procedure} mutation failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return entry.result.data as T;
}

// ── The canon/settings shapes the specs read (the fields they assert on — NOT the full contract). These
// mirror @orb/contracts but are declared locally: the e2e tsconfig is the DOM-less node aggregator and
// these helpers stay import-free of the package trees (same posture as chat-room.ts's OrbBusHandle). ──

/** One canon message row (a subset of contracts/chat `MessageView` — the fields the honesty specs read).
 *  `role` stays `string` (not a re-spelled `"user"|"assistant"` union): this DOM-less node support module
 *  mirrors the wire subset locally like chat-room.ts's OrbBusHandle, and the no-inline-union-redecl gate
 *  bans re-spelling the homed MESSAGE_ROLES members here — specs compare it to literals, `string` suffices. */
export interface CanonMessage {
  readonly id: string;
  readonly seq: number;
  readonly role: string;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly characterId: string | null;
  readonly personaId: string | null;
  readonly contextBoundaryMessageId: string | null;
}

/** The `chat.listMessages` page (subset) — chronological canon (`messages` ordered by seq ascending). */
interface MessagesPage {
  readonly messages: readonly CanonMessage[];
}

/** Read a chat's canon rows, chronological (seq ascending) — the DB ground truth the specs assert against. */
export async function listCanon(chatId: string): Promise<readonly CanonMessage[]> {
  const page = await trpcQuery<MessagesPage>("chat.listMessages", { chatId });
  return page.messages;
}

/** The single-user's resolved settings (`config` holds routing/chat/seeds/… tiers). */
export interface UserSettings {
  readonly config: {
    readonly routing?: {
      readonly roleDefaults?: {
        readonly chat?: { readonly api?: string; readonly source?: string };
      };
    };
  };
}

/** Read the current user settings — the ground truth for "what routing is ACTUALLY configured". */
export function getUserSettings(): Promise<UserSettings> {
  return trpcQuery<UserSettings>("settings.getUserSettings", {});
}

interface StartedChat {
  readonly chat: { readonly id: string };
}

/** Start a fresh committed chat with the given character(s) (model-free — seeds the greeting row). */
export async function startChat(characterIds: readonly string[]): Promise<string> {
  const started = await trpcMutation<StartedChat>("chat.startChat", { characterIds });
  return started.chat.id;
}

/** Drive one real turn on a chat via the API. `maxContextTokens` (optional) rides the per-send `intent`,
 *  which OVERRIDES the preset's params in the fold (chat/engine/pipeline.ts foldGenerationParams) — so a
 *  small ceiling forces the history-budget fit-pass to drop older turns WITHOUT mutating any shared preset
 *  (nothing to restore). Resolves after the turn commits (the mutation awaits the generated reply). */
export async function sendTurn(chatId: string, content: string, maxContextTokens?: number): Promise<void> {
  const intent = maxContextTokens === undefined ? undefined : { maxContextTokens };
  await trpcMutation("chat.send", { chatId, content, ...(intent === undefined ? {} : { intent }) });
}

interface CharacterListPage {
  readonly items: readonly { readonly id: string; readonly handle: string; readonly name: string }[];
}

/** The character catalog (globalSetup guarantees ≥1). */
export async function listCharacters(): Promise<CharacterListPage["items"]> {
  const page = await trpcQuery<CharacterListPage>("character.list", {});
  return page.items;
}
