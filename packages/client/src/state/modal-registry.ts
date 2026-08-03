// The modal-registry contract (client-architecture-lockdown.md §6d) — the section-registry move applied
// to modals: ONE co-located definition per modal that SELF-DECLARES its trigger, assembled at the door
// (main.tsx). The rail/topbar/mobile-bar DERIVE their modal affordances from `trigger` (no parallel map).

import type { DialogPopupProps } from "@orb/ui/dialog";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalSlotId } from "./shell-store.ts";

/** WHERE a modal's trigger affordance lives — the rail/topbar/mobile-bar DERIVE from this (no parallel
 *  map). Extend the tuple to add a placement. The `rail.end`/`topbar.trail` names align with the chrome
 *  zones the deriving surfaces render into (`assemble-chrome.ts` maps them). `surface` = "my trigger lives
 *  inside a feature surface, opened by an explicit `openModal(id)` call" (new-chat, and the account modal —
 *  reached from INSIDE the persona identity widget's Account strip; the `avatar` pseudo-placement died at
 *  §E-5). `mobile-tab` = the mobile You sheet. */
export const MODAL_TRIGGER_PLACEMENTS = ["rail.end", "topbar.trail", "mobile-tab", "surface"] as const;
export type ModalTriggerPlacement = (typeof MODAL_TRIGGER_PLACEMENTS)[number];

/** A modal's self-declared trigger — its reachability + the affordance a deriving surface renders. */
export interface ModalTrigger {
  readonly placement: ModalTriggerPlacement;
  readonly label: string;
  readonly icon: LucideIcon;
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
  readonly body: (() => ReactElement) | { readonly planned: string };
}
