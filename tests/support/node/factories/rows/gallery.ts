// Gallery rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { galleryItems } from "@orb/db";
import type { AssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { GalleryItemRow } from "../gallery.ts";

export async function seedGalleryItemRows(root: ServerProducerRoot, params: Parameters<AssetsService["addToGallery"]>[0]): Promise<GalleryItemRow> {
  const db = root.db;
  const addToGallery = root.services.assets.addToGallery;
  const view = await addToGallery(params);
  const row = await db.select().from(galleryItems).where(eq(galleryItems.id, view.galleryItemId)).get();
  if (row === undefined) {
    throw new Error("production gallery curation left no canonical gallery-item row");
  }
  return row;
}
