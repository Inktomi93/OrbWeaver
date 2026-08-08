# Default-character art pack — receipts, gallery candidates, wiring gaps (Lane AV, 2026-08-02)

Contact sheet for owner review: `docs/reviews/misc/2026-08-02-default-character-art-pack-contact-sheet.png`
(row 1 = avatars, row 2 = backgrounds, one column per character). An identical throwaway copy sits at
`reports/avatar-pack-contact-sheet.png`; `reports/` is gitignored, so the committed copy is this one.

## What landed

| Handle | Avatar (512² PNG, `packages/server/src/entry/boot/seed-assets/avatars/`) | Background (1920×1080 JPEG, `packages/client/public/backgrounds/`) |
|---|---|---|
| `assistant` (Charlotte) | `assistant.png` ⚠ owner-veto flag: she IS a spider | `assistant-bg.jpg` — study corner, empty web |
| `jfc-coder` (JFC) | `jfc-coder.png` | `jfc-coder-bg.jpg` — dark office, X'd whiteboard |
| `niko` (Niko) | `niko.png` | `niko-bg.jpg` — deserted rainy konbini street |
| `hana` (Hana Mizushima) | `hana.png` | `hana-bg.jpg` — empty park bench, city bokeh, aurora crack |
| `morgatha` (Morgatha) | `morgatha.png` | `morgatha-bg.jpg` — empty black-glass throne hall |
| `sabine` (Sabine Veyra) | `sabine.png` | `sabine-bg.jpg` — empty tavern common room |
| `birdie` (Birdie Mae Holloway) | `birdie.png` | `birdie-bg.jpg` — hobby shop, lit model town |
| `kohaku` (Kohaku) | `kohaku.png` | `kohaku-bg.jpg` — lamplit apartment, torii on the hill |
| `calamity` (Calamity) | `calamity.png` | `calamity-bg.jpg` — sunny windowsill still-life |
| `elias` (Elias Thorn) | `elias.png` | `elias-bg.jpg` — lighthouse coast at blue hour |

All 20 files byte-verified: PNG/JPEG magic bytes, exact dimensions, every file well under the
5 MB `DEFAULT_MAX_IMAGE_BYTES` asset cap.

Model: `google/gemini-3-pro-image` (Nano Banana Pro) via OpenRouter. 24 calls, **$3.35 total**
(~$0.139/image). 20 shipped + 4 re-rolls (Charlotte, Birdie, Elias avatars; Niko background).

## Wiring gaps — Lane SW owns these (this lane shipped FILES ONLY, zero code)

1. **The seeded-background catalog is DUAL-HOMED.** Identical hardcoded lists live in
   `packages/contracts/src/theme/seeded-backgrounds.ts` AND
   `packages/client/src/lib/list-seeded-backgrounds.ts`. The 10 new slugs (`<handle>-bg`, label =
   the character's name) must be added to BOTH or the picker and the server-side `/autobg`
   candidate set desync.
2. **Card reference shape.** Each seeded card wants
   `backgroundOverride: { kind: "seeded", seededId: "<handle>-bg" }` (the rest of `ThemeBackground`
   defaults via `themeBackgroundSchema`). `kind:"seeded"` is a plain catalog slug, NOT an asset FK —
   no CAS copy, no per-user ownership gate, nothing for the seeder to store.
3. **Placeholder-art debt partially discharged.** `packages/client/public/backgrounds/README.md`
   flags the four existing scenics as Unsplash placeholders that must be swapped before ship. The
   10 new files are original generated art with no such encumbrance; the README's inventory list is
   now incomplete and should be updated when the catalog entries land.
4. **Dead seed assets from the purged roster.** `avatars/mara-soul-check.png`,
   `avatars/rev-card-refinery.png`, `gallery/mara-soul-check-gallery.webp`,
   `gallery/rev-card-refinery-gallery.webp` belong to characters the v2 roster purges. Left in place
   deliberately — they die with their `cards.ts` entries, in the wiring lane's commit.

## Gallery candidates

**No new `*-gallery.webp` shipped this pass, and the three surviving ones should be deleted.**
`gallery/assistant-gallery.webp`, `gallery/jfc-coder-gallery.webp`, and `gallery/niko-gallery.webp`
are abstract procedural orbit-graphics from the placeholder era — generic decoration with no
relationship to the character. Against the new painterly avatars they read as leftovers, and
`readSeedGalleryPiece` returning `null` is a fully supported path (most of the pack has no gallery
piece at all). If a gallery pass is wanted later, the strongest candidates for a second piece are
Morgatha (the throne hall has depth to spare), Elias (the lamp room), and Birdie (the model town) —
all three already have an environment plate to riff on.

## Notes on the art

- Pack-wide style suffix: painterly, warm-dark, cinematic light, strong silhouette, simplified
  background, verified legible at 64 px; every prompt carried an explicit workplace-safe clause.
- Charlotte is deliberately storybook-stylized and arachnophobe-safe — smooth matte body, no
  bristles, no fangs, large friendly eyes. She is still unambiguously a spider; **the owner's veto
  on the spider concept stands and is not resolved by this art.** Re-rolled once to kill a huge
  glowing "DREAM" word the first pass wove across the web.
- Birdie was re-rolled because the first pass invented a storefront named "SCOTT'S HOBBY SHOP";
  canon is Holloway's Hobby & Repair, which the shipped image now carries (reversed, seen from
  inside).
- Elias was re-rolled for framing — the first pass was full-body and his face landed at roughly
  10 px in a 64 px avatar.
- Niko's background was re-rolled because the first pass painted a recognizable real-world
  convenience-store trademark onto the street sign; the shipped version uses invented branding.
- Every background is figure-free by construction (explicit no-people/no-animals clause) and was
  eyeballed at full size to confirm it.
