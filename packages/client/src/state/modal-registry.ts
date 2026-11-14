// The modal-registry contract (client-architecture-lockdown.md §6d) — the section-registry move applied
// to modals: ONE co-located definition per modal that SELF-DECLARES its trigger, assembled at the door
// (compose/authed-composition.tsx). The rail/topbar/mobile-bar DERIVE their modal affordances from `trigger` (no parallel map).

import type { DialogPopupProps } from "@orb/ui/dialog";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import type { DialogSubmit } from "#lib";
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
const MODAL_TRIGGER_PLACEMENTS = ["rail.end", "topbar.trail", "mobile-tab", "surface"] as const;
export type ModalTriggerPlacement = (typeof MODAL_TRIGGER_PLACEMENTS)[number];

/** A modal's self-declared trigger — its reachability + the affordance a deriving surface renders. The
 *  `order`/`mobile` axes are the SAME ones a `ChromeEntry` carries: a mapped trigger derives into a chrome
 *  entry, so its presentation axes are declared here rather than re-decided by whichever lens draws it. */
interface ModalTrigger {
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

/** What a committing modal's body hook returns. The host draws the footer from it, so a body that commits cannot
 *  leave out its submit or draw a footer of its own. */
export interface ModalCommit {
  /** The body, which the host wraps in the dialog's form so Enter submits it. */
  readonly content: ReactNode;
  readonly submit: DialogSubmit;
  /** Controls that act on the body without committing it, led into the footer before Cancel. */
  readonly footerLead?: ReactNode;
}

/** A modal as ONE definition. `body` is a real feature-owned render, a commit (`{ useCommit }`, a hook the host calls in
 *  a component keyed by the modal id, whose submit the host draws as Cancel and the submit), or the DECLARED-PLANNED
 *  arm (`{ planned: "<reason>" }`) — mirror SectionDefinition O1; a placeholder body is unspellable. */
export type ModalDefinition = {
  readonly id: ModalSlotId;
  /** The dialog heading (a noun, e.g. "Theme") — distinct from `trigger.label` (the affordance's
   *  action verb, e.g. "Switch theme"); intentionally different, not a desync. */
  readonly title: string;
  readonly trigger: ModalTrigger;
  /** Feature-owned cleanup that must run when shell chrome dismisses the modal. Component unmount
   *  cleanup is not equivalent: React Strict Mode probes it while the modal is still logically open. */
  readonly onClose?: () => void;
  readonly body: (() => ReactElement) | { readonly useCommit: () => ModalCommit } | { readonly planned: string };
} & (
  | {
      /** The width of a centered dialog. */
      readonly size?: DialogPopupProps["size"];
      readonly presentation?: "dialog";
    }
  | {
      readonly size?: never;
      readonly presentation: "drawer";
    }
);
