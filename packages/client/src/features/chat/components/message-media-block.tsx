// The media content block renderer: routes an image/audio/video block through the gated MessageMedia
// (asset-vs-external dispatch, external click-to-load gate). An OWN-ORIGIN image opens the imagery DETAIL
// lightbox (provenance + edit + set-as-background B5) via the #state
// `openImageDetail` action (chat never imports imagery); video and any external/no-chat case keep the plain
// zoom Lightbox (an untrusted image we don't own has no provenance to read and no edit path). Asset src
// (asset:<id>) resolves via the row's AttachmentUrlProvider (own origin, always renders); external src is
// gated by allowExternal, never auto-loading a third-party fetch.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { AssetId } from "@orb/kit/ids";
import { Lightbox } from "@orb/ui/lightbox";
import type { MediaSource } from "@orb/ui/message-media";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { openImageDetail, useActiveChatId } from "#state";
import { useAttachmentUrl } from "../hooks/attachment-url-context.tsx";

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
        // #654: the ZOOM copy gets the same dims as the inline one — they are the same picture, and the
        // modal is where an unreserved pop-in is most visible.
        <Lightbox
          open={zoomOpen}
          onOpenChange={setZoomOpen}
          src={src}
          media={zoomMedia}
          alt={block.alt}
          {...(block.dims === undefined ? {} : { dims: block.dims })}
          allowExternal={allowExternal}
        />
      )}
    </>
  );
}

const VIDEO_MIME_PREFIX = "video/";

function AssetMediaBlock({ block, assetId }: { readonly block: MediaBlock; readonly assetId: AssetId }): ReactElement {
  const resolved = useAttachmentUrl(assetId);
  // The image only ever renders inside the OPEN thread, so at click time the active chat IS this image's
  // chat — pinned into the detail subject so a set-as-background write can't target a later-navigated room.
  const chatId = useActiveChatId();
  if (resolved === undefined) {
    return (
      <Text as="span" voice="gloss" data-slot="message-media-asset-pending">
        [image]
      </Text>
    );
  }
  // #317: the block projection is mime-blind (the span carries only the ref), so the ELEMENT pick happens
  // here, off the resolved asset's stored mime — an mp4/webm attachment renders the native <video> arm.
  // A gif keeps the <img> arm (browsers animate it natively; only the MODEL wire treats it as frames).
  const media = resolved.mime.startsWith(VIDEO_MIME_PREFIX) ? "video" : block.media;
  // #625: the block projection is also DIMENSION-blind (`contentSpansToBlocks` parses `asset:<id>` text and
  // has no row to read), so the reserving dims come off the RESOLVED asset. A block that carries its own
  // (a direct `buildBlock` consumer) still wins — the row is the producer closest to the content.
  const dims = block.dims ?? resolved.dims;
  // An own-origin IMAGE opens the imagery detail lightbox (provenance + edit + set-as-background); video —
  // and the null-chat fallback — keep the plain zoom Lightbox.
  if (media === "image" && chatId !== null) {
    return (
      <MessageMedia
        src={{ kind: "asset", url: resolved.url }}
        media="image"
        alt={block.alt}
        {...(dims === undefined ? {} : { dims })}
        allowExternal={true}
        // #654: the same dims ride into the DETAIL modal, so the enlarged copy reserves its box too — the
        // image reserved correctly inline and then popped in from 0×0 the moment you clicked it.
        onActivate={(): void => openImageDetail({ assetId, chatId, url: resolved.url, alt: block.alt, ...(dims === undefined ? {} : { dims }) })}
      />
    );
  }
  return <MediaWithZoom block={{ ...block, media, ...(dims === undefined ? {} : { dims }) }} src={{ kind: "asset", url: resolved.url }} allowExternal={true} />;
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
