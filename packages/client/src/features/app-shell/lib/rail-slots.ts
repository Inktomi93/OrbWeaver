// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the table.tsx / status-chip.tsx precedent).

// RAIL_SLOTS — the registry-as-data for the rail (UI-Arch §4.1; the §11.1/§11.5 registry-pairing
// keystone). The array/record IS the rail: a section or modal trigger is a data entry, not bespoke
// JSX, so a missing/renamed member is caught by `tsc` (the id types are the `#state` unions) + the
// rail-slots pairing test (the stand-in for the still-parked `check:registry-pairing` gate). The
// modal BODIES live id-paired in `modal-slots.tsx` (`Record<ModalSlotId, ModalDef>` — a missing body
// is a tsc error there); this file is the rail's icon + label + order.

import type { LucideIcon } from "@orb/ui/icons";
import {
  ChartColumn,
  CircleUser,
  Command,
  FlaskConical,
  Library,
  MessagesSquare,
  Settings,
  SunMoon,
  Users,
} from "@orb/ui/icons";
import type { ModalSlotId, SectionId } from "#state";

/** A navigable rail section (selects the LIST + CONTENT slots). */
export interface RailSectionEntry {
  readonly kind: "section";
  readonly id: SectionId;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** A rail/avatar/topbar affordance that opens a modal (id-paired with a MODAL_SLOTS body). */
export interface RailModalEntry {
  readonly kind: "modal";
  readonly id: ModalSlotId;
  readonly label: string;
  readonly icon: LucideIcon;
}

// File-local union (NOT exported — an exported feature-lib `type` alias is a no-inline-types leak;
// consumers import the two entry INTERFACES, or the typed arrays below).
type RailSlot = RailSectionEntry | RailModalEntry;

/** The rail nav, in render order. Each `id` is typed `SectionId`, so a typo is a tsc error; the
 *  pairing test asserts every `SectionId` appears exactly once (full coverage of the union). */
export const RAIL_SECTIONS: readonly RailSectionEntry[] = [
  { kind: "section", id: "chats", label: "Chats", icon: MessagesSquare },
  { kind: "section", id: "characters", label: "Characters", icon: Users },
  { kind: "section", id: "corpus", label: "Corpus", icon: Library },
  { kind: "section", id: "refinery", label: "Refinery", icon: FlaskConical },
  { kind: "section", id: "analytics", label: "Analytics", icon: ChartColumn },
];

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

/** The full rail registry (nav + footer + avatar) — the pairing test walks this against MODAL_SLOTS. */
export const RAIL_SLOTS: readonly RailSlot[] = [...RAIL_SECTIONS, ...RAIL_ACTIONS, ACCOUNT_ACTION];
