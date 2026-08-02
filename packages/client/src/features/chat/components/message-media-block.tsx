// The media content block renderer: routes an image/audio/video block through the gated MessageMedia
// (asset-vs-external dispatch, external click-to-load gate) and, for image/video, a click-to-zoom
// Lightbox. Asset src (asset:<id>) resolves via the row's AttachmentUrlProvider (own origin, always
// renders); external src is gated by allowExternal, never auto-loading a third-party fetch.

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
        <Lightbox open={zoomOpen} onOpenChange={setZoomOpen} src={src} media={zoomMedia} alt={block.alt} allowExternal={allowExternal} />
      )}
    </>
  );
}

function AssetMediaBlock({ block, assetId }: { readonly block: MediaBlock; readonly assetId: AssetId }): ReactElement {
  const url = useAttachmentUrl(assetId);
  if (url === undefined) {
    return (
      <Text as="span" voice="gloss" data-slot="message-media-asset-pending">
        [image]
      </Text>
    );
  }
  return <MediaWithZoom block={block} src={{ kind: "asset", url }} allowExternal={true} />;
}

export interface MessageMediaBlockProps {
  readonly block: MediaBlock;
  /** False ⇒ external sources show the click-to-load placeholder and issue no network request. */
  readonly allowExternal: boolean;
}

export function MessageMediaBlock({ block, allowExternal }: MessageMediaBlockProps): ReactElement {
  if (block.src.kind === "asset") {
    return <AssetMediaBlock block={block} assetId={block.src.assetId} />;
  }
  return <MediaWithZoom block={block} src={{ kind: "external", url: block.src.url }} allowExternal={allowExternal} />;
}
