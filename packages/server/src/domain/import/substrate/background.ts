// domain/import/substrate/background — the ST `backgrounds/` plane and where its files land.
//
// WHERE THEY LAND (owner ruling — "backgrounds is our gallery, a media store for characters and
// etc"). ST's `backgrounds/` dir is a per-user list of images the app-background picker chooses from; orb's
// exact counterpart is `appearance.backgroundLibrary` (BG-D — a per-user list of `{assetId, assetHash, mime,
// name}`, GC-rooted by the settings live-source scan and rendered by the background picker). So each file is
// CAS-stored as an owned asset of kind `background` and appended to that library. That is also what delivers
// the owner's "media store for characters and etc": an owned image is offered by `assets.listOwned`, which is
// the picker every character gallery adds from. A subject-less `gallery_items` row was deliberately NOT
// written — the only gallery surface is character-scoped (`listGallery({subjectCharacterId})`), so such a row
// would be invisible data.
//
// A file's claimed mime and display name follow the ST media rules in `./media.ts`.

/** The ST profile SUBDIRECTORY holding the app-background library. */
export const ST_BACKGROUND_DIR = "backgrounds";
