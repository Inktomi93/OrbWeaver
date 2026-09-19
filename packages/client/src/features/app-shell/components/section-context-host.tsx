// SectionContextHost + SectionContextHeader — the ONE CONTEXT-panel consumer pair
// (client-architecture-lockdown.md §6b/M3). Domain-agnostic: both switch on `definition.context.kind` and never import a
// feature. `key={activeSection}` on BOTH mount sites is REQUIRED — different sections' `tabs` hosts call
// different hook sets, legal only across a remount (rules-of-hooks).
//
// The pair splits the two CONTEXT regions: `SectionContextHost` renders the BODY; `SectionContextHeader`
// renders the shell's `.shell-panel-header` BAND. Since the context bracket (#860) a `tabs` context owns
// its WHOLE column inside the body — its head band is the bracket's own slot, fed by the resolve's `header`
// (the section's identity, or a claiming region's band) — so `SectionContextHeader` renders NOTHING for a
// tabs pane in every mode and shell.css collapses the empty band (the HUD-1 `:empty` rule, now universal;
// the D66 A1 shared horizon holds for the LIST band and for a `single`/`none` context). One resolve, ONE
// consumer for a tabs pane.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#components";
import type { ResolvedContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { ContextTabsPanel } from "./context-tabs-panel.tsx";
import { SectionPlaceholder } from "./section-placeholder.tsx";

// THE UN-SWEPT FALLBACK (side-eye F-12). Its title is no longer the word "Details": the CONTEXT band
// directly above it already says that, so the pane printed "Details" twice over one voiceless sentence.
// A section states its OWN no-selection arm through `context.empty` (`ContextEmptyArm`) and this is what a
// section that has not stated one still gets — deliberately generic, so an un-swept pane reads as un-swept
// rather than as a considered answer.
const CONTEXT_PLACEHOLDER = <SectionPlaceholder title="Nothing selected" description="Pick something from the list and its details appear here." />;

/** The section's OWN no-selection arm when it declares one, else the generic fallback above (F-12). */
function contextEmpty(context: SectionDefinition["context"]): ReactNode {
  return context.empty === undefined ? CONTEXT_PLACEHOLDER : <SectionPlaceholder description={context.empty.description} title={context.empty.title} />;
}
// The neutral BAND label when a `single` context supplies no header identity. Matches the pre-N4 static
// "Details" the band showed.
const CONTEXT_HEADER_DEFAULT = (
  <Text size="label" weight="medium" tone="muted">
    Details
  </Text>
);

export interface SectionContextHostProps {
  readonly definition: SectionDefinition;
  /** The floating pane's own way out (overlay mode only) — the bracket seats it in its head band. */
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

export function SectionContextHost({ definition, dismissLabel, onDismiss }: SectionContextHostProps): ReactNode {
  const { context } = definition;
  if (context.kind === "none") {
    return contextEmpty(context);
  }
  if (context.kind === "single") {
    // A `single` body owns its OWN no-selection arm (it is the only thing that can read its selection —
    // the shell holds an unrendered element here, not a result). `context.empty` is still the section's
    // declaration of what that arm should say; see world-info's body for the consuming half.
    return context.body();
  }
  return (
    <QueryBoundary fallback={<Text voice="quiet">Loading details…</Text>}>
      <ResolvedTabsHost
        empty={contextEmpty(context)}
        useResolved={context.useResolved}
        // The FOOT rail's fallback name is the section's own rail label — the honest group name for a pane
        // that is about the section itself (Corpus, Analytics); a section about ONE artifact overrides it
        // at the mint (`railLabel: "Chat"`).
        railFallback={definition.rail.label}
        {...(dismissLabel === undefined ? {} : { dismissLabel })}
        {...(onDismiss === undefined ? {} : { onDismiss })}
      />
    </QueryBoundary>
  );
}

/** The shell's CONTEXT-panel BAND (the `.shell-panel-header` slot). A `single` context may supply an
 *  identity directly; a header-less `single` and a `none` context fall back to the neutral "Details" label.
 *  A `tabs` context renders NOTHING here — its head band is the bracket's own (see the file header). */
export function SectionContextHeader({ definition }: Pick<SectionContextHostProps, "definition">): ReactNode {
  const { context } = definition;
  if (context.kind === "single") {
    return context.header === undefined ? CONTEXT_HEADER_DEFAULT : context.header();
  }
  if (context.kind === "none") {
    return CONTEXT_HEADER_DEFAULT;
  }
  return null;
}

interface ResolvedTabsHostProps {
  readonly useResolved: () => ResolvedContextTabs | null;
  readonly empty: ReactNode;
  readonly railFallback: string;
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

function ResolvedTabsHost({ useResolved, empty, railFallback, dismissLabel, onDismiss }: ResolvedTabsHostProps): ReactElement {
  const resolved = useResolved();
  if (resolved === null || resolved.tabs.length === 0) {
    return <>{empty}</>;
  }
  return (
    <ContextTabsPanel
      tabs={resolved.tabs}
      actions={resolved.actions}
      header={resolved.header}
      railLabel={resolved.railLabel ?? railFallback}
      {...(dismissLabel === undefined ? {} : { dismissLabel })}
      {...(onDismiss === undefined ? {} : { onDismiss })}
    />
  );
}
