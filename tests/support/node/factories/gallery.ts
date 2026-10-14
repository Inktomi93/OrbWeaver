// Curation is produced by assets; ownership derives through the real asset FK.
import type { Db } from "@orb/db";
import { galleryItems } from "@orb/db";
import type { AssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";

export type GalleryItemRow = typeof galleryItems.$inferSelect;

export async function seedGalleryItem(
  db: Db,
  addToGallery: AssetsService["addToGallery"],
  params: Parameters<AssetsService["addToGallery"]>[0],
): Promise<GalleryItemRow> {
  const view = await addToGallery(params);
  const row = await db.select().from(galleryItems).where(eq(galleryItems.id, view.galleryItemId)).get();
  if (row === undefined) {
    throw new Error("production gallery curation left no canonical gallery-item row");
  }
  return row;
}
