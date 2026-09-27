// The gallery dialog's upload door: pick or drop images, each one uploaded through the shared asset upload
// (kind `gallery`) and then added to this character's gallery. The dropzone's own line names a refused type
// or an oversize file; a server refusal names the file here. An add failure speaks through its own toast.

import type { CharacterId } from "@orb/kit/ids";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC, useUploadAsset, useUploadCaps } from "#data";
import { useAddToGallery } from "../hooks/use-character-gallery.ts";

/** The accepted vocabulary — the picker filter and the dropzone's own per-file gate. */
const GALLERY_UPLOAD_ACCEPT = "image/*";

export function GalleryUploadZone({ characterId, characterName }: { readonly characterId: CharacterId; readonly characterName: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upload = useUploadAsset();
  const caps = useUploadCaps();
  const add = useAddToGallery({ trpc, invalidation });
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState(false);
  const [refused, setRefused] = useState<readonly string[]>([]);

  // One file at a time, in the order picked: the gallery lists them by the time each one was added.
  const receive = async ({ accepted }: FileDropzoneResult): Promise<void> => {
    if (accepted.length === 0) {
      return;
    }
    setBusy(true);
    setLanded(false);
    setRefused([]);
    const notUploaded: string[] = [];
    for (const file of accepted) {
      // @orb-waive caught-failure-ownership(catch): a refused upload is named in the `refused` line this zone renders. Ends if that line stops rendering.
      try {
        const stored = await upload(file, "gallery");
        // A failed add is reported by useAddToGallery's own errorToast; the next file still uploads.
        await add.mutateAsync({ assetId: stored.assetId, subjectCharacterId: characterId }).catch(() => undefined);
      } catch {
        notUploaded.push(file.name);
      }
    }
    setRefused(notUploaded);
    setLanded(notUploaded.length < accepted.length);
    setBusy(false);
  };

  return (
    <Stack gap="tight">
      <FileDropzone
        accept={GALLERY_UPLOAD_ACCEPT}
        disabled={busy}
        instructions={`Drop images here to add them to ${characterName}'s gallery, or click to upload`}
        loading={busy}
        maxSizeBytes={caps.image}
        multiple={true}
        onFilesSelected={(result): void => void receive(result)}
        success={landed}
      />
      {refused.length === 0 ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          Couldn't upload {refused.join(", ")}.
        </Text>
      )}
    </Stack>
  );
}
