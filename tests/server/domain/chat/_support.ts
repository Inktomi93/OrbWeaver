// Shared test harness for the chat `persistence/` slice (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Seeds the chat-cluster rows the queries read directly. A fixture may read/insert `users` — the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`, not tests. Timestamps are explicit
// (the persistence layer takes the clock as a PARAM; the schema's `unixepoch()` default would be
// non-deterministic, so every seeded row stamps `FROZEN_AT`).

import type { ChatBusEvent, JoinHistoryVisibility, ParticipantView } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { assets, characters, chatEvents, chatParticipants, chatStreamEvents, chats, messages, messageVariants, pendingTurns, personas } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type {
  AssetId,
  CharacterHandle,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  ChatTurnId,
  Handle,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  ModelId,
  PendingTurnId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { can } from "@orb/server/domain/admin";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/context";
import type { TurnRequest, TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

export const FROZEN_AT = FROZEN_AT_MS;

/** Insert a `users` row; returns its branded id. Thin adapter over the canonical
 *  `factories/user.ts::seedUser` — chat's ~316 call sites pass a bare `handle` string and take the id back
 *  directly (not the full row), so the shared factory is wrapped rather than swapped in wholesale. */
export async function seedUser(db: Db, handle: Handle): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  const row = await seedUserRow(db, { id, handle: castId<Handle>(handle) });
  return row.id;
}

/** Insert a flat `characters` row (D28 — no version table); returns its branded id. */
export async function seedCharacter(
  db: Db,
  ownerId: UserId,
  key: string,
  overrides: { readonly avatarAssetId?: AssetId; readonly id?: CharacterId } = {},
): Promise<CharacterId> {
  // Default id is the readable `character_<key>` (the ~all-call-sites form). `overrides.id` accepts a REAL
  // minted TypeID for the rare test that also puts the id through a contract-schema belt (e.g. an rpg volatile
  // `actorRef.characterId` re-validated at snapshot-write — a fabricated id would be dropped there).
  const id = overrides.id ?? castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(key),
    ownerId,
    name: key,
    contentHash: `hash_${key}`,
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `personas` row; returns its branded id. */
export async function seedPersona(
  db: Db,
  ownerId: UserId,
  key: string,
  overrides: { readonly description?: string; readonly avatarAssetId?: AssetId } = {},
): Promise<PersonaId> {
  const id = castId<PersonaId>(`persona_${key}`);
  await db.insert(personas).values({
    id,
    ownerId,
    name: key,
    description: overrides.description ?? `${key} description`,
    avatarAssetId: overrides.avatarAssetId ?? null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a minimal `assets` row (the #67 persona-avatar-hash join target); returns its branded id. */
export async function seedAsset(db: Db, ownerId: UserId, key: string, overrides: { readonly hash?: string } = {}): Promise<AssetId> {
  const id = castId<AssetId>(`asset_${key}`);
  await db.insert(assets).values({
    id,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: overrides.hash ?? `hash_${key}`,
    uploadedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `chats` row (membership-scoped — no ownerId, D18); returns its branded id. */
export async function seedChat(
  db: Db,
  key: string,
  overrides: {
    readonly title?: string | null;
    readonly archived?: boolean;
    readonly temporary?: boolean;
    readonly parentChatId?: ChatId | null;
    readonly anchorPersonaId?: PersonaId | null;
    readonly metadata?: Record<string, unknown> | null;
    readonly createdAt?: number;
    readonly updatedAt?: number;
    readonly id?: ChatId;
  } = {},
): Promise<ChatId> {
  // `overrides.id` accepts a REAL minted TypeID (the `seedCharacter` precedent) for a test whose chat id
  // crosses a contract-schema belt — e.g. the notifications `record` a host handoff delivers.
  const id = overrides.id ?? castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({
    id,
    title: overrides.title ?? null,
    archived: overrides.archived ?? false,
    temporary: overrides.temporary ?? false,
    parentChatId: overrides.parentChatId ?? null,
    anchorPersonaId: overrides.anchorPersonaId ?? null,
    // The JSON column is `$type<ChatMetadata>()`; tests inject raw blobs (incl. malformed) — cast at the seam.
    metadata: (overrides.metadata ?? null) as never,
    createdAt: overrides.createdAt ?? FROZEN_AT,
    updatedAt: overrides.updatedAt ?? FROZEN_AT,
  });
  return id;
}

/** Insert a `chat_participants` row; returns its branded id. */
export async function seedParticipant(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly key: string;
    readonly userId?: UserId;
    readonly characterId?: CharacterId;
    readonly role?: ParticipantRole;
    readonly joinSeq?: number;
    readonly leftSeq?: number | null;
    readonly disabled?: boolean;
    readonly activePersonaId?: PersonaId | null;
    /** D16 join-history policy. Omitted ⇒ the COLUMN default (`full` — an invited member sees the whole
     *  room history) — the seeder deliberately does not re-spell it, so a seeded row carries the same
     *  default a real redeem writes. Any test whose POINT is the clamp must pass `"from-join"` EXPLICITLY;
     *  the restriction is opt-in and is never what an omitted policy gives you. */
    readonly joinHistoryVisibility?: JoinHistoryVisibility;
  },
): Promise<ChatParticipantId> {
  const id = castId<ChatParticipantId>(`chat_participant_${opts.key}`);
  await db.insert(chatParticipants).values({
    id,
    chatId: opts.chatId,
    kind: opts.userId !== undefined ? "human" : "character",
    userId: opts.userId ?? null,
    characterId: opts.characterId ?? null,
    role: opts.role ?? "member",
    activePersonaId: opts.activePersonaId ?? null,
    disabled: opts.disabled ?? false,
    joinedAt: FROZEN_AT,
    joinSeq: opts.joinSeq ?? 0,
    leftSeq: opts.leftSeq ?? null,
    ...(opts.joinHistoryVisibility !== undefined ? { joinHistoryVisibility: opts.joinHistoryVisibility } : {}),
  });
  return id;
}

/** Insert a message SLOT + its first variant + the `selectedVariantId` pointer (D26 — the 3-step circular-FK
 *  dance). Returns both ids. */
export async function seedMessage(
  db: Db,
  chatId: ChatId,
  seq: number,
  overrides: {
    readonly role?: MessageRole;
    readonly characterId?: CharacterId | null;
    readonly authorUserId?: UserId | null;
    readonly personaId?: PersonaId | null;
    readonly excludedFromPrompt?: boolean;
    readonly content?: string;
    /** The selected variant's DURABLE reasoning trace (`message_variants.reasoning` — what a completed turn
     *  persists and `MessageView.reasoning` serves). Omitted ⇒ null, the no-reasoning row. */
    readonly reasoning?: string | null;
    /** Stamp the selected variant's fit-boundary provenance (the earliest-KEPT message id the turn that
     *  produced this row committed) — the recall live-window cutoff reads the newest assistant row's stamp. */
    readonly contextBoundaryMessageId?: MessageId | null;
    /** Override the frozen commit time — the per-chat `lastMessageAt` aggregate is a MAX over this, so a
     *  test that asserts which row set "last activity" needs distinguishable stamps. */
    readonly createdAt?: number;
  } = {},
): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const messageId = castId<MessageId>(`message_${chatId}_${seq}`);
  const variantId = castId<MessageVariantId>(`variant_${chatId}_${seq}_0`);
  await db.insert(messages).values({
    id: messageId,
    chatId,
    seq,
    role: overrides.role ?? "assistant",
    characterId: overrides.characterId ?? null,
    authorUserId: overrides.authorUserId ?? null,
    personaId: overrides.personaId ?? null,
    excludedFromPrompt: overrides.excludedFromPrompt ?? false,
    createdAt: overrides.createdAt ?? FROZEN_AT,
  });
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: overrides.content ?? `body-${seq}`,
    reasoning: overrides.reasoning ?? null,
    ...(overrides.contextBoundaryMessageId !== undefined ? { contextBoundaryMessageId: overrides.contextBoundaryMessageId } : {}),
    createdAt: FROZEN_AT,
  });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  return { messageId, variantId };
}

/** A fake roster resolver — maps present `chat_participants` rows to minimal `ParticipantView`s (the root
 *  resolves the real `users` publics; here the handle/name derive from the id — the `fork.ts` test precedent).
 *  Byte-identical across fork/invites/start-chat/read; call fresh per test (after `db = await freshDb()`) so it
 *  closes over the current test's db. */
export function makeLoadParticipantViews(db: Db): (chatId: ChatId) => Promise<readonly ParticipantView[]> {
  return async (chatId: ChatId): Promise<readonly ParticipantView[]> => {
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), isNull(chatParticipants.leftSeq)));
    return rows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      kind: r.kind,
      userId: r.userId,
      characterId: r.characterId,
      role: r.role,
      activePersonaId: r.activePersonaId,
      talkativeness: r.talkativeness,
      disabled: r.disabled,
      joinedAt: r.joinedAt,
      joinSeq: r.joinSeq,
      leftSeq: r.leftSeq,
      joinHistoryVisibility: r.joinHistoryVisibility,
      displayName: r.userId ?? r.characterId ?? "",
      handle: r.userId === null ? null : castId<Handle>(r.userId),
      avatarAssetId: null,
      avatarHash: null,
    }));
  };
}

/** Append an extra variant (swipe) to an existing slot — for the `variantCount` / `selectedVariantIdx` reads. */
export async function addVariant(db: Db, messageId: MessageId, idx: number, content: string): Promise<MessageVariantId> {
  const variantId = castId<MessageVariantId>(`variant_${messageId}_${idx}`);
  await db.insert(messageVariants).values({ id: variantId, messageId, idx, content, createdAt: FROZEN_AT });
  return variantId;
}

/** Insert a durable chat-bus log row (a `delta`). The row param takes the bare token text (its D16 clamp
 *  anchor then defaults to the event's own seq — an unclamped-caller fixture) or `{text, slotSeq}` to pin the
 *  `messages.seq` of the canon slot the tokens stream into. Same shape as {@link seedStreamEvent}. */
export async function seedChatEvent(
  db: Db,
  chatId: ChatId,
  seq: number,
  row: string | { readonly text: string; readonly slotSeq: number },
): Promise<ChatEventId> {
  const id = castId<ChatEventId>(`chat_event_${chatId}_${seq}`);
  const { text, slotSeq } = typeof row === "string" ? { text: row, slotSeq: seq } : row;
  const payload: ChatBusEvent = { type: "delta", chatId, slotSeq, delta: { chatId, kind: "text", text } };
  await db.insert(chatEvents).values({ id, chatId, seq, type: "delta", payload, createdAt: FROZEN_AT });
  return id;
}

/** Insert a resumable SSE token-log row. `messageId` anchors the row to a canon slot (null = a turn-level
 *  delta streamed before its slot committed — the shape the D16 replay floor withholds from a clamped
 *  caller, since it carries no seq to classify against). */
export async function seedStreamEvent(
  db: Db,
  chatId: ChatId,
  seq: number,
  row: string | { readonly delta: string; readonly messageId: MessageId | null },
): Promise<ChatStreamEventId> {
  const id = castId<ChatStreamEventId>(`stream_event_${chatId}_${seq}`);
  const { delta, messageId } = typeof row === "string" ? { delta: row, messageId: null } : row;
  await db.insert(chatStreamEvents).values({ id, chatId, seq, kind: "text", delta, messageId, createdAt: FROZEN_AT });
  return id;
}

/** Insert a deferred (host-offline) turn. */
export async function seedPendingTurn(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly key: string;
    readonly triggeredBy: UserId;
    readonly runAsUserId: UserId;
    readonly createdAt?: number;
  },
): Promise<PendingTurnId> {
  const id = castId<PendingTurnId>(`pending_turn_${opts.key}`);
  await db.insert(pendingTurns).values({
    id,
    chatId: opts.chatId,
    triggeredBy: opts.triggeredBy,
    runAsUserId: opts.runAsUserId,
    createdAt: opts.createdAt ?? FROZEN_AT,
  });
  return id;
}

/**
 * Build a full `ChatContext` for the verb int-tests — the REAL db + the REAL admin `can()` (the PD-1 unified
 * seam, wired as the root will) + a frozen clock + deterministic id minters. Every cross-feature op defaults
 * to a throwing stub (an accidental reach fails loudly), overridable per test (`getCard`/`emitNotification`
 * are the ones these verbs touch). The chat bus `emit` is NOT a ctx field (chat's own collaborator) — tests
 * pass a spy `emit` as the verb factory's second arg.
 */
export function makeChatContext(db: Db, overrides: Partial<ChatContext> = {}): ChatContext {
  let counter = 0;
  const mint =
    <T extends string>(prefix: string): (() => T) =>
    (): T => {
      counter += 1;
      return castId<T>(`${prefix}_${counter}`);
    };
  // ONE throwing stub for every cross-feature op these verbs do not touch — an accidental reach fails loudly.
  const notStubbed = (): never => {
    throw new Error("ChatContext op not stubbed in this test");
  };
  const base: ChatContext = {
    db,
    now: () => FROZEN_AT,
    // D121-E: the four-scope regex dereference. Empty by default — a suite that wants host-tier regex
    // overrides this op, exactly as it overrides `resolveForeignInputs`.
    resolveRegexSources: () => Promise.resolve({ hostGlobal: [], preset: [], cast: [], chat: [] }),
    can,
    newChatId: mint<ChatId>("chat"),
    newMessageId: mint<MessageId>("message"),
    newMessageVariantId: mint<MessageVariantId>("variant"),
    newMessageAssetId: mint<MessageAssetId>("message_asset"),
    newParticipantId: mint<ChatParticipantId>("chat_participant"),
    newInjectionId: mint<ChatInjectionId>("chat_injection"),
    newEventId: mint<ChatEventId>("chat_event"),
    newStreamEventId: mint<ChatStreamEventId>("stream_event"),
    newInviteId: mint<ChatInviteId>("chat_invite"),
    newPendingTurnId: mint<PendingTurnId>("pending_turn"),
    newChatTurnId: mint<ChatTurnId>("chat_turn"),
    hashToken: (token) => `h:${token}`,
    audit: () => Promise.resolve(),
    // PD user-bus lane: no-op default (the terminal path + LIST-level ops fan `chatsChanged` to members; a
    // test that asserts the fan overrides `emitChatChanged` with a recorder — see the fan emit-site tests).
    emitChatChanged: () => Promise.resolve(),
    // Default = the NATIVE replace (no node:vm) — deterministic + fast for tests. A test that exercises the
    // D53 watchdog seam (WI/SEND/RECEIVE) overrides this with a fake that throws on a pathological pattern.
    tools: null,
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    runChatTurn: notStubbed,
    // The side-gen sampling ladder's middle rung (chat host preset params) — default = an empty posture so the
    // per-site floors stand (byte-identical to pre-ladder behavior). A test exercising the override supplies its own.
    resolveChatPresetParams: () => Promise.resolve({}),
    // PROSE-1 — no host override by default, so every assembled/side-gen prompt is the shipped default.
    resolveChatProse: () => Promise.resolve({}),
    resolveChat: notStubbed,
    resolveCredential: notStubbed,
    maybeRevokeOnAuthFailed: notStubbed,
    getCard: () => Promise.resolve(null),
    // The host-handoff COPY ops (stickler 2026-08-03 §5). Defaults are the NO-OFFER shape — copy nothing, own
    // no statements — so every pre-offer handoff test stays byte-identical; an offer test overrides them with
    // the real domain factories (`createCopyHandoffCards`/`createCopyHandoffBooks`/`createHandoffRestampStatements`),
    // not a fake, since the whole arm is about what actually lands in the other domain's tables.
    copyHandoffCards: () => Promise.resolve([]),
    copyHandoffBooks: () => Promise.resolve([]),
    restampHandoffDigests: () => Promise.resolve([]),
    // D22 member-card tags — default "no accepted tags" (safe floor); a member-card test overrides it.
    resolveCharacterTags: () => Promise.resolve([]),
    // D44 §12.0/§12.1/§12.5 + BG-C — ONE seat-decoration read: default to the safe floor (untrusted; external
    // media gated), no theme/background override, no card. Overridable per test.
    resolveSeatDeco: () =>
      Promise.resolve({ renderPolicy: { trustHtml: false, forbidExternalMedia: true }, themeOverride: null, backgroundOverride: null, card: null }),
    resolveImageUrl: notStubbed,
    // Called UNCONDITIONALLY by `loadParticipantViews` on every roster-view build (never opt-in like
    // `resolveImageUrl`) — defaults to "nothing resolves" (mirrors `resolveThemeOverride`'s safe-floor
    // default), not `notStubbed`, or every existing roster test would need an override for a field it
    // never asserts on. A test asserting `avatarHash` overrides with a resolver fake.
    resolveAssetHash: () => Promise.resolve(null),
    // #67 send-attach trust boundary — default "owns nothing" (safe floor); a test that attaches overrides
    // this with a fake returning the ids it seeded as owned.
    filterOwnedAssetIds: () => Promise.resolve([]),
    // F-P0-2: only `setChatBackground` with a `kind:"external"` source reaches this — throws loudly otherwise;
    // the external-materialize test overrides it with a stub returning a stored asset (or a typed refusal).
    materializeBackground: notStubbed,
    resolveUserPublics: notStubbed,
    mintSyntheticGroupCharacter: notStubbed,
    // The assemble gather calls this every round (round-level recall over the shared bucket); default to
    // "not yet minted" so a test that seeds no memory never reaches the recall search.
    findSyntheticGroupCharacter: () => Promise.resolve(null),
    // The stats push default is a NO-OP (the contract's "default injection is a no-op" — the canon-mutator
    // verbs push on every write path now; a test that asserts stats overrides with a recorder).
    applyStatsDelta: () => undefined,
    summarize: notStubbed,
    summarizerContextTokens: 32_000,
    memorySummarizer: {},
    // The emit-op CONTRACT (PD-24): the op OWNS the commit of the producer's co-statements (the verb hands
    // them UNEXECUTED). The default fake honors that half (executes them; drops the event) so a membership
    // transition still lands; a test that asserts events overrides with a recorder that does the same.
    emitNotification: async (_event, coStatements) => {
      if (coStatements !== undefined && coStatements.length > 0) {
        await db.batch(batchMany(coStatements as BatchStmt[]));
      }
    },
    // Default = everyone ONLINE (loadRoom presence-gates the persona set every turn — PD-70). This keeps the
    // no-multi-human-presence tests byte-identical (no persona drops); a cast-gating test overrides with a
    // fake that returns `online:false` for the away member.
    readPresence: (userId) => Promise.resolve({ userId, online: true, lastSeenAt: null }),
    // The imagery op (chat.generateImage) — a throwing stub; the generate-image verb test overrides it.
    generatePicture: notStubbed,
    // Default = null ⇒ expressions not wired (byte-identical no-op — the `tools` precedent). A classify-hook
    // test overrides with a recorder to assert the fire-and-forget after commit.
    expressions: null,
    rpg: null,
    // Default = null ⇒ the chat-crew director isn't wired (byte-identical no-op — chat-crew-design/04 §1). A
    // director test overrides with a stub returning the guidance injection.
    crew: null,
    // Default = null ⇒ no PromptTransform registrar wired (byte-identical no-op — automation-design/04 §6). A
    // transform test overrides with a `createPromptTransformRegistry(...).apply`.
    promptTransforms: null,
    resolveHandle: notStubbed,
    // The startChat anchor default-seed: default "no user-level active persona" — an explicit
    // anchorPersonaId in a test flows unchanged; a seeding test overrides with a resolver fake.
    resolveDefaultPersona: () => Promise.resolve(null),
    // Pointer #2 (FINAL-Persona §A.0): default "no current persona" — the current-persona seed-chain
    // tests override with a resolver fake, same shape as `resolveDefaultPersona` above.
    resolveCurrentPersona: () => Promise.resolve(null),
    // The character-lock hop (D62): default "no connection" — the connected-anchor tests override
    // with a resolver fake (the REAL join is the composition root's; op fakes keep tests op-shaped).
    resolveConnectedPersona: () => Promise.resolve(null),
    // Default = the REAL ownership read against the seeded `personas` (mirrors the root's `verifyPersonaOwned`)
    // so the `reattributePersona` tests need no per-test override; a test may override to force a verdict.
    verifyPersonaOwned: async ({ ownerId, personaId }) => {
      const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);
      return rows[0]?.ownerId === ownerId;
    },
    embeddingsStore: notStubbed,
    searchDigests: notStubbed,
    searchCorpus: notStubbed,
    log: () => undefined,
    getGroupConfig: notStubbed,
    getRoomOverrides: notStubbed,
    // ⑧(a) — default the reap TTL to the 24h floor; a reap test overrides to prove the knob threads.
    resolveTempChatTtlHours: () => Promise.resolve(24),
    // D46 config plane — default "no declared ChoiceBlock variables" so `getVariables` collapses to the raw
    // stored picks (orphan-preserve); a variables test overrides with the preset's declared specs.
    resolvePromptVariables: () => Promise.resolve([]),
    // #24 — default "the host's preset declares no user macros" so `getUserMacroPicks` returns the empty
    // pane; a picks test overrides with the declarations it wants rendered.
    resolvePromptUserMacros: () => Promise.resolve([]),
  };
  return { ...base, ...overrides };
}

/** The minimal `ModelCapability` shape the chat engine/verb int-tests inject — reasoning off, an 8k output
 *  ceiling, a 200k window. Byte-identical across the engine/service/turn/round/solo/pipeline suites (W1d hoist).
 *  FABRICATION-OK: only the fields the belts read are populated; the fake role never validates the full shape. */
// FABRICATION-OK: partial ModelCapability — only the belt-read fields are set (see above).
export const TEST_CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

/** A `ResolvedConnection` over `TEST_CAPABILITY` (`source` defaults to `"vllm"`). Byte-identical `connectionOf`
 *  in service/turn/engine.int (W1d hoist). */
export function testConnection(source = "vllm", api: ResolvedConnection["api"] = "chat-completions"): ResolvedConnection {
  return {
    api,
    model: castId<ModelId>("test-model"),
    // FABRICATION-OK: minimal ResolvedCredential double — only `.source` is read (§9 consent belt).
    credential: { source, credentialId: null } as unknown as ResolvedCredential,
    capability: TEST_CAPABILITY,
  };
}

/** A scripted role turn that captures each `TurnRequest` into `sink` then yields a fixed `"reply"` text delta +
 *  the terminal `final` economics. Byte-identical `scriptedRole` in solo/round (W1d hoist). */
export function scriptedRoleTurn(sink: TurnRequest[]): ChatContext["runChatTurn"] {
  return (req: TurnRequest) => {
    sink.push(req);
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "reply" };
      yield { kind: "final", economics: { content: "reply", tokensIn: 2, tokensOut: 1 } };
    })();
  };
}

/** The no-op `runCompaction` engine dep the non-compaction turn harnesses inject — managed compaction is
 *  agent-sdk + over-threshold only, so a plain turn never invokes it, but `createTurnEngine` now REQUIRES the dep.
 *  ONE home for the stub (the managed-compaction suite wires the REAL core). Returns an idempotent no-op result. */
export const stubRunCompaction = (_args: {
  readonly chatId: ChatId;
  readonly connection: ResolvedConnection;
  readonly ownerId: UserId;
  readonly coveragePoint?: number | undefined;
  readonly instructions?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}): Promise<{ readonly summary: string; readonly compactedAtSeq: number; readonly updated: boolean }> =>
  Promise.resolve({ summary: "", compactedAtSeq: 0, updated: false });
