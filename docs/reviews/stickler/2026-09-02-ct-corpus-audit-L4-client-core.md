---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 4, shard L4 (client data/lib/state/forms + app-shell/settings/databank/plugin/home)

Lane `cb-ct-audit-L4`, #1229. Continues legs 1-3 (Phase A over all 469 `.ct.tsx`; 84/469 full-read).
Method and taxonomy: `2026-09-02-ct-corpus-audit-leg1.md` §2 rubric + Appendix A, `-leg2.md`, `-leg3.md` —
read in full, not restated here.

**Scope:** `tests/client/{data,lib,state,forms,a11y,agent-nav,agent-rpg,agent-seed,compose}/**` +
`tests/client/features/{app-shell,settings,connections,databank,plugin,home}/**`, minus files legs 1-3
already read and minus the sibling-lane exclusion set named in the brief.

**Scope note:** `tests/client/features/connections/` does not exist on this tree (`git ls-files` — zero
hits). The credentials domain (`tests/client/features/credentials/**`) is the closest match but the brief
explicitly excludes `connections-roles-section.ct.tsx` from it as a sibling lane's file and does not
otherwise claim `credentials/` for this shard — treated as a spec/naming mismatch, not guessed into scope.
Flagging rather than silently expanding or silently dropping it.

## Population

`git ls-files` over the scope directories, minus already-read (legs 1-3) and minus the excluded siblings
(`plugin-scripted-surface`, `connections-roles-section`, `use-invalidation`, `create-entity-mutation`,
`use-orb-socket`, `use-user-bus`, `motion-flaggers`, `motion-stats`, `long-task-tracer`,
`appearance-background-section`, `config-*`):

| Dir | Total .ct.tsx | Already read (legs 1-3) | Excluded (sibling) | Remaining (this shard) |
| - | - | - | - | - |
| `data/` (+ `data/bus/`) | 25 | 1 (`use-open-refinery`) | 4 (`use-orb-socket`, `use-user-bus`, `use-invalidation`, `create-entity-mutation`) | 18 |
| `lib/` | 8 | 0 | 3 (`long-task-tracer`, `motion-flaggers`, `motion-stats`) | 5 |
| `state/` | 42 | 0 | 0 | 42 |
| `a11y/` | 1 | 1 | 0 | 0 |
| `agent-nav/` | 1 `.ct.tsx` | 0 | 0 | 1 |
| `agent-rpg/`, `agent-seed/`, `compose/` | 0 `.ct.tsx` files | — | — | 0 |
| `forms/` (+ `bound-fields/`) | 9 | 1 (`form-identity.suite`) | 0 | 8 |
| `features/app-shell/**` | 16 | 2 (`app-shell.ct.tsx`, `context-tabs-panel`) | 1 (`appearance-background-section`) | 14 (`use-appearance-root-effects` counted) minus... see note below |
| `features/settings/**` | 3 `.ct.tsx` | 1 (`appearance-looks-section`) | 0 | 2 |
| `features/connections/**` | 0 (dir absent) | — | — | 0 |
| `features/databank/**` | 5 | 1 (`databank-detail-surface`) | 0 | 4 |
| `features/plugin/**` | 13 | 3 (`plugins-install-section`, `plugin-surface-renderer`, `tool-card`) | 1 (`plugin-scripted-surface`) | 9 |
| `features/home/**` | 5 | 1 (`home-surface`) | 0 | 4 |

**Population this shard: 107 files.**

Every population number above is an ls-files count printed and cross-checked at scope time; see §Receipts.

## Findings

None confirmed. See per-directory sections below.

## Per-file verdicts — chunk 1: lib/, agent-nav/, forms/, settings/, databank/, home/ (24 files, all CLEAN)

Every file below read whole, top to bottom (all under ~560 lines; none required a second offset read).

| File | Lines | Verdict |
| - | - | - |
| `tests/client/lib/agent-bridge.ct.tsx` | 342 | CLEAN. `__orb` bridge capability census, ring-reset isolation, and three real defect-proof regressions (#145 route-not-resolved false-idle, #282 chained-query false-idle) — all barriered on rendered markers, never sleeps |
| `tests/client/lib/appearance-carrier-manifest.ct.tsx` | 93 | CLEAN. Matrix comparison with a non-vacuity floor (`expected` pinned to 36) |
| `tests/client/lib/motion-animation-record.ct.tsx` | 139 | CLEAN. Real CSS transitions + WAAPI, `expect.poll` on a live reader, both lifecycle-attributed and stale-attribution arms |
| `tests/client/lib/notify.ct.tsx` | 49 | CLEAN. Real toast provider mount, F1 render-half regression |
| `tests/client/lib/weave-glyph.ct.tsx` | 43 | CLEAN. Small seal CT, every prop pinned |
| `tests/client/agent-nav/panel-request.ct.tsx` | 43 | CLEAN. Three-arm refusal-wording pin (declared-unavailable / nothing-published hedge / declared-available-but-failed), all exact-text, all failable |
| `tests/client/forms/autosave-status.ct.tsx` | 37 | CLEAN |
| `tests/client/forms/capped-field.ct.tsx` | 38 | CLEAN. Computed-color arms resolved via `resolvedTokenColor`, never a literal |
| `tests/client/forms/create-autosave-entity-form.ct.tsx` | 259 | CLEAN. D78 CT-1..12 canonical regressions, real timers, macrotask-window negative proofs (CT-2/CT-6/CT-8/CT-9/CT-12) — the house idiom done right throughout |
| `tests/client/forms/create-saved-entity-form.ct.tsx` | 127 | CLEAN. `promote()`'s `dontUpdateMeta` isDirty guarantee, draft-mirror/restore/flush-on-unmount races |
| `tests/client/forms/save-status-seam.ct.tsx` | 53 | CLEAN. HOSTED vs DEGRADED aggregation arms via the real settings shell |
| `tests/client/forms/section-save-status.ct.tsx` | 56 | CLEAN. The house deterministic-race idiom done correctly: `before = trpc.count(...)` captured, then `expect.poll(...).toBeGreaterThan(before)` |
| `tests/client/forms/bound-fields/avatar-upload-field.ct.tsx` | 45 | CLEAN. Epoch-ordering proof — an older upload completion cannot clobber a newer one |
| `tests/client/forms/bound-fields/use-bound-field.ct.tsx` | 96 | CLEAN. Correctly models blur-vs-popup-close per control type (trigger controls commit touch on `onOpenChange`, not DOM blur) |
| `tests/client/features/settings/lib/appearance-group.ct.tsx` | 287 | CLEAN. SET-SEAMS pane invariants: door order, single-column geometry harness, sibling-isolation key-minimal patches, status aggregation, nav/search parity, deep link |
| `tests/client/features/settings/lib/chat-behavior-group.ct.tsx` | 182 | CLEAN. Same SET-SEAMS discipline, two-sections-one-namespace sibling isolation |
| `tests/client/features/databank/components/databank-context-body.ct.tsx` | 234 | CLEAN. F-12/#276 promise-pays-payment pins, geometry-fits-narrowest-rail check, held-write lock/unlock/retry sequencing |
| `tests/client/features/databank/components/databank-list-header.ct.tsx` | 240 | CLEAN. D-6 confirm-gating, N-6 disabled-reason-is-a-group-label (not an unreachable `title=`), P2/N-2 dialog-floor geometry both halves in one test |
| `tests/client/features/databank/lib/home-documents-tile.ct.tsx` | 304 | CLEAN. Health-line derivation, aggregate-vs-row-chip dedup, store-not-echo assertions throughout, narrow-host wrap-containment geometry with a stated planted control |
| `tests/client/features/databank/surfaces/databank-library-surface.ct.tsx` | 557 | CLEAN — instrument-grade. §6.1/D-1/D-11 rulings, server-side keyset paging (head-page-not-evicted proof via band COUNT not DOM presence, explicitly reasoned against the virtualization blind spot), wire-payload assertions throughout |
| `tests/client/features/home/components/home-tile.ct.tsx` | 191 | CLEAN. F14 CLS-reservation geometry, first-boot arm explicitly labelled a FENCE (states what tier proves the real defect) |
| `tests/client/features/home/lib/buddy-tile.ct.tsx` | 45 | CLEAN. Doorway contract (zero controls), self-aware scope note on the sort-last test |
| `tests/client/features/home/lib/section-jump-tile.ct.tsx` | 139 | CLEAN. Registry-derived rows via a TOTAL `Record` (new section = compile error, not silent staleness); Planned-badge zero-count is self-aware about needing a future positive arm |
| `tests/client/features/home/surfaces/home-column-balance.suite.ct.tsx` | 287 | CLEAN — instrument-grade owner-ruling matrix fence (#226). 12-cell width×appearance matrix, closed-regime bar + never-regress baseline + air-gap bound, every re-baseline entry carries a dated receipt for why it moved |

**Taxonomy sweep, chunk 1 (24 files):** 0 literal `reports/` writes · 0 `as unknown as`/`as any as` casts · 0 `test.skip/.fixme/.todo` · 0 assertion-free tests · every `ONESHOT-OK`/bare-`expect(trpc.count())` zero-read barriered by a rendered marker or a same-click ordering argument, none of the leg-1-F2 unbarriered shape found · no `expect.poll` on a bare unwindowed `trpc.count()` used as the ONLY evidence (every deterministic-race read either polls `toBeGreaterThan(before)` or follows a rendered settle).

## Per-file verdicts — chunk 2: plugin/ (9 files, all CLEAN)

| File | Lines | Verdict |
| - | - | - |
| `tests/client/features/plugin/components/extensions-list-header.ct.tsx` | 61 | CLEAN |
| `tests/client/features/plugin/components/plugin-command-args-body.ct.tsx` | 74 | CLEAN. Typed-arg coercion + required-arg block, both barriered |
| `tests/client/features/plugin/components/plugin-frame.ct.tsx` | 165 | CLEAN — instrument-grade. Real opaque-origin sandboxed document; window-IDENTITY auth proven with negative-then-positive control ordering (a same-shape message from a different window is ignored, then the real frame's message is honoured) |
| `tests/client/features/plugin/components/plugin-message-footer-surfaces.ct.tsx` | 159 | CLEAN. Byte-identical-row proof at two widths for the silent/no-surface case, `$state`-bound silence gated on the SPEC not a timing race |
| `tests/client/features/plugin/components/plugin-primary-cta.suite.ct.tsx` | 212 | CLEAN — instrument-grade #818 owner-ruling arbitration: pixel-fill comparison (not just the `data-cta` attribute), refusal-channel console-line assertions, document-order-not-spec-order discriminator |
| `tests/client/features/plugin/lib/chat-anchors.ct.tsx` | 306 | CLEAN. Full-geometry byte-identical-room proofs at both container-query arms (desktop/mobile), disabled-plugin arm, `$state`-bound silence arm |
| `tests/client/features/plugin/lib/extensions-section.ct.tsx` | 267 | CLEAN. Four-way "which emptiness" disambiguation (nothing-installed / awaiting-consent / all-off / zero-pages), attribution band pinned on both pages of a two-page roster |
| `tests/client/features/plugin/lib/plugin-command-palette-source.ct.tsx` | 107 | CLEAN. First-class palette row + search + real dispatch + per-caller-scope wall (unregistered source is byte-identical) |
| `tests/client/features/plugin/surfaces/page-dialog-frame.suite.ct.tsx` | 141 | CLEAN. §787 page/dialog frame-tier admission, both anchors, real sandboxed iframe |

**Taxonomy sweep, chunk 2 (9 files):** 0 literal `reports/` writes · 0 `as unknown as` casts · 0 skip/fixme
· 0 assertion-free tests · zero racy `trpc.count()` zero-reads (every negative is either console-line-counted, byte-identical-geometry-barriered, or spec-gated rather than timing-gated).

## Per-file verdicts — chunk 3: data/ (18 files, all CLEAN — 1 minor observation)

| File | Lines | Verdict |
| - | - | - |
| `tests/client/data/bus/use-chat-bus.ct.tsx` | 52 | CLEAN. R1-2 attach-cursor-floor regression, real EventSource reconnect via `routeOrbSocket` |
| `tests/client/data/create-collection-surface.ct.tsx` | 61 | CLEAN. Real infinite-query tail-fetch guard + no-op-past-exhaustion |
| `tests/client/data/query-boundary.ct.tsx` | 187 | CLEAN — the corpus's own documented exemplar file. `trpcHold` deferred-responder arms, `#885`/`#837` reservation-sentinel-survives-a-settle proof with a stated non-vacuity/planted-tautology-avoidance clause |
| `tests/client/data/query-error-state.ct.tsx` | 38 | CLEAN |
| `tests/client/data/query-inline-states.ct.tsx` | 34 | CLEAN |
| `tests/client/data/skeleton-rows.ct.tsx` | 49 | CLEAN. `datum` shape's height comparison resolves the control token live, never a literal |
| `tests/client/data/use-carried-appearance.ct.tsx` | 65 | **CLEAN but the header comment is STALE** — see Finding G1 below |
| `tests/client/data/use-color-quoted-speech.ct.tsx` | 59 | CLEAN. Missing-key-reads-as-default and failed-read-degrades-to-default both pinned |
| `tests/client/data/use-display-scripts.ct.tsx` | 85 | CLEAN. F1 dead-wire regression, all 4 declared pins present and asserted through rendered body text |
| `tests/client/data/use-gated-query.ct.tsx` | 44 | CLEAN. `skipToken`-never-builds-the-real-key pinned via a responder that THROWS if called |
| `tests/client/data/use-husk-reaper.ct.tsx` | 58 | CLEAN. Fire-and-forget failure posture explicitly pinned (no toast, no navigation block) |
| `tests/client/data/use-online-status.ct.tsx` | 21 | CLEAN |
| `tests/client/data/use-plugin-display-text.ct.tsx` | 70 | CLEAN. Byte-identity-when-off pinned as a REQUEST COUNT (not just an unchanged string) with a deliberately-fed-but-never-expected responder as its own trap |
| `tests/client/data/use-prompt-macro-suggestions.ct.tsx` | 56 | CLEAN. No-empty-window arm is a documented deliberately-unfed read (ct-unfed-reads.baseline.json) |
| `tests/client/data/use-settings-viewer-view.ct.tsx` | 30 | CLEAN |
| `tests/client/data/use-session-recovery.ct.tsx` | 128 | CLEAN — instrument-grade. The no-401 identity-swap suite: an explicit sensor-liveness control test runs BEFORE the swap test it protects; `route.abort("aborted")` used deliberately (not the default `"failed"`, which would swap in an error page and make later assertions vacuous) |
| `tests/client/data/use-start-chat.ct.tsx` | 113 | CLEAN. `chat.getChat` deliberately left unstubbed (answers `null`) as the COLD-read planted control for the cache-seed proof |
| `tests/client/data/use-upload-asset.ct.tsx` | 68 | CLEAN. Both ONESHOT-OK zero/non-poll reads carry an explicit reason for why a poll would be WRONG (a rejected-promise-then-read barrier, and a monotonic-count-only-climbs poll would pass while merely transiting the target) |

### G1 · P4 — `use-carried-appearance.ct.tsx`'s header describes 5 pins; the file tests 2

`tests/client/data/use-carried-appearance.ct.tsx:1-16` — the header comment lists five pins ("THE FIVE
PINS: 1. COMMITTED … 2. DRAFT → founding CARDS project … 3. DRAFT → partial cast reads pending … 4.
LANDING/blank draft → undefined … 5. FAILED card read degrades to undefined") but the file contains
exactly two `test(...)` blocks: COMMITTED (pin 1) and LANDING/blank-draft (pin 4, mislabeled — its own
test name says "LANDING and a BLANK draft" which conflates two of the header's four listed states).
Pins 2, 3 and 5 have no test.

Not a functional defect: reading `packages/client/src/data/use-carried-appearance.ts:1-40` (git log:
`13ee1bde6 feat(chat): R1 — create-on-Start-click; the client draft runtime is deleted`, which post-dates
this CT's header) shows the hook is now ONE ARM — `chat.getChat`'s roster only, `undefined` on any
unresolved/failed read — and the source's OWN header says the draft-phase card-reading arm "is deleted:
it answered a question that can no longer be asked". So pins 2 and 3 describe DELETED behavior (the CT's
header simply was not trimmed when R1 landed); pin 5 ("a FAILED card read degrades to undefined") is
untested but is a real, still-live, load-bearing claim about the CURRENT single-query hook (`chat.getChat`
erroring should still yield `undefined`, never a thrown boundary) — a genuine coverage gap, not a stale
claim. Fix shape: trim the header to the 2 pins that still apply, and add one `trpcError` arm for pin 5
(the sibling files in this same chunk — `use-color-quoted-speech.ct.tsx`, `use-settings-viewer-view.ct.tsx`
— show the exact one-line house idiom for it). P4 because the hook is `NON_SUSPENDING` documented and the
untested arm is one query away from every other non-suspense hook in this directory, all of which DO pin it.

**Taxonomy sweep, chunk 3 (18 files):** 0 literal `reports/` writes · 0 `as unknown as` casts · 0
skip/fixme · 0 assertion-free tests · every deterministic-race read barriered (settle-then-read, a
throwing-responder trap, or an explicit reasoned exemption from polling).

## Per-file verdicts — chunk 4: features/app-shell/ (14 files, all CLEAN)

| File | Lines | Verdict |
| - | - | - |
| `tests/client/features/app-shell/components/appearance-effects-section.ct.tsx` | 143 | CLEAN. Key-minimal patch assertions, prose-measure geometry with a two-arm control receipt in-file |
| `tests/client/features/app-shell/components/appearance-reading-section.ct.tsx` | 52 | CLEAN |
| `tests/client/features/app-shell/components/appearance-sizing-section.ct.tsx` | 200 | CLEAN — instrument-grade #1099 G4 contrast-ladder rework: canvas-decoded luminance (never a regex, which the file's own first draft caught as a false-verdict trap), positive control against an empty-ladder vacuous pass |
| `tests/client/features/app-shell/components/boot-veil.ct.tsx` | 88 | CLEAN. Real `data-app-ready` seam driven directly, min-display-floor race, reduced-motion arm |
| `tests/client/features/app-shell/components/bug-report-button.ct.tsx` | 256 | CLEAN — instrument-grade #1095/#1193 honesty-receipt proofs: absent-bridge sources report themselves absent WITH A REASON rather than a silent empty census; a `performance.now()`-offset conversion proven via a kept/dropped split with no ambient clock read |
| `tests/client/features/app-shell/components/context-bracket.ct.tsx` | 255 | CLEAN — instrument-grade #874/#875/#878/#899 framebuffer-decoded contrast proofs across all 3 shipped themes; FENCE vs defect-proof arms explicitly labelled; polled (not sampled-once) captions for an in-transition color |
| `tests/client/features/app-shell/components/custom-theme-style.ct.tsx` | 32 | CLEAN |
| `tests/client/features/app-shell/components/rail.ct.tsx` | 270 | CLEAN — instrument-grade #484/#1129 mobile-bar-swap and live-region-attribution proofs; offender-list polling pattern for "no label outgrows its tab" |
| `tests/client/features/app-shell/components/section-context-host.ct.tsx` | 20 | CLEAN |
| `tests/client/features/app-shell/components/shell-topbar.ct.tsx` | 78 | CLEAN. Phone-vs-desktop vocabulary fork with emulation proven before trusting it |
| `tests/client/features/app-shell/components/theme-background-layer.ct.tsx` | 60 | CLEAN |
| `tests/client/features/app-shell/components/theme-background-video-layer.ct.tsx` | 49 | CLEAN |
| `tests/client/features/app-shell/components/you-sheet.ct.tsx` | 44 | CLEAN. One-derivation-feeds-both-surfaces proof (a displaced tab cannot vanish from both) |
| `tests/client/features/app-shell/hooks/use-appearance-root-effects.ct.tsx` | 127 | CLEAN. Every expected value reconstructed from live-read source tokens, never a hardcoded literal; non-default test values chosen to defeat a coincidental default-fallback pass |

**Taxonomy sweep, chunk 4 (14 files):** 0 literal `reports/` writes · 0 `as unknown as` casts · 0
skip/fixme · 0 assertion-free tests · every deterministic-race read barriered.

## Per-file verdicts — chunk 5: state/ (42 files, all CLEAN)

Every file in `tests/client/state/*.ct.tsx` (42 files, no subdirectories). All read whole (13-368 lines
each; none required a second offset read). The dominant house idiom in this directory — reactive-hook
stores driven via `mount` + a probe's `<output>` text assertion, justified per-file as needing a real
browser render because `useSyncExternalStore` cannot be exercised headlessly — holds throughout with no
deviation, and several files explicitly reason about WHY they must be a CT rather than a unit test.

| File | Lines | Verdict |
| - | - | - |
| `active-chat-store.ct.tsx` | 130 | CLEAN. Husk-reap candidate publication (idempotent, forgotten-after-publish), dual-write list-select-and-close |
| `analytics-search-store.ct.tsx` | 27 | CLEAN |
| `analytics-selection-store.ct.tsx` | 21 | CLEAN |
| `appearance-boot-hint.ct.tsx` | 81 | CLEAN. `addInitScript`-seeded pre-module-init boot proof; corrupt-blob heals-to-floor arm |
| `character-library-store.ct.tsx` | 133 | CLEAN. Three-state tag-filter cycle (include→exclude→off, off = absence not an inert row), transient-vs-persisted split proven against real localStorage both ways |
| `character-selection-store.ct.tsx` | 46 | CLEAN |
| `chat-context-section-open-store.ct.tsx` | 39 | CLEAN. Sparse-Record-vs-list-of-open-ids distinction proven (explicit close of a default-open section) |
| `chat-list-filter-store.ct.tsx` | 44 | CLEAN |
| `chrome-registry-context.ct.tsx` | 13 | CLEAN |
| `chrome-registry-provider.ct.tsx` | 14 | CLEAN |
| `composer-draft-store.ct.tsx` | 122 | CLEAN. Reload-persistence proven through a REAL write-then-reload round trip (not a hand-seeded blob, which would only prove the read half); cap-evicts-oldest; corrupt-blob heal |
| `composer-focus-store.ct.tsx` | 27 | CLEAN |
| `config-focus-store.ct.tsx` | 35 | CLEAN |
| `config-group-open-store.ct.tsx` | 53 | CLEAN. Idempotent open/close twins |
| `config-nav-store.ct.tsx` | 114 | CLEAN. #926 one-write-carries-section-and-visible-rows, membership-vs-identity comparison (a fresh array with the same members must not re-publish) |
| `config-row-annotation.ct.tsx` | 30 | CLEAN. Nested-null-re-publish isolation |
| `config-search-store.ct.tsx` | 37 | CLEAN |
| `config-section-registry-context.ct.tsx` | 26 | CLEAN |
| `config-selection-store.ct.tsx` | 56 | CLEAN |
| `corpus-compare-store.ct.tsx` | 52 | CLEAN. #563 name-travels-with-id proof |
| `corpus-search-store.ct.tsx` | 30 | CLEAN |
| `corpus-selection-store.ct.tsx` | 21 | CLEAN |
| `databank-filter-store.ct.tsx` | 26 | CLEAN |
| `deployment-boot-hint.ct.tsx` | 73 | CLEAN. Corrupt-type-coercion heal (`"true"` string must not read as boolean) |
| `game-mode-transition.ct.tsx` | 45 | CLEAN. One-live-region-replaces-not-queues proof |
| `list-flip-carry.ct.tsx` | 67 | CLEAN — the file's header explicitly states an un-failable claim it deliberately does NOT make (call order), with a measured planted-control receipt for why |
| `modal-registry-context.ct.tsx` | 16 | CLEAN |
| `modal-registry-provider.ct.tsx` | 16 | CLEAN |
| `notice-band-store.ct.tsx` | 67 | CLEAN — a live-DOM-node publish/release seam (sibling, not ancestor/descendant, topology) correctly reasoned as CT-only; crash-swap fallback-to-fixed-overlay proof |
| `preset-editor-view-store.ct.tsx` | 28 | CLEAN |
| `preset-search-store.ct.tsx` | 26 | CLEAN |
| `preset-selection-store.ct.tsx` | 70 | CLEAN |
| `refinery-landing-focus-store.ct.tsx` | 25 | CLEAN |
| `section-list-projection.ct.tsx` | 67 | CLEAN. Mobile list-is-the-screen-is-docked projection agreement with the shell |
| `section-registry-context.ct.tsx` | 14 | CLEAN |
| `section-registry-provider.ct.tsx` | 14 | CLEAN |
| `section-registry.ct.tsx` | 21 | CLEAN. TOTALITY proof over the real registry — every section's `useSelectionTitle` resolver runs and none throws on a cold cache |
| `settings-save-status-store.ct.tsx` | 44 | CLEAN. Precedence fold (error > blocked > saving > saved) with a stated reason for the blocked-beats-saving ordering |
| `shell-store.ct.tsx` | 368 | CLEAN — the corpus's most comprehensive store CT. Per-section override memory, focus-mode-writes-no-panel-override (a real prior regression), retired-section heal proven via `addInitScript` + `page.reload()` (module-init rehydration, seeding after mount would prove nothing) |
| `status-announcement-store.ct.tsx` | 27 | CLEAN. Born-empty live region (text-already-present is not reliably announced) |
| `tag-library-store.ct.tsx` | 23 | CLEAN |
| `world-entry-selection-store.ct.tsx` | 25 | CLEAN |

**Taxonomy sweep, chunk 5 (42 files):** 0 literal `reports/` writes · 0 `as unknown as` casts · 0
skip/fixme · 0 assertion-free tests · 0 bare unwindowed `trpc.count()` races (this directory has none —
stores are driven by module actions, not the network, so the deterministic-race gate class does not
apply here; the DATA-layer files in chunks 1-3 carry that class and were checked there).

## Population receipts

`git ls-files` counts, taken at scope time and re-verified per directory before reading:

- `tests/client/data/**` (incl. `data/bus/`): 25 total `.ct.tsx` — 1 already read (leg 1: `use-open-refinery`), 4 excluded (sibling lanes: `use-orb-socket`, `use-user-bus`, `use-invalidation`, `create-entity-mutation`) → **18 read**.
- `tests/client/lib/**`: 8 total — 3 excluded (`long-task-tracer`, `motion-flaggers`, `motion-stats`) → **5 read**.
- `tests/client/state/**`: 42 total, 0 excluded, 0 already read → **42 read**.
- `tests/client/a11y/**`: 1 total (`accessible-name-quality.suite.ct.tsx`) — already read (leg 2) → **0 read**.
- `tests/client/agent-nav/**`: 1 `.ct.tsx` (`panel-request.ct.tsx`; `_ct-stories.tsx` and `index.test.ts` are not `.ct.tsx`) → **1 read**.
- `tests/client/agent-rpg/**`, `tests/client/agent-seed/**`, `tests/client/compose/**`: 0 `.ct.tsx` files in any of the three → **0 read** (nothing to read; not a gap).
- `tests/client/forms/**` (incl. `bound-fields/`): 9 total — 1 already read (leg 2: `form-identity.suite`) → **8 read**.
- `tests/client/features/app-shell/**` (components + hooks + surfaces): 17 total `.ct.tsx` — 3 already
  read by prior legs (leg 1: `app-shell.ct.tsx`; leg 2: `context-tabs-panel`, `appearance-background-section`
  — the latter is ALSO the brief's named sibling-exclusion file, so it is not double-subtracted) → **14
  read** (17 − 3 = 14, matching the chunk-4 per-file table: 13 components + 1 hook).
- `tests/client/features/settings/**`: 3 `.ct.tsx` total — 1 already read (leg 2: `appearance-looks-section`) → **2 read**.
- `tests/client/features/connections/**`: directory does not exist on this tree (`git ls-files` zero hits) — see the Scope note above.
- `tests/client/features/databank/**`: 5 total — 1 already read (leg 2: `databank-detail-surface`) → **4 read**.
- `tests/client/features/plugin/**`: 13 total — 3 already read (leg 1: `plugins-install-section`; leg 2: `plugin-surface-renderer`; leg 3: `tool-card`), 1 excluded (`plugin-scripted-surface`) → **9 read**.
- `tests/client/features/home/**`: 5 total — 1 already read (leg 3: `home-surface`) → **4 read**.

**Total this shard: 107 files full-read, 0 sampled, 0 partially read.** No file in the population exceeded
the Read tool's ~2000-line single-call limit (largest: `shell-store.ct.tsx` at 368 lines), so no file
required a second offset read.

## Findings summary

**One finding, P4, no defect:** G1 (`use-carried-appearance.ct.tsx`) — a drifted header comment describing
3 pins from a pre-R1 design, 2 of which describe now-deleted behavior and 1 of which (a failed-read-degrades
arm) is a genuine, still-live, untested coverage gap. Fix shape given in the finding.

**Everything else in this 107-file shard is CLEAN.** No stale premise, no luck-based coverage, no
decorative pins, no unmarked `as unknown as`/`as any as` double-casts, no oneshot live-read asserts outside
a settled/barriered read, no literal `reports/` writes, no accname substring traps, no stand-in children, no
tabs/panels accumulating across visits, no shared-render-tree reads, and — the area-specific watch item
this shard's brief named — no bare racy `trpc.count()` zero-read used as the SOLE evidence for a negative
claim: every deterministic-race read in the data/plugin/settings/databank/app-shell/forms files uses either
the house inverted `expect.poll(...).toBeGreaterThan(before)` idiom, a settled rendered barrier taken before
the read, a throwing-responder trap, or an explicit stated reason for why polling would be wrong (a
rejected-promise-then-read ordering, or a monotonic-count-only-climbs argument).

The register across all 107 files is consistently the campaign's established one: red-first defect proofs,
honestly labelled FENCE vs anchor vs defect-proof, positive controls beside every absence claim, computed/
composited-pixel reads instead of literals for anything token-derived, and files that state — in their own
header comments — exactly why they must be a CT rather than a unit test.

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 4, shard L4 (cb-ct-audit-L4): 107 files full-read, zero sampled.** Scope:
> `tests/client/{data,lib,state,forms,a11y,agent-nav,agent-rpg,agent-seed,compose}/**` +
> `tests/client/features/{app-shell,settings,connections,databank,plugin,home}/**`, minus legs 1-3's
> already-read files and the sibling-lane exclusion set. `tests/client/features/connections/` does not
> exist on this tree (spec/naming mismatch flagged, not guessed into scope). **Verdict: 106 of 107 files
> CLEAN with zero findings; one P4 (`use-carried-appearance.ct.tsx`'s header describes 3 pins from a
> pre-R1 design — 2 describe deleted draft-mode behavior, 1 is a genuine untested error-degrade arm on the
> still-live single-arm hook).** No literal `reports/` writes, no unmarked fabrication casts, no
> skip/fixme, no assertion-free tests, no racy bare `trpc.count()` used as sole negative evidence (the
> area note's watch item) — every deterministic-race read in this shard uses the house inverted-poll idiom
> or an explicit reasoned exemption. `state/` (42 files, the largest single directory in the corpus) holds
> the reactive-hook-store-needs-a-real-render discipline without exception. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-L4-client-core.md`.
