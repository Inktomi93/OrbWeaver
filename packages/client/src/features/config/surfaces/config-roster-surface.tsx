// The Configuration LIST — the collection ROSTER (config-rail-spec.md §2): one owner-rendered group per
// registered `CollectionContribution`, in DOOR ORDER refined by the canonical `(order, id)` sort.
//
// The roster is the map of what EXISTS. It renders every registered collection, populated or not, so the
// pane's membership never depends on the user's data (a group that vanished when empty would read as a
// library that was never built).
//
// ═══ ELLIPSES ARE ACCEPTED HERE, AS POLICY (side-eye 2026-08-19 P2-1 — ruled, with the census) ═══════
//
// Row titles STILL clip in this pane, at both measured widths: 6 titles overrunning by up to 178px at the
// docked default (307px) and 8 by up to 213px at the both-panes-open floor (271px). Three width passes have
// now been spent on it, and the fix that would actually end it is a wider pane — which is a rail-layout
// change, not a roster one.
//
// THE COLLISION CENSUS IS WHAT SETTLES IT: across the owner's real corpus, ZERO pairs of rows share an
// indistinguishable visible prefix. Every clipped title is still unambiguous at the point it clips, so the
// user harm the finding was filed for — "I cannot tell these two rows apart" — does not exist on this data.
// An ellipsis on a row whose name is longer than its column is the honest rendering of a narrow pane, not a
// defect; a pane that hid the count, the create verb or the scent to avoid one would be.
//
// WHAT THAT DOES NOT LICENSE, and the reason this is stated rather than left implicit: a row may not spend
// the line on anything the reader cannot use. That is why the regex row's stage NAMES became glyphs, why
// its subtitle leads with the pattern, and why `regexRowScent` no longer pre-cuts that pattern at a fixed
// character count on top of the `truncate` this pane already applies — two truncations composing on one
// line is a real defect, and it was this pass's cheap real fix. Re-open the width question only with a
// census that finds an actual indistinguishable pair.

import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { useFocusOnMount } from "#lib";
import { CollectionGroup } from "../components/collection-group.tsx";
import { ConfigMobileTeaching } from "../components/config-mobile-teaching.tsx";
import { orderCollections } from "../lib/order-collections.ts";

export interface ConfigRosterSurfaceProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

export function ConfigRosterSurface({ collections }: ConfigRosterSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  return (
    // `h-full min-h-0` on the anchor is what makes the Stack's `overflow-y-auto` real: the shell's LIST
    // region is a bounded flex box with no overflow of its own, so without a definite height here an
    // expanded 400-row group grows the pane instead of scrolling inside it.
    <Container className="h-full min-h-0">
      {/* THE ARRIVAL TARGET SAYS WHERE YOU LANDED (side-eye 2026-08-19 P3). `useFocusOnMount` moves focus
          here on a section bounce, and focus arriving on an unnamed `tabIndex={-1}` scroller announces
          NOTHING — so the one affordance that fix exists to deliver ("you are in the list") was silent for
          the reader who cannot see the pane move. `role="region"` is what makes the name computable at all
          (a bare `aria-label` on a generic container is ignored), and it is the same anatomy the welcome's
          own islands use one pane over. The name is the pane's contents, not its section: the shell's LIST
          header already says "Configuration". */}
      <Stack
        aria-label="Libraries"
        className="relative h-full min-h-0 overflow-y-auto outline-none"
        data-slot="config-roster"
        gap="field"
        ref={surfaceRef}
        role="region"
        tabIndex={-1}
      >
        {/* THE PHONE'S ONLY TEACHING FRAME (side-eye 2026-08-19 P2) — mobile viewport + no selection only,
            and it stands itself down to `null` everywhere else, so the desktop roster is byte-identical to
            what it was. It lives INSIDE this scroller rather than above it because it is part of what the
            list screen says, not a fixed band over it. */}
        <ConfigMobileTeaching collections={collections} />
        {orderCollections(collections).map((collection) => (
          <CollectionGroup collection={collection} key={collection.id} />
        ))}
      </Stack>
    </Container>
  );
}
