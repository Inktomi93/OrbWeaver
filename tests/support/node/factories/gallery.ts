// The Gallery row and result shapes; the reads that return them live in the rows tier (`rows/gallery.ts`).

import type { galleryItems } from "@orb/db";

export type GalleryItemRow = typeof galleryItems.$inferSelect;
