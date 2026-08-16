# Impeccable → orbweaver adoption record (detector triage + attribution)

> **What this is:** the durable design record for GitHub issue #83 — "using impeccable and
> integrating it into our stuff." All 59 deterministic detector rules from
> [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (read at the read-only clone
> `~/inktomi-stack/development/skills-reference/impeccable`, registry
> `cli/engine/registry/antipatterns.mjs`, implementations `cli/engine/rules/checks.mjs`) triaged
> adopt / adapt / reject against orbweaver law, with the reason on every row. The adapted rules
> live in OUR detector home — `scripts/probes/design-audit-walker.ts` (in-page fact gathering) +
> `scripts/probes/design-audit-checks.ts` (pure verdicts, unit-tested at
> `tests/tooling/design-audit.test.ts`) — and run via `pnpm design-audit`. The 23-command design
> vocabulary is adapted in `SKILL.md` §15; the DESIGN.md-equivalent context distillation is
> `reference/design-context.md`.

## License & attribution

Impeccable is **Copyright 2025 Paul Bakaus, Apache License 2.0** (upstream `LICENSE`). Apache-2.0
permits derivative works with attribution; the adapted detector logic in
`design-audit-walker.ts` / `design-audit-checks.ts` carries a per-file attribution header naming
the upstream project, license, and the fact of modification (Apache-2.0 §4b "prominent notices
stating that You changed the files"). Upstream's `NOTICE.md` covers only its `ios.md`/`android.md`
platform references (MIT, ehmo/platform-design-skills) — nothing from those files was adapted, so
no NOTICE propagation is owed. Nothing here grants use of the "Impeccable" name beyond describing
origin (Apache-2.0 §6). **If this repository is ever redistributed, a copy of the Apache-2.0
license text must accompany the adapted files** (today it is referenced by URL:
<https://www.apache.org/licenses/LICENSE-2.0>).

Every adapted finding is origin-tagged: `Finding.origin === "impeccable"` in the
`reports/design-audit/*.json` report; our pre-existing rules carry `origin: "orbweaver"`.

## Why adaptation-into-our-home (alternatives weighed)

- **REJECTED — vendor impeccable's CLI engine and run it beside design-audit.** Two detector
  homes for one concept (violates one-home); their engine assumes a `DESIGN.md`/`PRODUCT.md`
  context flow we deliberately do not adopt (our design truth is generated law — see
  `design-context.md`); it runs on puppeteer (not in our tree; ours is Playwright); it carries its
  own severity vocabulary (`slop`/`quality` + `advisory`/`error`) and ignore grammar
  (`data-impeccable-ignore`) that would fork our P0–P3 report contract.
- **REJECTED — adopt their regex/source engine (`detect-text.mjs`) for source scanning.** Source
  enforcement is the gate battery's home (biome tokens-only hook, `density-tier`,
  `no-off-token-radius-shadow`, …). A second source scanner under `scripts/probes` double-homes
  enforcement. Our detector stays RUNTIME — it judges rendered truth.
- **CHOSEN — re-implement the applicable mechanisms in our three-part architecture** (in-page
  fact walker gathers raw samples; pure Node checks decide; the runner reports). Thresholds and
  detection recipes are taken from impeccable (credited); the code is written to our house shape
  so every verdict stays fixture-testable without a browser.

## Severity mapping

Impeccable has categories (`slop`/`quality`) + flags (`advisory`, `error`). We keep OUR P0–P3:
`error` → P0 · real user-facing breakage → P1 · law-backed defect / strong signal → P2 ·
taste-tell / advisory → P3. `pnpm design-audit --fail-on` semantics unchanged (default P1).

## Triage — all 59 rules

**Counts: 29 ADAPTED · 4 DEDUPED (ours already covers — keep ours) · 26 REJECTED.**

### Adapted (29) — now live in `pnpm design-audit`

| impeccable id | our rule id | P | mechanism (as adapted) |
| - | - | - | - |
| `side-tab` | `side-tab` | P3 | dominant chromatic edge border (≥2px, ≥2× other sides; L/R any radius or ≥3px; T/B 3–12px band); exempt tab-context, status/alert, safe tags |
| `border-accent-on-rounded` | `border-accent-on-rounded` | P3 | thick chromatic top/bottom border + border-radius (same sampler as side-tab) |
| `flat-type-hierarchy` | `flat-type-hierarchy` | P3 | page font-size census: ≥3 sizes with max/min ratio < 2.0 |
| `bounce-easing` | `bounce-easing` | P2 | animation-name /bounce\|elastic\|wobble\|jiggle\|spring/ or overshoot cubic-bezier (y outside [-0.1,1.1]); P2 because motion law §4.3 hard-bans it |
| `dark-glow` | `glow-shadow` | P3 | chromatic box/text-shadow: zero-offset halo anywhere, or blurred chromatic shadow on a dark backdrop; message names the sanctioned carriers (`--shadow-glow` rides `::before`; element-level shadows are never the sanctioned form) |
| `radial-halo` | `radial-halo` | P2 | saturated radial wash: fades to transparent, a chromatic stop at alpha ≥ 0.45, surface ≥ 240×160 |
| `radial-spotlight-glow` | `radial-spotlight-glow` | P3 | translucent spotlight: ≤2 visible stops all alpha < 0.45, ≥1 chromatic, fades out, large surface; sanctioned carriers exempt (`[data-slot=empty-state-decoration]`, `[data-slot=media-grid-cell]`, `.orb-weave-glow`) |
| `icon-tile-stack` | `icon-tile-stack` | P3 | 32–128px squarish decorated tile containing a smaller icon, stacked above a heading (brief-named blind spot) |
| `extreme-negative-tracking` | `crushed-tracking` | P3 | letter-spacing ≤ −0.045em on 20+ chars (skill §2 floor is −0.04em; fire strictly below it) |
| `broken-image` | `broken-image` | P1 | `<img>` with empty/missing src, or complete with naturalWidth 0 |
| `script-error` | `script-error` | P0 | runner-side: the probe session's `pageerror` capture (deduped, capped 3) |
| `edge-flush-cards` | `edge-flush-cards` | P3 | at-rest horizontal scroller with a decorated card flush one edge + gutter the other (clip-box narrower than panel) |
| `gray-on-color` | `gray-on-color` | P2 | achromatic mid-luminance text over a chromatic backdrop (brief-named blind spot); pure check over the existing contrast samples |
| `layout-transition` | `layout-transition` | P3 | computed transition-property names width/height/padding/margin(+longhands) with duration > 0; exempt accordion/collapsible panel slots (motion law §3.7 sanctions their measured-var height) |
| `line-length` | `line-length` | P3 | prose-tag element wider than ~85 estimated chars/line (est = width / (fontSize·0.5)) |
| `cramped-padding` | `cramped-padding` | P3 | direct-text element with a visible boundary and padding under max(4, fs·0.3) vertical / max(8, fs·0.5) horizontal (impeccable's element arm; the flush-children container arm NOT ported — see rejected notes) |
| `tight-leading` | `tight-leading` | P3 | line-height/font-size < 1.25 on 50+ char non-heading text — floor bound to OUR smallest ratified leading step (`leading.label` 1.25), not impeccable's 1.3, so ratified label-voice text stays legal |
| `skipped-heading` | `skipped-heading` | P2 | page heading-level walk (h1→h3 with no h2); P2 because UIP §13.10 N7 is law here |
| `justified-text` | `justified-text` | P3 | text-align justify without hyphens:auto |
| `tiny-text` | `text-below-ramp` | P2 | any rendered text (≥2 chars) below the resolved `text.micro` token (10.5px) — bound to the LIVE ramp via `@orb/ui/tokens`, replaces impeccable's fixed 12px body floor (which would false-red the ratified micro voice) |
| `undersized-ui-text` | `undersized-ui-text` | P2 | an interactive control's PRIMARY label below 11px — deliberately ABOVE the micro step, keeping impeccable's "being on the ramp doesn't launder legibility" clause for control labels. Refined vs upstream after the first live run: upstream fires on ANY text inside an interactive ancestor, which produced 12 same-class hits on ratified micro-voice captions inside large clickable cards; ours gates on primary-label (direct text ≈ the control's whole text) |
| `all-caps-body` | `all-caps-body` | P3 | uppercase on 30+ chars of non-heading text (the ratified micro-caps voice is short labels; long caps runs are off-law anyway) |
| `wide-tracking` | `wide-tracking` | P3 | letter-spacing > 0.05em on 20+ chars of non-uppercase text (uppercase exemption keeps `tracking.micro` 0.08em caps voice legal) |
| `text-overflow` | `text-overflow` | P1 | direct-text owner spilling ≥16px past its box (scrollWidth arm) or an inline owner spilling past its block container (inline arm); scroll-region/self-ancestor + sr-only + transform-path exemptions ported |
| `repeated-container-text` | `repeated-container-text` | P3 | same 4–48-char literal at 3+ structurally distinct positions inside one decorated container (structural-signature grouping ported) |
| `clipped-overflow-container` | `clipped-overflow` | P2 | overflow-hidden/clip container (not a scroll region, not an intentional viewport) clipping a non-decorative positioned descendant that escapes or declares escape geometry. Refined vs upstream: a `position:fixed` child of the ROOT clip (html/body) is viewport-anchored and NOT clipped by root overflow — toasts/portals live there; only non-root clips flag fixed children |
| `design-system-font` | `off-theme-font` | P2 | page font census vs the token stacks (`font.sans`/`font.mono` from `@orb/ui/tokens` + generic/system fallbacks) — our DESIGN.md-equivalent binding |
| `repeating-stripes-gradient` | `stripe-background` | P3 | repeating-linear-gradient used as surface decoration |
| `codex-grid-background` | `grid-line-background` | P3 | two-axis linear-gradient layers tiled by a fixed px background-size cell |

**Walker-wide hygiene minted from the first live run:** dev-only tooling chrome (TanStack devtools
trigger/panel, react-query devtools, the vite error overlay — `DEV_CHROME_SEL` in the walker) is
skipped by every sweep; it z-index-escalates and root-clips BY DESIGN and was the measured FP source
(5 of 5 non-product findings on the first home-route run, incl. two pre-existing z-index FPs).

**Plus one fidelity fix credited to the same review (not a new rule):** the contrast backdrop
resolver now treats a layered `gradient(...), url(...)` background and any gradient with a
translucent (α < 0.9) stop as `image-indeterminate` (→ `text-over-art` "verify manually") instead
of trusting alpha-blind stop math. This closes design-audit's own documented blind spot ("skips
any gradient background") honestly: it now REFUSES rather than silently passing or lying.

### Deduped (4) — ours already covers; keep OURS

| impeccable id | our existing rule | note |
| - | - | - |
| `low-contrast` | `contrast` / `text-over-art` | ours already does WCAG flat + worst-stop gradient + indeterminate-image refusal |
| `nested-cards` | `nested-card` | same card-like heuristic family; also enforced at source by density CD2 |
| `gradient-text` | `gradient-text` | same background-clip:text detection |
| `image-hover-transform` | `animated-img-hover` | ours covers Tailwind hover classes + stylesheet :hover rules |

### Rejected (26) — with reasons

**Conflicts with owner law (the D-ledger / ratified specs win):**

| rule | reason |
| - | - |
| `kicker-above-heading` | DIRECT CONFLICT: the density-pass spec (§2.3, owner-ruled) RATIFIES the `kicker` voice (caps micro label + hairline rule) as a section's name, realized by `Section.kicker`. Impeccable bans kickers outright; here the ban loses. Named divergence in SKILL.md §15. |
| `hero-eyebrow-chip` | same kicker family + no hero register in an app shell |
| `overused-font` | the owner-pinned brand font is **Geist** (`tokens.json` `font.sans`) — on impeccable's own overused list; adoption would permanently red the owner's deliberate choice. The tell stays in the SKILL as a new-work taste note only. |
| `ai-color-palette` | palette is owner-sacred (D71 theme pipeline); hue heuristics against a token-driven accent are FPs, and off-token color is already source-RED (tokens-only biome hook) |
| `cream-palette` | dark owner-themed app; the failure class (reflex light-beige page bg) cannot ship through the token pipeline |
| `gpt-thin-border-wide-shadow` | CONFLICT: the sanctioned `--shadow-overlay` recipe IS "edge hairline + inset top-highlight + contact + ambient" — the exact pairing this rule flags. Would red every floating panel by design. |
| `pulsing-dot` | a chat app's presence/typing indicators are genuinely-live indicators — the rule's own carve-out; decorative-pulse judgment stays with the reviewer (§6) |
| `blinking-cursor` | the streaming caret is a real live-activity caret (motion guide §4.2 item 10); no hero/landing register exists for the decorative case |

**Register mismatch (landing-page rules; this is an Operate-register app shell):**

| rule | reason |
| - | - |
| `oversized-h1` | no display heroes in the shell registers |
| `italic-serif-display` | no display heroes; faces are token-pinned (Geist only) |
| `shape-assembled-illustration` | empty-state decorations + the weave-glyph are sanctioned brand marks; no hero-illustration class |
| `numbered-section-labels` | no realistic surface; stays a §6 human-lens tell |
| `monotonous-spacing` | an Operate shell's lists/rows are uniform BY LAW (density tier map); rhythm judgment stays in the §3/§13 human lens |
| `first-viewport-column-overflow` | fold-balance is a landing-page concern; shell panes scroll by design |
| `body-text-viewport-edge` | shell geometry provides gutters by construction (panes own padding); the failure needs a bare document flow we don't have |
| `content-hidden-at-rest` | scroll-reveal visibility gating is banned by our motion law and unused; React-managed content fails differently (nav error / script-error covers it). Their reveal-sweep machinery targets a page class we don't ship. |
| `marquee` | no marketing surfaces; motion law + reviewer cover it; keyframe-forensics cost vs an impossible defect class |
| `edge-flush`-adjacent `heading-rhythm` | flowing-document rhythm; our surfaces are componentized panes and message prose is styled once by the markdown seal — a per-route detector buys FP risk, not coverage |

**Content confusion (rendered text in a chat app is model/user CONTENT, not UI copy):**

| rule | reason |
| - | - |
| `em-dash-overuse` | would grade the MODEL's prose in the transcript as a UI defect |
| `marketing-buzzword` | same content confusion; UI-chrome copy stays a §15 `clarify` human lens |
| `aphoristic-cadence` | same |
| `theater-slop-phrase` | same |

**Redundant against the token pipeline (already impossible-by-construction at source):**

| rule | reason |
| - | - |
| `design-system-color` | computed colors derive from tokens (biome tokens-only + theme pipeline); a computed census can't attribute alpha-composites → FP storm |
| `design-system-radius` | radius steps are tokens; ASSIGNMENT is the `density-tier` gate's job |
| `design-system-font-size` | ramp membership is enforced at source; the legibility half survives as `text-below-ramp`/`undersized-ui-text` (which deliberately ignore ramp membership, per impeccable's own laundering clause) |

**Deferred on cost/quality honesty (a rejected-for-now, not a never):**

| rule | reason |
| - | - |
| `text-occlusion` | ~230 lines of stacked heuristics (opacity walks, decorated-box tests, layer attribution) with a large upstream fixture corpus we did not port. A hasty port ships an unproven instrument (the "30 findings, all false" failure class). Candidate for a dedicated follow-up leg with its own fixture corpus; until then overlap is covered by `snap --expect-no-overflow`, `clipped-overflow`, `text-overflow`, and the driven side-eye pass. |
| `cramped-padding` container arm (flush children) | same cost/honesty call — the child-insulation heuristics (~140 lines) were not ported; the element arm was. Documented here, not silently dropped. |

## What the adapted set fills (the brief's named blind spots)

- **gradient-layered backgrounds:** `radial-halo`, `radial-spotlight-glow`, `stripe-background`,
  `grid-line-background`, `glow-shadow` + the contrast resolver's url/alpha honesty fix.
- **AI-tell taste classes:** `icon-tile-stack` (icon-tile-over-heading), `gray-on-color`,
  `flat-type-hierarchy` + `off-theme-font` (font monotony/drift), `side-tab`,
  `border-accent-on-rounded`.
- **Real-defect classes design-audit lacked:** `text-overflow` (our most common rendered-defect
  class at narrow mounts), `clipped-overflow`, `broken-image`, `script-error`, `skipped-heading`,
  the type-legibility floors bound to the live token ramp.
