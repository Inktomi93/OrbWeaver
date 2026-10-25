import { requireQueryBoundary } from "@orb/client/data";
import { AppShell } from "@orb/client/features/app-shell";
import type { ConfigGroupId, ModalSlotId, SectionId } from "@orb/client/state";
import { openConfigTo, openModal, selectPreset, setActiveSection, useSectionRegistry } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

// Every mount through these stories checks that each suspending read sits under a QueryBoundary.
requireQueryBoundary();

/** The production shell with one registered section active: its rail, header, list, content and context panes. */
export function SectionShellStory({ section }: { readonly section: SectionId }): ReactElement {
  useState(() => {
    setActiveSection(section);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

/** The production shell on the presets section with one preset open, so the editor and readout mount its loaded detail. */
export function PresetDetailShellStory({ presetId }: { readonly presetId: PresetId }): ReactElement {
  useState(() => {
    setActiveSection("presets");
    selectPreset(presetId);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

/** The production shell with one registered modal open over the home section. */
export function ModalShellStory({ modal }: { readonly modal: ModalSlotId }): ReactElement {
  useState(() => {
    setActiveSection("home");
    openModal(modal);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

function ConfigGroupContent({ group }: { readonly group: ConfigGroupId }): ReactElement {
  const definition = useSectionRegistry().get("config");
  useState(() => {
    openConfigTo(group);
    return true;
  });
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

/** The production settings content for one registered group, isolated from route and shell mounting. */
export function ConfigGroupStory({ group }: { readonly group: ConfigGroupId }): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ height: 900, width: 900, minHeight: 0, display: "flex" }}>
        <Container style={{ flex: 1, minWidth: 0 }}>
          <ConfigGroupContent group={group} />
        </Container>
      </div>
    </CtClientProviders>
  );
}
