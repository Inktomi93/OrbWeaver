// The world-info CRUD + attachment mutations, one createEntityMutation per verb. Attachment writes
// (global/character/persona) are the "activation" surface: a book fires in a chat's per-turn pool when
// attached at one of those scopes. The chat scope is deferred at transport, so only the three
// owner-scoped surfaces are wired here.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

// ── Books ───────────────────────────────────────────────────────────────────

/** Create a book. Refetches the library list; resolves to the created book (its id) so the caller opens it. */
export const useCreateWorldBook = createEntityMutation<
  inferInput<Trpc["worldInfo"]["createBook"]>,
  inferOutput<Trpc["worldInfo"]["createBook"]>
>({
  options: (trpc) => trpc.worldInfo.createBook.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listBooks.pathFilter()],
  errorToast: "Couldn't create the book.",
});

/** Rename / re-describe a book. Refetches the list (name) + the open book. */
export const useUpdateWorldBook = createEntityMutation<
  inferInput<Trpc["worldInfo"]["updateBook"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.updateBook.mutationOptions(),
  invalidates: (trpc) => [
    trpc.worldInfo.listBooks.pathFilter(),
    trpc.worldInfo.getBook.pathFilter(),
  ],
  errorToast: "Couldn't save the book.",
});

/** Delete a book (the DB cascade clears its entries + junction rows). Refetches the library list. */
export const useRemoveWorldBook = createEntityMutation<
  inferInput<Trpc["worldInfo"]["removeBook"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.removeBook.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listBooks.pathFilter()],
  errorToast: "Couldn't delete the book.",
});

/** Deep-copy a book + all its entries into a fresh "<name> (copy)" book. Refetches the list; resolves to
 *  the new book so the caller can open it. */
export const useDuplicateWorldBook = createEntityMutation<
  inferInput<Trpc["worldInfo"]["duplicateBook"]>,
  inferOutput<Trpc["worldInfo"]["duplicateBook"]>
>({
  options: (trpc) => trpc.worldInfo.duplicateBook.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listBooks.pathFilter()],
  errorToast: "Couldn't duplicate the book.",
});

// ── Entries ───────────────────────────────────────────────────────────────────

/** Create an entry in a book. Refetches the book's entry list; resolves to the created entry so the caller
 *  can open it in the editor. */
export const useCreateWorldEntry = createEntityMutation<
  inferInput<Trpc["worldInfo"]["createEntry"]>,
  inferOutput<Trpc["worldInfo"]["createEntry"]>
>({
  options: (trpc) => trpc.worldInfo.createEntry.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listEntries.pathFilter()],
  errorToast: "Couldn't create the entry.",
});

/** Persist an edited entry (every contract field). Refetches the entry list (title/enabled/priority reorder)
 *  + the open entry. */
export const useUpdateWorldEntry = createEntityMutation<
  inferInput<Trpc["worldInfo"]["updateEntry"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.updateEntry.mutationOptions(),
  invalidates: (trpc) => [
    trpc.worldInfo.listEntries.pathFilter(),
    trpc.worldInfo.getEntry.pathFilter(),
  ],
  errorToast: "Couldn't save the entry.",
});

/** Fill blank entry titles from each entry's keys (returns the count filled). Refetches the entry list. */
export const useBackfillWorldTitles = createEntityMutation<
  inferInput<Trpc["worldInfo"]["backfillTitles"]>,
  inferOutput<Trpc["worldInfo"]["backfillTitles"]>
>({
  options: (trpc) => trpc.worldInfo.backfillTitles.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listEntries.pathFilter()],
  errorToast: "Couldn't backfill the entry titles.",
});

/** Delete an entry. Refetches the book's entry list. */
export const useRemoveWorldEntry = createEntityMutation<
  inferInput<Trpc["worldInfo"]["removeEntry"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.removeEntry.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listEntries.pathFilter()],
  errorToast: "Couldn't delete the entry.",
});

// ── Attachments (the activation surface) ────────────────────────────────────────

/** Mark / un-mark a book global (fires for every chat). Refetches the global list + the book library (the
 *  library row shows the global badge). */
export const useAttachWorldBookGlobal = createEntityMutation<
  inferInput<Trpc["worldInfo"]["attachGlobal"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.attachGlobal.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listGlobal.pathFilter()],
  errorToast: "Couldn't make the book global.",
});

export const useDetachWorldBookGlobal = createEntityMutation<
  inferInput<Trpc["worldInfo"]["detachGlobal"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.detachGlobal.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listGlobal.pathFilter()],
  errorToast: "Couldn't remove the global attachment.",
});

/** Attach / detach a book to a character (the `role` axis rides `attachToCharacter`). Refetches the
 *  character's attachment list. */
export const useAttachWorldBookToCharacter = createEntityMutation<
  inferInput<Trpc["worldInfo"]["attachToCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.attachToCharacter.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listForCharacter.pathFilter()],
  errorToast: "Couldn't attach the book to the character.",
});

export const useDetachWorldBookFromCharacter = createEntityMutation<
  inferInput<Trpc["worldInfo"]["detachFromCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.detachFromCharacter.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listForCharacter.pathFilter()],
  errorToast: "Couldn't detach the book from the character.",
});

/** Attach / detach a book to a persona. Refetches the persona's attachment list. */
export const useAttachWorldBookToPersona = createEntityMutation<
  inferInput<Trpc["worldInfo"]["attachToPersona"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.attachToPersona.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listForPersona.pathFilter()],
  errorToast: "Couldn't attach the book to the persona.",
});

export const useDetachWorldBookFromPersona = createEntityMutation<
  inferInput<Trpc["worldInfo"]["detachFromPersona"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.detachFromPersona.mutationOptions(),
  invalidates: (trpc) => [trpc.worldInfo.listForPersona.pathFilter()],
  errorToast: "Couldn't detach the book from the persona.",
});
