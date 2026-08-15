// ListPaneHeader — the client-shared LIST chrome-band cluster (D12). The content
// a section definition's `listHeader` slot feeds into `.shell-panel-header`: an optional back affordance, the
// micro-caps section title (optionally `TITLE · <accent>` for a scoped/entity mode), a live mono count, and
// the panel's ONE primary action (D66 A2).
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

/** The band's leading back affordance — a mode-swapped pane's way out (Arm A's projection → picker). */
export interface ListPaneHeaderBack {
  /** The button's accessible name, e.g. "Back to all characters" (the glyph carries no text). */
  readonly label: string;
  readonly onClick: () => void;
}

export interface ListPaneHeaderProps {
  /** The section title, rendered micro-caps (`Chats`, `Corpus`, …). */
  readonly title: string;
  /** The scoped-mode entity half — renders as `TITLE · <accent>` with the accent in the foreground tone. */
  readonly accent?: string;
  /** A live census. Rendered mono/micro/muted, and omitted at 0 (a zero census is noise, not information). A
   *  string is a page-BOUNDED count that already read `"100+"` off its own limit (P2-d) — the caller decided
   *  the cap, this band just prints what it is handed. */
  readonly count?: number | string;
  readonly back?: ListPaneHeaderBack;
  /** The panel's ONE primary action. Omit for a browse-shaped pane with no create verb. */
  readonly action?: ReactNode;
}

/** One LIST chrome-band: `[‹] TITLE · accent  count … action`. */
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
        <Heading
          className="flex min-w-0 items-center gap-field"
          data-scoped={accent === undefined ? undefined : "true"}
          data-slot="list-pane-title"
          level={2}
          size="micro"
          tone="muted"
          transform="caps"
          weight="semibold"
        >
          {/* The title TEXT is what truncates, not the heading box — see the count's note. It restates the
              micro-caps axes because it is the element that now carries them (the heading became the flex
              box), which is the same spelling the accent half beside it already uses. */}
          <Text as="span" className="truncate" size="micro" tone="muted" transform="caps" weight="semibold">
            {accent === undefined ? title : `${title} · `}
            {/* The entity half carries the foreground tone so the pane reads as "CHATS, scoped to HER";
                `caps` inherits from the heading, so the accent needs no transform of its own. */}
            {accent === undefined ? null : (
              <Text as="span" size="micro" tone="default" weight="semibold">
                {accent}
              </Text>
            )}
          </Text>
          {count === undefined || count === 0 ? null : (
            <Text as="span" className="shrink-0 font-mono" size="micro" tone="muted" weight="regular">
              {count}
            </Text>
          )}
        </Heading>
      </Row>
      {action}
    </>
  );
}
