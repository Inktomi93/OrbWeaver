// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the table.tsx / status-chip.tsx precedent).

// The rail's MODAL triggers (footer + avatar + topbar + mobile "You") — icon + label + order, id-paired
// with the modal-slots.tsx bodies (registry-pairing). The rail's SECTIONS derive from the section
// registry (no parallel map); modal migration to the registry is M4.

import type { LucideIcon } from "@orb/ui/icons";
import { CircleUser, Command, Plus, Settings, SunMoon } from "@orb/ui/icons";
import type { ModalSlotId } from "#state";

/** The rail's section groups, divided by `--spacing-section`: primary (everyday collections) · authoring (create/refine) · insight (analyze). */
export const SECTION_GROUPS = ["primary", "authoring", "insight"] as const;

/** A rail/avatar/topbar affordance that opens a modal (id-paired with a MODAL_SLOTS body). */
export interface RailModalEntry {
  readonly kind: "modal";
  readonly id: ModalSlotId;
  readonly label: string;
  readonly icon: LucideIcon;
}

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

/** The new-chat affordance — opened by CONTENT-level triggers, not the rail; deliberately not on the rail (no spurious footer button) but still a modal trigger the pairing test must see. */
export const NEW_CHAT_ACTION: RailModalEntry = {
  kind: "modal",
  id: "newChat",
  label: "New chat",
  icon: Plus,
};

/** The "You" tab (mobile bottom bar) — opens the `you` sheet. Deliberately not on the desktop rail but still a modal trigger the pairing test must see. */
export const YOU_ACTION: RailModalEntry = {
  kind: "modal",
  id: "you",
  label: "You",
  icon: CircleUser,
};
