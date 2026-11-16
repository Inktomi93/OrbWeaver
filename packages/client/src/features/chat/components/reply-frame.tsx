// One run of a styled reply drawn in ONE routed card frame (D354): a display script's own markup made this row
// styled, and the row's tier is the sandboxed one, so the reply renders with its own CSS behind the frame's
// boundary. Nothing styled reaches the main document.
//
// THE ONE IMPORTER of `@orb/ui/frame-markdown` (policy `ui-frame-markdown-frame-only`), whose output keeps raw HTML
// unsanitized: the body below is rendered to a string for the frame document and never mounted in this one.
//
// THE FRAME DRAWS ONLY ON THE ROUTED DELIVERY. While the frame document builds and the mint is pending, the run shows
// `held`: its prose, with every HTML block a forming chip that carries none of the template's bytes. When the frame
// cannot come (no room, a refused mint, a handle lost twice, a frame fallen to its floor for taking the reader's focus
// or for a document that loaded and never reported), it
// shows the inert `fallback`. The srcdoc floor is script-dead, so it could neither measure the reply's height nor hand
// a link to the host, and a reply must not become a clipped box with dead links. Once routed, the frame loads with no height or paint behind the held run, and replaces
// it only when its document reports its first height, so the reader never sees an empty frame while it loads, however
// long that takes. The run takes the whole measure in every state
// (FILLS_MEASURE): the frame's document cannot size the bubble around it, and a body that hugged its text would make
// the swap a width jump.
//
// A link clicked inside the frame opens only through the shared confirm (`packages/client/src/components/framed-link-confirm.tsx`), the one a
// framed card uses too; focus returns to this run's own stop.
//
// A HANDLE THAT IS GONE (expired, or evicted under store pressure) loads the server's miss notice, which says so.
// The frame then mints again once (`useCardFrame`); a second miss renders the inert fallback, never the notice in
// place of the reply.

import type { FrameStyleSheet } from "@orb/kit/content";
import { FrameMarkdown, useFrameDocument } from "@orb/ui/frame-markdown";
import { Stack } from "@orb/ui/layout";
import { FILLS_MEASURE } from "@orb/ui/lib";
import { resolveFrameReplyLook, SandboxFrame, useSandboxTheme } from "@orb/ui/sandbox-frame";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { useFramedLinkConfirm } from "#components";
import { useCardFrame } from "#data";
import { REPLY_FRAME_UNNAMED_TITLE } from "../lib/reply-frame-names.ts";
import type { FrameReplySegment, ReplyRunStyles } from "../lib/reply-parts.ts";
import type { CardOrigin } from "./card-block.tsx";

export interface ReplyFrameProps {
  readonly segments: readonly FrameReplySegment[];
  /** The stylesheets of the reply's other frame runs, which this run's document carries too. */
  readonly styles: ReplyRunStyles;
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

// The reply's other runs' stylesheets, each a bare style element: one applies wherever it sits and needs no box, so
// nothing the reply's CSS does to a box can show it. Only the text and `media` are carried (`frameStyleElements`).
// THE TEXT CAN HOLD NO CLOSE HTML READS: the reader ends a body at the first `</style` HTML would end it at, so a
// carried copy can never end its element early and let what follows run in another run's document.
function runStyles(sheets: readonly FrameStyleSheet[], side: string): readonly ReactElement[] {
  return sheets.map((sheet, index) => (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: the same reply's own stylesheet text, for the sandboxed frame document only; this tree is rendered to a string, never mounted.
    <style key={`${side}-${String(index)}`} media={sheet.media} dangerouslySetInnerHTML={{ __html: sheet.css }} />
  ));
}

// The frame document's body: the bubble slot the transcript's reading typography keys on, then each run in order,
// between the stylesheets of the reply's runs before and after this one.
function replyBody(segments: readonly FrameReplySegment[], styles: ReplyRunStyles, colorQuotes: boolean): ReactElement {
  return (
    <div data-slot={BUBBLE_SLOT} data-frame-reply="">
      {runStyles(styles.sheets.slice(0, styles.own.start), "before")}
      <Stack gap="row">{segments.map((segment, index) => bodySegment(segment, index, colorQuotes))}</Stack>
      {runStyles(styles.sheets.slice(styles.own.end), "after")}
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
}): Delivery {
  if (input.routed) {
    return "routed";
  }
  return !input.framedable || input.documentFailed || input.mintRefused ? "fallback" : "held";
}

export function ReplyFrame({ segments, styles, colorQuotes, cardOrigin, speakerName, held, fallback }: ReplyFrameProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const sandbox = useSandboxTheme();
  // The sandbox theme is in the key, so a theme flip, a custom theme or a text scale reads the page's look again.
  const framed = useFrameDocument(
    JSON.stringify([segments, styles, colorQuotes, sandbox]),
    () => replyBody(segments, styles, colorQuotes),
    (html) => (host.current === null ? undefined : { html, look: resolveFrameReplyLook(host.current, html) }),
  );
  const built = framed.state === "ready" ? framed.value : undefined;
  const frame = useCardFrame(
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
  );
  const { mint } = frame;
  const delivery = deliveryOf({
    routed: mint.state === "routed",
    framedable: cardOrigin !== undefined,
    documentFailed: framed.state === "failed",
    // A frame given up on (lost twice, or fallen to its floor) reads as the floor too.
    mintRefused: built !== undefined && mint.state === "floor",
  });
  const unframed = delivery === "held" ? held : fallback;
  const links = useFramedLinkConfirm();

  return (
    <Stack ref={host} {...FILLS_MEASURE} tabIndex={-1} data-slot="reply-frame" data-delivery={delivery}>
      {mint.state === "routed" ? (
        <SandboxFrame
          src={mint.url}
          html=""
          title={speakerName === undefined || speakerName === "" ? REPLY_FRAME_UNNAMED_TITLE : speakerName}
          holds="reply"
          onLink={(url): void => {
            links.requestLink(url, host.current);
          }}
          onMissing={frame.onMissing}
          pending={held}
          onFloor={frame.giveUp}
        />
      ) : (
        unframed
      )}
      {links.confirm}
    </Stack>
  );
}
