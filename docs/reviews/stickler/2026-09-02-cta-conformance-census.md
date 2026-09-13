---
kind: review
status: active
updated: 2026-09-02
---

# CTA conformance census (#1224) — are the CTAs ingesting the theme/CSS system?

Lane `cb-cta-census` (stickler, investigation-only). Tree: worktree HEAD `4dd625663` (clean).
Charge: the owner's itch, verbatim — "are we a hundred percent sure all of our CTAs are getting and
using the various css and themes that everything else uses… they might be rolling their own or not
ingesting all what they need — especially geometry and sizing and all our colors and themes."

**Verdict up front: the CTA population is conformant.** 675 CTA-shaped controls across
`packages/client/src/{features,compose}`; 97% are `@orb/ui` primitives directly, the rest are
feature-local wrappers that bottom out in `Button`, plus exactly ONE raw `<button>` (the shell scrim,
in the sanctioned shell tier). Zero Base UI hand-wraps (impossible by resolver physics), zero `tv()`
recipes outside `@orb/ui`, zero unstamped stamped-axis recipes (gate live, baseline `{}`), and — with
the theme settled — **zero theme-frozen controls** across Hearth/Mocha/Light on three CTA-dense
surfaces, with the positive controls matching the token value-sets numerically. Two findings, both
low-ceiling: a three-site call-site-skin family that shadows the `outline` intent arm (F1), and a
snap `--theme` timing hazard that produced 24 false "frozen" rows before a control probe caught it
(F2, instrument class).

## Findings

### F1 — LOW (drift class, not pixels): ghost-intent Buttons hand-composing the `outline`/card skin at the call site, corrupting the #1080 authored-identity stamp

Three sites paint a border (and in one case a fill) onto `intent="ghost"` Buttons via `className`,
rebuilding what the intent axis already declares or what a variant arm should own:

| Site | Hand-spelled skin | What the axis owns |
| - | - | - |
| `packages/client/src/features/rpg/components/rpg-card-row.tsx:26` (className at the same element) | `border border-border` on `intent="ghost" size="inline"` | `intent="outline"` is EXACTLY ghost + `border border-border bg-transparent` (`packages/ui/src/primitives/button/variants.ts:54`) |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx:108` (`TILE_CLASS`, mounted :189) | `rounded-control border border-border bg-card px-row py-field` on `intent="ghost" size="inline"` | the border half duplicates `outline`; the `bg-card` fill is a card-tile skin NO intent arm owns — a feature-decided component skin |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx:127` | `rounded-control border border-border p-row` on `intent="ghost" size="sm"` | border duplicates `outline`; `p-row` overrides the `sm` arm's sealed `px-block` (CONTROL_SIZE, `packages/ui/src/lib/control-size.ts:5`) |

- **Concrete failure scenario (why this matters beyond taste):** the #1080 stamp seam
  (`packages/ui/src/lib/variant-attrs.ts`) exists because "with zero emitters, a `size="glyph-xs"`
  button beside a `size="lg"` button folded into ONE authored decision" (its own header, citing F8 of
  `docs/reviews/stickler/2026-09-02-uiaudit-orbui-mechanism-audit.md`). These three sites stamp
  `data-intent="ghost"` while PAINTING outline/card — so the ui-audit walker's authored-target
  identity (`TARGET_VARIANT_ATTRS`, which reads the stamp off the target element and never the
  classes) folds a plain ghost button and a bordered card-tile into ONE authored decision again. The
  collapse the stamp was built to kill is rebuilt through the call-site class channel, which no gate
  reads (`ui-size-via-variant` covers box axes only; `no-arbitrary-tw-values` passes token
  utilities).
- **Rendered consequence: none today.** All three paints are token-sourced; the rendered arm below
  confirmed every sampled control retints across all three shipped themes. This is an identity/
  one-home defect ("a skin decided in a feature is how two rails drift" — variants.ts's own recurring
  phrase, lines 161–162 and 179), not a broken pixel.
- **Evidence this session:** full file reads of `variants.ts` + the three sites; the census JSONL
  (`reports/stickler/scratch/cb-cta-census.jsonl`, gitignored scratch) row for each; the outline-arm
  equivalence read directly off `buttonVariants` (`ghost` = `text-current ${ACCENT_HOVER}
  active:bg-accent/80`; `outline` = same + `border border-border bg-transparent`).
- **Remediation shape (orchestrator routes; I fixed nothing):** repoint `rpg-card-row` and
  `assembly-preview` to `intent="outline"` (byte-equivalent paint for the border half); for the
  pack-tile decide whether the card-tile reading deserves a named arm (a `tile`/card intent or a
  ListRow/Card recomposition) — `TEACHING_ACTION_BUTTON`'s own in-place note
  (`new-chat-picker-surface.tsx:105-107`, "the fix then is a Button variant… with both sites
  repointed and this constant deleted. Do not mint it for one site") is the house posture to follow.

### F2 — P2 (instrument lies): snap `--theme` applies AFTER readiness — a first-surface `--eval`/`--contrast` receipt silently samples the DEFAULT palette

- **What happened:** my first three-arm batch reported ALL 24 sampled home-surface controls
  paint-IDENTICAL across `--theme none|Mocha|Light` while config/characters moved — 24 false
  "theme-frozen" findings. The control probe
  (`reports/stickler/scratch/cb-cta-probe.log`) showed why: under `--theme Light`,
  `document.documentElement.dataset.theme` read `"(none)"` at EVAL\[0] (home, post-readiness) AND at
  EVAL\[1] (after `--goto config`), and only read `"light"` by EVAL\[2] — the shimmed theme lands via
  the settings read some time after `data-app-ready`, and nothing in the run gates evidence
  collection on it.
- **Failure scenario for other lanes:** any agent taking a `--theme <arm>` receipt (`--eval`,
  `--contrast`, a screenshot) on the first surface of a run measures the DEFAULT (Hearth) palette
  while believing it measured the arm — theme-coverage claims, contrast verdicts, and polarity
  receipts all inherit the lie, in the false-CLEAN direction for "does the theme reach X" questions
  and the false-POSITIVE direction for frozen-paint questions (my 24 rows).
- **Workaround used (verified):** `--wait-for 'html[data-theme=light]'` (resp. `=mocha`) before the
  first eval; re-runs then showed all sampled controls moving. **The workaround cannot cover
  Hearth** — Hearth is spelled as the ABSENCE of `data-theme`
  (memory: `light-theme-polarity-receipts` addendum 2), so "not yet applied" and "Hearth applied" are
  the same selector state; only snap itself knows the resolved arm and can gate readiness on it.
- **Fix contract (per `.claude/rules/gates-and-tooling.md`, "a tool caught lying gets its permanent
  pin"):** when `--theme` resolves to a NON-default arm, snap should hold evidence collection until
  the resolved `[data-theme]` attribute is present (it already resolves the arm against
  `settings.listThemes`); for the default arm it should state in the RESULT line that the arm is
  attribute-indistinguishable from the pre-landing state. Ships with a planted control in both
  directions.
- **Evidence:** `reports/stickler/scratch/cb-cta-{hearth,mocha,light}.log` (the raced batch, 24
  frozen rows), `cb-cta-probe.log` (the `(none)`/`(none)`/`light` sequence), and
  `cb-cta-{hearth2,mocha2,light2}.log` + `cb-cta-diff2.py` (the settled re-run: 50 control identities
  moved, 0 frozen). Reported to the orchestrator mid-run by SendMessage.

## Arm 1 — the structural census (population + classification)

Method: ts-morph over the whole repo (`createCodemodProject`), every `JsxOpeningElement`/
`JsxSelfClosingElement` in `packages/client/src/{features,compose}/**/*.tsx` — **604 files, 7,931 JSX
elements scanned**, emitting a row per clickable-shaped element (`onClick`/`onDoubleClick`/
`onAuxClick`/`onPointerDown`/`onMouseDown`/`onContextMenu`/`href`/widget `role`/an interactive
`@orb/ui` tag) and per `@orb/ui` element carrying a `className`. Script:
`reports/stickler/scratch/cb-cta-census.ts`; output `cb-cta-census.jsonl` (1,843 rows).

**Population: 675 CTA-shaped rows.** By host:

| Class | Count | Detail |
| - | - | - |
| (a) `@orb/ui` primitive directly | 656 | Button 467 · Menu family 79 (incl. 5 `MenuLinkItem` `href` rows — the only anchors in the population) · ListRow 49 · Toggle 30 · ToggleGroup 15 · FileTrigger 6 · SelectionBar 3 · OptionStrip 2 · Command 2 · Card 2 · SaveBar 1 |
| (a′) feature-local wrapper bottoming out in Button | 17 | `RailButton` (app-shell/components/rail-button.tsx — Button `ghost/icon` + Tooltip), `TopbarIconButton` (shell-topbar.tsx:65 — Button `ghost/icon`), `RailAction` (character-filter-rail-parts.tsx:273), `RosterChipButton` (chat-header.tsx:138), `ClearFilterGlyph` (chat-list-surface.tsx:125 — Button `icon-sm`), `IconAction` (persona-panel-row\.tsx:426). Every definition read in full this session; all render `@orb/ui` Button. |
| (b) Base UI part hand-styled in a feature | **0** | Impossible by resolver physics: `packages/client/package.json` declares no `@base-ui/react`; corroborated by an ast-grep import sweep (673 tsx + 591 ts scanned, zero matches — only comments mention base-ui). |
| (c) raw element with hand-rolled classes | **1, sanctioned** | `features/app-shell/surfaces/app-shell.tsx:377` — the shell SCRIM `<button className="shell-scrim">` (full-viewport dismiss target; shell tier is the cited `SANCTIONED_HOMES` row of the `no-raw-interactive-intrinsics` gate; `.shell-scrim` paints the `--scrim` token in shell.css). |
| (d) raw element with NO styling path | **0** | Second method: ast-grep `<button …>` over features+compose (604 files scanned) → exactly the one scrim; `<a …>` → zero elements; `compose/` (4 files) has zero clickables (grep corroboration). |
| Non-CTA rows the sweep caught | 2 | `chat-list-row.tsx:96` `<Stack className="contents" onPointerDown…>` — a documented PASSIVE prefetch-warming wrapper (display:contents, cites `setting-teach-row.tsx` as the ratified precedent); `config-welcome.tsx:242` `<Card role="region" onClick>` — the operable control is the real Button inside; the Card click is a pointer-convenience door, in-place WHY present. |

The two clickable Cards conform to the Card primitive's own contract
(`packages/ui/src/primitives/card/card.tsx`): home's hero is the native `as="button"` arm
(home-hearth-room.tsx:106, with the side-eye P3-4 rationale inline); config-welcome deliberately
names itself `role="region"` and delegates operability to the inner secondary Button.

**What the (c)+(d) headline would have hand-spelled: nothing.** The geometry/sizing question the
brief asked ("what h-*/px-*/text-*/rounded-* would the primitive own?") has no raw-element carrier —
the belts that make this so are `no-raw-interactive-intrinsics` (BURN_DOWN `{}` — read in full),
`no-interactive-role-in-features` (BURN_DOWN `{}`), the compose-only ESLint keystone
(`eslint.config.js:231-241,687-719` — className/style banned on raw intrinsics across CLIENT_SRC,
exemptions: app-shell, state, weave-glyph, tests), and resolver physics for (b).

### The call-site className census on Button (the gates' declared blind spots, hand-reviewed)

467 Button rows: 379 no className · 69 literal · 19 computed. All 88 read this session. The
overwhelming vocabulary is sanctioned call-site layout (`justify-start`, `min-w-0`, `flex-1`,
`shrink-0`, `self-start`, `w-full`, absolute positioning for stretched-overlay rows). The soft rows
(none gate-visible, each checked against its in-place context):

| Site | Classes | Verdict |
| - | - | - |
| F1's three sites | border/fill skin | **finding — see F1** |
| `rpg/components/rpg-scene-tab.tsx:295` | `border border-transparent px-field` on ghost/inline | benign: transparent border is a layout reserve against a bordered sibling, not a skin |
| `rpg/components/rpg-header-band.tsx:43` | `text-accolade hover:text-accolade` | designed: crown-gold veiled-truth cue, in-place WHY (the hover pin keeps the cue's ink through ACCENT_HOVER) |
| `character/components/character-filter-rail-parts.tsx:289` | `text-muted-foreground underline decoration-dotted` | designed: the disclosure-underline ruling is written at :271-272 (side-eye 2026-08-17 taste (d)) |
| `preset/components/readout/prompt-readout.tsx:287` | conditional `bg-primary/10` selected tint | follows the LIST-ROW selection language (left-ember-bar + primary/10 — `character-facet-row.tsx:57-60` documents it as "the chats-lane list-row pattern", token-driven) rather than Button's `selection` axis (accent + inset-ring). Two selection vocabularies exist BY PATTERN (control-selection vs row-selection); this Button uses the row language without the `data-selected` marker the Row variant carries. Census note, not a defect. |
| `config/components/config-list-group.tsx:195` · `config-list-collection-group.tsx:158,242` | `px-tight`/`px-field` on `sm`-ramp Buttons | padding overrides on a control-ramp size whose arm carries `px-block`. Deterministic post-#146 (spacing scale registered in tailwind-merge) and token-valued; `ui-size-via-variant` deliberately scopes to h/min-h/size/w, so padding is un-policed by design. Census note. |
| `chat/surfaces/new-chat-picker-surface.tsx:242` | `disabled:opacity-100 data-disabled:opacity-100` | designed single-site exception with the variant-mint rule written beside it (:105-107) |
| shell-class carriers (`shell-rail-button`, `shell-topbar-icon-btn`, `shell-chat-member-chip`, `shell-chat-recall-chip`, `shell-character-hero-echo`, `shell-scrim`) | authored `.shell-*` classes on Buttons, incl. from features (notification-bell, chat-header, character-hero-band) | designed: `.shell-*` is the stable API §4.3 names; the declarations read in shell.css are IA sheds (`display:none` under `:has()`/container queries), touch floors (`min-width/height: var(--spacing-touch-target)`) and flex fences — geometry law, token-sourced, not component skins |
| `ui-size-via-variant` ALLOWLIST rows (2 × `w-auto` Select, context-rail Badge dot) | — | gate-cited survivors, reasons in the gate file |

**The `(--var)` LIMIT-2 hole (owned by neither gate), swept live:** every `h-|w-|size-|min-h-(--…)`
in features/compose enumerated (grep, 20 distinct sites) — all are widths on layout kit /
Text `max-w` reading-measures / `PopoverPopup` panel geometry (`persona-panel-surface.tsx:148`) /
column-width vars on unsized boxes. **Zero defeat a sealed size axis today.** The hole itself remains
open exactly as the gate header documents.

**Fake-CTA sweep:** `bg-primary|shadow-cta|text-primary-foreground` across features/compose — no
non-Button element composes a primary-CTA look; hits are a progress hairline, monogram inks, theme
swatches, and the app-shell context-rail active tint (shell tier).

## Arm 2 — the stamp census

- **Inside `@orb/ui` (where every `tv()` recipe lives): fully stamped, machine-held.** The
  `ui-variant-axes-stamped` gate is ACTIVE (A1 unstamped · A2 unreadable-config fail-closed · A3
  duplicate names · A4 stale rows · A5 vocabulary-blindness tripwire — file read in full) and its
  committed baseline is **`{}`** (`ui-variant-axes-stamped.baseline.json`, read this session) — no
  budgeted unstamped remainder. Button routes through the preferred `variantProps` door
  (`button.tsx:57`) and additionally emits the `data-cta` marker on primary (:54).
- **In features: there is nothing to stamp.** `tv($$$A)` over `packages/client/src`: **zero matches**
  (ast-grep, 591 ts + 673 tsx files scanned, both languages; planted positive control: the same
  pattern over `packages/ui/src` matches the recipe population — `theme-swatch`, `color-field`,
  `spinner`, `log-viewer`, `diff` variants printed). No feature imports a `*Variants` config
  (variants are seal-internal per §13.7; grep corroboration found only comments).
- **The one stamp-integrity defect is semantic, not mechanical** — F1: sites that stamp
  `data-intent="ghost"` and paint outline/card. The gate can never see this (it proves the recipe
  reached A door, not that call-site classes don't shadow an arm — the same "the gate only proves the
  recipe reached A door" limit memory `variant-axis-stamp-goes-on-the-target-element` records for
  wrapper stamps).
- **Unstamped-but-should list: empty.**

## Arm 3 — rendered theme reactivity (the decisive arm)

Isolated stage at `4dd625663` (`snap --isolated --ref`), all rendered work in one stage session,
`--stage-down` as the last act (exit 0, "tore down stage 4dd625663b39"). Cold warm-up run discarded
as a non-verdict (readiness DEGRADED — the known cold-stage churn). Instrument: repeated `--eval`
sampling every visible `[data-slot=button]`/`[data-slot=card-root]` (26-row cap per eval, deduped by
`label|intent|size`), recording computed `backgroundColor`/`color`/`borderTopColor` (compacted but
deterministic — identical transform per arm, so cross-arm identity comparison is sound).

- **Surfaces:** home (hero Card, doorway/secondary CTAs, rail buttons), config (welcome Cards,
  secondary door Buttons, list bands), characters (filter chips: outline intent + selection axis).
- **Arms:** `--theme none` (Hearth = attribute absence), `--theme Mocha`, `--theme Light`
  (the three shipped themes — never a pair; memory `light-theme-polarity-receipts`).
- **First batch invalidated by F2** (24 false frozen rows on the first-sampled surface); settled
  re-runs used `--wait-for 'html[data-theme=<arm>]'` (Mocha/Light) and sampled home LAST.
- **Result: 50 distinct control identities compared across all three arms on home+config → 0 frozen**
  (`cb-cta-diff2.py`); the characters surface (sampled at the third checkpoint of the first batch,
  after the shim had landed) also showed 0 frozen across arms.
- **Positive controls (decoded computed values, per the polarity-receipt rule — never the eye):**
  - secondary "Skip to content": ink `oklch(0.955 0.004 75)` Hearth → `oklch(0.95 0.012 250)` Mocha →
    `oklch(0.24 0.01 60)` Light (polarity flip);
  - primary "Add a search connection": FILL `oklch(0.72 0.175 52)` → `oklch(0.7 0.14 250)` →
    `oklch(0.5 0.16 50)` — matching `tokens/themes/{mocha,light}.json` `color.primary`
    `[0.7,0.14,250]` / `[0.5,0.16,50]` exactly;
  - the hero `Card as="button"`: bg `0.205` warm → `0.21 250` → `0.995 75`, matching `color.card`
    per value-set.
- **Theme-frozen list: EMPTY. Designed-vs-drift table: nothing to classify.**

## Converge-vs-gate recommendation

The CTA class does **not** need its own gate arm for the owner's headline question — the population
is already funneled through the primitives by four live belts plus resolver physics, and the rendered
arm shows full cascade ingestion. The one open drift channel is **call-site skin classes that shadow
a declared variant arm** (F1's family): invisible to `ui-size-via-variant` (box axes only) and to
`no-arbitrary-tw-values` (token utilities pass). Recommend: (1) CONVERGE now — repoint the three F1
sites (two are byte-equivalent `intent="outline"` swaps; the pack-tile wants a small design decision)
in a normal fix lane; (2) mint a gate only if the family recurs — the precise predicate ("a className
token re-spelling a class present in the target primitive's own variant arms") needs the same
slot/variant-prefix awareness the `ui-size-via-variant` header already escalated for the min-w fence,
i.e. a gate-mechanism project, not a regex. That matches the house posture written in that gate's
header ("escalated rather than half-shipped"). Separately, F2's snap fix is a P2 instrument row on
the FIX-TOOLS-AS-THEY-LIE standing rule.

## Verified clean (what my silence covers)

- **Whole-tree `pnpm check` NOT run** — banned in lanes (owner ruling 2026-07-25, constitution §4);
  gate verdicts are taken from the committed state at HEAD `4dd625663` (green-to-commit) plus
  in-session full reads of the four load-bearing gate files and their committed empty
  baselines/burn-downs (`no-raw-interactive-intrinsics`, `no-interactive-role-in-features`,
  `ui-size-via-variant`, `ui-variant-axes-stamped`).
- Law read in full: `client-architecture-lockdown.md` §0-§6 (incl. all of §4),
  `ui-package-design.md`, `UI-Primitives-and-Reuse.md`, `variant-attrs.ts`, `button/button.tsx`,
  `button/variants.ts`, `card/card.tsx`, the ESLint keystone blocks, `control-size.ts` (CONTROL_SIZE
  region), shell.css lines 770-900.
- Sweeps (each with scanned-file counts + a second method): ts-morph census (604 files / 7,931
  elements); ast-grep raw-`<button>`/`<a>` (604 files); ast-grep Base UI imports (673+591 files, grep
  corroboration); ast-grep `tv()` in client (673+591 files, positive control in ui); grep
  `-(--var)` size utilities; grep `bg-primary|shadow-cta|text-primary-foreground`; grep `.shell-*`
  consumers outside app-shell (29 files, declarations hand-read).
- Hand-verified sites: all 88 className-carrying Button rows; all 6 local CTA wrappers; both
  clickable Cards; the Stack pointer-wrapper; the scrim.
- Rendered: 3 theme arms × 3 surfaces on an isolated stage at HEAD, settled-theme re-runs, positive
  controls cross-checked against the token value-sets, stage torn down.
- **Regions NOT read / declared limits:** the 79 Menu / 49 ListRow / 30 Toggle rows were classified
  by import source, not per-site hand-read (they carry no classNames of interest — the census records
  className presence per row and these were `cn=none` except the sites listed above). The census
  cannot see an `onClick` arriving via `{...props}` spread (structural limit, same class as the
  gates' LIMIT 1). Rendered sampling capped at 26 controls/surface/arm (~50 identities on home+config
  - 26 on characters), and covered three of the ten sections; menus/popovers were not opened, and
    hover/active/focus paints were not driven (rest-state only). The multi-human-gated affordances
    (notifications bell) are absent on a single-user isolated stage by design
    (memory: `isolated-stage-db-is-a-fresh-dev-copy`).

## Unconfirmed, low priority

- Two config-surface identities ("Playing as T…", "Actions for…") were sampled in only 2 of 3 arms —
  26-row cap + population jitter between arms; not chased, no frozen signal among their sampled arms.
- Whether the `data-app-ready` DEGRADED state on the cold stage shares a root with F2's late theme
  landing (both are reads-in-flight-at-readiness) — not investigated; F2 reproduces on WARM runs, so
  it stands alone.

## Proposed memory lessons (orchestrator owns the write)

- Index line: `[--theme lands late](snap-theme-shim-lands-after-readiness.md)·— a --theme receipt on
  the first surface samples the DEFAULT palette; wait-for [data-theme=<arm>] (impossible for Hearth =
  attribute absence — fix belongs in snap)`
  Body: type project. Under `snap --theme <arm>`, `html[data-theme]` was still unset at the first
  post-readiness `--eval` AND after the first `--goto` (measured 2026-09-02, lane cb-cta-census:
  `(none)`/`(none)`/`light` across three checkpoints of one run); a first-surface eval/contrast/
  screenshot silently measures Hearth. **Why:** the shim rides the settings response; nothing gates
  evidence on the theme having applied; cost 24 false theme-frozen rows. **How to apply:** gate any
  `--theme` receipt on `--wait-for 'html[data-theme=<arm>]'` or sample the themed surface last;
  Hearth cannot be waited on (absence-spelled) — treat first-surface Hearth receipts as suspect until
  snap gates readiness on its own resolved arm.
- Index line: `[stamp v call-site skin](call-site-classes-shadow-the-variant-stamp.md) — data-intent
  says ghost while className paints outline: the #1080 census collapse rebuilt through the class
  channel; gate proves the door, never the shadow`
  Body: type project. `ui-variant-axes-stamped` proves a recipe reached a stamp door; a call-site
  `border border-border`/`bg-card` on a ghost Button re-creates the F8 authored-identity collapse
  (walker reads TARGET_VARIANT_ATTRS, not classes). Founding sites: rpg-card-row\.tsx,
  rpg-pack-rows.tsx TILE_CLASS, assembly-preview\.tsx (2026-09-02, #1224 census). **How to apply:**
  when auditing authored decisions off the stamp, sweep the same elements' classNames for tokens that
  re-spell a sibling arm; when reviewing a ghost+border call site, the fix is `intent="outline"` or a
  named arm, never the class.

## Issue summary (paste into #1224)

Census complete (docs/reviews/stickler/2026-09-02-cta-conformance-census.md): the itch is settled in
the tree's favor. 675 CTA-shaped controls in features+compose (604 files, 7,931 JSX elements): 97%
are @orb/ui primitives directly, the rest feature-local wrappers that bottom out in Button; exactly
one raw `<button>` exists (the shell scrim, sanctioned shell tier), zero hand-styled Base UI parts
(impossible by resolver physics), zero tv() recipes outside @orb/ui, zero unstamped stamped-axis
recipes (gate live, baseline {}). Rendered arm: 3 theme arms x 3 surfaces on an isolated stage at
HEAD — ZERO theme-frozen controls; positive controls (primary fill, secondary ink, hero card bg)
match the token value-sets numerically, Light polarity confirmed by decoded computed values. Two
findings, severity ceiling LOW/P2-instrument: F1 — three call sites paint intent="ghost" Buttons with
`border border-border` (+`bg-card` once), rebuilding the outline/card skin at the call site and
corrupting the #1080 data-intent authored-identity census (fix: two byte-equivalent
`intent="outline"` swaps + one small design call on the rpg pack tile; gate only if the family
recurs). F2 — snap `--theme` applies AFTER data-app-ready: a first-surface --eval/--contrast receipt
silently samples the DEFAULT palette (measured `(none)`→`(none)`→`light` across one run's
checkpoints; produced 24 false frozen rows before the control probe caught it); workaround
`--wait-for 'html[data-theme=<arm>]'` cannot cover Hearth (attribute-absence) — snap-side fix, P2
per the instruments-that-lie rule. No product pixel defect found; no gate arm needed now.
