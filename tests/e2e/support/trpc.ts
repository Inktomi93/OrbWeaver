// Shared e2e tRPC fetch helpers — the ONE way both globalSetup (support/global-setup.ts) and the specs
// talk to the app's API directly, without a browser. Hand-rolls the tRPC batch wire shape (the same
// contract the client's httpBatchLink speaks) against the SAME running stack the specs hit (the vite
// front door proxies `/api` to Hono; single-user AUTH_MODE → no login). Typechecked by the tests-dom
// program (tsconfig.tests-dom.json — dom + node since the 2026-07-24 e2e-tree routing): node's global
// `fetch`, and imports nothing from the browser client trees (deliberate — see below).
//
// GROW A SHAPE HERE = UPDATE THE MIRROR: every hand-declared wire shape below is pinned against its
// @orb/contracts source by `./mirror-parity.test-d.ts` (the types lane) — a field added to the contract, a
// renamed key, or a drifted field type turns THAT file red, naming the shape. Add a pin with a new shape.
//
// WHY specs need this (not just globalSetup): the honesty specs assert DOM-vs-DB PARITY and
// settings-are-what's-used — they must read canon (chat.listMessages) and settings (getUserSettings)
// straight from the server as ground truth, and some drive a turn via chat.send with an explicit
// `intent` the UI composer can't inject (the context-cutoff spec's small `maxContextTokens` ceiling).

import process from "node:process";
import { SINGLE_USER } from "./modes";

// The vite front door (the specs' baseURL). Every consumer of this module is a single-user-project spec, so
// the default is SINGLE_USER.baseUrl — derived, never a literal: the project moved off the dev ports (a
// hardcoded :5173 would have aimed these reads/writes at the operator's dev stack). `E2E_BASE_URL` overrides.
// biome-ignore lint/style/noProcessEnv: e2e node support reads the base-URL env exactly as global-setup.ts does (its sanctioned peer).
const BASE_URL = process.env["E2E_BASE_URL"] ?? SINGLE_USER.baseUrl;

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
  /** Total variants for this slot (1 = single generation) — the guided-rewrite/swipe "correction-as-variant"
   *  instrument (a rewrite appends a variant, so this grows +1 while round-mates stay put). */
  readonly variantCount: number;
  /** Which swipe is shown (the selected variant's idx) — a fresh rewrite selects the new (last) variant. */
  readonly selectedVariantIdx: number;
  /** The SELECTED variant carries a continue snapshot (a continue has run on this swipe) — the undo/revert
   *  phase-gate instrument (Leg 3): false ⇒ the ⋯ items disable with reason; true ⇒ both are live. */
  readonly hasContinuation: boolean;
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
  readonly params: { readonly maxOutputTokens?: number; readonly maxContextTokens?: number };
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

// ── GROUP-CHAT support (group-chat.spec.ts · live-group-modes.spec.ts · multi-tab-room-sync.spec.ts).
// The group surface is roster + `chats.metadata.group` + arbitration, and EVERY assertion in those specs
// reads server truth through these — the DOM is only ever the second witness. Shapes are declared locally
// (the e2e support tree stays import-free of the package trees — the `CanonMessage` posture); the
// string-union axes (`output`/`policy`/`memberCardVisibility`/`kind`) stay `string`: the
// no-inline-union-redecl gate bans re-spelling the homed tuples here, and the specs compare to literals. ──

/** One PRESENT roster seat (a subset of the `ParticipantView` the `chat.getChat` detail carries). The
 *  `id` is the `chat_participants` row id — the key `chat.setSeatKnobs` writes by (D80), NOT the
 *  characterId. */
export interface RosterSeat {
  readonly id: string;
  readonly kind: string;
  readonly characterId: string | null;
  readonly displayName: string;
  readonly disabled: boolean;
  readonly talkativeness: number;
  readonly leftSeq: number | null;
}

/** The effective `GroupConfig` as `chat.getGroupConfig` returns it — always fully defaulted server-side
 *  (the verb parses the lenient input before persisting), so every knob is present. `cardScope` is the
 *  exception: the `narrator` arm OMITS it (the narrator ⇒ merged constraint is unrepresentable). */
export interface GroupConfigView {
  readonly output: string;
  readonly policy: string;
  readonly cardScope?: string;
  readonly speakerTags: boolean;
  readonly groupNudge: boolean;
  readonly autoMode: boolean;
  readonly autoModeMaxTurns: number;
  readonly autoModeDelayMs: number;
  readonly allowSelfResponses: boolean;
  readonly memberCardVisibility: string;
}

/** The `chat.startChat` / `chat.getChat` room detail (the fields the group specs read). */
interface ChatDetail {
  readonly id: string;
  readonly participants: readonly RosterSeat[];
}

interface StartedGroupChat {
  readonly chat: ChatDetail;
}

/** Self-seed a committed chat with a KNOWN founding cast. `opening: "none"` seeds NO greeting rows, so the
 *  canon starts empty and every later assertion counts only rows this spec caused (the shared-DB isolation
 *  rule: never `listChats()[0]`, and never inherit a greeting the arbitration would read as a last speaker).
 *  Returns the room detail so the caller keeps the seat ids `setSeatKnobs` needs. */
export async function startGroupChat(args: {
  readonly characterIds: readonly string[];
  readonly title: string;
  readonly groupConfig?: Record<string, unknown>;
}): Promise<ChatDetail> {
  const started = await trpcMutation<StartedGroupChat>("chat.startChat", {
    characterIds: args.characterIds,
    title: args.title,
    opening: "none",
    ...(args.groupConfig === undefined ? {} : { groupConfig: args.groupConfig }),
  });
  return started.chat;
}

/** The room detail (`chat.getChat`) — the roster ground truth after a membership mutation. */
export function getChatDetail(chatId: string): Promise<ChatDetail> {
  return trpcQuery<ChatDetail>("chat.getChat", { chatId });
}

/** The PRESENT character seats of a room, in roster (join) order — the order `list`/`pooled` arbitration
 *  walks. A removed seat is absent (the roster read is present-only, `leftSeq IS NULL`). */
export async function characterSeats(chatId: string): Promise<readonly RosterSeat[]> {
  return (await getChatDetail(chatId)).participants.filter((p) => p.kind === "character" && p.characterId !== null);
}

/** The effective group config (`chat.getGroupConfig`) — the "is the setting real?" read. */
export function getGroupConfig(chatId: string): Promise<GroupConfigView> {
  return trpcQuery<GroupConfigView>("chat.getGroupConfig", { chatId });
}

/** Seat one more character (`chat.addCharacterToChat`) — idempotent on an already-present character. */
export function addCharacterToChat(chatId: string, characterId: string): Promise<RosterSeat> {
  return trpcMutation<RosterSeat>("chat.addCharacterToChat", { chatId, characterId });
}

/** Patch ONE AI seat's arbitration knobs (`chat.setSeatKnobs`, D80) — keyed by the PARTICIPANT row id. */
export function setSeatKnobs(
  chatId: string,
  participantId: string,
  patch: { readonly disabled?: boolean; readonly talkativeness?: number },
): Promise<RosterSeat> {
  return trpcMutation<RosterSeat>("chat.setSeatKnobs", { chatId, participantId, patch });
}

/** Delete a spec-owned chat (`chat.delete`) — the cleanup half of `startGroupChat`. */
export function deleteChat(chatId: string): Promise<unknown> {
  return trpcMutation("chat.delete", { chatId });
}

/** The per-send output ceiling every @live group turn rides. Small on purpose: the group specs assert WHO
 *  speaks and HOW MANY messages land, never prose — so each turn buys the cheapest tokens that still
 *  produce a committed row. */
const GROUP_TURN_MAX_OUTPUT_TOKENS = 32;

/** Drive one real turn with a small `maxOutputTokens` ceiling riding the per-send `intent` (which overrides
 *  the preset's params in the fold). Distinct from `sendTurn` (the context-ceiling harness) so neither
 *  spec's knob leaks into the other. Resolves after the WHOLE round commits — including every extra speaker
 *  a multi-speaker round drove and any auto-mode chain. */
export function sendGroupTurn(chatId: string, content: string): Promise<unknown> {
  return trpcMutation("chat.send", { chatId, content, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** Host-summon one present character to speak next (`chat.forceCharacterTurn`) — the hard override that
 *  bypasses the policy entirely (and still reaches a MUTED seat: mute is passive arbitration exclusion). */
export function forceCharacterTurn(chatId: string, characterId: string): Promise<unknown> {
  return trpcMutation("chat.forceCharacterTurn", { chatId, characterId, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** Regenerate ONE message slot (`chat.swipe`) — the per-speaker "individually swipeable" prover. */
export function swipeMessage(chatId: string, messageId: string): Promise<unknown> {
  return trpcMutation("chat.swipe", { chatId, messageId, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** One variant's identity + position (`chat.listMessageVariants`) — idx-ordered, NO content. The pointer
 *  `selectVariant` moves by. (Module-local: consumed via `firstVariantId`/`countMessageVariants`;
 *  export only with a real spec consumer — an unwired kit export reds knip.) */
interface VariantSummary {
  readonly variantId: string;
  readonly idx: number;
}

/** How many variants one message slot carries (`chat.listMessageVariants`) — a swiped slot grows, its
 *  round-mates do not. */
export async function countMessageVariants(chatId: string, messageId: string): Promise<number> {
  return (await trpcQuery<readonly unknown[]>("chat.listMessageVariants", { chatId, messageId })).length;
}

/** All variant summaries for a slot, idx-ascending (`chat.listMessageVariants`). */
function listMessageVariants(chatId: string, messageId: string): Promise<readonly VariantSummary[]> {
  return trpcQuery<readonly VariantSummary[]>("chat.listMessageVariants", { chatId, messageId });
}

/** The FIRST (idx 0, original) variant id of a slot — the "original intact" comparand for the rewrite leg. */
export async function firstVariantId(chatId: string, messageId: string): Promise<string> {
  const variants = await listMessageVariants(chatId, messageId);
  const first = variants.find((v) => v.idx === 0) ?? variants[0];
  if (first === undefined) {
    throw new Error(`e2e: slot ${messageId} has no variants`);
  }
  return first.variantId;
}

/** Move a slot's SELECTED-variant pointer (`chat.selectVariant`) — a pure pointer move (no generation),
 *  so stepping back to idx 0 proves the original variant survived a rewrite intact. */
export function selectVariant(chatId: string, messageId: string, variantId: string): Promise<unknown> {
  return trpcMutation("chat.selectVariant", { chatId, messageId, variantId });
}

/** The chat's ASSISTANT canon rows in seq order — the arbitration transcript every mode assertion reads
 *  ("who spoke, in what order, how many messages"). */
export async function assistantTurns(chatId: string): Promise<readonly CanonMessage[]> {
  return (await listCanon(chatId)).filter((m) => m.role === "assistant");
}

/** The `characterId` of every assistant row in seq order — the speaker sequence a policy assertion
 *  compares against roster order. A narrator round contributes the SYNTHETIC group character's id (never a
 *  roster member), which is exactly what distinguishes it. */
export async function speakerSequence(chatId: string): Promise<readonly (string | null)[]> {
  return (await assistantTurns(chatId)).map((m) => m.characterId);
}

// ── GUIDED-GENERATIONS support (guided-generations.spec.ts). Every guided leg's ground truth is SERVER
// canon, read through these — the DOM is only ever the second witness (behavior + data-flow, never layout).
// `previewAssembly` is the honest pre-turn instrument for "the steer shaped the assembly": it routes a
// `guided` steer through the SAME gather→build a real turn gets and returns the assembled prompt + trace,
// so the steer text is assertable BEFORE (and without) any generation (read.int.test.ts:598 is the domain
// twin of this). The wire subset shapes are declared locally (the e2e support tree stays import-free of the
// package trees — the CanonMessage posture). ──

/** The assembled-prompt subset of `previewAssembly` (the fields the steer-shape leg reads). `dynamic` is the
 *  per-turn suffix a guided steer lands in (the domain twin asserts the steer text THERE); `static` is the
 *  cache-stable prefix; `afterHistory` the in-chat injections. `trace.guidedInstructionIncluded` is the
 *  boolean witness the steer actually reached the build. */
export interface AssemblyPreview {
  readonly prompt: {
    readonly static: string;
    readonly dynamic: string;
    readonly afterHistory: readonly { readonly content: string }[];
  };
  readonly trace: { readonly guidedInstructionIncluded: boolean };
}

/** One guided steer as the wire schema (`guidedSteerSchema`) accepts it — the same typed shape the composer
 *  wand sends on a real turn. `action` stays `string` (the no-inline-union-redecl posture); the spec passes
 *  the homed literal (`"response"`). */
export interface GuidedSteerInput {
  readonly action: string;
  readonly input: string;
}

/** Build the assembled prompt for a hypothetical turn, optionally with a guided steer routed through the
 *  SAME gather→build a real turn runs (`chat.previewAssembly` — host-only; single-user AUTH_MODE is host).
 *  The pre-turn "did the steer shape the assembly" instrument (no generation, nothing persists). */
export function previewAssembly(chatId: string, guided?: GuidedSteerInput): Promise<AssemblyPreview> {
  return trpcQuery<AssemblyPreview>("chat.previewAssembly", { chatId, ...(guided === undefined ? {} : { guided }) });
}

/** The whole assembled prompt text (static + dynamic + every in-chat injection's content) as ONE string —
 *  the steer can land in the dynamic suffix OR an in-chat injection depending on the preset's placement, so
 *  a containment assertion over the union is the placement-agnostic instrument. */
export function assembledPromptText(preview: AssemblyPreview): string {
  return [preview.prompt.static, preview.prompt.dynamic, ...preview.prompt.afterHistory.map((i) => i.content)].join("\n");
}

/** One canon message by id (undefined if absent) — the per-slot instrument for the variant/continuation
 *  legs (a rewrite grows THIS slot's `variantCount`; a continue flips THIS slot's `hasContinuation`/content). */
export async function canonMessage(chatId: string, messageId: string): Promise<CanonMessage | undefined> {
  return (await listCanon(chatId)).find((m) => m.id === messageId);
}

/** The tail assistant canon row (the wand's swipe/continue/rewrite target), or undefined on an empty/
 *  user-tail transcript. A greeting-seeded solo chat has this from `startChat` alone — no model turn. */
export async function tailAssistant(chatId: string): Promise<CanonMessage | undefined> {
  const rows = await listCanon(chatId);
  const tail = rows.at(-1);
  return tail?.role === "assistant" ? tail : undefined;
}

// ── RPG-LITE loop support (rpg-lite-loop.spec.ts). Every hop's RESULT is read as SERVER truth through these:
// `createLiteGame` births the game (host-gated — single-user AUTH_MODE is the host), and `getTrackerView` is
// the persisted-snapshot projection (the flush/snapshot RESULT the CP-4 panel renders). The wire subset shapes
// are declared locally (the e2e support tree stays import-free of the package trees — the `CanonMessage`
// posture); the enum axes (`mode`, `status`, weather `type`) stay `string` (the no-inline-union-redecl gate
// bans re-spelling the homed tuples here, and the spec compares to literals). ──

interface CreatedGame {
  readonly gameId: string;
}

/** Birth a LITE freeform rpg game on an existing chat (`rpg.createGame`, host-gated — single-user is the host).
 *  Writes the `chats.metadata.rpg` pointer that flips the client's CP-4 takeover on. Freeform ⇒ the snapshot
 *  starts empty (no born row) and the first state-changing turn writes the first snapshot. */
export async function createLiteGame(chatId: string): Promise<string> {
  const created = await trpcMutation<CreatedGame>("rpg.createGame", { chatId, mode: "lite" });
  return created.gameId;
}

/** One wallet slot (named-amount array — the STORED wallet, §2.6). */
interface TrackerWallet {
  readonly name: string;
  readonly amount: number;
}

/** One inventory item (subset — the fields the exhaustive spec reads back). */
interface TrackerItem {
  readonly name: string;
  readonly quantity: number;
}

/** One actor row in the tracker view — the roster ∪ sheets projection (subset of `RpgActorView`). `volatile`
 *  is null until a snapshot carries this actor's state. `sheet` carries the HAND-plane identity fields
 *  (className/attributes/maxHp/`level` — level is the hand-only plane, §2.6). The volatile plane carries every
 *  MODEL/HAND-writable state plane (hp/trackers/conditions/wallet/inventory/status) — the exhaustive spec asserts
 *  each one against the DOM + the DB read. The `actorRef` is the write key `patchSheet`/`editSnapshot` target. */
export interface TrackerActor {
  readonly actorRef: { readonly kind: string; readonly characterId?: string; readonly userId?: string; readonly castKey?: string };
  readonly name: string;
  readonly sheet: {
    readonly className: string;
    readonly attributes: Readonly<Record<string, number>>;
    readonly maxHp: number | null;
    readonly flavor: string;
    readonly level: number | null;
    readonly trackerGrants: readonly string[];
    readonly trackerRevokes: readonly string[];
  };
  readonly volatile: {
    readonly hp: { readonly value: number; readonly max: number } | null;
    readonly trackerValues: Readonly<Record<string, TrackerValue>>;
    readonly conditions: readonly { readonly name: string }[];
    readonly wallet: readonly TrackerWallet[];
    readonly inventory: readonly TrackerItem[];
    readonly status: string;
  } | null;
}

/** A present-cast NPC row (the Scene tab's `Present:` band — §2.1). `relationship` is the enum/custom badge,
 *  its tracked values ride the per-actor plane (keyed `cast:<key>`), surfaced as `castTrackers`. */
interface TrackerCast {
  readonly name: string;
  readonly emoji: string;
  readonly mood: string;
  readonly relationship: { readonly kind: string; readonly label: string };
}

/** THE unified tracked-field DEF (the tracked-field unification) — one shape for what used to be pool defs,
 *  cast-field schemas, band-orb pins and HUD widgets. */
interface TrackerDef {
  readonly key: string;
  readonly label: string;
  readonly shape: string;
  readonly write: string;
  readonly subject: string;
  readonly max: number | null;
  readonly hint: string;
  readonly pinned: boolean;
  readonly locked: boolean;
}

/** ONE tracker's stored reading. `max` is the PER-CARRIER CEILING OVERRIDE (TRK-2 owner amendment
 *  2026-07-31): `null` = this carrier uses the def's default ceiling, a number = this carrier tops out
 *  elsewhere (the d20 max-HP reality). The wire ALWAYS carries the key — the contract schema defaults it —
 *  so a spec's `toEqual` on a stored reading must spell all three fields. */
interface TrackerValue {
  readonly value: number | string | null;
  readonly items: readonly string[] | null;
  readonly max: number | null;
}

/** A tracker paired with its reading — the shape every tracker surface renders (actor row, cast row, band). */
interface TrackerEntry {
  readonly def: TrackerDef;
  readonly value: TrackerValue | null;
}

/** A quest view — the goal line + its `n/m` objective completion (§2.5, swipe-consistent). */
interface TrackerQuest {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly description: string;
  readonly objectives: readonly { readonly id: string; readonly text: string; readonly completed: boolean }[];
}

/** One act of the P5 plot spine (act-rail label). */
interface TrackerPlotAct {
  readonly title: string;
  readonly summary: string;
}

/** The snapshot-resident P5 plot plane (`rpg.getTrackerView.plot`) — the act rail. `act` is 1-based into
 *  `acts`; null when no plot is authored (the rail renders nothing). Swipe-consistent like every plane. */
interface TrackerPlot {
  readonly act: number;
  readonly title: string;
  readonly acts: readonly TrackerPlotAct[];
}

/** The FULL persisted-snapshot projection `rpg.getTrackerView` returns (the exhaustive spec reads every plane
 *  here). This IS the flush/snapshot RESULT and the persisted-snapshot DB read at once (`getTrackerView` reads
 *  the `rpg_snapshots` rows live — there is no separate rpg-table debug dump, so this projection is the DB
 *  witness for every rpg plane). Every plane reads the same resolved-current snapshot (swipe-consistent — a
 *  swipe re-resolves the WHOLE view on the selected lineage, server writes nothing). */
export interface TrackerView {
  readonly ambient: {
    readonly location: string;
    readonly calendarDate: string | null;
    readonly clock: { readonly day: number; readonly hour: number } | null;
    // `description` is spelled `| undefined` (not a bare `?:`) because the contract's optional carries
    // undefined explicitly and the repo typechecks under `exactOptionalPropertyTypes` — the parity pin
    // compares the two spellings.
    readonly weather: { readonly type: string; readonly label: string; readonly description?: string | undefined } | null;
  } | null;
  readonly actors: readonly TrackerActor[];
  readonly cast: readonly TrackerCast[];
  readonly trackerDefs: readonly TrackerDef[];
  readonly castTrackers: Readonly<Record<string, readonly TrackerEntry[]>>;
  readonly gameTrackers: readonly TrackerEntry[];
  readonly quests: readonly TrackerQuest[];
  /** The P5 snapshot-resident plot plane (act rail data) — null until the story authors one. */
  readonly plot: TrackerPlot | null;
  readonly recentBeats: readonly string[];
  readonly trackersReadOnly: boolean;
  readonly trackerOrbs: readonly { readonly key: string; readonly label: string; readonly value: number; readonly max: number | null }[];
  readonly lockedPaths: readonly string[];
}

/** Read a game's persisted tracker view (`rpg.getTrackerView`, member-gated — single-user is a member/host).
 *  The SERVER-truth cross-check for the CP-4 panel: what the flush/snapshot actually wrote AND the persisted
 *  snapshot DB read (the projection reads the snapshot rows live). */
export function getTrackerView(chatId: string): Promise<TrackerView> {
  return trpcQuery<TrackerView>("rpg.getTrackerView", { chatId });
}

/** The member-safe game view (`rpg.getGame`) — the mode/status/extractionMode/read-only read the takeover uses. */
export interface GameView {
  readonly id: string;
  readonly mode: string;
  readonly status: string;
  readonly trackersReadOnly: boolean;
  readonly extractionMode: string;
}

/** Read the member game view (`rpg.getGame`). The takeover's mode read + the extraction-mode/read-only pills. */
export function getGame(chatId: string): Promise<GameView> {
  return trpcQuery<GameView>("rpg.getGame", { chatId });
}

/** Set the game's delivery model (`rpg.updateConfig` — host). `folded` (default) = the character turn records
 *  its own state; `cheap` = a dedicated tool round post-commit. `mode` stays `string` (the
 *  no-inline-union-redecl gate bans re-spelling the homed RPG_EXTRACTION_MODES tuple here; the spec passes the
 *  literal). */
export function setExtractionMode(chatId: string, mode: string): Promise<unknown> {
  return trpcMutation("rpg.updateConfig", { chatId, extractionMode: mode });
}

/** Define the host-owned TRACKERS + custom-relationship hints (`rpg.updateConfig` — host). A passed array
 *  REPLACES the current list (whole-list edit). */
export function setGameFeatures(
  chatId: string,
  features: { readonly trackers?: readonly Record<string, unknown>[]; readonly relationshipHints?: Readonly<Record<string, string>> },
): Promise<unknown> {
  return trpcMutation("rpg.updateConfig", { chatId, patch: features });
}

/** The host config-editor read (`rpg.getConfigView`, HOST-gated) — the full statProfile + steeringNote +
 *  extractionMode + cast-field/relationship-hint feature knobs + the P3/P4/P5 knobs (never on a member view). */
export interface ConfigView {
  readonly steeringNote: string;
  readonly extractionMode: string;
  readonly trackers: readonly TrackerDef[];
  readonly relationshipHints: Readonly<Record<string, string>>;
  readonly deception: boolean;
  readonly omniscience: boolean;
  readonly hiddenContentReveal: boolean;
  readonly immersiveHtml: boolean;
  readonly cardKeepLastX: number;
  readonly cyoa: boolean;
  readonly cyoaChoiceBehavior: string;
  readonly plotProgression: boolean;
}

/** Read the host config-editor view (`rpg.getConfigView`). The "is the host setting real?" read. */
export function getConfigView(chatId: string): Promise<ConfigView> {
  return trpcQuery<ConfigView>("rpg.getConfigView", { chatId });
}

/** Patch the P3/P4/P5 feature knobs (`rpg.updateConfig.patch` — host). The capstone drives deception/cyoa/
 *  plotProgression from their defaults (deception OFF, cyoa OFF, plotProgression ON) to exercise each wave.
 *  Omit keeps the current value; a passed scalar REPLACES it (the keep-on-omit contract, §config). */
export function setFeatureKnobs(
  chatId: string,
  knobs: {
    readonly deception?: boolean;
    readonly omniscience?: boolean;
    readonly hiddenContentReveal?: boolean;
    readonly immersiveHtml?: boolean;
    readonly cyoa?: boolean;
    readonly plotProgression?: boolean;
  },
): Promise<unknown> {
  return trpcMutation("rpg.updateConfig", { chatId, patch: knobs });
}

// ── HAND-PLANE writes (the model-independent backbone). Every rpg plane has a HAND door; the exhaustive spec
// drives each one over the API, then cross-checks getTrackerView (BE/DB) + the CP-4 panel DOM (FE). These are
// the deterministic proofs that a landed write is FE=BE=DB consistent for EVERY plane, without depending on the
// small 8B decomposing that plane (the honest-arms ceiling, plan-for-small-hardware). ──

/** An actor ref as the wire union accepts it (`rpgActorRefSchema`). `kind` stays `string` (no-inline-union-
 *  redecl posture); the spec passes the homed literal. */
export type ActorRefInput =
  | { readonly kind: "character"; readonly characterId: string }
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "cast"; readonly castKey: string };

/** Patch an actor's identity SHEET (`rpg.patchSheet` — host any field, member own `user` ref). The HAND door for
 *  className/attributes/maxHp/flavor, the per-actor tracker exceptions, and the hand-only `level` plane (§2.6 —
 *  its ONLY write door). (`poolDefs` retired with the tracked-field unification — trackers are host-defined
 *  through `rpg.updateConfig.patch.trackers`, never through a sheet patch.) */
export function patchSheet(
  chatId: string,
  actorRef: ActorRefInput,
  patch: {
    readonly className?: string;
    readonly attributes?: Readonly<Record<string, number>>;
    readonly maxHp?: number | null;
    readonly flavor?: string;
    readonly level?: number | null;
    readonly trackerGrants?: readonly string[];
    readonly trackerRevokes?: readonly string[];
  },
): Promise<unknown> {
  return trpcMutation("rpg.patchSheet", { chatId, actorRef, patch });
}

/** The ERRORS-AS-DATA guard the three hand doors share (`editSnapshot`/`patchActor`/`dismissActor`): each
 *  answers with a verdict rather than a wire reject, so a spec that only awaited the call would drive a whole
 *  scene onto writes that never landed. The live lane fails LOUD instead. */
function assertHandWrote(path: string, result: unknown): unknown {
  if (typeof result === "object" && result !== null && "ok" in result && result.ok === false) {
    throw new Error(`${path} refused: ${"reason" in result ? String(result.reason) : "no reason given"}`);
  }
  return result;
}

/** The hand-edit door for the IMAGE-honest snapshot planes (`rpg.editSnapshot` — HOST-only). `patch` is a
 *  partial snapshot-state overlay the domain validates + auto-LOCKS (`fieldLocks`), so a hand edit becomes
 *  canon and the delta shows the GM tweak next turn (§2.7). The spec drives these planes through here:
 *  ambient (location/date/clock/weather), presentCharacters (cast + mood + relationship), recentEvents,
 *  trackerValues, plot. The per-ACTOR plane is NOT one of them (R1) — it rides `patchActor` below, and an
 *  `actorState` patch here is refused by design. */
export async function editSnapshot(chatId: string, patch: Record<string, unknown>): Promise<unknown> {
  return assertHandWrote("rpg.editSnapshot", await trpcMutation("rpg.editSnapshot", { chatId, patch }));
}

/** The op-shaped per-ACTOR hand door (`rpg.patchActor` — HOST-only). The ops apply IN ORDER against the true
 *  resolved head, each stamping its own fine lock path; `autoLock:false` opts out for a field no model write
 *  can reach. This is the ONLY hand door onto hp/trackerValues/conditions/inventory/wallet/status. */
export async function patchActor(
  chatId: string,
  targetRef: Record<string, unknown>,
  ops: readonly Record<string, unknown>[],
  opts: { readonly autoLock?: boolean } = {},
): Promise<unknown> {
  return assertHandWrote("rpg.patchActor", await trpcMutation("rpg.patchActor", { chatId, targetRef, ops, ...opts }));
}

/** Upsert a quest (`rpg.upsertQuest` — HOST-only). `questId` absent ⇒ create. The quest-plane HAND door. */
export function upsertQuest(
  chatId: string,
  quest: {
    readonly questId?: string;
    readonly name: string;
    readonly status?: string;
    readonly description?: string;
    readonly objectives?: readonly { readonly id?: string; readonly text: string; readonly completed?: boolean }[];
  },
): Promise<unknown> {
  return trpcMutation("rpg.upsertQuest", { chatId, ...quest });
}

/** Define the game's TRACKERS (`rpg.updateConfig.patch.trackers` — host). ONE def home since the tracked-field
 *  unification, so this one call replaces the retired createWidget + cast-field + orb-pin surfaces. */
export function setTrackers(chatId: string, trackers: readonly Record<string, unknown>[]): Promise<unknown> {
  return trpcMutation("rpg.updateConfig", { chatId, patch: { trackers } });
}

/** Add a hand journal entry (`rpg.addJournalEntry` — host). */
export function addJournalEntry(
  chatId: string,
  entry: { readonly type: string; readonly label?: string; readonly title: string; readonly content: string },
): Promise<unknown> {
  return trpcMutation("rpg.addJournalEntry", { chatId, ...entry });
}

/** One journal entry row in the paged `listJournal` view (subset — lineage-filtered server-side, §2.5). */
export interface JournalEntry {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly content: string;
}

/** Read a game's journal archive (`rpg.listJournal`, member — lineage-projected). The journal-plane DB read. */
export async function listJournal(chatId: string): Promise<readonly JournalEntry[]> {
  return await trpcQuery<readonly JournalEntry[]>("rpg.listJournal", { chatId });
}

/** Label the current resolved snapshot (`rpg.createCheckpoint` — host). Returns the minted checkpoint id. */
export function createCheckpoint(chatId: string, label: string): Promise<string> {
  return trpcMutation<string>("rpg.createCheckpoint", { chatId, label });
}

/** Clone a checkpointed snapshot forward BORN-COMMITTED (`rpg.restoreCheckpoint` — host). The rewind door. */
export function restoreCheckpoint(chatId: string, checkpointId: string): Promise<unknown> {
  return trpcMutation("rpg.restoreCheckpoint", { chatId, checkpointId });
}

/** One checkpoint summary (`rpg.listCheckpoints` — member). */
export interface CheckpointRow {
  readonly id: string;
  readonly label: string;
}

/** List a game's checkpoints (`rpg.listCheckpoints`). */
export async function listCheckpoints(chatId: string): Promise<readonly CheckpointRow[]> {
  return await trpcQuery<readonly CheckpointRow[]>("rpg.listCheckpoints", { chatId });
}

// ── P3 host-reveal (parity-plus §3.6). `revealHidden` is the HOST-gated eye: it derives the parsed `<lie>`/
// `<ofilter>` hidden spans out of the STORED assistant bodies — the truth a member never receives at the wire.
// The capstone plants a `<lie …/>` deterministically via `chat.editMessage` (an 8B won't reliably emit one),
// then asserts the host reads it here + the standing-lie inventory groups it (FE=BE for the Veiled ledger). ──

/** ONE parsed hidden span (subset of `RpgRevealedSpan`) — the tag + its labelled fields (character/type/
 *  truth/reason for a lie). */
interface RevealedSpan {
  readonly tag: string;
  readonly revealLabel: string;
  readonly fields: readonly { readonly key: string; readonly value: string }[];
}

/** The whole host-reveal read (`rpg.revealHidden`, HOST-gated) — the per-message parsed hidden spans + the
 *  standing-lie inventory grouped by character. A member never reaches this (leak-free NOT_FOUND). */
export interface RevealView {
  readonly messages: readonly { readonly messageId: string; readonly spans: readonly RevealedSpan[] }[];
  readonly standingLies: readonly {
    readonly character: string;
    readonly lies: readonly {
      readonly character: string;
      readonly type: string;
      readonly truth: string;
      readonly reason: string;
      readonly messageId: string;
    }[];
  }[];
}

/** Read the host-reveal eye (`rpg.revealHidden`). The BE truth for the P3 Veiled ledger. */
export function revealHidden(chatId: string): Promise<RevealView> {
  return trpcQuery<RevealView>("rpg.revealHidden", { chatId });
}

/** Overwrite an assistant message's stored body (`chat.editMessage` — author-or-host; single-user is host).
 *  The deterministic P3/P4/P5 content door: plant a `<lie …/>` tag / a `:::card` fence / a `:::choices` fence
 *  in a real canon row so the render + reveal + strip seams are exercised without depending on the 8B emitting
 *  the exact grammar. The message stays a real durable row (reveal derives from stored bodies). */
export function editMessage(chatId: string, messageId: string, content: string): Promise<unknown> {
  return trpcMutation("chat.editMessage", { chatId, messageId, content });
}

// ── P5 wand steer (parity-plus §6.2). The composer wand fires a game steer by KIND (`guided.gameSteer=<kind>`);
// the assembly resolves the kit-homed template through the macro engine, so `{{rpgSceneState}}` resolves live
// off the game turn's gather feed. The steer injects as a depth-0 SYSTEM injection into the assembled HISTORY,
// so the honest instrument is the WIRE CAPTURE of a real turn (NOT previewAssembly, whose prefix fields don't
// carry a depth-0 injection). ──

/** Drive ONE real turn with a wand GAME STEER of `kind` riding the per-send `guided` (the wand's exact fire
 *  path: `guided.gameSteer` + the required `action: "response"`). A small `maxOutputTokens` buys the cheapest
 *  committing turn — the steer's RESOLUTION into the provider prompt is the seam under test (read off the wire
 *  capture), not the model's answer. The gameSteer injects as a depth-0 SYSTEM injection into the assembled
 *  HISTORY, so it lands in the vLLM `messages` array — NOT the previewAssembly prefix fields (which is why the
 *  wire capture, not previewAssembly, is the honest instrument for the steer's live-state resolution). */
export function sendGameSteerTurn(chatId: string, kind: string): Promise<unknown> {
  return trpcMutation("chat.send", { chatId, content: "Continue.", intent: { maxOutputTokens: 24 }, guided: { action: "response", gameSteer: kind } });
}

/** Flatten a vLLM wire capture's `messages` array to ONE searchable string (openai-compat content join). */
export function wireMessagesText(capture: WireCapture): string {
  const messages = capture.body["messages"];
  if (!Array.isArray(messages)) {
    return "";
  }
  return (messages as readonly { readonly content?: unknown }[]).map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
}

// ── The CHAT-side DB witness (`/api/_debug/db/chat/:id` — inspectChatState). rpg has NO raw-table debug dump
// (the rpg flight recorder is an unbuilt seam, RPG_TRACE off), so getTrackerView is the rpg-plane DB read; THIS
// is the independent DB witness for the message/event landings the turn produced (canon rows + bus events). ──

/** The chat-inspection subset the exhaustive spec cross-checks against (`/api/_debug/db/chat/:id`). */
export interface ChatDbInspection {
  readonly found: boolean;
  readonly messages: readonly { readonly seq: number; readonly role: string; readonly content: string | null }[];
  readonly recentEvents: readonly { readonly type: string }[];
}

/** Read the DB inspection for a chat (`/api/_debug/db/chat/:id`, host-gated debug route). The independent DB
 *  witness that the turn's rows + bus events landed (distinct from the tRPC read path). */
export async function inspectChatDb(chatId: string): Promise<ChatDbInspection> {
  const res = await fetch(`${BASE_URL}/api/_debug/db/chat/${chatId}`);
  if (!res.ok) {
    throw new Error(`e2e db/chat read failed (${res.status})`);
  }
  return (await res.json()) as ChatDbInspection;
}

/** The debug error ring (`/api/_debug/errors`) — a non-empty list under a "successful" action is the
 *  invisible-bug class this repo exists to kill (observability-harness-verify-landings). */
export async function fetchDebugErrors(): Promise<readonly unknown[]> {
  const res = await fetch(`${BASE_URL}/api/_debug/errors`);
  if (!res.ok) {
    throw new Error(`e2e debug/errors read failed (${res.status})`);
  }
  const body = (await res.json()) as { readonly errors?: readonly unknown[] };
  return body.errors ?? [];
}

/** Delete message slots (`chat.deleteMessages`) — the sad-path "deleted turn" driver. */
export function deleteMessages(chatId: string, messageIds: readonly string[]): Promise<unknown> {
  return trpcMutation("chat.deleteMessages", { chatId, messageIds });
}

/** Abort the in-flight turn on a chat (`chat.abort`) — the sad-path "cancel mid-turn" driver. */
export function abortTurn(chatId: string): Promise<unknown> {
  return trpcMutation("chat.abort", { chatId });
}
