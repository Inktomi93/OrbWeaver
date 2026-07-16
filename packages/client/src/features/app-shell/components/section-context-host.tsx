// SectionContextHost — the ONE CONTEXT-panel consumer (client-architecture-lockdown.md §6b/M3). Domain-
// agnostic: it switches on `definition.context.kind` and never imports a feature. `key={activeSection}` on
// the mount site is REQUIRED — different sections' `tabs` hosts call different hook sets, legal only
// across a remount (rules-of-hooks).

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#data";
import type { ResolvedContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { ContextTabsPanel } from "./context-tabs-panel";
import { SectionPlaceholder } from "./section-placeholder";

const CONTEXT_PLACEHOLDER = <SectionPlaceholder title="Details" description="Select something to see its details here." />;

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
