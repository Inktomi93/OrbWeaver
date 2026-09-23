---
kind: reference
status: active
updated: 2026-09-22
---

# Impeccable → Orbweaver adoption record

The record for adapting the deterministic detector rules from
[pbakaus/impeccable](https://github.com/pbakaus/impeccable) (registry
`cli/engine/registry/antipatterns.mjs`, implementations `cli/engine/rules/checks.mjs`) against
Orbweaver law. Every row states adopt, adapt, or reject, with the reason. The adapted rules live in
`tooling/src/ui-audit/`: `ops/walker.ts` and `ops/walker/census-*.ts` gather in-page facts,
`lib/checks-*.ts` decide, `lib/collect.ts` dispatches families and carries the attribution header.
Tests live at `tests/tooling/ui-audit/`. Run the rules with `pnpm snap <route> --design-audit`. The
design-verb vocabulary is in `.claude/skills/side-eye-design-review/SKILL.md` §15; the design-truth
map is `reference/design-context.md` in that skill.

## License and attribution

Impeccable is Copyright Paul Bakaus, Apache License 2.0 (upstream `LICENSE`). Apache-2.0 permits
derivative works with attribution. The adapted detector logic in `tooling/src/ui-audit/ops/walker.ts`
and `lib/collect.ts` carries a per-file attribution header naming the upstream project, the license,
and the fact of modification (Apache-2.0 §4b). Upstream's `NOTICE.md` covers only its
platform-reference files, which are MIT-licensed from a different upstream and were not adapted, so no
NOTICE propagation is owed. Nothing here grants use of the "Impeccable" name beyond describing origin
(Apache-2.0 §6). A redistribution of this repository must carry a copy of the Apache-2.0 license text
(referenced by URL: <https://www.apache.org/licenses/LICENSE-2.0>).

Every adapted finding is origin-tagged: `Finding.origin === "impeccable"` in the
`reports/design-audit/*.json` report; pre-existing rules carry `origin: "orbweaver"`.

## Why adapt into our own home, rather than vendor impeccable's CLI

- Their browser engine defaults to `waitUntil: 'networkidle0'`, and this app's SSE stream never idles.
  A navigation against a streaming route times out and reports nothing. Our runner waits on
  `data-app-ready`, the correct primitive for a persistent-connection app. Their CLI's own ignore-file
  handling can also suppress a whole scanned tree silently, the exact false-clean class our population
  accounting exists to catch.
- Two detector homes for one concept breaks the one-home rule. Their engine assumes a
  `DESIGN.md`/`PRODUCT.md` context flow this repo does not adopt (see `design-context.md`); it runs on
  Puppeteer, not Playwright; it carries its own severity vocabulary and ignore grammar that would fork
  our P0-P3 report contract.
- Their source-regex engine (`detect-text.mjs`) is not adopted either. Source enforcement is the gate
  battery's job (the tokens-only biome hook, `density-tier`, `no-off-token-radius-shadow`, and more); a
  second source scanner would double-home enforcement. Our detector judges rendered truth only.
- **Chosen shape:** an in-page fact walker gathers raw samples, pure Node checks decide, the runner
  reports. Thresholds and detection recipes come from impeccable, credited; the code is written to our
  house shape so every verdict stays fixture-testable without a browser.

## Severity mapping

Impeccable has categories (`slop`/`quality`) plus flags (`advisory`/`error`). We keep our own P0-P3:
`error` maps to P0, real user-facing breakage to P1, a law-backed defect or a strong signal to P2, and
a taste tell or advisory to P3. `pnpm snap <route> --design-audit --fail-on` keeps its own default
(P1).

## Blind is not the same as inapplicable

A triage of "adopt, adapt, or reject" hides three separate questions:

1. Does the defect class exist in our world? (semantic applicability)
2. Can their mechanism see it here? (mechanical reach)
3. Is the pixel layer the right layer for us? (detection altitude)

A "no" on (2) is not a rejection; it is an adapt candidate. `monotonous-spacing` is that shape: its
sampler keys on numeric Tailwind utilities, and this codebase's spacing vocabulary is semantic
(`p-field`, `gap-row`), so the upstream rule is structurally blind here, not inapplicable.

On (3): every impeccable rule infers authorship from rendered pixels because in an open world that is
all there is. Orbweaver is a closed world with layers impeccable cannot have: the token layer
(`tokens.json` plus resolver), the variant layer (statically resolvable `tv()` class unions), the
primitive layer (a closed `@orb/ui` set), and the cascade layer (merge trace, cascade trace, family
ownership). A defect visible in pixels usually has an exact signature one or more layers up, where
detection is cheaper, deterministic, and fires at `pnpm check` instead of needing a browser.

A rule that emits an existing finding id has no registry row of its own, and a rule-by-rule id diff
cannot see it. Upstream's `checkHoverContrast` reuses the existing `low-contrast` id upstream, so a
naive id diff misses it. This app carries `hover-contrast` as its own registered rule with its own
accounting (`ops/hover.ts`, `ops/hover-walker.ts`, `lib/checks-hover.ts`). When re-syncing against
upstream, diff the exported mechanisms, not just the id registry.

## Adapted — live in `pnpm snap --design-audit`

The method column is the rule's population-collection strategy. The one home for the assignment and
its reason is the table in `tooling/src/ui-audit/lib/collect.ts`'s header, pinned by
`tests/tooling/ui-audit/lib/collect-families.test.ts`; that table wins on any conflict here. Methods:
1 no population row (a page singleton, or a walker-proven carrier where the finding is the census) · 2
a full census with candidates/judged/withheld/excluded · 3 a walker relational census plus a
representative cap · 4 grouped by authored decision · X a bespoke accounting function named in
`collect.ts`.

| impeccable id | our rule id | P | method | mechanism (as adapted) |
| - | - | - | - | - |
| `side-tab` | `side-tab` | P3 | 2 | dominant chromatic edge border (≥2px, ≥2× other sides); exempt tab-context, status/alert, safe tags, and the ratified ListRow selection accent |
| `border-accent-on-rounded` | `border-accent-on-rounded` | P3 | 2 | thick chromatic border on any edge plus border-radius; shares `side-tab`'s exemptions |
| `flat-type-hierarchy` | `flat-type-hierarchy` | P3 | 1 | page font-size census: 3 or more sizes with a max/min ratio under 2.0 |
| `bounce-easing` | `bounce-easing` | P2 | 2 | bounce/elastic/wobble/spring animation-name, or an overshoot cubic-bezier |
| `dark-glow` | `glow-shadow` | P3 | 2 | chromatic box/text-shadow halo; the sanctioned carrier is a `::before` layer, never the element's own shadow |
| `radial-halo` | `radial-halo` | P2 | 2 | saturated radial wash fading to transparent, chromatic stop at high alpha, large surface |
| `radial-spotlight-glow` | `radial-spotlight-glow` | P3 | 2 | translucent spotlight, few low-alpha stops, chromatic, large surface; sanctioned carriers exempt |
| `icon-tile-stack` | `icon-tile-stack` | P3 | 2 | a decorated tile containing a smaller icon, stacked above a heading |
| `extreme-negative-tracking` | `crushed-tracking` | P3 | 2 | letter-spacing at or below −0.045em on 20 or more characters |
| `broken-image` | `broken-image` | P1 | 1 | an `<img>` with an empty/missing src, or a naturalWidth of 0 |
| `script-error` | `script-error` | P0 | X | the probe session's page-error capture |
| `edge-flush-cards` | `edge-flush-cards` | P3 | 1 | an at-rest horizontal scroller with a card flush one edge, gutter the other |
| `gray-on-color` | `gray-on-color` | P2 | X | achromatic mid-luminance text over a chromatic backdrop |
| `layout-transition` | `layout-transition` | P3 | 2 | computed transition on width/height/padding/margin with nonzero duration; exempt accordion/collapsible panel slots |
| `line-length` | `line-length` | P3 | 2 | a prose element wider than the reading measure, by in-page glyph-advance measurement |
| `tight-leading` | `tight-leading` | P3 | 2 | line-height/font-size under the ratified leading floor on 50 or more character non-heading text |
| `skipped-heading` | `skipped-heading` | P2 | 1 | a heading-level walk that skips a level |
| `justified-text` | `justified-text` | P3 | 2 | `text-align: justify` without `hyphens: auto` |
| `tiny-text` | `text-below-ramp` | P2 | 4 | rendered text below the resolved micro-step token |
| `undersized-ui-text` | `undersized-ui-text` | P2 | 4 | an interactive control's primary label below the control-label floor |
| `all-caps-body` | `all-caps-body` | P3 | 2 | uppercase on 30 or more characters of non-heading text |
| `wide-tracking` | `wide-tracking` | P3 | 2 | letter-spacing over 0.05em on 20 or more characters of non-uppercase text |
| `text-overflow` | `text-overflow` | P1 | 1 | direct text spilling past its box, or an inline element spilling past its block container |
| `repeated-container-text` | `repeated-container-text` | P3 | 1 | the same short literal at 3 or more structurally distinct positions in one container |
| `clipped-overflow-container` | `clipped-overflow` | P2 | 1 | an overflow-clip container clipping a non-decorative positioned descendant that escapes or declares escape geometry |
| `design-system-font` | `off-theme-font` | P2 | X | a page font census against the token font stacks |
| `repeating-stripes-gradient` | `stripe-background` | P3 | 2 | a repeating linear gradient used as surface decoration |
| `codex-grid-background` | `grid-line-background` | P3 | 2 | two-axis gradient layers tiled by a fixed-pixel background-size cell |

Dev-only tooling chrome (devtools panels, the vite error overlay) is skipped by every sweep by design.
Contrast backdrop resolution treats a layered gradient-plus-url background, or any gradient with a
translucent stop, as `image-indeterminate` (hand-verify) rather than trusting alpha-blind stop math.

## Deduped — our existing rule already covers it

| impeccable id | our rule | note |
| - | - | - |
| `low-contrast` | `contrast` / `text-over-art` | WCAG flat, worst-stop gradient, and indeterminate-image refusal |
| `nested-cards` | `nested-card` | same heuristic family; also enforced at source by the chrome diet |
| `gradient-text` | `gradient-text` | same `background-clip: text` detection |
| `image-hover-transform` | `animated-img-hover` | covers Tailwind hover classes and stylesheet `:hover` rules |

## Rejected or deferred, with reasons

**Conflicts with owner law:**

| rule | reason |
| - | - |
| `kicker-above-heading` | the density-pass spec ratifies the kicker voice as a section's name; impeccable's ban loses here |
| `hero-eyebrow-chip` | same kicker family; no hero register in an app shell |
| `overused-font` | the owner-pinned brand font is Geist, which sits on impeccable's own overused list; adoption would permanently red a deliberate choice |
| `ai-color-palette` | palette is owner-sacred; off-token color is already source-red via the tokens-only biome hook |
| `cream-palette` | a dark owner-themed app; the failure class cannot ship through the token pipeline |
| `gpt-thin-border-wide-shadow` | measured: the rule's border-alpha floor never engages against our low-alpha bordered overlays; the defect class it points at, a hand-rolled elevation recipe instead of the sanctioned shadow token, is already owned at source by `no-off-token-radius-shadow` |
| `pulsing-dot` | this app's presence/typing indicators are genuinely-live indicators, the rule's own carve-out |
| `blinking-cursor` | the streaming caret is real live activity, not a decorative hero cursor |

**Register mismatch (landing-page rules; this is an operate-register app shell):**

| rule | reason |
| - | - |
| `oversized-h1` | no display heroes in the shell registers |
| `italic-serif-display` | no display heroes; faces are token-pinned to Geist |
| `shape-assembled-illustration` | empty-state decorations and the weave glyph are sanctioned brand marks, not a hero-illustration class |
| `numbered-section-labels` | no realistic surface; stays a §6 human-judgment tell |
| `monotonous-spacing` | structurally blind to our semantic spacing vocabulary, an adapt candidate rather than a closed rejection (see "Blind is not inapplicable" above); not yet ported |
| `first-viewport-column-overflow` | fold-balance is a landing-page concern; shell panes scroll by design |
| `body-text-viewport-edge` | shell geometry provides gutters by construction |
| `content-hidden-at-rest` | scroll-reveal gating is banned by our motion law and unused |
| `marquee` | no marketing surfaces |
| `heading-rhythm` | flowing-document rhythm; our surfaces are componentized panes |

**Content confusion (rendered text in a chat app is model/user content, not UI copy):**

| rule | reason |
| - | - |
| `em-dash-overuse` | would grade the model's prose in the transcript as a UI defect |
| `marketing-buzzword` | same content confusion; UI-chrome copy stays a §13/§15 human review |
| `aphoristic-cadence` | same |
| `theater-slop-phrase` | same |

**Redundant against the token pipeline (already impossible by construction at source):**

| rule | reason |
| - | - |
| `design-system-color` | computed colors derive from tokens; a computed census cannot attribute alpha-composites |
| `design-system-radius` | radius steps are tokens; assignment is the `density-tier` gate's job |
| `design-system-font-size` | ramp membership is enforced at source; the legibility half survives as `text-below-ramp`/`undersized-ui-text` |

**Deferred on cost and quality honesty (rejected for now, not a never):**

| rule | reason |
| - | - |
| `text-occlusion` | a large stacked-heuristic port with its own fixture corpus, not ported; overlap is covered today by `--expect-no-overflow`, `clipped-overflow`, `text-overflow`, and the driven review |
| `cramped-padding` (both variants) | neither variant shipped; a rule that is genuinely wanted gets its own build and its own `design-audit-rule-proof` pair, not a table cell |
