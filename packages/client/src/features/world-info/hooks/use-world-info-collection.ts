// The world-info collection's host-facing hooks (the `CollectionContribution` seam): the group count, the
// create verb, and the IMPORT verb (D121-D's band half, now the group band's). All three are hooks because a
// definition is a module-level value — the host calls each unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionInsight } from "#lib";
import { notify } from "#lib";
import { selectCollectionMember } from "#state";
import { WORLD_INFO_COLLECTION_ID } from "../lib/world-info-model.ts";
import { useCreateWorldBook, useImportWorldBookFile } from "./use-world-info-mutations.ts";

const NEW_BOOK_NAME = "New book";

/** The group band's live census — a NON-suspending read sharing the rows' cache. */
export function useWorldInfoCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions()).data?.length;
}

/**
 * THE WORLD-INFO LIBRARY'S OWN LANDING FACTS (the `insights` seam — #1209 replaced the preview wall).
 *
 * WHAT THE LIST CANNOT SAY. Each row scents its own book ("42 entries · attached ×3"); what no row states
 * is the library's ATTACHMENT SHAPE — how many books fire in every chat (a global book is the one that can
 * surprise you) and how many are written and wired to nothing. `bookScent` already calls the second state
 * `unattached` on a single row; these facts are that judgement counted across the library, which is the one
 * form of it a reader cannot get by scrolling.
 *
 * ONE CACHED READ — the same `listBooksWithUsage` key the census, the rows and the member title share.
 */
export function useWorldInfoInsights(): readonly CollectionInsight[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions()).data;
  if (rows === undefined) {
    return rows;
  }
  const everywhere = rows.filter((book) => book.usage.global);
  const unattached = rows.filter((book) => book.usage.total === 0);
  const firstGlobal = everywhere[0];
  const firstUnattached = unattached[0];
  return [
    {
      id: "global",
      label: "Fires in every chat",
      value: String(everywhere.length),
      ...(firstGlobal === undefined
        ? {}
        : { open: { label: `Open ${firstGlobal.name}`, run: (): void => selectCollectionMember(WORLD_INFO_COLLECTION_ID, firstGlobal.id) } }),
    },
    {
      id: "unattached",
      label: "Attached to nothing",
      value: `${String(unattached.length)} of ${String(rows.length)}`,
      ...(firstUnattached === undefined
        ? {}
        : { open: { label: `Open ${firstUnattached.name}`, run: (): void => selectCollectionMember(WORLD_INFO_COLLECTION_ID, firstUnattached.id) } }),
    },
  ];
}

/** The OPEN member's name for the mobile pushed frame's topbar (the `useMemberTitle` seam) — the SAME
 *  cached list the census and the rows read, so this is a cache hit and never a second request. */
export function useWorldInfoMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner: mint an empty book, then OPEN it in CONTENT — the same create-then-edit motion the
 *  rail section's band primary had. */
export function useCreateWorldInfoMember(): () => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateWorldBook({ trpc, invalidation });
  return (): void => {
    create.mutate({ input: { name: NEW_BOOK_NAME } }, { onSuccess: (created): void => selectCollectionMember(WORLD_INFO_COLLECTION_ID, created.id) });
  };
}

/** The import runner — one portable book file, through the SAME thin-arm verb the backup bundle calls, so a
 *  shared book and a restored one can never diverge. The SERVER's refusal reason is what the reader sees:
 *  "written by a newer version of orbweaver" is a different problem from "that isn't a world-info book", and
 *  only the difference is actionable. */
export function useImportWorldInfoMember(): (file: File) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const importBook = useImportWorldBookFile({ trpc, invalidation });
  return (file: File): void => {
    void file
      .text()
      .then((fileText) => importBook.mutateAsync({ fileText }))
      .then(({ created }) => {
        notify.success(created ? "Book imported." : "Book merged into the one with the same name.");
      })
      .catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : "Couldn't import the book.");
      });
  };
}
