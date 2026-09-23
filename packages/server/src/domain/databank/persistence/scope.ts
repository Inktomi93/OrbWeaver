// domain/databank/persistence/scope — `resolveActiveDocumentIds`, the ONE home for the scope-junction union.
// It encodes databank's authority model: a personal `{ownerId}` search is over the
// WHOLE bank (every owned document — junctions only scope CHAT retrieval, so gating a personal read on
// attachment state would be a surprising hole); a `{chatId}` turn resolves the MEMBERSHIP-WIDENED union (D85).
//
// D85 (the host-only → membership widening): every PRESENT HUMAN member (kind='human', leftSeq null — the host
// is one of them; a member who LEFT is dropped) credits their GLOBAL documents to the shared room, unioned with
// the chat's directly-attached documents AND the docs attached to the chat's PRESENT ROSTER characters (DB8).
// This mirrors the D16 corpus membership union: widening credits only ATTACHED documents (a global_documents /
// chat_documents / character_documents junction row) — a member's PRIVATE (unattached/unconsented) documents
// NEVER leak, because they have no junction row to union. On top of the union sits the HOST's optional
// per-document VISIBILITY override (D85; `chats.metadata.databankVisibility`, written by the host-gated
// `chat.setChatDocumentVisibility` verb): a hidden id is subtracted from the RETRIEVAL set. Widening is
// default-on; a corrupt/absent visibility blob heals to nothing-hidden (fault-isolated — never throws the turn).
//
// `search.documents` injects `resolveActiveDocumentIds` at compose (DB5) so search never re-implements the union
// — the no-second-home invariant. Reads `chat_participants` and `chats.metadata` directly (a sanctioned
// cross-table read; the domain-no-cross-feature gate bans importing sibling RUNTIME, not the shared @orb/db
// schema — the visibility blob's schema is databank's own contract).

import type { DocumentScopeSource } from "@orb/contracts/databank";
import type { Db } from "@orb/db";
import { characterDocuments, chatDocuments, chatParticipants, chats, documents, globalDocuments } from "@orb/db";
import type { CharacterId, ChatId, DocumentId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

const LIMIT_ONE = 1;

/** The TOLERANT read-side shape for the stored `databankVisibility` sub-blob. The WIRE/verb input is validated
 *  strictly (branded `documentIdSchema`) at the trust boundary by `chatDocumentVisibilitySchema`; here on the
 *  READ path the ids are already-trusted stored values, and an id that isn't in the union is inert — so this
 *  only guards the SHAPE (a non-array / non-object heals to nothing-hidden), never re-validates the TypeID. */
const storedVisibilitySchema = z.object({ hidden: z.array(z.string()) });

/** Persistence-internal scope shape (the injected resolver's argument; the search-side op type lands with
 *  DB5). Not exported — callers pass a `{chatId}` / `{ownerId}` literal. */
type DocumentScope = { readonly chatId: ChatId } | { readonly ownerId: UserId };

/** The PRESENT human members of a chat (kind='human', still seated — leftSeq null). The host is one of them;
 *  a member who LEFT (leftSeq non-null) is excluded, so their global documents stop crediting the room. Their
 *  GLOBAL documents are the D85 membership-widening subjects. */
async function resolveHumanMembers(db: Db, chatId: ChatId): Promise<UserId[]> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  return rows.flatMap((r) => (r.userId === null ? [] : [r.userId]));
}

/** The chat's PRESENT character roster (kind='character', still seated) — the character-scope retrieval
 *  subjects. The SHAPE CHECK guarantees a character seat carries characterId, but
 *  the column is nullable in TS (shared with the other kinds) — the flatMap drops any null defensively. */
async function resolveRosterCharacters(db: Db, chatId: ChatId): Promise<CharacterId[]> {
  const rows = await db
    .select({ characterId: chatParticipants.characterId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
  return rows.flatMap((r) => (r.characterId === null ? [] : [r.characterId]));
}

/** The live host of a chat (role='host', still present), or undefined. Used only for the PANEL's host/member
 *  branch ({@link resolveActiveDocumentIds} no longer needs a host — the union is member-driven). */
export async function resolveChatHost(db: Db, chatId: ChatId): Promise<UserId | undefined> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows[0]?.userId ?? undefined;
}

/** The host's per-document visibility override for a chat (D85). Reads `chats.metadata.databankVisibility` and
 *  fault-isolates it: an absent OR corrupt blob heals to the empty set (default-visible — widening is
 *  default-on, so a garbage blob can never SILENTLY hide documents, only fail-open to the widened union). */
export async function resolveChatHiddenDocumentIds(db: Db, chatId: ChatId): Promise<DocumentId[]> {
  const rows = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  const raw: unknown = rows[0]?.metadata;
  const blob = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>)["databankVisibility"] : undefined;
  const parsed = storedVisibilitySchema.safeParse(blob);
  return parsed.success ? (parsed.data.hidden as DocumentId[]) : [];
}

/** One deduplicated union member + WHICH junction(s) credit it. Persistence-internal (the panel's wire
 *  shape is `ActiveChatDocumentView`, which the verb builds) — the `DocumentScope` precedent above. */
interface ChatDocumentCredit {
  readonly documentId: DocumentId;
  readonly sources: DocumentScopeSource[];
}

/** The RAW membership-widened chat document union WITH its PROVENANCE — which of the three scope junctions
 *  credits each document (D-2, `DOCUMENT_SCOPE_SOURCES`). The three queries always ran separately here and
 *  their answer was collapsed to a flat id list; keeping it is what lets the per-chat rack say WHY a
 *  document is active, and which one the host may DETACH (only the `chat` junction is this room's) rather
 *  than merely hide.
 *
 *  A document can be credited by SEVERAL junctions at once, so `sources` is a list, deduplicated per
 *  document. The find-and-push (not a Map/Set) is this file's standing posture — persistence is
 *  queries-only, and the id sets are a chat's attached documents, i.e. small. ORDER is global → chat →
 *  character, exactly the order the previous indexOf-dedup produced, so the id-only
 *  {@link resolveChatDocumentUnion} reader below sees the ordering it always saw. */
export async function resolveChatDocumentSources(db: Db, chatId: ChatId): Promise<ChatDocumentCredit[]> {
  const [members, rosterCharacters] = await Promise.all([resolveHumanMembers(db, chatId), resolveRosterCharacters(db, chatId)]);
  const [globalRows, chatRows, characterRows] = await Promise.all([
    members.length === 0
      ? Promise.resolve([] as { documentId: DocumentId }[])
      : db.select({ documentId: globalDocuments.documentId }).from(globalDocuments).where(inArray(globalDocuments.ownerId, members)),
    db.select({ documentId: chatDocuments.documentId }).from(chatDocuments).where(eq(chatDocuments.chatId, chatId)),
    rosterCharacters.length === 0
      ? Promise.resolve([] as { documentId: DocumentId }[])
      : db.select({ documentId: characterDocuments.documentId }).from(characterDocuments).where(inArray(characterDocuments.characterId, rosterCharacters)),
  ]);
  const credits: ChatDocumentCredit[] = [];
  const credit = (rows: readonly { documentId: DocumentId }[], source: DocumentScopeSource): void => {
    for (const row of rows) {
      const existing = credits.find((each) => each.documentId === row.documentId);
      if (existing === undefined) {
        credits.push({ documentId: row.documentId, sources: [source] });
      } else if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }
    }
  };
  credit(globalRows, "global");
  credit(chatRows, "chat");
  credit(characterRows, "character");
  return credits;
}

/** The RAW membership-widened chat document union — NO visibility filter (the RETRIEVAL pre-filter input).
 *  D85: every present human member's global docs ∪ the chat's attached docs ∪ the present roster
 *  characters' attached docs. Deduplicated — DERIVED from {@link resolveChatDocumentSources} so the union
 *  and its provenance can never be two different answers to one question.
 *
 *  MODULE-LOCAL since D-2: the panel read (`verbs/list-active-for-chat.ts`) was the only other caller and
 *  now takes the provenance-carrying twin, so the retrieval path below is the sole consumer. */
async function resolveChatDocumentUnion(db: Db, chatId: ChatId): Promise<DocumentId[]> {
  const credits = await resolveChatDocumentSources(db, chatId);
  return credits.map((credit) => credit.documentId);
}

/** Resolve the documents ACTIVE for RETRIEVAL, deduplicated. `{ownerId}` = the whole bank (junctions don't
 *  scope a personal search); `{chatId}` = the D85 membership union MINUS the host's per-document visibility
 *  exclusions. An empty/hostless union returns []. This is the retrieval-correct set `search.documents` scans;
 *  the panel read uses {@link resolveChatDocumentUnion} + {@link resolveChatHiddenDocumentIds} to also SHOW
 *  hidden documents to the host. */
export async function resolveActiveDocumentIds(db: Db, scope: DocumentScope): Promise<DocumentId[]> {
  if ("ownerId" in scope) {
    const rows = await db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, scope.ownerId));
    return rows.map((r) => r.id);
  }
  const [union, hidden] = await Promise.all([resolveChatDocumentUnion(db, scope.chatId), resolveChatHiddenDocumentIds(db, scope.chatId)]);
  if (hidden.length === 0) {
    return union;
  }
  // includes-filter, not a Set — persistence is queries-only (the hidden set is a handful of ids per chat).
  return union.filter((id) => !hidden.includes(id));
}
