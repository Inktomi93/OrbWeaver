// ContextTabsPanel — the ONE host for a resolved `tabs` ContextDefinition (client-architecture-lockdown.md
// §6b): it resolves the ONE selection and renders the CONTEXT BRACKET (`context-bracket.tsx`) over the handed
// tabs, band and actions. Domain-agnostic: every tab's `node` is pre-rendered by the host's `useResolved`
// hook; a new domain grafts a context tab inside its OWN section definition, never here.
//
// ONE COLUMN, EVERY PANE (D150): the bracket is the panel's chrome in every room — one tab strip in the header
// row, then an optional identity band, then the viewport. The owner moved the strip from the foot to the header.
//
// Tab selection rides the shared #state contextTab seam; resolved against the visible ids so a
// foreign/absent value falls back to a tab instead of selecting nothing — a `defaultTab`-flagged tab
// (rpg.status for a game chat, §4.1) if one is present, else the first visible tab.

import type { ReactElement, ReactNode } from "react";
import type { ResolvedContextTab } from "#lib";
import { useContextTabSelection } from "../hooks/use-context-tab-selection.ts";
import { ContextBracket } from "./context-bracket.tsx";

export interface ContextTabsPanelProps {
  readonly tabs: readonly ResolvedContextTab[];
  /** The host's view-level actions, rendered in the header row before the close ×. */
  readonly actions?: ReactNode;
  /** The optional identity band under the header row (`ResolvedContextTabs.header`). */
  readonly header?: ReactNode;
  readonly empty?: ReactNode;
  /** The tab strip's accessible name — the artifact noun ("Chat"), or the section's own label. */
  readonly railLabel: string;
  /** The floating pane's own way out (overlay mode only). */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

export function ContextTabsPanel({ tabs, actions, header, empty, railLabel, dismissLabel, onDismiss }: ContextTabsPanelProps): ReactElement | null {
  // The ONE selection resolver (HUD-1 §3.4) — stored → `defaultTab` → declared-first.
  const { activeTab, selectTab } = useContextTabSelection(tabs);
  return (
    <ContextBracket
      view={{ tabs, activeTab, selectTab, ...(actions === undefined ? {} : { actions }) }}
      band={header}
      empty={empty}
      railLabel={railLabel}
      {...(dismissLabel === undefined ? {} : { dismissLabel })}
      {...(onDismiss === undefined ? {} : { onDismiss })}
    />
  );
}
