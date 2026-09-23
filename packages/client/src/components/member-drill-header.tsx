// MemberDrillHeader — the ONE drill row a drilled-in member surface draws (#1747, the mock design §3.4, boards
// 03/05/06): `← Back to <library>` · the member's NAME · the member's OWN verbs, on one row.
//
// WHY THE MEMBER SURFACE OWNS IT AND THE HOST DOES NOT (the #1725 commit-3 delta this closes). The host
// (`config-content-surface.tsx`) drew the Back alone and every member surface drew the name one row lower as
// its own `h2`, so the boards' single row was two. A host `<Heading>` was tried first and printed the name
// TWICE — two CTs went red on a strict-mode `getByRole("heading", {name})` resolving two nodes. The name has
// exactly one author, and it is the surface that knows the member: so the surface draws the WHOLE row and
// the host hands it the library it came from (`CollectionMemberView.library`).
//
// THE HOST'S BACK SURVIVES WHERE IT WAS LOAD-BEARING. The host's own note ruled the Back OUTSIDE the
// member's suspense boundary, because a member surface reads through `useSuspenseQuery` and a header inside
// the pending arm takes the drilled reader's only exit away for exactly the beat they most want it. That
// ruling survives — its INPUT changed: the host now draws a Back-only row as the boundary's FALLBACK and its
// error arm, so exactly one of the two paints at any moment and the exit is never absent.
//
// NO LIFECYCLE CHROME (D121(D), #271): Delete stays on the row's kebab, in every collection. `actions` is
// for the member's own verbs (world info: Edit details · Backfill · New entry; rosters: Start chat) — the
// fork "the kebab is off-screen while drilled" is answered by the Back on this row.
//
// HOMED CLIENT-SHARED, NOT `@orb/ui` — the `ListPaneHeader` / `LibrarySurfaceShell` / `ConfirmDialog` owner
// ruling: a composite of existing primitives with a workspace-shaped grammar is not a domain-agnostic
// primitive (§13.9's inclusion litmus). It adds zero primitives, tokens or variants. Its placement's
// enforcer is `client-features-no-cross` (dep-cruiser): the four member surfaces that draw it live in four
// different features, so the only legal home for one shared spelling is here.

import { Button } from "@orb/ui/button";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useMobileViewport } from "#state";

/** The row's exit — the label is the button's whole accessible name AND its visible text (`Back to Tags`,
 *  `Back to entries`), so the glyph beside it stays decorative. */
export interface MemberDrillBack {
  readonly label: string;
  readonly onClick: () => void;
}

export interface MemberDrillHeaderProps {
  readonly back: MemberDrillBack;
  /** The member's name — the surface's ONE `h2`. Stated here and nowhere else on the surface.
   *
   *  OPTIONAL for exactly the two states in which there IS no member to name: the host's pending/error arms
   *  (the read has not answered yet) and a surface's deleted-member arm (another device removed it while it
   *  was open). Both still owe the exit, which is why they draw this row rather than a bare Button — a
   *  second spelling of the same row is how the exit and the header drifted apart before. */
  readonly title?: string;
  /** An optional fact about the member that travels with its name (a tag's usage census, an autosave
   *  readout). NOT a verb: it sits with the name, never in the trailing cluster. */
  readonly meta?: ReactNode;
  /** The member's own verbs, at the row's trailing edge. Omit for a member that has none (tags). */
  readonly actions?: ReactNode;
}

/** `[← Back to <library>] <name> <meta> … <verbs>` — one row (the mock design §3.4), and NOTHING but the verbs at
 *  the phone regime (boards p1–p4; owner-relayed ruling 2026-09-05). */
export function MemberDrillHeader({ back, title, meta, actions }: MemberDrillHeaderProps): ReactElement {
  // The shell's PUBLISHED regime, read from `#state` — never a matchMedia of our own (`no-raw-matchmedia`
  // one-homes those in `features/app-shell/hooks/use-is-mobile-viewport.ts`, which a shared composite may
  // not import; `useMobileViewport` is the projection that exists for exactly this branch).
  const phone = useMobileViewport();
  if (phone) {
    // ═══ THE PHONE DRAWS NO DRILL ROW (boards p3/p4) ═══════════════════════════════════════════════════
    // The topbar already carries `←` and the member's name there (`shell-topbar.tsx` over the section's
    // `useSelectionTitle`), so drawing this row would print the exit twice and the name twice inside 430px
    // — the doubled chrome the owner's review rejected. What CANNOT be dropped with it is the member's
    // HEADING: the topbar title is not a heading, so a phone reader navigating by headings would lose the
    // member entirely. It stays in the tree, visually hidden — same node, same `h2`, same one-name count.
    //
    // THE VERBS STAY, AND THAT IS A STATED DELTA. p3/p4 draw a regex member, and regex is the ONE
    // collection with no verbs at all — so the boards cannot say where world info's `New entry` goes on a
    // phone, and the details SHEET (p4) draws the context arm only. Dropping them would make creating an
    // entry impossible on a phone, so they keep the position they have rather than being invented a new
    // home. Their slot is NOT the drill row's: at this regime there is no drill row to name.
    return (
      <Row align="center" className="min-w-0 flex-wrap" data-slot="config-member-verbs" gap="field" justify="between">
        {title === undefined ? null : (
          <Heading className="sr-only" level={2}>
            {title}
          </Heading>
        )}
        {meta}
        {actions === undefined ? null : (
          <Row align="center" className="shrink-0" gap="field">
            {actions}
          </Row>
        )}
      </Row>
    );
  }
  return (
    // `flex-wrap` IS LOAD-BEARING AND WAS MEASURED, not defensive (the narrowest-real-mount rule). The
    // world-info book draws Back + a name + THREE verbs, and the first spelling laid them out in one
    // unwrappable line: measured at 430 (before the phone arm above existed), `Back to World Info` printed
    // straight THROUGH `Edit details` and the heading collapsed to nothing — a CT screenshot, not a worry.
    // The phone no longer reaches this arm, but the narrowest DESKTOP pane is 397px (a 752px window with
    // the LIST docked at 307), which is inside the same failure band. The row is still one row at every
    // width the boards are drawn at.
    <Row align="center" className="min-w-0 flex-wrap" data-slot="config-drill-header" gap="field" justify="between">
      <Row align="center" className="min-w-0" gap="field">
        <Button className="shrink-0" intent="ghost" onClick={back.onClick} size="sm" type="button">
          <Icon icon={ArrowLeft} size="sm" />
          {back.label}
        </Button>
        {/* `truncate` on the heading, not on a wrapper: a long member name ellipsises inside the row rather
            than pushing the verbs off the pane's trailing edge (the `ListPaneHeader` twin's rule). */}
        {title === undefined ? null : (
          <Heading className="truncate" level={2}>
            {title}
          </Heading>
        )}
        {meta}
      </Row>
      {actions === undefined ? null : (
        <Row align="center" className="shrink-0" gap="field">
          {actions}
        </Row>
      )}
    </Row>
  );
}
