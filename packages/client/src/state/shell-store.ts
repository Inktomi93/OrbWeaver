// The APP-SHELL layout store (UI-Arch §4.1 + §5) — the ONE device-local, persisted home for the
// four-region rail frame's chrome state: which rail section is active, each side panel's
// dock/overlay/collapse mode, and which rail-triggered modal (if any) is open. Persisted through
// `createPersistedStore` so a reload restores the user's layout; `openModal` is deliberately NOT
// persisted (a modal must never reappear on reload — partialize excludes it).
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

/** The rail/topbar/avatar-triggered modal surfaces (id-paired with MODAL_SLOTS bodies, §11.5). */
export const MODAL_SLOT_IDS = ["theme", "settings", "account", "command"] as const;
export type ModalSlotId = (typeof MODAL_SLOT_IDS)[number];

/** A panel's 3-state model (UI-Arch §4.1): docked (in-flow, pushes CONTENT) · overlay (floats over,
 *  §11.1 clamp) · collapsed (`-translate-x-full`, zero width, no reflow). */
export const PANEL_MODES = ["docked", "overlay", "collapsed"] as const;
export type PanelMode = (typeof PANEL_MODES)[number];

/** The two collapsible side panels (RAIL is fixed, CONTENT is fluid — neither is a panel). */
export type PanelName = "list" | "context";

interface ShellState {
  readonly activeSection: SectionId;
  readonly listPanel: PanelMode;
  readonly contextPanel: PanelMode;
  readonly openModal: ModalSlotId | null;
}

/** Only the layout preference persists — `openModal` is transient (never reopen a modal on reload). */
interface PersistedShellState {
  readonly activeSection: SectionId;
  readonly listPanel: PanelMode;
  readonly contextPanel: PanelMode;
}

const DEFAULT_STATE: ShellState = {
  activeSection: "chats",
  // command-center default: the list of chats is docked; the context/detail panel starts collapsed
  // (nothing entity-detail is wired to show yet — honest empty, not a fabricated panel).
  listPanel: "docked",
  contextPanel: "collapsed",
  openModal: null,
};

const PERSIST_VERSION = 1;

function isSectionId(v: unknown): v is SectionId {
  return typeof v === "string" && (SECTION_IDS as readonly string[]).includes(v);
}
function isPanelMode(v: unknown): v is PanelMode {
  return typeof v === "string" && (PANEL_MODES as readonly string[]).includes(v);
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
    listPanel: isPanelMode(p.listPanel) ? p.listPanel : DEFAULT_STATE.listPanel,
    contextPanel: isPanelMode(p.contextPanel) ? p.contextPanel : DEFAULT_STATE.contextPanel,
    openModal: null,
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
      listPanel: s.listPanel,
      contextPanel: s.contextPanel,
    }),
  },
);

const PANEL_FIELD: Readonly<Record<PanelName, "listPanel" | "contextPanel">> = {
  list: "listPanel",
  context: "contextPanel",
};

/** Build the single-panel partial explicitly — a computed-key literal widens to a string index that
 *  won't assign to `Partial<ShellState>`, so branch on the field name instead. */
function panelPatch(panel: PanelName, mode: PanelMode): Partial<ShellState> {
  return panel === "list" ? { listPanel: mode } : { contextPanel: mode };
}

// ── The write API — intent-named module actions (the store handle never escapes this file, §5). ──

/** Switch the active rail section (drives the LIST + CONTENT slots). */
export function setActiveSection(id: SectionId): void {
  useShellStore.setState({ activeSection: id }, false, "shell/setActiveSection");
}

/** Set a panel's explicit mode (dock ⇄ overlay ⇄ collapse). */
export function setPanelMode(panel: PanelName, mode: PanelMode): void {
  useShellStore.setState(panelPatch(panel, mode), false, "shell/setPanelMode");
}

/** The panel-chrome toggle: collapsed → docked, anything-open → collapsed (the common show/hide). */
export function togglePanel(panel: PanelName): void {
  const current = useShellStore.getState()[PANEL_FIELD[panel]];
  const next: PanelMode = current === "collapsed" ? "docked" : "collapsed";
  useShellStore.setState(panelPatch(panel, next), false, "shell/togglePanel");
}

/** The ONE focus toggle (UI-Arch §4.1): immersive-ST (both panels collapsed) ⇄ command-center (both
 *  docked). Derived from the two per-panel fields — no third source of truth. If EITHER panel is
 *  open we go immersive (collapse both); only when both are already collapsed do we restore both. */
export function toggleFocus(): void {
  const { listPanel, contextPanel } = useShellStore.getState();
  const bothCollapsed = listPanel === "collapsed" && contextPanel === "collapsed";
  const next: PanelMode = bothCollapsed ? "docked" : "collapsed";
  useShellStore.setState({ listPanel: next, contextPanel: next }, false, "shell/toggleFocus");
}

export function openModal(id: ModalSlotId): void {
  useShellStore.setState({ openModal: id }, false, "shell/openModal");
}

export function closeModal(): void {
  useShellStore.setState({ openModal: null }, false, "shell/closeModal");
}

// ── The read API — narrow hooks so chrome re-renders only on the slice it reads. ──

export function useActiveSection(): SectionId {
  return useShellStore((s) => s.activeSection);
}

export function usePanelMode(panel: PanelName): PanelMode {
  return useShellStore((s) => s[PANEL_FIELD[panel]]);
}

export function useOpenModal(): ModalSlotId | null {
  return useShellStore((s) => s.openModal);
}

/** True when both panels are collapsed (the immersive-ST layout) — for the focus-toggle affordance. */
export function useIsImmersive(): boolean {
  return useShellStore((s) => s.listPanel === "collapsed" && s.contextPanel === "collapsed");
}
