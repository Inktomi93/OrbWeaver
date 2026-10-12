import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { SkeletonRows } from "#data";
import type { PresetEditorSurfaceProps } from "../surfaces/preset-editor-surface.tsx";

const PresetEditor = lazy(async () => {
  const mod = await import("../surfaces/preset-editor-surface.tsx");
  return { default: mod.PresetEditorSurface };
});

/** Load the editor on selection, including consumers of the public feature entry. */
export function PresetEditorSurface(props: PresetEditorSurfaceProps): ReactElement {
  return (
    <Suspense fallback={<SkeletonRows count={3} shape="line" />}>
      <PresetEditor {...props} />
    </Suspense>
  );
}
