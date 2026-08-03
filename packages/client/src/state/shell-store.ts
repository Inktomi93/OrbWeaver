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
import { createPersistedStore } from "./create-persisted-store";

/** The rail's navigable sections. `home` leads: it is the landing section (its rail affordance is the
 *  brand glyph, `rail.brand` — home-section-spec §4.1), and the tuple order IS the rail/mobile-bar order.
 *  EDITING THIS TUPLE: walk the ten coupled sites in client-architecture-lockdown.md §6a (the SECTION_IDS
 *  playbook) — tsc carries only the door Record; the sanitizers, agent-nav vocabulary, CT mirror, mobile
 *  curation and placeholder copy are each a separate hand edit. */
export const SECTION_IDS = ["home", "chats", "characters", "corpus", "config", "worldInfo", "presets", "refinery", "analytics"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The modal vocabulary — the ModalDefinition registry is total over this tuple (assembled at the door). */
export const MODAL_SLOT_IDS = ["theme", "settings", "account", "command", "newChat", "you"] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** The settings vocabulary — the SettingsPaneDefinition registry is total over this tuple (assembled at
 *  the door). MOVED here from features/settings/lib/settings-nav-model.ts (M6.1 ruling, §5 rule 5):
 *  `settingsCategory`/`openSettingsTo` already navigated by category as a bare string, i.e. this was
 *  always shell vocabulary, just untyped.
 *
 *  `system` RETIRED with SET-SEAMS stage 4 (§10 Q2, owner-ruled): it and `admin` were both APP-group,
 *  both admin-gated, and after the decomposition both held admin-tier knob sections owned by the same
 *  feature — two panes meant hunting for which admin knob lived where. System's five sections are the
 *  admin pane's FIRST group now; a deep link to `system` no longer type-checks (`openSettingsTo("admin")`
 *  is the replacement) and `agent-nav` rejects it against this tuple.
 *
 *  `tags` + `regex` RETIRED with the config rail's R1 (config-rail-spec.md §2 C-11): both were
 *  workspace-grade CRUD libraries living as modal panes, and they are now `CollectionContribution`s in the
 *  `config` section's roster. The "Library" nav group disappeared with them; NOTHING tombstones — the union
 *  is closed, so tsc enumerated every `openSettingsTo` call site and each became `goToCollection(kind)`. */
export const SETTINGS_CATEGORY_IDS = [
  "personas",
  "appearance",
  "workloads",
  "backup",
  "chat-behavior",
  "connections",
  "automation",
  "admin",
] as const;
export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

// A settings-section contribution anchors at a `SettingsCategoryId` — EVERY pane is a host (SET-SEAMS
// §5.1). The old `SETTINGS_SECTION_ANCHORS` subset tuple retired with stage 0: it existed only because
// three panes were not yet hosts, and it made "can a section land here?" a second fact that drifted from
// the pane vocabulary.

/** A panel's 3-state model: docked (in-flow) · overlay (floats over) · collapsed (zero width). */
export const PANEL_MODES = ["docked", "overlay", "collapsed"] as const;
export type PanelMode = (typeof PANEL_MODES)[number];

/** The two collapsible side panels (rail is fixed, content is fluid — neither is a panel). */
export type PanelName = "list" | "context";

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
  /** Which side panel is open as a slide-over — mobile sheet OR narrow-desktop auto-overlay; `null` = no
   *  slide-over open (content or the section's docked default shows instead). Device-state, transient,
   *  and reset on section change. */
  readonly openOverlayPanel: PanelName | null;
  /** Focus mode — the shell's ONE presentation flag for "hide every side panel and read". A pure regime
   *  input (`resolvePanelMode`), never a panel write: the label, the icon and the resolved modes all read
   *  THIS, so they cannot disagree. Transient (never persisted), cleared on section change. */
  readonly focusMode: boolean;
  /** Settings-category deep-link target. Set alongside `openModal:'settings'`; transient. */
  readonly settingsCategory: SettingsCategoryId | null;
  /** SUB-level deep-link target (SET-SEAMS §10 Q4): the `SettingsSubcategory.id` inside
   *  `settingsCategory` the shell should select + scroll to, or `null` for "the top of the pane". Set by
   *  `openSettingsTo(category, subId)`; transient, cleared with the category. */
  readonly settingsSubcategory: string | null;
  /** The shell's viewport regime, published by app-shell (the sole `useIsMobileViewport` home) so
   *  `#state` projections can branch on viewport WITHOUT importing the matchMedia hook
   *  (`no-raw-matchmedia` bars it outside app-shell). Device-transient, never persisted. */
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
  openOverlayPanel: null,
  focusMode: false,
  settingsCategory: null,
  settingsSubcategory: null,
  mobileViewport: false,
  narrowViewport: false,
};

// v2: the persisted shape changed from a single global panel pair to per-section `panelOverrides`.
const PERSIST_VERSION = 2;

function isSectionId(v: unknown): v is SectionId {
  return typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v);
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
    activeSection: isSectionId(p.activeSection) ? p.activeSection : DEFAULT_STATE.activeSection,
    panelOverrides: sanitizeOverrides(p.panelOverrides),
    openModal: null,
    contextTab: null,
    openOverlayPanel: null,
    focusMode: false,
    settingsCategory: null,
    settingsSubcategory: null,
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

/** Open the settings overlay and target a specific category pane — optionally a specific SUBCATEGORY
 *  inside it (SET-SEAMS §10 Q4: "configure memory" from a chat surface lands ON the memory section, not at
 *  the top of the pane). The sub id is the `SettingsSubcategory.id`; the shell selects it in the nav and
 *  scrolls to `settingsAnchorId(category, subId)` once the pane's DOM has it. */
export function openSettingsTo(category: SettingsCategoryId, subId?: string): void {
  useShellStore.setState({ openModal: "settings", settingsCategory: category, settingsSubcategory: subId ?? null }, false, "shell/openSettingsTo");
}

/** Ask the CONTEXT panel to open a specific tab. `null` clears the request. */
export function setContextTab(tab: string | null): void {
  useShellStore.setState({ contextTab: tab }, false, "shell/setContextTab");
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

export function closeModal(): void {
  useShellStore.setState({ openModal: null, settingsCategory: null, settingsSubcategory: null }, false, "shell/closeModal");
}

/** Open/close a panel's slide-over (mobile sheet OR narrow-desktop auto-overlay). `null` closes (back to
 *  content/dock); a `PanelName` opens that panel and closes the other (one slide-over at a time).
 *
 *  OPENING one leaves focus mode (a reveal, file header); CLOSING leaves the flag alone — `null` is fired
 *  by flows that are not about focus at all (chat selection, drill close) and must never pop the panels
 *  back open behind the user. */
export function setOpenOverlayPanel(panel: PanelName | null): void {
  const focusMode = panel === null && useShellStore.getState().focusMode;
  useShellStore.setState({ openOverlayPanel: panel, focusMode }, false, "shell/setOpenOverlayPanel");
}

/** Publish the shell's current viewport regime — called from app-shell's `useIsMobileViewport` sync
 *  effect only (that hook is the sole matchMedia read; this store must never read it directly). */
export function setMobileViewport(isMobile: boolean): void {
  useShellStore.setState({ mobileViewport: isMobile }, false, "shell/setMobileViewport");
}

/** Publish the shell's narrow-desktop regime — called from app-shell's `useIsShellNarrowViewport` sync
 *  effect only (the sibling matchMedia read next to `useIsMobileViewport`). */
export function setNarrowViewport(isNarrow: boolean): void {
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

/** The ONE mode-resolution algebra — both `useShellLayout`'s `resolvePanel` (feature-tier hook, reads the
 *  section registry for `panelDefaults`) and `useListDocked` below (this tier) call this SAME function so
 *  they can never drift (the M10 correction: a hand-copied mirror read only `mobileViewport` and
 *  disagreed with `resolvePanel` in the 48–64rem regime). Precedence isFocus → isMobile → narrow → wide.
 *
 *  FOCUS WINS OVER EVERYTHING (item 20): focus mode is "no side panel is showing", in every regime, with
 *  ZERO writes to `panelOverrides` — which is what makes the flag, the label and the pixels one truth and
 *  leaves the pre-focus layout intact for the exit (the untouched override map IS the saved state).
 *  Then, as before: mobile never resolves "docked" (a transient sheet, open only when `openOverlayPanel` names it); a
 *  narrow-desktop `docked` DEFAULT auto-downgrades to a CLOSED slide-over (`collapsed`), opening to
 *  `overlay` only when `openOverlayPanel` names it (§4.1: overlay is zero-width closed by default, slides
 *  over on demand); wide resolves the raw override-or-default untouched.
 *
 *  BEING NAMED BY `openOverlayPanel` WINS OVER A STORED `collapsed` in the narrow regime (2026-08-01 fix).
 *  It read as a dead control: `chats` defaults its CONTEXT pane `collapsed`, so at ≤64rem the toggle wrote a
 *  `docked` override that this function immediately re-collapsed — the user's click produced no pixel, and
 *  only a SECOND click (now on a `docked` default) reached the overlay arm. A persisted collapse is a WIDE
 *  dock preference; it cannot outvote a live "open it now" in a regime where docking is impossible. */
export function resolvePanelMode(
  panel: PanelName,
  resolved: PanelMode,
  regime: {
    readonly isFocus: boolean;
    readonly isMobile: boolean;
    readonly isNarrow: boolean;
    readonly openOverlayPanel: PanelName | null;
  },
): PanelMode {
  if (regime.isFocus) {
    return "collapsed";
  }
  if (regime.isMobile) {
    return regime.openOverlayPanel === panel ? "overlay" : "collapsed";
  }
  if (regime.isNarrow) {
    if (regime.openOverlayPanel === panel) {
      return "overlay";
    }
    return resolved === "docked" ? "collapsed" : resolved;
  }
  return resolved;
}

/** Is a section's LIST panel currently docked — the narrow #state projection a section body reads instead of
 *  `useShellLayout` (client-features-no-cross bars a feature from importing the app-shell hook, so this tier
 *  is the ONLY legal way for a feature to ask). Routes through the SAME `resolvePanelMode` algebra
 *  `useShellLayout` uses, so the two can never disagree (the M10 correction bug: `showRecents` broke in the
 *  48–64rem regime when this read only `mobileViewport`).
 *
 *  LIVENESS (swept 2026-08-01): ZERO feature consumers today. Its one caller was the chat landing's
 *  `showRecents` — "when the Chats LIST is docked it already IS the recents finder, so don't duplicate it" —
 *  and H2 (`3f54a4d3`) retired the landing's recents entirely (home tiles own them now). KEPT, not deleted:
 *  the superseded thing was that ONE de-duplication, not this projection. It is the seam's only sanctioned
 *  answer to "is my list pane visible", and the alternative — a feature recomposing it from
 *  `usePanelOverride` + the viewport reads — is exactly the hand-copied mirror that produced the M10 bug.
 *  Its CTs (tests/client/state/shell-store.ct.tsx) pin the shared algebra, so it cannot rot silently. */
export function useListDocked(section: SectionId, ownDefault: PanelMode): boolean {
  const isFocus = useShellStore((s) => s.focusMode);
  const isMobile = useShellStore((s) => s.mobileViewport);
  const isNarrow = useShellStore((s) => s.narrowViewport);
  const openOverlayPanel = useShellStore((s) => s.openOverlayPanel);
  const override = usePanelOverride(section, "list");
  const resolved = override ?? ownDefault;
  return resolvePanelMode("list", resolved, { isFocus, isMobile, isNarrow, openOverlayPanel }) === "docked";
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

export function useOpenModal(): ModalSlotId | null {
  return useShellStore((s) => s.openModal);
}

/** The current CONTEXT-panel tab request (opaque; `null` = the surface's default). */
export function useContextTab(): string | null {
  return useShellStore((s) => s.contextTab);
}

/** Which side panel is open as a slide-over — mobile sheet OR narrow-desktop auto-overlay (`null` = no
 *  slide-over open). */
export function useOpenOverlayPanel(): PanelName | null {
  return useShellStore((s) => s.openOverlayPanel);
}

/** The settings deep-link target category (`null` = the settings shell's default pane). */
export function useSettingsTarget(): SettingsCategoryId | null {
  return useShellStore((s) => s.settingsCategory);
}

/** The SUB-level deep-link target inside `useSettingsTarget()`'s pane, or `null` for "top of the pane". */
export function useSettingsSubTarget(): string | null {
  return useShellStore((s) => s.settingsSubcategory);
}
