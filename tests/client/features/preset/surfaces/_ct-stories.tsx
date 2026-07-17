// CT story module for the preset CONTENT editor surface (Spine-Testing §7 — a CT mounts ONLY from a
// non-test module). Drives the PRODUCTION path — `preset.get`/`settings.getUserSettings` (routeTrpc) → the
// D78 session BOUNDARY (`PresetForm` = createAutosaveEntityForm) → the tabbed editor — so the two P0
// regressions the stickler review 2026-07-16-merge-block-28523122 found (preset-SWITCH renders the previous
// preset's config; RESET-to-starter is a durable no-op) are pinned against the REAL surface, not a double.
//
// The SWITCH story flips the surface's `presetId` prop on a button (the real rail behavior — the section
// re-renders the editor with a new preset id) so the CT proves switching A→B rekeys the boundary's Session
// and seeds from B's row (never A's surviving frozen seed).

import { PresetEditorSurface } from "@orb/client/features/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../../support/ct/ct-data-providers";

// The two fixed ids (kept module-local — biome forbids non-component exports beside components; the CT
// mirrors these literals for its save-spy filters).
const PRESET_A = castId<PresetId>("preset_ct_aaaaaaaaaa");
const PRESET_B = castId<PresetId>("preset_ct_bbbbbbbbbb");

/** The single-preset editor (used by the RESET pin — one row, the menu drives reset-to-starter). */
export function PresetEditorSurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 720, width: 720 }}>
        <PresetEditorSurface presetId={PRESET_A} />
      </div>
    </CtDataProviders>
  );
}

/** The A↔B switch harness (the SWITCH pin) — a button flips `presetId`, exactly the prop change the rail
 *  makes when the user picks another preset while the editor stays mounted. */
export function PresetEditorSwitchStory(): ReactElement {
  const [presetId, setPresetId] = useState<PresetId>(PRESET_A);
  return (
    <CtDataProviders>
      <div style={{ height: 720, width: 720 }}>
        <button type="button" onClick={(): void => setPresetId(PRESET_B)}>
          switch to B
        </button>
        <PresetEditorSurface presetId={presetId} />
      </div>
    </CtDataProviders>
  );
}
