// The app-shell layout store: which rail section is active, the per-section side-panel override map,
// and which rail-triggered modal (if any) is open. `openModal` is deliberately NOT persisted.
//
// Also homes the shell's layout vocabulary unions (SectionId/ModalSlotId/PanelName/PanelMode) — state
// owns them so app-shell (feature) imports from state, never the reverse.
//
// FOCUS MODE IS ONE FLAG, AND IT OWNS NO PANEL WRITES (item 20, 2026-08-02 — the measured desync).
// Focus used to be DERIVED ("both panels resolve collapsed") while ALSO being implemented by WRITING
// `collapsed` into `panelOverrides` — so three truths could disagree: the button label, the overrides,
// and the resolved modes. The narrow-viewport auto-collapse produces the same "both collapsed" reading
// with no user intent, which cold-booted the toggle into its "Exit focus mode" arm at ≤64rem and made it
// a no-op (clicking "exit" re-entered the focus look, then did nothing at all); and exiting focus docked
// BOTH panels, re-opening a pane the user had collapsed long before entering.
//
// The shape now: `focusMode` is a boolean REGIME INPUT to `resolvePanelMode` (precedence above mobile /
// narrow / wide) — while it is on, every panel resolves `collapsed` and no override is touched. There is
// therefore no "saved pre-focus state" to corrupt: the untouched `panelOverrides` map IS the saved state,
// and exiting restores it by definition. The button label derives from this flag alone.
//
// MANUAL PANEL TOGGLE WHILE FOCUSED — the arm chosen: a write that would REVEAL a panel EXITS focus first
// (`setPanelMode(panel, docked|overlay)` / `setOpenOverlayPanel(<name>)`); a write that HIDES one leaves
// focus alone (it agrees with what focus is already showing, and `setOpenOverlayPanel(null)` is fired by
// unrelated flows — chat selection, drill close — that must never blow focus open). Rationale: the shell's
// existing idiom is that every visible chrome control produces a pixel (the ≤64rem dead-toggle correction
// in `resolvePanelMode`); if a reveal kept the flag on, the panel would show while the label still read
// "Exit focus mode" — the exact multi-truth this rework deletes. Focus is also transient (never persisted)
// and cleared on section change, matching `openOverlayPanel`'s precedent: a rail tap lands on the new
// section's own layout.

import { isPlainObject } from "@orb/kit/guards";
import { withViewTransition } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";
import type { ModalSlotId } from "./modal-slot-ids.ts";
import type { OverlayPanelRequest, PanelMode, PanelName } from "./panel-resolve.ts";
import { PANEL_MODES } from "./panel-resolve.ts";
import type { SectionId } from "./section-ids.ts";
import { isSectionId, RETIRED_SECTION_HEAL } from "./section-ids.ts";

// The settings deep-link seam (`settingsCategory`/`settingsSubcategory`/`openSettingsTo`) RETIRED with the
// config revamp (#866 S1): the settings modal is gone, Settings is the Configuration SECTION, and its group
// navigation — including the deep-link target — homes in `config-nav-store.ts` (`openConfigTo`). This
// store carries only cross-cutting shell state again.

/** One section's panel overrides — a sparse map; an absent (section, panel) resolves to the section
 *  registry's `panelDefaults`. */
type SectionPanels = Partial<Record<PanelName, PanelMode>>;
type PanelOverrides = Partial<Record<SectionId, SectionPanels>>;

interface ShellState {
  readonly activeSection: SectionId;
  readonly panelOverrides: PanelOverrides;
  readonly openModal: ModalSlotId | null;
  /** Opaque "open this tab" request the active content's context surface interprets. Transient. */
  readonly contextTab: string | null;
  /** Mounted context-tab ids published for the dev navigation bridge. Empty means no tabbed surface. */
  readonly contextTabIds: readonly string[];
  /** Human-visible labels keyed by the published ids; transient. */
  readonly contextTabLabels: Readonly<Record<string, string>>;
  /** Which side panel is open as a slide-over — mobile sheet OR narrow-desktop auto-overlay; `null` = no
   *  request, so the regime's default shows (content, the section's docked default, or — on mobile with
   *  nothing selected — the LIST as the screen); `"none"` = the user closed it explicitly. Device-state,
   *  transient, and reset on section change. */
  readonly openOverlayPanel: OverlayPanelRequest;
  /** Focus mode — the shell's ONE presentation flag for "hide every side panel and read". A pure regime
   *  input (`resolvePanelMode`), never a panel write: the label, the icon and the resolved modes all read
   *  THIS, so they cannot disagree. Transient (never persisted), cleared on section change. */
  readonly focusMode: boolean;
  /** The shell's viewport regime, published by app-shell (the sole `useIsMobileViewport` home) so
   *  `#state` projections can branch on viewport WITHOUT importing the matchMedia hook
   *  (`no-raw-matchmedia` bars it outside app-shell). Device-transient, never persisted.
   *
   *  THE `false` BELOW IS A PRE-MOUNT DEFAULT, NOT A DEVICE ANSWER, and `useShellLayout` seeds the real
   *  one DURING ITS OWN RENDER so no reader in the shell's first commit ever sees it (#1741 — a
   *  passive-effect-only publish landed after the subtree's layout effects, and the config LIST's
   *  once-per-mount arrival default acted on the stale desktop reading). */
  readonly mobileViewport: boolean;
  /** The shell-narrow regime (≤64rem, wider than `mobileViewport`'s 48rem) — published the same way, by
   *  the sibling `useIsShellNarrowViewport` hook. Drives `resolvePanelMode`'s auto-overlay: a `docked`
   *  resolution downgrades to a CLOSED slide-over (`collapsed`) while narrow, opening to `overlay` only on
   *  demand, and restoring the dock on re-widen. Device-transient, never persisted. */
  readonly narrowViewport: boolean;
}

/** Only the layout preference persists — `openModal` is transient (never reopen a modal on reload). */
interface PersistedShellState {
  readonly activeSection: SectionId;
  readonly panelOverrides: PanelOverrides;
}

// The BORN default is HOME (owner decision H1 = D-1 — ONE coupled ruling with the chat landing slimming
// to a no-selection state): the app opens on the landing that HAS a launcher instead of on a section
// whose content is "nothing selected". `activeSection` is persisted, so this only ever affects a fresh
// install / cleared storage — an existing user keeps their last section, and `isSectionId` already
// validates the stored value against the tuple, so no persist-version bump is needed.
const DEFAULT_STATE: ShellState = {
  activeSection: "home",
  panelOverrides: {},
  openModal: null,
  contextTab: null,
  contextTabIds: [],
  contextTabLabels: {},
  openOverlayPanel: null,
  focusMode: false,
  mobileViewport: false,
  narrowViewport: false,
};

// v2: the persisted shape changed from a single global panel pair to per-section `panelOverrides`.
const PERSIST_VERSION = 2;

/** The stored `activeSection`, healed: a live id passes through, a RETIRED id lands on its successor, and
 *  anything else (corrupt / never-existed) degrades to the born default. */
function resolveStoredSection(v: unknown): SectionId {
  if (isSectionId(v)) {
    return v;
  }
  return (typeof v === "string" ? RETIRED_SECTION_HEAL[v] : undefined) ?? DEFAULT_STATE.activeSection;
}

function isPanelMode(v: unknown): v is PanelMode {
  return typeof v === "string" && (PANEL_MODES as readonly string[]).includes(v);
}

// Literal-key panel patch (NOT a computed key): a computed `[panel]` widens to a string index that
// won't assign to `SectionPanels`, so branch on the field name (the old panelPatch precedent).
function patchPanels(current: SectionPanels, panel: PanelName, mode: PanelMode): SectionPanels {
  return panel === "list" ? { ...current, list: mode } : { ...current, context: mode };
}

/** Write one (section, panel) override, preserving every other section + the section's other panel. */
function withOverride(overrides: PanelOverrides, section: SectionId, panel: PanelName, mode: PanelMode): PanelOverrides {
  const next: PanelOverrides = { ...overrides };
  // Index assignment (not a literal computed key) — assignable to the Partial Record.
  next[section] = patchPanels(overrides[section] ?? {}, panel, mode);
  return next;
}

/** Keep only recognized section → panel → mode entries from an untrusted persisted blob. */
function sanitizeOverrides(v: unknown): PanelOverrides {
  if (!isPlainObject(v)) {
    return {};
  }
  const out: PanelOverrides = {};
  for (const [section, panels] of Object.entries(v)) {
    if (!(isSectionId(section) && isPlainObject(panels))) {
      continue;
    }
    const raw = panels;
    let entry: SectionPanels = {};
    const list = raw["list"];
    const context = raw["context"];
    if (isPanelMode(list)) {
      entry = patchPanels(entry, "list", list);
    }
    if (isPanelMode(context)) {
      entry = patchPanels(entry, "context", context);
    }
    out[section] = entry;
  }
  return out;
}

/** Any unknown/corrupt persisted blob degrades to the default layout. */
function migrate(persisted: unknown): ShellState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  const p = persisted as Partial<Record<keyof PersistedShellState, unknown>>;
  return {
    activeSection: resolveStoredSection(p.activeSection),
    panelOverrides: sanitizeOverrides(p.panelOverrides),
    openModal: null,
    contextTab: null,
    contextTabIds: [],
    contextTabLabels: {},
    openOverlayPanel: null,
    focusMode: false,
    mobileViewport: false,
    narrowViewport: false,
  };
}

const useShellStore = createPersistedStore<ShellState, PersistedShellState>("shell", (): ShellState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): PersistedShellState => ({
    activeSection: s.activeSection,
    panelOverrides: s.panelOverrides,
  }),
});

// ── The write API — intent-named module actions (the store handle never escapes this file). ──

/** Switch the active rail section. Also closes any open slide-over AND leaves focus mode — a rail-tab tap
 *  must land on the new section's own layout, never carry the prior section's open sheet/overlay or its
 *  panels-hidden reading mode across. */
export function setActiveSection(id: SectionId): void {
  // A rail-section swap is an in-app pane change at a constant route, so the router's VT never fires —
  // drive it by hand so every writer of the section inherits the crossfade for free.
  withViewTransition(() => {
    useShellStore.setState({ activeSection: id, openOverlayPanel: null, focusMode: false }, false, "shell/setActiveSection");
  });
}

/** Set the active section's explicit mode for one panel (dock ⇄ overlay ⇄ collapse). A REVEALING mode
 *  (anything but `collapsed`) leaves focus mode first — see the file header: focus on ⇒ nothing showing. */
export function setPanelMode(panel: PanelName, mode: PanelMode): void {
  const { activeSection, panelOverrides, focusMode } = useShellStore.getState();
  useShellStore.setState(
    { panelOverrides: withOverride(panelOverrides, activeSection, panel, mode), focusMode: mode === "collapsed" && focusMode },
    false,
    "shell/setPanelMode",
  );
}

/** Enter/leave focus mode — the shell's ONE "hide every side panel" flag (file header). Entering also
 *  closes any open slide-over, so the overlay regimes get the same single-truth reading (nothing showing)
 *  instead of a control whose label never changed. */
export function setFocusMode(on: boolean): void {
  useShellStore.setState(on ? { focusMode: true, openOverlayPanel: null } : { focusMode: false }, false, "shell/setFocusMode");
}

export function openModal(id: ModalSlotId): void {
  useShellStore.setState({ openModal: id }, false, "shell/openModal");
}

/** Ask the CONTEXT panel to open a specific tab. `null` clears the request. */
export function setContextTab(tab: string | null): void {
  useShellStore.setState({ contextTab: tab }, false, "shell/setContextTab");
}

export interface PublishedContextTab {
  readonly id: string;
  readonly label: string;
}

/** Publish the mounted surface's honest id↔visible-label vocabulary for the dev navigation bridge. */
export function publishContextTabs(tabs: readonly PublishedContextTab[]): void {
  useShellStore.setState(
    {
      contextTabIds: tabs.map((tab) => tab.id),
      contextTabLabels: Object.fromEntries(tabs.map((tab) => [tab.id, tab.label])),
    },
    false,
    "shell/publishContextTabs",
  );
}

export function publishContextTabIds(ids: readonly string[]): void {
  publishContextTabs(ids.map((id) => ({ id, label: id })));
}

/** Non-reactive read for the dev bridge. */
export function getAvailableContextTabIds(): readonly string[] {
  return useShellStore.getState().contextTabIds;
}

/** Non-reactive read of the STORED tab request — the dev bridge's half of the landing check (#656). Paired
 *  with {@link getAvailableContextTabIds}: a stored tab that the mounted surface also publishes is the tab
 *  `useContextTabSelection` resolves as active; one it does not publish is a request that fell back. */
export function getContextTab(): string | null {
  return useShellStore.getState().contextTab;
}

/** Subscribe to shell-store changes — the dev bridge's MOUNT SIGNAL (#656). A tabbed CONTEXT surface
 *  publishes its ids from a mount effect (`useContextTabSelection`), so a bridge arm that must not act on
 *  an unmounted panel waits on THIS rather than on a clock. Returns the unsubscribe. */
export function subscribeShellState(listener: () => void): () => void {
  return useShellStore.subscribe(listener);
}

/** The mounted context surface's stable ids paired with the exact labels a human sees. */
export function getAvailableContextTabs(): readonly PublishedContextTab[] {
  const state = useShellStore.getState();
  return state.contextTabIds.map((id) => ({ id, label: state.contextTabLabels[id] ?? id }));
}

/** Reveal the CONTEXT panel on a specific tab — the intent form of the old route-closure
 *  `revealFieldInspector` (a feature fires the navigation intent; the section definition stays
 *  viewport-unaware, §5.1). It writes BOTH regime channels unconditionally because `useShellLayout`
 *  reads them mutually-exclusively — `openOverlayPanel` only in an overlay regime (mobile or
 *  narrow-auto-overlay), the `panelOverrides` dock only wide — so each write self-selects its regime and
 *  neither leaks into the other. This is the viewport-unaware equivalent of the old
 *  `if (isMobile) sheet else dock` branch, without state forking the shell's `matchMedia` homes
 *  (the app-shell viewport hooks, no-raw-matchmedia). */
export function revealContextPanel(tab?: string): void {
  // A `single`-kind CONTEXT (the Presets readout) HAS no tabs, so it names none: writing a tab id no
  // strip can resolve would be a stored lie the next tabbed section has to fall back out of.
  if (tab !== undefined) {
    setContextTab(tab);
  }
  setOpenOverlayPanel("context");
  setPanelMode("context", "docked");
}

/** Close the CONTEXT panel from anywhere — the collapse-time twin of {@link revealContextPanel}, minted for
 *  the `__orb.nav.panel` bridge action. Writes BOTH regime channels unconditionally for the SAME reason
 *  `revealContextPanel` does (see its own comment above): CONTEXT's auto-overlay-ness depends on a
 *  content-constraint read only available during render (`use-shell-layout.ts`'s `contextContentConstrained`),
 *  so a caller outside React cannot pick the one channel that is live — writing both lets whichever regime is
 *  active read its own, and the channel it does not read is simply inert. */
export function hideContextPanel(): void {
  setOpenOverlayPanel(null);
  setPanelMode("context", "collapsed");
}

/** Reveal the CONTEXT panel's tab for a drill whose BODY is ALREADY in CONTENT — a character-card facet,
 *  where the tap that opens the field also swaps CONTENT to that field's editor.
 *
 *  THE MOBILE ARM FOLDS (side-eye 2026-08-06 P1). {@link revealContextPanel}'s unconditional
 *  `setOpenOverlayPanel("context")` is right for a jump whose destination is somewhere else (the rpg
 *  Scene→Quests hop): the sheet IS the navigation. Here it is the opposite — on a phone the context pane
 *  resolves `overlay` at 100dvw and lands a full-screen sheet, with the CONTENT column behind it `inert`,
 *  OVER the very editor the tap just opened. The mock's ruling is explicit: "the CONTEXT arm folds into
 *  CONTENT on mobile — no third pane on a phone" (docs/design/mocks/config-rail/mobile.html frame 3). The
 *  TAB and the WIDE dock are still written unconditionally, so the desktop behaviour is untouched and the
 *  phone's own detail-panel toggle still opens the pane on demand — the reveal just stops doing it FOR the
 *  user at the one moment it hides what they asked for. */
export function revealContextPanelBesideContent(tab: string): void {
  setContextTab(tab);
  if (!useShellStore.getState().mobileViewport) {
    setOpenOverlayPanel("context");
  }
  setPanelMode("context", "docked");
}

export function closeModal(): void {
  useShellStore.setState({ openModal: null }, false, "shell/closeModal");
}

/** Open/close a panel's slide-over (mobile sheet OR narrow-desktop auto-overlay). A `PanelName` opens that
 *  panel and closes the other (one slide-over at a time); `"none"` is the user's explicit close; `null`
 *  RELEASES the request back to the regime default (what a selection write / section change lands, and what
 *  makes the mobile LIST-as-screen the default again once a selection clears).
 *
 *  OPENING one leaves focus mode (a reveal, file header); CLOSING/releasing leaves the flag alone — the
 *  non-panel arms are fired by flows that are not about focus at all (chat selection, drill close) and must
 *  never pop the panels back open behind the user. */
export function setOpenOverlayPanel(panel: OverlayPanelRequest): void {
  const focusMode = panel !== "list" && panel !== "context" && useShellStore.getState().focusMode;
  useShellStore.setState({ openOverlayPanel: panel, focusMode }, false, "shell/setOpenOverlayPanel");
}

/** Publish the shell's current viewport regime — called from `use-shell-layout.ts` only, which owns both
 *  the `useIsMobileViewport` matchMedia read and its ARRIVAL seed (this store must never read matchMedia
 *  directly).
 *
 *  AN UNCHANGED REGIME IS NOT A STATE CHANGE, and spelling that out is what makes the arrival seed legal:
 *  `useShellLayout` publishes from a lazy `useState` initializer so the value is true for the subtree's
 *  FIRST commit (#1741), and a later mount of that hook under an already-subscribed tree would otherwise
 *  notify every shell-store reader from inside another component's render. */
export function setMobileViewport(isMobile: boolean): void {
  if (useShellStore.getState().mobileViewport === isMobile) {
    return;
  }
  useShellStore.setState({ mobileViewport: isMobile }, false, "shell/setMobileViewport");
}

/** Publish the shell's narrow-desktop regime — same caller, same seed, same unchanged-is-not-a-change rule
 *  as {@link setMobileViewport} (the sibling matchMedia read next to `useIsMobileViewport`). */
export function setNarrowViewport(isNarrow: boolean): void {
  if (useShellStore.getState().narrowViewport === isNarrow) {
    return;
  }
  useShellStore.setState({ narrowViewport: isNarrow }, false, "shell/setNarrowViewport");
}

// ── The read API — narrow hooks so chrome re-renders only on the slice it reads. ──

export function useActiveSection(): SectionId {
  return useShellStore((s) => s.activeSection);
}

/** The stored override for one (section, panel) — `undefined` when the user hasn't toggled it. */
export function usePanelOverride(section: SectionId, panel: PanelName): PanelMode | undefined {
  return useShellStore((s) => s.panelOverrides[section]?.[panel]);
}

/** Focus mode — the ONE flag the topbar's label/icon/pressed state and the panel resolve both read. */
export function useFocusMode(): boolean {
  return useShellStore((s) => s.focusMode);
}

/** The shell's published narrow-desktop regime (48–64rem) — raw read, for a feature-tier projection
 *  that needs to branch on it directly (mirrors `mobileViewport`'s narrow read). */
export function useNarrowViewport(): boolean {
  return useShellStore((s) => s.narrowViewport);
}

/** The shell's published MOBILE regime — the `useNarrowViewport` twin, for a `#state` projection that must
 *  branch on it without importing app-shell's matchMedia hook (`no-raw-matchmedia`). */
export function useMobileViewport(): boolean {
  return useShellStore((s) => s.mobileViewport);
}

export function useOpenModal(): ModalSlotId | null {
  return useShellStore((s) => s.openModal);
}

/** The current CONTEXT-panel tab request (opaque; `null` = the surface's default). */
export function useContextTab(): string | null {
  return useShellStore((s) => s.contextTab);
}

/** Which side panel is open as a slide-over — mobile sheet OR narrow-desktop auto-overlay (`null` = no
 *  request, the regime default shows; `"none"` = closed by the user). */
export function useOpenOverlayPanel(): OverlayPanelRequest {
  return useShellStore((s) => s.openOverlayPanel);
}
