// CT story module for the preset CONTENT editor surface (Spine-Testing §7 — a CT mounts ONLY from a
// non-test module). Drives the PRODUCTION path — `preset.get`/`settings.getUserSettings` (routeTrpc) → the
// D78 session BOUNDARY (`PresetForm` = createAutosaveEntityForm) → the tabbed editor — so the two P0
// regressions the stickler review 2026-07-16-merge-block-28523122 found (preset-SWITCH renders the previous
// preset's config; RESET-to-starter is a durable no-op) are pinned against the REAL surface, not a double.
//
// The SWITCH story flips the surface's `presetId` prop on a button (the real rail behavior — the section
// re-renders the editor with a new preset id) so the CT proves switching A→B rekeys the boundary's Session
// and seeds from B's row (never A's surviving frozen seed).

import { useInvalidation } from "@orb/client/data";
import { PresetEditorSurface, PresetLibrarySurface } from "@orb/client/features/preset";
import { __resetPresetSelection, selectPreset, useSectionRegistry, useSelectedPresetId } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CtDataProviders, CtRealSectionRegistry } from "../../../../support/ct/ct-data-providers.tsx";

// The three fixed ids (kept module-local — biome forbids non-component exports beside components; the CT
// mirrors these literals for its save-spy filters). BUILT_IN is the real seeded system-default id.
const PRESET_A = castId<PresetId>("preset_ct_aaaaaaaaaa");
const PRESET_B = castId<PresetId>("preset_ct_bbbbbbbbbb");
const BUILT_IN = castId<PresetId>("preset_00000000000000000000000000");

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

/** Stands in for the user-bus SSE frame the server fans when Connections writes `routing.roleDefaults`
 *  (`settings.updateUserSettingsSection` is busDriven — `settingsChanged` is the ONLY freshness driver for
 *  the editor's capability read). Drives the REAL `useInvalidation()` seam, so the map row is what's under
 *  test, not a hand-rolled refetch. */
function ConnectChatModelButton(): ReactElement {
  const { invalidateUser } = useInvalidation();
  return (
    <button type="button" onClick={(): void => invalidateUser({ type: "settingsChanged" })}>
      connect a chat model
    </button>
  );
}

/** The capability-freshness harness: the real editor plus the settingsChanged trigger, so the CT can prove
 *  picking a chat model swaps the connect-a-model note for the live Output knobs WITHOUT a page reload. */
export function PresetEditorCapabilityFreshnessStory(): ReactElement {
  return (
    <CtDataProviders>
      <ConnectChatModelButton />
      <div style={{ height: 720, width: 720 }}>
        <PresetEditorSurface presetId={PRESET_A} />
      </div>
    </CtDataProviders>
  );
}

/** The LIBRARY harness — the real list surface (rows + the ⋯ actions menu + its delete confirm), the owner's
 *  remediation path for the "(edited)" duplicates the fork-once bug minted. */
export function PresetLibrarySurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 720, width: 420 }}>
          <PresetListBand />
          <PresetLibrarySurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The section's own `listHeader` closure, rendered where the shell's PanelChrome renders it — the title,
 *  the count and the create verbs live THERE now (list-pane-projection L4). */
function PresetListBand(): ReactElement {
  const registry = useSectionRegistry();
  return <div data-testid="list-band">{registry.get("presets").listHeader?.()}</div>;
}

/** The FORK-ONCE harness: the editor mounted exactly the way production mounts it — off the SELECTION STORE
 *  (the `PresetContent` shape) — starting on the LOCKED built-in default. Editing the built-in copy-on-writes
 *  server-side, and the editor's retarget IS a `selectPreset(fork)` write, so driving the surface through the
 *  store is what makes the retarget observable end to end. The `<output>` mirrors the live selection. */
export function PresetForkOnceStory(): ReactElement {
  const selectedId = useSelectedPresetId();
  useEffect(() => {
    selectPreset(BUILT_IN);
    return (): void => __resetPresetSelection();
  }, []);
  return (
    <CtDataProviders>
      <output>{`selected=${selectedId ?? "none"}`}</output>
      <div style={{ height: 720, width: 720 }}>{selectedId === null ? null : <PresetEditorSurface presetId={selectedId} />}</div>
    </CtDataProviders>
  );
}

/** The FORK-CHOICE harness: the fork-once story PLUS the live library list, because the choice is only
 *  legible against the rows it is choosing between — "keep editing <fork>" must land on the fork already in
 *  the list, and "start a new fork" must produce a SECOND row that reads "forked from Default" there. Same
 *  selection-store mount as production (the retarget IS a `selectPreset` write). */
export function PresetForkChoiceStory(): ReactElement {
  const selectedId = useSelectedPresetId();
  useEffect(() => {
    selectPreset(BUILT_IN);
    return (): void => __resetPresetSelection();
  }, []);
  return (
    <CtDataProviders>
      <output>{`selected=${selectedId ?? "none"}`}</output>
      <div style={{ display: "flex", height: 720, width: 1040 }}>
        <div style={{ width: 320 }}>
          <PresetLibrarySurface />
        </div>
        <div style={{ width: 720 }}>{selectedId === null ? null : <PresetEditorSurface presetId={selectedId} />}</div>
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
