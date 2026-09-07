// CT kit: drive a REAL drag-and-drop of files onto a target, the way an owner drops a character card
// from the file manager. `setInputFiles` only exercises the PICKER feeder — it can never catch a broken
// drop path (it was exactly that blind spot that let a dropzone ship where a dropped card did nothing:
// the file rode `dataTransfer.files` and was thrown away). Every dropzone CT drives BOTH feeders through
// this helper so the two can't drift again.
//
// The `DataTransfer` is built INSIDE the page (a `File` can't cross the Node↔browser boundary) and handed
// to `dispatchEvent` as a handle; the dragenter/dragover pair precedes the drop because that is the real
// browser sequence a dropzone's highlight state depends on.

import type { Locator } from "@playwright/test";

/** One dropped file, described in CT-serializable terms (the real `File` is constructed in-page). */
export interface DroppedFileSpec {
  readonly name: string;
  readonly mimeType: string;
  readonly content: string;
}

/** Dispatch dragenter → dragover → drop carrying `files` at `target`. */
export async function dropFiles(target: Locator, files: readonly DroppedFileSpec[]): Promise<void> {
  const dataTransfer = await target.page().evaluateHandle((specs: readonly DroppedFileSpec[]) => {
    const transfer = new DataTransfer();
    for (const spec of specs) {
      transfer.items.add(new File([spec.content], spec.name, { type: spec.mimeType }));
    }
    return transfer;
  }, files);
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}
