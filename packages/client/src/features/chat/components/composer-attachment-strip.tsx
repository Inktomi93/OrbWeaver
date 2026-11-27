// The composer's PENDING-ATTACHMENT strip (apart from composer.tsx): one thumb + remove button per picked file, image (CrossfadeImage) or video
// (BackgroundVideo first-frame/loop) by the FILE's mime. The object-URL lifecycle lives in
// `use-composer-attachments.ts`; this is render-only.

import { BackgroundVideo } from "@orb/ui/background-video";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Icon, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { removeActionName } from "@orb/ui/lib";
import type { ReactElement } from "react";
import type { PendingAttachment } from "../hooks/use-composer-attachments.ts";
import { Track } from "../lib/chat-track.tsx";

const VIDEO_MIME_PREFIX = "video/";

function AttachmentPreview({
  attachment,
  refused,
  onRemove,
}: {
  readonly attachment: PendingAttachment;
  /** The server refused this file on the last send. */
  readonly refused: boolean;
  readonly onRemove: () => void;
}): ReactElement {
  const isVideo = attachment.file.type.startsWith(VIDEO_MIME_PREFIX);
  return (
    <Row gap="field" align="center" className="shrink-0" data-refused={refused ? "" : undefined} data-slot="composer-attachment">
      {isVideo ? (
        // A muted first-frame/loop thumb (#317) — BackgroundVideo bakes the policy (muted, no controls,
        // aria-hidden, reduced-motion stills to the first frame); the remove button carries the file name
        // for the accessibility tree, mirroring the image arm's alt.
        <BackgroundVideo src={attachment.url} rounded="base" size="hero" />
      ) : (
        <CrossfadeImage src={attachment.url} alt={`Attachment preview: ${attachment.file.name}`} aspectRatio={1} fit="cover" rounded="base" size="hero" />
      )}
      {refused ? (
        <Badge size="sm" tone="destructive">
          Can&apos;t send
        </Badge>
      ) : null}
      <Button type="button" variant="ghost" square={true} aria-label={removeActionName(attachment.file.name)} onClick={onRemove} shape="pill">
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}

/** The pending-attachment strip: renders nothing when no files are picked. */
export function ComposerAttachmentStrip({
  attachments,
  refused,
  onRemove,
}: {
  readonly attachments: readonly PendingAttachment[];
  /** The file the server refused on the last send, marked on its tile. */
  readonly refused: File | null;
  readonly onRemove: (index: number) => void;
}): ReactElement | null {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <Track of={Row} track="composer" gap="field" align="center" data-slot="composer-attachments" wrap={true}>
      {attachments.map((attachment, index) => (
        <AttachmentPreview key={attachment.url} attachment={attachment} refused={attachment.file === refused} onRemove={(): void => onRemove(index)} />
      ))}
    </Track>
  );
}
