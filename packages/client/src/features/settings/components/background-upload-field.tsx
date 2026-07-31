// The own-upload background control (PD-131). Reuses the avatar-upload MECHANISM — `<FileDropzone>` picker
// + `<Avatar>` preview + the ONE `uploadAsset` seam (bound to the `background` AssetKind) — but hands the
// caller a whole `BackgroundLibraryEntry` (BG-D) rather than the bare `StoredAsset`: the appearance form
// appends it to `appearance.backgroundLibrary` AND selects it live (assetId — GC roots by it · assetHash —
// the sync URL resolver reads it · mime — BG-V's `<video>` layer branch). A bound single-field avatar widget
// can't express that multi-field write, so this is its sibling. Owner ruling (AU-9, 2026-07-31): an upload
// SAVES to the library exactly like the URL twin (`ExternalBackgroundField`), so both ways in feed the one
// library the carried-background picker and `/setbackground <name>` read.
//
// The entry is minted HERE because the two halves live in different places: `uploadAsset` returns the stored
// id/hash, while `mime` + the display `name` are only on the picked `File`. `entryId` is a client-minted
// blob-row id (`crypto.randomUUID()` — the documented shape for this field, the `regex.scripts[].id`
// precedent); `provenanceUrl` stays absent — an own-upload was never fetched from anywhere.

import { blobUrl } from "@orb/contracts/assets";
import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import { Avatar } from "@orb/ui/avatar";
import { Field } from "@orb/ui/field";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { uploadAsset, useUploadCaps } from "#data";

/** A human name for the entry, from the file name minus its extension (the server `deriveName` twin for the
 *  URL arm — same fallback, so a library row reads the same whichever way it came in). */
function deriveName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
  return base.length > 0 ? base : "Background";
}

export interface BackgroundUploadFieldProps {
  /** The currently-persisted `backgroundAssetHash` (preview source); `""` ⇒ nothing uploaded yet. */
  readonly currentHash: string;
  /** Called with the ready library entry the instant an upload completes — the caller persists it (append
   *  to the library + select as live), the SAME shape the URL arm hands up. */
  readonly onUploaded: (entry: BackgroundLibraryEntry) => void;
}

/** Pick → `uploadAsset(file, "background")` → hand a ready `BackgroundLibraryEntry` up. Upload failure
 *  surfaces inline in the `Field` error slot; the dropzone's `loading`/`success` states cover the in-flight UX. */
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
      onUploaded({
        entryId: globalThis.crypto.randomUUID(),
        assetId: stored.assetId,
        assetHash: stored.hash,
        // Best-effort from the picked file (blank for a type-less pick ⇒ the image layer, the documented
        // degrade); the SERVER is the real arbiter — it magic-checks the bytes on the way in.
        mime: file.type,
        name: deriveName(file.name),
      });
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
