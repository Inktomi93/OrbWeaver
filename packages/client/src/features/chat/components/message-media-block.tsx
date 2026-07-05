// The `media` content block renderer (D44 §12.3) — routes an image / native audio / video block through
// the gated `@orb/ui` `<MessageMedia>` (asset-vs-external dispatch, external click-to-load gate, autoplay-
// off + controls-on for untrusted A/V, broken-media fallback) and, for image/video, a click-to-zoom
// `<Lightbox>`. Own `useState` for the zoom (a leaf component, so the windowed list keeps it Compiler-
// memoized; the lightbox open flag is ephemeral per-row UI, not hoisted).
//
// TWO SEAMS, one live one pre-wired (born-compliant — the render arm lands before the producer, §12.4):
//   • EXTERNAL src (LLM `![](https://…)` / imported card media) — LIVE. Gated by the resolved
//     `forbidExternalMedia` (`allowExternal`), never auto-loading a third-party fetch (the load itself is
//     the tracking-pixel/exfil — D44 §12.3).
//   • ASSET src (`asset:<id>` — own upload) — PRE-WIRED SEAM awaiting the assetId→URL resolver + composer
//     attach (#67). `<MessageMedia>` needs a fetchable URL for an asset, and no client asset-URL resolver
//     exists yet; rather than a broken `<img>`, render a typed placeholder. When #67 lands the resolver,
//     this arm swaps to `<MessageMedia src={{ kind: "asset", url }} …>` with no other change.

import type { MessageContentBlock } from "@orb/contracts/chat";
import { Lightbox } from "@orb/ui/lightbox";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";

type MediaBlock = Extract<MessageContentBlock, { kind: "media" }>;

export interface MessageMediaBlockProps {
  readonly block: MediaBlock;
  /** The resolved external-media gate (D44 §12.3): false ⇒ external sources show the click-to-load
   *  placeholder and issue NO network request. Ignored for asset sources (own origin). */
  readonly allowExternal: boolean;
}

export function MessageMediaBlock({ block, allowExternal }: MessageMediaBlockProps): ReactElement {
  const [zoomOpen, setZoomOpen] = useState(false);

  // Pre-wired asset seam (#67) — see file header.
  if (block.src.kind === "asset") {
    return (
      <Text as="span" size="label" tone="muted" data-slot="message-media-asset-pending">
        [image]
      </Text>
    );
  }

  const src = { kind: "external", url: block.src.url } as const;
  // Lightbox is image/video only (audio has no zoom); `null` ⇒ no zoom affordance for audio.
  const zoomMedia = block.media === "audio" ? null : block.media;

  return (
    <>
      <MessageMedia
        src={src}
        media={block.media}
        alt={block.alt}
        {...(block.dims === undefined ? {} : { dims: block.dims })}
        allowExternal={allowExternal}
        {...(zoomMedia === null ? {} : { onActivate: () => setZoomOpen(true) })}
      />
      {zoomMedia === null ? null : (
        <Lightbox
          open={zoomOpen}
          onOpenChange={setZoomOpen}
          src={src}
          media={zoomMedia}
          alt={block.alt}
          allowExternal={allowExternal}
        />
      )}
    </>
  );
}
