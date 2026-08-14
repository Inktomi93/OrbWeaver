// The IN-APP RE-AUTH modal (staleness-and-session-freshness.md §4.4 rung 1; owner fork F2 — "in-app modal,
// cache preserved", the hard redirect surviving only as rung 2). ONE co-located definition
// (client-architecture-lockdown.md §6d), `surface`-placed: it has no chrome affordance because no human
// opens it — the recovery ladder does, via `openModal("reauth")`.
//
// WHAT MAKES IT WORTH BUILDING: the old belt's `location.assign("/login")` destroyed everything in memory
// to fix a cookie. An expired local session over a warm shell now costs a password, not a reload — the
// query cache, the open chat, the composer draft and the scroll position all survive, and the ladder's
// resume rung re-reads identity + every user root behind the modal instead of re-fetching the world.
//
// THE FROZEN SHELL IS THE MUTATION FREEZE. The modal is a real dialog over the app: while it is open the
// user cannot reach a control, so no mutation can be issued against a dead cookie. That is a stronger
// guarantee than a flag nobody checks, and it costs no cross-cutting seam.
//
// DISMISSAL IS A VERDICT, NOT A NO-OP. Closing the dialog means "I'm not signing back in", so the unmount
// reports `dismissed` and the ladder falls through to rung 2 (interactive login). Leaving a user on a
// frozen shell with a dead session would be the dishonest arm — it is the exact defect this design exists
// to kill, wearing a nicer hat.

import { KeyRound } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { ReauthForm } from "../components/reauth-form.tsx";

export const reauthModal: ModalDefinition = {
  id: "reauth",
  title: "Session expired",
  size: "sm",
  // `surface`: opened by `openModal("reauth")` from the recovery ladder's binding, never by a rail/topbar
  // affordance — a "sign in again" button on a live session would be nonsense chrome.
  trigger: { placement: "surface", label: "Sign in again", icon: KeyRound },
  body: (): ReturnType<typeof ReauthForm> => <ReauthForm />,
};
