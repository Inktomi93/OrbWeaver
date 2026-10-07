// Keep the public feature entry from eagerly loading the editor through its re-export.
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import type { PresetEditorSurfaceProps } from "../surfaces/preset-editor-surface.tsx";

const PresetEditor = lazy(async () => {
  const mod = await import("../surfaces/preset-editor-surface.tsx");
  return { default: mod.PresetEditorSurface };
});

/** Load the editor on selection, including consumers of the public feature entry. */
export function PresetEditorSurface(props: PresetEditorSurfaceProps): ReactElement {
  return (
    <Suspense fallback={<Text voice="gloss">Loading the preset…</Text>}>
      <PresetEditor {...props} />
    </Suspense>
  );
}
