// The one link hand-off for a routed frame: a chat card, a styled reply, and the rpg archive's card. A link clicked
// inside the frame reaches the host through `SandboxFrame.onLink` (sender checked, address vetted, off the app's origin, a live user activation and a click in that
// frame required) and opens only through the confirm below. An open confirm keeps the address it shows, and Open opens
// exactly that string: a frame that posts again cannot change it. A Cancel only closes the confirm; the frame's next links
// raise it again, paced by `framed-link-pace.ts`, so a scripted frame cannot raise it again and again.
//
// Focus returns to the landing the request named, the frame's own stop in the app, never into the frame: the frame's focus
// gate would send a return into it back as unasked, and the reader re-enters the frame by a press or a Tab like any other
// time.

import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { FRAMED_LINK_CONFIRM_DESCRIPTION, FRAMED_LINK_CONFIRM_LABEL, FRAMED_LINK_CONFIRM_TITLE } from "./framed-link-names.ts";
import { framedLinkWaitMs } from "./framed-link-pace.ts";

const LINK_TARGET = "_blank";
const LINK_FEATURES = "noreferrer";

interface LinkRequest {
  readonly url: string;
  /** Where focus lands when the confirm closes. */
  readonly landing: HTMLElement | null;
}

export interface FramedLinkConfirm {
  /** `SandboxFrame.onLink`, with the app-side element focus returns to. */
  readonly requestLink: (url: string, landing: HTMLElement | null) => void;
  /** The open confirm, or `null`; render it beside the frame. */
  readonly confirm: ReactElement | null;
}

export function useFramedLinkConfirm(): FramedLinkConfirm {
  const [pending, setPending] = useState<LinkRequest | undefined>(undefined);
  const [waiting, setWaiting] = useState<LinkRequest | undefined>(undefined);
  const [cancels, setCancels] = useState(0);
  // When this frame's next link may raise the confirm, on the `performance.now()` clock; set by a Cancel.
  const linksReadyAt = useRef(0);
  // Set by Open and read by the close that follows it, so only a Cancel counts against the frame's links.
  const opened = useRef(false);

  const requestLink = (url: string, landing: HTMLElement | null): void => {
    if (pending !== undefined) {
      return;
    }
    if (performance.now() >= linksReadyAt.current) {
      setPending({ url, landing });
    } else {
      // The newest request wins: the reader's latest click is the link they want.
      setWaiting({ url, landing });
    }
  };

  // The newest link that arrived inside the wait raises its confirm when the wait ends: paced, never dropped.
  useEffect(() => {
    if (waiting === undefined || pending !== undefined) {
      return;
    }
    const timer = setTimeout(
      () => {
        setPending(waiting);
        setWaiting(undefined);
      },
      Math.max(0, linksReadyAt.current - performance.now()),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [waiting, pending]);

  const confirm =
    pending === undefined ? null : (
      <ConfirmDialog
        title={FRAMED_LINK_CONFIRM_TITLE}
        description={FRAMED_LINK_CONFIRM_DESCRIPTION}
        body={pending.url}
        confirmLabel={FRAMED_LINK_CONFIRM_LABEL}
        confirmTone="primary"
        open={true}
        finalFocus={(): boolean => {
          pending.landing?.focus({ preventScroll: true });
          return false;
        }}
        onOpenChange={(open): void => {
          if (!open) {
            const next = opened.current ? 0 : cancels + 1;
            linksReadyAt.current = performance.now() + framedLinkWaitMs(next);
            setCancels(next);
            opened.current = false;
            setPending(undefined);
          }
        }}
        onConfirm={(): void => {
          opened.current = true;
          window.open(pending.url, LINK_TARGET, LINK_FEATURES);
        }}
      />
    );
  return { requestLink, confirm };
}
