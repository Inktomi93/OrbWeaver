// The tag library's hooks for Corpus Labels: the census, the library facts, the open tag's name, the create
// verb and the sort control. Every read shares the one `tag.listTagsWithUsage` cache the rows render from, so
// none of them is a second request.

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import type { SelectOption } from "@orb/ui/select";
import { useRef } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { TagSortMode } from "#lib";
import { COLLECTION_LARGE_GROUP, notify } from "#lib";
import { selectLabel, setLabelNameFocus, setTagPruneConfirmOpen, setTagSortMode, useTagSortMode } from "#state";
import { tagSortItems, USAGE_KIND_TITLES } from "../lib/tags-model.ts";
import { CREATE_TAG_CONFLICT_TOAST, isTagNameConflict, useCreateTag } from "./use-tag-settings-mutations.ts";

/** The name a created tag lands with — the editor's Name field is the rename affordance, so create needs no
 *  name dialog (C-7: the editor is MOUNTED, so create-then-edit is one motion). */
const NEW_TAG_NAME = "New tag";

/** The first `New tag`, `New tag 2`, … no tag already wears. Compared case-folded, because the server's
 *  name index is on `lower(name)`: a library holding `new tag` must not be offered `New tag`. `alsoTaken`
 *  carries a name the server just refused that the cached rows do not show yet. */
function uniqueNewTagName(rows: readonly TagWithUsage[], alsoTaken?: string): string {
  const taken = new Set(rows.map((row) => row.name.toLowerCase()));
  if (alsoTaken !== undefined) {
    taken.add(alsoTaken.toLowerCase());
  }
  let suffix = 1;
  let name = NEW_TAG_NAME;
  while (taken.has(name.toLowerCase())) {
    suffix += 1;
    name = `${NEW_TAG_NAME} ${String(suffix)}`;
  }
  return name;
}

/** The tag library read, non-suspending. `enabled: false` fetches nothing — the phone-title hook runs in every
 *  Corpus mode, and this read is large on a big library. */
function useTagRows(enabled = true): readonly TagWithUsage[] | undefined {
  const trpc = useTRPC();
  return useGatedQuery(enabled ? "tag-library" : null, () => trpc.tag.listTagsWithUsage.queryOptions()).data;
}

/** The library's size for the finder band — non-suspending, so the band renders at once and the number
 *  settles under it. */
export function useTagCensus(enabled = true): number | undefined {
  return useTagRows(enabled)?.length;
}

/** One fact about the whole library. `open` is present only when the fact has a verb behind it. */
export interface TagLibraryFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly open?: { readonly label: string; readonly run: () => void };
}

/**
 * THE TAG LIBRARY'S OWN LANDING FACTS (#1209): what no finder row can state. An unused tag is the library's
 * own failure mode, and in a list sorted by use it sits at the far end of the scroll. The per-type rows are
 * the taxonomy's reach: how many tags label each kind of thing. `undefined` while the read settles.
 */
export function useTagLibrarySummary(): { readonly count: number; readonly facts: readonly TagLibraryFact[] } | undefined {
  const rows = useTagRows();
  if (rows === undefined) {
    return rows;
  }
  const unused = rows.filter((row) => row.usage.total === 0);
  const byType = (Object.keys(USAGE_KIND_TITLES) as (keyof typeof USAGE_KIND_TITLES)[]).map((key) => ({
    id: `on-${key}`,
    label: `Tags on ${USAGE_KIND_TITLES[key].toLowerCase()}`,
    value: String(rows.filter((row) => row.usage[key] > 0).length),
  }));
  const facts: readonly TagLibraryFact[] = [
    {
      id: "unused",
      label: "Labelling nothing",
      value: `${String(unused.length)} of ${String(rows.length)}`,
      // The door acts on EVERY unused tag: it opens the prune confirm, which states the count and asks first.
      // Omitted when there are none: a door to nothing is a dead end.
      ...(unused.length === 0 ? {} : { open: { label: `Prune ${String(unused.length)} unused`, run: (): void => setTagPruneConfirmOpen(true) } }),
    },
    { id: "in-use", label: "In use", value: String(rows.length - unused.length) },
    ...byType,
  ];
  return { count: rows.length, facts };
}

/** The open tag's name, for the phone title — the same cached list, never a second request. */
export function useTagName(tagId: TagId | null): string | undefined {
  return useTagRows(tagId !== null)?.find((row) => row.id === tagId)?.name;
}

/** The create runner: mint a uniquely named tag, then OPEN it with its Name field focused — a create that
 *  leaves the reader typing the real name of the thing they just made. `pending` holds the door shut while a
 *  create is in flight: the rows only learn the new name on the bus refetch, so a second click would offer
 *  the same one. A conflict the rows could not predict retries once with the next free name. */
export function useCreateLabel(): { readonly run: () => void; readonly pending: boolean } {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateTag({ trpc, invalidation });
  const rows = useTagRows() ?? [];
  // A double click lands both clicks before React re-renders with `isPending`, so the handler holds its own latch.
  const inFlight = useRef(false);
  const open = (created: { readonly id: TagId }): void => {
    setLabelNameFocus(created.id);
    selectLabel(created.id);
  };
  const createOnce = async (): Promise<void> => {
    const first = uniqueNewTagName(rows);
    // @orb-waive caught-failure-ownership(error): a non-conflict failure is toasted by `useCreateTag`'s errorToast through the MutationCache; a conflict is retried below. Ends if the create stops toasting its own failures.
    try {
      open(await create.mutateAsync({ input: { name: first } }));
    } catch (error) {
      if (!isTagNameConflict(error)) {
        return;
      }
      // @orb-waive caught-failure-ownership(retryError): a second conflict is toasted here, any other failure by `useCreateTag`'s errorToast. Ends if the create stops toasting its own failures.
      try {
        open(await create.mutateAsync({ input: { name: uniqueNewTagName(rows, first) } }));
      } catch (retryError) {
        if (isTagNameConflict(retryError)) {
          notify.error(CREATE_TAG_CONFLICT_TOAST);
        }
      }
    }
  };
  return {
    run: (): void => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      // @orb-waive caught-failure-ownership(createOnce): createOnce owns every failure above and never rejects; the catch only satisfies the floating-promise rule. Ends if createOnce starts rethrowing.
      createOnce()
        .finally(() => {
          inFlight.current = false;
        })
        .catch(() => undefined);
    },
    pending: create.isPending,
  };
}

/** The library's READING ORDER for the finder's sort control: the mode, its writer, and the option set.
 *
 *  THE COMPARATOR IS NOT HERE: sorting runs over members, so `sortTagsBy` stays inside `TagCollectionRows`.
 *  Both sides read `state/tag-library-store.ts`, the mode's one home. The option set depends on the library's
 *  SIZE (drag handles cannot exist in a windowed list). A read that has not landed is treated as "handles
 *  available": a settling read must not disable a control it cannot judge. */
export function useTagSortControl(): {
  readonly mode: TagSortMode;
  readonly setMode: (next: TagSortMode) => void;
  readonly options: readonly SelectOption<TagSortMode>[];
} {
  const rows = useTagRows();
  const handlesAvailable = (rows?.length ?? 0) <= COLLECTION_LARGE_GROUP;
  return { mode: useTagSortMode(), setMode: setTagSortMode, options: tagSortItems(handlesAvailable, COLLECTION_LARGE_GROUP) };
}
