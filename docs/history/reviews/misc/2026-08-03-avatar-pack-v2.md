---
kind: history
status: archived
updated: 2026-08-08
---

# Avatar pack v2 — style redo receipts (Lane AV2, 2026-08-03)

Owner ruling: the v1 art "gives me the ick". Owner authorised deriving the pack's aesthetic from his
own top-played SillyTavern cards (vibe/style only — no image was copied, referenced by URL, or fed to
the model; the style spec below is a written characterisation).

Contact sheet: `docs/reviews/misc/2026-08-03-avatar-pack-v2-contact-sheet.png`
(row 1 = new v2 avatars, row 2 = the v1 avatars they replace, row 3 = the v2 set at 64 px).

**Scope: `packages/server/src/entry/boot/seed-assets/avatars/*.png` only.** Backgrounds were ruled
FINE by the owner mid-lane and were not evaluated or touched. `persona-you.png` (the abstract
web-glyph placeholder for the user persona) is style-neutral and was left alone.

## 1. The reference — what the owner's top cards actually look like

Viewed full-size: Hikari, Ruby, Selene1, Azarael, Ayami, Bess, Bengal, Anika, Rin, Rosalia
(Ysabeau is an art-less placeholder). They are one coherent school:

- **Modern high-gloss anime illustration** — the contemporary premium character-card look. Crisp,
  confident, thin coloured lineart; cel shading softened with airbrushed gradients.
- **Gloss is the signature.** Specular highlights on hair and skin; hair drawn as chunky strands
  with a strong highlight band; wet-looking rim light.
- **Saturated, with one dominant colour mood per image** (Rin green-teal, Bengal red, Bess amber,
  Azarael violet). High contrast, luminous.
- **Eyes are the focal point** — large, gradient irises, bright catchlights, sharp thin lashes,
  subtle blush. Everything else in the face is minimal (small nose and mouth).
- **Framing:** subject LARGE in frame, chest-up to thigh-up, three-quarter turn, camera at or
  slightly above eye level.
- **Backgrounds** are either a soft-focus bokeh environment (Ruby's monitors, Bess's bedroom) or a
  flat tinted gradient (Azarael) — atmospheric, never competing.

### Reusable style suffix (this is the spec; it rode on all 16 calls)

> ART STYLE (follow exactly): modern high-gloss anime illustration in the contemporary premium
> character-art style — crisp clean confident lineart, cel shading with soft airbrushed gradients,
> glossy specular highlights on hair and skin, saturated jewel-tone colour with one dominant colour
> mood, dramatic single-source key light plus a coloured rim light separating the figure from the
> background, large expressive anime eyes with detailed gradient irises and bright catchlights, sharp
> thin lashes, small refined nose and mouth, subtle blush, chunky glossy hair strands with a strong
> highlight band. High contrast, luminous, clean edges, vivid.
> COMPOSITION: square 1:1 avatar. Upper body, waist-up or chest-up, subject LARGE in frame, head in
> the upper-centre, three-quarter turn, looking toward the viewer. Face must stay clearly readable
> when the image is shrunk to a 64-pixel thumbnail. Background is a soft-focus bokeh environment or a
> simple tinted gradient — atmospheric, never competing with the figure.
> HARD NEGATIVES: not photorealistic, not a 3D render, not an oil painting, not muddy desaturated
> western concept art, no grainy brush texture, no washed-out brown/grey palette, no text captions,
> no watermark, no signature, no borders, no real-world brands or trademarks, no logos.
> CONTENT: strictly workplace-safe, fully clothed, modest, no suggestive posing.

## 2. The ick — why v1 read wrong (diagnosis that steered the prompts)

1. **Wrong school entirely.** v1 is painterly western semi-realism — the default
   fantasy-paperback-cover / D\&D-splashbook look. The reference is anime illustration. That gap is
   the whole ick; every other complaint is downstream of it.
2. **Muddy, desaturated, brown.** v1's palette is grey-brown-olive with low local contrast
   (Sabine, JFC, Birdie, Elias are nearly the same three colours). The reference is saturated with a
   dominant colour per image. Side by side, row 2 of the contact sheet looks like it was left in a
   drawer.
3. **Dead eyes.** v1 renders realistic small eyes with no catchlight discipline. The reference's
   whole read at thumbnail size comes from big eyes with sparkle — v1 has no focal point at all
   below \~128 px.
4. **Smeary brush texture.** v1 carries the "AI oil-paint" grain over everything; faces get soft and
   generic, hands go vague (v1 Birdie's brush hand, v1 Kohaku's arm). The reference is clean-edged.
5. **Everyone is aged up and tired-in-a-bad-way.** Semi-realism plus a dim palette made Hana,
   Sabine and Niko read as worn-out middle-aged strangers rather than characters with an attitude.
6. **The pack wasn't even internally consistent** — v1 Niko was flat muted gouache while v1 Morgatha
   was glossy painterly; they didn't look like one set.
7. **Charlotte was a realistic spider.** Smooth, but a real spider shape with a real spider's
   posture — the flinch response fires before the charm does.

## 3. What shipped

Model `google/gemini-3-pro-image` via OpenRouter, 1024×1024 output, downscaled to 512×512 PNG24
(stripped metadata), overwritten in place. Character CONTENT came from each card's *Avatar art
direction* paragraph in `docs/design/default-character-roster.md`; only the aesthetic changed.

| Handle | Character | Shipped roll | Notes |
| - | - | - | - |
| `assistant` | Charlotte | `c` (3rd) | Kumo-Desu redesign — see below |
| `jfc-coder` | JFC | `a` (1st) | |
| `niko` | Niko | `a` (1st) | |
| `hana` | Hana Mizushima | `c` (3rd) | |
| `morgatha` | Morgatha | `b` (2nd) | |
| `sabine` | Sabine Veyra | `a` (1st) | |
| `birdie` | Birdie Mae Holloway | `a` (1st) | |
| `kohaku` | Kohaku | `a` (1st) | |
| `calamity` | Calamity | `a` (1st) | |
| `elias` | Elias Thorn | `a` (1st) | |

**Charlotte (owner-ruled special).** Redrawn with *So I'm a Spider, So What?* energy: a round,
plump, glossy little spider with enormous sparkling eyes, a tiny happy open smile, a gold pince-nez
across the bridge of her front eyes and one foreleg raised in a wave, centred on a dew-strung web
with the cosy study bokeh behind. She is meant to make people grin, not flinch — and she is still
unmistakably the well-read concierge.

### Byte validation

All 10 files: PNG magic `89504e470d0a1a0a`, exactly 512×512, 369–458 KB — an order of magnitude
under the 5 MB `DEFAULT_MAX_IMAGE_BYTES` asset cap. Every image was eyeballed at full size before
shipping and re-checked at 64 px (contact-sheet row 3): all ten hold a readable focal point.

### Cost

**16 calls, $2.2398** (\~$0.1400/call), against an $8 ceiling. Costs are the authoritative
`GET /api/v1/generation` `total_cost` per generation id — the value returned inline with the
completion is unusable (it comes back `null` for the first few seconds after a generation, so the
figures were re-queried in a second pass).

| Call | $ | Outcome |
| - | - | - |
| assistant-a | 0.138188 | rejected — pince-nez sat low over her mouth, no wave |
| assistant-b | 0.141822 | rejected — fixed the glasses and the wave, but the model drew a black picture frame around the whole image |
| assistant-c | 0.138138 | **SHIPPED** |
| jfc-coder-a | 0.141198 | **SHIPPED** |
| jfc-coder-b | 0.140892 | rejected — the "thinner lineart" nudge pushed him chibi/mascot |
| niko-a | 0.138462 | **SHIPPED** |
| hana-a | 0.138510 | rejected — read \~22 and un-tired; the card's entire joke is 23 years of fatigue |
| hana-b | 0.141660 | rejected — fatigue landed, but full-figure framing shrank her face below thumbnail legibility |
| hana-c | 0.139138 | **SHIPPED** — chest-up, dark circles, crooked tiara, weary warm quarter-smile |
| morgatha-a | 0.141520 | rejected — model invented a legible book title ("MILLENNIAL ENNUI"); funny, but unauthored readable text in an avatar |
| morgatha-b | 0.140656 | **SHIPPED** — blank book cover, tighter crop |
| sabine-a | 0.138680 | **SHIPPED** |
| birdie-a | 0.138736 | **SHIPPED** |
| kohaku-a | 0.140634 | **SHIPPED** |
| calamity-a | 0.140662 | **SHIPPED** |
| elias-a | 0.140912 | **SHIPPED** |

## 4. Flags for the owner

- **Pack-wide rendering is close but not uniform.** Kohaku, Hana, Morgatha and Niko are dead-on
  reference-school anime. JFC, Birdie, Sabine and Elias landed slightly harder-edged — closer to a
  polished western-animation/vector look than to the soft-gradient reference. The one reroll that
  chased that (jfc-coder-b) came back worse (chibi), so the harder-edged four were kept: they are
  clean, saturated, high-contrast and consistent *with each other*, and the gap to the reference is
  far smaller than the gap v1 had. Say the word and I'll push the four again.
- **Calamity is missing the `$5 → $4` masking-tape price sticker** from its art direction. Everything
  else in the direction landed (star-metal blade, runes, bird on the crossguard, succulent, mug,
  window). Not worth a reroll unless you want it.
- **`persona-you.png` untouched** — abstract orbit-glyph, style-neutral, still fine.
- **Gallery pieces unchanged.** The v1 note's recommendation stands: the three surviving
  `*-gallery.webp` files are placeholder-era orbit graphics and should be deleted by the wiring lane.
