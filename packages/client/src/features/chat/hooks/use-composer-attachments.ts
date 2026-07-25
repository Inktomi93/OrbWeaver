// The composer's PENDING-ATTACHMENT strip as its own hook — the object-URL lifecycle (mint on pick, revoke
// on remove / clear / unmount) is a self-contained concern with nothing to say about sending, so it lives
// beside the composer rather than inside it. Extracted when slash dispatch landed and the composer body
// crossed the cognitive-complexity ceiling; the behavior is unchanged, line for line.

import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { useEffect, useRef, useState } from "react";

export interface PendingAttachment {
  readonly file: File;
  readonly url: string;
}

export function useComposerAttachments(): {
  readonly attachments: readonly PendingAttachment[];
  readonly addFiles: (result: FileDropzoneResult) => void;
  readonly removeAttachment: (index: number) => void;
  readonly clearAttachments: () => void;
} {
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([]);
  // Mirrors `attachments` for the unmount-cleanup effect below — a cleanup closure would otherwise
  // revoke a stale list instead of the current one at actual unmount.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  });
  useEffect(
    () => (): void => {
      for (const a of attachmentsRef.current) {
        URL.revokeObjectURL(a.url);
      }
    },
    [],
  );

  const clearAttachments = (): void =>
    setAttachments((prev) => {
      for (const a of prev) {
        URL.revokeObjectURL(a.url);
      }
      return [];
    });
  const addFiles = ({ accepted }: FileDropzoneResult): void =>
    setAttachments((prev) => [...prev, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  const removeAttachment = (index: number): void =>
    setAttachments((prev) => {
      const target = prev[index];
      if (target !== undefined) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((_, i) => i !== index);
    });

  return { attachments, addFiles, removeAttachment, clearAttachments };
}
