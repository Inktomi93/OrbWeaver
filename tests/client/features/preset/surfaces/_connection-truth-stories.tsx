import { PresetEditorSurface } from "@orb/client/features/preset";
import { setPresetEditorView, setPresetReadoutTarget } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { CapabilityPanel } from "../../../../../packages/client/src/features/preset/components/readout/capability-panel.tsx";
import { CtDataProviders } from "../../../../support/browser/ct-data-providers.tsx";

export function PresetConnectionTruthStory({ presetId }: { readonly presetId: PresetId }): ReactElement {
  useEffect(() => {
    setPresetEditorView("params");
    setPresetReadoutTarget({ kind: "role", task: "chat" });
    return (): void => setPresetReadoutTarget({ kind: "role", task: "chat" });
  }, []);
  return (
    <CtDataProviders>
      <div style={{ display: "flex", height: 720 }}>
        <div style={{ width: 720 }}>
          <PresetEditorSurface presetId={presetId} />
        </div>
        <div style={{ width: 360 }}>
          <CapabilityPanel presetId={presetId} />
        </div>
      </div>
    </CtDataProviders>
  );
}
