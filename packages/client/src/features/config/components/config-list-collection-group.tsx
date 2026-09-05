// A COLLECTION group in the Settings LIST — the BAND, and nothing else.
//
// ═══ THE OWNER MOVED THE MEMBERS (#1725, ruling 2026-09-05, verbatim) ══════════════════════════════════
// "k but tag list under in list is kinda a no go that needs to move into content when clicking onto tags,
// same thing for regex and world info is what im trying to say right now its mixed and looks weird" · "so
// that means content will need to be redesigned for those interfaces to properly be consistent" · on the
// approved canvas: "redesign approved it can be built to spec but must match the mockups". The spec is
// `docs/design/mocks/config-collections/DESIGN.md`; this file builds its §3.1.
//
// So the LIST stopped mixing two row species. It used to hold the band, the host's count-driven filter box,
// the contribution's member rows and a zero-member sentence; all four of those are the CONTENT library's now
// (`config-collection-landing.tsx`). What is left here is the DOOR — and a door is one Button.
//
// TWO BAND KINDS NO LONGER EXIST (DESIGN.md §3.1). The populated/empty split was a split about DISCLOSURE:
// one arm had rows to unfold and the other did not, so one was a disclosure and the other a bare selection.
// With no rows in this pane at all, both arms are the same act — SELECT — and population decides only what
// CONTENT draws when the reader arrives. `CollectionMemberBand` + `CollectionEmptyBand` are therefore one
// component again, which is also what makes "the collection band IS the settings band" true rather than
// aspirational: same ghost `size="sm"` Button, same 32/44px box, same reserved chevron gutter, same
// `interactiveKicker` label. The only deltas from `SectionsBand` are that the chevron is never drawn (there
// is nothing to unfold, so no `aria-expanded` either) and that this band carries a live census.
//
// ═══ THE RULINGS THAT SURVIVE WITH A CHANGED INPUT — each recorded, none silently reversed ════════════
//  · #925 ENTER (select-and-disclose). The band's click ENTERS the library; the DISCLOSE half is retired
//    because there is nothing in this pane to disclose. The owner ruled WHERE the members live, so the
//    ruling's mechanism (one act, never a select-then-toggle pair that could land closed) is exactly what
//    survives: `selectConfigGroup` still lands CONTENT on the library in one act.
//  · The 2026-08-06 P2 / #1099 F5 ruling that a zero-member band must still be a CONTROL — a first-run
//    reader could once neither click nor TAB to the library they came for, because interactivity was decided
//    by population. INTACT and now structural: there is one band, so population cannot reach the question.
//  · #1211's "a library that says nothing about being empty reads as a feature that was never built". Its
//    COPY half survives verbatim and its ADDRESS changed: the sentence is `emptyText` on the CONTENT landing
//    (F5 arm A, board 07), and the band still states the honest `0` beside it.
//  · D121(D) `band=Import` and the band's create `+`. Both were band chrome because the band was the
//    library's only chrome in this workspace. The library has a pane now, so they move to its control row
//    (DESIGN.md §3.2) — one home each, in the pane the reader is looking at. The C-2 no-aggregate-primary
//    ruling is untouched; only the address changed.
//  · The VOICE BUDGET is the pane's, not per-species (#1714) — `interactiveKicker` names this band because a
//    band is a control that names a region, `datum` is its mono count. Its ONE home is
//    `config-list-group.tsx`'s header and it governs this file.
//
// `aria-current` IS `"true"`, NOT DESIGN.md §3.1's `"location"` — a deliberate, stated deviation. The
// settings band beside it (`config-list-group.tsx`) says `"true"`, and one pane announcing its two band
// kinds with two different tokens is precisely the drift #1714 spent a lane removing. The token is not a
// visible property, so "must match the mockups" is not at stake; if the owner wants `location`, it is a
// two-line change at BOTH bands, never at one.

import { Button } from "@orb/ui/button";
import { ChevronRight, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactNode, RefObject } from "react";
import type { CollectionGroupDefinition } from "#state";
import { selectConfigGroup } from "#state";

export interface CollectionListGroupProps {
  readonly group: CollectionGroupDefinition;
  /** The EFFECTIVE active group is this one — the band is the location, whether or not a member is open.
   *  Nothing renders below it in this pane any more, so there is no child to hold `aria-current` instead. */
  readonly active: boolean;
  /** The SECTION's arrival focus target (#1218) — handed to the ACTIVE group only, whichever species it is. */
  readonly bandRef?: RefObject<HTMLButtonElement | null>;
}

export function CollectionListGroup({ group, active, bandRef }: CollectionListGroupProps): ReactNode {
  const collection = group.body.collection;
  // Every hook runs UNCONDITIONALLY over the door-frozen registry (the `useVisible` contract) — the
  // visibility verdict gates the RENDER, never the hook call.
  const visible = collection.useVisible?.() ?? true;
  // The BAND reads the number only. A census that failed has no number, which is the same thing the band
  // draws for one that has not landed — a bare "TAGS" with no figure, never a fabricated `0`. The FAILURE
  // half is the LANDING's to say (#1546): it is the pane the reader is looking at, and it is the surface
  // that can carry a retry without turning a one-line band into an error state.
  const count = collection.useCount?.().count;

  if (!visible) {
    return null;
  }

  return (
    // The wrapper survives the row deletion because its data attributes are IDENTITY, not structure: sweeps
    // and CTs address a library as `[data-collection="tags"]`, and the group pair is what every LIST sweep
    // reads (side-eye 2026-08-19 — a band addressable only as a descendant of its group is a path, not an
    // identity). It keeps the settings arm's `data-slot="config-group"` so one selector still finds both.
    <Stack gap="tight" data-slot="config-group" data-collection={group.id} data-config-group={group.id}>
      <Button
        aria-current={active ? "true" : undefined}
        // THE NAME AND THE COUNT, UNGLUED (side-eye 2026-08-19 ARIA): the label and the count are adjacent
        // inline nodes, and the accessible-name computation concatenates them with NOTHING in between — this
        // band announced "Tags1736", one token, with the number welded onto the library's name. The separator
        // is a SPACE, never a comma: the band VISIBLY reads "Tags 1736" and a name must CONTAIN what it shows
        // (WCAG 2.5.3 Label in Name). Stated only when there IS a number, so a settling census keeps the
        // band's content-derived name rather than announcing a word that is not on screen.
        {...(count === undefined ? {} : { "aria-label": `${group.label} ${String(count)}` })}
        // `w-full`, NOT `flex-1` (#978 F1): this band's parent is a VERTICAL `Stack`, so `flex: 1 1 0%` puts a
        // flex-BASIS of 0 on the BLOCK axis and defeats the size variant's sealed `h-control-sm` — the button
        // falls back to min-content and the band renders 16px tall at BOTH pointer classes. It was `flex-1`
        // here for a real reason that #1725 retired: this band used to sit in a `Row` beside the trailing
        // verbs. The verbs moved to CONTENT, the Row went with them, and the axis changed — so the class
        // follows the settings band's, which is the same statement as "the collection band IS the settings
        // band". Pinned by the dynamic band-height CT at both pointer classes.
        className="min-w-0 w-full justify-start gap-tight px-tight"
        data-config-group={group.id}
        data-slot="config-band"
        intent="ghost"
        {...(bandRef === undefined ? {} : { ref: bandRef })}
        // ONE ACT: enter the library. `null` for the section — a collection has none. There is no toggle arm
        // any more, which is what retires #925's disclose half; the ENTER half is this call, unchanged.
        onClick={(): void => selectConfigGroup(group.id, null)}
        size="sm"
        type="button"
      >
        {/* THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). Dropping the chevron
            also drops its 16px box and the 4px joint, so a collection band's glyph would start 20px left of
            every settings sibling's and the LIST's left edge would become species-dependent — a ragged column
            that reads as a rendering bug. The spacer is the SAME `Icon` at the SAME size, merely `invisible`
            (visibility:hidden keeps the box, drops the paint, and the glyph is already decorative), so the
            gutter cannot drift from the chevron it stands in for the way a re-spelled width would. */}
        <Icon className="invisible" icon={ChevronRight} size="sm" />
        <Icon icon={group.icon} size="sm" />
        <Text as="span" voice="interactiveKicker" className="truncate">
          {group.label}
        </Text>
        {/* THE CENSUS RIDES THE TRAILING EDGE (DESIGN.md §3.1). `ms-auto` rather than a spacer: the label
            truncates and the count must not, so the count is what claims the remainder. A settling or failed
            read draws nothing at all — the band never fabricates a `0`, and the landing owns the failure. */}
        {count === undefined ? null : (
          <Text as="span" className="ms-auto" voice="datum">
            {count}
          </Text>
        )}
      </Button>
    </Stack>
  );
}
