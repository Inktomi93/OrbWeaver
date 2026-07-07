// Bound avatar-upload field — `useFieldContext<AssetId | null>()` binding a `FileDropzone` (pick) +
// `Avatar` (preview) pair. UNHOSTED this phase (#67 Phase 1) — no editor wires it yet; Phase 2's persona
// editor and the character lane are the first consumers (`FINAL-Persona-and-Immersive-Chat-Visuals.md`
// THE KEYSTONE DEPENDENCY).
//
// `upload` is INJECTED, never imported: `forms/` may reach `state/`+`lib/`, NEVER `data/` (UI-Arch client
// cake — a forms→data import would hard-couple every editor to the Query layer, dependency-cruiser
// `client-cake`). The consuming feature binds the real `uploadAsset` (`#data`) pre-bound to its
// `AssetKind` at composition — the same "`save` injected" seam `createSavedEntityForm` already uses.

import type { StoredAsset } from "@orb/contracts/assets";
import { blobUrl } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc/vite resolve CircleUser/Icon fine (the composer-wand.tsx precedent).
import { CircleUser, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

/** Client-side pre-check ceiling — mirrors the `FileDropzone` doc example's own avatar-size precedent. */
const MAX_AVATAR_BYTES = 20_000_000;

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
}

/** Bound avatar-upload field: `<Field>`-wrapped `<Avatar>` preview + `<FileDropzone>` picker. Upload
 *  failure surfaces inline (the `Field` error slot); a mid-upload/just-succeeded state rides the
 *  dropzone's own 8-state `loading`/`success` props — this field holds no separate spinner. */
export function AvatarUploadField({
  label,
  description,
  upload,
  initialHash = null,
  disabled = false,
}: AvatarUploadFieldProps): ReactElement {
  const field = useFieldContext<AssetId | null>();
  const fieldError = fieldErrorText(field.state.meta.errors);
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

  const error = uploadError ?? (field.state.meta.isTouched ? fieldError : null);
  return (
    <Field
      label={label}
      description={description}
      error={error}
      disabled={disabled}
      name={field.name}
    >
      <Row gap="field" align="center">
        <Avatar
          size="lg"
          fallbackDelay={0}
          {...(previewHash === null ? {} : { src: blobUrl(previewHash) })}
        >
          <Icon icon={CircleUser} size="lg" />
        </Avatar>
        <FileDropzone
          accept="image/*"
          maxSizeBytes={MAX_AVATAR_BYTES}
          loading={loading}
          success={success}
          disabled={disabled}
          onFilesSelected={handleFilesSelected}
        />
      </Row>
    </Field>
  );
}
