// MODAL_SLOTS — the id-paired bodies for every rail/topbar/avatar-triggered modal, typed
// Record<ModalSlotId, ModalDef> so a missing body/trigger is a tsc error or caught by the pairing gate.
// A body still rendering <SectionPlaceholder> must carry `placeholder: true` (enforced by a gate); drop
// the flag once a real surface is route-composed over the slot.

import type { DialogPopupProps } from "@orb/ui/dialog";
import type { ReactElement } from "react";
import type { ModalSlotId } from "#state";
import { SectionPlaceholder } from "../components/section-placeholder";

export interface ModalDef {
  readonly title: string;
  /** A centered `dialog` (default) or a bottom `drawer` sheet — ModalHost picks the component off this. */
  readonly presentation?: "dialog" | "drawer";
  /** The Dialog width/presentation variant. Ignored for `presentation: "drawer"`. */
  readonly size?: DialogPopupProps["size"];
  /** `true` when `render` is still an honest SectionPlaceholder — enforced by a gate. */
  readonly placeholder?: boolean;
  readonly render: () => ReactElement;
}

export const MODAL_SLOTS: Record<ModalSlotId, ModalDef> = {
  theme: {
    title: "Theme",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Theme"
        description="Palette switching lands with the D44 theme editor."
      />
    ),
  },
  settings: {
    title: "Settings",
    size: "xl",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Settings"
        description="App + user settings land with the settings feature."
      />
    ),
  },
  account: {
    title: "Account",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Account"
        description="Your identity and sign-out — route-composed from the auth feature."
      />
    ),
  },
  command: {
    title: "Jump to…",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Command palette"
        description="⌘K quick-jump lands with the command feature."
      />
    ),
  },
  newChat: {
    title: "New chat",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="New chat"
        description="Pick a character to start a chat — the picker lands with the chat feature."
      />
    ),
  },
  // Route-composed (not statically imported here) so this DOM-free lib doesn't drag browser components into the node types-program via the pairing test's import.
  you: {
    title: "You",
    presentation: "drawer",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="You"
        description="Account, settings, theme, and the rest of your sections live here."
      />
    ),
  },
};
