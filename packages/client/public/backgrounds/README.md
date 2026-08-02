# Seeded backgrounds

Two sets, both 1920×1080, both served statically at `/backgrounds/<name>.jpg` (vite `public/`) and both
enumerated by the ONE catalog `packages/contracts/src/theme/seeded-backgrounds.ts` (`listSeededBackgrounds()`
— read by the client pickers/app-shell layer AND the server's `/autobg` arm).

## 1. Default-character scene plates (ORIGINAL ART — ship-safe)

One per seeded default card; the card carries its slug as `backgroundOverride` (`kind: "seeded"`,
`seededId: "<handle>-bg"`), so in a true-solo room the character's own scene paints the chat root.

- `assistant-bg.jpg`  — Charlotte's study (web in the warm corner)
- `jfc-coder-bg.jpg`  — the dark office, one monitor
- `niko-bg.jpg`       — konbini at 1 a.m.
- `hana-bg.jpg`       — city park bench, midnight
- `morgatha-bg.jpg`   — the Ashen Spire throne level
- `sabine-bg.jpg`     — road-town tavern corner
- `birdie-bg.jpg`     — Holloway's Hobby & Repair
- `kohaku-bg.jpg`     — lamplit apartment
- `calamity-bg.jpg`   — the good windowsill
- `elias-bg.jpg`      — Gullwrack lamp room

## 2. Landscape placeholders (TEMPORARY — replace before ship)

- `misty-highlands.jpg` — Scottish Highlands (Quiraing)
- `granite-valley.jpg`  — Yosemite valley
- `forest-falls.jpg`    — forest waterfall (Salt Creek Falls)
- `blue-fjord.jpg`      — Norwegian fjord (Preikestolen)

### Provenance / license
Pulled from Lorem Picsum (picsum.photos), which serves Unsplash photos under the
**Unsplash License** (free to use, no attribution required). Fine for dev placeholders.
**Action before any real ship:** swap these four for original/CC0 art or properly-attributed images — do not
assume they are clearable for production. (The ten `*-bg` plates above are original pack art and discharge
this debt for the character set; only the four landscapes remain outstanding.)
