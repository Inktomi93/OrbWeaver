// The ONE orb-native chat-bundle serde core (R6) — both directions in one home, defined through the R3 spine
// (`#kit/serde/lib`), so build + parse can never drift and the envelope/version-gate/emit exist exactly once.
//
// WHY IT EXISTS, beside the ST jsonl serde that is NOT going away: the bundle's chat arm was the ST
// interchange, which carries messages + `note_prompt` + `main_chat` and nothing else. Every chat-anchored
// plane born after the portability spec froze — rpg campaigns, `chat_injections`, room overrides, the
// `chat_tags` overlay, the per-chat variable/macro picks — was therefore unportable BY CONSTRUCTION, and a
// full-account backup silently dropped whole planes the owner authors daily (F9). This file is the fidelity
// arm. The jsonl serde stays the ST INTERCHANGE (foreign import, the single-chat share door); this one is
// what an ACCOUNT BACKUP carries.
//
// NO IDS TRAVEL, AND THAT IS THE DESIGN. Chat/message/variant ids are not preserved across a box, so every
// cross-plane reference in this file is POSITIONAL:
//   • a message is `messages[i]` — `messageIndex`
//   • a variant is `messages[i].variants[j]` — `{ messageIndex, variantIdx }`
//   • a checkpoint's snapshot is `rpg.snapshots[k]` — `snapshotIndex`
// The import verb writes the canon first, collects the new ids in the SAME order, and re-links the rpg planes
// through that remap. A reference that points past the end of its plane is DROPPED at parse (see
// `pruneDangling`) rather than landing an orphan row — the one place this file is opinionated about the
// far side, because a dangling variant ref is unrepresentable at the db (NOT NULL FKs on
// `rpg_turn_tool_calls`) and would abort an otherwise-good restore.
//
// RE-LINK BY NAME, never by id (the databank/gallery precedent): characters by HANDLE, the anchor persona and
// the tag overlay by NAME. An unresolvable handle/name degrades that one link, never the chat.
//
// WHAT DELIBERATELY DOES NOT TRAVEL (each is a ruling, not an omission):
//   • `chats.runtimeVariables` — DERIVED (the O(1) fold of the selected chain's `variable_delta`). The
//     deltas themselves ride on each variant, so the cache re-derives; carrying it would ship a cache.
//   • `pendingHostUserId` / `pendingHandoffOffer` / `chat_invites` / non-host human participants — they name
//     USERS who do not exist on the target box. A restore seats the importer as host, alone.
//   • `temporary` — an ephemeral room with a TTL over `createdAt`; restoring one would resurrect a room its
//     own sweeper already decided to reap.
//   • `chat_events` / `chat_stream_events` / `pending_turns` / `chat_locks` — RUNTIME.
//   • `rpg_games.gmUserId` / `gmPresetId` — a cross-box user seat and a preset id that is not preserved.
//     Both are nullable and their NULL is a real state (seatless / augment-your-own-preset), so dropping
//     them lands a legal game rather than a dangling FK.
//   • `parentChatId` fork lineage — a fork edge between two chats in the SAME bundle would need a chat-level
//     remap the delivery core (one `importFile` per file, no cross-file state) cannot express. The jsonl arm's
//     `parentRef` filename linkage is the only lineage that survives, and it does so unchanged.
//
// Round-trip drift guard: buildChatBundleFile(parseChatBundleFile(buildChatBundleFile(c))) === build(c).

import type { MessageKind, TokenProvenance } from "@orb/contracts/chat";
import { CHAT_INJECTION_POSITIONS, messageKindSchema, messageRoleSchema, tokenProvenanceSchema, varOpSchema } from "@orb/contracts/chat";
import type { PortableParse } from "@orb/contracts/portability";
import { userMacroValuesSchema } from "@orb/contracts/preset";
import type {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RpgGameConfig,
  RpgRecordedToolCall,
  RpgSheet,
  RpgSnapshotState,
} from "@orb/contracts/rpg";
import {
  RPG_TOOL_CALL_VERDICTS,
  rpgCheckpointTriggerSchema,
  rpgGameConfigSchema,
  rpgGameModeSchema,
  rpgGameStatusSchema,
  rpgJournalTypeSchema,
  rpgSheetSchema,
  rpgSnapshotStateSchema,
} from "@orb/contracts/rpg";
import type { MessageRole } from "@orb/kit/message-role";
import { z } from "zod";
import { defineJsonObjectSerde } from "#kit/serde/lib";

export const CHAT_BUNDLE_SCHEMA_KIND = "orb.chat.bundle";
export const CHAT_BUNDLE_SCHEMA_VERSION = 1;

/** The bundle file extension the chat descriptor emits and its import half routes on. Distinct from the ST
 *  `.jsonl` sibling that shares the `chats/` dir — the two are told apart by their BYTES (the envelope), and
 *  this suffix only picks which parser is TRIED first. */
export const CHAT_BUNDLE_EXT = ".orb.json";

// ── the canonical shape (POSITIONAL refs, NAME-level re-links) ────────────────────────────────────────────

/** One swipe of a message, with the orb-only economics + `variableDelta` the ST arm cannot carry. */
export interface PortableChatVariant {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: TokenProvenance;
  readonly reasoning: string | null;
  readonly ttftMs: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  /** The per-variant runtime-variable ops. Carrying THESE (not the folded cache) is what lets the restore
   *  re-derive `chats.runtimeVariables` instead of shipping a snapshot of it. */
  readonly variableDelta: readonly z.infer<typeof varOpSchema>[] | null;
  readonly metadata: Record<string, unknown> | null;
}

/** One message slot. `speakerHandle` re-links an assistant turn's voice by the character HANDLE it was
 *  exported under; `personaName` re-links a user turn's authoring persona. Both degrade to the room's
 *  primary / no-persona when the target box does not hold them. */
export interface PortableChatMessage {
  readonly role: MessageRole;
  readonly kind: MessageKind;
  readonly speakerHandle: string | null;
  readonly personaName: string | null;
  readonly createdAt: number;
  readonly selectedIdx: number;
  readonly variants: readonly PortableChatVariant[];
}

/** One `chat_injections` row — the per-chat prose plane that replaced the room-override author's-note twin
 *  (owner ruling 2026-08-01) and that the ST arm can only carry ONE of, one-way. */
export interface PortableChatInjection {
  readonly position: (typeof CHAT_INJECTION_POSITIONS)[number];
  readonly depth: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly order: number | null;
  readonly createdAt: number;
}

/** One `rpg_sheets` row. The actor is a character (by handle) XOR the HOST human — `characterHandle: null`
 *  means the user seat, which on restore is the importer (the only human the room has). */
export interface PortableRpgSheet {
  /** Foreign-file identity. The import verb validates and resolves it against the destination library. */
  // @orb-waive brand-in-name-position(characterHandle): this is untrusted portable-file text, parsed and resolved against the destination library only by the import verb; branding it here would claim validation the serde boundary has not performed. Ends if the bundle schema parses this field to CharacterHandle before exposing it.
  readonly characterHandle: string | null;
  readonly sheet: RpgSheet;
}

/** One `rpg_snapshots` row. A TURN row carries `{messageIndex, variantIdx}`; a HAND row carries neither and
 *  may carry `asOfMessageIndex` (its order stamp) — the two-arm CHECK, expressed positionally. */
export interface PortableRpgSnapshot {
  readonly messageIndex: number | null;
  readonly variantIdx: number | null;
  readonly asOfMessageIndex: number | null;
  readonly committed: boolean;
  readonly createdAt: number;
  readonly state: RpgSnapshotState;
}

/** One `rpg_journal` entry. `variantIndex` null = a HAND entry (visible on every lineage); non-null = a model
 *  entry, visible only while its swipe is selected. */
export interface PortableRpgJournalEntry {
  readonly type: (typeof RPG_JOURNAL_TYPES)[number];
  readonly label: string;
  readonly title: string;
  readonly content: string;
  readonly messageIndex: number | null;
  readonly variantIdx: number | null;
  readonly sourceMessageIndex: number | null;
  readonly createdAt: number;
}

/** One `rpg_turn_tool_calls` row — what the model DID on a folded turn. Both refs are NOT NULL at the db, so
 *  a row whose message/variant did not survive the round trip is dropped at parse, never half-written. */
export interface PortableRpgTurnToolCalls {
  readonly messageIndex: number;
  readonly variantIdx: number;
  readonly calls: readonly RpgRecordedToolCall[];
  readonly createdAt: number;
}

/** One `rpg_checkpoints` row, pointing at `snapshots[snapshotIndex]`. */
export interface PortableRpgCheckpoint {
  readonly snapshotIndex: number;
  readonly label: string;
  readonly trigger: (typeof RPG_CHECKPOINT_TRIGGERS)[number];
  readonly createdAt: number;
}

/** The whole chat-anchored rpg campaign. Null on a chat with no game (the overwhelmingly common case — a
 *  gameless chat's bundle is byte-identical to one written before this plane existed). */
export interface PortableRpgGame {
  readonly mode: (typeof RPG_GAME_MODES)[number];
  readonly status: (typeof RPG_GAME_STATUSES)[number];
  readonly sessionNumber: number;
  readonly config: RpgGameConfig;
  readonly createdAt: number;
  readonly sheets: readonly PortableRpgSheet[];
  readonly snapshots: readonly PortableRpgSnapshot[];
  readonly journal: readonly PortableRpgJournalEntry[];
  readonly turnToolCalls: readonly PortableRpgTurnToolCalls[];
  readonly checkpoints: readonly PortableRpgCheckpoint[];
}

/** One chat, whole. `characterHandles` is the seated cast with the PRIMARY first (the run's fallback voice);
 *  `importHash` is the per-chat dedup oracle that makes a re-import idempotent instead of duplicating. */
export interface PortableChat {
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly starred: boolean;
  readonly archived: boolean;
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
  /** The room-behavior blob VERBATIM (group config / room overrides / opening policy / rpg pointer …). Its
   *  shape is validated at the chat column's OWN `parseChatMetadata` read seam on the way in — one
   *  validation home, no second spelling here (and `server/kit` sits BELOW `domain`, so that parser is not
   *  reachable from this file by construction). */
  readonly metadata: Record<string, unknown> | null;
  readonly variableValues: Record<string, string> | null;
  readonly userMacroValues: z.infer<typeof userMacroValuesSchema> | null;
  readonly anchorPersonaName: string | null;
  readonly characterHandles: readonly string[];
  readonly tagNames: readonly string[];
  readonly injections: readonly PortableChatInjection[];
  readonly messages: readonly PortableChatMessage[];
  readonly rpg: PortableRpgGame | null;
}

// ── the wire schemas ──────────────────────────────────────────────────────────────────────────────────────

const nullableIndex = z.number().int().nonnegative().nullish().catch(null);
const index = z.number().int().nonnegative();

const wireVariantSchema = z.object({
  idx: z.number().int().nonnegative(),
  content: z.string(),
  model: z.string().nullish().catch(null),
  provider: z.string().nullish().catch(null),
  tokensIn: z.number().int().nullish().catch(null),
  tokensOut: z.number().int().nullish().catch(null),
  // NOT refined against the token axes — the contradiction is RESOLVED on read, in `variantFromWire`.
  // See {@link resolveTokenProvenance} for why a contradictory pair is a live durable row and not a
  // malformed file.
  tokenProvenance: tokenProvenanceSchema.optional(),
  reasoning: z.string().nullish().catch(null),
  ttftMs: z.number().int().nullish().catch(null),
  genStartedAt: z.number().int().nullish().catch(null),
  genFinishedAt: z.number().int().nullish().catch(null),
  // A malformed delta degrades THIS VARIANT's ops to none, never the file. The ops feed a DERIVED cache
  // (`chats.runtimeVariables`), so losing one turn's ops costs a fold; refusing the file costs the chat.
  // Same trade the spine's "drop" row policy makes one level up.
  variableDelta: z.array(varOpSchema).nullish().catch(null),
  metadata: z.record(z.string(), z.unknown()).nullish().catch(null),
});

const wireMessageSchema = z.object({
  role: messageRoleSchema,
  kind: messageKindSchema.catch("standard"),
  speakerHandle: z.string().nullish().catch(null),
  personaName: z.string().nullish().catch(null),
  createdAt: z.number().int(),
  selectedIdx: z.number().int().nonnegative().catch(0),
  variants: z.array(wireVariantSchema),
});

const wireInjectionSchema = z.object({
  position: z.enum(CHAT_INJECTION_POSITIONS),
  depth: z.number().int().catch(0),
  role: messageRoleSchema,
  content: z.string(),
  order: z.number().int().nullish().catch(null),
  createdAt: z.number().int(),
});

// The record's own contract type carries no zod schema (it is produced, never parsed, in live code), so the
// wire shape is declared HERE — the serde owns its wire shapes (`server/kit` type-home-exempt, the chat-jsonl
// precedent) — and `satisfies` pins it to the contract so a field change fails tsc here rather than silently
// dropping data from a restore.
const wireRecordedToolCallSchema = z.object({
  name: z.string(),
  args: z.string(),
  verdict: z.enum(RPG_TOOL_CALL_VERDICTS),
  issues: z
    .array(z.string())
    .catch([])
    .transform((issues): readonly string[] => issues),
}) satisfies z.ZodType<RpgRecordedToolCall, unknown>;

const wireRpgSchema = z.object({
  mode: rpgGameModeSchema,
  status: rpgGameStatusSchema,
  sessionNumber: z.number().int().positive().catch(1),
  config: rpgGameConfigSchema,
  createdAt: z.number().int(),
  // A foreign handle is opaque carriage until the import verb resolves it against the owner's canonical
  // library. Keep the wire value unbranded here; the lookup boundary validates the real handle contract.
  sheets: z.array(z.object({ characterHandle: z.string().min(1).nullish().catch(null), sheet: rpgSheetSchema })),
  snapshots: z.array(
    z.object({
      messageIndex: nullableIndex,
      variantIdx: nullableIndex,
      asOfMessageIndex: nullableIndex,
      committed: z.boolean().catch(false),
      createdAt: z.number().int(),
      state: rpgSnapshotStateSchema,
    }),
  ),
  journal: z.array(
    z.object({
      type: rpgJournalTypeSchema,
      label: z.string().catch(""),
      title: z.string(),
      content: z.string(),
      messageIndex: nullableIndex,
      variantIdx: nullableIndex,
      sourceMessageIndex: nullableIndex,
      createdAt: z.number().int(),
    }),
  ),
  turnToolCalls: z.array(
    z.object({
      messageIndex: index,
      variantIdx: index,
      calls: z.array(wireRecordedToolCallSchema),
      createdAt: z.number().int(),
    }),
  ),
  checkpoints: z.array(
    z.object({
      snapshotIndex: index,
      label: z.string(),
      trigger: rpgCheckpointTriggerSchema,
      createdAt: z.number().int(),
    }),
  ),
});

const wireChatSchema = z.object({
  title: z.string().catch(""),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  starred: z.boolean().catch(false),
  archived: z.boolean().catch(false),
  compactSummary: z.string().nullish().catch(null),
  compactedAtSeq: z.number().int().nullish().catch(null),
  metadata: z.record(z.string(), z.unknown()).nullish().catch(null),
  variableValues: z.record(z.string(), z.string()).nullish().catch(null),
  userMacroValues: userMacroValuesSchema.nullish().catch(null),
  anchorPersonaName: z.string().nullish().catch(null),
  characterHandles: z.array(z.string().trim().min(1)).catch([]),
  tagNames: z.array(z.string().trim().min(1)).catch([]),
  injections: z.array(wireInjectionSchema).catch([]),
  messages: z.array(wireMessageSchema),
  rpg: wireRpgSchema.nullish().catch(null),
});

type WireChat = z.infer<typeof wireChatSchema>;

// ── positional-reference integrity ────────────────────────────────────────────────────────────────────────

/** Does `{messageIndex, variantIdx}` name a variant this file actually carries? A file hand-edited (or
 *  written by a build whose message set was pruned) can name one it does not. */
function variantExists(messages: readonly PortableChatMessage[], messageIndex: number | null, variantIdx: number | null): boolean {
  if (messageIndex === null || variantIdx === null) {
    return false;
  }
  const message = messages[messageIndex];
  return message !== undefined && message.variants[variantIdx] !== undefined;
}

/** DROP every rpg row whose positional anchor does not resolve, rather than let the import write an orphan.
 *  Per plane, matching the db's own arms:
 *    • snapshot — a TURN row (message+variant) with a dead anchor becomes a HAND row (its STATE is real game
 *      history; only its position was lost), so the campaign survives a pruned transcript.
 *    • journal — a MODEL entry with a dead variant is dropped (`rpg_journal`'s CASCADE says an entry whose
 *      swipe died is a leak, not history); a hand entry with a dead `sourceMessageIndex` just loses the stamp.
 *    • turn tool calls — both refs are NOT NULL at the db, so a dead anchor drops the row.
 *    • checkpoint — RESTRICT on its snapshot at the db, so a dead `snapshotIndex` drops the row.
 *  This is the ONE place the serde reasons about the far side, and it earns it: every case here is a row the
 *  write boundary would otherwise refuse, taking the whole restore with it. */
function pruneDangling(rpg: PortableRpgGame, messages: readonly PortableChatMessage[]): PortableRpgGame {
  const messageExists = (i: number | null): boolean => i !== null && messages[i] !== undefined;
  const snapshots = rpg.snapshots.map((s): PortableRpgSnapshot => {
    if (variantExists(messages, s.messageIndex, s.variantIdx)) {
      return s;
    }
    return {
      ...s,
      messageIndex: null,
      variantIdx: null,
      asOfMessageIndex: messageExists(s.asOfMessageIndex) ? s.asOfMessageIndex : null,
    };
  });
  return {
    ...rpg,
    snapshots,
    journal: rpg.journal
      .filter((e) => e.variantIdx === null || variantExists(messages, e.messageIndex, e.variantIdx))
      .map((e) => (messageExists(e.sourceMessageIndex) ? e : { ...e, sourceMessageIndex: null })),
    turnToolCalls: rpg.turnToolCalls.filter((t) => variantExists(messages, t.messageIndex, t.variantIdx)),
    checkpoints: rpg.checkpoints.filter((c) => snapshots[c.snapshotIndex] !== undefined),
  };
}

// ── the serde ─────────────────────────────────────────────────────────────────────────────────────────────

function variantToWire(v: PortableChatVariant): WireChat["messages"][number]["variants"][number] {
  return {
    idx: v.idx,
    content: v.content,
    model: v.model,
    provider: v.provider,
    tokensIn: v.tokensIn,
    tokensOut: v.tokensOut,
    tokenProvenance: v.tokenProvenance,
    reasoning: v.reasoning,
    ttftMs: v.ttftMs,
    genStartedAt: v.genStartedAt,
    genFinishedAt: v.genFinishedAt,
    variableDelta: v.variableDelta === null ? null : [...v.variableDelta],
    metadata: v.metadata,
  };
}

/**
 * The variant's provenance, DERIVED whenever the file's own label disagrees with its token axes.
 *
 * WHY THIS IS A RESOLUTION AND NOT A REFUSAL. A contradictory pair — numeric tokens carrying
 * `'unrecorded'` — is a LIVE DURABLE ROW on this tree, not a corrupt file. The column
 * `message_variants.token_provenance` is `NOT NULL DEFAULT 'unrecorded'` (`db/schema/chat.ts`), so every
 * writer that sets the token columns WITHOUT going through `canon-write.ts::variantEconomics` leaves
 * exactly that shape, and an ST-imported chat SITS in it until the catch-up workload runs — which is
 * precisely the state `backfill-token-usage.ts::plan()` names `legacyPromoted`. Refusing the FILE for it
 * made every un-backfilled imported chat unexportable.
 *
 * The rule here is the one the whole tree already agrees on, third spelling: absent-or-contradictory
 * provenance over PRESENT tokens is `measured` (`variantEconomics`'s `??` derive; the backfill's
 * legacy promotion, which likewise keeps the numbers and only moves the label), and over ABSENT tokens
 * is `unrecorded`. The output can no longer BE contradictory — it is computed, never trusted.
 */
function resolveTokenProvenance(v: {
  readonly tokenProvenance?: TokenProvenance | undefined;
  readonly tokensIn?: number | null | undefined;
  readonly tokensOut?: number | null | undefined;
}): TokenProvenance {
  const hasRecordedTokens = typeof v.tokensIn === "number" || typeof v.tokensOut === "number";
  if (v.tokenProvenance !== undefined && (v.tokenProvenance === "unrecorded") !== hasRecordedTokens) {
    return v.tokenProvenance;
  }
  return hasRecordedTokens ? "measured" : "unrecorded";
}

function variantFromWire(v: NonNullable<WireChat["messages"][number]["variants"][number]>): PortableChatVariant {
  return {
    idx: v.idx,
    content: v.content,
    model: v.model ?? null,
    provider: v.provider ?? null,
    tokensIn: v.tokensIn ?? null,
    tokensOut: v.tokensOut ?? null,
    tokenProvenance: resolveTokenProvenance(v),
    reasoning: v.reasoning ?? null,
    ttftMs: v.ttftMs ?? null,
    genStartedAt: v.genStartedAt ?? null,
    genFinishedAt: v.genFinishedAt ?? null,
    variableDelta: v.variableDelta ?? null,
    metadata: v.metadata ?? null,
  };
}

function rpgToWire(rpg: PortableRpgGame): NonNullable<WireChat["rpg"]> {
  return {
    mode: rpg.mode,
    status: rpg.status,
    sessionNumber: rpg.sessionNumber,
    config: rpg.config,
    createdAt: rpg.createdAt,
    sheets: rpg.sheets.map((s) => ({ characterHandle: s.characterHandle, sheet: s.sheet })),
    snapshots: rpg.snapshots.map((s) => ({
      messageIndex: s.messageIndex,
      variantIdx: s.variantIdx,
      asOfMessageIndex: s.asOfMessageIndex,
      committed: s.committed,
      createdAt: s.createdAt,
      state: s.state,
    })),
    journal: rpg.journal.map((e) => ({
      type: e.type,
      label: e.label,
      title: e.title,
      content: e.content,
      messageIndex: e.messageIndex,
      variantIdx: e.variantIdx,
      sourceMessageIndex: e.sourceMessageIndex,
      createdAt: e.createdAt,
    })),
    turnToolCalls: rpg.turnToolCalls.map((t) => ({
      messageIndex: t.messageIndex,
      variantIdx: t.variantIdx,
      calls: t.calls.map((c) => ({ name: c.name, args: c.args, verdict: c.verdict, issues: [...c.issues] })),
      createdAt: t.createdAt,
    })),
    checkpoints: rpg.checkpoints.map((c) => ({ snapshotIndex: c.snapshotIndex, label: c.label, trigger: c.trigger, createdAt: c.createdAt })),
  };
}

function rpgFromWire(rpg: NonNullable<WireChat["rpg"]>): PortableRpgGame {
  return {
    mode: rpg.mode,
    status: rpg.status,
    sessionNumber: rpg.sessionNumber,
    config: rpg.config,
    createdAt: rpg.createdAt,
    sheets: rpg.sheets.map((s): PortableRpgSheet => ({ characterHandle: s.characterHandle ?? null, sheet: s.sheet })),
    snapshots: rpg.snapshots.map(
      (s): PortableRpgSnapshot => ({
        messageIndex: s.messageIndex ?? null,
        variantIdx: s.variantIdx ?? null,
        asOfMessageIndex: s.asOfMessageIndex ?? null,
        committed: s.committed,
        createdAt: s.createdAt,
        state: s.state,
      }),
    ),
    journal: rpg.journal.map(
      (e): PortableRpgJournalEntry => ({
        type: e.type,
        label: e.label,
        title: e.title,
        content: e.content,
        messageIndex: e.messageIndex ?? null,
        variantIdx: e.variantIdx ?? null,
        sourceMessageIndex: e.sourceMessageIndex ?? null,
        createdAt: e.createdAt,
      }),
    ),
    turnToolCalls: rpg.turnToolCalls.map(
      (t): PortableRpgTurnToolCalls => ({ messageIndex: t.messageIndex, variantIdx: t.variantIdx, calls: t.calls, createdAt: t.createdAt }),
    ),
    checkpoints: rpg.checkpoints.map(
      (c): PortableRpgCheckpoint => ({ snapshotIndex: c.snapshotIndex, label: c.label, trigger: c.trigger, createdAt: c.createdAt }),
    ),
  };
}

const chatBundleSerde = defineJsonObjectSerde<PortableChat, WireChat>({
  schemaKind: CHAT_BUNDLE_SCHEMA_KIND,
  schemaVersion: CHAT_BUNDLE_SCHEMA_VERSION,
  bodySchema: wireChatSchema,
  toWire: (chat) => ({
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    starred: chat.starred,
    archived: chat.archived,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    metadata: chat.metadata,
    variableValues: chat.variableValues,
    userMacroValues: chat.userMacroValues,
    anchorPersonaName: chat.anchorPersonaName,
    characterHandles: [...chat.characterHandles],
    tagNames: [...chat.tagNames],
    injections: chat.injections.map((i) => ({
      position: i.position,
      depth: i.depth,
      role: i.role,
      content: i.content,
      order: i.order,
      createdAt: i.createdAt,
    })),
    messages: chat.messages.map((m) => ({
      role: m.role,
      kind: m.kind,
      speakerHandle: m.speakerHandle,
      personaName: m.personaName,
      createdAt: m.createdAt,
      selectedIdx: m.selectedIdx,
      variants: m.variants.map(variantToWire),
    })),
    rpg: chat.rpg === null ? null : rpgToWire(chat.rpg),
  }),
  fromWire: (body) => {
    const messages = body.messages.map(
      (m): PortableChatMessage => ({
        role: m.role,
        kind: m.kind,
        speakerHandle: m.speakerHandle ?? null,
        personaName: m.personaName ?? null,
        createdAt: m.createdAt,
        selectedIdx: m.selectedIdx,
        variants: m.variants.map(variantFromWire),
      }),
    );
    const rpg = body.rpg === null || body.rpg === undefined ? null : pruneDangling(rpgFromWire(body.rpg), messages);
    return {
      title: body.title,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
      starred: body.starred,
      archived: body.archived,
      compactSummary: body.compactSummary ?? null,
      compactedAtSeq: body.compactedAtSeq ?? null,
      metadata: body.metadata ?? null,
      variableValues: body.variableValues ?? null,
      userMacroValues: body.userMacroValues ?? null,
      anchorPersonaName: body.anchorPersonaName ?? null,
      characterHandles: body.characterHandles,
      tagNames: body.tagNames,
      injections: body.injections.map(
        (i): PortableChatInjection => ({
          position: i.position,
          depth: i.depth,
          role: i.role,
          content: i.content,
          order: i.order ?? null,
          createdAt: i.createdAt,
        }),
      ),
      messages,
      rpg,
    };
  },
});

/** Serialize one chat, whole, to the portable `chats/**\/*.orb.json` bytes (the inverse of
 *  `parseChatBundleFile`). Deterministic key order makes a re-serialize byte-identical. */
export function buildChatBundleFile(chat: PortableChat): Uint8Array {
  return chatBundleSerde.build(chat);
}

/** Parse untrusted chat-bundle bytes, or the typed reason they were refused. An ST `.jsonl` transcript, a
 *  character `?format=json` card, or any other orb-native family refuses as `foreign-kind` — the ENVELOPE is
 *  the discriminator, never the file extension. */
export function parseChatBundleFile(bytes: Uint8Array): PortableParse<PortableChat> {
  return chatBundleSerde.parse(bytes);
}
