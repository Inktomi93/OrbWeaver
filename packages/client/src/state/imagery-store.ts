// The imagery INTENT store (D70 client commons B5) — the payload channel
// for the three content-triggered imagery modals (imagine · imageDetail · imageEdit), the newChatIntent
// posture applied to imagery: a launcher sets the subject + opens the modal slot, the modal body reads it,
// and the def's onClose clears it. The modals live at the shell (so they survive a virtualized message
// row's unmount); this store is how a chat-content click hands them WHICH image WITHOUT a #features import
// (§5.1 — cross-surface reach is a #state action, never a foreign front-door import). The three subjects are
// SEPARATE fields so the detail modal's onClose-clear never strands the edit modal, which reads its own.
// Ephemeral, never persisted (a reload never reopens a modal — the `openModal` transient posture).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";
import { openModal } from "./shell-store.ts";

/** The `/imagine` seed — the parsed slash args a fresh imagine modal opens with. `prompt` may be `""` (a
 *  bare `/imagine`, or a mode-only trigger like `/imagine you`); the modal resolves an extraction-mode
 *  prompt from the conversation via `extractPrompt` (the preview-before-spend surface). */
export interface ImagineSeed {
  readonly chatId: ChatId;
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
}

/** A generated image the detail/edit modals operate on: the `assetId` (the owner/host-scoped reads —
 *  `readProvenance`, `resolveBlobRefs` — key off it), the already-resolved blob `url` (so a modal renders it
 *  without re-resolving), its `alt`, and the `chatId` the image lives in — PINNED at open time from the
 *  media-block's `useActiveChatId` (a room image only renders inside the open thread, so at open time the
 *  active chat IS the image's chat) so a set-as-background write can never target a chat the viewer
 *  navigated to AFTER opening the modal (the modal is a shell-level singleton that outlives navigation). */
export interface ImageSubject {
  readonly assetId: AssetId;
  readonly chatId: ChatId;
  readonly url: string;
  readonly alt: string;
  /** The asset's stored pixel dimensions (#654), carried so a modal RESERVES the true box before the bytes
   *  arrive — `aspect-ratio` alone reserves nothing on a pre-load `<img>`, it lays out 0×0 and the whole
   *  modal reflows the instant it decodes. Every mint site reads them off the same wire the transcript does
   *  (`AssetBlobRef.width/height`, stored at upload). OPTIONAL because that wire is honestly nullable: a
   *  non-image, an unparseable header, or a row written before #625 has none, and the modal must still
   *  render — it just falls back to the primitive's placeholder aspect. */
  readonly dims?: { readonly w: number; readonly h: number };
}

interface ImageryState {
  readonly imagineSeed: ImagineSeed | undefined;
  readonly detailSubject: ImageSubject | undefined;
  readonly editSubject: ImageSubject | undefined;
}

const useImageryStore = createGatedStore<ImageryState>(
  "imagery",
  (): ImageryState => ({ imagineSeed: undefined, detailSubject: undefined, editSubject: undefined }),
);

/** Open the `/imagine` composer modal seeded with the parsed slash args (the preview-before-spend surface). */
export function openImagine(seed: ImagineSeed): void {
  useImageryStore.setState({ imagineSeed: seed }, false, "imagery/openImagine");
  openModal("imagine");
}
/** The `imagine` modal's onClose — drop the seed so a re-open never inherits a stale one. */
export function clearImagineSeed(): void {
  useImageryStore.setState({ imagineSeed: undefined }, false, "imagery/clearImagineSeed");
}

/** Open the image DETAIL lightbox (provenance + Edit + Set-as-background) for a room image. Also the landing
 *  after an edit (on the freshly-edited asset), so it clears any prior `editSubject` (the shell swaps the
 *  Dialog body in place, so the edit modal's own onClose does not fire on that transition). */
export function openImageDetail(subject: ImageSubject): void {
  useImageryStore.setState({ detailSubject: subject, editSubject: undefined }, false, "imagery/openImageDetail");
  openModal("imageDetail");
}
/** The `imageDetail` modal's onClose. */
export function clearDetailSubject(): void {
  useImageryStore.setState({ detailSubject: undefined }, false, "imagery/clearDetailSubject");
}

/** Open the image EDIT modal (img2img via `editImage`) — reached from the detail modal's Edit action.
 *  Supersedes the detail view (the shell reuses ONE Dialog and swaps the body, so the detail modal's
 *  onClose never fires on this transition — clear its subject here) while keeping `editSubject` its OWN
 *  field so the edit modal's own onClose is independent. */
export function openImageEdit(subject: ImageSubject): void {
  useImageryStore.setState({ editSubject: subject, detailSubject: undefined }, false, "imagery/openImageEdit");
  openModal("imageEdit");
}
/** The `imageEdit` modal's onClose. */
export function clearEditSubject(): void {
  useImageryStore.setState({ editSubject: undefined }, false, "imagery/clearEditSubject");
}

/** Reactive: the seed the `imagine` modal was opened with (undefined ⇒ nothing to compose). */
export function useImagineSeed(): ImagineSeed | undefined {
  return useImageryStore((s) => s.imagineSeed);
}
/** Reactive: the image the `imageDetail` modal is viewing. */
export function useDetailSubject(): ImageSubject | undefined {
  return useImageryStore((s) => s.detailSubject);
}
/** Reactive: the image the `imageEdit` modal is editing. */
export function useEditSubject(): ImageSubject | undefined {
  return useImageryStore((s) => s.editSubject);
}

/** Non-reactive snapshot of all three intent slots — for the store's own tests + reads outside a render
 *  (the `__readRecentSteersForTest` posture; the reactive readers above need a React render). */
export function __readImageryIntentForTest(): {
  readonly imagineSeed: ImagineSeed | undefined;
  readonly detailSubject: ImageSubject | undefined;
  readonly editSubject: ImageSubject | undefined;
} {
  const { imagineSeed, detailSubject, editSubject } = useImageryStore.getState();
  return { imagineSeed, detailSubject, editSubject };
}

/** Clear every intent slot — test-only hygiene (a module singleton must not leak state across tests). */
export function __resetImageryIntent(): void {
  useImageryStore.setState({ imagineSeed: undefined, detailSubject: undefined, editSubject: undefined }, false, "imagery/reset");
}
