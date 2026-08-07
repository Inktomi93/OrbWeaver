// The Databank section's `useSelectionTitle` — the mobile pushed frame's topbar names the open DOCUMENT,
// not the section (side-eye P2). Cache-first + gated, sharing the `databank.get` read the detail surface
// already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedDocumentId } from "#state";

export function useDatabankSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedDocumentId(), (id) => trpc.databank.get.queryOptions({ id }));
  const title = data?.name ?? "";
  return title.length === 0 ? null : title;
}
