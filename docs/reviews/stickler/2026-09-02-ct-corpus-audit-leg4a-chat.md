---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 4a of the sharded campaign (#1229) — MID-band chat components

Lane `cb-ct-audit-4a` · stickler · worktree `.claude/worktrees/agent-a246a3aa1f785a7f9`. One of three
PARALLEL shards executing leg 3 §5's shard map; this shard is item (a) — the chat-components cluster.
Method, taxonomy and rubric: `2026-09-02-ct-corpus-audit-leg1.md` §2 (Phase A taxonomy table) read in
full, plus leg 3 §5/§6 (shard map + lesson quality bar) read in full.

**Headline: the shard is CLEAN. 11/11 files full-read (~6,900 lines), zero findings of any severity.**
Every taxonomy class swept at zero, with the file-internal register matching legs 1-3's "exceptional
condition" verdict — red-first defect proofs, honest FENCE/anchor labels, planted positive controls,
settle barriers, ordering proofs instead of node-side counts.

## Files resolved and read (all 11 — none overlapped leg 3 §5's "already read opportunistically" list)

| Name in the shard brief | Resolved path | Lines | Verdict |
| - | - | - | - |
| settings-context-tab | `tests/client/features/chat/components/settings-context-tab.ct.tsx` | 1229 | CLEAN |
| message-list-surface | `tests/client/features/chat/surfaces/message-list-surface.ct.tsx` | 1304 | CLEAN |
| chat-controls-band | `tests/client/features/chat/components/chat-controls-band.ct.tsx` | 590 | CLEAN |
| members-panel | `tests/client/features/chat/components/members-panel.ct.tsx` | 533 | CLEAN |
| message-content | `tests/client/features/chat/components/message-content.ct.tsx` | 414 | CLEAN |
| ghost-message-row | `tests/client/features/chat/components/ghost-message-row.ct.tsx` | 485 | CLEAN |
| home-recents-tile-body | `tests/client/features/chat/components/home-recents-tile-body.ct.tsx` | 718 | CLEAN |
| prose-settings-section | `tests/client/features/chat/components/prose-settings-section.ct.tsx` | 232 | CLEAN |
| appearance-message-style-section | `tests/client/features/chat/components/appearance-message-style-section.ct.tsx` | 228 | CLEAN |
| composer-guided-buttons | `tests/client/features/chat/components/composer-guided-buttons.ct.tsx` | 193 | CLEAN |
| chats-section | `tests/client/features/chat/lib/chats-section.ct.tsx` | 991 | CLEAN |

Total: 11 files, 6,917 lines. All 11 names from the brief resolved to exactly one `.ct.tsx` each (a
`find` over `tests/client/features/chat` for the 11 basenames returned exactly 11 hits, no ambiguity).

**Skipped as already-read**: none. Leg 3 §5's "read opportunistically" list (`web-weave-touch`,
`code-editor`, `lane-run-control`, `accessible-name-quality.suite`, `context-tabs-panel`,
`assembly-preview-panel`, `corpus-content`, `databank-detail-surface`, `workloads-group`,
`injections-manager`, `analytics-overview-surface`, `image-detail-body`, `message-media-block`,
`room-overrides-form`, `form-identity.suite`, `preset-structure-tabs`, `character-create-actions`,
`section-drill-in`, `grid`, `touch-floor`) does not intersect this shard's 11 names — verified by
literal comparison against my assigned list.

## Findings

**None.** No P0-P4 defects found in this shard.

## Taxonomy sweep receipts (per class, over exactly this shard's 11 files)

| Class | Result | Method | |
| - | - | - | - |
| `ONESHOT-OK` markers | **3** (`prose-settings-section.ct.tsx:138`, `appearance-message-style-section.ct.tsx:103`, `composer-guided-buttons.ct.tsx:77`) — all 3 verified with a TRUE reason, and all 3 pass the EXACT marker-window rule (marker line = expect line − 1, never a wrapped multi-line marker) | `rg -n "ONESHOT-OK"` per file, hand-checked each site's line offset from its `expect(...)` | |
| `FABRICATION-OK` / `as unknown as` double-casts | **0** | \`rg -n "FABRICATION-OK | as unknown as"\` per file — zero hits across all 11 |
| Literal `reports/` screenshot writes | **0** | `rg -n "reports/"` per file — zero hits. The one `page.screenshot({ clip: … })` call in `message-list-surface.ct.tsx:824` returns a Buffer for in-page pixel decoding, never a path write — read in full to confirm | |
| `expect.soft(...)` | **0** | `rg -n "expect.soft"` per file — zero hits | |
| Assertion-free / tautological tests | **0** | every `test(...)` block read in full; every one carries at least one failable `expect`/`expect.poll` with a real comparison | |
| Stale role-names / selectors (premise currency) | **0 confirmed stale** — 3 spot-checks against today's source, all live: `data-slot="chat-controls"` (`chat-controls-band.tsx:351`), `OWNS` tuple = `chatStyle`/`colorQuotedSpeech`/`autoFixMarkdown` (`appearance-message-style-section.tsx:1-2`, matches the CT's re-spelled `OWNED_KEYS`), `data-slot="ghost-message-row"`/`"ghost-stream-body"` (`ghost-message-row.tsx:148,299`) | `Read` on each source file + `grep -n` for the cited slot/tuple | |
| `getByRole` name without `exact` on a name-SHAPE claim | **0 misuse observed** — every file in the shard uses `exact:true` at exactly the sites where the name's shape (not mere substring presence) is the claim (e.g. `settings-context-tab.ct.tsx`'s heading-name pins, `appearance-message-style-section.ct.tsx`'s `{ name: "Ripple", exact: true }`) | read-derived; no automated census run (0 of the run budget spent — see below) | |

**Positive control for the zero rows above**: the `ONESHOT-OK` row is non-zero (3 real hits, all
verified true), which proves the sweep methodology (`rg -n <marker>` per file) actually finds markers
when present rather than silently missing them — the zero counts on the other five classes are
therefore "swept and absent," not "the search didn't run."

## Per-file notes (the load-bearing register observed)

- **`message-list-surface.ct.tsx`** — the strongest file in the shard. Every async-settle race
  (`turnCompleted` vs the post-turn `listMessages` refetch; `chatOpened`'s reopen-vs-first-attach fork)
  is closed with an explicit deterministic-race gate (`page.route` holding the SSE stream until the
  canon read has rendered) and a code comment deriving the TanStack Query in-flight-fetch mechanics that
  make the gate necessary — this is the house's gold-standard shape for "never assert a state that only
  exists while a query is in flight." The edge-fade and loading-plate pixel tests each carry their own
  planted positive control (the same story with the art flag off) per lane-standing-facts' "empty
  population vs broken probe" discipline.
- **`settings-context-tab.ct.tsx`** — the #629 "own honesty pin" (every section renders its real body,
  no unfed read hiding behind a boundary's error arm) is the strongest single defect-class killer in the
  shard; it is stated as the file's own history (a prior bug where an unstubbed read silently error-armed
  a section while only the OUTSIDE-the-boundary heading was asserted) and re-run in both host and member
  arms.
- **`chats-section.ct.tsx`** — same #629 discipline, applied at composition scope (`THIS_CHAT_TAB_READS`)
  rather than per-section.
- **`ghost-message-row.ct.tsx`** — the golden streaming-safety suite (unterminated fence, torn `<speaker>`
  tag, unpaired emphasis) is scripted delta-by-delta through a real chat-stream store rather than faked at
  the render layer, and the security guardrails (untrusted stream never emits `<img>`, the card sandbox's
  srcdoc/sandbox-attribute floor) are asserted through the rendered iframe attributes, not through a
  resolver's return value.
- **`home-recents-tile-body.ct.tsx`** — heaviest use of the anchor/fence-labelling discipline in the
  shard: several tests are explicitly headed "RED-FIRST" with the review finding that motivated them
  cited by number, and one test (`#1126`) states the owner's explicit ruling ("THE ROSTER READ ONLY") and
  the measured trade-off the owner refused, so a future reader cannot "fix" it back toward warming both
  reads without re-deriving the same ruling.
- **`chat-controls-band.ct.tsx`**, **`members-panel.ct.tsx`**, **`message-content.ct.tsx`**,
  **`prose-settings-section.ct.tsx`**, **`appearance-message-style-section.ct.tsx`**,
  **`composer-guided-buttons.ct.tsx`** — all CLEAN, no distinguishing register beyond the shard baseline;
  each closes with the same posture (pixel receipts over computed-style where paint is the actual claim,
  `exact:true` where name-shape is the claim, real-timer waits explicitly marked ONESHOT-OK only where a
  settled 900ms wait genuinely is the negative-assertion window).

## Run budget

**0 of the ~6 available `pnpm ct:scoped` runs used.** Every verdict in this shard is read-derived
(source spot-checks via `Read`/`grep`, no execution), consistent with legs 1-3's observed rate. No file
in this shard presented a claim that needed execution to resolve.

## Fences respected

Read only inside the assigned shard's 11 files plus the 4 source files spot-checked for premise
currency (`chat-controls-band.tsx`, `appearance-message-style-section.tsx` ×2 homes,
`ghost-message-row.tsx`). Wrote only this report file. No `tests/` or `packages/` source touched, no
`tooling/src/snap/**` touched, no other shard's report touched, no catalog/receipts write, no `snap --stage-*` command run, no process-group `kill`.

## Proposed memory lessons (orchestrator owns the write)

None new this shard — every lesson class observed here (deterministic-race gates over node-side
counts, red-first + owner-ruling labelling, `exact:true` on name-shape claims) is already covered by
the existing `ct-rendered-assertion-hub`/`ct-test-gotchas-hub` entries and legs 1-3's proposed lessons;
nothing surfaced here would sharpen them further.

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 4a (cb-ct-audit-4a, stickler, shard (a) chat components): 11/11 assigned files
> full-read (~6,900 lines), ZERO findings.** Files: settings-context-tab, message-list-surface,
> chat-controls-band, members-panel, message-content, ghost-message-row, home-recents-tile-body,
> prose-settings-section, appearance-message-style-section, composer-guided-buttons, chats-section.
> Taxonomy sweep (ONESHOT-OK/FABRICATION-OK/double-casts/reports-writes/expect.soft/assertion-free) all
> zero except 3 correctly-windowed ONESHOT-OK markers, all verified true. 3 premise-currency spot-checks
> against today's source all confirmed live. Campaign running total after this shard + siblings 4b/4c:
> 84 (prior legs) + this shard's 11 = at least 95/469 full-read; exact combined total pending the
> other two parallel shards' reports. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg4a-chat.md`.\*\*
