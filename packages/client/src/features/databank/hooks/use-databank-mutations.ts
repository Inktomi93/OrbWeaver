// The databank CRUD + global-attachment mutations, one `createEntityMutation` per verb.
//
// FRESHNESS IS EXPLICIT HERE, BY NECESSITY (databank-surface-spec §7): there is NO databank bus event —
// `USER_BUS_EVENT_TYPES` has ten members and none is databank — so every read this feature makes is
// reconciled by a named `invalidates` row, never `busDriven`. Three reads exist: the library `list`, the
// open document's `get`, and the `listGlobal` id set backing the row's Everywhere toggle.
//
// UPLOAD IS NOT HERE: the multipart route is a raw fetch (`#data`'s `uploadDocument`), so it has no
// `createEntityMutation` to hang `invalidates` on — its caller invalidates through the same sanctioned seam
// by hand (`invalidation.invalidateFilters`, never a bare `invalidateQueries`).

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { InvalidateFilter, Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The library list — every producer and every CRUD write moves a row on it. */
function listRead(trpc: Trpc): InvalidateFilter {
  return trpc.databank.list.pathFilter();
}

/** The open document's detail read (metadata + the lazily-fetched source text). */
function detailRead(trpc: Trpc): InvalidateFilter {
  return trpc.databank.get.pathFilter();
}

/** The global id SET (D-1) — the library row's `Everywhere` state. */
function globalRead(trpc: Trpc): InvalidateFilter {
  return trpc.databank.listGlobal.pathFilter();
}

// ── producers ───────────────────────────────────────────────────────────────

/** Paste/author a document. Resolves to the `UploadResult` so the caller can surface a `duplicate` outcome. */
export const useCreateDocumentFromText = createEntityMutation<inferInput<Trpc["databank"]["createFromText"]>, inferOutput<Trpc["databank"]["createFromText"]>>({
  options: (trpc) => trpc.databank.createFromText.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc)],
  errorToast: "Couldn't save the document.",
});

/** Pull a web page in as canon. The server's refusal is a leak-free BAD_REQUEST — the dialog renders it. */
export const useScrapeWeb = createEntityMutation<inferInput<Trpc["databank"]["scrapeWeb"]>, inferOutput<Trpc["databank"]["scrapeWeb"]>>({
  options: (trpc) => trpc.databank.scrapeWeb.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc)],
  errorToast: "Couldn't fetch that page.",
});

/** Pull a YouTube caption track in as canon (`lang` is server-defaulted to "en"). */
export const useScrapeYoutube = createEntityMutation<inferInput<Trpc["databank"]["scrapeYoutube"]>, inferOutput<Trpc["databank"]["scrapeYoutube"]>>({
  options: (trpc) => trpc.databank.scrapeYoutube.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc)],
  errorToast: "Couldn't fetch those captions.",
});

/** Pull a MediaWiki article extract in as canon. */
export const useScrapeWiki = createEntityMutation<inferInput<Trpc["databank"]["scrapeWiki"]>, inferOutput<Trpc["databank"]["scrapeWiki"]>>({
  options: (trpc) => trpc.databank.scrapeWiki.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc)],
  errorToast: "Couldn't fetch that article.",
});

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Rename a document (display metadata only — nothing derived is touched). */
export const useRenameDocument = createEntityMutation<inferInput<Trpc["databank"]["rename"]>, unknown>({
  options: (trpc) => trpc.databank.rename.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc), detailRead(trpc)],
  errorToast: "Couldn't rename the document.",
});

/** Delete a document — the DB cascade clears its chunks and every junction row, so the global set moves too. */
export const useRemoveDocument = createEntityMutation<inferInput<Trpc["databank"]["remove"]>, unknown>({
  options: (trpc) => trpc.databank.remove.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc), globalRead(trpc)],
  errorToast: "Couldn't delete the document.",
});

/** Re-chunk / re-embed (`{kind:'document'}`) or sweep the whole bank (`{kind:'owner'}`, D-6). Resolves to the
 *  enqueued `workloadId`; the counts move as the workload runs, which is what the library's bounded poll
 *  catches (D-3 arm b). */
export const useReindexDocuments = createEntityMutation<inferInput<Trpc["databank"]["reindex"]>, inferOutput<Trpc["databank"]["reindex"]>>({
  options: (trpc) => trpc.databank.reindex.mutationOptions(),
  invalidates: (trpc) => [listRead(trpc), detailRead(trpc)],
  errorToast: "Couldn't start the reindex.",
});

// ── the global scope (owner authority — the write lives where the authority lives, §2.1) ────────────────

/** Make a document feed EVERY chat. Owner-scoped: per-chat attach is HOST-scoped and lives in the chat
 *  panel, never here. */
export const useAttachDocumentGlobal = createEntityMutation<inferInput<Trpc["databank"]["attachGlobal"]>, unknown>({
  options: (trpc) => trpc.databank.attachGlobal.mutationOptions(),
  invalidates: (trpc) => [globalRead(trpc), trpc.databank.listAttachments.pathFilter()],
  errorToast: "Couldn't make the document global.",
});

/** Stop a document feeding every chat (its per-chat/per-character attachments are untouched). */
export const useDetachDocumentGlobal = createEntityMutation<inferInput<Trpc["databank"]["detachGlobal"]>, unknown>({
  options: (trpc) => trpc.databank.detachGlobal.mutationOptions(),
  invalidates: (trpc) => [globalRead(trpc), trpc.databank.listAttachments.pathFilter()],
  errorToast: "Couldn't change the document's scope.",
});
