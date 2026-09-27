// The gallery dialog's upload door: pick or drop images, each one uploaded through the shared asset upload
// (kind `gallery`) and then added to this character's gallery. A file counts as landed only once both steps
// pass; every other file is named on this zone's one error line, and the dropzone's own line names a refused type.

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

/** The files of one batch that did not reach the gallery, by the step that stopped them. */
interface Shortfall {
  /** The upload itself was refused: nothing was stored. */
  readonly notUploaded: readonly string[];
  /** Stored, but the gallery add failed: the asset has no delete verb, so it stays in the uploads. */
  readonly notAdded: readonly string[];
}

const NO_SHORTFALL: Shortfall = { notUploaded: [], notAdded: [] };

/** The zone's one error line, or `null` when every file landed. */
function shortfallLine({ notUploaded, notAdded }: Shortfall, characterName: string): string | null {
  const parts: string[] = [];
  if (notUploaded.length > 0) {
    parts.push(`Couldn't upload ${notUploaded.join(", ")}.`);
  }
  if (notAdded.length > 0) {
    const verb = notAdded.length === 1 ? "It stays" : "They stay";
    parts.push(`${notAdded.join(", ")} uploaded but couldn't join ${characterName}'s gallery. ${verb} in your uploads.`);
  }
  return parts.length === 0 ? null : parts.join(" ");
}

export function GalleryUploadZone({ characterId, characterName }: { readonly characterId: CharacterId; readonly characterName: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upload = useUploadAsset();
  const caps = useUploadCaps();
  const add = useAddToGallery({ trpc, invalidation });
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState(false);
  const [shortfall, setShortfall] = useState<Shortfall>(NO_SHORTFALL);

  /** Upload then add one file; the step that failed, or `null` when it joined the gallery. */
  const landOne = async (file: File): Promise<keyof Shortfall | null> => {
    let assetId: Awaited<ReturnType<typeof upload>>["assetId"];
    // @orb-waive caught-failure-ownership(catch): a refused upload is named on the zone's error line (`notUploaded`). Ends if that line stops rendering.
    try {
      assetId = (await upload(file, "gallery")).assetId;
    } catch {
      return "notUploaded";
    }
    // @orb-waive caught-failure-ownership(catch): a failed add is named on the zone's error line (`notAdded`); the mutation carries no toast. Ends if that line stops rendering.
    try {
      await add.mutateAsync({ assetId, subjectCharacterId: characterId });
    } catch {
      return "notAdded";
    }
    return null;
  };

  // One file at a time, in the order picked: the gallery lists them by the time each one was added.
  const receive = async ({ accepted }: FileDropzoneResult): Promise<void> => {
    if (accepted.length === 0) {
      return;
    }
    setBusy(true);
    setLanded(false);
    setShortfall(NO_SHORTFALL);
    const notUploaded: string[] = [];
    const notAdded: string[] = [];
    for (const file of accepted) {
      const failedAt = await landOne(file);
      if (failedAt === "notUploaded") {
        notUploaded.push(file.name);
      } else if (failedAt === "notAdded") {
        notAdded.push(file.name);
      }
    }
    setShortfall({ notUploaded, notAdded });
    setLanded(notUploaded.length + notAdded.length < accepted.length);
    setBusy(false);
  };

  const errorLine = shortfallLine(shortfall, characterName);
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
      {errorLine === null ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          {errorLine}
        </Text>
      )}
    </Stack>
  );
}
