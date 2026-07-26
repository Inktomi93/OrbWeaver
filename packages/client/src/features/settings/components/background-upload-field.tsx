// The own-upload background control (PD-131). Reuses the avatar-upload MECHANISM — `<FileDropzone>` picker
// + `<Avatar>` preview + the ONE `uploadAsset` seam (bound to the `background` AssetKind) — but persists
// BOTH halves of the stored asset: `onUploaded` hands the caller the full `StoredAsset` so the appearance
// form can write `backgroundAssetId` (GC roots by it) AND `backgroundAssetHash` (the sync URL resolver
// reads it). A bound single-field avatar widget can't express that two-field write, so this is its sibling.

import type { StoredAsset } from "@orb/contracts/assets";
import { blobUrl } from "@orb/contracts/assets";
import { Avatar } from "@orb/ui/avatar";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { uploadAsset, useUploadCaps } from "#data";

export interface BackgroundUploadFieldProps {
  /** The currently-persisted `backgroundAssetHash` (preview source); `""` ⇒ nothing uploaded yet. */
  readonly currentHash: string;
  /** Called with the stored asset the instant an upload completes — the caller persists id + hash. */
  readonly onUploaded: (stored: StoredAsset) => void;
}

/** Pick → `uploadAsset(file, "background")` → hand the full `StoredAsset` up. Upload failure surfaces
 *  inline in the `Field` error slot; the dropzone's own `loading`/`success` states cover the in-flight UX. */
export function BackgroundUploadField({ currentHash, onUploaded }: BackgroundUploadFieldProps): ReactElement {
  // Client-side pre-check ceiling — the SERVED image cap; the server re-caps + magic-checks regardless.
  const maxBackgroundBytes = useUploadCaps().image;
  const [previewHash, setPreviewHash] = useState<string>(currentHash);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFilesSelected({ accepted }: FileDropzoneResult): Promise<void> {
    const file = accepted[0];
    if (file === undefined) {
      return;
    }
    setLoading(true);
    setUploadError(null);
    try {
      const stored = await uploadAsset(file, "background");
      onUploaded(stored);
      setPreviewHash(stored.hash);
      setSuccess(true);
    } catch {
      setUploadError("Upload failed — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label="Uploaded image" error={uploadError} name="backgroundAssetUpload">
      <Row gap="field" align="center">
        <Avatar size="lg" fallbackDelay={0} {...(previewHash === "" ? {} : { src: blobUrl(previewHash) })}>
          <Icon icon={ImagePlus} size="lg" />
        </Avatar>
        <FileDropzone accept="image/*" maxSizeBytes={maxBackgroundBytes} loading={loading} success={success} onFilesSelected={handleFilesSelected} />
      </Row>
    </Field>
  );
}
