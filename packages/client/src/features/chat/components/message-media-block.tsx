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
//   • ASSET src (`asset:<id>` — an upload by any PRESENT chat member) — LIVE (#67). The row's
//     `AttachmentUrlProvider` resolves the id → `blobUrl(hash)` (chat-scoped `assets.resolveChatBlobRefs`,
//     the co-participant render gate) and shares it over context; this arm reads it
//     via `useAttachmentUrl` and renders through the SAME gated `<MessageMedia src={{kind:"asset",url}}>` +
//     `<Lightbox>` as the external arm (own origin, so it renders directly — the D44 untrusted posture is for
//     EXTERNAL urls). Unresolved (provider-less mount, or still loading) → a typed placeholder, never a
//     broken `<img>`.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { AssetId } from "@orb/kit/ids";
import { Lightbox } from "@orb/ui/lightbox";
import type { MediaSource } from "@orb/ui/message-media";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useAttachmentUrl } from "../hooks/attachment-url-context";

type MediaBlock = Extract<MessageContentBlock, { kind: "media" }>;

/** The gated media + click-to-zoom lightbox, over an ALREADY-RESOLVED src (asset URL or external URL). Owns
 *  the ephemeral zoom flag (a leaf, so the windowed list keeps it Compiler-memoized). Shared by both arms. */
function MediaWithZoom({
  block,
  src,
  allowExternal,
}: {
  readonly block: MediaBlock;
  readonly src: MediaSource;
  readonly allowExternal: boolean;
}): ReactElement {
  const [zoomOpen, setZoomOpen] = useState(false);
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

// The ASSET arm (#67) — resolve `asset:<id>` → blobUrl(hash) via the row's AttachmentUrlProvider
// (chat-scoped assets.resolveChatBlobRefs, over context). Own origin, so it renders through the asset MediaWith-
// Zoom directly (allowExternal irrelevant). Unresolved (provider-less / still loading) → a typed placeholder,
// never a broken image.
function AssetMediaBlock({
  block,
  assetId,
}: {
  readonly block: MediaBlock;
  readonly assetId: AssetId;
}): ReactElement {
  const url = useAttachmentUrl(assetId);
  if (url === undefined) {
    return (
      <Text as="span" size="label" tone="muted" data-slot="message-media-asset-pending">
        [image]
      </Text>
    );
  }
  // asset origin: `allowExternal` is moot (the D44 gate is for external urls) — always renders.
  return <MediaWithZoom block={block} src={{ kind: "asset", url }} allowExternal={true} />;
}

export interface MessageMediaBlockProps {
  readonly block: MediaBlock;
  /** The resolved external-media gate (D44 §12.3): false ⇒ external sources show the click-to-load
   *  placeholder and issue NO network request. Ignored for asset sources (own origin). */
  readonly allowExternal: boolean;
}

export function MessageMediaBlock({ block, allowExternal }: MessageMediaBlockProps): ReactElement {
  // Asset src (#67) — resolved via the row's provider; own origin, so its own hook-bearing arm.
  if (block.src.kind === "asset") {
    return <AssetMediaBlock block={block} assetId={block.src.assetId} />;
  }
  return (
    <MediaWithZoom
      block={block}
      src={{ kind: "external", url: block.src.url }}
      allowExternal={allowExternal}
    />
  );
}
