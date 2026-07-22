// domain/databank/substrate/scrape-canon — the shared §2 canon-write tail every scraper ends in
// (databank-design/06 §5): importHash over the fetched bytes → dedup → CAS store → synchronous extraction →
// documents row → enqueue ingest. Homed in substrate/ (not verbs/) because it is shared verb logic — a verb file
// importing a sibling verb's value is dep-cruiser `domain-no-cross-verb`; substrate is the domain-internal home
// for the helper three verbs (web/youtube/wiki) close over. Extracted ONCE because all three run the identical
// pipeline and differ only in origin/mime/name/sourceUrl (a 3-consumer duplication that changes together). The
// scrape-specific concern each verb owns itself is the FETCH (URL derivation + the leak-free `ScrapeFailedError`
// collapse); this tail assumes the bytes are already in hand and never touches the fetch.

import { documents } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import type { ScrapeName, ScrapeWrite } from "../contract/params";
import type { UploadResult } from "../contract/results";
import type { DatabankContext } from "../contract/service";
import { findByImportHash, toDocumentView } from "../persistence/queries";

const NAME_MAX = 500;

/** Resolve the document name: an explicit literal, or the extracted `<title>` with a fallback. Capped to the
 *  column bound; a whitespace/empty title degrades to the fallback (the scraped title is attacker-influenceable). */
function resolveName(name: ScrapeName, title: string | undefined): string {
  if ("literal" in name) {
    return name.literal.slice(0, NAME_MAX);
  }
  const trimmed = title?.trim();
  const raw = trimmed !== undefined && trimmed.length > 0 ? trimmed : name.titleFallback;
  return raw.slice(0, NAME_MAX);
}

/** The §2 canon tail: dedup on `(ownerId, importHash)` → CAS store → extract → documents row → enqueue ingest.
 *  A duplicate returns the existing document (ingest skipped). Extraction runs synchronously; its failure aborts
 *  before any row exists (the upload precedent — `extractedText` is NOT NULL canon). */
export async function finalizeScrape(ctx: DatabankContext, write: ScrapeWrite): Promise<UploadResult> {
  const ownerId: UserId = write.principal.userId;
  const importHash = sha256Hex(write.bytes);

  const existing = await findByImportHash(ctx.db, ownerId, importHash);
  if (existing !== undefined) {
    const counts = await ctx.countChunks({ documentIds: [existing.id], model: ctx.getActiveEmbedSpace().model });
    return { document: toDocumentView(existing, counts.get(existing.id) ?? 0), outcome: "duplicate", ingest: "skipped" };
  }

  const stored = await ctx.assetsStore({ principal: write.principal, bytes: write.bytes, kind: "document", mime: write.mime, enforceMagic: true });
  const extracted = await ctx.extractText(write.bytes, write.mime);
  const name = resolveName(write.name, extracted.meta.title);
  const at = ctx.now();
  const id = ctx.newDocumentId();
  await ctx.db.insert(documents).values({
    id,
    ownerId,
    sourceAssetId: stored.assetId,
    name,
    mime: write.mime,
    origin: write.origin,
    sourceUrl: write.sourceUrl,
    extractedText: extracted.text,
    importHash,
    byteSize: write.bytes.length,
    extractorVersion: extracted.meta.extractorVersion,
    createdAt: at,
    updatedAt: at,
  });

  const { workloadId } = await ctx.enqueueIngest({ documentId: id, ownerId });
  await ctx.audit(
    { actorUserId: ownerId, action: write.auditAction, entityType: "document", entityId: id, metadata: { url: write.sourceUrl, workloadId } },
    at,
  );

  const document = toDocumentView(
    {
      id,
      name,
      mime: write.mime,
      origin: write.origin,
      sourceUrl: write.sourceUrl,
      byteSize: write.bytes.length,
      charCount: extracted.text.length,
      createdAt: at,
      updatedAt: at,
    },
    0,
  );
  return { document, outcome: "created", ingest: "queued", ...(extracted.meta.charCount === 0 ? { warning: "empty-extraction" as const } : {}) };
}
