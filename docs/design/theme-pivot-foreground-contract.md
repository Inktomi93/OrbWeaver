---
kind: design
status: active
updated: 2026-08-31
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
all three typecheck programs, structure, knip, dependency cruise when imports change, and doc catalog
re-attestation. The lane does not run the broad `pnpm check`/full test battery.

## Prior-art lessons used

The shared memory index entry `MEMORY.md` (fresh verification, catalog re-attestation, and the warning that
a card-calibrated theme is not globally safe) and rollout
`2026-08-25T06-29-17-4t5c-orbweaver_aug21_25_trajectory_and_integration_health_review.md` (surface-specific
contrast and generated-doc receipts) shaped the design. Current source and the #969 framebuffer evidence
were re-derived and outrank those historical notes.
