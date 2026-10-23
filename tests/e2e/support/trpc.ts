// Native tRPC owns successful request encoding and response types. Debug routes retain their canonical parsers.
import process from "node:process";
import type { ChatInspection, DebugErrorsResponse, RpgTracesResponse, WireCapture, WireCapturesResponse } from "@orb/contracts/debug";
import { chatInspectionSchema, debugErrorsResponseSchema, rpgTracesResponseSchema, wireCapturesResponseSchema } from "@orb/contracts/debug";
import { TRPC_BATCH_MAX_ITEMS } from "@orb/contracts/rpc";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterHandle, CharacterId, ChatId, MessageId, UserConnectionId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { AppRouter } from "@orb/server";
import type {
  ActorRefInput,
  CompactionIntent,
  DistributiveOmit,
  GroupConfigInput,
  GuidedSteerInput,
  ProcedureAt,
  RpgConfigPatch,
  TrpcInput,
  TrpcPath,
} from "@orb/testkit/browser/spec";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { DEV_TARGET_ALLOWED, E2E_DEBUG_TOKEN, E2E_LOCAL_ENGINE_LABEL, SINGLE_USER } from "./modes.ts";

// The vite front door (the specs' baseURL). Every consumer of this module is a single-user-project spec, so
// this is always SINGLE_USER.baseUrl — the actor clients target their stack via the spec's per-project
// Playwright `baseURL`, not an env (playwright.config.ts:45-46), and no mode sets `E2E_BASE_URL`. A
// formerly-read `E2E_BASE_URL` override is deleted (2026-08-08): a stale shell export left over from a
// dev-target drive silently pointed this support client at a DIFFERENT stack than the browser specs drove,
// producing DOM-vs-DB "parity failures" that were really two stacks disagreeing, not a product defect.
const BASE_URL = SINGLE_USER.baseUrl;

/**
 * The `/api/_debug/*` credential — the ONE header helper for every debug witness below, so a route added
 * later cannot quietly go back to an un-credentialed `fetch`.
 *
 * Until AUTHFIX-2 (2026-08-07) these reads sent NOTHING: the debug gate's admin arm admitted the
 * un-credentialed owner fallback, and this file's own comment recorded the dependency ("the debug gate's
 * admin tier passes under single-user AUTH_MODE"). That was a live hole on any reachable box — provider
 * request bodies included — so the gate now requires a credential and the harness carries the token its
 * stack booted with (`modes.ts::E2E_DEBUG_TOKEN`, threaded into every mode's `webServerEnv`).
 *
 * `DEBUG_TOKEN` from the runner's own env wins ONLY under `E2E_ALLOW_DEV_TARGET=1` (`modes.ts:71`
 * instructs the operator to export it for that drive) — gated on `DEV_TARGET_ALLOWED`, not on the bare env
 * key: an unconditional read let a DEV_TOKEN export left over from a dev-target drive silently carry into
 * the NEXT ordinary `pnpm e2e` (which boots with `E2E_DEBUG_TOKEN`), 401-ing every debug witness for a
 * reason invisible in the diff.
 */
// biome-ignore lint/style/noProcessEnv: e2e node support reads its env directly, exactly as the dev-target gate above does (its sanctioned peer).
const DEBUG_TOKEN = DEV_TARGET_ALLOWED ? (process.env["DEBUG_TOKEN"] ?? E2E_DEBUG_TOKEN) : E2E_DEBUG_TOKEN;

const debugHeaders = (): Record<string, string> => ({ "x-debug-token": DEBUG_TOKEN });

export type { ActorRefInput, CompactionIntent, GroupConfigInput, GuidedSteerInput, NewConnection, TrackerDefInput, TrpcInput } from "@orb/testkit/browser/spec";

/** The first batch entry's `result.data`, or `undefined` when that entry carries an error or no result. tRPC
 *  publishes no schema for the envelope, so it stays raw and only the envelope's own fields are read. */
export function batchResultData(body: unknown): { readonly data: unknown } | undefined {
  const entry: unknown = Array.isArray(body) ? body[0] : undefined;
  if (!isPlainObject(entry) || entry["error"] !== undefined) {
    return undefined;
  }
  const result = entry["result"];
  return isPlainObject(result) ? { data: result["data"] } : undefined;
}

/** The public native client for this router, including its serialized output types. */
export type TrpcClient = TRPCClient<AppRouter>;

type ClientProcedure<TPath extends TrpcPath> = ProcedureAt<TrpcClient, TPath>;

/** A query or mutation result with the installed client's serialization semantics. */
export type TrpcClientOutput<TPath extends TrpcPath> = Awaited<
  ReturnType<Extract<ClientProcedure<TPath>[keyof ClientProcedure<TPath>], (...args: never[]) => Promise<unknown>>>
>;

/** A message as received by the native client, rather than its server-side producer. */
export type CanonMessage = TrpcClientOutput<"chat.listMessages">["messages"][number];

/** A present seat as received by the native room read. */
type RosterSeat = TrpcClientOutput<"chat.getChat">["participants"][number];

/** A native model-role binding result. */
export type TaskBinding = TrpcClientOutput<"connection.listBindings">[number];

/** The native client's persisted tracker projection. */
type TrackerView = TrpcClientOutput<"rpg.getTrackerView">;

/** Bind the native batch transport to one stack and the caller's exact identifying headers. */
export function createTrpcClient(baseUrl: string, headers: Readonly<Record<string, string>> = {}): TrpcClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        maxItems: TRPC_BATCH_MAX_ITEMS,
        headers: ({ opList }) => (opList[0].type === "mutation" ? { ...headers, "content-type": "application/json" } : headers),
        fetch: async (url, init) => {
          const response = await fetch(url, init === undefined ? undefined : { ...init, signal: init.signal ?? null });
          if (!response.ok) {
            throw new Error(
              `e2e trpc: ${url instanceof Request ? url.url : String(url)} ${init?.method ?? "GET"} failed (${String(response.status)}): ${await response.text()}`,
            );
          }
          return response;
        },
      }),
    ],
  });
}

/** The single-user stack's native client; actors and per-mode setup bind their own origin. */
export const trpc = createTrpcClient(BASE_URL);

// ── The canon/settings reads the specs assert against: ground truth straight from the server, typed by the
// router. The `@orb/kit/ids` brands ride through, so an id position can never be a bare string. ──

/** Read the chat's present-tense fit preview (the divider's server source). The procedure answers
 *  `{ unbound: true }` when the host has no chat connection; every spec that calls this binds one first. */
export async function previewContextFit(chatId: ChatId): Promise<Exclude<TrpcClientOutput<"chat.previewContextFit">, { readonly unbound: true }>> {
  const answer = await trpc.chat.previewContextFit.query({ chatId });
  if ("unbound" in answer) {
    throw new Error(`e2e: chat ${chatId} has no bound chat connection — previewContextFit has no window to fit`);
  }
  return answer;
}

/** Read a chat's canon rows, chronological (seq ascending) — the DB ground truth the specs assert against. */
export async function listCanon(chatId: ChatId): Promise<readonly CanonMessage[]> {
  const page = await trpc.chat.listMessages.query({ chatId });
  return page.messages;
}

/** Read the current user settings — the ground truth for "what the seeds tier ACTUALLY holds". There is no
 *  `routing` tier: a per-task model pick is a `connection_bindings` ROW, read through `listBindings` below. */
export function getUserSettings(): Promise<TrpcClientOutput<"settings.getUserSettings">> {
  return trpc.settings.getUserSettings.query();
}

/** Read the appearance + theme slice — the DB ground truth the render-truth spec pins visibility against. */
export function getAppearanceTheme(): Promise<TrpcClientOutput<"settings.getUserSettings">> {
  return getUserSettings();
}

/** Patch one settings section over the API (the #16 spec's finally-restore path — reset appearance/theme
 *  to known-safe values without touching browser storage). Mirrors updateUserSettingsSection's input. */
export function updateSettingsSection(
  section: TrpcInput<"settings.updateUserSettingsSection">["section"],
  patch: TrpcInput<"settings.updateUserSettingsSection">["patch"],
): Promise<unknown> {
  return trpc.settings.updateUserSettingsSection.mutate({ section, patch });
}

/** List owned ∪ seed themes — the spec finds a seed theme (e.g. "Mocha") to select. */
export function listThemes(): Promise<TrpcClientOutput<"settings.listThemes">> {
  return trpc.settings.listThemes.query();
}

/** Start a fresh CLAIMED chat with the given character(s) (model-free — seeds the greeting row).
 *  `chat.startChat` alone mints a husk that every Chats list hides, so `openNewestChat` would open another
 *  chat. Rewriting the untitled chat's `null` title claims it without changing what the list shows. */
export async function startChat(characterIds: readonly CharacterId[]): Promise<ChatId> {
  const started = await trpc.chat.startChat.mutate({ characterIds: [...characterIds] });
  await trpc.chat.updateTitle.mutate({ chatId: started.chat.id, title: null });
  return started.chat.id;
}

/** Drive one real turn on a chat via the API. `maxContextTokens` (optional) rides the per-send `intent`,
 *  which OVERRIDES the preset's params in the fold (chat/engine/pipeline.ts foldGenerationParams) — so a
 *  small ceiling forces the history-budget fit-pass to drop older turns WITHOUT mutating any shared preset
 *  (nothing to restore). `compaction` (optional) rides the same per-send intent (the managed-compaction spec's
 *  `mode:"managed"` + a low threshold). Resolves after the turn commits (the mutation awaits the generated reply). */
export async function sendTurn(chatId: ChatId, content: string, maxContextTokens?: number, compaction?: CompactionIntent): Promise<void> {
  const intent: Record<string, unknown> = {};
  if (maxContextTokens !== undefined) {
    intent["maxContextTokens"] = maxContextTokens;
  }
  if (compaction !== undefined) {
    intent["compaction"] = compaction;
  }
  await trpc.chat.send.mutate({ chatId, timeZone: UTC_TIME_ZONE, content, ...(Object.keys(intent).length === 0 ? {} : { intent }) });
}

/** The character catalog (globalSetup guarantees ≥1). */
export async function listCharacters(): Promise<TrpcClientOutput<"character.list">["items"]> {
  const page = await trpc.character.list.query({});
  return page.items;
}

/** Mint (or re-mint) a spec-owned character with a KNOWN handle, guaranteed CHATLESS by construction —
 *  the self-seeding cure for specs that assumed a seeded character stays virgin (the shared dev DB
 *  accumulates committed chats from earlier specs in a sweep, and a character WITH chats resumes its
 *  latest room instead of opening a fresh draft). Idempotent across crashed runs: an existing character
 *  with the handle is removed first (its chats go with it), then a fresh one is created. Callers remove
 *  it in a finally via `removeCharacter`. */
export async function mintFreshCharacter(handle: CharacterHandle, name: string, greeting: string): Promise<CharacterId> {
  const existing = (await listCharacters()).find((c) => c.handle === handle);
  if (existing !== undefined) {
    await trpc.character.remove.mutate({ characterId: existing.id });
  }
  const created = await trpc.character.create.mutate({
    input: { handle, name, description: "e2e spec-owned probe character", greetings: [{ text: greeting }] },
  });
  return created.id;
}

/** Remove a spec-owned character (see `mintFreshCharacter`). */
export function removeCharacter(characterId: CharacterId): Promise<unknown> {
  return trpc.character.remove.mutate({ characterId });
}

// ── TASK-24: the four-layer round-trip fidelity harness support. Reads each of the four layers as WIRE
// ground truth (FE settings/preset · ASSEMBLE peek/shape-trace · WIRE provider body · DB canon). The tRPC reads are
// derived from the router; the `/api/_debug/*` reads are parsed with their `@orb/contracts/debug` schemas. ──

/** Read the captured provider wire bodies for a chat (host-gated /api/_debug/wire/captures — presents the
 *  operator token, see `debugHeaders`). Newest-first. The capture seam must be ENABLED (WIRE_CAPTURE=on) for
 *  this to be non-empty. */
export async function fetchWireCaptures(chatId: ChatId, backend?: string): Promise<WireCapturesResponse["captures"]> {
  const query = new URLSearchParams({ chatId, ...(backend !== undefined ? { backend } : {}) });
  const res = await fetch(`${BASE_URL}/api/_debug/wire/captures?${query.toString()}`, { headers: debugHeaders() });
  if (!res.ok) {
    throw new Error(`e2e wire-captures read failed (${res.status})`);
  }
  return wireCapturesResponseSchema.parse(await res.json()).captures;
}

/** Read the content-free SHAPE trace (chat.getShapeTrace — host-gated): per-stage ROW COUNTS, never content.
 *  The ASSEMBLE-layer shaping stages; the harness asserts the counts move with the config. */
export function getShapeTrace(chatId: ChatId): Promise<TrpcClientOutput<"chat.getShapeTrace">> {
  return trpc.chat.getShapeTrace.query({ chatId });
}

// ── CONNECTIONS + MODEL ROLES — the harness's half of the inference program's two tables ───────────────
//
// WHAT REPLACED WHAT: `settings.updateUserSettingsSection({ section: "routing" })` is GONE — `routing` is not
// a `USER_SETTINGS_SECTIONS` member any more. A per-task model pick is now a `connection_bindings` row
// (actor × routable task → connection) pointing at a `user_connections` row (§3.2/§7.1), so "swap the chat
// route" became "re-point the `chat` binding at another connection", and "an incoherent route that cannot
// generate" became "no `chat` binding at all" (`no-connection`, §7.2 — there are no defaults to fall back to).
//
// VOCABULARY: `binding` is a SCHEMA word (§5.3a) — fine in harness code talking to the router, never in
// anything a user reads. The pane calls these rows "Model roles".
//
// The harness's own connection is authored ONCE by `global-setup.ts::pinChatConnection` and found by label
// (`E2E_LOCAL_ENGINE_LABEL`); a spec that wants a different pick sets the binding and RESTORES the prior one
// in a finally, because the rows are the single-user owner's and are shared across serial specs.

/** One of the caller's `user_connections` rows. */
type ConnectionRow = TrpcClientOutput<"connection.list">[number];

/** Every connection row the caller owns (`connection.list`). */
function listConnections(): Promise<readonly ConnectionRow[]> {
  return trpc.connection.list.query();
}

/** The caller's own (`user` actor) Model-roles readout. */
function listBindings(): Promise<readonly TaskBinding[]> {
  return trpc.connection.listBindings.query();
}

/** The `chat` Model-roles row, always present (a slot with no binding reads `binding: null`). */
export async function getChatBindingRow(): Promise<TaskBinding> {
  const row = (await listBindings()).find((binding) => binding.task === "chat");
  if (row === undefined) {
    throw new Error("e2e: connection.listBindings returned no `chat` slot — ROUTABLE_TASKS no longer lists it?");
  }
  return row;
}

/** Snapshot the `chat` pick before a harness swap: the bound connection, or `null` when the slot is unset
 *  (or its row was deleted — the binding survives with a null id rather than dangling). */
export async function getChatBinding(): Promise<{ readonly connectionId: UserConnectionId } | null> {
  const connectionId = (await getChatBindingRow()).binding?.connectionId ?? null;
  return connectionId === null ? null : { connectionId };
}

/** Point the `chat` Model role at a connection, or CLEAR it. `null` is the product's one way to have no chat
 *  write path (`no-connection`) now that the retired incoherent `(api, source)` pair no longer exists. */
export function setChatBinding(connectionId: UserConnectionId | null): Promise<unknown> {
  return trpc.connection.setBinding.mutate({ task: "chat", connectionId });
}

/** Restore a snapshot taken by {@link getChatBinding} — a no-op-safe finally step (an unset slot restores to
 *  unset). Swallows its own failure like every other harness restore: a teardown must not mask the verdict. */
export function restoreChatBinding(prior: { readonly connectionId: UserConnectionId } | null): Promise<unknown> {
  return setChatBinding(prior === null ? null : prior.connectionId).catch(() => null);
}

/** The harness's local-engine connection (`global-setup.ts::pinChatConnection` minted it). Throws NAMING the
 *  seed rather than returning undefined: every caller needs the row, and "globalSetup did not run against
 *  this origin" is the only way it can be missing. */
export async function localEngineConnection(): Promise<ConnectionRow> {
  const row = (await listConnections()).find((connection) => connection.label === E2E_LOCAL_ENGINE_LABEL);
  if (row === undefined) {
    throw new Error(`e2e: no connection labelled "${E2E_LOCAL_ENGINE_LABEL}" at ${BASE_URL} — globalSetup's pinChatConnection did not seed this stack`);
  }
  return row;
}

/** Bind `chat` to the local engine and hand back the PRIOR pick for the finally. The specs that used to pin
 *  `{ api: "chat-completions", source: "vllm" }` do exactly this: it is the same wire, named by its row. */
export async function pinChatToLocalEngine(): Promise<{ readonly connectionId: UserConnectionId } | null> {
  const prior = await getChatBinding();
  await setChatBinding((await localEngineConnection()).id);
  return prior;
}

/** The caller's Claude-subscription connection, if they have one. `undefined` is a legitimate state the
 *  harness cannot fix: a `claude-sub` row carries a token pasted from `claude setup-token` on the operator's
 *  own machine (§5.3a), which no CI run may fabricate — the agent-sdk specs SKIP on it. */
export async function claudeSubConnection(): Promise<ConnectionRow | undefined> {
  return (await listConnections()).find((connection) => connection.providerId === "claude-sub");
}

/** Resolve the active default preset (settings.seeds.defaultPresetId → preset.get). Undefined when unset. */
export async function getActivePreset(): Promise<TrpcClientOutput<"preset.get"> | undefined> {
  const settings = await getUserSettings();
  const id = settings.config.seeds.defaultPresetId;
  if (id === null) {
    return;
  }
  return await trpc.preset.get.query({ id });
}

/** Patch the active preset's config (preset.update). The harness sends the WHOLE merged config back (the
 *  update replaces `config` wholesale) and restores the original in a finally. */
export function updatePresetConfig(id: TrpcInput<"preset.update">["id"], config: TrpcInput<"preset.update">["config"]): Promise<unknown> {
  return trpc.preset.update.mutate({ id, config });
}

/** Create a throwaway chat preset (`preset.create`). The caller removes it in a finally via `removePreset`. */
export function createPreset(name: string): Promise<TrpcClientOutput<"preset.create">> {
  return trpc.preset.create.mutate({ name, kind: "chat" });
}

/** Remove a spec-owned preset (`preset.remove`). */
export function removePreset(id: TrpcInput<"preset.remove">["id"]): Promise<unknown> {
  return trpc.preset.remove.mutate({ id });
}

/** Set a preset's `params.maxContextTokens`. `preset.update` takes the FULL config (a `patch` key is silently
 *  stripped), so this reads the config, merges the one knob and writes the whole thing back. */
export async function setPresetMaxContextTokens(id: TrpcInput<"preset.get">["id"], maxContextTokens: number): Promise<void> {
  const preset = await trpc.preset.get.query({ id });
  await updatePresetConfig(id, { ...preset.config, params: { ...preset.config.params, maxContextTokens } });
}

// ── GROUP-CHAT support (group-chat.spec.ts · live-group-modes.spec.ts · multi-tab-room-sync.spec.ts).
// The group surface is roster + `chats.metadata.group` + arbitration, and EVERY assertion in those specs
// reads server truth through these — the DOM is only ever the second witness. ──

/** The `chat.startChat` / `chat.getChat` room detail. */
type ChatDetail = TrpcClientOutput<"chat.getChat">;

/** Self-seed a claimed chat with a KNOWN founding cast. `startChat` deliberately mints a list-hidden husk;
 *  the same-title row write claims it without adding canon. `opening: "none"` therefore leaves the transcript
 *  empty while making the room library-visible for UI setup. Returns the room detail so callers keep the seat
 *  ids `setSeatKnobs` needs. */
export async function startGroupChat(args: {
  readonly characterIds: readonly CharacterId[];
  readonly title: string;
  readonly groupConfig?: GroupConfigInput;
}): Promise<ChatDetail> {
  const started = await trpc.chat.startChat.mutate({ characterIds: [...args.characterIds], title: args.title, opening: "none" });
  await trpc.chat.updateTitle.mutate({ chatId: started.chat.id, title: args.title });
  // `chat.startChat` takes no group config (a `groupConfig` key is silently stripped), so the knobs ride the setter.
  if (args.groupConfig !== undefined) {
    await trpc.chat.setGroupConfig.mutate({ chatId: started.chat.id, config: args.groupConfig });
  }
  return started.chat;
}

/** The room detail (`chat.getChat`) — the roster ground truth after a membership mutation. */
export function getChatDetail(chatId: ChatId): Promise<ChatDetail> {
  return trpc.chat.getChat.query({ chatId });
}

/** The PRESENT character seats of a room, in roster (join) order — the order `list`/`pooled` arbitration
 *  walks. A removed seat is absent (the roster read is present-only, `leftSeq IS NULL`). */
export async function characterSeats(chatId: ChatId): Promise<readonly RosterSeat[]> {
  return (await getChatDetail(chatId)).participants.filter((p) => p.kind === "character" && p.characterId !== null);
}

/** The effective group config (`chat.getGroupConfig`) — the "is the setting real?" read. */
export function getGroupConfig(chatId: ChatId): Promise<TrpcClientOutput<"chat.getGroupConfig">> {
  return trpc.chat.getGroupConfig.query({ chatId });
}

/** Seat one more character (`chat.addCharacterToChat`) — idempotent on an already-present character. */
export function addCharacterToChat(chatId: ChatId, characterId: CharacterId): Promise<TrpcClientOutput<"chat.addCharacterToChat">> {
  return trpc.chat.addCharacterToChat.mutate({ chatId, characterId });
}

/** Patch ONE AI seat's arbitration knobs (`chat.setSeatKnobs`, D80) — keyed by the PARTICIPANT row id. */
export function setSeatKnobs(
  chatId: ChatId,
  participantId: TrpcInput<"chat.setSeatKnobs">["participantId"],
  patch: TrpcInput<"chat.setSeatKnobs">["patch"],
): Promise<TrpcClientOutput<"chat.setSeatKnobs">> {
  return trpc.chat.setSeatKnobs.mutate({ chatId, participantId, patch });
}

/** Delete a spec-owned chat (`chat.delete`) — the cleanup half of `startGroupChat`. */
export function deleteChat(chatId: ChatId): Promise<unknown> {
  return trpc.chat.delete.mutate({ chatId });
}

/** The per-send output ceiling every `@live` group turn rides. Small on purpose: the group specs assert WHO
 *  speaks and HOW MANY messages land, never prose — so each turn buys the cheapest tokens that still
 *  produce a committed row. */
const GROUP_TURN_MAX_OUTPUT_TOKENS = 32;

/** Drive one real turn with a small `maxOutputTokens` ceiling riding the per-send `intent` (which overrides
 *  the preset's params in the fold). Distinct from `sendTurn` (the context-ceiling harness) so neither
 *  spec's knob leaks into the other. Resolves after the WHOLE round commits — including every extra speaker
 *  a multi-speaker round drove and any auto-mode chain. */
export function sendGroupTurn(chatId: ChatId, content: string): Promise<unknown> {
  return trpc.chat.send.mutate({ chatId, timeZone: UTC_TIME_ZONE, content, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** Host-summon one present character to speak next (`chat.forceCharacterTurn`) — the hard override that
 *  bypasses the policy entirely (and still reaches a MUTED seat: mute is passive arbitration exclusion). */
export function forceCharacterTurn(chatId: ChatId, characterId: CharacterId): Promise<unknown> {
  return trpc.chat.forceCharacterTurn.mutate({ chatId, timeZone: UTC_TIME_ZONE, characterId, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** Regenerate ONE message slot (`chat.swipe`) — the per-speaker "individually swipeable" prover. */
export function swipeMessage(chatId: ChatId, messageId: MessageId): Promise<unknown> {
  return trpc.chat.swipe.mutate({ chatId, timeZone: UTC_TIME_ZONE, messageId, intent: { maxOutputTokens: GROUP_TURN_MAX_OUTPUT_TOKENS } });
}

/** How many variants one message slot carries (`chat.listMessageVariants`) — a swiped slot grows, its
 *  round-mates do not. */
export async function countMessageVariants(chatId: ChatId, messageId: MessageId): Promise<number> {
  return (await trpc.chat.listMessageVariants.query({ chatId, messageId })).length;
}

/** All variant summaries for a slot, idx-ascending (`chat.listMessageVariants`). */
function listMessageVariants(chatId: ChatId, messageId: MessageId): Promise<TrpcClientOutput<"chat.listMessageVariants">> {
  return trpc.chat.listMessageVariants.query({ chatId, messageId });
}

/** The FIRST (idx 0, original) variant id of a slot — the "original intact" comparand for the rewrite leg. */
export async function firstVariantId(chatId: ChatId, messageId: MessageId): Promise<string> {
  const variants = await listMessageVariants(chatId, messageId);
  const first = variants.find((v) => v.idx === 0) ?? variants[0];
  if (first === undefined) {
    throw new Error(`e2e: slot ${messageId} has no variants`);
  }
  return first.variantId;
}

/** Move a slot's SELECTED-variant pointer (`chat.selectVariant`) — a pure pointer move (no generation),
 *  so stepping back to idx 0 proves the original variant survived a rewrite intact. */
export function selectVariant(chatId: ChatId, messageId: MessageId, variantId: string): Promise<unknown> {
  return trpc.chat.selectVariant.mutate({ chatId, timeZone: UTC_TIME_ZONE, messageId, variantId });
}

/** The chat's ASSISTANT canon rows in seq order — the arbitration transcript every mode assertion reads
 *  ("who spoke, in what order, how many messages"). */
export async function assistantTurns(chatId: ChatId): Promise<readonly CanonMessage[]> {
  return (await listCanon(chatId)).filter((m) => m.role === "assistant");
}

/** The `characterId` of every assistant row in seq order — the speaker sequence a policy assertion
 *  compares against roster order. A narrator round contributes the SYNTHETIC group character's id (never a
 *  roster member), which is exactly what distinguishes it. */
export async function speakerSequence(chatId: ChatId): Promise<readonly (string | null)[]> {
  return (await assistantTurns(chatId)).map((m) => m.characterId);
}

// ── GUIDED-GENERATIONS support (guided-generations.spec.ts). Every guided leg's ground truth is SERVER
// canon, read through these — the DOM is only ever the second witness (behavior + data-flow, never layout).
// `previewAssembly` is the honest pre-turn instrument for "the steer shaped the assembly": it routes a
// `guided` steer through the SAME gather→build a real turn gets and returns the assembled prompt + trace,
// so the steer text is assertable BEFORE (and without) any generation (read.int.test.ts:598 is the domain
// twin of this). ──

/** Build the assembled prompt for a hypothetical turn, optionally with a guided steer routed through the
 *  SAME gather→build a real turn runs (`chat.previewAssembly` — host-only; single-user AUTH_MODE is host).
 *  The pre-turn "did the steer shape the assembly" instrument (no generation, nothing persists). */
export function previewAssembly(chatId: ChatId, guided?: GuidedSteerInput): Promise<TrpcClientOutput<"chat.previewAssembly">> {
  return trpc.chat.previewAssembly.query({ chatId, timeZone: UTC_TIME_ZONE, ...(guided === undefined ? {} : { guided }) });
}

/** The whole assembled prompt text (static + dynamic + every in-chat injection's content) as ONE string —
 *  the steer can land in the dynamic suffix OR an in-chat injection depending on the preset's placement, so
 *  a containment assertion over the union is the placement-agnostic instrument. */
export function assembledPromptText(preview: TrpcClientOutput<"chat.previewAssembly">): string {
  return [preview.prompt.static, preview.prompt.dynamic, ...preview.prompt.afterHistory.map((i) => i.content)].join("\n");
}

/** One canon message by id (undefined if absent) — the per-slot instrument for the variant/continuation
 *  legs (a rewrite grows THIS slot's `variantCount`; a continue flips THIS slot's `hasContinuation`/content). */
export async function canonMessage(chatId: ChatId, messageId: MessageId): Promise<CanonMessage | undefined> {
  return (await listCanon(chatId)).find((m) => m.id === messageId);
}

/** The tail assistant canon row (the wand's swipe/continue/rewrite target), or undefined on an empty/
 *  user-tail transcript. A greeting-seeded solo chat has this from `startChat` alone — no model turn. */
export async function tailAssistant(chatId: ChatId): Promise<CanonMessage | undefined> {
  const rows = await listCanon(chatId);
  const tail = rows.at(-1);
  return tail?.role === "assistant" ? tail : undefined;
}

// ── RPG-LITE loop support (rpg-lite-loop.spec.ts). Every hop's RESULT is read as SERVER truth through these:
// `createLiteGame` births the game (host-gated — single-user AUTH_MODE is the host), and `getTrackerView` is
// the persisted-snapshot projection (the flush/snapshot RESULT the CP-4 panel renders). ──

/** Birth a LITE freeform rpg game on an existing chat (`rpg.createGame`, host-gated — single-user is the host).
 *  Writes the `chats.metadata.rpg` pointer that flips the client's CP-4 takeover on. Freeform ⇒ the snapshot
 *  starts empty (no born row) and the first state-changing turn writes the first snapshot. */
export async function createLiteGame(chatId: ChatId): Promise<string> {
  const created = await trpc.rpg.createGame.mutate({ chatId, mode: "lite" });
  return created.gameId;
}

/** Read a game's persisted tracker view (`rpg.getTrackerView`, member-gated — single-user is a member/host).
 *  The SERVER-truth cross-check for the CP-4 panel: what the flush/snapshot actually wrote AND the persisted
 *  snapshot DB read (the projection reads the snapshot rows live). */
export function getTrackerView(chatId: ChatId): Promise<TrackerView> {
  return trpc.rpg.getTrackerView.query({ chatId });
}

/** Read the member game view (`rpg.getGame`). The takeover's mode read + the extraction-mode/read-only pills. */
export function getGame(chatId: ChatId): Promise<TrpcClientOutput<"rpg.getGame">> {
  return trpc.rpg.getGame.query({ chatId });
}

/** Set the game's delivery model (`rpg.updateConfig` — host). `folded` (default) = the character turn records
 *  its own state; `cheap` = a dedicated tool round post-commit. `mode` stays `string` (the
 *  no-inline-union-redecl gate bans re-spelling the homed RPG_EXTRACTION_MODES tuple here; the spec passes the
 *  literal). */
export function setExtractionMode(chatId: ChatId, mode: NonNullable<TrpcInput<"rpg.updateConfig">["extractionMode"]>): Promise<unknown> {
  return trpc.rpg.updateConfig.mutate({ chatId, extractionMode: mode });
}

/** Define the host-owned TRACKERS + custom-relationship hints (`rpg.updateConfig` — host). A passed array
 *  REPLACES the current list (whole-list edit). */
export function setGameFeatures(chatId: ChatId, features: Pick<RpgConfigPatch, "trackers" | "relationshipHints">): Promise<unknown> {
  return trpc.rpg.updateConfig.mutate({ chatId, patch: features });
}

/** Read the host config-editor view (`rpg.getConfigView`). The "is the host setting real?" read. */
export function getConfigView(chatId: ChatId): Promise<TrpcClientOutput<"rpg.getConfigView">> {
  return trpc.rpg.getConfigView.query({ chatId });
}

/** Patch the P3/P4/P5 feature knobs (`rpg.updateConfig.patch` — host). The capstone drives deception/cyoa/
 *  plotProgression from their defaults (deception OFF, cyoa OFF, plotProgression ON) to exercise each wave.
 *  Omit keeps the current value; a passed scalar REPLACES it (the keep-on-omit contract, §config). */
export function setFeatureKnobs(
  chatId: ChatId,
  knobs: Pick<RpgConfigPatch, "deception" | "omniscience" | "hiddenContentReveal" | "immersiveHtml" | "cyoa" | "plotProgression">,
): Promise<unknown> {
  return trpc.rpg.updateConfig.mutate({ chatId, patch: knobs });
}

// ── HAND-PLANE writes (the model-independent backbone). Every rpg plane has a HAND door; the exhaustive spec
// drives each one over the API, then cross-checks getTrackerView (BE/DB) + the CP-4 panel DOM (FE). These are
// the deterministic proofs that a landed write is FE=BE=DB consistent for EVERY plane, without depending on the
// small 8B decomposing that plane (the honest-arms ceiling, plan-for-small-hardware). ──

/** Patch an actor's identity SHEET (`rpg.patchSheet` — host any field, member own `user` ref). The HAND door for
 *  className/attributes/flavor, the per-actor tracker exceptions, and the hand-only `level` plane (§2.6 —
 *  its ONLY write door). (`poolDefs` retired with the tracked-field unification — trackers are host-defined
 *  through `rpg.updateConfig.patch.trackers`, never through a sheet patch.) */
export function patchSheet(chatId: ChatId, actorRef: ActorRefInput, patch: TrpcInput<"rpg.patchSheet">["patch"]): Promise<unknown> {
  return trpc.rpg.patchSheet.mutate({ chatId, actorRef, patch });
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
export async function editSnapshot(chatId: ChatId, patch: TrpcInput<"rpg.editSnapshot">["patch"]): Promise<unknown> {
  return assertHandWrote("rpg.editSnapshot", await trpc.rpg.editSnapshot.mutate({ chatId, patch }));
}

/** The op-shaped per-ACTOR hand door (`rpg.patchActor` — HOST-only). The ops apply IN ORDER against the true
 *  resolved head, each stamping its own fine lock path; `autoLock:false` opts out for a field no model write
 *  can reach. This is the ONLY hand door onto hp/trackerValues/conditions/inventory/wallet/status. */
export async function patchActor(
  chatId: ChatId,
  targetRef: TrpcInput<"rpg.patchActor">["targetRef"],
  ops: TrpcInput<"rpg.patchActor">["ops"],
  opts: Pick<TrpcInput<"rpg.patchActor">, "autoLock"> = {},
): Promise<unknown> {
  return assertHandWrote("rpg.patchActor", await trpc.rpg.patchActor.mutate({ chatId, targetRef, ops, ...opts }));
}

/** Upsert a quest (`rpg.upsertQuest` — HOST-only). `questId` absent ⇒ create. The quest-plane HAND door. */
export function upsertQuest(chatId: ChatId, quest: DistributiveOmit<TrpcInput<"rpg.upsertQuest">, "chatId">): Promise<unknown> {
  return trpc.rpg.upsertQuest.mutate({ chatId, ...quest });
}

/** Define the game's TRACKERS (`rpg.updateConfig.patch.trackers` — host). ONE def home since the tracked-field
 *  unification, so this one call replaces the retired createWidget + cast-field + orb-pin surfaces. */
export function setTrackers(chatId: ChatId, trackers: NonNullable<RpgConfigPatch["trackers"]>): Promise<unknown> {
  return trpc.rpg.updateConfig.mutate({ chatId, patch: { trackers } });
}

/** Add a hand journal entry (`rpg.addJournalEntry` — host). */
export function addJournalEntry(chatId: ChatId, entry: Omit<TrpcInput<"rpg.addJournalEntry">, "chatId">): Promise<unknown> {
  return trpc.rpg.addJournalEntry.mutate({ chatId, ...entry });
}

/** Read a game's journal archive (`rpg.listJournal`, member — lineage-projected). The journal-plane DB read. */
export async function listJournal(chatId: ChatId): Promise<TrpcClientOutput<"rpg.listJournal">> {
  return await trpc.rpg.listJournal.query({ chatId });
}

/** Label the current resolved snapshot (`rpg.createCheckpoint` — host). Returns the minted checkpoint id. */
export function createCheckpoint(chatId: ChatId, label: string): Promise<TrpcClientOutput<"rpg.createCheckpoint">> {
  return trpc.rpg.createCheckpoint.mutate({ chatId, label });
}

/** Clone a checkpointed snapshot forward BORN-COMMITTED (`rpg.restoreCheckpoint` — host). The rewind door. */
export function restoreCheckpoint(chatId: ChatId, checkpointId: string): Promise<unknown> {
  return trpc.rpg.restoreCheckpoint.mutate({ chatId, checkpointId });
}

/** List a game's checkpoints (`rpg.listCheckpoints`). */
export async function listCheckpoints(chatId: ChatId): Promise<TrpcClientOutput<"rpg.listCheckpoints">> {
  return await trpc.rpg.listCheckpoints.query({ chatId });
}

// ── P3 host-reveal (parity-plus §3.6). `revealHidden` is the HOST-gated eye: it derives the parsed `<lie>`/
// `<ofilter>` hidden spans out of the STORED assistant bodies — the truth a member never receives at the wire.
// The capstone plants a `<lie …/>` deterministically via `chat.editMessage` (an 8B won't reliably emit one),
// then asserts the host reads it here + the standing-lie inventory groups it (FE=BE for the Veiled ledger). ──

/** Read the host-reveal eye (`rpg.revealHidden`). The BE truth for the P3 Veiled ledger. */
export function revealHidden(chatId: ChatId): Promise<TrpcClientOutput<"rpg.revealHidden">> {
  return trpc.rpg.revealHidden.query({ chatId });
}

/** Overwrite an assistant message's stored body (`chat.editMessage` — author-or-host; single-user is host).
 *  The deterministic P3/P4/P5 content door: plant a `<lie …/>` tag / a `:::card` fence / a `:::choices` fence
 *  in a real canon row so the render + reveal + strip seams are exercised without depending on the 8B emitting
 *  the exact grammar. The message stays a real durable row (reveal derives from stored bodies). */
export function editMessage(chatId: ChatId, messageId: MessageId, content: string): Promise<unknown> {
  return trpc.chat.editMessage.mutate({ chatId, timeZone: UTC_TIME_ZONE, messageId, content });
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
export function sendGameSteerTurn(chatId: ChatId, kind: NonNullable<NonNullable<TrpcInput<"chat.send">["guided"]>["gameSteer"]>): Promise<unknown> {
  return trpc.chat.send.mutate({
    chatId,
    timeZone: UTC_TIME_ZONE,
    content: "Continue.",
    intent: { maxOutputTokens: 24 },
    guided: { action: "response", gameSteer: kind },
  });
}

/** Flatten a vLLM wire capture's `messages` array to ONE searchable string (openai-compat content join). */
export function wireMessagesText(capture: WireCapture): string {
  const messages = capture.body["messages"];
  if (!Array.isArray(messages)) {
    return "";
  }
  return messages
    .map((message: unknown) => {
      const content = typeof message === "object" && message !== null && "content" in message ? message.content : undefined;
      return typeof content === "string" ? content : JSON.stringify(content);
    })
    .join("\n");
}

// ── The CHAT-side DB witness (`/api/_debug/db/chat/:id` — inspectChatState). rpg has NO raw-TABLE debug dump,
// so getTrackerView is the rpg-plane DB read; THIS is the independent DB witness for the message/event landings
// the turn produced (canon rows + bus events). The rpg FLIGHT RECORDER is a different instrument and is wired
// for this harness since #1493 (`fetchRpgTraces` below; RPG_TRACE=on in support/modes.ts). ──

/** Read the DB inspection for a chat (`/api/_debug/db/chat/:id`, host-gated debug route). The independent DB
 *  witness that the turn's rows + bus events landed (distinct from the tRPC read path). */
export async function inspectChatDb(chatId: ChatId): Promise<ChatInspection> {
  const res = await fetch(`${BASE_URL}/api/_debug/db/chat/${chatId}`, { headers: debugHeaders() });
  if (!res.ok) {
    throw new Error(`e2e db/chat read failed (${res.status})`);
  }
  return chatInspectionSchema.parse(await res.json());
}

/** The debug error ring (`/api/_debug/errors`) — a non-empty list under a "successful" action is the
 *  invisible-bug class this repo exists to kill (observability-harness-verify-landings). */
export async function fetchDebugErrors(): Promise<DebugErrorsResponse["errors"]> {
  const res = await fetch(`${BASE_URL}/api/_debug/errors`, { headers: debugHeaders() });
  if (!res.ok) {
    throw new Error(`e2e debug/errors read failed (${res.status})`);
  }
  return debugErrorsResponseSchema.parse(await res.json()).errors;
}

/** Read a chat's rpg trace ring. REQUIRES `RPG_TRACE=on` in the stack's env (the harness sets it per mode in
 *  support/modes.ts); without it the route is not even registered and this throws rather than reporting a
 *  clean empty ring — "the recorder is off" must never read as "the flush never happened". */
export async function fetchRpgTraces(chatId: ChatId): Promise<RpgTracesResponse["events"]> {
  const res = await fetch(`${BASE_URL}/api/_debug/rpg/traces?chatId=${chatId}`, { headers: debugHeaders() });
  if (!res.ok) {
    throw new Error(`e2e rpg/traces read failed (${res.status}) — is RPG_TRACE=on for this stack? An unwired recorder has no route.`);
  }
  return rpgTracesResponseSchema.parse(await res.json()).events;
}

/** Delete message slots (`chat.deleteMessages`) — the sad-path "deleted turn" driver. */
export function deleteMessages(chatId: ChatId, messageIds: Readonly<TrpcInput<"chat.deleteMessages">["messageIds"]>): Promise<unknown> {
  return trpc.chat.deleteMessages.mutate({ chatId, messageIds: [...messageIds] });
}

/** Abort the in-flight turn on a chat (`chat.abort`) — the sad-path "cancel mid-turn" driver. */
export function abortTurn(chatId: ChatId): Promise<unknown> {
  return trpc.chat.abort.mutate({ chatId });
}
