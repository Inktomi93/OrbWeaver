// verb: importChatBundle (R6) — ONE orb-native `chats/<handle>/<id>.orb.json` into the owner's library. The
// FIDELITY arm of the chat descriptor; `import-chat-file.ts` keeps the ST jsonl interchange and dispatches to
// this one on the file's own bytes. NEVER throws for a malformed file.
//
// A CHARACTER MUST BE SELECTED — OWNER RULING 2026-08-07 (question-tool): *"you shouldn't be able to import a
// transcript without having a character selected."* The characterless-chat arm the review recommended (O-6c)
// is DEAD. This verb therefore REFUSES LOUDLY, with the operator-facing reason naming the handles it looked
// for, when the bundle names no character this account holds. It does not mint a placeholder card (that
// fabricates library canon from a transcript) and it does not land a characterless room.
//
// THE RE-LINK LADDER, all BY NAME because no id survives a cross-box move:
//   • the room's cast — `characterHandles`, then the DIRECTORY handle as the fallback (a file whose seat list
//     was lost still knows where it lived). The first resolvable one is the PRIMARY (the voice a slot naming
//     no speaker falls back to); the rest seat as roster members. An unresolvable handle is simply not seated.
//   • the anchor persona + each user turn's persona — `(ownerId, name)`, the persona domain's own dedup key,
//     so this resolves exactly the row its import verb would have merged onto. A miss degrades to no persona.
//   • the tag overlay — resolve-or-create by name through tag's own by-name attach (D30 per-tagger overlay).
//   • the rpg campaign — the carried POSITIONS (`messages[i].variants[j]`) remapped through the
//     `ImportedChatIdentity` the chat write op returns. This is the load-bearing step: get it wrong and every
//     snapshot, journal entry and tool-call record anchors to the wrong turn (or to nothing).
//
// ORDERING: canon FIRST (it mints the ids everything else re-links against), then the tag overlay and the
// campaign. A failed re-link never un-writes the chat — a restored room missing its labels is strictly better
// than no room, and the outcome still reports `ok`.

import type { BulkImportChatInput, BulkImportMessageInput, ImportedChatIdentity } from "@orb/contracts/chat";
import type { CharacterHandle, CharacterId, MessageId, MessageVariantId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RpgPortableGame } from "#domain/rpg";
import { sha256Hex } from "#kit/content-hash";
import type { PortableChat, PortableRpgGame } from "#kit/serde/chat-bundle";
import { CHAT_BUNDLE_SCHEMA_KIND, parseChatBundleFile } from "#kit/serde/chat-bundle";
import { portableParseError } from "#kit/serde/lib";
import type { ImportContext } from "../context.ts";
import type { ImportChatFileOutcome } from "../contract/results.ts";
import type { ImportProfileDeps, ImportService } from "../contract/service.ts";
import type { ImportChatFileInput } from "../contract/views.ts";
import { requireProfile } from "../guard.ts";

/** The handles a bundle could re-link against, in preference order: its own seat list, then the directory it
 *  sat in. Deduped, blanks dropped. */
function candidateHandles(bundle: PortableChat, filename: string): readonly CharacterHandle[] {
  const slash = filename.indexOf("/");
  const fromPath = slash === -1 ? [] : [filename.slice(0, slash)];
  return [...new Set([...bundle.characterHandles, ...fromPath])].flatMap((h) => (h.trim().length === 0 ? [] : [castId<CharacterHandle>(h)]));
}

interface ResolvedCast {
  readonly primary: CharacterId;
  /** Every seat, primary FIRST — the shape `BulkImportChatInput.roster` expects to be a superset of. */
  readonly seats: readonly CharacterId[];
  readonly idByHandle: ReadonlyMap<string, CharacterId>;
}

/** Resolve the carried handles against the importer's own library. Null = the owner-ruled refusal case:
 *  nothing this account holds, so there is no character to import the transcript against. */
async function resolveCast(ctx: ImportContext, handles: readonly CharacterHandle[]): Promise<ResolvedCast | null> {
  // Resolved in PARALLEL but consumed in the file's declared ORDER: `characterHandles[0]` is the room's
  // primary (the voice a slot naming no speaker falls back to), so the order is load-bearing even though the
  // lookups are independent.
  const resolved = await Promise.all(handles.map(async (handle) => ({ handle, characterId: await ctx.findByHandle({ ownerId: ctx.ownerId, handle }) })));
  const idByHandle = new Map<string, CharacterId>();
  const seats: CharacterId[] = [];
  for (const { handle, characterId } of resolved) {
    if (characterId !== null) {
      idByHandle.set(handle, characterId);
      if (!seats.includes(characterId)) {
        seats.push(characterId);
      }
    }
  }
  const primary = seats[0];
  return primary === undefined ? null : { primary, seats, idByHandle };
}

/** The distinct persona names a bundle references (its anchor + every user turn's author). */
function referencedPersonaNames(bundle: PortableChat): readonly string[] {
  const names = bundle.messages.flatMap((m) => (m.personaName === null ? [] : [m.personaName]));
  if (bundle.anchorPersonaName !== null) {
    names.push(bundle.anchorPersonaName);
  }
  return [...new Set(names)];
}

async function resolvePersonas(
  profile: ImportProfileDeps,
  ownerId: ImportContext["ownerId"],
  names: readonly string[],
): Promise<ReadonlyMap<string, PersonaId>> {
  const { findPersonaByName } = profile;
  const resolved = new Map<string, PersonaId>();
  if (findPersonaByName === undefined) {
    return resolved;
  }
  const looked = await Promise.all(names.map(async (name) => ({ name, personaId: await findPersonaByName({ ownerId, name }) })));
  for (const { name, personaId } of looked) {
    if (personaId !== null) {
      resolved.set(name, personaId);
    }
  }
  return resolved;
}

function toMessageInput(
  message: PortableChat["messages"][number],
  cast: ResolvedCast,
  personaIdByName: ReadonlyMap<string, PersonaId>,
): BulkImportMessageInput {
  const speaker = message.speakerHandle === null ? undefined : cast.idByHandle.get(message.speakerHandle);
  const personaId = message.personaName === null ? null : (personaIdByName.get(message.personaName) ?? null);
  return {
    role: message.role,
    kind: message.kind,
    createdAt: message.createdAt,
    personaId,
    // Absent ⇒ the run's primary, which is exactly the right degrade for an unresolvable (or synthetic
    // narrator) handle: the `kind: "narrator"` declaration below re-mints the room's own synthetic identity.
    ...(speaker === undefined ? {} : { characterId: speaker }),
    selectedIdx: message.selectedIdx,
    variants: message.variants.map((v) => ({
      idx: v.idx,
      content: v.content,
      model: v.model,
      provider: v.provider,
      tokensIn: v.tokensIn,
      tokensOut: v.tokensOut,
      reasoning: v.reasoning,
      ttftMs: v.ttftMs,
      genStartedAt: v.genStartedAt,
      genFinishedAt: v.genFinishedAt,
      variableDelta: v.variableDelta,
      metadata: v.metadata,
    })),
  };
}

/** The PD-78 memory-backfill gate, the jsonl arm's `classifyChat` rule restated over the orb-native shape:
 *  a chat is a real conversation when it carries a SUBSTANTIVE non-system turn from BOTH sides. "Substantive"
 *  reads the SELECTED variant's text — the row's rendered content — because that is what a transcript says. */
function isRealConversation(bundle: PortableChat): boolean {
  const substantive = bundle.messages.filter((m) => m.role !== "system" && (m.variants[m.selectedIdx]?.content ?? "").trim().length > 0);
  return substantive.some((m) => m.role === "user") && substantive.some((m) => m.role === "assistant");
}

function toChatInput(args: {
  readonly bundle: PortableChat;
  readonly cast: ResolvedCast;
  readonly personaIdByName: ReadonlyMap<string, PersonaId>;
  readonly filename: string;
  readonly importHash: string;
}): BulkImportChatInput {
  const { bundle, cast, personaIdByName, filename, importHash } = args;
  return {
    title: bundle.title,
    importedFrom: filename,
    importHash,
    anchorPersonaId: bundle.anchorPersonaName === null ? null : (personaIdByName.get(bundle.anchorPersonaName) ?? null),
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
    // Fork lineage does NOT travel: a `parentChatId` edge needs a chat-level remap the delivery core (one
    // `importFile` per file, no cross-file state) cannot express. `parentRef` is the jsonl arm's filename
    // linkage and has no orb-native analogue.
    parentRef: null,
    // The orb-native arm carries the whole `chat_injections` LIST instead of ST's single migrated note; the
    // write op takes the list when present and never merges the two.
    authorsNote: null,
    injections: bundle.injections,
    isRealConversation: isRealConversation(bundle),
    messages: bundle.messages.map((m) => toMessageInput(m, cast, personaIdByName)),
    roster: cast.seats,
    ...(bundle.metadata === null ? {} : { metadata: bundle.metadata }),
    star: bundle.star,
    archived: bundle.archived,
    compactSummary: bundle.compactSummary,
    compactedAtSeq: bundle.compactedAtSeq,
    variableValues: bundle.variableValues,
    userMacroValues: bundle.userMacroValues,
  };
}

/** Turn the campaign's carried POSITIONS back into THIS box's ids. The serde already pruned every reference
 *  that does not resolve within the file, so a lookup miss here would mean the write op returned a remap that
 *  disagrees with the input it was handed — an internal contradiction, not untrusted data. Such a row is
 *  dropped rather than written against the wrong turn: a silently-misanchored snapshot is worse than a
 *  missing one, because it LOOKS like history. */
function remapRpg(game: PortableRpgGame, identity: ImportedChatIdentity, cast: ResolvedCast): RpgPortableGame {
  const messageAt = (i: number | null): MessageId | null => (i === null ? null : (identity.messageIds[i] ?? null));
  const variantAt = (messageIndex: number | null, variantIdx: number | null): MessageVariantId | null =>
    messageIndex === null || variantIdx === null ? null : (identity.variantIds[messageIndex]?.[variantIdx] ?? null);
  return {
    mode: game.mode,
    status: game.status,
    sessionNumber: game.sessionNumber,
    config: game.config,
    createdAt: game.createdAt,
    // A sheet's actor is characterId XOR userId at the db. `characterHandle: null` IS the host-human arm and
    // stays null here (the write op fills `userId` with the importer). A carried handle re-links against the
    // SAME seat map the transcript's speakers resolved through; an unresolvable one degrades to the host arm
    // rather than dropping the sheet, because the sheet's CONTENT (class, level, tracker exceptions) is
    // authored game state that outlives which card happens to be seated.
    sheets: game.sheets.map((sheet) => ({
      characterId: sheet.characterHandle === null ? null : (cast.idByHandle.get(sheet.characterHandle) ?? null),
      sheet: sheet.sheet,
    })),
    snapshots: game.snapshots.map((snapshot) => {
      const variantId = variantAt(snapshot.messageIndex, snapshot.variantIdx);
      // The two-arm CHECK: message and variant are present together or absent together, and a TURN row never
      // carries an as-of stamp. A half-resolved anchor collapses to the HAND arm, which is the shape whose
      // STATE is still real game history.
      const messageId = variantId === null ? null : messageAt(snapshot.messageIndex);
      return {
        messageId: variantId === null ? null : messageId,
        variantId: messageId === null ? null : variantId,
        asOfMessageId: messageId === null || variantId === null ? messageAt(snapshot.asOfMessageIndex) : null,
        committed: snapshot.committed,
        createdAt: snapshot.createdAt,
        state: snapshot.state,
      };
    }),
    journal: game.journal.flatMap((entry) => {
      const variantId = variantAt(entry.messageIndex, entry.variantIdx);
      // A MODEL entry whose variant did not land is dropped (rpg_journal CASCADEs one for the same reason);
      // a HAND entry (no variantIdx carried) always rides.
      if (entry.variantIdx !== null && variantId === null) {
        return [];
      }
      return [
        {
          type: entry.type,
          label: entry.label,
          title: entry.title,
          content: entry.content,
          variantId,
          sourceMessageId: messageAt(entry.sourceMessageIndex),
          createdAt: entry.createdAt,
        },
      ];
    }),
    turnToolCalls: game.turnToolCalls.flatMap((record) => {
      const messageId = messageAt(record.messageIndex);
      const variantId = variantAt(record.messageIndex, record.variantIdx);
      return messageId === null || variantId === null ? [] : [{ messageId, variantId, calls: record.calls, createdAt: record.createdAt }];
    }),
    checkpoints: game.checkpoints.map((c) => ({ snapshotIndex: c.snapshotIndex, label: c.label, trigger: c.trigger, createdAt: c.createdAt })),
  };
}

/** The re-links that ride AFTER the canon write, each isolated: a failing overlay must not un-write a room
 *  that already restored. */
async function restoreOverlays(args: {
  readonly profile: ImportProfileDeps;
  readonly ownerId: ImportContext["ownerId"];
  readonly bundle: PortableChat;
  readonly identity: ImportedChatIdentity;
  readonly cast: ResolvedCast;
}): Promise<void> {
  const { profile, ownerId, bundle, identity, cast } = args;
  const { attachChatTagByName, importRpgGame } = profile;
  if (attachChatTagByName !== undefined) {
    // SEQUENTIAL by construction — a promise CHAIN, not an await-in-loop (the `POST /api/import/chat`
    // precedent): resolve-or-create is a read-then-write per label, and two labels folding to the same tag
    // name must not race each other into the `(ownerId, name)` unique index.
    await bundle.tagNames.reduce<Promise<void>>(async (chain, tagName) => {
      await chain;
      await attachChatTagByName({ ownerId, chatId: identity.chatId, tagName });
    }, Promise.resolve());
  }
  if (bundle.rpg !== null && importRpgGame !== undefined) {
    await importRpgGame({ chatId: identity.chatId, hostUserId: ownerId, game: remapRpg(bundle.rpg, identity, cast) });
  }
}

export function createImportChatBundle(ctx: ImportContext): ImportService["importChatBundle"] {
  return async ({ filename, bytes }: ImportChatFileInput): Promise<ImportChatFileOutcome> => {
    const parsed = parseChatBundleFile(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(CHAT_BUNDLE_SCHEMA_KIND, parsed.reason) };
    }
    const bundle = parsed.value;
    const profile = requireProfile(ctx);
    const handles = candidateHandles(bundle, filename);
    const cast = await resolveCast(ctx, handles);
    if (cast === null) {
      // THE OWNER-RULED REFUSAL (2026-08-07). Named handles, so the operator can create/import the card and
      // re-run rather than guessing which one this room wanted.
      const looked = handles.length === 0 ? "the file names none" : handles.map((h) => `"${h}"`).join(", ");
      return { ok: false, error: `no character on this account matches this chat (${looked}) — import the character first, then the chat` };
    }
    return await writeBundle({ ctx, profile, bundle, cast, filename, bytes });
  };
}

/** The write half, split out so the refusal ladder above reads as one screen of preconditions. */
async function writeBundle(args: {
  readonly ctx: ImportContext;
  readonly profile: ImportProfileDeps;
  readonly bundle: PortableChat;
  readonly cast: ResolvedCast;
  readonly filename: string;
  readonly bytes: Uint8Array;
}): Promise<ImportChatFileOutcome> {
  const { ctx, profile, bundle, cast, filename, bytes } = args;
  const personaIdByName = await resolvePersonas(profile, ctx.ownerId, referencedPersonaNames(bundle));
  const result = await profile.bulkImportChats({
    ownerId: ctx.ownerId,
    characterId: cast.primary,
    chats: [toChatInput({ bundle, cast, personaIdByName, filename, importHash: sha256Hex(bytes) })],
  });
  // PD-78, the same clause `importChats` runs: a chat canon-write always enqueues the downstream index sweep.
  if (result.realConversationWritten) {
    await profile.enqueueBackfill({ ownerId: ctx.ownerId });
  }
  const identity = result.written[0];
  if (identity === undefined) {
    // Nothing was written for this file. On the real op that is the `importHash` idempotent skip — the chat
    // (and its overlays) landed on a previous run, so re-running them would duplicate labels at best.
    // `created` still comes off the write op's own tally, exactly as the jsonl arm reads it, so the two arms
    // report the same thing about the same outcome.
    return { ok: true, created: result.chatsImported > 0 };
  }
  await restoreOverlays({ profile, ownerId: ctx.ownerId, bundle, identity, cast });
  return { ok: true, created: result.chatsImported > 0 };
}
