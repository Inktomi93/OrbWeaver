// domain/hub/contract/results — the verb result shapes, re-exported TYPE-ONLY from their canonical wire
// home (`@orb/contracts/hub`) so the verb signatures + the front door reference one name. `GifSearchResult`
// is hub's own; `GalleryItemView` is assets' (hub reaches the gallery write via an injected op).

export type { GalleryItemView, GifSearchResult } from "@orb/contracts/hub";
