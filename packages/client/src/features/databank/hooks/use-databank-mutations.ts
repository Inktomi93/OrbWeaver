// The databank CRUD + global-attachment mutations, one `createEntityMutation` per verb.
//
// FRESHNESS IS BUS-DRIVEN (event-bus coverage survey H3, 2026-08-14). This file's previous header said the
// opposite — "there is NO databank bus event; `USER_BUS_EVENT_TYPES` has ten members and none is databank"
// — and that was TRUE when it was written and is the exact thing the fix wave
// closed: `databankChanged` is now a user-bus member, every persisting verb emits it after its durable
// write, and the ingest subsystem fans it per touched owner at a pass terminal. So every mutation here is
// `busDriven: true`, and the three read-filter helpers this file used to carry are gone with the
// hand-written `invalidates` rows they fed — the ONE map row (`data/invalidation.ts`, `databankChanged` →
// `trpc.databank.pathFilter()`) covers list · get · listGlobal · listAttachments · listActiveForChat.
//
// WHAT THAT BUYS, beyond deleting nine lists: the writer-local posture reconciled the tab that wrote and
// nothing else. At `staleTime: Infinity` a second tab — or the same user's phone — sat on the pre-write
// library forever. The mutation could never fix that; only the event can.
//
// UPLOAD IS NOT HERE: the multipart route is a raw fetch (`#data`'s `uploadDocument`), so it has no
// `createEntityMutation` at all. It is now covered by the SERVER emit in `verbs/upload.ts` (the one
// producer no client-side driver could ever reach), and its caller's hand `invalidation.invalidateFilters`
// is belt-and-braces on the acting tab, not the only driver.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

// ── producers ───────────────────────────────────────────────────────────────

/** Paste/author a document. Resolves to the `UploadResult` so the caller can surface a `duplicate` outcome. */
export const useCreateDocumentFromText = createEntityMutation<inferInput<Trpc["databank"]["createFromText"]>, inferOutput<Trpc["databank"]["createFromText"]>>({
  options: (trpc) => trpc.databank.createFromText.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save the document.",
});

/** Pull a web page in as canon. The server's refusal is a leak-free BAD_REQUEST — the dialog renders it. */
export const useScrapeWeb = createEntityMutation<inferInput<Trpc["databank"]["scrapeWeb"]>, inferOutput<Trpc["databank"]["scrapeWeb"]>>({
  options: (trpc) => trpc.databank.scrapeWeb.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fetch that page.",
});

/** Pull a YouTube caption track in as canon (`lang` is server-defaulted to "en"). */
export const useScrapeYoutube = createEntityMutation<inferInput<Trpc["databank"]["scrapeYoutube"]>, inferOutput<Trpc["databank"]["scrapeYoutube"]>>({
  options: (trpc) => trpc.databank.scrapeYoutube.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fetch those captions.",
});

/** Pull a MediaWiki article extract in as canon. */
export const useScrapeWiki = createEntityMutation<inferInput<Trpc["databank"]["scrapeWiki"]>, inferOutput<Trpc["databank"]["scrapeWiki"]>>({
  options: (trpc) => trpc.databank.scrapeWiki.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fetch that article.",
});

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Rename a document (display metadata only — nothing derived is touched). */
export const useRenameDocument = createEntityMutation<inferInput<Trpc["databank"]["rename"]>, unknown>({
  options: (trpc) => trpc.databank.rename.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't rename the document.",
});

/** Delete a document — the DB cascade clears its chunks and every junction row, so the global set moves too. */
export const useRemoveDocument = createEntityMutation<inferInput<Trpc["databank"]["remove"]>, unknown>({
  options: (trpc) => trpc.databank.remove.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the document.",
});

/** Re-chunk / re-embed (`{kind:'document'}`) or sweep the whole bank (`{kind:'owner'}`, D-6). Resolves to the
 *  enqueued `workloadId`; the counts move as the workload runs, which is what the library's bounded poll
 *  catches (D-3 arm b — that poll STAYS, it is the mid-flight PROGRESS driver, and nothing emits per chunk).
 *
 *  `busDriven`, with the event arriving at the ingest TERMINAL rather than at enqueue — and the verb is
 *  deliberately silent on enqueue (`domain/databank/verbs/reindex.ts` states why): enqueueing moves nothing
 *  any databank read projects, so the old `invalidates` pair refetched byte-identical data and then still
 *  needed the terminal to show the new counts. */
export const useReindexDocuments = createEntityMutation<inferInput<Trpc["databank"]["reindex"]>, inferOutput<Trpc["databank"]["reindex"]>>({
  options: (trpc) => trpc.databank.reindex.mutationOptions(),
  busDriven: true,
  // The queue's single-active refusal is NOT a failure: the run the user asked for is already happening, and
  // "Couldn't start the reindex." is a lie about it. Name the state instead. Every other error keeps the
  // generic copy — it IS a failure, and there is nothing more specific to say about a 500.
  errorToast: (error) => (isReindexAlreadyRunning(error) ? "That reindex is already running — its counts move as it works." : "Couldn't start the reindex."),
});

/** The workloads admission refusal (`DomainConflictError` → CONFLICT): this exact unit — this document, or
 *  the owner-wide sweep — already holds its single-active slot. Keyed on the STRUCTURED code, never message
 *  text (the `invite-dialog` / `use-recompute-stats` precedent). */
function isReindexAlreadyRunning(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "CONFLICT";
}

// ── the global scope (owner authority — the write lives where the authority lives, §2.1) ────────────────

/** Make a document feed EVERY chat. Owner-scoped: per-chat attach is HOST-scoped and lives in the chat
 *  panel, never here. */
export const useAttachDocumentGlobal = createEntityMutation<inferInput<Trpc["databank"]["attachGlobal"]>, unknown>({
  options: (trpc) => trpc.databank.attachGlobal.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't make the document global.",
});

/** Stop a document feeding every chat (its per-chat/per-character attachments are untouched). */
export const useDetachDocumentGlobal = createEntityMutation<inferInput<Trpc["databank"]["detachGlobal"]>, unknown>({
  options: (trpc) => trpc.databank.detachGlobal.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change the document's scope.",
});
