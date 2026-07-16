// SectionContextHost + SectionContextHeader — the ONE CONTEXT-panel consumer pair (client-architecture-
// lockdown.md §6b/M3). Domain-agnostic: both switch on `definition.context.kind` and never import a
// feature. `key={activeSection}` on BOTH mount sites is REQUIRED — different sections' `tabs` hosts call
// different hook sets, legal only across a remount (rules-of-hooks).
//
// The pair splits the two CONTEXT regions from ONE resolve: `SectionContextHost` renders the BODY (the
// resolved `tabs` + `actions`); `SectionContextHeader` renders the `.shell-panel-header` BAND identity
// (the resolved `header` slot — north-star §4 N4 / P4). They mount in different shell regions (band vs
// body), so each calls `useResolved` for its own slice.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#data";
import type { ResolvedContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { ContextTabsPanel } from "./context-tabs-panel";
import { SectionPlaceholder } from "./section-placeholder";

const CONTEXT_PLACEHOLDER = <SectionPlaceholder title="Details" description="Select something to see its details here." />;
// The neutral BAND label when no section supplies a header identity (a `none`/`single` context, or a
// `tabs` context with no active selection). Matches the pre-N4 static "Details" the band showed.
const CONTEXT_HEADER_DEFAULT = (
  <Text size="label" weight="medium" tone="muted">
    Details
  </Text>
);

export interface SectionContextHostProps {
  readonly definition: SectionDefinition;
}

export function SectionContextHost({ definition }: SectionContextHostProps): ReactNode {
  const { context } = definition;
  if (context.kind === "none") {
    return CONTEXT_PLACEHOLDER;
  }
  if (context.kind === "single") {
    return context.body();
  }
  return (
    <QueryBoundary fallback={<Text tone="muted">Loading details…</Text>}>
      <ResolvedTabsHost useResolved={context.useResolved} />
    </QueryBoundary>
  );
}

/** The CONTEXT-panel BAND identity (north-star §4 N4 / P4) — rendered as the context `PanelChrome`'s
 *  header. Only a `tabs` context supplies a definition-owned `header`; `none`/`single` and an unselected
 *  `tabs` context fall back to the neutral "Details" label. */
export function SectionContextHeader({ definition }: SectionContextHostProps): ReactNode {
  const { context } = definition;
  if (context.kind !== "tabs") {
    return CONTEXT_HEADER_DEFAULT;
  }
  return (
    <QueryBoundary fallback={CONTEXT_HEADER_DEFAULT}>
      <ResolvedHeaderHost useResolved={context.useResolved} />
    </QueryBoundary>
  );
}

interface ResolvedTabsHostProps {
  readonly useResolved: () => ResolvedContextTabs | null;
}

function ResolvedTabsHost({ useResolved }: ResolvedTabsHostProps): ReactElement {
  const resolved = useResolved();
  if (resolved === null || resolved.tabs.length === 0) {
    return CONTEXT_PLACEHOLDER;
  }
  return <ContextTabsPanel tabs={resolved.tabs} actions={resolved.actions} />;
}

function ResolvedHeaderHost({ useResolved }: ResolvedTabsHostProps): ReactNode {
  const resolved = useResolved();
  if (resolved === null || resolved.header === undefined || resolved.header === null) {
    return CONTEXT_HEADER_DEFAULT;
  }
  return resolved.header;
}
