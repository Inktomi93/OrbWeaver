// Bound avatar-upload field — useBoundField<AssetId | null>() binding a FileDropzone (pick) + Avatar
// (preview) pair. `upload` is injected, never imported: forms/ may reach state/+lib/, never data/ — the
// consuming feature binds the real uploadAsset pre-bound to its AssetKind at composition.

import type { StoredAsset } from "@orb/contracts/assets";
import { blobUrl } from "@orb/contracts/assets";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { AssetId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { CircleUser, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { useBoundField } from "./use-bound-field.ts";

export interface AvatarUploadFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** Upload one picked file, returning its `StoredAsset` identity. INJECTED — see the file header. */
  readonly upload: (file: File) => Promise<StoredAsset>;
  /** The bound `assetId`'s CURRENTLY KNOWN hash (e.g. the loaded entity's `avatarHash`) — preview-only,
   *  never round-tripped through form state (only `assetId` is the saved value). `null`/omitted ⇒ no
   *  existing avatar (a fresh create). Superseded the instant a new upload completes. */
  readonly initialHash?: string | null;
  readonly disabled?: boolean;
  /** The client pre-check byte ceiling. forms/ can't reach `#data`, so the served image cap is INJECTED
   *  (like `upload`) — the consuming feature passes `useUploadCaps().image`. Omitted ⇒ the contract route
   *  cap (never a third invented number); the server re-caps + magic-checks regardless. */
  readonly maxBytes?: number;
}

/** Bound avatar-upload field: `<Field>`-wrapped `<Avatar>` preview + `<FileDropzone>` picker. Upload
 *  failure surfaces inline (the `Field` error slot); a mid-upload/just-succeeded state rides the
 *  dropzone's own 8-state `loading`/`success` props — this field holds no separate spinner. */
export function AvatarUploadField(props: AvatarUploadFieldProps): ReactElement {
  const { upload, initialHash = null, disabled = false, maxBytes = ASSET_UPLOAD_MAX_BYTES } = props;
  const { field, fieldProps } = useBoundField<AssetId | null>(props);
  const [previewHash, setPreviewHash] = useState<string | null>(initialHash);
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
      const stored = await upload(file);
      field.handleChange(stored.assetId);
      setPreviewHash(stored.hash);
      setSuccess(true);
    } catch {
      setUploadError("Upload failed — try again.");
    } finally {
      setLoading(false);
    }
  }

  const error = uploadError ?? fieldProps.error;
  return (
    <Field {...fieldProps} error={error}>
      <Row gap="field" align="center">
        <Avatar size="lg" fallbackDelay={0} {...(previewHash === null ? {} : { src: blobUrl(previewHash) })}>
          <Icon icon={CircleUser} size="lg" />
        </Avatar>
        <FileDropzone
          accept="image/*"
          maxSizeBytes={maxBytes}
          loading={loading}
          success={success}
          disabled={disabled}
          onFilesSelected={handleFilesSelected}
          onBlur={field.handleBlur}
        />
      </Row>
    </Field>
  );
}
