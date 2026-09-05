// The Databank section's `useSelectionTitle` — the mobile pushed frame's topbar names the open DOCUMENT,
// not the section (side-eye P2). Cache-first + gated, sharing the `databank.get` read the detail surface
// already made; `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

//
// WITH NO DOCUMENT OPEN IT NAMES THE SECTION *AND ITS SIZE* (#1676, the #1670 class). On a phone the LIST pane
// IS the screen and the ONE-NAME rule (shell.css) sheds the LIST band's title — and the census travels INSIDE
// that title (`components/list-pane-header.tsx`), so the bank's size was printed nowhere at all. The count
// goes back with the noun that survives, off the SAME bank-health read the band prints from.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedDocumentId } from "#state";
import { useDatabankCensus } from "../hooks/use-databank-census.ts";
import { DATABANK_SECTION_LABEL } from "./databank-section-label.ts";

export function useDatabankSelectionTitle(): string | null {
  const trpc = useTRPC();
  const documentId = useSelectedDocumentId();
  const { data } = useGatedQuery(documentId, (id) => trpc.databank.get.queryOptions({ id }));
  // Unconditional, above the early return: this is a hook, and the shell calls THIS hook unconditionally for
  // exactly the same reason (`section-registry.ts`, `NO_SELECTION_TITLE`).
  const census = useDatabankCensus();
  const title = data?.name ?? "";
  // THE CENSUS IS THE NO-SELECTION ARM, gated on the SELECTION rather than on "did a name land" (#1676):
  // with a member open this screen is that member's, so an unlanded name heals to the shell's section label,
  // never to the library's size — a true number about the wrong screen is not an improvement on a blank one.
  if (documentId !== null) {
    return title.length === 0 ? null : title;
  }
  // A ZERO CENSUS IS STILL SUPPRESSED, in the band's own spelling (`ListPaneHeader`: "a zero census is noise,
  // not information") — an empty bank says `Databank` and lets its teaching state do the teaching. `undefined`
  // is the unread OR FAILED read (#1500), which is likewise not a size claim.
  if (census === undefined || census === 0) {
    return null;
  }
  return `${DATABANK_SECTION_LABEL} · ${String(census)}`;
}
