// ContextTabsPanel — the ONE host for a resolved `tabs` ContextDefinition (client-architecture-lockdown.md
// §6b): it resolves the ONE selection and renders the CONTEXT BRACKET (`context-bracket.tsx`) over the handed
// tabs, band and actions. Domain-agnostic: every tab's `node` is pre-rendered by the host's `useResolved`
// hook; a new domain grafts a context tab inside its OWN section definition, never here.
//
// ONE COLUMN, EVERY PANE (owner-ruled 2026-08-30, #860, D150).
// SUPERSEDES the "ONE STRIP, ALWAYS" this header carried since HUD-1 §5.1: the generic pane used to render a
// single top strip labelled "Detail" (a `tablist` of `tab`s, `flex-1` panels, the shell.css `.ctx-tab-strip`),
// while a CLAIMED pane rendered the rpg HUD's head-and-foot bracket — the SAME resolved chat tabs at y=56 as
// a head tablist in a normal room and at y=754 as a foot toolbar in a game room (#845 measured it). The
// ruling: the bracket IS the panel's chrome, in every room. "One META strip, always" survives — at the FOOT.
// The head strip, its `tab`/`aria-selected` model, its `aria-disabled` treatment of a locked tab and
// `.ctx-tab-strip` are gone; `ContextRegionHost` is gone with them (a claim is a HEAD-BAND claim now, folded
// into `header` by `resolveContextTabs`, so there is one host and nothing left to fork).
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
  /** The host's rail-trail actions, rendered beside the FOOT rail's cells. */
  readonly actions?: ReactNode;
  /** The HEAD band's content (`ResolvedContextTabs.header`). Absent ⇒ the column starts at its first rail. */
  readonly header?: ReactNode;
  /** The FOOT rail's name — the artifact noun ("Chat"), or the section's own label. */
  readonly railLabel: string;
  /** The floating pane's own way out (overlay mode only). */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

export function ContextTabsPanel({ tabs, actions, header, railLabel, dismissLabel, onDismiss }: ContextTabsPanelProps): ReactElement | null {
  // The ONE selection resolver (HUD-1 §3.4) — stored → `defaultTab` → declared-first.
  const { activeTab, selectTab } = useContextTabSelection(tabs);
  if (tabs.length === 0) {
    return null;
  }
  return (
    <ContextBracket
      view={{ tabs, activeTab, selectTab, ...(actions === undefined ? {} : { actions }) }}
      band={header}
      railLabel={railLabel}
      {...(dismissLabel === undefined ? {} : { dismissLabel })}
      {...(onDismiss === undefined ? {} : { onDismiss })}
    />
  );
}
