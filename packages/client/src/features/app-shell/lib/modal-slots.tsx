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

import type { DialogPopupProps } from "@orb/ui/dialog";
import type { ReactElement } from "react";
import type { ModalSlotId } from "#state";
import { SectionPlaceholder } from "../components/section-placeholder";

export interface ModalDef {
  /** The dialog heading (labels the popup for AT). */
  readonly title: string;
  /** How this modal PRESENTS (L6/J12): a centered `dialog` (default) or a bottom `drawer` sheet (the
   *  mobile "You" sheet). ModalHost picks `@orb/ui/dialog` vs `@orb/ui/drawer` off this — the trigger↔
   *  body pairing + `openModal`/`closeModal` control are identical for both. */
  readonly presentation?: "dialog" | "drawer";
  /** The Dialog width/presentation variant (UIP-401). Defaults to the Dialog's own `md`; `full` is the
   *  full-bleed overlay (J11 settings). Presentation metadata of the MODAL, independent of whether the
   *  body is the placeholder or a route-composed real surface — so it lives on the def, not the body.
   *  Ignored for `presentation: "drawer"` (a bottom sheet has no width clamp). */
  readonly size?: DialogPopupProps["size"];
  /** `true` when `render` is still an honest SectionPlaceholder (not a real surface) — enforced by the
   *  `modal-body-not-placeholder` gate. A route-composed real body drops this flag. */
  readonly placeholder?: boolean;
  /** The modal body — rendered inside the shell's one <Dialog>/<Drawer> when this id is open. */
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
    // The settings overlay is a LARGE `xl` MODAL (the owner's call — a centered card over a blurred backdrop
    // that takes most of the screen, NOT edge-to-edge full-bleed): a left category nav + one scrolling
    // pane column. `size` is presentation metadata on the def; the route composes the real <SettingsShell>
    // body over this placeholder (home-page.tsx `settings` slot), so `placeholder: true` stays correct for
    // the static fallback that never runs when the route injects the real body.
    size: "xl",
    placeholder: true,
    render: (): ReactElement => (
      <SectionPlaceholder
        title="Settings"
        description="App + user settings land with the settings feature."
      />
    ),
  },
  // The quick identity card + sign-out (FINAL-Auth-Modes §7 P0). Route-composed over this placeholder
  // via `AppShellProps.modals` (home-page.tsx `account` slot → features/auth `<AccountSurface>`) — the
  // static render below is the honest fallback that never runs when the route injects the real body.
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
  // The new-chat character picker (J2). Route-composed over this placeholder via `AppShellProps.modals`
  // (home-page.tsx `newChat` slot) — the static render below is the honest fallback that never runs when
  // the route injects the real `<NewChatPicker>` body, so `placeholder: true` stays correct here.
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
  // The mobile "You" bottom sheet (L6/J12 · D62 P3). `presentation: "drawer"` makes ModalHost render it
  // as a bottom sheet (`@orb/ui/drawer`) instead of a centered Dialog. The real `<YouSheet>` body is
  // ROUTE-COMPOSED over this placeholder via `AppShellProps.modals` (home-page.tsx `you` slot) — the same
  // seam as settings/theme/newChat/command. Why route-inject a SHELL-tier body: statically importing a
  // browser component into this lib drags DOM source (`@orb/ui/list-row`'s `.click()`) into the DOM-less
  // node types-program via the pairing test's `modal-slots` import (test:types boundary) — the modals-prop
  // seam keeps this lib import-free of components, exactly why the 4 real bodies already use it. The static
  // render below is the honest fallback that never runs when the route injects the real body.
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
