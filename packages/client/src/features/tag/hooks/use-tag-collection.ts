// The tag COLLECTION's host-facing hooks (the `CollectionContribution` seam): the group count and the
// create verb. Both are hooks because a definition is a module-level value — the host calls them
// unconditionally, once, per rendered affordance.

import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionPreviewEntry } from "#lib";
import { COLLECTION_PREVIEW_LIMIT, sortTagsBy } from "#lib";
import { selectCollectionMember } from "#state";
import { TAG_COLLECTION_ID } from "../lib/tags-model.ts";
import { useCreateTag } from "./use-tag-settings-mutations.ts";

/** The name a created tag lands with — the member editor's Name field is the rename affordance, so create
 *  no longer needs its own name dialog (C-7: the editor is MOUNTED, so create-then-edit is one motion). */
const NEW_TAG_NAME = "New tag";

/** The group band's live census — a NON-suspending read sharing the rows' cache, so the band renders
 *  immediately and the number settles under it. */
export function useTagCount(): number | undefined {
  const trpc = useTRPC();
  return useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data?.length;
}

/** One ranked row → the host-facing preview entry. The wire row carries five per-target usage counters; the
 *  hero shows the TOTAL, because "how much of the library this tag accounts for" is the one number that
 *  ranks the wall and the breakdown belongs to the member editor. */
function previewEntry(row: { readonly name: string; readonly usage: { readonly total: number } }): CollectionPreviewEntry {
  return { label: row.name, detail: String(row.usage.total) };
}

/** The welcome hero's CHIP WALL (the `preview` seam): the most-used slice of the library, ranked by the
 *  ONE comparator the roster and the tag picker already rank by (`sortTagsBy(…, "used")` — a second
 *  spelling of "most used" here would be the drift that function exists to prevent).
 *
 *  THE SAME CACHED LIST the census and the rows read, so this is a cache hit and never a second request —
 *  the `useMemberTitle` discipline: usage totals already ride every row of a query the pane has loaded
 *  anyway. (This clause used to say tags was "the one collection that HAS a preview" — regex and world-info
 *  grew their own on 2026-08-19, ranked by recency and by attachment.) */
export function useTagPreview(): readonly CollectionPreviewEntry[] | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data;
  return rows === undefined ? rows : sortTagsBy(rows, "used").slice(0, COLLECTION_PREVIEW_LIMIT).map(previewEntry);
}

/** The OPEN member's name for the mobile pushed frame's topbar (the `useMemberTitle` seam) — the SAME
 *  cached list the census and the rows read, so this is a cache hit and never a second request. */
export function useTagMemberTitle(memberId: string): string | undefined {
  const trpc = useTRPC();
  const rows = useQuery(trpc.tag.listTagsWithUsage.queryOptions()).data;
  return rows?.find((row) => row.id === memberId)?.name;
}

/** The create runner: mint a tag, then OPEN it in CONTENT — a create that leaves the user looking at the
 *  thing they just made, which is the whole reason the editor is mounted rather than popped. */
export function useCreateTagMember(): () => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateTag({ trpc, invalidation });
  return (): void => {
    void create.mutateAsync({ input: { name: NEW_TAG_NAME } }).then((created) => {
      selectCollectionMember(TAG_COLLECTION_ID, created.id);
    });
  };
}
