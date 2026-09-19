// ListPaneHeader — the client-shared LIST chrome-band cluster (D12). The content
// a section definition's `listHeader` slot feeds into `.shell-panel-header`: an optional back affordance, the
// section title at the DISPLAY step (optionally `Title · <accent>` for a scoped/entity mode — #1136, see the
// heading), a live mono count, and the panel's ONE primary action (D66 A2).
//
// Minted because three landed headers hand-copied the identical `Row(Heading micro/caps/semibold + Text
// micro/mono/muted)` cluster (chat · corpus · analytics) and the character screen's modal band adds two more
// modes — the §13.0 bar (3+ sites AND changing together) is met. Retires all three private copies in the
// commit it lands; they now pass their own data through this one shape.
//
// OWNER RULING precedent: composites live client-shared, NOT @orb/ui (the LibrarySurfaceShell/ConfirmDialog
// homing). Zero new primitives/tokens/variants — every size/weight/tone already has a variant row.
//
// The band itself is `display:flex; justify-content:space-between` (shell.css), so this renders a FRAGMENT:
// the identity cluster, then the action. No action ⇒ the cluster sits at the start edge (corpus/analytics).

import { Button } from "@orb/ui/button";
import { ChevronLeft, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { LIST_PANE_TITLE_ID } from "#lib";

/** The band's leading back affordance — a mode-swapped pane's way out (Arm A's projection → picker). */
export interface ListPaneHeaderBack {
  /** The button's accessible name, e.g. "Back to all characters" (the glyph carries no text). */
  readonly label: string;
  readonly onClick: () => void;
}

export interface ListPaneHeaderProps {
  /** The section title, rendered at the DISPLAY step (`Chats`, `Corpus`, …) — #1136. */
  readonly title: string;
  /** The scoped-mode entity half — renders as `Title · <accent>` with the accent in the muted tone. */
  readonly accent?: string;
  /** A live census. Rendered mono/label/muted, and omitted at 0 (a zero census is noise, not information). A
   *  string is a page-BOUNDED count that already read `"100+"` off its own limit (P2-d) — the caller decided
   *  the cap, this band just prints what it is handed. */
  readonly count?: number | string;
  readonly back?: ListPaneHeaderBack;
  /** The panel's ONE primary action. Omit for a browse-shaped pane with no create verb. */
  readonly action?: ReactNode;
}

/** One LIST chrome-band: `[‹] Title · accent  count … action`. */
export function ListPaneHeader({ title, accent, count, back, action }: ListPaneHeaderProps): ReactElement {
  return (
    <>
      {/* `data-slot="list-pane-identity"` names this cluster for the shell: on a phone the ONE-SHELL rule
          sheds the unscoped title (below), and the shell then needs to know whether ANYTHING is left in the
          band before it keeps spending a 48px chrome row on it. See shell.css's mobile arm. */}
      <Row align="center" className="min-w-0" data-slot="list-pane-identity" gap="field">
        {back === undefined ? null : (
          <Button aria-label={back.label} data-slot="list-pane-back" intent="ghost" onClick={back.onClick} size="icon" type="button">
            <Icon icon={ChevronLeft} size="sm" />
          </Button>
        )}
        {/* `data-slot` + `data-scoped`: on a phone the ONE-SHELL rule makes this pane the screen and the
            TOPBAR prints its name, so an UNSCOPED band title says the same word twice within 50px
            (side-eye leg-4 P3 — measured on Characters). A SCOPED band ("CHATS · Sera") is a different
            statement about a swapped pane, so it stays. shell.css sheds the duplicate; the decision lives
            there because "is this pane the screen?" is the shell's fact, not this composite's. */}
        {/* THE COUNT TRAVELS WITH THE TITLE (side-eye 2026-08-06). It used to be the heading's SIBLING, so
            the mobile rule shed the noun and left the number behind: the Chats roster printed a bare "8" on
            an otherwise empty 48px band, and a count with no noun is not a fact. Inside the heading it can
            only ever be read WITH the thing it counts, in either regime, with no second CSS rule to keep in
            step. The heading is therefore the flex BOX and `truncate` moves to the title text alone — so a
            long name still ellipsises and the census still survives beside it, exactly as before. */}
        {/* THE LANDMARK IS NAMED BY THIS HEADING (#493) — the LIST `<aside>` points its `aria-labelledby`
            here (`LIST_PANE_TITLE_ID`), so the complementary landmark says whatever the band says. It is
            what makes a pane that SWAPS its contents (Characters → a character's chats) stop announcing
            the section it used to hold. The rationale + the single-instance argument live at the constant. */}
        {/* THE BAND'S NAME IS THE SURFACE'S DISPLAY SLOT (#1136, side-eye 2026-09-02 F9 — and the Config
            drive's F24, which is the SAME defect because it is the same file: seven sections' list bands
            resolve their title here). It used to be `size="micro" transform="caps" tone="muted"`, i.e. the
            10.5px caps KICKER — so the pane's own `<h2>` was SMALLER than the body text under it and the
            largest type anywhere on a rail surface was 16px. `flat-type-hierarchy` fired in every arm of
            every appearance preset with "10.5px, 13px, 15px, 16px (ratio 1.5:1)".
            THE STEP IS FORCED, NOT CHOSEN: the rule's floor is max/min >= 2.0 and the min on these surfaces
            is the 10.5px kicker, so nothing below 21px clears it — `title` (16) and `headline` (20) both
            still fail. `display` (24) is the one ramp step that does, which is also what the rule's own
            message says the ramp is for. A kicker still names the GROUPS inside the pane (`View`,
            `Filters`); what it may no longer name is the pane itself.
            IT KEEPS `truncate` AND THE MOBILE SHED: a 24px name in a 307px docked band ellipsises exactly
            as the 10.5px one did, and shell.css still sheds an unscoped title when the pane IS the screen. */}
        <Heading
          // `gap-row`, not `gap-field` (#525): 6px of air between the NAME and a mono DATUM is below the
          // step the eye needs to read them as two things, and the census is the one child here that is not
          // part of the title's phrase.
          className="flex min-w-0 items-center gap-row"
          data-scoped={accent === undefined ? undefined : "true"}
          data-slot="list-pane-title"
          id={LIST_PANE_TITLE_ID}
          level={2}
          size="display"
          tone="default"
          weight="semibold"
        >
          {/* The title TEXT is what truncates, not the heading box — see the count's note. It restates the
              display axes because it is the element that carries them (the heading is the flex box), which
              is the same spelling the accent half beside it already uses. */}
          <Text as="span" className="truncate" size="display" tone="default" weight="semibold">
            {accent === undefined ? title : `${title} · `}
            {/* The entity half is the same step; it carries the MUTED tone now that the name it qualifies
                owns the foreground, so the pane still reads as "Chats, scoped to HER" rather than as two
                equal nouns. */}
            {accent === undefined ? null : (
              <Text as="span" size="display" tone="muted" weight="semibold">
                {accent}
              </Text>
            )}
          </Text>
          {/* ZERO IS SUPPRESSED IN BOTH SPELLINGS. `count` is `number | string`, so a numeric-only test let a
              string `"0"` — the same fact, built by a caller that formats its own datum — render the empty
              count the numeric arm exists to hide. Only the bare `"0"`: a composed `"0 of 896"` is a real
              sentence about a filter and stays. */}
          {count === undefined || count === 0 || count === "0" ? null : (
            // THE COUNT RIDES `label`, NOT `micro` (#1136): beside a 24px name a 10.5px datum is not quiet,
            // it is unreadable. The step is a LEGIBILITY call and nothing else — measured in the CT browser
            // inside the real band, the datum lands at top 15.5 either way, because the .5 is the BAND's,
            // not this element's: `.shell-panel-header` is `height: 48px` + a 1px bottom rule, so its
            // content box is 47 and `align-items:center` halves an odd remainder for every child it holds
            // (the heading at 8.5, the 32px action buttons at 7.5 — the two `off-grid-text` findings #1135
            // already carries on this band). That is the band's row to fix, not this one's.
            // `normal-case` is gone with the heading's caps: the #525 defect it existed to stop
            // (`CHATS 129 OF 896` — the joining word shouting at the section name's weight) cannot occur
            // now that nothing in this cluster uppercases.
            <Text as="span" className="shrink-0 font-mono" size="label" tone="muted" weight="regular">
              {count}
            </Text>
          )}
        </Heading>
      </Row>
      {/* THE ACTION IS WRAPPED SO THE SHELL CAN COUNTER IT (#2463), and the wrapper is the marker rather
          than a box with a job of its own. The band is `justify-content: space-between`, so this child is
          pinned to the LIST PANE's end edge — and that edge MOVES on a context toggle, because the pane is
          anchored to the rail and the #242 squeeze changes its WIDTH (307 → 272 at 1280x800). A reflow is
          not a transform and nothing outside the pane can cancel it, so shell.css counters this box
          directly ("THE FOURTH ALIGNMENT CLASS"); measured before it, the action CUT 304 → 269 in one frame
          on every context toggle and stayed there while every box around it eased.
          A MARKER AND NOT `:last-child`: with no action this cluster's identity `Row` is the last child,
          and it is START-aligned — countering it would manufacture the excursion the rule erases, which is
          the failure the topbar trail already recorded (#1316). The wrapper renders only WITH an action, so
          shell.css's mobile band-shed test (`:not(:has(> *:not([data-slot="list-pane-identity"])))`) reads
          exactly what it read before: one non-identity child iff the pane has a primary action. */}
      {action === undefined ? null : <div data-slot="list-pane-action">{action}</div>}
    </>
  );
}
