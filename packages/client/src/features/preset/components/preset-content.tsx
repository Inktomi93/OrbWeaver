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
import { PresetLibraryWelcome } from "./preset-library-welcome.tsx";

// LAZY — the editor tree (tabbed structure → prompt-assembly rack → params deck) is the heaviest thing
// `features/preset` owns and it only renders once a preset row is selected. Static, it rode the door's
// section import into the authed-app chunk for every visitor, including someone who only ever opens a
// chat (issue #574). The boundary is HERE rather than on the section definition's `content` thunk because
// the no-selection arm (`PresetLibraryWelcome`) must stay instant: the shell calls `content()` for every
// registered section, so a boundary one level up would defer the welcome copy too.
//
// The fallback repeats the surface's own `QueryBoundary` copy on purpose — the module fetch and the
// preset fetch are the same wait to the person looking at the pane, so they must not look different.
const PresetEditorSurface = lazy(async () => {
  const mod = await import("../surfaces/preset-editor-surface.tsx");
  return { default: mod.PresetEditorSurface };
});

export function PresetContent(): ReactElement {
  const selectedPresetId = useSelectedPresetId();
  if (selectedPresetId === null) {
    return <PresetLibraryWelcome />;
  }
  return (
    <Suspense fallback={<Text voice="gloss">Loading the preset…</Text>}>
      <PresetEditorSurface onRevealSection={(): void => revealContextPanel()} presetId={selectedPresetId} />
    </Suspense>
  );
}
