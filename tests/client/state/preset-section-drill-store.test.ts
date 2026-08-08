// The Prompt view's section DRILL axis (preset-section-drill-store): a SCOPED `(presetId, sectionId)`
// position, not a bare id. The reactive read is a hook, so it needs a React render — the
// `create-drill-selection-store.test.ts` posture applies: this node lane pins the store's CALLABLE contract
// and the one branch that is observable without rendering (retarget's no-op guard), while the RENDERED
// behaviour the scope exists for is pinned end-to-end at the surface tier, by name:
//
//   tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx
//     · "a drill in preset A does not leak into preset B — the section ids are the SAME literals"  (the SCOPE)
//     · "the Delivers-via chip lands on the RACK even when a DIFFERENT section is already drilled"  (the view
//       chokepoint, `setPresetEditorView`)
//     · "leaving the Prompt view while drilled and returning lands on the RACK, not back inside the editor"
//   tests/client/features/preset/components/prompt-assembly/section-drill-in.ct.tsx
//     · "§5.2 — the section drill-in survives the fork's keyed remount, re-anchored to the same section"
//       (the RETARGET — the one entityId swap the drill must survive)
//
// Each of those was proven to BITE against the pre-fix behaviour, so the pins are defect proofs, not fences.

import { closePresetSectionDrill, drillPresetSection, retargetPresetSectionDrill } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const PRESET_A = castId<PresetId>("preset_drillstoreaaa");
const PRESET_B = castId<PresetId>("preset_drillstorebbb");

describe("preset-section-drill-store", () => {
  test("exposes the drill surface as callable actions", () => {
    for (const fn of [drillPresetSection, closePresetSectionDrill, retargetPresetSectionDrill]) {
      expect(typeof fn).toBe("function");
    }
    expect(() => {
      drillPresetSection(PRESET_A, "main");
      retargetPresetSectionDrill(PRESET_B);
      closePresetSectionDrill();
    }).not.toThrow();
  });

  test("retarget is a NO-OP when nothing is drilled, so the fork path may call it unconditionally", () => {
    // `use-preset-autosave`'s retarget fires on EVERY copy-on-write fork, including the overwhelming majority
    // where the author is nowhere near the Prompt rack. Re-stamping a `null` drill would mint a drill nobody
    // asked for — the editor would open directly inside a section editor on the copy.
    closePresetSectionDrill();
    expect(() => retargetPresetSectionDrill(PRESET_B)).not.toThrow();
  });
});
