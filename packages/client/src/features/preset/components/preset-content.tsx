// The Presets CONTENT body — a selected row opens the tabbed editor; nothing selected shows the teaching
// welcome. Reads its OWN selection from #state so the section definition composing it stays a pure data
// object.
//
// `onRevealSection` is the OVERLAY half of the select echo (§16 row 19): selecting a rack row makes the
// CONTEXT readout the thing that answers, and on a narrow/mobile regime that panel is a closed sheet. It
// names no tab — the Presets CONTEXT is a single per-view readout (§7), not a tab strip.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { revealContextPanel, useSelectedPresetId } from "#state";
import type { PresetEditorSurfaceProps } from "../surfaces/preset-editor-surface.tsx";
import { PresetLibraryWelcome } from "./preset-library-welcome.tsx";

// The public entry shares this lazy boundary so re-exporting the editor cannot make its tree eager.
const LazyPresetEditorSurface = lazy(async () => {
  const mod = await import("../surfaces/preset-editor-surface.tsx");
  return { default: mod.PresetEditorSurface };
});

export function PresetEditorSurface(props: PresetEditorSurfaceProps): ReactElement {
  return (
    <Suspense fallback={<Text voice="gloss">Loading the preset…</Text>}>
      <LazyPresetEditorSurface {...props} />
    </Suspense>
  );
}

export function PresetContent(): ReactElement {
  const selectedPresetId = useSelectedPresetId();
  if (selectedPresetId === null) {
    return <PresetLibraryWelcome />;
  }
  return <PresetEditorSurface onRevealSection={(): void => revealContextPanel()} presetId={selectedPresetId} />;
}
