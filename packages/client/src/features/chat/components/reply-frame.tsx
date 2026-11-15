// One run of a styled reply drawn in ONE routed card frame (D354): a display script's own markup made this row
// styled, and the row's tier is the sandboxed one, so the reply renders with its own CSS behind the frame's
// boundary. Nothing styled reaches the main document.
//
// THE ONE IMPORTER of `@orb/ui/frame-markdown` (policy `ui-frame-markdown-frame-only`), whose output keeps raw HTML
// unsanitized: the body below is rendered to a string for the frame document and never mounted in this one.
//
// THE FRAME DRAWS ONLY ON THE ROUTED DELIVERY. While the frame document builds and the mint is pending, the run shows
// `held`: its prose, with every HTML block a forming chip that carries none of the template's bytes. When the frame
// cannot come (no room, a refused mint, a handle lost twice, or scripts stopped for taking the reader's focus), it
// shows the inert `fallback`. The srcdoc floor is script-dead, so it could neither measure the reply's height nor hand
// a link to the host, and a reply must not become a clipped box with dead links. Once routed, the frame loads with no height or paint behind the held run, and replaces
// it only when its document reports its first height, so the reader never sees an empty frame while it loads, however
// long that takes. The run takes the whole measure in every state
// (FILLS_MEASURE): the frame's document cannot size the bubble around it, and a body that hugged its text would make
// the swap a width jump.
//
// A link clicked inside the frame reaches the host through `SandboxFrame.onLink` (sender checked, address vetted,
// off the app's origin, a live user activation and a click in this frame required) and opens only through the
// confirm below. An open confirm keeps the address it shows, and Open opens exactly that string: a frame that
// posts again cannot change it. A Cancel only closes the confirm; the frame's next links raise it again, paced by
// `reply-link-pace.ts`, so a scripted frame cannot raise it again and again.
//
// A HANDLE THAT IS GONE (expired, or evicted under store pressure) loads the server's miss notice, which says so.
// The frame then mints again once; a second miss renders the inert fallback, never the notice in place of the reply.

import { FrameMarkdown, useFrameDocument } from "@orb/ui/frame-markdown";
import { Stack } from "@orb/ui/layout";
import { FILLS_MEASURE } from "@orb/ui/lib";
import { resolveFrameReplyLook, SandboxFrame, useSandboxTheme } from "@orb/ui/sandbox-frame";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { useCardFrameMint } from "#data";
import { REPLY_FRAME_UNNAMED_TITLE, REPLY_LINK_CONFIRM_DESCRIPTION, REPLY_LINK_CONFIRM_LABEL, REPLY_LINK_CONFIRM_TITLE } from "../lib/reply-frame-names.ts";
import { replyLinkWaitMs } from "../lib/reply-link-pace.ts";
import type { FrameReplySegment } from "../lib/reply-parts.ts";
import type { CardOrigin } from "./card-block.tsx";

export interface ReplyFrameProps {
  readonly segments: readonly FrameReplySegment[];
  readonly colorQuotes: boolean;
  /** The room and speaker the reply was written in: the mint's policy selector. Absent ⇒ no frame, the fallback. */
  readonly cardOrigin: CardOrigin | undefined;
  /** The frame's accessible name: the speaking character's name. */
  readonly speakerName: string | undefined;
  /** The run while its frame is on the way: its prose, with each HTML block held as a forming chip. */
  readonly held: ReactNode;
  /** The inert rendering of the same run, shown whenever the frame cannot draw it. */
  readonly fallback: ReactNode;
}

const BUBBLE_SLOT = "message-bubble";
const LINK_TARGET = "_blank";
const LINK_FEATURES = "noreferrer";

function bodySegment(segment: FrameReplySegment, index: number, colorQuotes: boolean): ReactElement {
  if (segment.kind === "card") {
    // biome-ignore lint/security/noDangerouslySetInnerHtml: static markup for the sandboxed frame document only; this tree is rendered to a string, never mounted.
    return <div key={index} dangerouslySetInnerHTML={{ __html: segment.html }} />;
  }
  const markdown = <FrameMarkdown colorQuotes={colorQuotes}>{segment.markdown}</FrameMarkdown>;
  return segment.tokens === undefined ? (
    <div key={index}>{markdown}</div>
  ) : (
    <ThemeScope key={index} tokens={segment.tokens}>
      {markdown}
    </ThemeScope>
  );
}

// The frame document's body: the bubble slot the transcript's reading typography keys on, then each run in order.
function replyBody(segments: readonly FrameReplySegment[], colorQuotes: boolean): ReactElement {
  return (
    <div data-slot={BUBBLE_SLOT} data-frame-reply="">
      <Stack gap="row">{segments.map((segment, index) => bodySegment(segment, index, colorQuotes))}</Stack>
    </div>
  );
}

// Which body the run shows: the frame, the held run while the frame is on the way, or the inert run when it cannot come.
const DELIVERIES = ["routed", "held", "fallback"] as const;
type Delivery = (typeof DELIVERIES)[number];

function deliveryOf(input: {
  readonly routed: boolean;
  readonly framedable: boolean;
  readonly documentFailed: boolean;
  readonly mintRefused: boolean;
  readonly lost: boolean;
}): Delivery {
  if (input.routed) {
    return "routed";
  }
  return !input.framedable || input.documentFailed || input.mintRefused || input.lost ? "fallback" : "held";
}

export function ReplyFrame({ segments, colorQuotes, cardOrigin, speakerName, held, fallback }: ReplyFrameProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const sandbox = useSandboxTheme();
  // The sandbox theme is in the key, so a theme flip, a custom theme or a text scale reads the page's look again.
  const framed = useFrameDocument(
    JSON.stringify([segments, colorQuotes, sandbox]),
    () => replyBody(segments, colorQuotes),
    (html) => (host.current === null ? undefined : { html, look: resolveFrameReplyLook(host.current, html) }),
  );
  const built = framed.state === "ready" ? framed.value : undefined;
  const [attempt, setAttempt] = useState(0);
  const [lost, setLost] = useState(false);
  const mint = useCardFrameMint(
    cardOrigin === undefined || built === undefined
      ? undefined
      : {
          ...cardOrigin,
          html: built.html,
          css: built.look.css,
          // The frame's base rule paints from the sandbox slice, which the page's own token set does not name.
          themeTokens: { ...built.look.themeTokens, ...sandbox.themeTokens },
          styleTokens: sandbox.styleTokens,
          fontFamily: sandbox.fontFamily,
          rootAttributes: built.look.rootAttributes,
        },
    attempt,
  );
  const routed = mint.state === "routed" && !lost;
  const delivery = deliveryOf({
    routed,
    framedable: cardOrigin !== undefined,
    documentFailed: framed.state === "failed",
    mintRefused: built !== undefined && mint.state === "floor",
    lost,
  });
  const unframed = delivery === "held" ? held : fallback;
  const [pendingLink, setPendingLink] = useState<string | undefined>(undefined);
  const [waitingLink, setWaitingLink] = useState<string | undefined>(undefined);
  const [cancels, setCancels] = useState(0);
  // When this frame's next link may raise the confirm, on the `performance.now()` clock; set by a Cancel.
  const linksReadyAt = useRef(0);
  // Set by Open and read by the close that follows it, so only a Cancel counts against the frame's links.
  const opened = useRef(false);

  const requestLink = (url: string): void => {
    if (pendingLink !== undefined) {
      return;
    }
    if (performance.now() >= linksReadyAt.current) {
      setPendingLink(url);
    } else {
      // The newest request wins: the reader's latest click is the link they want.
      setWaitingLink(url);
    }
  };

  // The newest link that arrived inside the wait raises its confirm when the wait ends: paced, never dropped.
  useEffect(() => {
    if (waitingLink === undefined || pendingLink !== undefined) {
      return;
    }
    const timer = setTimeout(
      () => {
        setPendingLink(waitingLink);
        setWaitingLink(undefined);
      },
      Math.max(0, linksReadyAt.current - performance.now()),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [waitingLink, pendingLink]);

  return (
    <Stack ref={host} {...FILLS_MEASURE} tabIndex={-1} data-slot="reply-frame" data-delivery={delivery}>
      {mint.state === "routed" && !lost ? (
        <SandboxFrame
          src={mint.url}
          html=""
          title={speakerName === undefined || speakerName === "" ? REPLY_FRAME_UNNAMED_TITLE : speakerName}
          holds="reply"
          onLink={requestLink}
          onMissing={(): void => {
            if (attempt === 0) {
              setAttempt(1);
            } else {
              setLost(true);
            }
          }}
          pending={held}
          onScriptsStopped={(): void => {
            setLost(true);
          }}
        />
      ) : (
        unframed
      )}
      {pendingLink === undefined ? null : (
        <ConfirmDialog
          title={REPLY_LINK_CONFIRM_TITLE}
          description={REPLY_LINK_CONFIRM_DESCRIPTION}
          body={pendingLink}
          confirmLabel={REPLY_LINK_CONFIRM_LABEL}
          confirmTone="primary"
          open={true}
          // Focus returns to the reply's own stop in the app, never into the frame: the frame's focus gate would send a
          // return into it back as unasked, and the reader re-enters the frame by a press or a Tab like any other time.
          finalFocus={(): boolean => {
            host.current?.focus({ preventScroll: true });
            return false;
          }}
          onOpenChange={(open): void => {
            if (!open) {
              const next = opened.current ? 0 : cancels + 1;
              linksReadyAt.current = performance.now() + replyLinkWaitMs(next);
              setCancels(next);
              opened.current = false;
              setPendingLink(undefined);
            }
          }}
          onConfirm={(): void => {
            opened.current = true;
            window.open(pendingLink, LINK_TARGET, LINK_FEATURES);
          }}
        />
      )}
    </Stack>
  );
}
