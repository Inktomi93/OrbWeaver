---
kind: review
status: active
updated: 2026-08-16
---

# Stickler — the Hearth Room home rebuild (#102 + polish + #119)

Fresh-context frontier review of `96d458324` (variant C build, real commit `758bafd5a`),
`861de3e58` (the 16-finding side-eye polish), and `db242f066` (quick-picks caption suppression).
Judged against the constitution, `docs/design/density-pass-spec.md`, the UI law set, and
`reports/side-eye/home-leg-review-2026-08-16.md`. Every touched source file read in full at current
tree state; every claim below carries the command/receipt that produced it this session.

**VERDICT: FINDINGS(7), severity ceiling P2, none merge-blocking.** The build is structurally sound:
the seam discipline (contribution registry, one cache entry, sealed ui homes), the focal recipe, the
a11y outline, and the CT quality are all genuinely good — most review claims re-verified clean against
the rendered app. The seven findings are two P2 correctness defects the design review structurally
could not see, three P3s, and two P4s.

---

## Findings (ranked)

### F1 · P2 — "now ago": the two new sentence sites render broken copy in the most common state

`packages/client/src/features/chat/components/home-masthead-body.tsx:60` and
`packages/client/src/features/chat/components/home-hearth-room.tsx:158`

Both new sentences append the literal `" ago"` to `timeLib.formatRelativeCompact(when)`. The kit's
`compactStamp` returns the WORD `"now"` for any span under one minute (and for any future instant —
clock skew, imported timestamps): `packages/kit/src/time/index.ts:141-148`. So:

- **Failure scenario (high-frequency, not an edge):** the user sends a message, then opens home —
  the newest room's `lastMessageAt` is seconds old. The masthead renders **"You left off now ago in
  The Ashen Spire."** and the hero's credit line renders **"· LAST TURN NOW AGO"** (the `credit`
  voice uppercases it). The hero is the surface's one focal element; this is the state it will most
  often be seen in.
- The kit seam's own contract documents the split this violates: `formatRelativeCompact` is "the
  LIST-ROW stamp form … Use it where the stamp is a COLUMN the eye scans; a sentence ('edited 5m
  ago') keeps `formatRelative`" (`packages/kit/src/time/index.ts:107-110`). The F4 fix's goal
  (escape the 7-day absolute-date horizon without moving it) was right; the composition chosen for
  it produces "now ago".
- Evidence: read of `compactStamp` (no sub-minute unit; returns `"now"`); sweep
  `/usr/bin/grep -rna "formatRelativeCompact" packages/client/src | grep "ago"` → exactly these two
  sites append `" ago"` (10 total call sites enumerated; the other 8 are bare column stamps —
  correct). No CT covers the sub-minute arm (`HERO_STAMP = /^· last turn/u` passes on "now ago").
- The masthead header's claim "the kit horizon is deliberately NOT moved: it is correct everywhere
  else" was verified TRUE (kit untouched by all three merges) — the defect is only the sentence
  composition at these two sites.

### F2 · P2 — quick-picks first-boot skeleton declaration is wrong for its own shipped geometry (~112px under-reserve; the premise died inside this same merge train)

`packages/client/src/features/chat/lib/home-quick-picks-tile.tsx:15` (`QUICK_PICKS_SKELETON_ROWS = 4`)

- The first-boot reservation renders `SkeletonRows count={4}` at its natural height:
  2×`p-block`(12) + 4×`h-control-lg`(40 fine) + 3×`gap-row`(8) = **208px**
  (pitch verified against `tokens.json`: control-lg fine = 2.5rem; `skeleton-rows.tsx` line arm).
- The settled body, measured LIVE this session (`pnpm snap / --eval`): **320.5px** (box-memory
  `chat.quickPicks: 320.5`; rect 321px) — 6 cells at 136×156 in a 3-column `cellFixed` grid
  (`cols: "136px 136px 136px"` read from the rendered grid). First-ever boot therefore grows the
  tile **~112px** when the read lands, pushing `chat.tempChat` and `databank.documents` down the
  shelf — the exact #92 defect class this merge's own headers describe as "a reservation that lies
  in the other direction."
- Both premises in the declaration's justifying comment are false against the shipped tree:
  "two per shelf-width row" (the shelf tiles **3** per row since 861de3e58's `min-w-0` fix — that
  merge's own message says "shelf 2 → 3 columns") and "each cell is a 64px portrait" (the body
  renders `Avatar size="fill"` in an 8.5rem track → **136px** faces — the review's do-not-regress
  list says "5×136px faces" for the same cells). `758bafd5a` wrote the declaration; `861de3e58`
  changed the geometry and re-derived every OTHER declaration (masthead 1, recents 3, also-open 7,
  temp 2, docs 5) but not this one.
- No geometry fits 4 rows: 6×136px cells are ≥320px at 3-per-row and ≥484px at 2-per-row — the "4"
  appears to count a 156px cell row as one 40px skeleton row, the exact "do not re-derive it by
  counting" mistake the sibling declarations warn against. Note for the fixer: a single row count
  cannot be right at both 2- and 3-column shelf widths (cell-grid rows are column-count-dependent,
  unlike list rows) — re-measure, and flag the fork if a count can't cover both mounts.

### F3 · P3 — the masthead's "and more" arm fires on exactly-page-size corpora, and ignores the exact census already on the same cache entry

`packages/client/src/features/chat/components/home-masthead-body.tsx:55`
(`roomCountPhrase(rooms.length, rooms.length === RECENTS_LIMIT)`)

- **Failure scenario:** a user with exactly 8 rooms (== `RECENTS_LIMIT`) reads **"Eight rooms and
  more, still warm."** — claiming rooms that do not exist. The file's own header promises the
  opposite ("a count that quietly lies" is what the paged arm exists to avoid); the arm lies in the
  other direction at the boundary.
- The honest derivation is already IN the response this component holds: `ChatListPage.totalCount`
  is "a real server COUNT over the SAME scope this page windows"
  (`packages/server/src/domain/chat/contract/views.ts:104-113`) — served, per its own doc-comment,
  precisely because chat prints its census in user-visible places. `paged` should be
  `page.totalCount > rooms.length` (and the count word could even be the census itself). Note
  `nextCursor` canNOT disambiguate — the verb mints one from a full page without a lookahead
  (`tests/client/features/chat/fixtures.ts:66-70` documents the server behavior) — but `totalCount`
  can, exactly, at zero cost.
- Compounding: **`HomeMastheadBody` has zero tests** — no test anywhere references
  `chatMastheadTile`/`HomeMasthead`/the copy strings (`/usr/bin/grep -ra` over `tests/`, 1698 test
  files in tree; the only "still warm" hit is sample text in the density voice CT). The zero-room
  arm, the singular arm, the spelled-count arm, and this paged arm all ship untested — a wording
  regression on the app's opening sentence is currently silent.

### F4 · P3 — the hero's cast strip mounts late by construction, with no reservation: a guaranteed per-boot layout pop on the focal element

`packages/client/src/features/chat/components/home-hearth-room.tsx:101` (conditional strip) +
`packages/client/src/features/chat/components/home-recents-tile-body.tsx:53→62` (hook order)

- The portrait read cannot even START until the chat read lands: `useSuspenseQuery(listChats)` at
  line 53 suspends the component before `useChatPortraitMap()` at line 62 is reached, so on every
  cold load (react-query cache is per-page-load; only the tile BOX rides localStorage) the hero
  paints text-only, then `character.list` (limit 200 — the heavier read) resolves and the strip
  (`portraits.length === 0 ? null : <AvatarStack size="hero">`) mounts: the title/scent/credit
  column shifts right by up to ~184px at `@md+` (64px hero seats, 4 slots, 28px overlap, +
  `gap-block`), or the tile grows ~64px+gap taller below `@md`.
- The data to reserve honestly is available synchronously: `hearth.participantCharacterIds` (on the
  chat row itself) says whether a strip WILL exist, and `useChatPortraitMapPending()` exists and is
  self-documented for exactly this ("a surface reserving a box for faces that are still in flight" —
  `use-chat-portrait-map.ts:35-42`). The hero uses neither.
- Consequence: part of the residual home CLS the side-eye ordered re-measured against #122
  (finding 16, 0.1567 pre-polish). The also-open rows' smaller 32→86px leading-slot growth is
  pre-existing (portraits on home rows predate #102 — verified via `git show 758bafd5a^`), but the
  hero-scale strip and its all-or-nothing mount are this diff's new surface.

### F5 · P3 — the closed voice axis and its ratifying law table drifted in the same program that had just re-attested the table

`packages/ui/src/primitives/text/variants.ts:97` (`credit`, added `861de3e58`) vs
`docs/design/density-pass-spec.md` §2.3

- §2.3 is the voice grammar's LAW home ("the four-voice grammar becomes the axis"), and every prior
  voice addition amended it in the same breath: `monogram` (AMENDED 2026-08-02), and
  `reading`/`masthead`/`focal` (AMENDED 2026-08-16 in `758bafd5a`, catalog re-attested by
  `effdb2fbf` specifically for "the #102 voice-table amendment"). `861de3e58` then added `credit` —
  updating the density-tier gate's FIX string to name it — without a spec row, so the table now
  under-states the shipped axis. (Pre-existing: `hero`, 2026-08-09, is also absent from the table —
  the drift class is older, but this diff continued it inside the very program that had just
  exercised the amend-and-attest convention.)
- The voice itself is CLEAN on the other charges: every declaration in `credit` is a token utility
  (`font-mono text-label leading-label tracking-micro font-medium uppercase text-muted-foreground` —
  no raw values), it duplicates no existing voice (`datum` is mono/label but normal-weight, tabular,
  foreground, no caps/tracking), and its computed values are pinned relationally in
  `tests/ui/density-tier.suite.ct.tsx` ("never the micro step").

### F6 · P4 — the skip link ships with zero test coverage on a positional contract

`packages/client/src/features/app-shell/surfaces/app-shell.tsx:277-285`

The fix's own comment states the contract: "FIRST IN DOM ORDER inside the grid, which is the whole
contract — a skip control that is not the first focusable is a second tab stop, not a skip." Nothing
pins it: `grep "Skip to content"` across `tests/` + `packages/` returns only the source line. A
sibling later prepending any focusable to the shell grid, or a regression in the
`sr-only focus-visible:not-sr-only` reveal chain, is silent. I verified the CURRENT tree honors the
contract live (`pnpm snap /` — first focusable inside `.shell-grid` is "Skip to content"), so this is
a fence gap, not a live defect — but it is exactly the load-bearing a11y invariant the repo's testing
posture says gets a test, on a surface (app-shell) whose CT suite was not touched by the fix.

### F7 · P4 — `HomeTile`'s dormant branch is dead code left by the #102 restructure

`packages/client/src/features/home/components/home-tile.tsx:199-201`

`HomeSurface` now pre-partitions the registry: dormant tiles are collected via `asDoorway` and
rendered through `HomeDoorway` directly under the "Not yet" band; `HomeTile` is invoked only over
`live`-filtered lists (`home-surface.tsx:79-87, 117, 130, 135, 150`), for which
`typeof tile.body === "function"` always holds — so the `dormant !== null → <HomeDoorway>` branch in
`HomeTile` is unreachable. Verified: `ast-grep` shows `HomeTile`'s only consumers are its own module
and `home-surface.tsx`; every CT story mounts through `HomeSurface`. Two homes now exist for doorway
routing, one dead — the "old structure beside the new" residue the constitution's escape-hatch list
bans; knip cannot see an unreachable branch (dead-code gates are deferred, so this review is the only
check).

---

## Observations (not findings — no action forced by this diff)

- **`Button shape="pill"` leaves ~11 legacy call sites on the coin flip its own header condemns.**
  The new axis's comment (`button/variants.ts:109-115`) documents that a call-site `rounded-full`
  against the sealed radius resolves by stylesheet order ("i.e. luck") because the custom token is
  tailwind-merge-unclassifiable. The diff converted only the jump rail; literal sweep finds
  `className="…rounded-full…"` still on Buttons in `composer-guided-cluster.tsx` (×4),
  `composer-send-control.tsx` (×2), `composer.tsx`, `composer-utility-menu.tsx`,
  `jump-to-latest-pill.tsx`, and `home-documents-tile-body.tsx:148`. Behavior is UNCHANGED by this
  diff (both classes were emitted before and after; the flip's winner didn't move), so this is not a
  regression — but the sanctioned home now exists, making these a one-home sweep candidate.
- The quick-picks tile-body comment "a fr-based shelf grew 250px portraits" and the do-not-regress
  numbers all check out; only the SKELETON declaration's comment is stale (folded into F2).

## Unconfirmed suspicions (low priority — listed, not findings)

- `home-quick-picks-tile-body.tsx:73`: `character.elevatorPitch ?? …` would render an EMPTY caption
  line if a distilled pitch were ever the empty string (contract types it `string | null`; I did not
  verify the distill producer never writes `""`).
- The review's "39/39 named focusables" map was not re-derived (my raw focusable count of 45 includes
  shell chrome + devtools and is not the same methodology); nothing in the diff removes a name, and
  every name-bearing CT passes, but an exact re-measure belongs to the #122 side-eye pass.

---

## Verified clean (what my silence covers, and how)

- **Gates:** whole-tree `pnpm check` run this session — **PASS, all 15 stages green**
  (lint:biome · lint:eslint · types:packages/graph/testd/tests-dom/tests-membership ·
  tests:execution-membership · structure:db-baseline/drizzle-kit/full · imports:depcruise ·
  deps:knip · docs:format · docs:catalog), full summary read, exit 0.
- **Behavioral tier (touched surface):** `pnpm test:ct` over all six touched CT files
  (home-recents-tile-body, home-quick-picks-tile-body, tests/client/features/home/**,
  home-documents-tile, density-tier.suite, avatar-stack) — **93 passed / 0 failed / 0 flaky**.
- **Rendered truth (live app, `pnpm snap /`):** h1 ×1 ("Six rooms, still warm."), **exactly seven
  h2s** (Pick up where you left off · Also open · Elsewhere in the house · Start with · Temp chat ·
  Databank · Not yet), **zero h3** — the F6 outline fix is real; hero `aria-label="Resume Example —
  The Ashen Spire"` (verb-carrying name live); "Skip to content" is the first focusable in
  `.shell-grid`; **exactly ONE `listChats` cache entry**
  (`[["chat","listChats"],{"input":{"limit":8}}]`) serving masthead + hero + also-open + the
  `useVisible` gate — the one-read-many-tiles claim holds; quick-picks grid resolves
  `136px 136px 136px` (fixed cells, not fr).
- **Seam/law compliance:** home imports zero features (imports read: `@orb/ui/*`, `#lib`, `#state`
  only); the masthead reaches chat data only through the contribution seam; the door assembly is the
  single registry home (`authed-app.tsx`); `HomeTileRegion` is a closed exported union replacing
  `span` with no stale twin left (`state/index.ts` diff removes `HOME_TILE_SPANS`); `useVisible` is
  called as a top-level hook per tile component (the sanctioned `ChromeEntry` shape), and the
  door-frozen list keeps hook order stable.
- **New @orb/ui vocabulary homing:** all additions live in the sealed package's existing variant
  files (`text/variants.ts`, `layout/variants.ts`, `avatar/variants.ts`, `button/variants.ts`,
  `list-row/variants.ts`); no inline types; variants stay internal (no `./variants` re-export
  added); new arbitrary track templates (`lead`, `cellFixed`, `pairWide`, `@min-[100rem]`) are
  allowlisted with reasons in `no-arbitrary-tw-values.ts` (the sanctioned grammar, not a dodge);
  the `density-tier` gate's FIX string was updated both merges and **the baseline JSON did not grow**
  (`git diff 96d458324^..861de3e58 -- density-tier.baseline.json` → empty).
- **tiers.css mechanics:** the unlayered-beats-layered note is correct and PROVEN by computed value
  in `density-tier.suite.ct.tsx` (both nesting directions, the liveness strip probe, the tier-less
  fallback); the `promoted` title rule wins its tier rule by specificity (three attribute selectors
  vs two) and the data-attribute channel exists precisely because a utility would lose — the
  variants' class is correctly labeled the tier-less fallback.
- **No voice duplication:** `masthead` vs `hero` (sans-prose vs mono-tabular twins, CT-pinned
  distinct), `credit` vs `datum`/`kicker` (distinct axes, CT-pinned off `micro`), `focal` vs heading
  defaults — all deliberate, none a second home.
- **The focal recipe survives the polish** (do-not-regress #7): stripe = `--color-speaker` at
  `--immersive-stripe-width`, glow on `::before` at opacity-30, zero accent fill — pinned by the
  resolved-style CD3 CT; `1.55fr/1fr` + `1.5fr/1.05fr@100rem` in `layout/variants.ts:119`; 75ch =
  `--reading-measure` token consumed via `max-w-(--reading-measure)` on the hero scent; 136px faces
  confirmed live.
- **Test reality:** the red-first pins are real — computed values against document-resolved tokens
  (never px literals), relations (hero > row title; lead/rail ratio window 1.5–1.6), store-level
  assertions for navigation, accessible-name/description assertions for the F5 announce-once fix,
  and the #119 caption CT pins the ABSENT line (`toHaveCount(0)`), not a tautology. The dormant-tile
  CTs honestly deleted the retired `Dormant`-badge assertions and say why.
- **#119 (db242f066):** correct — the ladder ends at `null`, the handle can no longer render as
  caption copy, and `CharacterSummary` genuinely carries no third honest fallback (contract read).
- **Relative-time seam scope (#4):** only the two new sentence sites changed time rendering
  (sweep receipt in F1); the kit horizon and `formatRelative` are untouched; probe-mode freeze covers
  both forms at the `#lib` singleton.
- **Security surface:** none touched (no authn/authz, secrets, validation, or egress in the diff);
  no `security-executor` pass needed.

## Regions NOT read in full (scope disclosure)

- `tests/client/features/chat/_ct-stories.tsx` (~4.4k lines): read the first 120 lines + every hunk
  the polish touched + `HomeTileStory`/`ChatRecentsPairStory` definitions; the untouched remainder
  was not read.
- `packages/client/src/features/app-shell/surfaces/app-shell.tsx`: read lines 200–320 (the touched
  region + its surrounding invariants), not the whole file.
- `scripts/check/gates/density-tier.ts` / `no-arbitrary-tw-values.ts`: read the diffs + the FIX/
  allowlist context, not the full gate bodies (both untouched otherwise; conformance covered by the
  green `structure:full`).
- `tests/client/features/home/lib/automation-tile.ct.tsx` / `buddy-tile.ct.tsx` /
  `home-quick-picks-tile-body.ct.tsx`: read the full diffs + file heads, not every untouched line.

---

## Issue summary (paste-ready)

Stickler frontier review of the Hearth Room home rebuild (96d458324 + 861de3e58 + db242f066):
**FINDINGS(7), ceiling P2, none merge-blocking; the build's seam discipline, focal recipe, a11y
outline, and CT quality re-verified genuinely clean against gates (15/15), scoped CTs (93/93), and
the rendered app.** Worst two: (F1) both new relative-time sentences render **"now ago"** ("You left
off now ago in…", "· LAST TURN NOW AGO") for any sub-minute recency — the most common post-chat
state — because `formatRelativeCompact` returns the word "now" and both sites append " ago"
(home-masthead-body.tsx:60, home-hearth-room.tsx:158); (F2) the quick-picks first-boot skeleton
declaration (4 rows ≈ 208px) under-reserves its live-measured 320.5px settled box by ~112px — its
justifying premises ("two per row", "64px portraits") died inside the same merge train (3 columns,
136px fill faces), the exact #92 CLS class. Also: masthead "and more" lies at exactly 8 rooms while
`totalCount` sits unused on the same cache entry (+ the masthead body has zero tests); the hero cast
strip mounts late by hook-order construction with no reservation (feeds #122); density-pass-spec §2.3
is missing the `credit` (and older `hero`) voice rows; the skip link's first-focusable contract has no
test; HomeTile's dormant branch is dead post-restructure. Full report:
`docs/reviews/stickler/2026-08-16-home-hearth-room.md`.
