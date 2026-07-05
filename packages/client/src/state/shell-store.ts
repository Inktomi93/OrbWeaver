// The APP-SHELL layout store (UI-Arch §4.1 + §4.2 + §5) — the ONE device-local, persisted home for the
// four-region rail frame's chrome state: which rail section is active, the PER-SECTION side-panel
// override map, and which rail-triggered modal (if any) is open. Persisted through
// `createPersistedStore` so a reload restores the user's layout; `openModal` is deliberately NOT
// persisted (a modal must never reappear on reload — partialize excludes it).
//
// WHY PER-SECTION panel state (D62): §4.2 rule 2 ("per-section selection is REMEMBERED — rail-switching
// away and back restores the section exactly") + rule 3 ("per-section panel DEFAULTS, user override wins
// thereafter") together mean each section keeps its OWN panel modes. So the store holds a sparse
// `panelOverrides` map (a section→panel→mode override the user's toggle writes), NOT a single global
// list/context pair. The INITIAL value for an un-overridden (section, panel) is the SECTION_PANEL_DEFAULTS
// table — but that table lives beside RAIL_SECTIONS in the app-shell FEATURE (features/app-shell/lib/
// rail-slots.ts), which state MUST NOT import (that would be a reverse feature→state→feature cycle). So
// the RESOLVE step (override ?? default) + the toggle/focus derivations (which need the resolved mode)
// live in the feature's `use-shell-layout.ts` merge point; this store owns only the raw override writes +
// reads. `setPanelMode(panel, mode)` keeps its `(panel, mode)` signature (writes the ACTIVE section's
// override) so no call site changes.
//
// This file also HOMES the shell's layout vocabulary unions (SectionId · ModalSlotId · PanelName ·
// PanelMode). They live in state, not the app-shell feature, so the flow is one-directional
// (feature → state, never a cycle): the RAIL_SLOTS/MODAL_SLOTS registries (features/app-shell/lib)
// import these unions and a `Record<SectionId|ModalSlotId, …>` there makes a missing section/modal a
// `tsc` error (the §11.1 "derive-don't-respell / missing member is a tsc error" keystone, realized
// across the state↔feature seam).
//
// State-law recap (gate `state:files`): one store per file, ≤10 fields, no exported set/getState —
// callers use the intent-named module actions + narrow read hooks below, never the raw handle.

import { createPersistedStore } from "./create-persisted-store";

// The shell axes as SINGLE-HOME tuples, unions DERIVED (Spine string-union discipline §5.5 —
// `no-inline-union-redecl`: a member is added once, in one place, never re-spelled). The registries
// (rail-slots/modal-slots) + the migrate membership checks below all read these same tuples.

/** The rail's navigable sections (UI-Arch §4.1 — Chats · Characters · Corpus · Refinery · Analytics). */
export const SECTION_IDS = ["chats", "characters", "corpus", "refinery", "analytics"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The rail/topbar/avatar-triggered modal surfaces (id-paired with MODAL_SLOTS bodies, §11.5). `newChat`
 *  (J2) is trigger-only from CONTENT affordances (chat-list "+", landing hero, ⌘K) — NOT a rail button
 *  (its trigger is the standalone `NEW_CHAT_ACTION`, never appended to `RAIL_ACTIONS`). `you` (L6 mobile,
 *  D62 P3) is the bottom-tab-bar "You" sheet — trigger-only from the mobile bar (`YOU_ACTION`), a
 *  `drawer`-presentation modal (bottom sheet), never a desktop rail button. */
export const MODAL_SLOT_IDS = [
  "theme",
  "settings",
  "account",
  "command",
  "newChat",
  "you",
] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** A panel's 3-state model (UI-Arch §4.1): docked (in-flow, pushes CONTENT) · overlay (floats over,
 *  §11.1 clamp) · collapsed (`-translate-x-full`, zero width, no reflow). */
export const PANEL_MODES = ["docked", "overlay", "collapsed"] as const;
export type PanelMode = (typeof PANEL_MODES)[number];

/** The two collapsible side panels (RAIL is fixed, CONTENT is fluid — neither is a panel). */
export type PanelName = "list" | "context";

/** One section's panel overrides — a sparse map; an absent (section, panel) resolves to the feature's
 *  SECTION_PANEL_DEFAULTS table (in use-shell-layout.ts, the resolve seam). File-local (not exported):
 *  the reader is `usePanelOverride`, never a raw shape crossing a boundary. */
type SectionPanels = Partial<Record<PanelName, PanelMode>>;
type PanelOverrides = Partial<Record<SectionId, SectionPanels>>;

interface ShellState {
  readonly activeSection: SectionId;
  /** Per-section side-panel overrides (sparse). Un-overridden ⇒ the feature default (§4.2 rule 3). */
  readonly panelOverrides: PanelOverrides;
  readonly openModal: ModalSlotId | null;
  /** The CONTEXT-panel "open this tab" seam (ux-flow-revamp J6): an OPAQUE string the shell forwards and
   *  the active CONTENT's context surface interprets (chat maps it to its Overrides/Preview/Injections/
   *  Roster tab). Kept as a bare `string | null` — NOT a chat-specific union — so the shell stays
   *  domain-agnostic (it never learns a chat tab id). `null` = the surface's own default tab. Transient
   *  (never persisted — a deep-linked tab must not survive a reload, like `openModal`). */
  readonly contextTab: string | null;
  /** L6 mobile (D62 P3 · J12): WHICH side panel is currently open AS A SHEET on mobile — `null` = you're
   *  on CONTENT (the correct mobile landing, never an open list). At most ONE sheet at a time (opening one
   *  closes the other): a mobile sheet is a full-width overlay, so stacked sheets make no sense. This is
   *  DEVICE-STATE, deliberately SEPARATE from the persisted `panelOverrides` (a "docked" dock preference is
   *  a desktop concept a sheet must never inherit) — the `use-shell-layout.ts` resolve picks this on mobile
   *  and the persisted overrides on desktop. TRANSIENT (never persisted, like `openModal`) and RESET on
   *  section change (`setActiveSection`) so a rail-tab tap always lands on CONTENT. */
  readonly mobileSheet: PanelName | null;
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
};

// v2: the persisted shape changed from a single global `listPanel`/`contextPanel` pair (v1) to the
// per-section `panelOverrides` map. A v1 blob has no override map — migrate degrades it to empty
// overrides (the section defaults take over), keeping only a valid `activeSection`.
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
  if (typeof v !== "object" || v === null) {
    return {};
  }
  const out: PanelOverrides = {};
  for (const [section, panels] of Object.entries(v)) {
    if (!isSectionId(section) || typeof panels !== "object" || panels === null) {
      continue;
    }
    const raw = panels as Record<string, unknown>;
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

/** TOTAL, crash-proof migrate: any unknown/corrupt persisted blob degrades to the default layout —
 *  a bad localStorage shape must never brick the shell (UI-Primitives §13.1). */
function migrate(persisted: unknown): ShellState {
  if (typeof persisted !== "object" || persisted === null) {
    return DEFAULT_STATE;
  }
  const p = persisted as Partial<Record<keyof PersistedShellState, unknown>>;
  return {
    activeSection: isSectionId(p.activeSection) ? p.activeSection : DEFAULT_STATE.activeSection,
    panelOverrides: sanitizeOverrides(p.panelOverrides),
    openModal: null,
    contextTab: null,
    mobileSheet: null,
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

// ── The write API — intent-named module actions (the store handle never escapes this file, §5). ──

/** Switch the active rail section (drives the LIST + CONTENT slots). Each section keeps its own panel
 *  state — switching restores this section's overrides (§4.2 rule 2), resolved in use-shell-layout.ts.
 *  Also closes any open mobile sheet (L6/J12): a rail-tab tap must land on CONTENT, never carry the prior
 *  section's list sheet across. */
export function setActiveSection(id: SectionId): void {
  useShellStore.setState({ activeSection: id, mobileSheet: null }, false, "shell/setActiveSection");
}

/** Set the ACTIVE section's explicit mode for one panel (dock ⇄ overlay ⇄ collapse). Signature is
 *  `(panel, mode)` — unchanged — so every call site is untouched; the active section is read internally. */
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

/** Ask the CONTEXT panel to open a specific tab (an opaque id the active context surface interprets —
 *  ux-flow-revamp J6: the chat options menu calls this + docks the panel). `null` clears the request. */
export function setContextTab(tab: string | null): void {
  useShellStore.setState({ contextTab: tab }, false, "shell/setContextTab");
}

export function closeModal(): void {
  useShellStore.setState({ openModal: null }, false, "shell/closeModal");
}

/** Open/close the mobile side-panel SHEET (L6/J12). `null` closes (back to CONTENT); a `PanelName` opens
 *  that panel as a sheet AND closes the other (one sheet at a time). The `use-shell-layout.ts` mobile
 *  resolve maps this to the panel's `overlay`/`collapsed` mode; desktop ignores it. */
export function setMobileSheet(panel: PanelName | null): void {
  useShellStore.setState({ mobileSheet: panel }, false, "shell/setMobileSheet");
}

// ── The read API — narrow hooks so chrome re-renders only on the slice it reads. ──

export function useActiveSection(): SectionId {
  return useShellStore((s) => s.activeSection);
}

/** The stored override for one (section, panel) — `undefined` when the user hasn't toggled it (the
 *  feature's SECTION_PANEL_DEFAULTS resolves the initial value). A primitive selector (no fresh object,
 *  so it's zustand-selector-derived clean). */
export function usePanelOverride(section: SectionId, panel: PanelName): PanelMode | undefined {
  return useShellStore((s) => s.panelOverrides[section]?.[panel]);
}

export function useOpenModal(): ModalSlotId | null {
  return useShellStore((s) => s.openModal);
}

/** The current CONTEXT-panel tab request (opaque; `null` = the surface's default). A primitive selector. */
export function useContextTab(): string | null {
  return useShellStore((s) => s.contextTab);
}

/** Which side panel is open as a mobile SHEET (`null` = on CONTENT). A primitive selector. */
export function useMobileSheet(): PanelName | null {
  return useShellStore((s) => s.mobileSheet);
}
