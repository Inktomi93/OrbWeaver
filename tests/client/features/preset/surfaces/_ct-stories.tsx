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
import { PresetEditorSurface, PresetLibrarySurface, PresetLibraryWelcome } from "@orb/client/features/preset";
import { __resetPresetSelection, selectPreset, setFocusMode, setPresetSearchQuery, useSectionRegistry, useSelectedPresetId } from "@orb/client/state";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CtDataProviders, CtRealSectionRegistry } from "../../../../support/ct/ct-data-providers.tsx";
import { CtToastSurface } from "../../../lib/_ct-stories.tsx";

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

/** The editor at the NARROWEST real content pane (390px — a 1280 viewport with both panels docked, which is
 *  where side-eye 2026-08-19 P1-1 measured ten 0px rails and a 503px tab strip in a 390px box). A FIXED
 *  width, never a content-sized mount: a mount that sizes to its content agrees with the bug. */
export function PresetEditorNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 720, width: 390 }}>
        <PresetEditorSurface presetId={PRESET_A} />
      </div>
    </CtDataProviders>
  );
}

/** The editor at a pane PAST the content column's `@5xl` breathe step — the regime where an uncapped header
 *  band spans the whole pane over a capped, centered body (the 1822-over-744 measurement). */
export function PresetEditorWidePaneStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 720, width: 1520 }}>
        <PresetEditorSurface presetId={PRESET_A} />
      </div>
    </CtDataProviders>
  );
}

/** The editor in a pane the CT RESIZES, for #1140's edge-fade width matrix. A point measurement never
 *  proves a range property, and the `.scroll-fade-x` band is a FRACTION of the strip's own box — so the
 *  pane has to be swept, not fixed. The wrapper carries the hook the test writes `inline-size` on (the
 *  `[data-home-fold-pane]` idiom #1128 used on the block axis). It starts at the narrowest DESKTOP content
 *  pane; the sweep reaches below it (phone widths) and past the strip's own overflow. */
export function PresetEditorStripFadeStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-preset-fade-pane="" style={{ height: 720, width: 390 }}>
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

/** The library in a pane SHORTER than its rows — the #1748 fold. The scroll box and the search chrome moved
 *  ABOVE the boundary (`LibraryListFrame`), so both halves of that move need a guaranteed fold to be provable:
 *  the rows still reach past it, and the search input is on screen while the read is still in flight. No list
 *  band here — the pane is the whole story. */
export function PresetLibrarySurfaceShortStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 200, width: 420 }}>
          <PresetLibrarySurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The library WITH the production toast outlet mounted (#481). Activation's confirmation is a `notify`
 *  notice — the toast viewport is `aria-live="polite"`, so one mechanism serves both the eye and AT — and
 *  `notify` is a MODULE-GLOBAL bind: without `CtToastSurface` (the one owner of that bind + `AppToaster`) the
 *  call degrades to a console line and the pixels a spec is asserting on never exist. Only the stories that
 *  expect a toast mount the outlet — the harness deliberately does not (#247). */
export function PresetLibraryAnnouncedStory(): ReactElement {
  return (
    <CtToastSurface>
      <CtDataProviders>
        <CtRealSectionRegistry>
          <div style={{ height: 720, width: 420 }}>
            <PresetListBand />
            <PresetLibrarySurface />
          </div>
        </CtRealSectionRegistry>
      </CtDataProviders>
    </CtToastSurface>
  );
}

/** The library at the DOCKED LIST pane's real floor (272px, the width the shell gives it when both panels
 *  are out). The row's width budget is only legible here: at the story's comfortable 420px every name fits
 *  whatever the trailing cluster reserves, which is exactly why the 2026-08-19 clipping was invisible to the
 *  suite. Same surface, same band — only the track width differs. */
export function PresetLibraryDockedStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 720, width: 272 }}>
          <PresetListBand />
          <PresetLibrarySurface />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The Presets teaching state at the two real containment arms implicated by #379.
 *
 *  UNDER THE REAL SECTION REGISTRY since #434: the welcome reads the shell's own LIST MODE for this section
 *  (`useSectionListMode`), which resolves the section DEFINITION's `panelDefaults` — so a story that mounts it
 *  bare would be asking the registry a question with no registry to ask. Nothing is collapsed here, so both
 *  arms render the section's boot layout (LIST docked), which is what the #379 hierarchy pins measure. */
/*  UNDER `CtDataProviders` since #483: the welcome also reads the LIST's own filtered census now (it must
 *  stop saying "Pick a preset" over a list filtered to nothing — side-eye 2026-08-22 P3-2), through the same
 *  non-suspending `preset.list` query the band's census uses, so it needs a TRPC provider to ask. These two
 *  arms route nothing: with no search needle there is no filtered-to-nothing state whatever the read does,
 *  which is exactly the ordering the component guards on. */
export function PresetLibraryWelcomeWideStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 720, width: 720 }}>
          <PresetLibraryWelcome />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

export function PresetLibraryWelcomeNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: 720, width: 320 }}>
          <PresetLibraryWelcome />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The teaching state driven by the LIST SEARCH (#483 / P3-2) — the CONTENT pane's half of the no-match
 *  state. The needle goes through its PRODUCTION store door (`setPresetSearchQuery`, the one writer the
 *  band and the rows both read), never a prop, so what the CT proves is the projection.
 *
 *  Both arms in ONE mount, like the #434 story above: the finding is that the SAME pane must say different
 *  things. The reset button matters as much as the filter — a needle that stays set would leak into every
 *  later test in the page (the search store is module-global). */
export function PresetLibraryWelcomeFilteredStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button type="button" onClick={(): void => setPresetSearchQuery("zzzz-no-such-preset")}>
          filter to nothing
        </button>
        <button type="button" onClick={(): void => setPresetSearchQuery("")}>
          clear the filter
        </button>
        <div style={{ height: 720, width: 720 }}>
          <PresetLibraryWelcome />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The teaching state WITH a live driver for the shell's LIST MODE (#434). Both arms in ONE mount, because a
 *  CT mounts once per test and the finding is about which arm the SAME pane shows.
 *
 *  THE DRIVER IS FOCUS MODE, and that is a deliberate choice over `setPanelMode`. Focus is the shell's ONE
 *  flag for "no side panel is showing" (item 20) — regime-free, section-independent and SYNCHRONOUS, whereas
 *  `setPanelMode` writes the ACTIVE section's override and `setActiveSection` defers its state write through
 *  `withViewTransition` (a story clicking both in one handler lands the override on the previous section —
 *  measured). What this pane reads is the RESOLVED mode, so any regime that resolves `collapsed` exercises
 *  it; that the override path resolves the same way is pinned one tier down, over the real store
 *  (`shell-store.ct` / `section-list-projection.ct`). No effect seeds anything: the first commit is the
 *  section's real boot layout. */
export function PresetLibraryWelcomeListModeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button type="button" onClick={(): void => setFocusMode(true)}>
          take the list off screen
        </button>
        <button type="button" onClick={(): void => setFocusMode(false)}>
          put the list back
        </button>
        <div style={{ height: 720, width: 720 }}>
          <PresetLibraryWelcome />
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

/** The fork-once harness WITH the production toast outlet (#856). The silent copy-on-write now ANNOUNCES
 *  over the `notify` seam, and `notify` is a MODULE-GLOBAL bind: without `CtToastSurface` (the one owner of
 *  that bind + `AppToaster`) the call degrades to a console line and the pixels the spec asserts on never
 *  exist. Only the stories that expect a toast mount the outlet — the bare harness above deliberately does
 *  not (#247), and the FORK-ONCE mechanism pins must keep measuring the surface without one. */
export function PresetForkOnceAnnouncedStory(): ReactElement {
  return (
    <CtToastSurface>
      <PresetForkOnceStory />
    </CtToastSurface>
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
      <button type="button" onClick={(): void => selectPreset(PRESET_A)}>
        select Preset A directly
      </button>
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
