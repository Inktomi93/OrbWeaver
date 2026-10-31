import type { FindGalleryCharacterByHandleOp, ResolveGalleryCharacterHandleOp } from "@orb/contracts/character";

export interface GalleryCharacterOps {
  readonly resolveCharacterHandle: ResolveGalleryCharacterHandleOp;
  readonly findCharacterByHandle: FindGalleryCharacterByHandleOp;
}
