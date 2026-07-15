// The app-shell layout store: which rail section is active, the per-section side-panel override map,
// and which rail-triggered modal (if any) is open. `openModal` is deliberately NOT persisted.
//
// Also homes the shell's layout vocabulary unions (SectionId/ModalSlotId/PanelName/PanelMode) — state
// owns them so app-shell (feature) imports from state, never the reverse.

import { isPlainObject } from "@orb/kit/guards";
import { withViewTransition } from "#lib";
import { createPersistedStore } from "./create-persisted-store";

/** The rail's navigable sections. */
export const SECTION_IDS = [
  "chats",
  "characters",
  "corpus",
  "worldInfo",
  "presets",
  "refinery",
  "analytics",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The modal vocabulary — the ModalDefinition registry is total over this tuple (assembled at the door). */
export const MODAL_SLOT_IDS = [
  "theme",
  "settings",
  "account",
  "command",
  "newChat",
  "you",
] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** The settings vocabulary — the SettingsPaneDefinition registry is total over this tuple (assembled at
 *  the door). MOVED here from features/settings/lib/settings-nav-model.ts (M6.1 ruling, §5 rule 5):
 *  `settingsCategory`/`openSettingsTo` already navigated by category as a bare string, i.e. this was
 *  always shell vocabulary, just untyped. */
export const SETTINGS_CATEGORY_IDS = [
  "account",
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
  /** Which side panel is open as a mobile sheet — `null` = on content. Device-state, transient, and
   *  reset on section change. */
  readonly mobileSheet: PanelName | null;
  /** Settings-category deep-link target. Set alongside `openModal:'settings'`; transient. */
  readonly settingsCategory: SettingsCategoryId | null;
  /** The shell's viewport regime, published by app-shell (the sole `useIsMobileViewport` home) so
   *  `#state` projections can branch on viewport WITHOUT importing the matchMedia hook
   *  (`no-raw-matchmedia` bars it outside app-shell). Device-transient, never persisted. */
  readonly mobileViewport: boolean;
}

/** Only the layout preference persists — `openModal` is transient (never reopen a modal on reload). */
interface PersistedShellState {
  readonly activeSection: SectionId;
  readonly panelOverrides: PanelOverrides;
}

const DEFAULT_STATE: ShellState = {
  activeSection: "chats",
  panelOverrides: {},
  openModal: null,
  contextTab: null,
  mobileSheet: null,
  settingsCategory: null,
  mobileViewport: false,
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
function withOverride(
  overrides: PanelOverrides,
  section: SectionId,
  panel: PanelName,
  mode: PanelMode,
): PanelOverrides {
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
    mobileSheet: null,
    settingsCategory: null,
    mobileViewport: false,
  };
}

const useShellStore = createPersistedStore<ShellState, PersistedShellState>(
  "shell",
  (): ShellState => DEFAULT_STATE,
  {
    version: PERSIST_VERSION,
    migrate,
    partialize: (s): PersistedShellState => ({
      activeSection: s.activeSection,
      panelOverrides: s.panelOverrides,
    }),
  },
);

// ── The write API — intent-named module actions (the store handle never escapes this file). ──

/** Switch the active rail section. Also closes any open mobile sheet — a rail-tab tap must land on
 *  content, never carry the prior section's list sheet across. */
export function setActiveSection(id: SectionId): void {
  // A rail-section swap is an in-app pane change at a constant route, so the router's VT never fires —
  // drive it by hand so every writer of the section inherits the crossfade for free.
  withViewTransition(() => {
    useShellStore.setState(
      { activeSection: id, mobileSheet: null },
      false,
      "shell/setActiveSection",
    );
  });
}

/** Set the active section's explicit mode for one panel (dock ⇄ overlay ⇄ collapse). */
export function setPanelMode(panel: PanelName, mode: PanelMode): void {
  const { activeSection, panelOverrides } = useShellStore.getState();
  useShellStore.setState(
    { panelOverrides: withOverride(panelOverrides, activeSection, panel, mode) },
    false,
    "shell/setPanelMode",
  );
}

export function openModal(id: ModalSlotId): void {
  useShellStore.setState({ openModal: id }, false, "shell/openModal");
}

/** Open the settings overlay and target a specific category pane. */
export function openSettingsTo(category: SettingsCategoryId): void {
  useShellStore.setState(
    { openModal: "settings", settingsCategory: category },
    false,
    "shell/openSettingsTo",
  );
}

/** Ask the CONTEXT panel to open a specific tab. `null` clears the request. */
export function setContextTab(tab: string | null): void {
  useShellStore.setState({ contextTab: tab }, false, "shell/setContextTab");
}

/** Reveal the CONTEXT panel on a specific tab — the intent form of the old route-closure
 *  `revealFieldInspector` (a feature fires the navigation intent; the section definition stays
 *  viewport-unaware, §5.1). It writes BOTH regime channels unconditionally because `useShellLayout`
 *  reads them mutually-exclusively — `mobileSheet` only in the mobile regime, the `panelOverrides` dock
 *  only on desktop — so each write self-selects its regime and neither leaks into the other. This is the
 *  viewport-unaware equivalent of the old `if (isMobile) sheet else dock` branch, without state forking
 *  the shell's one `matchMedia` home (the app-shell mobile-viewport hook, no-raw-matchmedia). */
export function revealContextPanel(tab: string): void {
  setContextTab(tab);
  setMobileSheet("context");
  setPanelMode("context", "docked");
}

export function closeModal(): void {
  useShellStore.setState({ openModal: null, settingsCategory: null }, false, "shell/closeModal");
}

/** Open/close the mobile side-panel sheet. `null` closes (back to content); a `PanelName` opens that
 *  panel as a sheet and closes the other (one sheet at a time). */
export function setMobileSheet(panel: PanelName | null): void {
  useShellStore.setState({ mobileSheet: panel }, false, "shell/setMobileSheet");
}

/** Publish the shell's current viewport regime — called from app-shell's `useIsMobileViewport` sync
 *  effect only (that hook is the sole matchMedia read; this store must never read it directly). */
export function setMobileViewport(isMobile: boolean): void {
  useShellStore.setState({ mobileViewport: isMobile }, false, "shell/setMobileViewport");
}

// ── The read API — narrow hooks so chrome re-renders only on the slice it reads. ──

export function useActiveSection(): SectionId {
  return useShellStore((s) => s.activeSection);
}

/** The stored override for one (section, panel) — `undefined` when the user hasn't toggled it. */
export function usePanelOverride(section: SectionId, panel: PanelName): PanelMode | undefined {
  return useShellStore((s) => s.panelOverrides[section]?.[panel]);
}

/** Is a section's LIST panel currently docked — the narrow #state projection a section definition reads
 *  instead of `useShellLayout` (client-features-no-cross bars a feature from importing the app-shell
 *  hook). Mirrors `useShellLayout`'s `resolvePanel`: on mobile the real panel is never "docked" (it's a
 *  transient sheet), so this reads `false` regardless of override/default; desktop resolves the same
 *  channel useShellLayout does (override ?? the section's own default). */
export function useListDocked(section: SectionId, ownDefault: PanelMode): boolean {
  const mobileViewport = useShellStore((s) => s.mobileViewport);
  const override = usePanelOverride(section, "list");
  return mobileViewport ? false : (override ?? ownDefault) === "docked";
}

export function useOpenModal(): ModalSlotId | null {
  return useShellStore((s) => s.openModal);
}

/** The current CONTEXT-panel tab request (opaque; `null` = the surface's default). */
export function useContextTab(): string | null {
  return useShellStore((s) => s.contextTab);
}

/** Which side panel is open as a mobile sheet (`null` = on content). */
export function useMobileSheet(): PanelName | null {
  return useShellStore((s) => s.mobileSheet);
}

/** The settings deep-link target category (`null` = the settings shell's default pane). */
export function useSettingsTarget(): SettingsCategoryId | null {
  return useShellStore((s) => s.settingsCategory);
}
