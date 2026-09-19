// The composer's PENDING-ATTACHMENT strip (extracted from composer.tsx at the #317 video landing — the
// component-size cap): one thumb + remove button per picked file, image (CrossfadeImage) or video
// (BackgroundVideo first-frame/loop) by the FILE's mime. The object-URL lifecycle lives in
// `use-composer-attachments.ts`; this is render-only.

import { BackgroundVideo } from "@orb/ui/background-video";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Icon, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { cn, removeActionName } from "#lib";
import type { PendingAttachment } from "../hooks/use-composer-attachments.ts";
import { CHAT_TRACK } from "../lib/chat-track.ts";

const VIDEO_MIME_PREFIX = "video/";

function AttachmentPreview({ attachment, onRemove }: { readonly attachment: PendingAttachment; readonly onRemove: () => void }): ReactElement {
  const isVideo = attachment.file.type.startsWith(VIDEO_MIME_PREFIX);
  return (
    <Row gap="field" align="center" className="shrink-0" data-slot="composer-attachment">
      {isVideo ? (
        // A muted first-frame/loop thumb (#317) — BackgroundVideo bakes the policy (muted, no controls,
        // aria-hidden, reduced-motion stills to the first frame); the remove button carries the file name
        // for the accessibility tree, mirroring the image arm's alt.
        <BackgroundVideo src={attachment.url} className="size-16 rounded-base" />
      ) : (
        <CrossfadeImage src={attachment.url} alt={`Attachment preview: ${attachment.file.name}`} aspectRatio={1} fit="cover" className="size-16 rounded-base" />
      )}
      <Button type="button" intent="ghost" size="icon" aria-label={removeActionName(attachment.file.name)} onClick={onRemove} shape="pill">
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}

/** The pending-attachment strip: renders nothing when no files are picked. */
export function ComposerAttachmentStrip({
  attachments,
  onRemove,
}: {
  readonly attachments: readonly PendingAttachment[];
  readonly onRemove: (index: number) => void;
}): ReactElement | null {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="composer-attachments" className={cn(CHAT_TRACK, "flex-wrap")}>
      {attachments.map((attachment, index) => (
        <AttachmentPreview key={attachment.url} attachment={attachment} onRemove={(): void => onRemove(index)} />
      ))}
    </Row>
  );
}
