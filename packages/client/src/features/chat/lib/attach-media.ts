// The composer's ONE attach vocabulary + per-file admissibility decision. Every attach entry point — the ✨
// menu's FileDropzone picker, a drag-drop onto the composer, a clipboard paste (#376) — funnels through
// `triageAttachFiles`, so the three gestures cannot drift in what they accept or how they refuse.
//
// It exists because the picker's `accept` attribute only filters the OS DIALOG. A drop and a paste hand the
// composer arbitrary bytes, so the type gate that was implicit in the dialog has to become explicit AND
// shared — a second hand-rolled accept list is the defect shape this module forecloses. The accept string
// the picker renders is DERIVED from the same tuple the predicate tests, so widening one widens both.
//
// The video vocabulary is the two containers the upload boundary's magic sniff verifies
// (`domain/assets/substrate/mime.ts` — mp4's ftyp box, webm's EBML header); animated gif rides `image/*` and
// is classified video-for-the-model at the server resolve seam (#317). Caps mirror the served `UploadCaps`:
// video rides the single-asset route ceiling alone, an image additionally clamps to the tighter
// admin-tunable image cap (`caps.image` is already `min(assetUpload, maxImageBytes)` — contracts/uploads).
// The server re-caps and magic-byte checks regardless; this is fail-fast honesty, never the trust boundary.

import type { UploadCaps } from "@orb/contracts/uploads";
import type { FileDropzoneRejection } from "@orb/ui/file-dropzone";
import { oversizeUploadMessage } from "#lib";

const IMAGE_MIME_PREFIX = "image/";
const VIDEO_MIME_PREFIX = "video/";
/** The video containers the upload boundary sniffs — the ONE list the accept string and the gate share. */
const ATTACHABLE_VIDEO_TYPES: readonly string[] = ["video/mp4", "video/webm"];

/** The picker's native `accept` filter, derived from the same vocabulary the drop/paste gate tests. */
export const ATTACH_MEDIA_ACCEPT = [`${IMAGE_MIME_PREFIX}*`, ...ATTACHABLE_VIDEO_TYPES].join(",");

/** The refusal a non-media file earns — names the file and the formats that WOULD work (never a silent drop).
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function unsupportedAttachMessage(file: File): string {
  return `${file.name} isn't an image or video — attach a PNG, JPG, WEBP, GIF, MP4 or WEBM`;
}

/**
 * The refusal line one `FileDropzone` rejection earns, in the SAME voice the drop and paste gestures use.
 * The ✨ picker's zone gates on `accept` and on the route cap itself (#423), so its rejections never reach
 * `triageAttachFiles` — without this mapping the picker would speak a different, vaguer refusal for the same
 * file, and its own inline error line is invisible (the zone renders `hidden` inside the menu).
 */
export function dropzoneRefusalMessage(rejection: FileDropzoneRejection, sizeCeiling: number): string {
  if (rejection.reason === "type") {
    return unsupportedAttachMessage(rejection.file);
  }
  return oversizeUploadMessage(rejection.file, sizeCeiling) ?? `${rejection.file.name} couldn't be attached`;
}

/** The refusal a drop/paste earns while the previous message is still in flight (the picker row is disabled
 *  in that window for the same reason: a mid-send attach is cleared by the send's own commit signal). */
export const ATTACH_BUSY_MESSAGE = "Wait for the message to send, then attach.";

/** True when `file` is an image of any family, or one of the two sniffed video containers.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function isAttachableMedia(file: File): boolean {
  return file.type.startsWith(IMAGE_MIME_PREFIX) || ATTACHABLE_VIDEO_TYPES.includes(file.type);
}

export interface AttachTriage {
  /** The files that may be attached, in the order they arrived. */
  readonly accepted: readonly File[];
  /** One ready-to-surface refusal line per rejected file — the caller warns with each. */
  readonly refusals: readonly string[];
}

/**
 * Splits one batch of candidate files into attachable and refused-with-a-reason. Type is checked first (the
 * refusal the user can do nothing about), then the byte ceiling that applies to that file's kind.
 */
export function triageAttachFiles(files: readonly File[], caps: UploadCaps): AttachTriage {
  const accepted: File[] = [];
  const refusals: string[] = [];
  for (const file of files) {
    if (!isAttachableMedia(file)) {
      refusals.push(unsupportedAttachMessage(file));
      continue;
    }
    const ceiling = file.type.startsWith(VIDEO_MIME_PREFIX) ? caps.assetUpload : caps.image;
    const oversize = oversizeUploadMessage(file, ceiling);
    if (oversize === undefined) {
      accepted.push(file);
    } else {
      refusals.push(oversize);
    }
  }
  return { accepted, refusals };
}
