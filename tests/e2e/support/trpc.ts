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
