// MODAL_SLOTS — the id-paired bodies for every rail/topbar/avatar-triggered modal (UI-Arch §4.1;
// the §11.5 registry-pairing keystone). Typed `Record<ModalSlotId, ModalDef>`, so a modal id that
// exists in the rail (rail-slots.ts) with no body here is a `tsc` error, and a body with no trigger
// is caught by the `registry-pairing` gate + its companion test — the pair can never silently drift
// ("the panel won't open" shipped as green in neo).
//
// PLACEHOLDER HONESTY (D62 gate `modal-body-not-placeholder`, design-enforcement §3.2): a body that
// still renders `<SectionPlaceholder>` MUST carry `placeholder: true`. The gate flags any entry whose
// `render` returns a SectionPlaceholder WITHOUT the flag — so a placeholder shipped silently (theme /
// command / account sat as sparkles for weeks in neo) becomes a visible, greppable, counted state.
// When a real surface is route-composed over a slot (via `AppShellProps.modals`), drop the flag here.

import type { ReactElement } from "react";
import type { ModalSlotId } from "#state";
import { SectionPlaceholder } from "../components/section-placeholder";

export interface ModalDef {
  /** The dialog heading (labels the popup for AT). */
  readonly title: string;
  /** `true` when `render` is still an honest SectionPlaceholder (not a real surface) — enforced by the
   *  `modal-body-not-placeholder` gate. A route-composed real body drops this flag. */
  readonly placeholder?: boolean;
  /** The modal body — rendered inside the shell's one <Dialog> when this id is open. */
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
        description="Your profile + sign-out land with the auth feature."
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
};
