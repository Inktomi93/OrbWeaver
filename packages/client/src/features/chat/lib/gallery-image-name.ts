// The accessible names of gallery images. An image has no name of its own, so it is named by its place in the
// grid (1-based) and its day: the day it joined the gallery, or, in the add-picker, the day it was uploaded.

import { timeLib } from "#lib";

/** A gallery cell's and its lightbox's name. */
export function galleryImageName(position: number, addedAt: number): string {
  return `Image ${String(position)}, added ${timeLib.formatDate(addedAt)}`;
}

/** An add-picker cell's name. */
export function ownedImageName(position: number, uploadedAt: number): string {
  return `Image ${String(position)}, uploaded ${timeLib.formatDate(uploadedAt)}`;
}
