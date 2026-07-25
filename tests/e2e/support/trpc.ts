// Shared e2e tRPC fetch helpers — the ONE way both globalSetup (support/global-setup.ts) and the specs
// talk to the app's API directly, without a browser. Hand-rolls the tRPC batch wire shape (the same
// contract the client's httpBatchLink speaks) against the SAME running stack the specs hit (the vite
// front door proxies `/api` to Hono; single-user AUTH_MODE → no login). Typechecked by the tests-dom
// program (tsconfig.tests-dom.json — dom + node since the 2026-07-24 e2e-tree routing): node's global
// `fetch`, and imports nothing from the browser client trees (deliberate — see below).
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
// mirror @orb/contracts but are declared locally: the e2e support tree stays import-free of the package
// trees on purpose (specs assert against the WIRE, not against the source's own types — an honest
// ground-truth read; same posture as chat-room.ts's OrbBusHandle). ──

/** One canon message row (a subset of contracts/chat `MessageView` — the fields the honesty specs read).
 *  `role` stays `string` (not a re-spelled `"user"|"assistant"` union): this package-import-free support
 *  module mirrors the wire subset locally like chat-room.ts's OrbBusHandle, and the no-inline-union-redecl
 *  gate bans re-spelling the homed MESSAGE_ROLES members here — specs compare it to literals, `string` suffices. */
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
  /** The selected variant's prompt token count — the SHRINKAGE instrument (a post-compaction turn's tokensIn
   *  drops below the pre-compaction peak because covered turns fall out of the prompt). Null on a user row. */
  readonly tokensIn: number | null;
}

/** The `chat.listMessages` page (subset) — chronological canon (`messages` ordered by seq ascending). */
interface MessagesPage {
  readonly messages: readonly CanonMessage[];
}

/** The present-tense context-fit preview (subset) — the source of the transcript divider. `compactSummary` is
 *  the LINEAR-tier managed-compaction marker when it covers the span above the boundary, else null (#9). */
export interface ContextFitPreview {
  readonly boundaryMessageId: string | null;
  readonly usedTokens: number;
  readonly ceilingTokens: number;
  readonly reserveOutputTokens: number;
  readonly droppedCount: number;
  readonly compactSummary: string | null;
}

/** Read the chat's present-tense fit preview (the divider's server source). */
export function previewContextFit(chatId: string): Promise<ContextFitPreview> {
  return trpcQuery<ContextFitPreview>("chat.previewContextFit", { chatId });
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
    readonly seeds: { readonly defaultPresetId?: string | null };
  };
}

/** Read the current user settings — the ground truth for "what routing is ACTUALLY configured". */
export function getUserSettings(): Promise<UserSettings> {
  return trpcQuery<UserSettings>("settings.getUserSettings", {});
}

/** The appearance/theme slice of the settings blob the #16 render-truth spec reads as ground truth
 *  (the fields it drives + asserts — NOT the full contract). Additive to `UserSettings` above via a
 *  dedicated reader so the existing `getUserSettings` shape stays untouched (add-only support rule). */
export interface AppearanceThemeSettings {
  readonly config: {
    readonly appearance: { readonly elevation: string; readonly backgroundImageKind: string; readonly backgroundSeededId: string };
    readonly theme: { readonly selectedThemeId: string | null };
  };
}

/** Read the appearance + theme slice — the DB ground truth the render-truth spec pins visibility against. */
export function getAppearanceTheme(): Promise<AppearanceThemeSettings> {
  return trpcQuery<AppearanceThemeSettings>("settings.getUserSettings", {});
}

/** Patch one settings section over the API (the #16 spec's finally-restore path — reset appearance/theme
 *  to known-safe values without touching browser storage). Mirrors updateUserSettingsSection's input. */
export function updateSettingsSection(section: string, patch: Record<string, unknown>): Promise<unknown> {
  return trpcMutation("settings.updateUserSettingsSection", { section, patch });
}

/** One theme row (subset) — the #16 spec resolves a seed theme id by name to select it via the API restore. */
interface ThemeRow {
  readonly id: string;
  readonly name: string;
  readonly isSeed: boolean;
}

/** List owned ∪ seed themes — the spec finds a seed theme (e.g. "Mocha") to select. */
export function listThemes(): Promise<readonly ThemeRow[]> {
  return trpcQuery<readonly ThemeRow[]>("settings.listThemes", {});
}

interface StartedChat {
  readonly chat: { readonly id: string };
}

/** Start a fresh committed chat with the given character(s) (model-free — seeds the greeting row). */
export async function startChat(characterIds: readonly string[]): Promise<string> {
  const started = await trpcMutation<StartedChat>("chat.startChat", { characterIds });
  return started.chat.id;
}

/** The managed-compaction per-send intent knob (a subset of `UserIntent.compaction` the specs drive). `mode` stays
 *  `string` (not the homed `CompactionMode` union): this package-import-free e2e support module mirrors the wire
 *  subset locally like `CanonMessage.role` — the no-inline-union-redecl gate bans re-spelling the homed
 *  COMPACTION_MODES members here, and specs pass literals, so `string` suffices. */
export interface CompactionIntent {
  readonly mode: string;
  readonly thresholdPct?: number;
  readonly instructions?: string;
}

/** Drive one real turn on a chat via the API. `maxContextTokens` (optional) rides the per-send `intent`,
 *  which OVERRIDES the preset's params in the fold (chat/engine/pipeline.ts foldGenerationParams) — so a
 *  small ceiling forces the history-budget fit-pass to drop older turns WITHOUT mutating any shared preset
 *  (nothing to restore). `compaction` (optional) rides the same per-send intent (the managed-compaction spec's
 *  `mode:"managed"` + a low threshold). Resolves after the turn commits (the mutation awaits the generated reply). */
export async function sendTurn(chatId: string, content: string, maxContextTokens?: number, compaction?: CompactionIntent): Promise<void> {
  const intent: Record<string, unknown> = {};
  if (maxContextTokens !== undefined) {
    intent["maxContextTokens"] = maxContextTokens;
  }
  if (compaction !== undefined) {
    intent["compaction"] = compaction;
  }
  await trpcMutation("chat.send", { chatId, content, ...(Object.keys(intent).length === 0 ? {} : { intent }) });
}

interface CharacterListPage {
  readonly items: readonly { readonly id: string; readonly handle: string; readonly name: string }[];
}

/** The character catalog (globalSetup guarantees ≥1). */
export async function listCharacters(): Promise<CharacterListPage["items"]> {
  const page = await trpcQuery<CharacterListPage>("character.list", {});
  return page.items;
}

/** Mint (or re-mint) a spec-owned character with a KNOWN handle, guaranteed CHATLESS by construction —
 *  the self-seeding cure for specs that assumed a seeded character stays virgin (the shared dev DB
 *  accumulates committed chats from earlier specs in a sweep, and a character WITH chats resumes its
 *  latest room instead of opening a fresh draft). Idempotent across crashed runs: an existing character
 *  with the handle is removed first (its chats go with it), then a fresh one is created. Callers remove
 *  it in a finally via `removeCharacter`. */
export async function mintFreshCharacter(handle: string, name: string, greeting: string): Promise<string> {
  const existing = (await listCharacters()).find((c) => c.handle === handle);
  if (existing !== undefined) {
    await trpcMutation("character.remove", { characterId: existing.id });
  }
  const created = await trpcMutation<{ readonly id: string }>("character.create", {
    input: { handle, name, description: "e2e spec-owned probe character", greetings: [{ text: greeting }] },
  });
  return created.id;
}

/** Remove a spec-owned character (see `mintFreshCharacter`). */
export function removeCharacter(characterId: string): Promise<unknown> {
  return trpcMutation("character.remove", { characterId });
}

// ── TASK-24: the four-layer round-trip fidelity harness support. Reads each of the four layers as WIRE
// ground truth (FE settings/preset · ASSEMBLE peek/shape-trace · WIRE provider body · DB canon). Shapes are
// declared locally (the e2e support tree stays import-free of the package trees — the CanonMessage posture). ──

/** ONE captured provider request body (foundation `wire-capture.ts`) — the backend's OWN wire vocabulary
 *  (openai-compat body | agent-sdk query input; see the recorder header). `body` is left `unknown`-keyed:
 *  the harness asserts backend-specific fields (`messages`/`max_tokens` for vllm; `prompt`/`maxTokens` for
 *  agent-sdk). */
export interface WireCapture {
  readonly chatId: string | null;
  readonly api: string;
  readonly backend: string;
  readonly model: string;
  readonly body: Record<string, unknown>;
}

/** Read the captured provider wire bodies for a chat (host-gated /api/_debug/wire/captures; the debug gate's
 *  admin tier passes under single-user AUTH_MODE). Newest-first. The capture seam must be ENABLED
 *  (WIRE_CAPTURE=on) for this to be non-empty. */
export async function fetchWireCaptures(chatId: string, backend?: string): Promise<readonly WireCapture[]> {
  const query = new URLSearchParams({ chatId, ...(backend !== undefined ? { backend } : {}) });
  const res = await fetch(`${BASE_URL}/api/_debug/wire/captures?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`e2e wire-captures read failed (${res.status})`);
  }
  const body = (await res.json()) as { readonly captures?: readonly WireCapture[] };
  return body.captures ?? [];
}

/** The active `PromptConfig` a chat assembles against (the FE-layer ground truth for section order / names /
 *  params). Only the fields the harness asserts. */
export interface ActivePresetConfig {
  readonly namesBehavior?: string;
  readonly sections: readonly { readonly id: string; readonly enabled?: boolean }[];
  readonly params: { readonly maxOutputTokens?: number; readonly maxContextTokens?: number; readonly namesBehavior?: string };
}

/** Read the resolved active preset config for a chat (chat.getActivePresetConfig). The FE-layer read: "what
 *  the chat is configured to assemble against". */
export function getActivePresetConfig(chatId: string): Promise<ActivePresetConfig> {
  return trpcQuery<ActivePresetConfig>("chat.getActivePresetConfig", { chatId });
}

/** The content-free SHAPE trace (PD-132) — per-stage ROW COUNTS (never content). `named` = rows the name-stamp
 *  pass touched; `injected` = post-injection row count. The harness asserts these counts move with the config
 *  (an injection at depth bumps `injected`; a names mode bumps `named`). Subset of the `ShapeTrace` view. */
export interface ShapeTraceView {
  readonly multiCharacter: boolean;
  readonly stageCounts: { readonly withTail: number; readonly injected: number; readonly squashed: number; readonly named: number };
}

/** Read the content-free SHAPE trace (chat.getShapeTrace — host-gated). The ASSEMBLE-layer shaping stages. */
export function getShapeTrace(chatId: string): Promise<ShapeTraceView> {
  return trpcQuery<ShapeTraceView>("chat.getShapeTrace", { chatId });
}

/** The routing roleDefaults.chat pin (api × source) — the harness swaps it to exercise a specific WIRE
 *  (agent-sdk vs the openai-compat stateless path) and RESTORES it in a finally. */
export interface ChatRoute {
  readonly api: string;
  readonly source: string;
}

/** Set the routing.roleDefaults.chat pin over the API (patches the `routing` settings section). RESTORE the
 *  original in a finally — this is the shared single-user settings row (retro-workboard E2E-spend caveat). */
export function setChatRoute(route: ChatRoute): Promise<unknown> {
  return updateSettingsSection("routing", { roleDefaults: { chat: route } });
}

/** Read the current routing.roleDefaults.chat pin (to snapshot before a harness swap). */
export async function getChatRoute(): Promise<ChatRoute | undefined> {
  const settings = await getUserSettings();
  const chat = settings.config.routing?.roleDefaults?.chat;
  return chat?.api !== undefined && chat.source !== undefined ? { api: chat.api, source: chat.source } : undefined;
}

/** The active preset's id + config (resolved via the settings seed default). The harness edits its config to
 *  drive a PromptConfig-only axis (namesBehavior/sections) and restores it in a finally. */
export interface PresetRow {
  readonly id: string;
  readonly config: Record<string, unknown>;
}

/** Resolve the active default preset (settings.seeds.defaultPresetId → preset.get). Undefined when unset. */
export async function getActivePreset(): Promise<PresetRow | undefined> {
  const settings = await getUserSettings();
  const id = settings.config.seeds.defaultPresetId;
  if (id === undefined || id === null) {
    return;
  }
  return await trpcQuery<PresetRow>("preset.get", { id });
}

/** Patch the active preset's config (preset.update). The harness sends the WHOLE merged config back (the
 *  update replaces `config` wholesale) and restores the original in a finally. */
export function updatePresetConfig(id: string, config: Record<string, unknown>): Promise<unknown> {
  return trpcMutation("preset.update", { id, config });
}
