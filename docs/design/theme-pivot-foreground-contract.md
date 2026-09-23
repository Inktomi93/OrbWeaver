---
kind: design
status: active
updated: 2026-09-22
---

# Theme-pivot foreground contract (#969)

## Decision

Accepted custom and carried palettes have no refused lightness band. The render clamp derives polarity
from measured contrast, derives every paired foreground against the surface that actually paints under
it, and emits a dedicated `reading-plate-foreground` for neutral chrome over the translucent reading
plate. Transparent `Button` actions inherit their host surface's paired ink; they do not substitute the
low-emphasis `muted-foreground` semantic for an action label.

This is both a derivation-contract repair and a semantic-carrier repair:

1. `surfaceVarsOn` currently computes one foreground from the base and assigns it to background, card,
   popover, sidebar, and secondary roles even though those surfaces move independently through the
   polarity ramp (`packages/ui/src/content/theme-scope/derive-vars.ts:174-181`). Around the old pivot,
   one ink cannot honestly describe those different paint hosts.
2. The over-art chrome family paints `reading-plate` but names the base `foreground`
   (`packages/client/src/features/chat/lib/message-row-backing.ts:115-116`). The plate is translucent and
   shifted; it needs its own paired neutral ink just as card and popover do.
3. `Button` overrides its host ink on every transparent action: secondary forces base `foreground`, while
   ghost and outline force `muted-foreground` (`packages/ui/src/primitives/button/variants.ts:39-54`). In
   the S1 band, that defeats the explicitly declared `bg-card text-card-foreground` contract
   (`packages/client/src/features/chat/components/chat-controls-band.tsx:87-96`); the nested mode word
   defeats the button again through `Text`'s `interactiveKicker` voice
   (`packages/client/src/features/chat/components/chat-controls-band.tsx:195-219`).

The exact framebuffer receipts on issue #969 are therefore expected, not anomalous: the Generate label
over the swipe strip reads the wrong muted ink on a reading plate, while Send/Draw and the mode word read
the wrong muted ink on a card. The two accepted bases at `oklch(0.62 0.01 60)` and
`oklch(0.6201 0.01 60)` merely expose contracts that were already false.

## The derivation

### One measured polarity mechanism

`@orb/kit/theme-derivation` owns `surfacePolarity(surface)`. It compares the contrast of pure black and
white against the actual gamut-mapped surface; whichever extreme
has the higher ratio defines the surface as `light` (dark ink) or `dark` (light ink). This replaces the
raw-L `fgPivotL`/`fgSteepness` approximation everywhere polarity is a decision:

- `color-scheme`;
- neutral foreground direction;
- neutral surface-ramp arm;
- elevation arm;
- reading-plate alpha arm;
- custom chart search preference; and
- accent-correction direction.

The endpoints and both ramp recipes remain the starting recipes. Hearth, Mocha, and Light are far from the
crossover, so the selected arms and generated seed values remain unchanged. For an arbitrary accepted base,
a proposed shared-host delta that crosses the base's contrast-safe polarity retracts toward zero on the same
0.001 grid. This projects only derived chrome, never the authored base. Accent and sidebar-accent keep their
full recipe because each owns a dedicated foreground and has no shared-ink obligation. The old `0.62`
threshold is not retained as a second compatibility mechanism: at exactly `0.62` it selected a dark scheme
while the CSS foreground formula clamped to the dark-ink endpoint, so the claimed agreement was already
false.

### Contrast-safe neutral ink

`derivedForegroundLightness(surface)` starts from the existing endpoint for the measured polarity. If that
tone clears WCAG AA it returns it byte-for-byte. If it does not, it searches in 0.001 lightness steps toward
the corresponding black/white extreme and returns the first clearing neutral. The same bounded search,
starting from the existing softer endpoint, derives `muted-foreground` against its documented opaque and
input hosts. Black or white always supplies a clearing endpoint for one opaque surface. For a shared family,
the ramp projection above keeps every opaque member on that endpoint's clearing side; the input alpha starts
at the existing 0.12 and retracts toward transparent only when its composite would make the family
infeasible. There is no fallback to an anchor surface: an impossible family is an error, and the 2,060-cell
property matrix proves both projection populations are nonzero and every returned family clears in float and
quantized pixels.

The UI clamp has the parsed/composited pixel already. It therefore emits the solved lightness rather than a
browser-side steep `clamp()` approximation. Each existing paired foreground uses its actual numerical host:

| Foreground | Judged surface |
| - | - |
| `foreground` | documented `background` / `surface-raised` / `card` family |
| `card-foreground` | derived `card` |
| `popover-foreground` | derived `popover` |
| `sidebar-foreground` | derived `sidebar` |
| `sidebar-accent-foreground` | derived `sidebar-accent` |
| `secondary-foreground` | derived `secondary` |
| `accent-foreground` | derived `accent` |
| `primary-foreground` | corrected/picked primary fill |
| each bubble foreground | its picked bubble fill |
| `muted-foreground` | documented opaque neutral hosts plus the solved `input` fill composited over background/card/popover |
| `reading-plate-foreground` | reading plate over black and white art plus opaque reading band |

Invalid/contextual provider-less colors keep the honest inheritance fallback; a standards-readable or
ambient-composited value takes the measured path. Authored background spelling still owns
`--color-background`; only derived outputs use the resolved pixel, preserving alpha/gamut behavior.

### Reading-plate foreground

`color.reading-plate-foreground` is a portable DTCG color token because it names a real semantic pair and
is consumable in ordinary CSS. Seed values equal each seed's existing foreground, preserving shipped
pixels. Runtime custom values are emitted through the already-ratified ThemeScope extension/output seam.

For a custom base, kit computes the plate color and its derived alpha, then judges a neutral ink against
the plate composited over both black and white art. It retains the base foreground when that clears both;
otherwise it searches toward black/white for the nearest clearing tone. The alpha search also
requires that some neutral plate foreground clears both extremes, so the token never claims a pairing the
translucent surface makes impossible. The existing dark-arm owner ruling remains: its alpha does not move;
the shipped dark foreground already clears the neutral-chrome pairing, and this issue does not reopen the
separate authored-speaker residual recorded in D144. The three shipped seed plate alphas and inks do not
move; only a custom plate may become more opaque when no neutral pair is otherwise feasible.

The over-art chrome constants consume `text-reading-plate-foreground`. Prose keeps
`text-prose-body`/authored inks. This is the semantic split at the token home, not a chat-local color.

### Transparent action labels

Primary and destructive buttons keep their filled-surface foreground pairs. Secondary, ghost, and outline
buttons paint no resting fill, so their normal action text uses `currentColor`: the host surface has already
chosen `foreground`, `card-foreground`, `popover-foreground`, `sidebar-foreground`, or
`reading-plate-foreground`. Hover/selected states continue to set `accent-foreground` beside `bg-accent`.

The S1 chip's `interactiveKicker` is text inside a control whose current color the button owns, so it uses
the existing `Text ink="inherit"` mechanism. This is exactly the filled-control rule documented in the Text
primitive and prevents a nested voice from reintroducing a second ink decision.

The shell rail is the other proven split: two hover selectors paint on `sidebar-accent`, not `sidebar`.
They therefore consume `sidebar-accent-foreground`; the seed value aliases the old sidebar ink, while a
custom palette derives the role against the actual hover fill.

## Ingress and carrier proof

No ingress projects or rejects the authored base:

- settings theme editor and character editor build the same sparse `ThemeOverride` through
  `assignThemeColorFields` (`packages/client/src/lib/theme-override-form.ts`);
- create/update validate through `themeOverrideSchema`; backup import restores that same schema shape;
- ST import removes its sole `isDerivableBaseSurface` refusal and persists the converted authored base;
- root custom themes flow through `resolveThemeScopeTokens` into `ThemeScope`;
- nested room and per-character palettes use the same `ThemeScope` and ambient contexts;
- portal content is a sibling under the root `ThemeScope` and inherits the same vars;
- prepaint remains seed-only and generated seed blocks remain authoritative; and
- owner custom CSS remains the separately validated, last-in-head unlayered winning plane. No validator,
  selector order, injection mechanism, or custom-CSS permission changes.

The structural call sweep used both methods required by code-recon law: ast-grep scanned 4,341 TS and
1,323 TSX files and found one production `isDerivableBaseSurface` call (ST import at
`packages/server/src/domain/import/substrate/theme.ts:215`) plus tests; literal `rg` found the same set.

## Rejected alternatives

### Reject or clamp the authored 0.62 band

Rejected. ThemeScope, persisted custom themes, and carried palettes already accept it, while only ST import
refuses it. Expanding that rejection would narrow a core capability and preserve the false shared-foreground
premise. Projecting the authored base would also change the color the owner picked. Projection is limited to
derived chrome: first the ink; then, only where no shared ink can exist, the proposed ramp delta or input
alpha. Authored intent remains exact.

### Retune `mutedLMin` or move `fgPivotL`

Rejected. A scalar retune can make the two filed fixtures green but cannot make one shared ink honest across
base, lifted, recessed, and translucent surfaces. Moving the threshold only moves the discontinuity; it does
not make raw OKLCH lightness a contrast measurement, and it leaves chroma/gamut unaccounted for.

### Add feature-local colors or opaque patches

Rejected. A chat-only class would fix the two sampled labels and leave every other ThemeScope consumer on
the broken contract. The new token is the general reading-plate/neutral-chrome pair in `@orb/ui`; action-ink
inheritance is repaired in the Button primitive.

### Make `muted-foreground` the universal action ink but darker/lighter

Rejected. `muted-foreground` means low-emphasis prose, placeholders, and metadata. Action labels are normal
text even when their box is quiet. A single muted token also cannot cover every ramp surface near the
crossover. The host already owns the correct paired ink; the action must inherit it.

### Replace DTCG/Style Dictionary or add a contrast library

Rejected. The repository already has DTCG token generation, safe-color parsing, OKLCH/sRGB conversion,
WCAG contrast, compositing, and bounded search precedents in `@orb/kit/theme-derivation`. New machinery or a
dependency would duplicate shipped capability.

## Coupled-site inventory

Production/code contract:

- `packages/kit/src/theme-derivation/index.ts` — polarity, foreground searches, reading-plate pairing;
- `packages/ui/src/content/theme-scope/{derive-vars,clamp}.ts` — actual-surface emission and color-scheme;
- `packages/ui/src/tokens/tokens.json` and both seed value-sets — new semantic token;
- generated `packages/ui/src/{styles/theme.css,tokens/index.ts,tokens/themes.gen.ts}`;
- `packages/ui/src/primitives/button/variants.ts` — transparent action ink;
- `packages/client/src/features/chat/lib/message-row-backing.ts` — reading-plate paired ink;
- `packages/client/src/features/chat/components/chat-controls-band.tsx` — nested Text inherits;
- `packages/client/src/features/app-shell/surfaces/shell.css` — sidebar-accent hover pair;
- `packages/server/src/domain/import/substrate/theme.ts` — retire the mid-band refusal.

Tests/gates:

- kit derivation unit suite: a 2,060-cell accepted L/chroma/h surface matrix with nonzero ramp/input
  projection populations, exact pivot reds, polarity agreement, sacred seed/dark controls, planted
  old-formula failure;
- ThemeScope clamp/property suites: actual paired hosts, exact `.62`/`.6201`, complete emit/token surface,
  standard spelling/ambient cases, generated seed freshness;
- ThemeScope rendered CT: exact pivot pairs resolve in a browser, including reading plate;
- Button CT: transparent actions inherit host ink while filled actions retain their pair;
- chat controls CT: exact pivot card label/mode word at AA with declared/reached/sampled nonzero;
- swipe/message-row CT if its existing fixture is the narrowest honest host for the reading-plate token;
- ST importer unit: both pivot bases import (negative refusal control replaced by malformed/unreadable input);
- seed pairing/token structure/docs catalog checks.

Documentation truth repair:

- D71 in `Core-Path-Registry.md`;
- `UI-Theming-and-Content.md`;
- the active token-contract program;
- the current CSS census; and
- stale headers/comments in changed production and test files.

## Red-first and final verification

Plant before production edits:

1. kit pure tests for `.62`/`.6201` plus a non-vacuity control that reproduces the old shared-base
   foreground failure;
2. ThemeScope emitted-pair property tests for the same bases;
3. browser CT using the exact bases and actual `Button`/card/reading-plate carriers; and
4. ST import acceptance for an exact converted pivot base.

Run each focused suite red against the unchanged production source, then green after implementation. Run
the token generator and byte-diff generated outputs. Focused final checks cover the changed unit/CT suites,
all three typecheck programs, structure, knip, and dependency cruise when imports change. The lane does not run the broad `pnpm check`/full test battery.

## Prior-art lessons used

The shared memory index entry `MEMORY.md` (fresh verification, catalog re-attestation, and the warning that
a card-calibrated theme is not globally safe) and rollout
`2026-08-25T06-29-17-4t5c-orbweaver_aug21_25_trajectory_and_integration_health_review.md` (surface-specific
contrast and generated-doc receipts) shaped the design. Current source and the #969 framebuffer evidence
were re-derived and outrank those historical notes.

## 2026-08-31 framebuffer-margin addendum (#883 after #969)

### Fresh rendered boundary

The DOM-derived #883 matrix proves that #969's host inventory is now complete: all seven real-room arms
clear AA and every ThemeScope arm declares, reaches, and samples all 15 painted pairs. It also exposes one
remaining contract error. The derivation solves to the legal `4.5` threshold with no rendering margin, but
the browser's 8-bit OKLCH resolution and translucent-input composition are not byte-identical to the
analytic floats:

- Mocha `muted-foreground` on input over popover is `4.430` in the framebuffer
  (`rgb(159 165 172)` on `rgb(54 61 68)`), although the old seed-only float gate reports `4.465`;
- custom bases at both sides of the polarity pivot (`0.62` and `0.6201`) solve to the same neutral ink and
  render `4.460` on input over background (`rgb(11 11 11)` on `rgb(125 119 115)`); and
- every arm clears when the paint is measured on the real room, so this is specifically the paired
  ThemeScope/input contract, not art, selector reachability, or the contrast instrument.

The semantic floor and the derivation target are therefore different values. WCAG AA normal text remains
`4.5`. Orb-authored *derived neutral foregrounds* aim at `4.6`: a 0.1 ratio reserve (2.22% over the legal
floor) that is larger than the observed analytic-to-framebuffer loss and still changes only generated ink
that would otherwise sit on the threshold. That aim must be capped by the strongest black/white endpoint
the authored host family can physically support. The WCAG contrast crossover has a mathematical maximum
of `sqrt(21) ≈ 4.5826`; demanding 4.6 unconditionally would make a total accepted-base contract impossible
at exactly the colors #969 admitted. Therefore each derived family targets
`min(4.6, contrast(strongest endpoint, actual hosts))`, never less than the legal 4.5 floor #969 already
proves. Shipped seeds are nowhere near that crossover and must meet the full `4.6` target on their
documented opaque and input-composited hosts, so seeds and custom themes share the same aim without lying
about the physically impossible band. It does not raise the acceptance floor for an owner's authored prose
color; a valid authored color at `4.5` remains a no-op, and only the fallback ink is derived at the render
target.

### Chosen architecture

`@orb/kit/theme-derivation` owns a named `AA_NORMAL_DERIVATION_RATIO = 4.6` beside the legal
`AA_NORMAL_RATIO = 4.5`. Every neutral-ink search uses the lower of that aim and its anchor surface's
polarity-endpoint capacity. Ramp-feasibility and translucent-input projection use that same anchor target;
otherwise a secondary host could cap the search at an exact-4.5 endpoint and silently spend the reserve
before the browser ever paints it. The fixed authored base is never moved: its capacity sets the strongest
truthful promise the whole derived family can make, and only derived ramps/input alpha yield until the
family meets it. The authored-ink pass-through, reference-plate legal check, and unrelated 3:1
graphical-component solvers retain their legal thresholds. This keeps the two meanings explicit:

- `AA_NORMAL_RATIO` answers whether already-authored paint is legally readable;
- `AA_NORMAL_DERIVATION_RATIO` answers how much headroom Orb aims to create when it owns the paint; the
  actual target is capped only by the authored surfaces' physical black/white capacity.

The three seed palettes are swept from `SEED_THEME_VALUE_SETS`, never from a theme-name allowlist. The gate
measures the worse of float and 8-bit-rounded contrast for each body pair and for `muted-foreground` on
input composited over background, card, and popover. The pre-fix sweep is non-vacuous: Hearth bottoms out
at `4.883`, Light at `5.251`, and Mocha alone fails at `4.430`. Mocha's semantic foreground moves to the
smallest existing 0.001 OKLCH-lightness step that clears the shared target; no base, surface, alpha, accent,
or owner-authored value moves.

### Rejected alternatives

- **Lower the CT floor or change its pixel sampler:** rejected because declared/reached/sampled counts and
  the sampled bytes prove a real AA miss.
- **Special-case Mocha or the polarity pivot:** rejected because both failures are manifestations of the
  same zero-margin derivation contract, and accepted custom bases are intentionally total.
- **Retune input alpha:** rejected because it changes field-fill hierarchy, cannot repair every opaque
  foreground host, and would make the surface pay for an ink guarantee.
- **Use a universal `4.5 + epsilon`, `4.55`, or unconditional `4.6`:** rejected because quantized OKLCH is
  stepped, not continuous, while the contrast crossover cannot support a universal target above
  `sqrt(21)`. At the pivot, several adjacent authored lightness steps resolve to the same framebuffer
  color. A 4.6 aim capped by measured endpoint capacity spends all available headroom without rejecting or
  moving an accepted authored base.
- **Apply 4.6 to owner-authored prose and reference ink:** rejected because those values already have an
  explicit legal no-op contract. The renderer reserve is owed only where Orb chooses the replacement ink.
- **Model a second browser compositor in TypeScript:** rejected because a hand-rolled pixel simulator would
  still duplicate browser gamut/compositing behavior and could drift independently. The pure solver owns a
  conservative target; the existing real-browser matrix graduates it.

### Coupled sites and proof plan

Production and generated contract:

- `packages/kit/src/theme-derivation/index.ts` — named derivation target and all neutral searches;
- `packages/ui/src/tokens/themes/mocha.json` — the only seed value the closed palette sweep proves below
  the target;
- generated `packages/ui/src/styles/theme.css` and `packages/ui/src/tokens/themes.gen.ts` — only the Mocha
  muted foreground may change; the base generated token map remains byte-identical; and
- D71, the token-contract program, and the current CSS census — state the floor/target distinction and
  retire the now-false exact-4.5 solver claim.

Red-first tests first pin the 4.6 aim, fail both exact pivot inputs under the old solver, and fail the
all-seed body/input sweep on current Mocha. Green proof then covers boundary lightnesses, both pivot arms,
seed/custom ambients, the full 2,060-cell accepted-base property matrix against each family's attainable
target, and a planted seed-pair control. The property matrix also proves every attainable target remains at
or above 4.5. The token build is followed by a byte diff of all three generated artifacts. Focused
unit/contract tests, UI and kit typechecks, and Biome cover the changed tier; #883's existing 7x2
real-browser matrix is the final rendered receipt and remains untouched.

### Implemented analytic receipt

The completed 2,060-base matrix bottoms at `4.579833704869108` on the accepted gamut-clipped sample
`oklch(0.18 1 60)`: `+0.079833704869108` above the legal floor and exactly that anchor's attainable
endpoint target. The two filed pivot inputs retain alpha `0.12`, move their neutral ink from L `0.151` to
L `0.131` (`rgb(7 7 7)`), and measure `4.6127098872723` / `4.614416879158376` analytically. Mocha's new
L `0.731` seed measures `4.628571517467702` on input over popover, while Hearth and Light remain unchanged
at minima `4.883202161611481` and `5.251180600789447`. The generator changed exactly the Mocha value in
`theme.css` and `themes.gen.ts`; generated `tokens/index.ts` stayed byte-identical.
