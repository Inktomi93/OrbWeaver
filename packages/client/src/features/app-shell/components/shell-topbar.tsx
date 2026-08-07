// ShellTopbar — the always-present strip above CONTENT. Shell-owned, section-agnostic chrome: the list
// panel toggle (frame grammar, positionally bound to the list panel — stays intrinsic), the active section
// title (or a per-section header node the route supplies), and the registry-driven `topbar.trail` zone
// (⌘K derived from the modal registry; the bell/focus/context toggles ride the chrome registry as
// widgets — shell-chrome-unification.md §A). Every icon button + the chip carries a Tooltip.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { ChevronLeft, Icon, PanelLeftClose, PanelLeftOpen } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode } from "#state";

export interface ShellTopbarProps {
  readonly title: string;
  /** Per-section header node the route may supply (defaults to just the title). */
  readonly header?: ReactNode;
  /** The registry-derived `topbar.trail` zone render (⌘K + chrome widgets), rendered as-is. */
  readonly trail: ReactNode;
  readonly listMode: PanelMode;
  /** Does the active section HAVE a LIST pane? `false` ⇒ NO toggle renders (home-section-spec §4.4 / arm
   *  L-b) — a reachable toggle onto a surface that does not exist is the "looks unbuilt" defect. */
  readonly listAvailable: boolean;
  /** The shell's MOBILE regime (`ShellLayout.mobileViewport`) — the lead control's VOCABULARY axis and
   *  nothing else. On a phone there is no "panel": the toggle swaps which of the section's two SCREENS is
   *  showing, so it is named for where a tap LANDS (§14). The control, its wiring and its ruled reachability
   *  are identical in both regimes (see `leadControl`). */
  readonly mobile?: boolean;
  readonly onToggleList: () => void;
  /** THE MOBILE ONE-SHELL RULE's back affordance (owner-ruled 2026-08-03): non-null only when a phone has
   *  a member pushed over a list-bearing section's roster. It REPLACES the list toggle in the lead slot —
   *  one door back, not two (the mock's frame 3 draws exactly one lead control), and the toggle's own job
   *  (float the list over the detail) is what "back" now does properly. */
  readonly onBack?: (() => void) | null;
  /** The back affordance's accessible name — the glyph carries no text (§13.10). `"Back to Chats"`. */
  readonly backLabel?: string;
  /** What the NARROW row calls this screen: the OPEN member's own name where the section resolves one
   *  (`SectionDefinition.useSelectionTitle`), else the section label. CONTENT, not layout context — WHICH
   *  identity shows is a width question the container query answers (`shell.css`), never a prop
   *  (`no-layout-context-props`: the container model replaces `compact`/`isSheet`/`density` props).
   *
   *  Why the narrow row swaps at all (side-eye P1, measured at 320px): the section's rich `header` cluster
   *  (avatars + member chip + badges) is desktop-shaped, and with the trail taking 277 of 320px the LEAD
   *  collapsed to 10.7px — the back button's box overlapped the ⌘K chip and every hit sample on it opened
   *  the command palette, with that button the ONLY exit from a chat. */
  readonly screenTitle?: string;
}

export interface TopbarIconButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly onClick: () => void;
}

/** One tooltip-wrapped topbar icon button — the label is both the tooltip text AND the aria-label.
 *  Exported so the fullscreen/context-toggle chrome widgets (features/app-shell/lib) render the SAME
 *  affordance shape the list-panel toggle uses. */
export function TopbarIconButton({ label, icon, pressed, expanded, onClick }: TopbarIconButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            intent="ghost"
            size="icon"
            className="shell-topbar-icon-btn"
            aria-label={label}
            aria-pressed={pressed}
            aria-expanded={expanded}
            onClick={onClick}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** The lead slot's ONE control: the mobile back affordance where it exists, else the list toggle where the
 *  section has a list, else nothing. Back WINS over the toggle — both would be doors to the same roster, and
 *  the mock's pushed-detail frame draws exactly one lead control.
 *
 *  THE PHONE SPEAKS SCREENS, THE DESKTOP SPEAKS PANELS (side-eye 2026-08-07 finding 4, §14). "Hide list
 *  panel" names a frame REGION, which a phone does not have: at ≤48rem `resolvePanelMode` pins the LIST
 *  `docked` with nothing selected, i.e. the roster IS the screen, and this control swaps it for the section's
 *  no-selection CONTENT. So the mobile arm names the DESTINATION of the tap.
 *
 *  WHAT THIS DELIBERATELY DOES NOT DO — drop the control on mobile. The review that raised the vocabulary
 *  defect also asked for the toggle's removal, on the premise that it strands the user; side-eye's OWN
 *  receipt (reports/side-eye-reverify/t11-hidelist-320.png) shows the lead control re-rendered as the
 *  inverse label one tap away, so it does not. And removing it would reverse the 2026-08-03 owner-ruled
 *  mobile one-shell rule stated verbatim in `state/panel-resolve.ts` and `hooks/use-shell-layout.ts`: with
 *  the list pinned `docked` for all seven list-bearing sections, this toggle is the ONLY phone door to a
 *  section's no-selection CONTENT (the corpus/analytics dashboards). Orchestrator-ruled 2026-08-07: keep the
 *  mechanism, fix the words. */
function leadControl({ listMode, listAvailable, mobile, title, onToggleList, onBack, backLabel }: ShellTopbarProps): ReactNode {
  if (onBack !== undefined && onBack !== null) {
    // Same vocabulary as the LIST band's own back (components/list-pane-header.tsx): a ghost icon button
    // wearing ChevronLeft, named by where it goes.
    return <TopbarIconButton label={backLabel ?? "Back"} icon={ChevronLeft} onClick={onBack} />;
  }
  if (!listAvailable) {
    return null;
  }
  const listCollapsed = listMode === "collapsed";
  return (
    <TopbarIconButton
      label={listToggleLabel(mobile === true, listCollapsed, title)}
      icon={listCollapsed ? PanelLeftOpen : PanelLeftClose}
      expanded={!listCollapsed}
      onClick={onToggleList}
    />
  );
}

/** The list toggle's accessible name, per regime. DESKTOP keeps the frame vocabulary, which is correct
 *  there — the panel is a visible region of a three-track shell and "hide it" is literally what happens.
 *  MOBILE names the SCREEN a tap lands on: both arms lead with "Show" because on a phone neither state is
 *  a reduction of the other — they are the section's two full-width screens, its roster and its overview. */
function listToggleLabel(mobile: boolean, listCollapsed: boolean, title: string): string {
  if (!mobile) {
    return listCollapsed ? "Show list panel" : "Hide list panel";
  }
  return listCollapsed ? `Show ${title} list` : `Show ${title} overview`;
}

/** The topbar's one title voice. A single component so the file carries ONE element with the `<Text>` type
 *  axes (the density-tier A3 budget this file is baselined at), rendered from both identity arms. */
function TopbarTitle({ className, children }: { readonly className?: string; readonly children: ReactNode }): ReactElement {
  return (
    <Text className={className} size="title" weight="semibold">
      {children}
    </Text>
  );
}

/** The WIDE identity: the section's own header cluster where it supplies one, else the title while the list
 *  pane is hidden. Both identity arms are always in the DOM; `shell.css`'s `@container shell-main` query
 *  shows exactly one — the row's width is a container question, not a viewport prop (§4b axis 1). */
function wideIdentity({ title, header, listMode }: ShellTopbarProps): ReactNode {
  if (header !== undefined && header !== null) {
    return header;
  }
  return listMode === "collapsed" ? <TopbarTitle>{title}</TopbarTitle> : null;
}

export function ShellTopbar(props: ShellTopbarProps): ReactElement {
  return (
    <header className="shell-topbar">
      <div className="shell-topbar-lead">
        {leadControl(props)}
        <div className="shell-topbar-identity" data-identity="wide">
          {wideIdentity(props)}
        </div>
        <div className="shell-topbar-identity" data-identity="narrow">
          <TopbarTitle className="shell-topbar-title truncate">{props.screenTitle ?? props.title}</TopbarTitle>
        </div>
      </div>

      <div className="shell-topbar-trail">{props.trail}</div>
    </header>
  );
}
