// domain/databank/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// `principal` (spine §7.1); ownership scopes off `principal.userId` (the fetchOwned idiom) — never a `users`
// read. The chat-attach authority is the injected `ensureChatHost` op (D18 — databank never reads the chat
// roster itself). The `reindex` scope/mode axis derives from `@orb/contracts/databank` (one home).

import type { DocOrigin, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId, DocumentId } from "@orb/kit/ids";

interface DatabankActorParams {
  readonly principal: Principal;
}

// ── canon producers ───────────────────────────────────────────────────────────────────────────────────
export interface UploadDocumentParams extends DatabankActorParams {
  /** The raw source bytes (the multipart route hands the domain the file body). */
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly name: string;
}

export interface CreateFromTextParams extends DatabankActorParams {
  readonly name: string;
  /** origin 'text' (ST Notepad) — no bytes, no extraction; `extractedText` IS the canon. */
  readonly text: string;
}

/** scrapeWeb (DB7) — fetch a web page over the compose-bound ANY_HOST safeFetch guard, extract its html, then
 *  the SAME §2 canon pipeline as upload. `url` is validated `z.url()` at the tRPC seam; the domain trusts it. */
export interface ScrapeWebParams extends DatabankActorParams {
  readonly url: string;
}

/** scrapeYoutube (DB8) — fetch a video's caption track over the SAME safeFetch guard, join it to plain text,
 *  then the §2 canon pipeline. `url` is a watch URL (or bare id); `lang` selects the caption language (the tRPC
 *  seam defaults it to `en`). origin 'youtube', mime 'text/plain'. */
export interface ScrapeYoutubeParams extends DatabankActorParams {
  readonly url: string;
  readonly lang: string;
}

/** scrapeWiki (DB8) — fetch a MediaWiki article's plain-text extract over the SAME guard (the API endpoint is
 *  derived from the article URL's host), then the §2 canon pipeline. origin 'wiki', mime 'text/plain'. */
export interface ScrapeWikiParams extends DatabankActorParams {
  readonly url: string;
}

/** How a scraper names its document. `youtube`/`wiki` know the name from the API response (a `literal` string);
 *  `web` derives it from the extracted `<title>` — known only AFTER extraction — so it hands a `titleFallback`
 *  and the shared tail resolves `title ?? fallback`. Either way the name is capped + never empty. */
export type ScrapeName = { readonly literal: string } | { readonly titleFallback: string };

/** The write inputs a scraper hands the shared §2 canon tail (`substrate/scrape-canon`): who, the fetched bytes,
 *  and the canon stamps that vary by source (origin/mime/name/sourceUrl/auditAction). Not a wire boundary (a
 *  domain-internal handoff, no zod) — the three scraper verbs build it, one substrate fn consumes it. */
export interface ScrapeWrite extends DatabankActorParams {
  readonly bytes: Uint8Array;
  readonly origin: DocOrigin;
  readonly mime: string;
  readonly name: ScrapeName;
  readonly sourceUrl: string;
  readonly auditAction: string;
}

// ── documents CRUD (fetchOwned) ───────────────────────────────────────────────────────────────────────
export interface GetDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
  /** DocumentDetailView.extractedText only when asked (list/detail default omits the multi-MB canon). */
  readonly includeText?: boolean;
}

export interface ListDocumentsParams extends DatabankActorParams {
  readonly origin?: DocOrigin;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RenameDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
  readonly name: string;
}

export interface RemoveDocumentParams extends DatabankActorParams {
  readonly id: DocumentId;
}

// ── derived-layer maintenance ─────────────────────────────────────────────────────────────────────────
export interface ReindexParams extends DatabankActorParams {
  readonly scope: ReindexScope;
  readonly mode?: ReindexMode;
}

// ── scope junctions ───────────────────────────────────────────────────────────────────────────────────
export interface GlobalAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
}

export interface ChatAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
  readonly chatId: ChatId;
}

/** Character-scope attach (DB8). BOTH sides are the caller's own — the character gate is plain ownership
 *  (`ensureCharacterOwned`, the world-info precedent), NOT the D18 host authority (a character is an owned
 *  entity, not a membership room). */
export interface CharacterAttachParams extends DatabankActorParams {
  readonly documentId: DocumentId;
  readonly characterId: CharacterId;
}

export interface ListActiveForChatParams extends DatabankActorParams {
  readonly chatId: ChatId;
}

// ── the chat GATHER op (DB6, databank-design/07 §2) ───────────────────────────────────────────────────
/** The `{{databank}}` slot's retrieval request, built by chat's GATHER and passed through the compose-injected
 *  op. No `principal`: the turn is already membership-authorized upstream, and scope resolves by CHAT inside
 *  `search.documents` (host-only v1). `queryText` is chat-built (pending + last-2 turns); `tokenBudget` is the
 *  slot's share of chat's ONE budget pass — databank fits WHOLE chunks inside it. A plain type (not a zod
 *  schema): a compose-injected internal op crosses no untrusted boundary, matching `ExtractTextOp`/
 *  `EnqueueIngestOp`. */
export interface DatabankGatherParams {
  readonly chatId: ChatId;
  readonly queryText: string;
  readonly tokenBudget: number;
  /** The retrieval params (the host's `UserSettings.databank.retrieval`, threaded via ForeignInputs) the
   *  gather passes to `search.documents`. Absent ⇒ gather omits them and search uses its own defaults, which
   *  ARE the databank defaults (the byte-identity pin: an old caller not supplying these is unchanged). */
  readonly k?: number | undefined;
  readonly minScore?: number | undefined;
  readonly rerank?: boolean | undefined;
}
