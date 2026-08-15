// Unit: `oversizeUploadMessage` (lib/upload-cap-check) — the client-side asset-upload size pre-check
// wired into the two FileTrigger avatar pickers (persona-panel-row, character-hero-band) that had NO
// size guard at all, reading `UploadCaps.assetUpload` (census #72 item 1: the field was served but
// never read).

import { oversizeUploadMessage } from "@orb/client/lib";
import { expect, test } from "../../support/fixtures.ts";

function fileOfSize(bytes: number): File {
  return new File([new Uint8Array(bytes)], "portrait.png", { type: "image/png" });
}

test("oversizeUploadMessage: a file at or under the cap is accepted (undefined)", () => {
  expect(oversizeUploadMessage(fileOfSize(100), 100)).toBeUndefined();
  expect(oversizeUploadMessage(fileOfSize(1), 100)).toBeUndefined();
});

test("oversizeUploadMessage: a file over the cap is rejected with a size-aware message", () => {
  const message = oversizeUploadMessage(fileOfSize(101), 100);
  expect(message).toBe("portrait.png exceeds the 100 B limit");
});
