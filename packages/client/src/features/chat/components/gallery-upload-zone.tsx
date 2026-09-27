// The gallery dialog's upload door: pick or drop images, each one uploaded through the shared asset upload
// (kind `gallery`) and then added to this character's gallery. A file counts as landed only once both steps
// pass. Every refusal of a batch is said on the dropzone's one error line, and each batch starts clean.

import type { CharacterId } from "@orb/kit/ids";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { ReactElement, Ref } from "react";
import { useState } from "react";
import { UploadRefusedError, useInvalidation, useTRPC, useUploadAsset, useUploadCaps } from "#data";
import { useAddToGallery } from "../hooks/use-character-gallery.ts";

/** The accepted vocabulary — the picker filter and the dropzone's own per-file gate. */
const GALLERY_UPLOAD_ACCEPT = "image/*";

/** A file the upload route refused, with the server's own reason when it gave one. */
interface UploadRefusal {
  readonly name: string;
  readonly reason: string | null;
}

/** The files of one batch that did not reach the gallery, by the step that stopped them. */
interface Shortfall {
  /** The upload itself was refused: nothing was stored. */
  readonly notUploaded: readonly UploadRefusal[];
  /** Stored, but the gallery add failed: the asset has no delete verb, so it stays in the uploads. */
  readonly notAdded: readonly string[];
}

const NO_SHORTFALL: Shortfall = { notUploaded: [], notAdded: [] };

/** How far a running batch has got: `done` files settled of `total`. */
interface BatchProgress {
  readonly done: number;
  readonly total: number;
}

/** The zone's own refusals, or `undefined` when every file landed. */
function shortfallLine({ notUploaded, notAdded }: Shortfall, characterName: string): string | undefined {
  const parts: string[] = [];
  const unexplained = notUploaded.filter((refusal) => refusal.reason === null).map((refusal) => refusal.name);
  if (unexplained.length > 0) {
    parts.push(`Couldn't upload ${unexplained.join(", ")}.`);
  }
  for (const { name, reason } of notUploaded) {
    if (reason !== null) {
      parts.push(`Couldn't upload ${name}: ${reason}.`);
    }
  }
  if (notAdded.length > 0) {
    const verb = notAdded.length === 1 ? "It stays" : "They stay";
    parts.push(`${notAdded.join(", ")} uploaded but couldn't join ${characterName}'s gallery. ${verb} in your uploads.`);
  }
  return parts.length === 0 ? undefined : parts.join(" ");
}

interface GalleryUploadZoneProps {
  readonly characterId: CharacterId;
  readonly characterName: string;
  /** The dropzone's file input, so another door (the add-picker's "Upload instead") can open its chooser. */
  readonly inputRef: Ref<HTMLInputElement>;
}

export function GalleryUploadZone({ characterId, characterName, inputRef }: GalleryUploadZoneProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const upload = useUploadAsset();
  const caps = useUploadCaps();
  const add = useAddToGallery({ trpc, invalidation });
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [landed, setLanded] = useState(false);
  const [shortfall, setShortfall] = useState<Shortfall>(NO_SHORTFALL);

  /** Upload then add one file: the refusal that stopped it, or `null` when it joined the gallery. */
  const landOne = async (file: File): Promise<{ readonly step: keyof Shortfall; readonly reason: string | null } | null> => {
    let assetId: Awaited<ReturnType<typeof upload>>["assetId"];
    // @orb-waive caught-failure-ownership(error): a refused upload is named on the dropzone's error line (`notUploaded`), with the server's reason when it gave one. Ends if that line stops rendering.
    try {
      assetId = (await upload(file, "gallery")).assetId;
    } catch (error) {
      return { step: "notUploaded", reason: error instanceof UploadRefusedError ? error.reason : null };
    }
    // @orb-waive caught-failure-ownership(catch): a failed add is named on the dropzone's error line (`notAdded`); the mutation carries no toast. Ends if that line stops rendering.
    try {
      await add.mutateAsync({ assetId, subjectCharacterId: characterId });
    } catch {
      return { step: "notAdded", reason: null };
    }
    return null;
  };

  // One file at a time, in the order picked: the gallery lists them by the time each one was added. Every batch
  // clears the last one's outcome first, even a batch the dropzone refused outright.
  const receive = async ({ accepted }: FileDropzoneResult): Promise<void> => {
    setLanded(false);
    setShortfall(NO_SHORTFALL);
    if (accepted.length === 0) {
      return;
    }
    const notUploaded: UploadRefusal[] = [];
    const notAdded: string[] = [];
    for (const [index, file] of accepted.entries()) {
      setProgress({ done: index, total: accepted.length });
      const refusal = await landOne(file);
      if (refusal?.step === "notUploaded") {
        notUploaded.push({ name: file.name, reason: refusal.reason });
      } else if (refusal?.step === "notAdded") {
        notAdded.push(file.name);
      }
    }
    setShortfall({ notUploaded, notAdded });
    setLanded(notUploaded.length + notAdded.length < accepted.length);
    setProgress(null);
  };

  const instructions =
    progress === null
      ? `Drop images here to add them to ${characterName}'s gallery, or click to upload`
      : `Uploading ${String(progress.done + 1)} of ${String(progress.total)}…`;
  return (
    <FileDropzone
      accept={GALLERY_UPLOAD_ACCEPT}
      error={shortfallLine(shortfall, characterName)}
      instructions={instructions}
      loading={progress !== null}
      maxSizeBytes={caps.image}
      multiple={true}
      onFilesSelected={(result): void => void receive(result)}
      ref={inputRef}
      success={landed}
    />
  );
}
