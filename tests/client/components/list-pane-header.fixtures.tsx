// CT fixtures for `<ListPaneHeader>` INSIDE the shell chrome it feeds (side-eye 2026-08-06 P2). The band's
// mobile behaviour is a shell.css decision keyed on `.shell-grid[data-list-mode="docked"]` +
// `.shell-panel[data-panel-side="list"]`, so a bare mount of the composite cannot see it — the selector
// chain simply never matches and the CT would pass against a broken pane. This is the smallest skeleton
// that reproduces the production chain: shell grid → list panel → the always-present band → the slot.

import { ListPaneHeader } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

/** The band a section that declares NO `listHeader` gets: present, on the shared horizon, and childless.
 *  Refinery is the live one. It is a DIFFERENT shape from "the slot rendered something that then shed" —
 *  `:has()` has nothing to anchor on and `:empty` is the only thing that can see it. */
export function EmptyListBandInShell(): ReactElement {
  return (
    <div className="shell-grid" data-list-mode="docked" data-section="refinery">
      <aside className="shell-panel" data-panel-mode="docked" data-panel-side="list">
        <header className="shell-panel-header" />
        <div className="shell-panel-body">rows</div>
      </aside>
    </div>
  );
}

interface BandInShellProps {
  /** The scoped-mode entity half — a SCOPED title survives the mobile shed, an unscoped one does not. */
  readonly accent?: string;
  readonly count?: number;
  /** Render the pane's ONE primary action — the band's only direct child that is not the identity slot. */
  readonly withAction?: boolean;
}

export function ListBandInShell({ accent, count, withAction = false }: BandInShellProps): ReactElement {
  return (
    <div className="shell-grid" data-list-mode="docked" data-section="config">
      <aside className="shell-panel" data-panel-mode="docked" data-panel-side="list">
        <header className="shell-panel-header">
          <ListPaneHeader
            {...(accent === undefined ? {} : { accent })}
            {...(count === undefined ? {} : { count })}
            title="Configuration"
            {...(withAction
              ? {
                  action: (
                    <Button intent="ghost" size="sm" type="button">
                      New tag
                    </Button>
                  ),
                }
              : {})}
          />
        </header>
        <div className="shell-panel-body">rows</div>
      </aside>
    </div>
  );
}
