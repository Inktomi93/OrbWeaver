// The composer's shared attach triage (#376) — the gate the picker used to get for free from the OS file
// dialog's `accept` filter, made explicit so a drag-drop and a clipboard paste refuse exactly what the
// picker refuses. These pin the DECISION (which files pass, which refusal each rejected file earns) so the
// three gestures cannot drift; the CT pins the gestures themselves.

import type { UploadCaps } from "@orb/contracts/uploads";
import { describe } from "vitest";
import {
  ATTACH_MEDIA_ACCEPT,
  dropzoneRefusalMessage,
  isAttachableMedia,
  triageAttachFiles,
  unsupportedAttachMessage,
} from "../../../../../packages/client/src/features/chat/lib/attach-media.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const KIB = 1024;
// A deliberately ASYMMETRIC pair: the image ceiling is TIGHTER than the route ceiling (that is the whole
// point of the admin-tunable `maxImageBytes`), so a file between them must pass as video and fail as image.
// (databankUpload/importTotal belong to other routes and are deliberately absurd here — the triage must
// never reach for a cap that is not its own.)
const CAPS: UploadCaps = { assetUpload: 100 * KIB, image: 10 * KIB, databankUpload: 1, importTotal: 1 };

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("ATTACH_MEDIA_ACCEPT", () => {
  test("is derived from the same vocabulary the gate tests — the dialog filter cannot drift from the runtime gate", () => {
    expect(ATTACH_MEDIA_ACCEPT).toBe("image/*,video/mp4,video/webm");
    for (const type of ["video/mp4", "video/webm"]) {
      expect(ATTACH_MEDIA_ACCEPT).toContain(type);
      expect(isAttachableMedia(fileOf("clip", type, 1))).toBe(true);
    }
  });
});

describe("isAttachableMedia", () => {
  test("accepts every image family (animated gif rides image/* and is classified video-for-the-model server-side)", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]) {
      expect(isAttachableMedia(fileOf("pic", type, 1))).toBe(true);
    }
  });

  test("refuses a video container the upload boundary cannot magic-sniff, and refuses a typeless drop", () => {
    expect(isAttachableMedia(fileOf("clip.mov", "video/quicktime", 1))).toBe(false);
    expect(isAttachableMedia(fileOf("clip.mkv", "video/x-matroska", 1))).toBe(false);
    // A drag from some sources hands over a File with an empty `type` — refused honestly, never guessed at.
    expect(isAttachableMedia(fileOf("mystery", "", 1))).toBe(false);
  });
});

describe("triageAttachFiles", () => {
  test("keeps the accepted files in arrival order and refuses a non-media file by NAME", () => {
    const png = fileOf("cat.png", "image/png", KIB);
    const pdf = fileOf("resume.pdf", "application/pdf", KIB);
    const mp4 = fileOf("clip.mp4", "video/mp4", KIB);

    const { accepted, refusals } = triageAttachFiles([png, pdf, mp4], CAPS);

    expect(accepted).toEqual([png, mp4]);
    expect(refusals).toEqual([unsupportedAttachMessage(pdf)]);
    expect(refusals[0]).toContain("resume.pdf");
  });

  test("applies the TIGHTER image ceiling to images and the route ceiling to video (the asymmetry is the point)", () => {
    const between = 50 * KIB; // over `image`, under `assetUpload`
    const fatImage = fileOf("poster.png", "image/png", between);
    const fatVideo = fileOf("clip.mp4", "video/mp4", between);

    const { accepted, refusals } = triageAttachFiles([fatImage, fatVideo], CAPS);

    expect(accepted).toEqual([fatVideo]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("poster.png");
    expect(refusals[0]).toContain("exceeds");
  });

  test("refuses a video over the route ceiling too — the route cap is nobody's exemption", () => {
    const { accepted, refusals } = triageAttachFiles([fileOf("movie.webm", "video/webm", 200 * KIB)], CAPS);
    expect(accepted).toEqual([]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("movie.webm");
  });

  test("checks TYPE before size — a wrong-type file earns the type refusal, not a size one", () => {
    const { refusals } = triageAttachFiles([fileOf("archive.zip", "application/zip", 900 * KIB)], CAPS);
    expect(refusals).toEqual([unsupportedAttachMessage(fileOf("archive.zip", "application/zip", 0))]);
    expect(refusals[0]).not.toContain("exceeds");
  });

  test("dropzoneRefusalMessage speaks the SAME refusal the drop/paste gestures do (#423)", () => {
    // The ✨ picker's zone gates on `accept` itself now, so its type refusal must not degrade into a vaguer
    // line than the one the identical file earns when dropped.
    const wrongType = fileOf("resume.pdf", "application/pdf", KIB);
    expect(dropzoneRefusalMessage({ file: wrongType, reason: "type" }, CAPS.image)).toBe(unsupportedAttachMessage(wrongType));
    const oversize = fileOf("huge.png", "image/png", 90 * KIB);
    expect(dropzoneRefusalMessage({ file: oversize, reason: "size" }, CAPS.image)).toContain("huge.png");
    expect(dropzoneRefusalMessage({ file: oversize, reason: "size" }, CAPS.image)).toContain("exceeds");
  });

  test("never silently drops: every input file lands in exactly one of the two buckets", () => {
    const files = [
      fileOf("a.png", "image/png", KIB),
      fileOf("b.pdf", "application/pdf", KIB),
      fileOf("c.mp4", "video/mp4", KIB),
      fileOf("d.png", "image/png", 90 * KIB),
    ];
    const { accepted, refusals } = triageAttachFiles(files, CAPS);
    expect(accepted.length + refusals.length).toBe(files.length);
  });
});
