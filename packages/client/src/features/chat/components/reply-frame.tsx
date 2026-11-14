// One run of a styled reply drawn in ONE routed card frame (D294): a display script's own markup made this row
// styled, and the row's tier is the sandboxed one, so the reply renders with its own CSS behind the frame's
// boundary. Nothing styled reaches the main document.
//
// THE ONE IMPORTER of `@orb/ui/frame-markdown` (policy `ui-frame-markdown-frame-only`), whose output keeps raw HTML
// unsanitized: the body below is rendered to a string for the frame document and never mounted in this one.
//
// THE FRAME DRAWS ONLY ON THE ROUTED DELIVERY. Until the mint answers, and whenever it is refused, the run renders
// the inert `fallback`: the srcdoc floor is script-dead, so it could neither measure the reply's height nor hand a
// link to the host, and a reply must not become a clipped box with dead links. The frame takes the fallback's last
// measured height as its first height, so the swap does not jump the transcript before the frame measures itself.
//
// A link clicked inside the frame reaches the host through `SandboxFrame.onLink` (sender checked, address vetted,
// a live user activation required) and opens only through the confirm below.

import { FrameMarkdown, useFrameDocument } from "@orb/ui/frame-markdown";
import { Stack } from "@orb/ui/layout";
import { resolveFrameReplyLook, SandboxFrame, useSandboxTheme } from "@orb/ui/sandbox-frame";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { useCardFrameMint } from "#data";
import { REPLY_FRAME_UNNAMED_TITLE, REPLY_LINK_CONFIRM_DESCRIPTION, REPLY_LINK_CONFIRM_LABEL, REPLY_LINK_CONFIRM_TITLE } from "../lib/reply-frame-names.ts";
import type { FrameReplySegment } from "../lib/reply-parts.ts";
import type { CardOrigin } from "./card-block.tsx";

export interface ReplyFrameProps {
  readonly segments: readonly FrameReplySegment[];
  readonly colorQuotes: boolean;
  /** The room and speaker the reply was written in: the mint's policy selector. Absent ⇒ no frame, the fallback. */
  readonly cardOrigin: CardOrigin | undefined;
  /** The frame's accessible name: the speaking character's name. */
  readonly speakerName: string | undefined;
  /** The inert rendering of the same run, shown until the frame is routed and whenever it cannot be. */
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

export function ReplyFrame({ segments, colorQuotes, cardOrigin, speakerName, fallback }: ReplyFrameProps): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const sandbox = useSandboxTheme();
  // The sandbox theme is in the key, so a theme flip, a custom theme or a text scale reads the page's look again.
  const framed = useFrameDocument(
    JSON.stringify([segments, colorQuotes, sandbox]),
    () => replyBody(segments, colorQuotes),
    (html) => (host.current === null ? undefined : { html, look: resolveFrameReplyLook(host.current, html) }),
  );
  const built = framed.state === "ready" ? framed.value : undefined;
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
  );
  const routed = mint.state === "routed";
  const [fallbackPx, setFallbackPx] = useState<number | undefined>(undefined);
  const [pendingLink, setPendingLink] = useState<string | undefined>(undefined);

  // The fallback's height, kept while it shows, so the frame that replaces it starts at the same size.
  useEffect(() => {
    const element = host.current;
    if (routed || element === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setFallbackPx(Math.ceil(element.getBoundingClientRect().height));
    });
    observer.observe(element);
    return (): void => {
      observer.disconnect();
    };
  }, [routed]);

  return (
    <div ref={host} data-slot="reply-frame" data-delivery={routed ? "routed" : "fallback"}>
      {mint.state === "routed" ? (
        <SandboxFrame
          src={mint.url}
          html=""
          title={speakerName === undefined || speakerName === "" ? REPLY_FRAME_UNNAMED_TITLE : speakerName}
          holds="reply"
          onLink={setPendingLink}
          {...(fallbackPx === undefined ? {} : { heightPx: fallbackPx })}
        />
      ) : (
        fallback
      )}
      {pendingLink === undefined ? null : (
        <ConfirmDialog
          title={REPLY_LINK_CONFIRM_TITLE}
          description={REPLY_LINK_CONFIRM_DESCRIPTION}
          body={pendingLink}
          confirmLabel={REPLY_LINK_CONFIRM_LABEL}
          confirmTone="primary"
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setPendingLink(undefined);
            }
          }}
          onConfirm={(): void => {
            window.open(pendingLink, LINK_TARGET, LINK_FEATURES);
            setPendingLink(undefined);
          }}
        />
      )}
    </div>
  );
}
