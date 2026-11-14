// The ONE notice→toast mapping: `Notify` (the impl-agnostic seam in `notify.ts`) expressed on the
// `@orb/ui/toast` manager. It lives BESIDE the seam rather than inside it so `notify.ts` keeps knowing
// nothing about the surface — this file is the only place in the client that names a toast field.
//
// It is a factory, not a bound singleton, because two composition roots build it: `main.tsx` (the app)
// and the CT story module that reproduces main.tsx's wiring. That duplication was real and had already
// started to drift — the story's hand-copied bind had no `warn` channel and no description/action/timeout
// mapping at all, so a CT could have gone green against a toast the app never renders.

import type { createToastManager } from "@orb/ui/toast";
import type { Notify, NotifyInput, NotifyNotice } from "./notify.ts";
import { toNotice } from "./notify.ts";

type ToastManager = ReturnType<typeof createToastManager>;

/** Base UI's default toast life is 5s — a TITLE-ONLY budget. A notice carrying a description ran to three
 *  wrapped lines in the measured case, and read-and-decide (plus reaching for an action button) does not
 *  fit in five seconds (side-eye INFRA-WARN-DEAF P2-2). Title-only notices keep the default. */
const DESCRIBED_NOTICE_TIMEOUT_MS = 12_000;

/** A persistent notice never auto-dismisses (Base UI's timeout 0); a described one gets the longer life; a title-only one keeps the default. */
function timeoutOf({ description, persistent }: NotifyNotice): number | undefined {
  if (persistent === true) {
    return 0;
  }
  return description === undefined ? undefined : DESCRIBED_NOTICE_TIMEOUT_MS;
}

/** Builds the toast-backed `Notify`. `type` is what the toast seal tints, glyphs and announces. It never sends Base UI's `priority`, which
 *  would add a second, hidden alert node beside the notice's own. */
export function createToastNotify(toastManager: ToastManager): Notify {
  function add(notice: NotifyInput, type: "success" | "warning" | "error" | undefined): void {
    const resolved = toNotice(notice);
    const { title, description, action } = resolved;
    // The user has acted on the notice, so the action dismisses it — after the handler runs, once, here for every caller.
    const id = toastManager.add({
      actionProps:
        action === undefined
          ? undefined
          : {
              children: action.label,
              onClick: (): void => {
                action.onClick();
                toastManager.close(id);
              },
            },
      description,
      timeout: timeoutOf(resolved),
      title,
      type,
    });
  }

  return {
    error: (notice): void => {
      add(notice, "error");
    },
    info: (notice): void => {
      add(notice, undefined);
    },
    success: (notice): void => {
      add(notice, "success");
    },
    warn: (notice): void => {
      add(notice, "warning");
    },
  };
}
