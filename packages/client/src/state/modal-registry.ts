// The modal-registry contract (client-architecture-lockdown.md §6d) — the section-registry move applied
// to modals: ONE co-located definition per modal that SELF-DECLARES its trigger, assembled at the door
// (main.tsx). The rail/topbar/mobile-bar DERIVE their modal affordances from `trigger` (no parallel map).

import type { DialogPopupProps } from "@orb/ui/dialog";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalSlotId } from "./modal-slot-ids.ts";
import type { MobileCuration } from "./section-registry.ts";

/** WHERE a modal's trigger affordance lives — the rail/topbar/mobile-bar DERIVE from this (no parallel
 *  map). Extend the tuple to add a placement. The `rail.end`/`topbar.trail` names align with the chrome
 *  zones the deriving surfaces render into, and `assemble-chrome.ts` maps EXACTLY those two — a trigger so
 *  placed IS a `ChromeEntry`, drawn by whichever lens owns the zone. The other two are deliberately not
 *  chrome: `surface` = "my trigger lives inside a feature surface, opened by an explicit `openModal(id)`
 *  call" (new-chat, and the account modal — reached from INSIDE the persona identity widget's Account
 *  strip; the `avatar` pseudo-placement died at §E-5); `mobile-tab` = the You sheet, whose bar button is the
 *  INTRINSIC DOOR to the mobile projection OF the chrome registry (owner ruling 2026-09-06, #1789) — a door
 *  that was an entry inside the projection it opens would be circular, exactly as a panel toggle is
 *  intrinsic to its panel (D73's "the frame's own grammar is intrinsic"). */
export const MODAL_TRIGGER_PLACEMENTS = ["rail.end", "topbar.trail", "mobile-tab", "surface"] as const;
export type ModalTriggerPlacement = (typeof MODAL_TRIGGER_PLACEMENTS)[number];

/** A modal's self-declared trigger — its reachability + the affordance a deriving surface renders. The
 *  `order`/`mobile` axes are the SAME ones a `ChromeEntry` carries: a mapped trigger derives into a chrome
 *  entry, so its presentation axes are declared here rather than re-decided by whichever lens draws it. */
export interface ModalTrigger {
  readonly placement: ModalTriggerPlacement;
  readonly label: string;
  readonly icon: LucideIcon;
  /** The derived entry's canonical position in its zone (`ChromeEntry.order`). Omitted ⇒ the derivation
   *  index, which is deterministic but arbitrary — declare it whenever the position is a DECISION (the ⌘K
   *  chip leads `topbar.trail` at `-10`, ahead of every feature-contributed widget). */
  readonly order?: number;
  /** The derived entry's PHONE FATE (`ChromeEntry.mobile`) — `"sheet"` sheds the affordance off the phone's
   *  row into the You sheet, which projects it as a row. Omitted ⇒ the zone's default (see `ChromeEntry`). */
  readonly mobile?: MobileCuration;
}

/** A modal as ONE definition. `body` is a real feature-owned render, or the DECLARED-PLANNED arm
 *  (`{ planned: "<reason>" }`) — mirror SectionDefinition O1; a placeholder body is unspellable. */
export interface ModalDefinition {
  readonly id: ModalSlotId;
  /** The dialog heading (a noun, e.g. "Theme") — distinct from `trigger.label` (the affordance's
   *  action verb, e.g. "Switch theme"); intentionally different, not a desync. */
  readonly title: string;
  /** A centered `dialog` (default) or a bottom `drawer` sheet — ModalHost picks the component off this. */
  readonly presentation?: "dialog" | "drawer";
  /** The Dialog width/presentation variant. Ignored for `presentation: "drawer"`. */
  readonly size?: DialogPopupProps["size"];
  readonly trigger: ModalTrigger;
  /** Feature-owned cleanup that must run when shell chrome dismisses the modal. Component unmount
   *  cleanup is not equivalent: React Strict Mode probes it while the modal is still logically open. */
  readonly onClose?: () => void;
  readonly body: (() => ReactElement) | { readonly planned: string };
}
