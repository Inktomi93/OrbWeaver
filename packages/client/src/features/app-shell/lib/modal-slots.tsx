// MODAL_SLOTS — the id-paired bodies for every rail/topbar/avatar-triggered modal (UI-Arch §4.1;
// the §11.5 registry-pairing keystone). Typed `Record<ModalSlotId, ModalDef>`, so a modal id that
// exists in the rail (rail-slots.ts) with no body here is a `tsc` error, and a body with no trigger
// is caught by the rail-slots pairing test — the pair can never silently drift ("the panel won't
// open" shipped as green in neo). Every body is a SectionPlaceholder until its real surface lands.

import type { ReactElement } from "react";
import type { ModalSlotId } from "#state";
import { SectionPlaceholder } from "../components/section-placeholder";

export interface ModalDef {
  /** The dialog heading (labels the popup for AT). */
  readonly title: string;
  /** The modal body — rendered inside the shell's one <Dialog> when this id is open. */
  readonly render: () => ReactElement;
}

export const MODAL_SLOTS: Record<ModalSlotId, ModalDef> = {
  theme: {
    title: "Theme",
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Theme"
        description="Palette switching lands with the D44 theme editor."
      />
    ),
  },
  settings: {
    title: "Settings",
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Settings"
        description="App + user settings land with the settings feature."
      />
    ),
  },
  account: {
    title: "Account",
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Account"
        description="Your profile + sign-out land with the auth feature."
      />
    ),
  },
  command: {
    title: "Jump to…",
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Command palette"
        description="⌘K quick-jump lands with the command feature."
      />
    ),
  },
};
