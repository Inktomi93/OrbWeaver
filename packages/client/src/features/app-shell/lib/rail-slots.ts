// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the table.tsx / status-chip.tsx precedent).

// RAIL_SLOTS — the registry-as-data for the rail. A section or modal trigger is a data entry, not
// bespoke JSX; modal bodies live id-paired in modal-slots.tsx, this file is the rail's icon + label + order.

import type { LucideIcon } from "@orb/ui/icons";
import {
  BookOpen,
  ChartColumn,
  CircleUser,
  Command,
  FlaskConical,
  Library,
  MessagesSquare,
  Plus,
  Settings,
  SlidersHorizontal,
  SunMoon,
  Users,
} from "@orb/ui/icons";
import type { ModalSlotId, PanelMode, PanelName, SectionId } from "#state";

/** The rail's section groups, divided by `--spacing-section`: primary (everyday collections) · authoring (create/refine) · insight (analyze). */
export const SECTION_GROUPS = ["primary", "authoring", "insight"] as const;

/** A navigable rail section (selects the LIST + CONTENT slots). */
export interface RailSectionEntry {
  readonly kind: "section";
  readonly id: SectionId;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Which rail group this section renders in (drives the `--spacing-section` divider grouping). */
  readonly group: (typeof SECTION_GROUPS)[number];
  /** Mobile bottom-tab curation: only mobilePrimary sections show in the thumb-reach bar; the rest fold into the You sheet's overflow + ⌘K. */
  readonly mobilePrimary?: boolean;
}

/** A rail/avatar/topbar affordance that opens a modal (id-paired with a MODAL_SLOTS body). */
export interface RailModalEntry {
  readonly kind: "modal";
  readonly id: ModalSlotId;
  readonly label: string;
  readonly icon: LucideIcon;
}

type RailSlot = RailSectionEntry | RailModalEntry;

/** The rail nav, in render order. A pairing test asserts every `SectionId` appears exactly once. */
export const RAIL_SECTIONS: readonly RailSectionEntry[] = [
  {
    kind: "section",
    id: "chats",
    label: "Chats",
    icon: MessagesSquare,
    group: "primary",
    mobilePrimary: true,
  },
  {
    kind: "section",
    id: "characters",
    label: "Characters",
    icon: Users,
    group: "primary",
    mobilePrimary: true,
  },
  {
    kind: "section",
    id: "corpus",
    label: "Corpus",
    icon: Library,
    group: "primary",
    mobilePrimary: true,
  },
  { kind: "section", id: "worldInfo", label: "World Info", icon: BookOpen, group: "authoring" },
  { kind: "section", id: "presets", label: "Presets", icon: SlidersHorizontal, group: "authoring" },
  { kind: "section", id: "refinery", label: "Refinery", icon: FlaskConical, group: "authoring" },
  { kind: "section", id: "analytics", label: "Analytics", icon: ChartColumn, group: "insight" },
];

/** The mobile bottom-tab-bar sections — the `mobilePrimary` subset of RAIL_SECTIONS, in rail order. */
export const MOBILE_PRIMARY_SECTIONS: readonly RailSectionEntry[] = RAIL_SECTIONS.filter(
  (s) => s.mobilePrimary === true,
);

/** Each section's initial LIST/CONTEXT panel mode. The persisted per-panel override wins thereafter. */
export const SECTION_PANEL_DEFAULTS: Record<SectionId, Record<PanelName, PanelMode>> = {
  chats: { list: "docked", context: "collapsed" },
  characters: { list: "docked", context: "collapsed" },
  // Corpus LIST docks by default (UI-Arch §4.2 amended 2026-07-13): the LIST IS the search omnibox —
  // collapsing it hid the section's only entry point.
  corpus: { list: "docked", context: "collapsed" },
  worldInfo: { list: "docked", context: "collapsed" },
  presets: { list: "docked", context: "collapsed" },
  refinery: { list: "collapsed", context: "collapsed" },
  analytics: { list: "collapsed", context: "collapsed" },
};

/** The rail footer's modal triggers (above the avatar): theme + settings. */
export const RAIL_ACTIONS: readonly RailModalEntry[] = [
  { kind: "modal", id: "theme", label: "Switch theme", icon: SunMoon },
  { kind: "modal", id: "settings", label: "Settings", icon: Settings },
];

/** The avatar affordance at the rail's very bottom — opens the `account` modal. */
export const ACCOUNT_ACTION: RailModalEntry = {
  kind: "modal",
  id: "account",
  label: "Account",
  icon: CircleUser,
};

/** The ⌘K affordance in the topbar — opens the `command` modal (jump-to). */
export const COMMAND_ACTION: RailModalEntry = {
  kind: "modal",
  id: "command",
  label: "Jump to…",
  icon: Command,
};

/** The new-chat affordance — opened by CONTENT-level triggers, not the rail; deliberately not in RAIL_SLOTS (no spurious footer button) but still a modal trigger the pairing test must see. */
export const NEW_CHAT_ACTION: RailModalEntry = {
  kind: "modal",
  id: "newChat",
  label: "New chat",
  icon: Plus,
};

/** The "You" tab (mobile bottom bar) — opens the `you` sheet. Deliberately not in RAIL_SLOTS (no desktop rail button) but still a modal trigger the pairing test must see. */
export const YOU_ACTION: RailModalEntry = {
  kind: "modal",
  id: "you",
  label: "You",
  icon: CircleUser,
};

/** The full rail registry (nav + footer + avatar) — the pairing test walks this against MODAL_SLOTS. */
export const RAIL_SLOTS: readonly RailSlot[] = [...RAIL_SECTIONS, ...RAIL_ACTIONS, ACCOUNT_ACTION];
