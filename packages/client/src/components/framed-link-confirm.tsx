// The one link hand-off for a routed frame: a chat card, a styled reply, and the rpg archive's card. A link clicked
// inside the frame reaches the host through `SandboxFrame.onLink` (sender checked, address vetted, off the app's origin,
// a live user activation, and a frame the focus gate admitted) and opens only through the confirm below. A Cancel only
// closes the confirm; the frame's next links raise it again, paced by `framed-link-pace.ts`, so a scripted frame cannot
// raise it again and again.
//
// ONE PARSE, ONE TRUTH. The posted string is parsed once, here, with the URL parser, and the parsed `URL` is the only
// thing kept: the confirm shows its serialization and Open opens that same `href`. The frame's string is never shown or
// opened. An address the parser refuses, one that carries a user name or password, and one whose parsed scheme is not
// http, https or mailto raise nothing. A user name reads as a host (`https://bank.example@elsewhere.test`), and no
// framed link needs one.
//
// HOW AN ADDRESS SHOWS. The host sits on its own line as the parser serializes it: ASCII, with a non-ASCII label in its
// punycode form (`xn--…`), which is the name the browser resolves. Under it the whole `href`, also the parser's
// serialization, so every non-ASCII, bidi or control character in the path, query or fragment shows percent-encoded and
// cannot reorder or hide the text around it. Both lines wrap anywhere, so no part runs past the dialog at any width;
// the whole address scrolls inside its own region, so a long one cannot push the dialog's actions off the screen. The
// registrable domain is not marked: that needs the public suffix list, so the reader reads the whole host.
//
// MAIL. A `mailto:` link shows its address on the host line and says it opens the mail app. It is refused when its
// query names any header other than to, cc, bcc, subject and body: several mail clients take an `attach` or
// `attachment` header as a local file to attach, which would let a frame send the reader's files.
//
// Focus returns to the landing the request named, the frame's own stop in the app, never into the frame: the frame's
// focus gate would send a return into it back as unasked. A confirm the pace raised later, with no reader action,
// returns focus to the element the reader held when it opened, when that element is still on the page and outside
// every frame.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import {
  FRAMED_LINK_ADDRESS_NAME,
  FRAMED_LINK_CONFIRM_DESCRIPTION,
  FRAMED_LINK_CONFIRM_LABEL,
  FRAMED_LINK_CONFIRM_TITLE,
  FRAMED_LINK_PART_ATTRIBUTE,
  FRAMED_LINK_PARTS,
  FRAMED_MAIL_CONFIRM_DESCRIPTION,
  FRAMED_MAIL_CONFIRM_LABEL,
  FRAMED_MAIL_CONFIRM_TITLE,
} from "./framed-link-names.ts";
import { framedLinkWaitMs } from "./framed-link-pace.ts";

const LINK_TARGET = "_blank";
const LINK_FEATURES = "noreferrer";
const MAIL_HEADERS: ReadonlySet<string> = new Set(["to", "cc", "bcc", "subject", "body"]);

interface LinkTarget {
  readonly kind: "page" | "mail";
  readonly url: URL;
}

interface LinkRequest {
  readonly target: LinkTarget;
  /** Where focus lands when the confirm closes. */
  readonly landing: HTMLElement | null;
  /** For a confirm the pace raised later: the element focused when it opened. */
  readonly heldWhenRaised?: Element | null;
}

function linkTarget(posted: string): LinkTarget | undefined {
  const url = URL.parse(posted);
  if (url === null || url.username !== "" || url.password !== "") {
    return undefined;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { kind: "page", url };
  }
  const headers = [...url.searchParams.keys()];
  if (url.protocol === "mailto:" && url.pathname !== "" && headers.every((name) => MAIL_HEADERS.has(name.toLowerCase()))) {
    return { kind: "mail", url };
  }
  return undefined;
}

// An app element the reader can be handed back to: on the page, and not a frame, whose gate would refuse the return.
function returnable(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && !(element instanceof HTMLIFrameElement) && element !== document.body && element.isConnected;
}

function linkAddress(target: LinkTarget): ReactElement {
  const { url } = target;
  return (
    <Stack gap="tight">
      <Text
        voice="code"
        wrap="anywhere"
        dir="ltr"
        {...{ [FRAMED_LINK_PART_ATTRIBUTE]: target.kind === "mail" ? FRAMED_LINK_PARTS.mailbox : FRAMED_LINK_PARTS.host }}
      >
        {target.kind === "mail" ? url.pathname : url.host}
      </Text>
      <Text
        voice="datumMono"
        wrap="anywhere"
        dir="ltr"
        role="region"
        aria-label={FRAMED_LINK_ADDRESS_NAME}
        scroll="y"
        maxHeight="scrollSm"
        {...{ [FRAMED_LINK_PART_ATTRIBUTE]: FRAMED_LINK_PARTS.address }}
      >
        {url.href}
      </Text>
    </Stack>
  );
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

  const requestLink = (posted: string, landing: HTMLElement | null): void => {
    const requested = linkTarget(posted);
    if (pending !== undefined || requested === undefined) {
      return;
    }
    if (performance.now() >= linksReadyAt.current) {
      setPending({ target: requested, landing });
    } else {
      // The newest request wins: the reader's latest click is the link they want.
      setWaiting({ target: requested, landing });
    }
  };

  // The newest link that arrived inside the wait raises its confirm when the wait ends: paced, never dropped.
  useEffect(() => {
    if (waiting === undefined || pending !== undefined) {
      return;
    }
    const timer = setTimeout(
      () => {
        setPending({ ...waiting, heldWhenRaised: document.activeElement });
        setWaiting(undefined);
      },
      Math.max(0, linksReadyAt.current - performance.now()),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [waiting, pending]);

  if (pending === undefined) {
    return { requestLink, confirm: null };
  }
  const { target, heldWhenRaised } = pending;
  const mail = target.kind === "mail";
  const confirm = (
    <ConfirmDialog
      title={mail ? FRAMED_MAIL_CONFIRM_TITLE : FRAMED_LINK_CONFIRM_TITLE}
      description={mail ? FRAMED_MAIL_CONFIRM_DESCRIPTION : FRAMED_LINK_CONFIRM_DESCRIPTION}
      body={linkAddress(target)}
      confirmLabel={mail ? FRAMED_MAIL_CONFIRM_LABEL : FRAMED_LINK_CONFIRM_LABEL}
      confirmTone="primary"
      // The address region scrolls, so it is a tab stop ahead of the actions; Cancel keeps the first focus.
      focusCancel={true}
      open={true}
      finalFocus={(): boolean => {
        const back = returnable(heldWhenRaised) ? heldWhenRaised : pending.landing;
        back?.focus({ preventScroll: true });
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
        window.open(target.url.href, LINK_TARGET, LINK_FEATURES);
      }}
    />
  );
  return { requestLink, confirm };
}
