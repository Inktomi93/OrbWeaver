// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside whose
// `data-panel-mode` drives the clamp-overlay (docked in-flow · overlay float · collapsed off-screen)
// entirely in shell.css — no width math in JS.
//
// The `.shell-panel-header` band ALWAYS renders: both panels carry
// a chrome-row-tall band on the one shared horizon, even when a panel supplies no `header` content —
// the band is the BASELINE (the LIST surface's title/action move INTO it at N2). `header` content is an
// optional slot the band wraps.
//
// In its DOCKED and COLLAPSED modes neither panel supplies a collapse control here — the CONTEXT panel's
// open/close affordance is the registered `contextToggleChrome` topbar widget (the ONE detail-panel close
// control); the LIST panel's is the topbar's intrinsic list toggle.
//
// A COLLAPSED BODY IS DEFERRED PAST THE BOOT COMMIT, AND ITS MOUNT DOES NOT RIDE THE OPEN'S CLICK FRAME
// (#895) — see `bodyMounted` below for the measurement that split those into two different requirements.
//
// A PANE CAN BE THE SCREEN'S PRIMARY CONTENT, AND THEN IT IS THE `main` LANDMARK (#1349) — see
// `primaryContent` below. This is a RENDERING of the shell's own one-shell fact, never a second guess at
// what "mobile" means: `ShellLayout.listIsPrimaryContent` decides, one flag, for every section at once.
//
// AN OVERLAY IS DIFFERENT AND CARRIES ITS OWN DISMISS (side-eye 2026-08-06 P2). A floating panel's only
// exits were the scrim and Escape — and on a phone the panel is 100dvw, so the scrim it floats over has NO
// reachable pixel and Escape needs a keyboard. That left the topbar toggle as the sole way out: a control
// somewhere else, for a surface that is covering the screen. The band already exists on the one shared
// chrome horizon, so the close sits where the thing it closes is.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement, ReactNode, Ref } from "react";
import { startTransition, useEffect, useState } from "react";
import { LIST_PANE_TITLE_ID } from "#lib";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  /** Accessible name for the panel's `complementary` landmark, distinguishing LIST from CONTEXT. */
  readonly label?: string;
  /** Header content the always-present band wraps. `undefined` renders the band empty-but-present (the
   *  baseline horizon — D66 A1). */
  readonly header?: ReactNode;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  /** Does the ACTIVE SECTION declare this pane at all (`SectionDefinition.panels`, `section-registry.ts`)?
   *  Published as `data-panel-available` because the declaration is otherwise UNREACHABLE outside React:
   *  before it, `agent-nav/panel-request.ts` could only infer the answer from a write that failed to land
   *  ("the active section LIKELY declares no pane") and design-audit's SURFACE-AXIS census had to call an
   *  unreachable mode WITHHELD on a section that structurally cannot have it (#1122). `panel-request.ts`
   *  now READS this attribute and refuses without hedging; the "likely" wording survives only where the
   *  declaration is absent (#1149). `false` does NOT change what renders:
   *  `"unavailable"` is still not a fourth `PanelMode` (the pane resolves `collapsed`, the topbar ships no
   *  toggle — section-registry.ts). This attribute is a DECLARE, not a behaviour. */
  readonly available: boolean;
  /** Close THIS panel — the band's own dismiss, rendered only while the panel FLOATS (see the header). */
  readonly onDismiss: () => void;
  /** IS THIS PANE THE SCREEN'S PRIMARY CONTENT right now (#1349 — `ShellLayout.listIsPrimaryContent`)?
   *  `true` ⇒ the aside carries `main` instead of its `complementary` role and becomes the skip link's
   *  target, because on the phone landing the content column it would otherwise defer to is
   *  `display:none` behind this pane. The shell decides; this component only renders the decision. */
  readonly primaryContent?: boolean;
  /** The pane element itself — the skip link needs to move focus onto it in the `primaryContent` state. */
  readonly ref?: Ref<HTMLElement>;
  readonly children: ReactNode;
}

export function PanelChrome({ panel, label, header, mode, available, onDismiss, primaryContent = false, ref, children }: PanelChromeProps): ReactElement {
  // A collapsed panel is translated out of the shell and inert, so its first body mount cannot be seen or
  // reached — it must not ride the boot commit (4a6c54cdf). THAT RULING SURVIVES; ITS INPUT CHANGED (#895).
  // Latching the mount DURING RENDER (`if (mode !== "collapsed") setBodyMounted(true)`) satisfied it and
  // then moved the entire cost into the OPEN's own frame, which is the one frame the user is watching:
  // measured on the live stack at 4× CPU, the context pane's first open cost 127ms of blocking against a
  // 50ms budget — `dispatchDiscreteEvent` → 150ms of react-dom script + 43ms of FORCED style/layout, all of
  // it the query-backed panel body mounting synchronously inside the click's discrete-event task.
  //
  // "Not in the boot commit" and "in the click's commit" are two different requirements, and only the first
  // was ever the ruling. So the latch moves out of render into an effect and rides a TRANSITION: the click
  // commits the panel's CHROME (the aside flips `data-panel-mode`, shell.css starts the slide, the band
  // paints) and React renders the body as interruptible work that lands during the slide instead of before
  // it. That is the issue's own second option — "render the panel shell before the data" — and unlike
  // warming on hover/focus it costs a reader who never opens the pane exactly nothing, which is what the
  // original ruling was protecting. Once mounted the body stays mounted, so closing still preserves its
  // state and the transform animation is untouched.
  // ONCE-MOUNTED-STAYS-MOUNTED (#1796 investigation, closed): the body is deferred past the boot commit
  // (4a6c54cdf), then stays mounted even while collapsed. This is DELIBERATE:
  //  1. State preservation — closing/reopening is instant with no remount cost.
  //  2. TanStack Query subscriptions keep data warm — the pane reopens with current data.
  //  3. The `inert` attribute (below) prevents interaction while collapsed.
  //  4. The CSS `data-panel-mode="collapsed"` handles the visual hide (off-screen transform).
  // Effects and subscriptions DO continue running while collapsed, and they SHOULD: the alternative
  // (unmounting on collapse) would destroy query caches, reset scroll positions, and make every reopen
  // pay the full mount+fetch cost. The net cost of the mounted-but-inert body is the React fiber tree
  // and the warm query subscriptions — both are the mechanism that makes reopen instant.
  const [bodyMounted, setBodyMounted] = useState(mode !== "collapsed");
  useEffect(() => {
    if (mode === "collapsed" || bodyMounted) {
      return;
    }
    startTransition(() => setBodyMounted(true));
  }, [mode, bodyMounted]);
  return (
    <aside
      className="shell-panel"
      ref={ref}
      // THE PANE THAT IS THE SCREEN IS THE MAIN LANDMARK (#1349). Not a second `main`: in this state the
      // content column is `display:none` (shell.css's ONE-SHELL arm), so exactly one main is EXPOSED in
      // either state. `tabIndex={-1}` for the same reason `<main>` carries it — the skip link lands here.
      {...(primaryContent ? { role: "main", tabIndex: -1 } : {})}
      aria-label={label}
      // THE LIST LANDMARK FOLLOWS ITS OWN BAND (#493, side-eye 2026-08-22 rail-characters P2-3). `label` is
      // derived from the ACTIVE SECTION, so it announced "Characters list" over a pane that had swapped to a
      // character's CHATS. The band beside it already says the right thing; pointing the landmark at that
      // heading makes the two one fact instead of two. `aria-label` STAYS as the fallback — a name
      // computation whose `aria-labelledby` resolves to nothing falls through to it, which is exactly the
      // case for a section whose band is not a `ListPaneHeader`. CONTEXT keeps the static label: its band is
      // the section's detail identity, not a swappable pane. See `lib/list-pane-title-id.ts`.
      {...(panel === "list" ? { "aria-labelledby": LIST_PANE_TITLE_ID } : {})}
      data-panel-available={available ? "true" : "false"}
      data-panel-mode={mode}
      data-panel-side={panel}
      aria-hidden={mode === "collapsed" ? "true" : undefined}
      inert={mode === "collapsed" ? true : undefined}
    >
      {/* The overlay arm GROUPS the slot content so the band stays a two-child `space-between` box: the
          section's own header keeps its internal start/end split, and the dismiss owns the trailing edge.
          A claimed context pane supplies NOTHING, so the group renders empty and shell.css collapses the
          whole band exactly as it does docked (HUD-1 §3.1 — the claimant owns its top edge, including its
          own way out). */}
      <header className="shell-panel-header">
        {mode === "overlay" ? (
          <>
            <div className="shell-panel-header-group">{header}</div>
            <Button
              aria-label={label === undefined ? "Close panel" : `Close ${label}`}
              data-slot="panel-overlay-close"
              intent="ghost"
              onClick={onDismiss}
              size="icon"
              type="button"
            >
              <Icon icon={X} size="sm" />
            </Button>
          </>
        ) : (
          header
        )}
      </header>
      <div className="shell-panel-body">{bodyMounted ? children : null}</div>
    </aside>
  );
}
