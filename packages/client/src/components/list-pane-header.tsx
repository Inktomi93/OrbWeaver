// ListPaneHeader — the client-shared LIST chrome-band cluster (list-pane-projection §11.2, D12). The content
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
  /** A live census. Rendered mono/micro/muted, and omitted at 0 (a zero census is noise, not information). */
  readonly count?: number;
  readonly back?: ListPaneHeaderBack;
  /** The panel's ONE primary action (A2). Omit for a browse-shaped pane with no create verb. */
  readonly action?: ReactNode;
}

/** One LIST chrome-band: `[‹] TITLE · accent  count … action`. */
export function ListPaneHeader({ title, accent, count, back, action }: ListPaneHeaderProps): ReactElement {
  return (
    <>
      <Row align="center" className="min-w-0" gap="field">
        {back === undefined ? null : (
          <Button aria-label={back.label} intent="ghost" onClick={back.onClick} size="icon" type="button">
            <Icon icon={ChevronLeft} size="sm" />
          </Button>
        )}
        {/* `data-slot` + `data-scoped`: on a phone the ONE-SHELL rule makes this pane the screen and the
            TOPBAR prints its name, so an UNSCOPED band title says the same word twice within 50px
            (side-eye leg-4 P3 — measured on Characters). A SCOPED band ("CHATS · Sera") is a different
            statement about a swapped pane, so it stays. shell.css sheds the duplicate; the decision lives
            there because "is this pane the screen?" is the shell's fact, not this composite's. */}
        <Heading
          className="truncate"
          data-scoped={accent === undefined ? undefined : "true"}
          data-slot="list-pane-title"
          level={2}
          size="micro"
          tone="muted"
          transform="caps"
          weight="semibold"
        >
          {accent === undefined ? title : `${title} · `}
          {/* The entity half carries the foreground tone so the pane reads as "CHATS, scoped to HER";
              `caps` inherits from the heading, so the accent needs no transform of its own. */}
          {accent === undefined ? null : (
            <Text as="span" size="micro" tone="default" weight="semibold">
              {accent}
            </Text>
          )}
        </Heading>
        {count === undefined || count === 0 ? null : (
          <Text className="font-mono" size="micro" tone="muted">
            {count}
          </Text>
        )}
      </Row>
      {action}
    </>
  );
}
