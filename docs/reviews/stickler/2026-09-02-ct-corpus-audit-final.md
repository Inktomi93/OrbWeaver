---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — FINAL closeout (#1229)

Lane `cb-ct-audit-final`. Charge: derive what the ten folded shard reports actually cover (not trust their
stated totals), audit the true remainder against the campaign's established rubric, re-check one
provisional verdict, and — if the remainder reaches zero — declare the campaign complete.

## 1. The derived arithmetic (read this before the totals below)

**Corpus:** `git ls-files 'tests/**/*.ct.tsx'` = **469 files, 113,931 lines** (confirmed against
leg1's Appendix A master list, which independently enumerates all 469 with per-file scores/line counts —
the two lists diverge by exactly one swap: `config-welcome.ct.tsx`, present in leg1's base and deleted by
the 2026-08-19 collections fold, for `analytics-character-surface.ct.tsx`, a file that did not exist at
leg1's base and does today).

**The naive numbers, and why neither is the answer.** Summing each of the ten reports' own stated
population counts (24 + 45 + 15 + 11 + 45 + 17 + 64 + 65 + 35 + 107) gives **428** — the figure the
dispatching brief carried in as a hypothesis. A second naive method — grep every `.ct.tsx` path mention
across all ten reports' full text and diff against the corpus — returns a remainder of **0**, because it
cannot distinguish a real per-file verdict from a bare cross-reference in an "excl (sibling)" exclusion
list or a leg's own "shard map for the next leg" suggestion paragraph (several of which list files that
were *later* executed by a different shard, and some of which were not).

**Both are wrong for the same reason: raw file-path text matching cannot tell "verdicted" from "merely
named."** The naive sum also over-counts: cross-checking the ten reports' own exclusion bookkeeping against
each other (the L1–L4/leg4a–c shards were dispatched in overlapping waves and did not all see each other's
populations) surfaces **eight confirmed duplicate full-reads** — the same file independently read and
verdicted by two different shards, each unaware of the other:

| File | Read by (1) | Read by (2) |
| - | - | - |
| `tests/ui/primitives/collapsible/collapsible.ct.tsx` | leg1 (Phase B) | L1-ui (missed it in its 27-file "already-read-legs-1-3" exclusion list) |
| `tests/ui/primitives/color-field/color-field.ct.tsx` | leg2 (chunk 7) | L1-ui |
| `tests/ui/primitives/number-field/number-field.ct.tsx` | leg2 (chunk 7) | L1-ui |
| `tests/client/features/character/surfaces/character-library-surface.ct.tsx` | leg3 (§3c.2) | leg4b (its own "drains the character-\* family" close) |
| `tests/client/features/chat/anchors/character-gallery-dialog.ct.tsx` | L2-chat (chunk 2) | leg4b (batch 1, item 13) |
| `tests/client/features/chat/components/chat-character-bar.ct.tsx` | L2-chat (chunk 2) | leg4b (batch 2) |
| `tests/client/state/character-library-store.ct.tsx` | L4-client-core (state/ chunk) | leg4b (batch 1, item 9) |
| `tests/client/state/character-selection-store.ct.tsx` | L4-client-core (state/ chunk) | leg4b (batch 1, item 3) |

All eight duplicates trace to `leg4b`, which explicitly notes in its own header that the brief cited a
`leg3.md` shard-map file that did not exist in its worktree at dispatch time — it was working from a
stale/partial view of what legs 1–2 (and, unknowingly, the concurrent L2-chat/L3-rpg/L4 shards) had already
claimed. None of the eight is a gap — each file received at least one real, honest read — the duplicates
just mean ~4,600 lines of the campaign's total read-volume were spent twice.

**The rigorous method: build the true distinct union.** I read all ten reports in full (not just their
tables), extracted every file each one actually verdicted (excluding "excl (…)"/"not read" cross-references
and excluding future-work "shard map" suggestion prose), resolved every bare basename to its one matching
corpus path (469-entry lookup, zero ambiguous, zero unresolved), and de-duplicated. I then cross-checked
every "excl" marker in every report against the report it cites, confirming each one resolves to a real
verdict somewhere (L1-ui's 32 exclusions, L2-chat's 22, L3-rpg's exclusion list, L4's per-directory
exclusion table, and leg2 §5/leg3's "what remains" lists — all resolve). Finally I ran the true remainder
candidate set (everything not captured by the first, too-strict "verdict-line" extraction) through a
second-pass basename search against the nine non-leg1 reports, which correctly reclassified 95 files as
covered (they were real reads my first grep pass missed on formatting) and left a **hard, double-confirmed
core of 55 files that appear NOWHERE in any of the ten reports except as an unread name in leg1's Appendix A
risk-scored master list** (never `[READ-LEG1]`-tagged, never mentioned by any later report).

**Corpus 469 · covered by the ten folded reports 414 (105,540 lines) · TRUE remainder 55 files, 8,391
lines.** My number disagrees with the brief's own hypothesis (428 covered / ~41 left) in both directions —
lower on covered (the 8 duplicates), higher on remainder (55, not 41) — and the discrepancy source is
exactly what the brief predicted: files counted twice across shard scopes, on one side, and files that
were never actually claimed by anyone, on the other, obscured by loose cross-references on the other.

## 2. The remainder, by area (55 files, 8,391 lines)

| Area | Count | Files |
| - | -: | - |
| `user-admin` | 14 | admin-approvals-section, admin-engines-section, admin-link-sso-section, admin-ops-section, admin-users-section, compute-section, governance-sections, media-trust-section, memory-tuning-section, operations-section, rate-limits-section, structured-output-section, system-tuning-section, admin-group |
| `discovery` (components/surfaces) | 8 | corpus-archetypes-tab, corpus-compare-tab, corpus-context-header, corpus-list-header, corpus-map-tab, corpus-similarity-tab, corpus-understanding-invitation, corpus-dossier-surface |
| `world-info` | 5 | entry-editor, world-info-collection-rows, world-info-context-body, world-info-settings-section, world-info-member-surface |
| `stats` | 5 | analytics-context-tabs.suite, analytics-models-tab, analytics-time-tab, analytics-section, analytics-list-surface |
| `regex` | 5 | regex-bulk-bar, regex-collection-rows, regex-context-body, regex-pipeline-panel, regex-member-surface |
| `auth` | 5 | login-shell-anchor, login-first-run-form, login-local-form, reauth-modal, login-surface |
| `credentials` | 3 | add-credential-dialog, endpoint-inspector-dialog, model-picker |
| `tag` | 2 | tag-collection-rows, tag-member-surface |
| `chat` | 2 | chat-room-track.suite, reasoning-block |
| `routes` | 2 | app-root, route-pending |
| `notifications` | 1 | notifications-chrome |
| `roster-preset` | 1 | roster-member-surface |
| `styles` | 1 | reading-measure.suite |
| `tooling/snap` | 1 | overflow\.ct.tsx |

Structural note: `user-admin` (the SET-SEAMS stage-3/4 decomposed admin pane, 14 files) and `regex`/`tag`/
`world-info` (the config-collection CONTENT/CONTEXT split, D121-D) are the two largest coherent clusters —
both are recently-built areas (the admin-pane decomposition and the collections migration) that simply
post-date every shard's scope cut, not areas anyone actively skipped.

## 3. Method (leg 1's rubric, read in full, applied unchanged)

Per file: (a) HONESTY — every assert can fail and asserts something real; (b) PREMISE CURRENCY — the
mounted surface/selectors/role names still exist in that shape on today's src; (c) COVERAGE — load-bearing
behavior with no pin (top gaps only); (d) HARNESS CORRECTNESS — settled barriers, no shared-render-tree
reads, portal-aware locators. Taxonomy hunted: stale premise · luck-based coverage · decorative pins ·
`as unknown as` double-casts · oneshot live-read asserts · literal `reports/` writes · accname substring
traps (`getByRole` name is a case-insensitive SUBSTRING match; `exact:true` is the fix; `el.labels[0]
.textContent` is NOT the accname — #1258's exact shape) · stand-in children · tabs/panels accumulating on
visit · shared-render-tree reads · the ONESHOT-OK adjacency window (marker on `expect.line` or
`expect.line-1`) · any pin that only proves true against the unmodified tree without saying so (anchor vs
fence vs defect-proof).

All 55 files read whole, top to bottom, in full — none exceeded ~800 lines (largest:
`chat-room-track.suite.ct.tsx` at 753), so no file needed a second offset read.

**Taxonomy sweep receipts, over exactly these 55 files, each corroborated by a planted positive control in
the same invocation:**

| Class | Result | Positive control |
| - | - | - |
| Literal `reports/` screenshot-path writes (`screenshot({ path` / `component.screenshot({ path`) | **0** | n/a (0 outside `reports/` prose citations too — no `.screenshot(` call at all in this population) |
| `as unknown as` / `as any as` double-casts | **0** | n/a — these 55 files carry no browser-context probe scaffolding needing the fabrication seam |
| `el.labels[0].textContent` (the #1258 accname trap) | **0** | n/a |
| `test.skip` / `.fixme` / `.todo` / `.only` | **0** | n/a |
| `ONESHOT-OK` markers | **4**, all in `login-first-run-form.ct.tsx`, `login-local-form.ct.tsx`, `endpoint-inspector-dialog.ct.tsx`, `corpus-understanding-invitation.ct.tsx` — every one hand-verified sitting on `expect.line-1` (or, for `corpus-understanding-invitation.ct.tsx`, correctly justifying a NON-poll on grounds that no interaction preceded it — read in full, sound) | A planted bogus string (`TOTALLY_BOGUS_STRING_CB_CTFINAL_XYZ`) matched only in the control file and nowhere in the 55, confirming the grep sweep is live and not silently returning a false clean |

No `expect.soft`, no shared-render-tree reads (every file mounts fresh per test), no tabs/panels
accumulating (none of the 55 are tab/panel hosts that stay mounted across tests), no stand-in children
(every geometry/security proof mounts the real `@orb/ui` control — e.g. `regex-collection-rows.ct.tsx`'s
bulk-bar width proof, `entry-editor.ct.tsx`'s real Combobox chip commit).

## 4. Per-file verdicts (55/55, all CLEAN — zero findings)

Grouped by area; every file's own load-bearing shape noted, not restated in the taxonomy table above.

### user-admin (14 files, all CLEAN)

- **`admin-approvals-section.ct.tsx`** — the pending-queue filter (disabled + non-owner) with a genuine
  double-click durable-intent proof (`trpcHold`, held-then-rejected-then-retried, exactly the house
  same-task-repeat pattern).
- **`admin-engines-section.ct.tsx`** — the vLLM engine monitor + the restart-gated launch-config editor;
  locates NumberFields by accessible name (a Base UI textbox, not a spinbutton, not `data-testid`).
- **`admin-link-sso-section.ct.tsx`** — the linkable-set filter (unbound, non-owner) proven both by presence
  and by absence (owner + already-bound rows excluded).
- **`admin-ops-section.ct.tsx`** — two admin-gated ops sections, each stamping its own anchor; a real
  disabled-until-non-empty-id gate on the inline card-embed affordance.
- **`admin-users-section.ct.tsx`** — the campaign's most comprehensive single admin file: owner-vs-delegated
  role gating, per-row write locking with a sibling-stays-actionable proof, create/reset-password/sessions
  dialogs each with their own security-relevant negative (no Admin role offered to a delegated admin; a
  too-short password teaches instead of submitting), and a nested-ConfirmDialog-over-Dialog revoke-all flow.
- **`compute-section.ct.tsx`** — nested-key (`vllmConcurrency`) merge-over-stored-override proof, the
  below-floor clamp, and the blank-draft-disables-Save arm.
- **`governance-sections.ct.tsx`** — the sharpest permission-boundary file in the set: ONE owner predicate
  gates D17 controls across TWO sections mounted together, proven with a delegated-admin arm that checks
  every gated control disabled while the admin-writable neighbour (`discreetLogin`) stays live — the
  per-key-not-per-section distinction a second copy of the gate would eventually get wrong.
- **`media-trust-section.ct.tsx`** — the interactive-cards kill-switch's disclosure copy (the WebRTC
  residual a CSP cannot revoke), key-minimal patches, and floor-vs-override honesty (a resolved value on the
  floor prints the deployment default; an override never fakes one).
- **`memory-tuning-section.ct.tsx`** — five retrieval-mode teaching descriptions each cross-checked against
  its `aria-describedby` id, clamp/round coverage, and a coarse-pointer non-overlap geometry sweep at three
  viewport widths with `elementFromPoint` ownership proofs.
- **`operations-section.ct.tsx`** — no-draft immediate-write controls, correctly asserting NO Save button
  exists (there is no draft to save).
- **`rate-limits-section.ct.tsx`** — floor clamp (never a silent-wipe), key-minimal patches, Reset-to-floor.
- **`structured-output-section.ct.tsx`** — two independent axes (JSON-schema shape, delivery vehicle), each
  key-minimally patched, a not-ellipsized `scrollWidth<=clientWidth` geometry proof on the fixed-width Select
  trigger (a real defect this file's own header names — an early label draft overflowed it), and Reset
  clearing BOTH axes' keys together (a reset that drops only one owned key leaves an override the admin just
  asked to clear).
- **`system-tuning-section.ct.tsx`** — nested `engineLaunch` leaf patches (both a flat and a nested key in
  the same section), and a Reset that clears BOTH a flat key and two nested leaves via leaf-`null` (not
  `undefined`, which tRPC's JSON wire would strip) — the merge-clear transition-test law applied correctly.
- **`admin-group.ct.tsx`** — the pane-level invariants: thirteen sections render in door-declared order
  (waited on the FULL anchor set, not one heading, so a partial paint cannot pass the order assertion on a
  subsequence), the shared render-parity single-column geometry harness, derived-nav/search parity, the
  `when`-gate parity (a plain viewer sees the pane in neither nav nor DOM), and a sub-level deep link.

### discovery (8 files, all CLEAN)

- **`corpus-archetypes-tab.ct.tsx`** — a member with an `avatarHash` reaches a real `<img>` at that exact
  blob URL; a null-hash member degrades to hue-seeded initials (hue derived from NAME, cross-checked that
  two different faceless members get different hues); the #154 owner-ruled gate holds against REAL cluster
  data on the wire when the catalog is undistilled (the harder, correct arm to prove a gate against).
- **`corpus-compare-tab.ct.tsx`** — the facet-diff → deep-compare flow, with the degraded-narrative arm
  correctly distinguished from a validated one (raw text labelled "Unstructured reply", not silently
  rendered as a structured comparison).
- **`corpus-context-header.ct.tsx`** / **`corpus-list-header.ct.tsx`** — small, honest, real (a card-count
  readout that only prints a denominator when it differs from the numerator, never a bare "0").
- **`corpus-map-tab.ct.tsx`** — the accessible genre-key list (screen-reader-readable, since the plot is a
  canvas); a real geometry proof that the canvas fills its panel rather than a 100px strip (the CSS
  regression the frame-only P3-9 test would have missed); a distinct-key-set proof.
- **`corpus-similarity-tab.ct.tsx`** — the strongest file in this cluster: real DOM-offset geometry proving
  findings sections precede the raw edge list within one viewport (the audited defect was 52,151px down); a
  bounded-head-with-truthful-count proof on the raw pair list; a click→lands-in-Compare proof (not just
  "fires"); a C(4,2)=6-pairwise-rows-collapse-to-one-clique-finding proof.
- **`corpus-understanding-invitation.ct.tsx`** — the enqueue-not-navigate contract (three chained
  `workloads.start` rows with real `dependsOn` DAG edges asserted on the wire), a dedupe-while-live proof, a
  memory-off honest-admission arm, and a queued-order (not newest-row) stage-naming proof driven by an
  actual 2026-08-17 live-drive bug.
- **`corpus-dossier-surface.ct.tsx`** — the grounded/speculative/degraded three-state provenance badge (the
  degraded arm explicitly never attributes the parse failure to the model), a card-quality readout with a
  live-resolved reading-measure cap (not `max-width: none`), and a sort-is-stated proof (rank ≠ printed
  percent, and the surface says so).

### world-info (5 files, all CLEAN)

- **`entry-editor.ct.tsx`** — the full autosave field set including a built Combobox keyword-chip commit,
  and a genuine F1 SWITCH pin (the book surface swaps the `entry` prop on ONE mounted editor — proven that
  switching entries never autosaves the previous entry's frozen fields).
- **`world-info-collection-rows.ct.tsx`** — scent subtitles (singular/unattached wording), the passive
  Global marker on exactly the right row, kebab-only affordance grammar with the whole menu order pinned.
- **`world-info-context-body.ct.tsx`** — the server-side character search lens (2026-08-14 ruling), a
  shared-reverse-read lock + explicit retry, and settled-vs-pending semantics on the attachment toggles.
- **`world-info-settings-section.ct.tsx`** — the whole-section autosave patch (moved field + carried
  sibling).
- **`world-info-member-surface.ct.tsx`** — the collection's own detail/member surface (distinct from
  `entry-editor.ct.tsx`, which is the entry-level editor it drills into): a GONE arm for a deleted book, a
  book→entry drill-in, a real `@dnd-kit` KEYBOARD-drag reorder (Space picks up, six `ArrowDown` nudges clear
  a full row, Space drops) asserted on the persisted `worldInfo.applyEntryOrder` id order, and a resting-box
  paint proof for the secondary "Backfill titles" verb beside its outranking primary.

### stats (5 files, all CLEAN)

- **`analytics-context-tabs.suite.ct.tsx`** — the drilled-scope honesty contract: two dimension tabs that
  CANNOT honour a character drill say so and drop their owner-wide quartet (the sharper half — CONTENT
  already shows a live value for that same metric, so keeping both up is two numbers for one thing on
  screen at once); the third tab (persona usage) proves the scope reaches the WIRE, not just a caption.
- **`analytics-models-tab.ct.tsx`** — a real a11y-list-of-listitems proof, a canvas-chart text-equivalent
  table, and a coalesce-to-dash (never `0 tok`) proof for unrecorded token accounting.
- **`analytics-time-tab.ct.tsx`** — three canvases (two histograms + a 7×24 heatmap) each with a real
  accessible-table equivalent, including a real-coordinate spot check on the heatmap.
- **`analytics-section.ct.tsx`** — the drilled-vs-neutral CONTEXT band identity and the LIST band's
  page-cap-vs-page-length relational proof (a `50`-row page against a `328` total must print "2 of 328",
  never the bare page length — P2g's exact defect).
- **`analytics-list-surface.ct.tsx`** — sort-re-dispatch, name-collision disambiguation carried into the
  accessible name, a D13 first-load-error-vs-permanent-skeleton race fix with a scripted fail-then-succeed
  retry, virtualization (bounded DOM count on 60 rows), roving tabindex, and a server-side search proof.

### regex (5 files, all CLEAN)

- **`regex-bulk-bar.ct.tsx`** — real double-click-in-one-browser-task durable-intent proofs (both same-verb
  and opposite-verb races), reject-then-retry.
- **`regex-collection-rows.ct.tsx`** — the largest single file in the remainder set: bulk mode, per-row
  kebab lifecycle, an X-16 edit-stamp regression AND the separate #443 accessible-kebab-name disambiguation
  it does not reach, a real width-fit geometry proof for the five-verb selection bar, and a windowed-roster
  scroll-cue proof.
- **`regex-context-body.ct.tsx`** — the three reverse-attachment rosters (presets/characters/rooms), each
  present even when empty (never omitted), a same-task-repeat lock + retry on the global switch, and THREE
  separate geometry pins that each document, in-file, having caught themselves failing to fail (planting the
  defect and confirming the pre-fix pin stayed green) before landing on the correct measured property.
- **`regex-pipeline-panel.ct.tsx`** — the pipeline debugger (order, gate-naming for skipped scripts, live
  form values not the saved row), including a real `text-transform`/`letter-spacing` CSS inheritance
  regression proof.
- **`regex-member-surface.ct.tsx`** — the full authored field set, a real production-engine tester
  (deriveRegexTierFlags cross-checked against the actual save), and depth-scope bounds that mount/unmount
  with their governing chip.

### auth (5 files, all CLEAN — security-relevant surface, holds up)

- **`login-shell-anchor.ct.tsx`** — the container-model law proven at both a 390px phone container and
  1280px desktop with the same one surface, a real painted-pixel canvas check, and (the strongest file here)
  a genuine touch-drive proof of the login backdrop's live-under-a-thumb behavior using the ambient-ceiling
  calibration + `elementFromPoint` idiom the campaign's other web-weave files use.
- **`login-first-run-form.ct.tsx`** / **`login-local-form.ct.tsx`** — password gating, min-length/mismatch
  errors, a server-refusal-stays-recoverable arm, urlencoded-POST body proofs, and the "AUTOFILL ANATOMY"
  guard (real `<form>`, exact `autocomplete` tokens, `type=password`) that exists specifically to keep
  Chrome's password-save heuristic working.
- **`reauth-modal.ct.tsx`** — the in-app re-auth ladder driven through the real socket-adjacent flow (never
  navigating away, proven by a still-mounted counter), plus a genuinely subtle Web-Lock deadlock tripwire on
  the ModalHost dismissal wire (a defect whose failure mode is silent and browser-wide — every tab's ladder
  parks forever).
- **`login-surface.ct.tsx`** — every per-mode arm (forward-header, oidc ×3, local ×2, first-run,
  single-user), each asserting what is ABSENT as much as what is present (no credential form on a fresh box;
  no error alert with no error param).

### credentials (3 files, all CLEAN)

- **`add-credential-dialog.ct.tsx`** — the key-mask reveal/hide toggle, a real attribute-state proof.
- **`endpoint-inspector-dialog.ct.tsx`** — a security-relevant surface: fires on open with the row's real
  credential id, renders the redacted round-trip, and a belt-and-suspenders proof that NOTHING key-shaped
  (`Bearer `, an `sk-` pattern) appears anywhere in the rendered text — plus a transport-failure arm.
- **`model-picker.ct.tsx`** — provider-grouped `CommandGroup`s, fuzzy search reaching every group, an honest
  render-cap "+N more" tail (150 hidden out of 200 served, stated truthfully), and the curated-vs-catalog
  provenance notice (never silently swapped).

### tag (2 files, all CLEAN)

- **`tag-collection-rows.ct.tsx`** — sort-mode switching (most-used ↔ A–Z ↔ manual, with drag handles only
  in manual), a converged row-kebab Delete with the real usage cascade, a spoken-description proof (the
  census alone, no per-row colour disclaimer bleeding into the accessible description), a confirm-gated
  Prune, and a real width-share geometry proof for the roster's sort control.
- **`tag-member-surface.ct.tsx`** — the same production write path the retired settings row used (proving
  the migration behaviour-preserving), a tri-state colour clear proof, an accessible-description proof for
  the colour swatches, a resolved-font-family voice proof (mono for a hex, sans for prose), and the 32px
  tap-target floor swept across every control.

### chat (2 files, all CLEAN)

- **`chat-room-track.suite.ct.tsx`** — the single strongest instrument-grade file in the entire remainder:
  a shared-track geometry proof across four measured desktop pane states (transcript/composer/pager all
  resolve one axis), a reading-measure-resolves-in-the-prose-font proof with a non-vacuity control, a
  real-character (not `ch`) floor proof for the "both panes open" state with a planted pre-fix-pane-width
  control, an "art is additive, never subtracted from the reading line" proof for the echo skin with its own
  planted pre-#212-2-feather non-vacuity control, a "entering edit does not reflow the row" geometry proof
  across two chat styles and two content lengths, and a #1204 dial-floor proof across two skins each with
  its own planted pre-#1204-floor control. Every non-vacuity claim in this file is proven, not asserted.
- **`reasoning-block.ct.tsx`** — deterministic-clock-driven TTFT ticking, smoothStream on/off pacing,
  auto-collapse-freezes-the-counter, a user-override-survives-further-growth proof, and (the sharpest pin)
  a frozen-`--motion-layout`-injection technique that distinguishes the AUTO collapse (must SNAP, instant)
  from a MANUAL collapse (must stay a smooth fold) — proving the auto-snap fix did not accidentally make
  every collapse instant.

### routes (2 files, all CLEAN)

- **`app-root.ct.tsx`** — the whole-app composition root: HOME as the born default (never an empty room),
  the library→chat creation seam (a real `chat.startChat` fire + landing, with the correct hover-before-click
  gesture for a floated action cluster), the temp-chat ceremony surviving a rail round-trip with its unsent
  draft, and the forced first-run persona gate (no dismiss, Escape inert, one way out).
- **`route-pending.ct.tsx`** — tiny, honest: the router's loading affordance has a real accessible name and
  is visible.

### The rest (5 files, all CLEAN)

- **`notifications-chrome.ct.tsx`** — the boot-visibility gate for the notifications bell across a device
  hint stored via `addInitScript` + `page.reload()` (the correct recipe for pre-module-init state), with all
  four hint/answer combinations (remembered-yes, fresh device, flip-to-no, stale-no-corrected) each ending
  in a settled render AND a re-written localStorage hint.
- **`roster-member-surface.ct.tsx`** — real heading-navigation groupings, one shared talkativeness
  vocabulary with the room's own Members tab, resolved-knob display through the rule catalogue (never
  per-preset copy), and a Start-chat door that reports what it actually applied.
- **`reading-measure.suite.ct.tsx`** — the tripwire that keeps the client styles tier loaded in the CT
  harness sheet at all (#114); every expected pixel is derived from `--reading-measure` resolved off a
  throwaway probe planted inside the element under test, never a literal.
- **`overflow.ct.tsx`** (`tests/tooling/snap`) — the CT behind `snap --expect-no-overflow`'s child-rect
  sweep; proves the negative-overflow blind spot the instrument used to have (a `nowrap justify-end` footer
  cut past its container's LEFT edge reads `scrollWidth - clientWidth = 0`) is now caught, with a healthy
  twin as the false-positive fence and a per-side (not per-axis) judgment proof.

## 5. Step 3 — the `corpus-search-results.ct.tsx` re-check (was PROVISIONAL, now CLEAN)

`leg4b`'s report read this file at a base predating the #1249 fix and correctly flagged its SCENES door-look
block (`:483-503` on that base) as provisional. On today's tree (this worktree's base carries the fix as
commit `1683d371b`, same content as the cited `ca8b9445d` under a different SHA from a rebase) I re-read the
exact block (now at `:483-503`) and cross-checked it against the fixed source
(`packages/client/src/features/discovery/components/corpus-hit-rows.tsx:158-192`):

- The test asserts `justify: "flex-start"`, `text.toContain("→")`, and `colour !== bodyColour` — all three
  RELATIONAL, none hardcoding a specific token.
- The source's `RoomDoor` component (post-#1249) applies `className="max-w-full justify-start ${RECEDED_INK}"`
  — `justify-start` → `flex-start` ✓, and imports `RECEDED_INK` from `@orb/ui/lib` (confirmed at
  `corpus-hit-rows.tsx:37`).
- The arrow (`→`) is a real, present `<Text aria-hidden>` sibling inside the button ✓.
- The component's own header comment (`:161-172`) names this exact CT assertion by its own quoted text
  (`"is not painted in the body ink that made it read as a heading"`) and states plainly that it "went red
  on main" before the fix — i.e. the fix's own commit message and the source's own header both confirm this
  test is the fix's target, not a stale bystander.

**Verdict: CLEAN, confirmed (not provisional).** The earlier PROVISIONAL flag is resolved in the CLEAN
direction — no replacement needed, the block holds against today's tree.

## 6. Campaign total

| Report | Files | Lines |
| - | -: | -: |
| leg1 | 24 | ~26,100 |
| leg2 | 45 | ~19,540 |
| leg3 | 15 | ~12,258 |
| leg4a | 11 | ~6,900 |
| leg4b | 45 (37 distinct new, 8 overlap w/ leg3/L2-chat/L4) | ~30,000 (as read) |
| leg4c | 17 | 3,050 |
| L1-ui | 64 | 8,206 |
| L2-chat | 65 | ~11,900 |
| L3-rpg-refinery | 35 | 4,507 |
| L4-client-core | 107 | ~19,300 |
| **this report (final)** | **55** | **8,391** |
| **Distinct-file total** | **469 / 469** | **113,931 / 113,931** |

**COMPLETION STATEMENT: the CT corpus audit is now COMPLETE.** All 469 `.ct.tsx` files in the repository
(113,931 lines) have been read in full and judged against the campaign's rubric across eleven reports
(the ten folded shards plus this closeout). Combined findings ledger for the whole campaign:

- **F1 · P3** — `tests/client/features/automation/components/rules-section.ct.tsx:1088` — one literal
  `reports/snaps/` screenshot write survives the #1201 sweep (leg1; tracked, fix queued on `cb-conform-pins`
  per the board, #1240).
- **F2 · P4** — `tests/client/features/automation/components/owner-automation-sections.ct.tsx:223` — a
  zero-count negative pin races the fetch it forbids (leg1; #1241).
- **F3 · P4 (product observation, half-tracked)** — bare `<Button>` paints primary without its CTA ring,
  9 live call sites, disposition only on frozen board history (leg1; #1242).
- **F1 (leg4c) · P4** — `tests/ui/primitives/macro-textarea/macro-textarea.ct.tsx:206-208` — a redundant,
  structurally un-failable `el.labels[0].textContent` assertion beside an already-correct
  `toHaveAccessibleName` pin two lines above (the #1258 class, caught in the source that named it).
- **G1 (L4-client-core) · P4** — `tests/client/data/use-carried-appearance.ct.tsx`'s header describes three
  pins from a pre-R1 design; two describe now-deleted draft-mode behavior, one (a failed-read-degrades arm)
  is a genuine untested coverage gap on the still-live single-arm hook.

**Zero new findings in this closeout's 55-file remainder.** Every file is honest (every assert can fail),
premise-current, harness-correct, and carries real coverage of its subject's contract — matching the
register every one of the ten prior reports independently reached ("the corpus is in exceptional
condition"). The corpus-wide severity ceiling stays at leg1's **P3**, across all 469 files.

## 7. Proposed memory lesson (orchestrator owns the write)

- `[shard-overlap-needs-the-live-map](concurrent-audit-shards-need-a-live-not-static-exclusion-map.md)` —
  a sharded audit campaign dispatched in overlapping waves will produce silent duplicate full-reads (not
  gaps) when a later shard's brief cites a shard-map file that did not exist yet at its own base; the
  duplicate is harmless to coverage but corrupts any naive "sum the reports' stated populations" arithmetic.
  **Why:** found via cross-referencing all ten reports' own exclusion bookkeeping — 8 files independently
  read twice, all traced to `leg4b`, which explicitly logged (in its own header) that its cited shard-map
  source did not exist in its worktree at dispatch time. **How to apply:** when closing out a multi-wave
  sharded campaign, never trust the sum of stated populations as the covered count — rebuild the true
  distinct union from each report's own per-file verdict list (not its "excl" cross-references, which can
  themselves be stale) and diff that against the full corpus listing.

## Git state

Only this report file was created; nothing else was touched (no `tests/`, no `packages/` source, no
`tooling/src/snap/**`, no `docs/catalog/**`, no other lane's report). `git status --short` at report time:

```
?? docs/reviews/stickler/2026-09-02-ct-corpus-audit-final.md
```

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit FINAL closeout (cb-ct-audit-final, stickler): the campaign is COMPLETE.** Derived the
> true covered/remainder arithmetic from the ten folded reports' own per-file verdicts (not their stated
> totals, which both undercount via 8 cross-shard duplicate reads and overcount via loose "excl"/shard-map
> cross-references): **corpus 469 files / 113,931 lines · covered by the ten reports 414 files / 105,540
> lines · true remainder 55 files / 8,391 lines** (vs. the brief's own hypothesis of 428/~41 — the actual
> discrepancy sources were exactly the two the brief named: duplicate cross-shard reads, and files that were
> never actually claimed by anyone). Audited all 55 remainder files (user-admin ×14, discovery ×8,
> world-info ×5, stats ×5, regex ×5, auth ×5, credentials ×3, tag ×2, chat ×2, routes ×2, plus 5 singles) —
> **zero new findings**, register matches the rest of the campaign exactly (real red-first proofs, honest
> anchor/fence labelling, no stale premises, no un-failable negatives). Standouts: `chat-room-track.suite
> .ct.tsx` (four measured pane states, three separate planted non-vacuity controls), `admin-users-section
> .ct.tsx` (the campaign's most comprehensive single permission-boundary file), `login-shell-anchor.ct.tsx`
> (a real touch-drive proof on the login backdrop). Re-checked `corpus-search-results.ct.tsx`'s
> leg4b-flagged PROVISIONAL SCENES-door block against today's post-#1249 source (`RECEDED_INK` from
> `@orb/ui/lib`) — **confirmed CLEAN**, not provisional; the source's own header comment names this exact
> CT assertion as the fix's target. Campaign-wide findings ledger (5 total, all previously filed): F1 P3
> `reports/snaps/` write (#1240), F2 P4 racing zero-read (#1241), F3 P4 Button CTA-ring gap (#1242), leg4c's
> F1 P4 `.labels[0]` un-failable pin (#1258 class), L4's G1 P4 stale header/untested-arm (`use-carried-
> appearance.ct.tsx`). Severity ceiling stays P3 across all 469 files. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-final.md`.
