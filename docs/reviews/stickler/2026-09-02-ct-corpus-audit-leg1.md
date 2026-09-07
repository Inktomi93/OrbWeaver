---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 1 of the sharded campaign (#1229)

Lane `cb-ct-audit` · stickler · worktree `wt/agent-ad97119ee5dd2503b` (base `71e2c3e31`, clean).
Charge: full audit of every `tests/**/*.ct.tsx` (469 files, 4,441 tests, 114,565 lines). This leg =
Phase A structural sweeps over the WHOLE corpus + Phase B full-reads of the highest-risk shard.
Judged against `Spine-Testing.md` (read in full), the `ct-test-gotchas-hub` + `ct-rendered-assertion-hub`
memory encyclopedias, and the week's taxonomy (#1207 stale premise, #1203 luck-based coverage,
decorative pins, fabrication double-casts, oneshot live-reads, #1201 reports/ writes, accname traps,
stand-in children, tabs-accumulate, shared-render-tree reads).

**Coverage count: 24/469 files full-read** (\~26,100 lines — the shard skewed to the largest files;
by line volume this is \~23% of the corpus). Phase A sweeps covered all 469.

**Headline: the corpus is in exceptional condition.** Two confirmed findings (one P3, one P4), one
half-tracked product observation, zero stale selectors, zero assertion-free/tautological tests, zero
skip/fixme residue, zero unmarked fabrication casts outside the two already-routed debt rows. The
dominant register of the shard is red-first defect proofs with honest FENCE labels, planted positive
controls, settle barriers, and token-derived expectations.

---

## Findings (confirmed only)

### F1 · P3 — one literal `reports/snaps/` screenshot write survives the #1201 sweep

`tests/client/features/automation/components/rules-section.ct.tsx:1088`

```ts
await component.screenshot({ path: `reports/snaps/cb-rules-${theme}-${width}.png` });
```

- Defect: a CT screenshot written into the snap instrument's PUBLISHED family. Per
  `tests/support/node/story-shot.ts`'s own header (the #1201 fix, its one home), `reports/snaps/` names
  are symlink aliases into finished snap-run slots since #1164; `page.screenshot({path})` is an
  ordinary write and FOLLOWS a symlink, so a name collision silently rewrites a finished run's
  evidence while the alias still lstats as a link.
- Failure scenario: a snap run publishes any alias matching `cb-rules-<theme>-<width>.png` (the
  `cb-` naming convention is shared with snap `--out` names minted by lanes) → the 6-arm theme×width
  matrix in this file overwrites that run's slot on its next execution, and nothing at the pointer
  shows the swap.
- Evidence (this session): live checkout `reports/snaps/` holds 668 entries of which 2 are already
  symlink aliases (`root.png`, `root.json` — `find -maxdepth 1 -type l`), proving the mechanism is
  armed; the corpus-wide sweep for `reports/` string literals in `*.ct.tsx` returned exactly this ONE
  site (AST scan over all 469 files, scannedFileCount=470 incl. planted control which was caught;
  corroborated by `rg 'reports/'` over `*.ct.tsx` + `*.spec.ts` — the only other hits are inert JSON
  fixture strings in `bug-report-button.ct.tsx`).
- The sharpest fact: the SAME file imports `storyShot` (line 23) and uses it at five sibling sites
  (352, 638, 725, 768, 943). Line 1088 is a partially-missed sweep, not a policy disagreement — its
  comment still carries the pre-#1201 rationale ("reports/ is ephemera").
- Fix shape: `storyShot(\`cb-rules-${theme}-${width}\`)\`. One line.
- Law: memory `ct-test-gotchas-hub` #1201 rows; `story-shot.ts` header ("its ONE home, so the family
  name is not re-spelled").

### F2 · P4 — a lone zero-count negative pin races the fetch it forbids

`tests/client/features/automation/components/owner-automation-sections.ct.tsx:223`

```ts
await field.focus();
await field.blur();
// ONESHOT-OK: the guard skips the mutate synchronously when settled === ceiling, ...
expect(trpc.count("automation.setOwnerBudgets")).toBe(0);
```

- Defect: the test's whole point is "committing an UNCHANGED value writes nothing", and the zero-count
  read runs microseconds after `blur()` while the refutation channel is asynchronous — a broken guard
  would fire `mutate → fetch → page.route → recorder increment`, a chain that takes longer than the
  node-side `trpc.count()` read. The assert can green against a broken guard by timing.
- Contrast with the house pattern: the sibling mid-type zero at :183 is retro-validated by the
  downstream `expect.poll(...).toBe(1)` (a second write would make it 2 and red); the zero at :519
  and :377 in `rules-section.ct.tsx` sit behind RENDERED barriers that are the click's own result.
  :223 has neither — no rendered consequence, no downstream ordering proof, no inverted poll.
- Failure scenario: the no-change guard in the owner-budget autosave regresses; this pin — the only
  test of that guard — keeps passing by winning the race; phantom writes ship on every focus/blur.
- Fix shape: follow the unchanged commit with a REAL change in the same test and assert
  `inputs(...)` is exactly `[{maxFiresPerHour: <changed>}]` (ordering proof), or use the house
  inverted-`expect.poll` must-not-fire pattern (memory: `playwright-ct-production-react-strictmode-inert`
  — "a must-not-refetch CT has no settled state").
- Law: `Spine-Testing.md` §3 non-vacuity control; memory hub "prove an ABSENCE with a round-trip
  barrier, never a monotonic counter".

### F3 · P4 (observation, product-side, half-tracked) — bare `<Button>` paints primary without its CTA ring

- `packages/ui/src/primitives/button/button.tsx:54` — `data-cta={intent === "primary" ? "" : undefined}`:
  an OMITTED `intent` prop (which the variant factory still skins as primary) stamps no `data-cta`,
  so a bare `<Button>` renders the primary fill without the CTA gradient ring.
- Discovered via the #541b class (a CT comment holding a worked-around defect):
  `tests/ui/primitives/button/button.ct.tsx:465-468` mounts `intent="primary"` EXPLICITLY and its
  comment says "the default-primary button carries no ring at all today (flagged 2026-08-01, not this
  lane's fix)".
- Still live on today's source, with 9 live bare-Button call sites out of 516
  (`ast-grep` JSX sweep, `packages/client/src`): `forms/bound-fields/form-chrome.tsx:21` (the shared
  form submit chrome), `user-admin/components/admin-users-section.tsx:101`, and 7 refinery sites
  (`manual-rewrite-dialog.tsx:98`, `apply-outcome.tsx:100,105`, `apply-row.tsx:71`,
  `schema-editor-dialog.tsx:219,393`, `scope-editor-dialog.tsx:267`).
- The disposition exists — but only on the FROZEN board:
  `docs/history/retro-workboard-2026-08-03.md:2315` "Button w/o explicit intent gets no data-cta ring
  (documented, not repainted) · admin-rail-pin". Nine sites diverging from 507 explicit ones, with the
  ruling's only home in retired history, is a re-derive-or-fix candidate, not a certainty — routing
  decision is the orchestrator's. Fix if wanted: `(intent ?? "primary") === "primary"` at :54, or
  spell `intent` at the 9 sites.

### Context (known, routed — recorded for the report's completeness, not re-filed)

Whole-tree `check:structure` on this worktree's base (71e2c3e31) exited 1 with 9 red gates
(log: scratch `cb-ctaudit-structure.log`, summarized in my mid-run back-channel). Orchestrator
confirmed all nine are known/routed and three already fixed past my base (`no-test-fabrication` ×4 →
22e91a04f; the analytics oneshot → 15a9144bf; component-size rides the live collections batch). The
whole-tree run itself drew a discipline correction (lane floors are scoped; not repeated).

---

## Phase A — corpus-wide structural sweeps (all 469 files)

Method: one ts-morph pass (own `Project` over `tests/**/*.ct.tsx`, syntax-only) emitting per-file
metrics; every class proven against a PLANTED POSITIVE CONTROL (`tests/client/cb-ctaudit-control.ct.tsx`,
exhibiting all 16 defect shapes; all 16 detected; file rm'd; `git status --short` clean after).
`scannedFileCount=470` (469 + control). Negative claims corroborated by a second method (rg / a live
gate) as noted per row.

| Class | Result | Method + second source | | |
| - | - | - | - | - |
| Assertion-free tests (zero `expect` in body) | **0** | AST per-test expect census; independently enforced by biome `lint/nursery/useExpect` in `pnpm check` (observed firing on the planted control's write hook) | | |
| Tautologies (`expect(x).toBe(x)`, `expect(true).toBe(true)`, literal `toBeTruthy`) | **0** | AST arg-vs-matcher text equality; rg corroboration | | |
| `test.skip/.fixme/.todo` residue | **0** | AST + \`rg 'test.(skip | fixme | todo)('`(rg invocation proven live by its`expect.soft\` hits) |
| `as unknown as` double-casts | 38 total / **35 marked** `FABRICATION-OK` / 3 unmarked | AST outer-node census; the 3 unmarked = `appearance-background-section.ct.tsx:228,241,247` (FENCED debt leg, gate-red, known) + `app-shell/_ct-stories.tsx:1118` counts under the same known red. Flat gate `no-test-fabrication` owns the class | | |
| `as any as` double-casts (gate blind spot — gate checks `unknown` only) | **0** | AST + rg | | |
| `expect.soft(await <live read>)` (gate blind spot — gate's predicate is bare-`expect`) | **0** inline; 2 `expect.soft` sites total (`app-shell.ct.tsx:4958-4959`), judged clean in Phase B (settled local array from one post-barrier `evaluateAll`) | AST + rg | | |
| Literal `reports/` writes | **1** → Finding F1 | AST string-literal + template census; rg corroboration incl. `tests/e2e` | | |
| Suppression markers in CTs | **5** total, all read and justified: 4× `noPlaywrightWaitForTimeout` (motion-flaggers ×2, code-editor's measured 4/20→0/40 flake wait, message-list's stability-trace interval — each is the sanctioned "no state to wait FOR" shape) + 1× `useUniqueElementIds` (accessible-name-quality: a FIXED id is the subject) | line scan; each site read | | |
| `ONESHOT-OK` markers | **307 across 99 files**. 149 (41 files, all under `tests/ui/`) carry ONE identical boilerplate reason ("the preceding mount/action completed…"); 158 are site-specific. Every boilerplate site sampled in Phase B (density-tier, spinner, collapsible, markdown, button, badge, card, grid, list-row, skeleton, message-list, sortable) is TRUE where it stands (settled locals / static post-mount style). Every site-specific reason read in the shard is true and names its barrier. No FALSE marker found. See Observations O1 | AST/line census + Phase B reads | | |
| `FABRICATION-OK` markers | 35, all honest (browser-context probe-slot / in-page scaffolding casts — the sanctioned class) | census + reads | | |
| Helper-hoisted non-retrying live asserts (`expect(await fn(...)).toBe…` — the oneshot gate's declared blind spot: it taints args/receivers, never the callee body) | **149 sites across 49 files** (full path:line list in Appendix B). Every site inside the 24 read files (\~70 of the 149) verified barriered — the helpers are either action-result reads (`dispatchCommandKey`), settled-probe reads behind polls, or geometry reads post-settle. Remaining \~79 sites in un-read files are the top triage input for legs 2+ | AST; per-site judgment in Phase B | | |
| Stale TESTIDS (#1207 class, testid half) | **covered by the GREEN `testid-liveness` gate** (A1 arm: a `getByTestId`/`[data-testid=]` consumer no producer mints is gate-red; scanned 5,825 files on this tree, green). No manual sweep needed | gate source read; gate result from the structure run | | |
| Stale ROLE-NAME/copy literals (#1207 class, uncovered half) | **0 confirmed stale.** 1,744 unique `getByRole(name:)` string literals; 688 with no direct source-corpus substring hit; after skeleton (word prefix/suffix vs source, catches composed `${verb} ${label}` names) and fixture-mint filters → **4 hard suspects, all manually cleared**: `Run Roll d6/2d6` (composed `${CONTROL_MODE_WORD} ${label}`, "Run" under my 4-char prefix floor), `fantasy-0` (CT's own template `fantasy-${i}`), `{{narrator}}` (macro palette composition, `narrator` live in src). Positive controls: "settings" hit 629 src files; the planted bogus name hit 0 | python corpus scan (3,299 src + 2,081 non-CT test files) + manual triage of all 4 | | |
| `getByRole` name without `exact` | 4,809 sites (360 files) vs 682 exact (102 files) | census only. NOT flagged wholesale: the majority are selector-use where substring is correct; the risk shape (shared-word collision / name-shape claims via prefix matchers) is a per-file judgment. The read shard consistently used `exact:true` where the name's SHAPE was the claim (plugins P3-5 is the exemplar) and documented every deliberate prefix matcher | | |
| Registry one-member mounts (#1203 class) | import-specifier heuristic: **0** CT files import registry-shaped modules directly (CTs import stories, so the class hides in story modules — 16 `_ct-stories.tsx` touch `REGISTRY/Registry/_CONTRIBUTIONS` identifiers: routes, state, databank, workloads, automation, stats, preset/surfaces, rpg, chat, home, plugin, app-shell, auth, character, config, credentials). Semantic judgment deferred to later legs; the read shard's registry-driven suites (app-shell's `MODAL_SLOT_IDS` loops, message-row's `THEME_CHAT_STYLES`/`MESSAGE_ROLES` loops) are the ANTI-pattern-proof: axis-driven, every member covered by construction | heuristic + shard reads | | |

Corpus stats: 469 files · 4,441 tests · 114,565 lines. Risk score per file =
3·helperAwait + 2·oneshotMarkers + fabricationMarkers + 5·doubleCasts + 5·reportsLiterals +
2·suppressions + lines/400 + tests/10 (bands: HI ≥8 → 61 files, MID 3–8 → 74, LO <3 → 334).

## Phase B — full-read shard verdicts (24 files, \~26,100 lines)

Every file below read whole, top to bottom. Verdict criteria: honesty (every assert can fail and
asserts something real), premise currency (spot-checked against today's source where a claim depended
on it), harness correctness, coverage of the subject's contract.

| File | Lines | Verdict |
| - | - | - |
| `tests/client/features/app-shell/surfaces/app-shell.ct.tsx` | 5,404 | **CLEAN — exemplary.** All 20 helper-await sites barriered; 10 fabrication markers honest probe-slots; the 2 `expect.soft` sites assert a settled local; media emulation always states TOTAL state; defect-proof vs FENCE labels explicit throughout; planted controls on every absence claim (grain stddev, VT names, boot grid) |
| `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` | 4,362 | **CLEAN.** Wire-payload receipts (`patchActor` op shapes) kill the plane-loss class structurally; every ONESHOT reason names its barrier; PERMISSION-omit arms paired with host arms; budgets are ratios with measured provenance. Style nit only: giant repeated evaluate blocks inside polls (verbose, correct) |
| `tests/client/features/chat/components/message-row.ct.tsx` | 2,614 | **CLEAN.** Byte-identical screenshot occlusion proof (#168); `toMatchAriaSnapshot` for name claims; un-failable-oracle post-mortems inline (#598 counterLines); width matrices on every geometry rule |
| `tests/client/features/automation/components/rules-section.ct.tsx` | 1,280 | **F1 at :1088** (the one literal `reports/snaps/` write; 5 sibling sites already use `storyShot`). Otherwise clean — the #815 held-response CLS budget with proven-failable controls is the strongest perf pin in the corpus |
| `tests/client/features/plugin/components/plugins-install-section.ct.tsx` | 929 | **CLEAN.** The consent/security surface: leak-free SSRF-oracle pin, anti-TOCTOU host echo, exact-name accname pin (P3-5) — every ONESHOT reason site-specific and true |
| `tests/ui/density-tier.suite.ct.tsx` | 811 | CLEAN. 17 boilerplate ONESHOT markers all guard settled locals; token-derived expectations throughout; the LIVE strip-the-attribute probe (P1-3) is a real liveness control |
| `tests/ui/markdown/markdown.ct.tsx` | 813 | CLEAN. 26 boilerplate markers all settled; trust-tier security pins (script strip, no-prefetch exfil, mermaid withheld under untrusted); the #490 un-failable-fence lesson applied (token equalities, not relational asserts) |
| `tests/ui/primitives/button/button.ct.tsx` | 618 | CLEAN (surfaced F3 via its own honest comment). Site-by-site parity matrices mount the RETIRED class strings beside the arms — the strongest regression shape available |
| `tests/ui/primitives/message-list/message-list.ct.tsx` | 596 | CLEAN. The suppression (stability-trace `waitForTimeout`) is the sanctioned shape and documents an earlier draft's un-failable version |
| `tests/ui/primitives/list-row/list-row.ct.tsx` | 498 | CLEAN. Model a11y contract coverage (name/description partition, aria-hidden leading, inert float cluster via elementFromPoint) |
| `tests/ui/primitives/badge/badge.ct.tsx` | 483 | CLEAN. In-test calibration of its contrast calculator against two spec-fixed ratios + a planted must-fail control — instrument-honesty exemplar |
| `tests/ui/markdown` `…/sortable/sortable.ct.tsx` | 251 | CLEAN. Marked in-page scaffolding; multi-step keyboard reorder proofs |
| `tests/client/components/tag-picker-dialog.ct.tsx` | 314 | CLEAN. `topmostAt` hit-tests at settled states; coarse-pointer arm proves emulation before geometry |
| `tests/client/components/regex-scope-order.ct.tsx` | 277 | CLEAN. Order asserted through accessible names; stateful stub closes the optimistic-vs-refetch race |
| `tests/client/features/automation/components/owner-automation-sections.ct.tsx` | 235 | **F2 at :223**; :183's zero is sound via the downstream `toBe(1)`. Rest clean |
| `tests/ui/primitives/collapsible/collapsible.ct.tsx` | 190 | CLEAN |
| `tests/ui/primitives/card/card.ct.tsx` | 189 | CLEAN (the shadow-ingredient / var-inlining archaeology is load-bearing doc) |
| `tests/ui/primitives/picker-cell/picker-cell.ct.tsx` | 146 | CLEAN. Wrap-premise controls on every grid claim |
| `tests/client/data/use-open-refinery.ct.tsx` | 128 | CLEAN. "Same settled barrier" reasons verified: the settled readout IS the flow's last write |
| `tests/ui/primitives/log-viewer/log-viewer.ct.tsx` | 341 | CLEAN. 7 marked scaffolding casts; pin-vs-yank pairs in plain and virtualized arms |
| `tests/ui/primitives/spinner/spinner.ct.tsx` | 91 | CLEAN. Mid-flight reads are RANGE asserts + a moved-later poll — the honest animated-state shape |
| `tests/ui/primitives/skeleton/skeleton.ct.tsx` | 60 | CLEAN |
| `tests/ui/layout/grid.ct.tsx` | 69 | CLEAN |
| `tests/support/browser/touch-floor.ct.tsx` | 41 | CLEAN — the #662 instrument bite-proof pair (both directions) |

Partial reads (located, not concluded; NOT counted in coverage): `dice-ask-source.ct.tsx` +
`rpg-scene-cards` grep regions (name triage), `config-welcome`/`config-list-surface` flagged sites
(fenced), `app-shell/_ct-stories.tsx:1118` cast site, `button.tsx`/`test-ids` gate/source excerpts.

## Shard map for the remaining legs

Bands by the Phase A risk score; `[READ-LEG1]` = done, `[FENCED]` = deep-audit deferred while sibling
lanes own the file (config live batch; app-shell/stats debt legs — include in later leg after they
land). Remaining full-read budget: 445 files (61−15 HI unread… see lists). Recommended order:
legs 2–3 drain HI + the helper-await files; legs 4–6 take MID by area (preset, chat surfaces,
character, refinery, credentials); LO is mostly small primitive seals — batch by directory, \~60–80
files/leg at low depth (their risk signals are near zero and the read shard suggests the register
holds there).

Un-triaged helper-await files for leg 2 (the gate-blind-spot class, highest expected yield):
`chat-room-surface` (4 sites), `params-deck` (4), `sandbox-frame` (4), `preset-library-surface` (3),
`web-weave` (5)/`web-weave-touch` (1), `slider` (5), `toast` (4), `character-editor-surface` (2),
`preset-editor-surface` (2), `image-edit-body` (2), `lane-run-control` (2), `section-drill-in` (2),
`preset-structure-tabs` (2), `character-create-actions` (2), `theme-scope` (2), `tabs` (2),
`accessible-name-quality.suite` (1), `context-tabs-panel` (1), `assembly-preview-panel` (1),
`injections-manager` (1), `message-media-block` (1), `room-overrides-form` (1),
`databank-detail-surface` (1), `corpus-content` (1), `image-detail-body` (1), `payload-view` (1),
`workloads-group` (1), `form-identity.suite` (1), `code-editor` (1), plus the FENCED
`config-welcome` (3), `config-content-surface` (2), `config-list-surface` (1),
`analytics-overview-surface` (1). Full 149-site path:line list: Appendix B.

Full banded file list: Appendix A (every file, score, line count, tags).

## Observations (not findings — no action required this leg)

- **O1 — the boilerplate ONESHOT reason.** 149 of 307 markers (41 `tests/ui/` files) carry one
  identical pasted reason. Every sampled site is TRUE, so no defect — but the marker's audit value
  ("a concrete reason" naming THE barrier) is diluted: the same string pasted above a genuinely racy
  read would read identically. A later leg touching those files could tighten reasons opportunistically;
  not worth a dedicated sweep.
- **O2 — `expect.soft` is structurally outside the oneshot gate** (`isBareExpectCall` requires an
  identifier callee). Zero live abuse today (the 2 sites are clean). If the gate is ever revisited,
  adding `expect.soft` to the predicate is a two-line widening; until then this is a documented blind
  spot, not debt.
- **O3 — helper-hoisted live reads are the gate's real blind spot** (149 sites). The read shard shows
  the corpus discipline handles it (barriers before every one examined), so this is a triage list for
  later legs, not a gate-change demand. If leg 2 finds racy ones, the gate fix is taint-through-callee
  for same-file helpers.
- **O4 — the CT-comment-holds-a-defect (#541b) sweep of the read shard** found exactly one live
  instance (F3's button ring note). The other honest-label comments ("FENCE, not a defect proof",
  "flagged, owner-unruled" on the tag-collection reorder cliff in `regex-scope-order.ct.tsx:181`)
  reference dispositions that exist.

## Verified clean — what this leg's silence covers

- Phase A sweep classes as tabled above, each with a planted positive control in the same
  invocation and a second method on every negative claim.
- The 24 shard files' internal honesty/harness quality in full.
- Stale-selector currency: testids by the green `testid-liveness` gate (mechanism read and understood
  — A1 consumer/producer census with template + prop-indirection producer rules); role-names by the
  1,744-literal liveness sweep (4 suspects, all cleared by manual read).
- Scoped gate battery on the one file I probed (`verify/cli.ts scoped --changed …` — clean single-pass;
  122 whole-project gates correctly deferred).
- Whole-tree structure state at my base: 9 known reds (routed; three fixed past base).
- No test was RUN this leg (0 of the 6-run budget) — no verdict here depended on execution; every
  claim is structural or read-derived. The planted control file never entered git (untracked, rm'd,
  `git status --short` empty at report time).

**Not read / not covered:** the 445 un-read files' internals beyond Phase A metrics; the semantic
one-member-registry-mount judgment outside the read shard; `tests/e2e/**` (out of charge except the
reports/ sweep); fenced files' depth (Phase A metrics + flags only, per the lane fences).

## Proposed memory lessons (orchestrator owns the write)

1. `- [reports-write=call-shape](ct-reports-write-sweep-by-call-shape.md) — #1201-class sweeps must
   match the screenshot CALL (\`screenshot({ path:\`) not the string prefix — a template literal site in a
   partially-converted file survived the literal sweep` · body: rules-section.ct.tsx:1088 carried `` `reports/snaps/cb-rules-${theme}-${width}.png` `` while five sibling sites in the SAME file used
   storyShot; the sweep that converted them matched literal `"reports/`prefixes and the template's
   interpolation defeated it. **Why:** a family write is dangerous by its DESTINATION not its spelling. **How to apply:** sweep`page.screenshot`/`component.screenshot\` call sites and judge each path
   expression; and any repo-wide literal sweep owes a template-literal arm.
2. `- [name-liveness recipe](role-name-liveness-sweep-recipe.md) — the #1207 stale-selector class
   splits: testids are gate-owned (testid-liveness A1); role-NAMES need the corpus sweep — skeleton
   prefix/suffix + fixture-mint filters take 1,744 literals → ~4 hand-checks` · body: composed names
   (`Actions for ${name}`, `${CONTROL_MODE_WORD} ${label}`) dominate false suspects; filter by (a) any
   ≥4-char word prefix/suffix of the name hitting `packages/**/src`, (b) the literal appearing in the
   CT file outside `name:` position (its own fixture mint), (c) template mints like `` `fantasy-${i}` ``.
   What survives is hand-checkable in minutes. **How to apply:** run after any control-shape change or
   as a corpus health check; zero-hit ≠ stale until the composition arms are exhausted.
3. `- [oneshot boilerplate=ui-tree](oneshot-boilerplate-reason-in-ui-tree.md) — 149 of 307 ONESHOT-OK
   markers share one pasted generic reason (41 tests/ui files); every sampled site is TRUE today, but
   the reason no longer discriminates — treat a boilerplate marker as unaudited, not as false` ·
   **How to apply:** when auditing or editing a ui-tree CT, verify the specific read's settledness
   rather than trusting the pasted sentence; when writing new markers, name THE barrier.

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 1 (cb-ct-audit, stickler): Phase A structural sweeps over all 469 `.ct.tsx`
> files + full-reads of the 24 highest-risk files (\~26k lines; 24/469 full-read coverage). Verdict:
> the corpus is in exceptional condition. 2 confirmed findings, severity ceiling P3:
> (1) P3 `rules-section.ct.tsx:1088` — the one surviving literal `reports/snaps/` screenshot write
> (#1201 evidence-corruption class; the same file already uses `storyShot` at 5 sites; one-line fix);
> (2) P4 `owner-automation-sections.ct.tsx:223` — a lone zero-count negative pin that races the async
> fetch it forbids (needs an ordering proof or inverted poll). Plus one half-tracked product note:
> bare `<Button>` (9 live call sites) paints primary without its CTA ring; the "documented, not
> repainted" disposition lives only on the frozen 2026-08-03 board. Corpus-wide: zero stale selectors
> (testids gate-covered; 1,744 role-name literals swept → 0 stale), zero assertion-free/tautological
> tests, zero skip/fixme, all 35 fabrication markers honest, all 307 oneshot markers sampled-true
> (149 share one boilerplate reason — audit-value dilution noted). Shard map + banded file lists for
> legs 2+ in the report; the 149-site helper-await list is leg 2's top input. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg1.md`.**

---

## Appendix A — full banded shard map

(risk score = 3·helperAwait + 2·oneshot + fabrication + 5·casts + 5·reportsLit + 2·suppressions + lines/400 + tests/10)

```text
HI BAND (61):
  tests/client/features/app-shell/surfaces/app-shell.ct.tsx (score 150.2, 5404 ln) [READ-LEG1]
  tests/ui/density-tier.suite.ct.tsx (score 74.1, 811 ln) [READ-LEG1]
  tests/ui/primitives/message-list/message-list.ct.tsx (score 61.0, 596 ln) [READ-LEG1]
  tests/client/features/rpg/lib/rpg-context-section.ct.tsx (score 60.7, 4362 ln) [READ-LEG1]
  tests/ui/markdown/markdown.ct.tsx (score 58.1, 813 ln) [READ-LEG1]
  tests/ui/primitives/log-viewer/log-viewer.ct.tsx (score 44.5, 341 ln) [READ-LEG1]
  tests/ui/primitives/button/button.ct.tsx (score 43.2, 618 ln) [READ-LEG1]
  tests/ui/primitives/sortable/sortable.ct.tsx (score 29.9, 251 ln) [READ-LEG1]
  tests/client/features/config/surfaces/config-content-surface.ct.tsx (score 29.5, 908 ln) [FENCED]
  tests/client/features/automation/components/rules-section.ct.tsx (score 26.8, 1280 ln) [READ-LEG1]
  tests/client/features/plugin/components/plugins-install-section.ct.tsx (score 26.3, 929 ln) [READ-LEG1]
  tests/ui/primitives/list-row/list-row.ct.tsx (score 26.0, 498 ln) [READ-LEG1]
  tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx (score 23.1, 626 ln)
  tests/ui/primitives/badge/badge.ct.tsx (score 22.8, 483 ln) [READ-LEG1]
  tests/client/features/chat/components/message-row.ct.tsx (score 22.7, 2614 ln) [READ-LEG1]
  tests/client/features/app-shell/components/appearance-background-section.ct.tsx (score 22.6, 405 ln) [FENCED]
  tests/client/features/preset/surfaces/preset-library-surface.ct.tsx (score 21.9, 1050 ln)
  tests/ui/art/web-weave/web-weave.ct.tsx (score 21.5, 429 ln)
  tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx (score 20.8, 1946 ln)
  tests/ui/primitives/spinner/spinner.ct.tsx (score 20.6, 91 ln) [READ-LEG1]
  tests/client/features/preset/components/params-deck.ct.tsx (score 20.3, 989 ln)
  tests/client/features/settings/components/appearance-looks-section.ct.tsx (score 20.2, 353 ln)
  tests/ui/primitives/slider/slider.ct.tsx (score 20.0, 397 ln)
  tests/client/features/refinery/surfaces/refinery-content-surface.ct.tsx (score 19.7, 741 ln)
  tests/client/components/tag-picker-dialog.ct.tsx (score 19.4, 314 ln) [READ-LEG1]
  tests/ui/primitives/toast/toast.ct.tsx (score 19.1, 465 ln)
  tests/ui/primitives/color-field/color-field.ct.tsx (score 18.5, 247 ln)
  tests/ui/primitives/card/card.ct.tsx (score 18.4, 189 ln) [READ-LEG1]
  tests/ui/primitives/picker-cell/picker-cell.ct.tsx (score 18.1, 146 ln) [READ-LEG1]
  tests/client/features/chat/surfaces/chat-room-surface.ct.tsx (score 17.4, 953 ln)
  tests/client/features/refinery/components/payload-view.ct.tsx (score 16.9, 320 ln)
  tests/client/components/regex-scope-order.ct.tsx (score 16.3, 277 ln) [READ-LEG1]
  tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx (score 15.4, 658 ln)
  tests/client/features/automation/components/owner-automation-sections.ct.tsx (score 13.3, 235 ln) [READ-LEG1]
  tests/ui/primitives/number-field/number-field.ct.tsx (score 13.2, 330 ln)
  tests/client/features/config/components/config-welcome.ct.tsx (score 12.6, 755 ln) [FENCED]
  tests/client/features/character/surfaces/character-editor-surface.ct.tsx (score 12.5, 1086 ln)
  tests/ui/content/theme-scope/theme-scope.ct.tsx (score 11.9, 654 ln)
  tests/client/features/chat/hooks/use-slash-commands.ct.tsx (score 11.8, 250 ln)
  tests/ui/primitives/input/input.ct.tsx (score 11.7, 256 ln)
  tests/client/features/character/surfaces/character-library-surface.ct.tsx (score 11.5, 1952 ln)
  tests/ui/primitives/skeleton/skeleton.ct.tsx (score 10.7, 60 ln) [READ-LEG1]
  tests/client/data/use-open-refinery.ct.tsx (score 10.7, 128 ln) [READ-LEG1]
  tests/client/features/notifications/components/notification-bell.ct.tsx (score 10.4, 407 ln)
  tests/client/features/config/surfaces/config-list-surface.ct.tsx (score 10.3, 1240 ln) [FENCED]
  tests/client/features/chat/components/composer.ct.tsx (score 10.3, 1427 ln)
  tests/ui/primitives/tabs/tabs.ct.tsx (score 10.2, 358 ln)
  tests/ui/primitives/menu/menu.ct.tsx (score 9.8, 453 ln)
  tests/ui/primitives/collapsible/collapsible.ct.tsx (score 9.5, 190 ln) [READ-LEG1]
  tests/client/features/chat/components/composer-guided-cluster.ct.tsx (score 9.5, 514 ln)
  tests/client/features/preset/components/prompt-assembly/section-drill-in.ct.tsx (score 9.4, 517 ln)
  tests/client/features/chat/surfaces/chat-list-surface.ct.tsx (score 9.4, 1556 ln)
  tests/ui/primitives/virtual-list/virtual-list.ct.tsx (score 9.1, 432 ln)
  tests/ui/primitives/textarea/textarea.ct.tsx (score 9.1, 113 ln)
  tests/client/features/imagery/components/image-edit-body.ct.tsx (score 9.0, 216 ln)
  tests/client/features/plugin/lib/tool-card.ct.tsx (score 8.9, 199 ln)
  tests/client/features/credentials/components/credential-key-row.ct.tsx (score 8.7, 98 ln)
  tests/tooling/design-audit-walker.ct.tsx (score 8.3, 1028 ln)
  tests/client/features/discovery/components/corpus-content.ct.tsx (score 8.3, 586 ln)
  tests/client/features/home/surfaces/home-surface.ct.tsx (score 8.2, 1731 ln)
  tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx (score 8.1, 327 ln)

MID BAND (74):
  tests/ui/art/web-weave/web-weave-touch.ct.tsx (score 7.8, 104 ln)
  tests/client/lib/motion-flaggers.ct.tsx (score 7.8, 629 ln)
  tests/client/features/plugin/components/plugin-scripted-surface.ct.tsx (score 7.8, 476 ln)
  tests/client/lib/motion-stats.ct.tsx (score 7.6, 329 ln)
  tests/client/features/persona/surfaces/persona-panel-surface.ct.tsx (score 7.6, 221 ln)
  tests/ui/primitives/avatar-stack/avatar-stack.ct.tsx (score 7.3, 128 ln)
  tests/ui/primitives/selection-bar/selection-bar.ct.tsx (score 7.2, 172 ln)
  tests/ui/code-editor/code-editor.ct.tsx (score 7.2, 295 ln)
  tests/client/features/refinery/components/lane-run-control.ct.tsx (score 7.2, 180 ln)
  tests/client/features/imagery/components/imagine-body.ct.tsx (score 7.2, 144 ln)
  tests/client/features/character/components/character-create-actions.ct.tsx (score 7.2, 183 ln)
  tests/client/components/tracker-blocks/tracker-blocks.ct.tsx (score 7.2, 879 ln)
  tests/client/features/chat/components/injections-manager.ct.tsx (score 7.1, 335 ln)
  tests/client/features/chat/components/settings-context-tab.ct.tsx (score 7.0, 1229 ln)
  tests/client/features/character/components/character-actions-menu.ct.tsx (score 7.0, 162 ln)
  tests/client/a11y/accessible-name-quality.suite.ct.tsx (score 6.8, 206 ln)
  tests/ui/primitives/select/select.ct.tsx (score 6.7, 313 ln)
  tests/client/lib/long-task-tracer.ct.tsx (score 6.7, 163 ln)
  tests/client/data/use-invalidation.ct.tsx (score 6.7, 124 ln)
  tests/ui/layout/grid.ct.tsx (score 6.5, 69 ln) [READ-LEG1]
  tests/client/features/preset/components/preset-structure-tabs.ct.tsx (score 6.5, 62 ln)
  tests/client/features/credentials/components/connections-roles-section.ct.tsx (score 6.5, 380 ln)
  tests/support/browser/touch-floor.ct.tsx (score 6.3, 41 ln) [READ-LEG1]
  tests/client/features/imagery/components/image-detail-body.ct.tsx (score 6.3, 204 ln)
  tests/ui/primitives/macro-textarea/macro-textarea.ct.tsx (score 6.2, 229 ln)
  tests/client/features/chat/surfaces/message-list-surface.ct.tsx (score 6.2, 1304 ln)
  tests/client/features/chat/components/assembly-preview-panel.ct.tsx (score 6.2, 569 ln)
  tests/client/features/discovery/surfaces/corpus-home-surface.ct.tsx (score 6.1, 1127 ln)
  tests/client/features/app-shell/components/context-tabs-panel.ct.tsx (score 5.9, 418 ln)
  tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx (score 5.8, 282 ln)
  tests/client/features/persona/components/persona-this-chat-section.ct.tsx (score 5.8, 245 ln)
  tests/ui/primitives/icons/icon.ct.tsx (score 5.6, 179 ln)
  tests/client/features/databank/surfaces/databank-detail-surface.ct.tsx (score 5.4, 494 ln)
  tests/client/features/stats/surfaces/analytics-overview-surface.ct.tsx (score 5.3, 381 ln) [FENCED]
  tests/ui/primitives/toggle/toggle.ct.tsx (score 5.2, 130 ln)
  tests/ui/primitives/text/text.ct.tsx (score 5.2, 106 ln)
  tests/client/features/chat/lib/chats-section.ct.tsx (score 5.2, 991 ln)
  tests/client/components/face-strip.ct.tsx (score 5.0, 469 ln)
  tests/client/features/workloads/lib/workloads-group.ct.tsx (score 4.9, 461 ln)
  tests/ui/stream/stream-text.ct.tsx (score 4.7, 63 ln)
  tests/client/features/chat/components/members-panel.ct.tsx (score 4.7, 533 ln)
  tests/client/features/preset/components/regex-tab.ct.tsx (score 4.6, 104 ln)
  tests/ui/art/art-bleed/art-bleed.ct.tsx (score 4.5, 64 ln)
  tests/client/features/roster-preset/components/roster-picker.ct.tsx (score 4.5, 415 ln)
  tests/client/data/bus/use-user-bus.ct.tsx (score 4.5, 93 ln)
  tests/ui/layout/stack.ct.tsx (score 4.4, 59 ln)
  tests/ui/art/web-weave/weave-veil.ct.tsx (score 4.4, 58 ln)
  tests/ui/primitives/command/command.ct.tsx (score 4.3, 216 ln)
  tests/client/features/chat/components/home-recents-tile-body.ct.tsx (score 4.3, 718 ln)
  tests/client/features/chat/components/message-content.ct.tsx (score 4.2, 414 ln)
  tests/client/features/chat/components/message-media-block.ct.tsx (score 4.1, 161 ln)
  tests/ui/primitives/popover/popover.ct.tsx (score 4.0, 291 ln)
  tests/client/features/workloads/components/workloads-jobs-section.ct.tsx (score 4.0, 770 ln)
  tests/client/features/refinery/components/schema-editor-dialog.ct.tsx (score 4.0, 307 ln)
  tests/client/forms/form-identity.suite.ct.tsx (score 3.9, 138 ln)
  tests/client/features/chat/components/room-overrides-form.ct.tsx (score 3.9, 146 ln)
  tests/client/features/chat/components/chat-controls-band.ct.tsx (score 3.9, 590 ln)
  tests/ui/content/message-media/message-media.ct.tsx (score 3.8, 188 ln)
  tests/ui/primitives/table/table.ct.tsx (score 3.7, 206 ln)
  tests/client/features/preset/components/actions-view.ct.tsx (score 3.7, 545 ln)
  tests/ui/primitives/drawer/drawer.ct.tsx (score 3.6, 234 ln)
  tests/client/features/chat/components/ghost-message-row.ct.tsx (score 3.6, 485 ln)
  tests/client/data/create-entity-mutation.ct.tsx (score 3.6, 267 ln)
  tests/client/data/bus/use-orb-socket.ct.tsx (score 3.6, 224 ln)
  tests/ui/primitives/switch/switch.ct.tsx (score 3.4, 560 ln)
  tests/client/features/chat/components/prose-settings-section.ct.tsx (score 3.4, 232 ln)
  tests/client/features/chat/components/appearance-message-style-section.ct.tsx (score 3.4, 228 ln)
  tests/client/features/character/components/character-appearance-tab.ct.tsx (score 3.4, 475 ln)
  tests/client/features/databank/surfaces/databank-library-surface.ct.tsx (score 3.3, 558 ln)
  tests/client/features/chat/components/composer-guided-buttons.ct.tsx (score 3.3, 193 ln)
  tests/client/features/persona/components/persona-panel-row.ct.tsx (score 3.2, 381 ln)
  tests/client/features/discovery/components/corpus-search-results.ct.tsx (score 3.2, 582 ln)
  tests/client/features/discovery/surfaces/corpus-list-surface.ct.tsx (score 3.0, 548 ln)
  tests/client/features/character/components/character-card.ct.tsx (score 3.0, 263 ln)

LO BAND (334):
  tests/client/features/preset/components/readout/transforms-readout.ct.tsx (score 2.9, 103 ln)
  tests/client/features/discovery/components/corpus-understanding-invitation.ct.tsx (score 2.9, 163 ln)
  tests/ui/primitives/crossfade-image/crossfade-image.ct.tsx (score 2.8, 82 ln)
  tests/ui/charts/meter/track-bar.ct.tsx (score 2.8, 87 ln)
  tests/ui/charts/meter/segment-bar.ct.tsx (score 2.8, 87 ln)
  tests/client/state/shell-store.ct.tsx (score 2.8, 369 ln)
  tests/client/features/rpg/lib/dice-ask-source.ct.tsx (score 2.8, 151 ln)
  tests/client/features/chat/surfaces/new-chat-picker-surface.ct.tsx (score 2.8, 399 ln)
  tests/client/features/automation/components/quick-reply-chip-mount.ct.tsx (score 2.8, 168 ln)
  tests/client/features/auth/components/login-first-run-form.ct.tsx (score 2.8, 80 ln)
  tests/ui/layout/section.ct.tsx (score 2.7, 83 ln)
  tests/ui/charts/meter/waystone.ct.tsx (score 2.7, 350 ln)
  tests/client/features/auth/components/login-local-form.ct.tsx (score 2.7, 81 ln)
  tests/client/features/tag/components/tag-collection-rows.ct.tsx (score 2.6, 315 ln)
  tests/client/components/setting-teach-row.ct.tsx (score 2.6, 377 ln)
  tests/ui/primitives/file-dropzone/file-dropzone.ct.tsx (score 2.5, 228 ln)
  tests/client/features/credentials/components/endpoint-inspector-dialog.ct.tsx (score 2.5, 79 ln)
  tests/client/data/use-plugin-display-text.ct.tsx (score 2.5, 70 ln)
  tests/ui/touch-target-floor.suite.ct.tsx (score 2.4, 285 ln)
  tests/ui/primitives/kbd/kbd.ct.tsx (score 2.4, 35 ln)
  tests/client/data/use-upload-asset.ct.tsx (score 2.4, 68 ln)
  tests/ui/primitives/combobox/combobox.ct.tsx (score 2.3, 219 ln)
  tests/ui/primitives/autocomplete/autocomplete.ct.tsx (score 2.3, 224 ln)
  tests/ui/lib/variant-attrs.ct.tsx (score 2.3, 181 ln)
  tests/ui/layout/layer.ct.tsx (score 2.3, 59 ln)
  tests/client/features/regex/components/regex-collection-rows.ct.tsx (score 2.3, 373 ln)
  tests/client/forms/section-save-status.ct.tsx (score 2.2, 57 ln)
  tests/client/features/chat/components/message-metadata-row.ct.tsx (score 2.2, 142 ln)
  tests/client/features/app-shell/components/rail.ct.tsx (score 2.2, 270 ln)
  tests/client/features/user-admin/components/admin-users-section.ct.tsx (score 2.1, 327 ln)
  tests/client/features/databank/lib/home-documents-tile.ct.tsx (score 2.1, 304 ln)
  tests/client/features/chat/components/message-actions-row.ct.tsx (score 2.1, 259 ln)
  tests/client/features/chat/components/macro-picks-section.ct.tsx (score 2.1, 303 ln)
  tests/client/features/chat/chat-room-track.suite.ct.tsx (score 2.1, 626 ln)
  tests/client/features/preset/components/readout/readout-parts.ct.tsx (score 2.0, 328 ln)
  tests/client/features/config/components/config-teacher.ct.tsx (score 2.0, 370 ln) [FENCED]
  tests/client/features/chat/components/home-quick-picks-tile-body.ct.tsx (score 2.0, 318 ln)
  tests/client/features/chat/components/chat-documents-section.ct.tsx (score 2.0, 278 ln)
  tests/client/features/character/lib/characters-section.ct.tsx (score 2.0, 318 ln)
  tests/ui/variant-arm-matrix.suite.ct.tsx (score 1.9, 667 ln)
  tests/ui/primitives/reveal-gate/reveal-gate.ct.tsx (score 1.9, 142 ln)
  tests/ui/primitives/field/field.ct.tsx (score 1.9, 224 ln)
  tests/ui/primitives/avatar/avatar.ct.tsx (score 1.9, 251 ln)
  tests/client/features/user-admin/components/memory-tuning-section.ct.tsx (score 1.9, 260 ln)
  tests/client/features/refinery/components/refinery-context-tabs.ct.tsx (score 1.9, 304 ln)
  tests/client/features/plugin/lib/extensions-section.ct.tsx (score 1.9, 268 ln)
  tests/client/features/config/components/config-search-input.ct.tsx (score 1.9, 234 ln) [FENCED]
  tests/client/forms/create-autosave-entity-form.ct.tsx (score 1.8, 260 ln)
  tests/client/features/regex/surfaces/regex-member-surface.ct.tsx (score 1.8, 251 ln)
  tests/ui/primitives/checkbox/checkbox.ct.tsx (score 1.7, 216 ln)
  tests/client/features/settings/lib/appearance-group.ct.tsx (score 1.7, 288 ln)
  tests/client/features/persona/components/persona-list.ct.tsx (score 1.7, 280 ln)
  tests/client/features/app-shell/components/context-bracket.ct.tsx (score 1.7, 255 ln)
  tests/client/components/list-pane-header.ct.tsx (score 1.7, 231 ln)
  tests/ui/primitives/dialog/dialog.ct.tsx (score 1.6, 220 ln)
  tests/client/features/workloads/components/schedules-section.ct.tsx (score 1.6, 321 ln)
  tests/client/features/workloads/components/import-library-section.ct.tsx (score 1.6, 294 ln)
  tests/client/features/chat/components/variant-wire-viewer.ct.tsx (score 1.6, 227 ln)
  tests/client/routes/app-root.ct.tsx (score 1.5, 362 ln)
  tests/client/lib/agent-bridge.ct.tsx (score 1.5, 343 ln)
  tests/client/features/regex/components/regex-context-body.ct.tsx (score 1.5, 283 ln)
  tests/client/features/chat/components/message-reactions.ct.tsx (score 1.5, 229 ln)
  tests/client/features/chat/components/chat-character-bar.ct.tsx (score 1.5, 340 ln)
  tests/ui/primitives/highlighted-text/highlighted-text.ct.tsx (score 1.4, 178 ln)
  tests/ui/primitives/empty-state/empty-state.ct.tsx (score 1.4, 138 ln)
  tests/ui/primitives/compare-blocks/compare-blocks.ct.tsx (score 1.4, 167 ln)
  tests/ui/charts/chart/use-chart-theme.ct.tsx (score 1.4, 289 ln)
  tests/client/features/tag/surfaces/tag-member-surface.ct.tsx (score 1.4, 197 ln)
  tests/client/features/stats/surfaces/analytics-list-surface.ct.tsx (score 1.4, 182 ln)
  tests/client/features/preset/components/readout/readout-binding.ct.tsx (score 1.4, 273 ln)
  tests/client/features/plugin/lib/chat-anchors.ct.tsx (score 1.4, 307 ln)
  tests/client/features/databank/components/databank-context-body.ct.tsx (score 1.4, 235 ln)
  tests/client/features/chat/components/swipe-strip.ct.tsx (score 1.4, 234 ln)
  tests/client/features/chat/components/reasoning-block.ct.tsx (score 1.4, 165 ln)
  tests/client/features/chat/components/jump-to-latest-pill.ct.tsx (score 1.4, 181 ln)
  tests/client/features/chat/components/chat-behavior-message-handling-section.ct.tsx (score 1.4, 151 ln)
  tests/client/features/chat/components/add-chat-document-dialog.ct.tsx (score 1.4, 215 ln)
  tests/ui/primitives/media-grid/media-grid.ct.tsx (score 1.3, 130 ln)
  tests/ui/charts/meter/meter.ct.tsx (score 1.3, 97 ln)
  tests/client/features/discovery/surfaces/corpus-dossier-surface.ct.tsx (score 1.3, 206 ln)
  tests/client/features/databank/components/databank-list-header.ct.tsx (score 1.3, 241 ln)
  tests/client/features/credentials/components/model-picker.ct.tsx (score 1.3, 168 ln)
  tests/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx (score 1.3, 163 ln)
  tests/client/features/chat/components/committed-members-tab.ct.tsx (score 1.3, 225 ln)
  tests/client/features/character/components/character-library-welcome.ct.tsx (score 1.3, 249 ln)
  tests/ui/primitives/status-chip/status-chip.ct.tsx (score 1.2, 86 ln)
  tests/ui/content/immersive-card/immersive-card.ct.tsx (score 1.2, 151 ln)
  tests/client/features/world-info/components/world-info-context-body.ct.tsx (score 1.2, 200 ln)
  tests/client/features/settings/lib/chat-behavior-group.ct.tsx (score 1.2, 183 ln)
  tests/client/features/regex/components/regex-pipeline-panel.ct.tsx (score 1.2, 176 ln)
  tests/client/features/refinery/hooks/use-refinery-mutations.ct.tsx (score 1.2, 221 ln)
  tests/client/features/discovery/components/corpus-similarity-tab.ct.tsx (score 1.2, 248 ln)
  tests/client/features/chat/components/reaction-picker.ct.tsx (score 1.2, 211 ln)
  tests/client/features/chat/components/message-tool-calls.ct.tsx (score 1.2, 115 ln)
  tests/client/features/chat/components/chat-header.ct.tsx (score 1.2, 220 ln)
  tests/client/data/query-boundary.ct.tsx (score 1.2, 187 ln)
  tests/client/state/active-chat-store.ct.tsx (score 1.1, 131 ln)
  tests/client/forms/create-saved-entity-form.ct.tsx (score 1.1, 128 ln)
  tests/client/features/chat/components/home-masthead-body.ct.tsx (score 1.1, 155 ln)
  tests/client/features/app-shell/components/appearance-sizing-section.ct.tsx (score 1.1, 201 ln)
  tests/client/components/regex-script-picker.ct.tsx (score 1.1, 157 ln)
  tests/ui/primitives/tool-call-block/tool-call-block.ct.tsx (score 1.0, 140 ln)
  tests/ui/primitives/toggle-group/toggle-group.ct.tsx (score 1.0, 140 ln)
  tests/ui/primitives/radio-group/radio-group.ct.tsx (score 1.0, 123 ln)
  tests/ui/primitives/progress/progress.ct.tsx (score 1.0, 75 ln)
  tests/ui/charts/scatter/scatter.ct.tsx (score 1.0, 117 ln)
  tests/ui/charts/meter/segmented-clock.ct.tsx (score 1.0, 67 ln)
  tests/client/state/character-library-store.ct.tsx (score 1.0, 134 ln)
  tests/client/features/world-info/components/entry-editor.ct.tsx (score 1.0, 279 ln)
  tests/client/features/user-admin/lib/admin-group.ct.tsx (score 1.0, 195 ln)
  tests/client/features/user-admin/components/system-tuning-section.ct.tsx (score 1.0, 128 ln)
  tests/client/features/user-admin/components/media-trust-section.ct.tsx (score 1.0, 119 ln)
  tests/client/features/user-admin/components/governance-sections.ct.tsx (score 1.0, 113 ln)
  tests/client/features/refinery/components/teaching-state.ct.tsx (score 1.0, 136 ln)
  tests/client/features/config/components/config-save-footer.ct.tsx (score 1.0, 202 ln) [FENCED]
  tests/client/features/chat/surfaces/command-palette-surface.ct.tsx (score 1.0, 128 ln)
  tests/client/features/chat/components/message-edit-textarea.ct.tsx (score 1.0, 107 ln)
  tests/client/features/chat/components/chat-options-menu.ct.tsx (score 1.0, 168 ln)
  tests/client/features/chat/anchors/character-gallery-dialog.ct.tsx (score 1.0, 167 ln)
  tests/client/features/app-shell/components/theme-background-layer.ct.tsx (score 1.0, 60 ln)
  tests/client/features/app-shell/components/bug-report-button.ct.tsx (score 1.0, 227 ln)
  tests/ui/primitives/tooltip/tooltip.ct.tsx (score 0.9, 113 ln)
  tests/ui/primitives/media-tile-grid/media-tile-grid.ct.tsx (score 0.9, 109 ln)
  tests/ui/layout/toolbar.ct.tsx (score 0.9, 117 ln)
  tests/ui/charts/bar-list/bar-list.ct.tsx (score 0.9, 113 ln)
  tests/client/state/config-nav-store.ct.tsx (score 0.9, 115 ln)
  tests/client/state/composer-draft-store.ct.tsx (score 0.9, 123 ln)
  tests/client/features/user-admin/components/structured-output-section.ct.tsx (score 0.9, 136 ln)
  tests/client/features/stats/components/analytics-context-tabs.suite.ct.tsx (score 0.9, 116 ln)
  tests/client/features/refinery/components/accept-review.ct.tsx (score 0.9, 173 ln)
  tests/client/features/home/components/home-tile.ct.tsx (score 0.9, 191 ln)
  tests/client/features/chat/components/invite-dialog.ct.tsx (score 0.9, 152 ln)
  tests/client/features/automation/components/needle-meter.ct.tsx (score 0.9, 118 ln)
  tests/client/features/auth/surfaces/login-surface.ct.tsx (score 0.9, 87 ln)
  tests/client/features/auth/anchors/login-shell-anchor.ct.tsx (score 0.9, 171 ln)
  tests/client/data/use-session-recovery.ct.tsx (score 0.9, 128 ln)
  tests/client/components/library-surface.ct.tsx (score 0.9, 140 ln)
  tests/ui/primitives/scroll-area/scroll-area.ct.tsx (score 0.8, 101 ln)
  tests/ui/primitives/save-bar/save-bar.ct.tsx (score 0.8, 86 ln)
  tests/ui/primitives/hint-trigger/hint-trigger.ct.tsx (score 0.8, 70 ln)
  tests/ui/charts/meter/ring-gauge.ct.tsx (score 0.8, 85 ln)
  tests/client/forms/bound-fields/use-bound-field.ct.tsx (score 0.8, 97 ln)
  tests/client/features/world-info/surfaces/world-info-member-surface.ct.tsx (score 0.8, 141 ln)
  tests/client/features/user-admin/components/compute-section.ct.tsx (score 0.8, 89 ln)
  tests/client/features/user-admin/components/admin-engines-section.ct.tsx (score 0.8, 130 ln)
  tests/client/features/preset/components/readout/prompt-readout.ct.tsx (score 0.8, 145 ln)
  tests/client/features/preset/components/macro-text.ct.tsx (score 0.8, 122 ln)
  tests/client/features/plugin/lib/plugin-command-palette-source.ct.tsx (score 0.8, 108 ln)
  tests/client/features/plugin/components/plugin-primary-cta.suite.ct.tsx (score 0.8, 213 ln)
  tests/client/features/persona/components/persona-editor.ct.tsx (score 0.8, 163 ln)
  tests/client/features/home/surfaces/home-column-balance.suite.ct.tsx (score 0.8, 287 ln)
  tests/client/features/home/lib/section-jump-tile.ct.tsx (score 0.8, 139 ln)
  tests/client/features/chat/components/message-selection-bar.ct.tsx (score 0.8, 93 ln)
  tests/client/features/chat/components/member-card-viewer.ct.tsx (score 0.8, 154 ln)
  tests/client/features/chat/components/imagery-templates-section.ct.tsx (score 0.8, 119 ln)
  tests/client/features/chat/components/group-config-form.ct.tsx (score 0.8, 89 ln)
  tests/client/features/chat/components/greeting-swipe-strip.ct.tsx (score 0.8, 100 ln)
  tests/client/features/character/components/character-facet-row.ct.tsx (score 0.8, 129 ln)
  tests/client/features/character/components/character-chats-projection-shell.ct.tsx (score 0.8, 171 ln)
  tests/client/features/automation/components/suggestion-card-mount.ct.tsx (score 0.8, 160 ln)
  tests/client/features/automation/components/clock-meter.ct.tsx (score 0.8, 89 ln)
  tests/client/features/app-shell/components/appearance-effects-section.ct.tsx (score 0.8, 143 ln)
  tests/client/data/use-start-chat.ct.tsx (score 0.8, 113 ln)
  tests/client/components/greeting-studio.ct.tsx (score 0.8, 140 ln)
  tests/ui/primitives/alert-dialog/alert-dialog.ct.tsx (score 0.7, 114 ln)
  tests/ui/primitives/accordion/accordion.ct.tsx (score 0.7, 117 ln)
  tests/client/styles/reading-measure.suite.ct.tsx (score 0.7, 168 ln)
  tests/client/state/preset-selection-store.ct.tsx (score 0.7, 71 ln)
  tests/client/state/deployment-boot-hint.ct.tsx (score 0.7, 74 ln)
  tests/client/state/appearance-boot-hint.ct.tsx (score 0.7, 82 ln)
  tests/client/features/workloads/components/backup-export-section.ct.tsx (score 0.7, 155 ln)
  tests/client/features/rpg/lib/dice-tool-renderer.ct.tsx (score 0.7, 89 ln)
  tests/client/features/rpg/components/rpg-freshness-indicator.ct.tsx (score 0.7, 73 ln)
  tests/client/features/preset/components/readout/usage-readout.ct.tsx (score 0.7, 123 ln)
  tests/client/features/preset/components/readout/actions-readout.ct.tsx (score 0.7, 135 ln)
  tests/client/features/plugin/components/plugin-message-footer-surfaces.ct.tsx (score 0.7, 160 ln)
  tests/client/features/plugin/components/plugin-frame.ct.tsx (score 0.7, 166 ln)
  tests/client/features/notifications/lib/notifications-chrome.ct.tsx (score 0.7, 133 ln)
  tests/client/features/discovery/components/corpus-map-tab.ct.tsx (score 0.7, 107 ln)
  tests/client/features/chat/components/rewrite-dialog.ct.tsx (score 0.7, 62 ln)
  tests/client/features/chat/components/memory-settings-section.ct.tsx (score 0.7, 86 ln)
  tests/client/features/app-shell/components/theme-background-video-layer.ct.tsx (score 0.7, 49 ln)
  tests/client/features/app-shell/components/boot-veil.ct.tsx (score 0.7, 89 ln)
  tests/client/components/confirm-dialog.ct.tsx (score 0.7, 97 ln)
  tests/ui/primitives/option-strip/option-strip.ct.tsx (score 0.6, 61 ln)
  tests/ui/primitives/background-video/background-video.ct.tsx (score 0.6, 59 ln)
  tests/ui/content/lightbox/lightbox.ct.tsx (score 0.6, 69 ln)
  tests/ui/charts/stat-figure/stat-figure.ct.tsx (score 0.6, 44 ln)
  tests/ui/charts/chart/chart.ct.tsx (score 0.6, 98 ln)
  tests/client/features/world-info/components/world-info-collection-rows.ct.tsx (score 0.6, 91 ln)
  tests/client/features/user-admin/components/rate-limits-section.ct.tsx (score 0.6, 73 ln)
  tests/client/features/user-admin/components/operations-section.ct.tsx (score 0.6, 62 ln)
  tests/client/features/user-admin/components/admin-approvals-section.ct.tsx (score 0.6, 92 ln)
  tests/client/features/stats/lib/analytics-section.ct.tsx (score 0.6, 74 ln)
  tests/client/features/stats/components/analytics-time-tab.ct.tsx (score 0.6, 78 ln)
  tests/client/features/preset/components/preset-macro-suggestions.ct.tsx (score 0.6, 66 ln)
  tests/client/features/plugin/surfaces/page-dialog-frame.suite.ct.tsx (score 0.6, 141 ln)
  tests/client/features/discovery/components/corpus-archetypes-tab.ct.tsx (score 0.6, 160 ln)
  tests/client/features/config/components/config-list-collection-group.ct.tsx (score 0.6, 113 ln) [FENCED]
  tests/client/features/config/components/config-group-placeholder.ct.tsx (score 0.6, 101 ln) [FENCED]
  tests/client/features/chat/surfaces/chat-landing-surface.ct.tsx (score 0.6, 61 ln)
  tests/client/features/chat/components/home-temp-chat-tile-body.ct.tsx (score 0.6, 78 ln)
  tests/client/features/chat/components/databank-settings-section.ct.tsx (score 0.6, 71 ln)
  tests/client/features/chat/components/chat-behavior-streaming-section.ct.tsx (score 0.6, 81 ln)
  tests/client/features/chat/components/appearance-avatars-section.ct.tsx (score 0.6, 94 ln)
  tests/client/features/character/components/character-bulk-bar.ct.tsx (score 0.6, 126 ln)
  tests/client/features/auth/lib/reauth-modal.ct.tsx (score 0.6, 116 ln)
  tests/client/features/app-shell/components/shell-topbar.ct.tsx (score 0.6, 78 ln)
  tests/client/data/skeleton-rows.ct.tsx (score 0.6, 49 ln)
  tests/client/components/row-toggle-action.ct.tsx (score 0.6, 77 ln)
  tests/client/components/character-picker.ct.tsx (score 0.6, 81 ln)
  tests/client/components/background-source-field.ct.tsx (score 0.6, 72 ln)
  tests/ui/primitives/series-row/series-row.ct.tsx (score 0.5, 57 ln)
  tests/ui/primitives/file-trigger/file-trigger.ct.tsx (score 0.5, 49 ln)
  tests/ui/lib/use-prefers-reduced-motion.ct.tsx (score 0.5, 41 ln)
  tests/client/state/section-list-projection.ct.tsx (score 0.5, 68 ln)
  tests/client/state/notice-band-store.ct.tsx (score 0.5, 68 ln)
  tests/client/state/list-flip-carry.ct.tsx (score 0.5, 68 ln)
  tests/client/lib/weave-glyph.ct.tsx (score 0.5, 44 ln)
  tests/client/features/world-info/components/world-info-settings-section.ct.tsx (score 0.5, 64 ln)
  tests/client/features/workloads/components/workloads-tuning-section.ct.tsx (score 0.5, 61 ln)
  tests/client/features/user-admin/components/admin-link-sso-section.ct.tsx (score 0.5, 70 ln)
  tests/client/features/stats/components/analytics-models-tab.ct.tsx (score 0.5, 89 ln)
  tests/client/features/regex/components/regex-bulk-bar.ct.tsx (score 0.5, 94 ln)
  tests/client/features/refinery/components/rewrite-lane.ct.tsx (score 0.5, 95 ln)
  tests/client/features/preset/components/message-handling-section.ct.tsx (score 0.5, 48 ln)
  tests/client/features/discovery/components/corpus-compare-tab.ct.tsx (score 0.5, 121 ln)
  tests/client/features/chat/components/message-cost-readout.ct.tsx (score 0.5, 52 ln)
  tests/client/features/chat/components/chat-import-dialog.ct.tsx (score 0.5, 84 ln)
  tests/client/features/chat/components/chat-context-disclosure-section.ct.tsx (score 0.5, 91 ln)
  tests/client/features/chat/components/appearance-message-details-section.ct.tsx (score 0.5, 62 ln)
  tests/client/features/chat/anchors/join-invite-dialog.ct.tsx (score 0.5, 77 ln)
  tests/client/features/app-shell/hooks/use-appearance-root-effects.ct.tsx (score 0.5, 127 ln)
  tests/client/data/use-display-scripts.ct.tsx (score 0.5, 85 ln)
  tests/client/data/use-color-quoted-speech.ct.tsx (score 0.5, 59 ln)
  tests/client/data/query-inline-states.ct.tsx (score 0.5, 34 ln)
  tests/client/components/setting-switch-row.ct.tsx (score 0.5, 61 ln)
  tests/ui/primitives/aria-announcer/aria-announcer.ct.tsx (score 0.4, 36 ln)
  tests/ui/layout/container.ct.tsx (score 0.4, 34 ln)
  tests/ui/diff/diff.ct.tsx (score 0.4, 33 ln)
  tests/tooling/snap/ops/overflow.ct.tsx (score 0.4, 60 ln)
  tests/client/state/game-mode-transition.ct.tsx (score 0.4, 46 ln)
  tests/client/state/config-selection-store.ct.tsx (score 0.4, 57 ln)
  tests/client/state/config-row-annotation.ct.tsx (score 0.4, 31 ln)
  tests/client/state/character-selection-store.ct.tsx (score 0.4, 47 ln)
  tests/client/lib/motion-animation-record.ct.tsx (score 0.4, 140 ln)
  tests/client/features/user-admin/components/admin-ops-section.ct.tsx (score 0.4, 41 ln)
  tests/client/features/rpg/components/rpg-game-door.ct.tsx (score 0.4, 67 ln)
  tests/client/features/roster-preset/surfaces/roster-member-surface.ct.tsx (score 0.4, 91 ln)
  tests/client/features/refinery/components/scope-editor-dialog.ct.tsx (score 0.4, 62 ln)
  tests/client/features/plugin/components/plugin-command-args-body.ct.tsx (score 0.4, 75 ln)
  tests/client/features/plugin/components/extensions-list-header.ct.tsx (score 0.4, 62 ln)
  tests/client/features/discovery/components/corpus-list-header.ct.tsx (score 0.4, 38 ln)
  tests/client/features/config/lib/config-palette-source.ct.tsx (score 0.4, 57 ln) [FENCED]
  tests/client/features/chat/components/memory-recall-detail.ct.tsx (score 0.4, 37 ln)
  tests/client/features/chat/components/composer-chat-options.ct.tsx (score 0.4, 62 ln)
  tests/client/features/chat/components/composer-attachment-strip.ct.tsx (score 0.4, 32 ln)
  tests/client/features/chat/components/choice-send-provider.ct.tsx (score 0.4, 79 ln)
  tests/client/features/chat/components/chat-recall-indicator.ct.tsx (score 0.4, 68 ln)
  tests/client/features/chat/components/chat-books-section.ct.tsx (score 0.4, 65 ln)
  tests/client/features/chat/components/add-chat-book-dialog.ct.tsx (score 0.4, 68 ln)
  tests/client/features/character/hooks/use-tag-suggestion-mutations.ct.tsx (score 0.4, 74 ln)
  tests/client/features/character/components/character-tags-row.ct.tsx (score 0.4, 75 ln)
  tests/client/features/app-shell/components/you-sheet.ct.tsx (score 0.4, 44 ln)
  tests/client/features/app-shell/components/custom-theme-style.ct.tsx (score 0.4, 32 ln)
  tests/client/features/app-shell/components/appearance-reading-section.ct.tsx (score 0.4, 52 ln)
  tests/client/data/use-settings-viewer-view.ct.tsx (score 0.4, 30 ln)
  tests/client/data/use-prompt-macro-suggestions.ct.tsx (score 0.4, 56 ln)
  tests/client/data/use-carried-appearance.ct.tsx (score 0.4, 66 ln)
  tests/client/data/create-collection-surface.ct.tsx (score 0.4, 62 ln)
  tests/ui/primitives/fieldset/fieldset.ct.tsx (score 0.3, 41 ln)
  tests/ui/charts/labeled-chart-frame/labeled-chart-frame.ct.tsx (score 0.3, 30 ln)
  tests/ui/charts/histogram/histogram.ct.tsx (score 0.3, 28 ln)
  tests/ui/charts/heatmap/heatmap.ct.tsx (score 0.3, 33 ln)
  tests/client/state/corpus-compare-store.ct.tsx (score 0.3, 53 ln)
  tests/client/state/config-section-registry-context.ct.tsx (score 0.3, 27 ln)
  tests/client/state/config-search-store.ct.tsx (score 0.3, 38 ln)
  tests/client/state/config-group-open-store.ct.tsx (score 0.3, 35 ln)
  tests/client/state/config-focus-store.ct.tsx (score 0.3, 36 ln)
  tests/client/state/chat-list-filter-store.ct.tsx (score 0.3, 45 ln)
  tests/client/state/chat-context-section-open-store.ct.tsx (score 0.3, 40 ln)
  tests/client/lib/notify.ct.tsx (score 0.3, 50 ln)
  tests/client/lib/appearance-carrier-manifest.ct.tsx (score 0.3, 94 ln)
  tests/client/forms/save-status-seam.ct.tsx (score 0.3, 54 ln)
  tests/client/forms/capped-field.ct.tsx (score 0.3, 39 ln)
  tests/client/features/stats/components/analytics-personas-tab.ct.tsx (score 0.3, 29 ln)
  tests/client/features/rpg/components/rpg-scene-cards.ct.tsx (score 0.3, 30 ln)
  tests/client/features/home/lib/buddy-tile.ct.tsx (score 0.3, 45 ln)
  tests/client/features/chat/lib/chats-selection-title.ct.tsx (score 0.3, 37 ln)
  tests/client/features/chat/components/composer-arg-hint-strip.ct.tsx (score 0.3, 23 ln)
  tests/client/features/chat/components/compact-summary-peek.ct.tsx (score 0.3, 28 ln)
  tests/client/data/use-husk-reaper.ct.tsx (score 0.3, 58 ln)
  tests/client/data/use-gated-query.ct.tsx (score 0.3, 44 ln)
  tests/client/data/query-error-state.ct.tsx (score 0.3, 38 ln)
  tests/ui/tokens/index.ct.tsx (score 0.2, 31 ln)
  tests/ui/primitives/separator/separator.ct.tsx (score 0.2, 18 ln)
  tests/ui/content/theme-swatch/theme-swatch.ct.tsx (score 0.2, 32 ln)
  tests/client/state/world-entry-selection-store.ct.tsx (score 0.2, 26 ln)
  tests/client/state/tag-library-store.ct.tsx (score 0.2, 24 ln)
  tests/client/state/status-announcement-store.ct.tsx (score 0.2, 28 ln)
  tests/client/state/settings-save-status-store.ct.tsx (score 0.2, 45 ln)
  tests/client/state/section-registry.ct.tsx (score 0.2, 22 ln)
  tests/client/state/refinery-landing-focus-store.ct.tsx (score 0.2, 26 ln)
  tests/client/state/preset-search-store.ct.tsx (score 0.2, 27 ln)
  tests/client/state/preset-editor-view-store.ct.tsx (score 0.2, 29 ln)
  tests/client/state/databank-filter-store.ct.tsx (score 0.2, 27 ln)
  tests/client/state/corpus-selection-store.ct.tsx (score 0.2, 22 ln)
  tests/client/state/corpus-search-store.ct.tsx (score 0.2, 31 ln)
  tests/client/state/composer-focus-store.ct.tsx (score 0.2, 28 ln)
  tests/client/state/analytics-selection-store.ct.tsx (score 0.2, 22 ln)
  tests/client/state/analytics-search-store.ct.tsx (score 0.2, 28 ln)
  tests/client/forms/bound-fields/avatar-upload-field.ct.tsx (score 0.2, 46 ln)
  tests/client/forms/autosave-status.ct.tsx (score 0.2, 38 ln)
  tests/client/features/rpg/components/rpg-pack-rows.ct.tsx (score 0.2, 49 ln)
  tests/client/features/rpg/components/rpg-actor-trackers.ct.tsx (score 0.2, 48 ln)
  tests/client/features/refinery/components/run-controls-card.ct.tsx (score 0.2, 57 ln)
  tests/client/features/preset/components/variables-tab.ct.tsx (score 0.2, 34 ln)
  tests/client/features/preset/components/user-macros-tab.ct.tsx (score 0.2, 44 ln)
  tests/client/features/preset/components/prompt-assembly/section-row.ct.tsx (score 0.2, 56 ln)
  tests/client/features/character/components/character-history-tab.ct.tsx (score 0.2, 36 ln)
  tests/client/features/app-shell/components/section-context-host.ct.tsx (score 0.2, 20 ln)
  tests/client/data/use-online-status.ct.tsx (score 0.2, 21 ln)
  tests/client/data/bus/use-chat-bus.ct.tsx (score 0.2, 53 ln)
  tests/client/agent-nav/panel-request.ct.tsx (score 0.2, 44 ln)
  tests/ui/layout/row.ct.tsx (score 0.1, 17 ln)
  tests/client/state/section-registry-provider.ct.tsx (score 0.1, 15 ln)
  tests/client/state/section-registry-context.ct.tsx (score 0.1, 15 ln)
  tests/client/state/modal-registry-provider.ct.tsx (score 0.1, 17 ln)
  tests/client/state/modal-registry-context.ct.tsx (score 0.1, 17 ln)
  tests/client/state/chrome-registry-provider.ct.tsx (score 0.1, 15 ln)
  tests/client/state/chrome-registry-context.ct.tsx (score 0.1, 14 ln)
  tests/client/routes/route-pending.ct.tsx (score 0.1, 15 ln)
  tests/client/features/discovery/components/corpus-context-header.ct.tsx (score 0.1, 19 ln)
  tests/client/features/credentials/components/add-credential-dialog.ct.tsx (score 0.1, 16 ln)

read=24 fenced-in-corpus=11
```

## Appendix B — helper-hoisted non-retrying assert sites (the oneshot gate's callee blind spot; 149 sites)

Sites inside the 24 leg-1 files are VERIFIED BARRIERED; the rest are leg-2 triage input.

```text
tests/client/a11y/accessible-name-quality.suite.ct.tsx:134  expect(await labelInNameFindings(page)) .toEqual
tests/client/components/regex-scope-order.ct.tsx:97  expect(await gripNames(page)) .toEqual
tests/client/components/regex-scope-order.ct.tsx:193  expect(await gripNames(page)) .toEqual
tests/client/components/regex-scope-order.ct.tsx:214  expect(await gripNames(page)) .toEqual
tests/client/components/regex-scope-order.ct.tsx:215  expect(await moveUpNames(page)) .toEqual
tests/client/components/regex-scope-order.ct.tsx:224  expect(await gripNames(page)) .toEqual
tests/client/components/tag-picker-dialog.ct.tsx:135  expect(await topmostAt(page, "Cancel")) .toBe
tests/client/components/tag-picker-dialog.ct.tsx:136  expect(await topmostAt(page, CONFIRM)) .toBe
tests/client/components/tag-picker-dialog.ct.tsx:178  expect(await topmostAt(page, CONFIRM)) .toBe
tests/client/components/tag-picker-dialog.ct.tsx:212  expect(await topmostAt(page, CONFIRM)) .toBe
tests/client/components/tag-picker-dialog.ct.tsx:213  expect(await topmostAt(page, "Cancel")) .toBe
tests/client/features/app-shell/components/context-tabs-panel.ct.tsx:405  expect(await clippedCaptions(component)) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:457  expect(await panelText()) .toContain
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:573  expect(await dispatchCommandKey(page, { ctrlKey: true })) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:606  expect(await dispatchCommandKey(page, { metaKey: true })) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:607  expect(await dispatchCommandKey(page, { ctrlKey: true })) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:608  expect(await readProbe()) .toEqual
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:611  expect(await readProbe()) .toEqual
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:622  expect(await dispatchCommandKey(page, { metaKey: true })) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:664  expect(await readProbe()) .toEqual
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:670  expect(await dispatchCommandKey(page, { metaKey: true })) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1065  expect(
      await cssCustomProperty(nestedThemePreview, "--color-border"),
      "an inline nested ThemeScop
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1109  expect(await cssCustomProperty(portal, "--color-background")) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1110  expect(await cssCustomProperty(portal, "color-scheme")) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1111  expect(await cssCustomProperty(popup, "--color-background")) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1112  expect(await cssCustomProperty(popup, "color-scheme")) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1761  expect(await shellPersistedOverrides(page)) .toEqual
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1863  expect(await deficitAt(constrained)) .toBeGreaterThan
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1864  expect(await deficitAt(equality)) .toBe
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:2571  expect(await shellPersistedOverrides(page)) .toEqual
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:3330  expect(await flipDistance()) .toBeCloseTo
tests/client/features/app-shell/surfaces/app-shell.ct.tsx:4511  expect(await readDropDefault(page)) .toBe
tests/client/features/automation/components/rules-section.ct.tsx:1083  expect(await hitExtent(testAction, "y")) .toBeGreaterThanOrEqual
tests/client/features/automation/components/rules-section.ct.tsx:1084  expect(await hitExtent(more, "y")) .toBeGreaterThanOrEqual
tests/client/features/automation/components/rules-section.ct.tsx:1085  expect(await hitExtent(more, "x")) .toBeGreaterThanOrEqual
tests/client/features/character/components/character-create-actions.ct.tsx:168  expect(await hitExtent(button, "x"), "the axis the 40px box was short on") .toBeGreaterThanOrEqual
tests/client/features/character/components/character-create-actions.ct.tsx:169  expect(await hitExtent(button, "y")) .toBeGreaterThanOrEqual
tests/client/features/character/surfaces/character-editor-surface.ct.tsx:270  expect(await readAutosaveStatusTranscript(page)) .toEqual
tests/client/features/character/surfaces/character-editor-surface.ct.tsx:694  expect(await readPhantomScrollers(page)) .toEqual
tests/client/features/chat/components/assembly-preview-panel.ct.tsx:222  expect(await filledFraction(component)) .toBeLessThan
tests/client/features/chat/components/injections-manager.ct.tsx:161  expect(await measureClamp(excerpt)) .toMatchObject
tests/client/features/chat/components/message-media-block.ct.tsx:140  expect(await layoutBox(zoomed)) .toEqual
tests/client/features/chat/components/message-row.ct.tsx:787  expect(await bgOf(tile)) .toEqual
tests/client/features/chat/components/message-row.ct.tsx:1963  expect(await metadataRowBackground(component)) .toBe
tests/client/features/chat/components/room-overrides-form.ct.tsx:81  expect(await measureClamp(snippet)) .toMatchObject
tests/client/features/chat/surfaces/chat-room-surface.ct.tsx:637  expect(await computedPx(island, "paddingLeft"), "an un-tiered room falls back to the airy --spacing-block step
tests/client/features/chat/surfaces/chat-room-surface.ct.tsx:643  expect(await computedPx(island, "borderTopLeftRadius")) .toBe
tests/client/features/chat/surfaces/chat-room-surface.ct.tsx:644  expect(await computedPx(island, "borderTopLeftRadius")) .toBeLessThan
tests/client/features/chat/surfaces/chat-room-surface.ct.tsx:715  expect(await renderedAccent(bubble)) .toBe
tests/client/features/config/components/config-welcome.ct.tsx:276  expect(await fontPx(masthead), "the masthead rides --text-display") .toBeCloseTo
tests/client/features/config/components/config-welcome.ct.tsx:279  expect(await fontPx(pane.locator(POPULATED).getByText("Tags", { exact: true })), "the built library's name rid
tests/client/features/config/components/config-welcome.ct.tsx:282  expect(await fontPx(pane.getByRole("heading", { name: "Regex scripts" })), "a not-built library's name rides -
tests/client/features/config/surfaces/config-content-surface.ct.tsx:490  expect(await readEscapedAbsolutes(page, '[role="region"][aria-label="Appearance settings"]')) .toEqual
tests/client/features/config/surfaces/config-content-surface.ct.tsx:491  expect(await readEscapedAbsolutes(page, `[role="region"][aria-label="${LIST_REGION}"]`)) .toEqual
tests/client/features/config/surfaces/config-list-surface.ct.tsx:895  expect(await overflows(busiestScent(listPane)), "the stage words used to want 396-572px of a 133px column") .t
tests/client/features/databank/surfaces/databank-detail-surface.ct.tsx:492  expect(await readPhantomScrollers(page)) .toEqual
tests/client/features/discovery/components/corpus-content.ct.tsx:584  expect(await readPhantomScrollers(page)) .toEqual
tests/client/features/imagery/components/image-detail-body.ct.tsx:86  expect(await layoutBox(zoomed)) .toEqual
tests/client/features/imagery/components/image-edit-body.ct.tsx:84  expect(await layoutBox(source)) .toEqual
tests/client/features/imagery/components/image-edit-body.ct.tsx:131  expect(await layoutBox(edited)) .toEqual
tests/client/features/preset/components/params-deck.ct.tsx:863  expect(await partColor(ghostRow, "slider-thumb")) .toBe
tests/client/features/preset/components/params-deck.ct.tsx:864  expect(await partColor(explicitRow, "slider-thumb")) .toBe
tests/client/features/preset/components/params-deck.ct.tsx:868  expect(await partColor(ghostRow, "slider-indicator")) .toBe
tests/client/features/preset/components/params-deck.ct.tsx:870  expect(await partColor(explicitRow, "slider-indicator")) .toBe
tests/client/features/preset/components/preset-structure-tabs.ct.tsx:41  expect(await overflows(value), "the Speaker-names trigger truncates its own current value") .toBe
tests/client/features/preset/components/preset-structure-tabs.ct.tsx:52  expect(await overflows(value), "the Speaker-names trigger truncates its own current value") .toBe
tests/client/features/preset/components/prompt-assembly/section-drill-in.ct.tsx:387  expect(await trackColor()) .toBe
tests/client/features/preset/components/prompt-assembly/section-drill-in.ct.tsx:392  expect(await trackColor()) .toBe
tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx:376  expect(await readAutosaveStatusTranscript(page)) .toEqual
tests/client/features/preset/surfaces/preset-editor-surface.ct.tsx:1639  expect(await readPhantomScrollers(page)) .toEqual
tests/client/features/preset/surfaces/preset-library-surface.ct.tsx:91  expect(await focalHierarchyRatio(await mount(<PresetLibraryWelcomeWideStory />))) .toBeGreaterThanOrEqual
tests/client/features/preset/surfaces/preset-library-surface.ct.tsx:95  expect(await focalHierarchyRatio(await mount(<PresetLibraryWelcomeNarrowStory />))) .toBeGreaterThanOrEqual
tests/client/features/preset/surfaces/preset-library-surface.ct.tsx:312  expect(await boxes(), "a hover-variable layout is the hit-test oscillator — see ROW_REVEAL_SWAP") .toEqual
tests/client/features/refinery/components/lane-run-control.ct.tsx:92  expect(await hairlineAfterContent(page)) .toBe
tests/client/features/refinery/components/lane-run-control.ct.tsx:115  expect(await hairlineAfterContent(page)) .toBe
tests/client/features/refinery/components/payload-view.ct.tsx:318  expect(await heroTrace(page)) .toEqual
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2374  expect(await zeroSelectedTabGroups(page)) .toBe
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2376  expect(await currentCellNames(page)) .toEqual
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2393  expect(await tabInto(page, '[data-slot="context-rail"] [role="toolbar"]')) .toBe
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2586  expect(await glyphColor("Game")) .toBe
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2588  expect(await glyphColor("This chat")) .toBe
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:2594  expect(await glyphColor("Preview")) .toBe
tests/client/features/rpg/lib/rpg-context-section.ct.tsx:3971  expect(await tabInto(page, '[data-slot="context-rail"] [role="toolbar"]')) .toBe
tests/client/features/stats/surfaces/analytics-overview-surface.ct.tsx:339  expect(await readPhantomScrollers(page)) .toEqual
tests/client/features/workloads/lib/workloads-group.ct.tsx:321  expect(await outerHeight()) .toBeCloseTo
tests/client/forms/form-identity.suite.ct.tsx:106  expect(await unidentifiedControls(ok)) .toEqual
tests/support/browser/touch-floor.ct.tsx:38  expect(await hitExtent(control, "x"), "a glyph button's overflowing ::after must still reach the coarse touch 
tests/support/browser/touch-floor.ct.tsx:39  expect(await hitExtent(control, "y"), "a glyph button's overflowing ::after must still reach the coarse touch 
tests/ui/art/web-weave/web-weave-touch.ct.tsx:88  expect(await frameFingerprint(canvas)) .toBe
tests/ui/art/web-weave/web-weave.ct.tsx:377  expect(await solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), "the probe window must start as bare silk"
tests/ui/art/web-weave/web-weave.ct.tsx:378  expect(await solidPixelsAround(canvas, hub, HUNT_PROBE_HALF_PX), "and the instrument must SEE her, at the hub,
tests/ui/art/web-weave/web-weave.ct.tsx:408  expect(await solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), "decoration must not answer a cursor") .to
tests/ui/art/web-weave/web-weave.ct.tsx:409  expect(await solidPixelsAround(canvas, hub, HUNT_PROBE_HALF_PX), "she never left the hub") .toBeGreaterThan
tests/ui/art/web-weave/web-weave.ct.tsx:427  expect(await frameFingerprint(canvas)) .toBe
tests/ui/code-editor/code-editor.ct.tsx:281  expect(await frameShadow()) .toBe
tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx:228  expect(await frameHeight(cmp)) .toBe
tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx:258  expect(await frameHeight(cmp)) .toBe
tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx:264  expect(await frameHeight(cmp)) .toBe
tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx:613  expect(await frameHeight(cmp)) .toBe
tests/ui/content/theme-scope/theme-scope.ct.tsx:87  expect(await ratioOf("accent")) .toBeGreaterThanOrEqual
tests/ui/content/theme-scope/theme-scope.ct.tsx:88  expect(await ratioOf("primary")) .toBeGreaterThanOrEqual
tests/ui/density-tier.suite.ct.tsx:69  expect(await computedPx(card, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:101  expect(await computedPx(plain, "borderTopLeftRadius")) .toBe
tests/ui/density-tier.suite.ct.tsx:102  expect(await computedPx(floating, "borderTopLeftRadius")) .toBe
tests/ui/density-tier.suite.ct.tsx:118  expect(await computedPx(inner, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:119  expect(await computedPx(outerCard, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:134  expect(await computedPx(inner, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:135  expect(await computedPx(outerCard, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:151  expect(await computedPx(card, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:194  expect(await computedPx(compactCard, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:239  expect(await computedPx(comfortableCard, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:240  expect(await computedPx(compactCard, "paddingTop")) .toBe
tests/ui/density-tier.suite.ct.tsx:779  expect(await computedPx(tree.locator('[data-slot="file-dropzone"]'), "borderTopLeftRadius")) .toBe
tests/ui/primitives/badge/badge.ct.tsx:157  expect(await measure("max")) .toBeCloseTo
tests/ui/primitives/badge/badge.ct.tsx:158  expect(await measure("none")) .toBeCloseTo
tests/ui/primitives/badge/badge.ct.tsx:383  expect(await height("flow")) .toBeLessThanOrEqual
tests/ui/primitives/badge/badge.ct.tsx:386  expect(await height("pill")) .toBeGreaterThan
tests/ui/primitives/badge/badge.ct.tsx:409  expect(await radius("flow")) .toBe
tests/ui/primitives/badge/badge.ct.tsx:410  expect(await radius("flow")) .toBeLessThan
tests/ui/primitives/button/button.ct.tsx:479  expect(await paint(TOKENS["color.destructive"].value)) .toBe
tests/ui/primitives/button/button.ct.tsx:480  expect(await paint(TOKENS["color.sheen"].value)) .toBe
tests/ui/primitives/button/button.ct.tsx:572  expect(await readScale()) .toBe
tests/ui/primitives/card/card.ct.tsx:36  expect(await radius("plain")) .toBe
tests/ui/primitives/card/card.ct.tsx:37  expect(await radius("floating")) .toBe
tests/ui/primitives/card/card.ct.tsx:94  expect(await radius("island")) .toBeLessThan
tests/ui/primitives/card/card.ct.tsx:123  expect(await shadowOf(page, "scoped"), "the Light palette must not paint the dark float recipe") .toBe
tests/ui/primitives/card/card.ct.tsx:141  expect(await shadowOf(page, "scoped")) .toBe
tests/ui/primitives/list-row/list-row.ct.tsx:376  expect(await hitAt()) .toBe
tests/ui/primitives/list-row/list-row.ct.tsx:380  expect(await hitAt()) .toBe
tests/ui/primitives/menu/menu.ct.tsx:144  expect(await shadowOf(resting), "an un-highlighted row draws no indicator") .toBe
tests/ui/primitives/message-list/message-list.ct.tsx:231  expect(await rowBottomDelta(component, "Message 499")) .toBeLessThan
tests/ui/primitives/message-list/message-list.ct.tsx:247  expect(await viewportSizingHeight(component)) .toBeGreaterThan
tests/ui/primitives/message-list/message-list.ct.tsx:482  expect(await viewportHeight()) .toBe
tests/ui/primitives/message-list/message-list.ct.tsx:561  expect(await highestScrollTopSeen(component, page)) .toBeLessThanOrEqual
tests/ui/primitives/message-list/message-list.ct.tsx:594  expect(await highestScrollTopSeen(component, page)) .toBeLessThanOrEqual
tests/ui/primitives/picker-cell/picker-cell.ct.tsx:74  expect(await read()) .toEqual
tests/ui/primitives/picker-cell/picker-cell.ct.tsx:76  expect(await read()) .toEqual
tests/ui/primitives/picker-cell/picker-cell.ct.tsx:79  expect(await read()) .toEqual
tests/ui/primitives/slider/slider.ct.tsx:217  expect(await backgroundAlpha(indicators.nth(1))) .toBeGreaterThan
tests/ui/primitives/slider/slider.ct.tsx:221  expect(await backgroundAlpha(thumbs.nth(2))) .toBe
tests/ui/primitives/slider/slider.ct.tsx:223  expect(await backgroundAlpha(indicators.nth(2))) .toBe
tests/ui/primitives/slider/slider.ct.tsx:245  expect(await backgroundAlpha(thumbs.nth(0))) .toBeGreaterThan
tests/ui/primitives/slider/slider.ct.tsx:246  expect(await backgroundAlpha(thumbs.nth(1))) .toBe
tests/ui/primitives/tabs/tabs.ct.tsx:250  expect(await gapOf("Inventory")) .toBe
tests/ui/primitives/tabs/tabs.ct.tsx:251  expect(await gapOf("Two")) .toBeCloseTo
tests/ui/primitives/toast/toast.ct.tsx:261  expect(await hasAriaModal(error)) .toBe
tests/ui/primitives/toast/toast.ct.tsx:268  expect(await hasAriaModal(plain)) .toBe
tests/ui/primitives/toast/toast.ct.tsx:355  expect(await contrastRatio(page, fill, surface)) .toBeGreaterThanOrEqual
tests/ui/primitives/toast/toast.ct.tsx:361  expect(await contrastRatio(page, label, fill)) .toBeGreaterThanOrEqual
```

(149 sites across 49 files.)
