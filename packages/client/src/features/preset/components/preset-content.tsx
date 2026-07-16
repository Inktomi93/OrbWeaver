// The Presets CONTENT body — a selected row opens the tabbed editor (a rack row's name-button click
// reveals the CONTEXT Section tab via the shell intent, viewport-resolved in #state); nothing selected
// shows the teaching welcome. Reads its OWN selection from #state so the section definition composing it
// stays a pure data object.

import type { ReactElement } from "react";
import { dismissPresetSection, revealContextPanel, useSelectedPresetId } from "#state";
import { PresetEditorSurface } from "../surfaces/preset-editor-surface";
import { PresetLibraryWelcome } from "./preset-library-welcome";

export function PresetContent(): ReactElement {
  const selectedPresetId = useSelectedPresetId();
  if (selectedPresetId === null) {
    return <PresetLibraryWelcome />;
  }
  return (
    <PresetEditorSurface presetId={selectedPresetId} onRevealSection={(): void => revealContextPanel("section")} onDismissSection={dismissPresetSection} />
  );
}
