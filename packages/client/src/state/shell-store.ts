// The app-shell layout store: which rail section is active, the per-section side-panel override map,
// and which rail-triggered modal (if any) is open. `openModal` is deliberately NOT persisted.
//
// Also homes the shell's layout vocabulary unions (SectionId/ModalSlotId/PanelName/PanelMode) — state
// owns them so app-shell (feature) imports from state, never the reverse.

import { isPlainObject } from "@orb/kit/guards";
import { withViewTransition } from "#lib";
import { createPersistedStore } from "./create-persisted-store";

/** The rail's navigable sections. `home` leads: it is the landing section (its rail affordance is the
 *  brand glyph, `rail.brand` — home-section-spec §4.1), and the tuple order IS the rail/mobile-bar order. */
export const SECTION_IDS = ["home", "chats", "characters", "corpus", "worldInfo", "presets", "refinery", "analytics"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The modal vocabulary — the ModalDefinition registry is total over this tuple (assembled at the door). */
export const MODAL_SLOT_IDS = ["theme", "settings", "account", "command", "newChat", "you"] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** The settings vocabulary — the SettingsPaneDefinition registry is total over this tuple (assembled at
 *  the door). MOVED here from features/settings/lib/settings-nav-model.ts (M6.1 ruling, §5 rule 5):
 *  `settingsCategory`/`openSettingsTo` already navigated by category as a bare string, i.e. this was
 *  always shell vocabulary, just untyped. */
export const SETTINGS_CATEGORY_IDS = [
  "personas",
  "appearance",
  "tags",
  "workloads",
  "backup",
  "chat-behavior",
  "regex",
  "connections",
  "automation",
  "system",
  "admin",
] as const;
export type SettingsCategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

// The settings-pane anchors that accept contributed SECTIONS (client-architecture-lockdown.md §6c) — SHELL
// VOCABULARY by the M6.1 test (§5 rule 5): it keys door-assembled contributions spanning features
// (chat-behavior ← chat/world-info; admin ← user-admin; workloads ← workloads' own tuning section;
// appearance ← character's library page-size), so it homes HERE beside SETTINGS_CATEGORY_IDS, not in the
// registry file (re-declaring it would trip `no-parallel-section-map`, the YOU_MODAL_IDS shape).
// `satisfies readonly SettingsCategoryId[]` keeps anchors a checked SUBSET — an anchor must be a real pane.
export const SETTINGS_SECTION_ANCHORS = ["chat-behavior", "admin", "workloads", "appearance"] as const satisfies readonly SettingsCategoryId[];
export type SettingsSectionAnchor = (typeof SETTINGS_SECTION_ANCHORS)[number];

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
  /** Settings-category deep-link target. Set alongside `openModal:'settings'`; transient. */
  readonly settingsCategory: SettingsCategoryId | null;
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
  settingsCategory: null,
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
    settingsCategory: null,
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

/** Switch the active rail section. Also closes any open slide-over — a rail-tab tap must land on
 *  content, never carry the prior section's open sheet/overlay across. */
export function setActiveSection(id: SectionId): void {
  // A rail-section swap is an in-app pane change at a constant route, so the router's VT never fires —
  // drive it by hand so every writer of the section inherits the crossfade for free.
  withViewTransition(() => {
    useShellStore.setState({ activeSection: id, openOverlayPanel: null }, false, "shell/setActiveSection");
  });
}

/** Set the active section's explicit mode for one panel (dock ⇄ overlay ⇄ collapse). */
export function setPanelMode(panel: PanelName, mode: PanelMode): void {
  const { activeSection, panelOverrides } = useShellStore.getState();
  useShellStore.setState({ panelOverrides: withOverride(panelOverrides, activeSection, panel, mode) }, false, "shell/setPanelMode");
}

export function openModal(id: ModalSlotId): void {
  useShellStore.setState({ openModal: id }, false, "shell/openModal");
}

/** Open the settings overlay and target a specific category pane. */
export function openSettingsTo(category: SettingsCategoryId): void {
  useShellStore.setState({ openModal: "settings", settingsCategory: category }, false, "shell/openSettingsTo");
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
export function revealContextPanel(tab: string): void {
  setContextTab(tab);
  setOpenOverlayPanel("context");
  setPanelMode("context", "docked");
}

export function closeModal(): void {
  useShellStore.setState({ openModal: null, settingsCategory: null }, false, "shell/closeModal");
}

/** Open/close a panel's slide-over (mobile sheet OR narrow-desktop auto-overlay). `null` closes (back to
 *  content/dock); a `PanelName` opens that panel and closes the other (one slide-over at a time). */
export function setOpenOverlayPanel(panel: PanelName | null): void {
  useShellStore.setState({ openOverlayPanel: panel }, false, "shell/setOpenOverlayPanel");
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
 *  disagreed with `resolvePanel` in the 48–64rem regime). Precedence isMobile → narrow → wide:
 *  mobile never resolves "docked" (a transient sheet, open only when `openOverlayPanel` names it); a
 *  narrow-desktop `docked` DEFAULT auto-downgrades to a CLOSED slide-over (`collapsed`), opening to
 *  `overlay` only when `openOverlayPanel` names it (§4.1: overlay is zero-width closed by default, slides
 *  over on demand); an explicit `collapsed`/`overlay` override passes through unchanged in every regime;
 *  wide resolves the raw override-or-default untouched. */
export function resolvePanelMode(
  panel: PanelName,
  resolved: PanelMode,
  regime: {
    readonly isMobile: boolean;
    readonly isNarrow: boolean;
    readonly openOverlayPanel: PanelName | null;
  },
): PanelMode {
  if (regime.isMobile) {
    return regime.openOverlayPanel === panel ? "overlay" : "collapsed";
  }
  if (regime.isNarrow && resolved === "docked") {
    return regime.openOverlayPanel === panel ? "overlay" : "collapsed";
  }
  return resolved;
}

/** Is a section's LIST panel currently docked — the narrow #state projection a section definition reads
 *  instead of `useShellLayout` (client-features-no-cross bars a feature from importing the app-shell
 *  hook). Routes through the SAME `resolvePanelMode` algebra `useShellLayout` uses, so the two can never
 *  disagree (the M10 correction bug: `showRecents` broke in the 48–64rem regime when this read only
 *  `mobileViewport`). */
export function useListDocked(section: SectionId, ownDefault: PanelMode): boolean {
  const isMobile = useShellStore((s) => s.mobileViewport);
  const isNarrow = useShellStore((s) => s.narrowViewport);
  const openOverlayPanel = useShellStore((s) => s.openOverlayPanel);
  const override = usePanelOverride(section, "list");
  const resolved = override ?? ownDefault;
  return resolvePanelMode("list", resolved, { isMobile, isNarrow, openOverlayPanel }) === "docked";
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
