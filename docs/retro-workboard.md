# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D124**) wins on ANY
> conflict. `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status
> as current.
>
> **CURRENT-STATE ONLY, INITIATIVE-SHAPED.** When a block goes stale, REWRITE it — never stack a new
> session layer on top. Rewritten in full 2026-08-03 (the line-by-line audit close: every claim in the
> ~3,500-line accreted board was classified DONE-PROVEN / OPEN / STALE / UNKNOWABLE against the tree
> and git; only proven-done work was removed from the live board). **The audited archeology — every
> struck block, snapshot, lane seal and receipt from 2026-08-01 through 2026-08-03 — moved intact to
> [`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md).** Nothing was
> deleted; things moved. Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved it: one owner dogfood day found ~20 real defects, every one
fixed at its ROOT the same day, five whole bug CLASSES made unmakeable. Judge every "done" against
that frame — a row that says "merged" is not a receipt; a sha, a symbol, a registered gate, a running
test is.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
([[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ STANDING LAWS (the posture — all owner-set, all still in force) ═══

- **Cap FIVE concurrent lanes** (owner raised it from three, 2026-08-03, to burn the almost-done
  initiatives to CLOSED; the original three-cap came from "six ate our usage too fast" — five is the
  tested ceiling, six is not). **ONE COMMIT per lane**, terse
  message drafted in seconds; receipts go in the final report, never the commit message.
- **Merges** `--no-ff --no-verify` on branch-side hook-green receipts — BUT any branch certified
  BEFORE sibling merges landed gets a consolidated `pnpm check` on the merged result (caught reds
  three separate nights). Merge → SEPARATE verify call → THEN teardown, never chained. `git -C
  <ABSOLUTE-main-path>` on every merge/verify command.
- **NEVER push to origin without a fresh per-push owner word.** Not overnight, not on a green battery,
  not "the word was banked yesterday".
- **Overnight full-auto**: proceed through the queue, escalation ladder (stickler → ast/code → docs →
  judgment) instead of blocking questions. Blocking only for destructive/irreversible, owner-sacred
  (persona pin), origin pushes, genuine scope pivots.
- **Every UI build gets its side-eye, and ALL side-eye findings get fixed** — never just the top ones
  ([[side-eye-fix-all-findings]]).
- **Gates land on a FIXED tree**: a new gate's live violations get FIXED in the same lane; allowlists
  are for permanent deliberate exemptions with a reason + stale arm, never debt parking.
- Board commits are `--no-verify` (owner word); code merges keep the hook. D-numbers are allocated at
  DISPATCH when two live lanes both mint.
- Lane floors MUST name their playwright CT files explicitly — `pnpm verify --push` runs NO CTs
  (tests:node + e2e only); the full `pnpm test` battery at quiesce is the CT proof.

## ═══ STATE (2026-08-03, at the audit) ═══

- **main @ `0d2e42fb`**, tree clean. **101 commits past origin `865405d6`** (the 199-commit era was
  pushed 08-03 on the owner word). Gates: **176 registered**. D-ledger: through **D124**, next free
  **D125**.
- **PUSH-READY was declared at 85 commits** (`7d91d01a`, battery run 2 = true pass, all stages clean).
  16 commits have landed since (NIGHTFIX, DATABANK S1, board edits) → **a fresh `pnpm verify --push`
  is owed before the word is asked for again.**
- **THREE LANES LIVE at this writing** (worktrees present, unmerged — see I-1/I-2/I-4 below): SCHEMA
  `wt/agent-ae77d3dd37bc2337b` · DBANK2 `wt/agent-a75555728b3673edc` · SWEEP
  `wt/agent-ac9ffb2bcce6316a7`. Do not re-dispatch their scope; resume them warm by agent id.
- Dev db is the post-REGEX re-mint (v3 demo pack, 6 chats). The owner's regex scripts were re-entered
  by hand ([[backrest-recovery-and-cited-reports]] — BACKREST-MANUAL).

## ═══ INITIATIVES ═══

### I-1 · STRUCTURED OUTPUT — the projector is wrong in four ways (LANE SCHEMA LIVE)

**Landed under it:** RESYNC-OR (`d432ed51` — the structured role sends ONE FORCED TOOL CALL, the D112
vehicle; both rpg write paths now speak one dialect; probe matrix receipted) · STRICTFMT + CUSTOMBYO
(`35014699` — the kit stops INVENTING `strict`; it rides only when the caller sets it; vLLM pins it at
its own call site, the xgrammar lever) · the vendor-docs research (`docs/reviews/misc/2026-08-03-
structured-output-docs.md`).

**OPEN (the lane's scope):** our projector emits FOUR unsupported keyword classes, not one — `minLength`
(×16, banned by BOTH vendors), `maxLength`, `minimum`, `maximum`; strip them per-wire-subset ·
`disable_parallel_tool_use` is absent tree-wide (a silent duplicate-drop) · **both vendors return a
refusal field and we read NEITHER — a refusal currently logs `ok:true`** · truth-repair 3 stale
comments.
**Receipt of not-done:** `WireTool` (`packages/server/src/infra/providers/contract/chat.ts:34`) has
`name`/`description`/`parameters` and NO `strict` field — so the forced-tool vehicle compiles no
grammar and has ZERO schema enforcement today; the kit header claiming grammar-level prevention
describes a tool that cannot exist.
**Rides it:** `engine/chat-completion.ts` holds a SECOND `response_format` builder that never emitted
strict (SM7 flagged, deliberately not touched).
**⚑ OWNER RULED (08-03) — IT IS A CONFIG OPTION, NOT AN A/B FLIP.** Owner: *"i kinda wanted it to be
somethign we could swap to if we wanted or like a config thing etc. I dont want it to be seen as dead
its a config option for us to use maybe put in settings or find a home for it."* The nullable-union arm
(every prop `required`, optionals as `anyOf [T, null]`, `null ≡ absent` — preserves omit-means-keep AND
clears Anthropic's undocumented "too many optionals" wall) is BUILT but reachable only by editing
`EXTRACTION_STRICT_WIRE` and restarting, which is functionally dead. **Lane STRUCTOUT** gives it a real
home (default ruling: the AppSettings tier — env floor, DB override wins — surfaced in settings, per
[[settings-section-seam-body-only]]); the DEFAULT behaviour does not change, only the reachability.
D126 allocated if it mints. Blanket-vs-capability already ruled: KEEP BLANKET.

### I-2 · DATABANK — S1 shipped, S2 in flight, S3 unstarted (LANE DBANK2 LIVE)

**Landed:** DATABANK IS A LIVE RAIL SECTION (`b377ed8c` + merge `17f83015`) — the library, Add
upload/paste/link, phase chips, bounded ingest poll, owner-wide reindex in the band kebab, empty
states, auto-appears on Home via the registry; 199 CT + 110 unit; consolidated `pnpm check` 14/14 on
the merged result. D-1 `listGlobal` minted. Its rendered check caught a real defect and minted
`ListRow.subtitleLead`. **Owner CLOSED the section-vs-collection fork: Arm A (own rail section)
stands** — demotion stays a one-file edit if he ever wants it.

**OPEN — S2 (the live lane):** the per-chat rack (D-2 sources threaded — `scope.ts` already runs the
three junction queries and DISCARDS the answer) · the rack after Injections per D-4 · **the D85 host
visibility toggle — the original workboard item, still unbuilt** · the `listActiveForChat` freshness
row.
**Receipt of not-done:** `packages/server/src/domain/databank/verbs/` holds attach · create-from-text ·
gather-retrieval · get · list · list-active-for-chat · list-attachments · reindex · remove · rename ·
scrape · upload — and NO visibility/hidden setter, while `packages/contracts/src/databank/index.ts:96`
already specs the D85 override.
**OPEN — S3:** unbuilt. D-7's real home tile still owed. Spec: `docs/design/databank-surface-spec.md`.

### I-3 · CONFIG WORKSPACE — the rail is live, the polish tail is not (LANE SWEEP LIVE)

**Landed:** R1 the Configuration workspace + the `CollectionContribution` seam, tags + regex OFF
settings (`3769d4f9`, gate #175 collection-registry-completeness) · R2 world-info into the workspace,
rail back to 8 (`e7a86df1`) · CR0 gate #174 `section-factory-contribution-bundle` (makeChatsSection
refactored 4→1 in the gate's own landing commit) · NIGHTFIX, the combined side-eye's fix-all (`48f47f09`):
the CONTENT region's padding (the "looks unfinished" verdict killed at the region), the double
empty-state lie ×3, `actionsReserved` boolean→NUMBER (a row reserves what its LIST declares), narrator
rows say "Narrator", dialogue-hue de-collision, Prune confirm, `placement:[]` made legible ×3,
Find-pattern affordance, FACEFILT `aria-pressed`, theme cluster values + one vocabulary,
Settings›Personas contains personas, the 4-affordance ceiling.

**OPEN — the live SWEEP lane:** the side-eye's NOT-REACHED tail (tag context arm · the regex picker's
order split with drag + keyboard + >30 arm · the mobile & rail mock diffs) PLUS a fresh-eyes
hunt-and-FIX over config / databank / regex at 320px + mobile. Owner: "any bugs found can be fixed."
**⚑ OWNER-TIMED:** **presets stay OUT of the config rail until he feels it** (one array member,
forever, whenever he wants it). "Still not set on presets being their own thing" stands.

### I-4 · REGEX — the reshape is complete; the extras and one premise question are not

**Landed:** R1-R6 (`12cf0a8a` + `ff2aa8b4`) — first-class script library (owner-stamped + 4 FK
junctions, 19 verbs, tRPC all-PROBED), 3 embed carriers DEAD on one baseline regen, `regex` at
`PORTABLE_IMPORT_ORDER[5]`, lift/re-embed at the card seam, **DISPLAY tier ALIVE** (viewer-only default
+ the HOST per-room broadcast toggle, viewer-last precedence), ORDER pins, 2211 node + 314 CT · REGPAR
the paneside tester + ST disabled-POLARITY fix (`1a9687bf`) · REGORDER all four scope-order arms
authorable (`e2d4087f`) · REGROSTER the attached-by rosters + `resolveVisibleRooms` (`6df02b16`) +
its rename-freshness gap fixed direct-on-main (`930955e4`).
**Receipt the portability cross-link held:** `PORTABLE_KINDS` in
`packages/contracts/src/portability/index.ts` carries `"regex"` — REGEX did NOT become the next PORT-F1.

**OPEN — REGX2 (owner-ruled 08-03, dispatch when a slot frees):** bulk edit · the pipeline debugger ·
the per-script JSON door. **NOT regex presets** — owner: "we made regex part of presets kinda" (the
preset carrier already IS the named-set mechanism).
**OPEN — TAGSORT (report-then-decide, do NOT delete blind):** owner challenged the premise of tag
reorder — "this is an overall global tag manager across our entire lib." Tree check:
`tags.sortOrder` EXISTS (`packages/db/src/schema/tag.ts:89`, NULL = name fallback) with a live
`setTagOrder` writer (`domain/tag/verbs/set-order.ts` + the client hook), so manual order is BUILT and
its only value is hand-curating a global library. **RULED: do NOT lift REGORDER's arm; the >30 cliff
stays.** The standing question is whether `sortOrder` earns its keep at all — audit who READS it; if
it is only the library sidebar's folder grouping, sort-by-usage/name may be strictly better.
**OPEN smalls:** "Untitled chat" in the regex rosters (REGROSTER's naming question) · X-16 edited-ago
needs a `RegexScriptRow` timestamp (contracts + db — verified absent) · REGPAR's F6 residual (REASONING
prints slot 4 but executes post-postProcess — unobservable; strict-fidelity is an owner nit).
**⚑ OWNER-RULED CLOSED (record):** prompt-EPHEMERALITY — min/max DEPTH is a PROMPT-leg concern; DISPLAY
needs none of it because we own the viewport. The D121-E depth drop stays dead for display; the depth
knobs come back only WITH the prompt-build history leg, if that is ever built. REC (a)
ACCEPT-AND-RENAME stands.

### I-5 · BRAND BURN-DOWN — the gate is live, the debt is named

**Landed:** gate #176 `brand-in-name-position` (`35014699`) — positions DERIVED from `kit/ids`, zero
hardcoded paths, blindness tripwire, two-sided markers, position-NAMED escape
(`@foreign-id-ok(<position>): reason` — because one line can carry ours + theirs), the six-case
real-tree probe. 28 permanent foreign-wire markers planted at landing (agent-sdk `sessionId` name
collision · local-light HF `modelId` · plugin wire DTOs).
**OPEN:** the arm-A baseline ratchet is ACTIVE and shrink-only. **Receipt:
`scripts/check/gates/brand-in-name-position.baseline.json` = 169 files / 374 sites.** Terminal state is
`{}` + delete both the baseline and its generator. Burn it down in named lanes when the owner wants
them; `sessionId`→`sdkSessionId` is a dissolving candidate.

### I-6 · PORTABILITY — R0-R5 landed; R6 is the honest scope-out

**Landed:** PORT (`87b3c826`) — F1 CLOSED (databank travels, real bundle round-trip), the
`lifecycle-portability` gate #173 (it caught `globalDocuments` unclassified WHILE BEING WRITTEN), the
R3 serde spine (8 families, envelope/decode/version-gate/emit exist ONCE), world-info doors +
`?format=png|json`, persona chrome re-homed, the O-3 merge-in-place flip (theme + tag restore-wins,
USER-VISIBLE).
**OPEN — R6:** the orb-native chat-bundle arm alongside jsonl. It was scoped out HONESTLY and is
MACHINE-TRACKED: the ACCEPTED-LOSSY / DEFERRED rows each say "ends when R6 lands". O-6
characterless-import rides it, and so does the standing owner question below.
**⚑ OWNER ITEMS on this initiative:** the absent-character transcript import policy (refuse vs
mint-placeholder — PORT recommends the "import as characterless chat" arm) · the JSON-card export
format (PORT's recommended home: `?format=png|json` on the existing character door) · F9's design fork
for the chat-anchored planes that are unportable by construction (rpg campaigns · injections · room
overrides · re-links; plus automation_rules / global_variables / plugins, which have no arm at all).

### I-7 · OBSERVABILITY — the span ring has three holes left

**Landed:** OBS (`93e40fb1`) `addSpanEvent` wired across cache / retry / wake with trace-ring landing
proofs; the ratchet baseline is EMPTY. SM4 (`f46122ad`) the rpg round TRACED (`withRequestSpan` needs
`root: true` — a parented span never seals the ring), `provider.*` spans at `runRole` (all 9 role
dispatchers, so `providerDurationMs` finally lands), structured-retry `onRetry` injected.
**OPEN:** `fireExpressionClassify` (`packages/server/src/domain/chat/engine/engine.ts:550`),
`fireRpgTurnAborted` (`:608`) and the post-turn memory pass all run OUTSIDE any live span — the same
outlives-the-request class SM4 fixed for the rpg round. `rpgRoundRequestId` is the template.

### I-8 · PROSE / NUDGE / PERSONA — built machinery waiting on the owner's voice

**Landed:** NARCOLOR (`136139fc`) — narrator coloring works for the first time ever (the render half
existed; the PRODUCE instruction never did). `narratorNudge` + `speakerTags` are PROSE-1 slots
(owner-editable data), `roundNudge` v1→v2, one tint producer, the tolerant line-start `Name:` parse
gated to narrator assistant rows. PERSONA R0-R4 (`c736ae8a` + D122) — the multi-human keyhole is
CLOSED. HCOPY (`d4aa40f9`) — the handoff copy arm end-to-end.
**⚑ OWNER VETO OWED — THE THREE NUDGE DEFAULT TEXTS, VERBATIM** in NARCOLOR's report (speakerTags v1 ·
narratorNudge v1 · roundNudge v2). `{{user}}` is deliberately absent (`macros:"none"` slots); a
`{{names}}`-style pre-sub token is small plumbing on his word.
**⚑ PARKED WITH ITS RULED DESIGN FLAVOR (owner-sacred, do not build):** mid-session persona-change
linkage for rpg state. Owner's reasoning verbatim: *"if you form relations with NPCs with persona A and
then swap to persona B, all those keyed things will now point to persona B even though they haven't
done anything — the same debacle as persona pin and why we made it."* The ruled answer whenever it
unparks: **PERSONA-PIN SEMANTICS applied to rpg-lite state tracking** — relations / keyed state PIN to
the persona they were formed under; a swap opens new/parallel context, never a silent re-point.
Recast-is-story is NOT the answer; the design derives from the pin concept.
**Recorded, not scheduled:** the tint plane paints quoted speech + italics only — plain prose spans get
scope-no-color (pre-existing; the likely next "still not colored" report). `GhostMessageRow` has NO
identity chrome for ANY row kind.

### I-9 · CEREMONY + DOC GRADUATION — 2 of 3 done; HCOPY's D-entry is the survivor

- ✅ **D125 MINTED** — the fifth regex leg (`PROMPT_HISTORY`, amends D121-E), from HISTLEG's report.
  Both range headers + the master enumeration updated (which was itself behind: D123/D124 had never
  been appended to `Core-Laws-and-Precedents.md:62` — backfilled in the same edit). **Next free: D126**
  (allocated to STRUCTOUT). HCOPY's handoff-copy D-entry (amends D64) is STILL unminted and rolls to
  the next ceremony batch alongside any REGPAR / R2WI deltas — that is the initiative's one survivor.
- ✅ **Graduation move DONE (08-03):** the 36/36-ACCOUNTED preset-execution crunch list graduated to
  `docs/history/reviews/misc/`; its three inbound refs repointed. (The board's "that dir is EMPTY"
  claim was stale — it already held six graduated reviews.)

### I-10 · LAUNCH-DAY — three things that only matter on the day

- **REGIME-2 LANDMINE:** `structure:db-baseline` is regime-1-SHAPED (it generates from `{}` vs `0000`
  alone). It MUST be re-pointed at the applied chain on launch day or it reds every legitimate
  incremental. Documented in `Tier-1-DB.md`, deliberately not fixed.
- **The TWO-SWITCH flip** in Tier-1-DB's migration-lifecycle section (pre-launch squash regime →
  incremental regime).
- **h3/QUIC checklist (five minutes, deployment-level):** verify Caddy h3 enabled (default since 2.6) +
  **UDP 443 open** (the classic silent miss — browsers fall back to h2 via Alt-Svc and never tell you).
  The 15s SSE ping already keeps QUIC NAT bindings alive; 0-RTT stays off non-idempotent; add no
  TCP-era tricks. Dev stays h1.1 deliberately (a stricter transport test).

## ═══ SMALLS / TAIL (each independently landable) ═══

- **Square-glyph Button size variant + the 14-row sweep** — `DEBT_BASELINE` in
  `scripts/check/gates/ui-size-via-variant.ts` holds 14 rows across 9 `features/rpg` files, all one
  shape (`<Button intent="ghost" size="sm" className="!size-N !p-0">` + one `!w-block` TrackBar). The
  honest fix is a square-glyph size arm swept with computed-geometry proof; it returns the baseline to
  terminal `{}`.
- **Per-actor tracker grant/revoke EDITOR** — `sheet.trackerGrants` / `trackerRevokes` exist and gate
  NPC tracker applicability, but NO client editor exists (verified: zero `.tsx` references). The
  owner's "keep explicit-list-only" NPC-grants ruling is a DEAD LETTER until hosts can edit the list.
- **`readout-parts.tsx` pending-flash** (`packages/client/src/features/preset/components/readout/`) —
  the same F-02 lying-pending-arm class SM4 fixed elsewhere; flagged, not fixed.
- **CapabilityGate's no-error arm is UNREACHABLE as a settled state** (capability required | error —
  undefined+null = PENDING), so every editor open FLASHES "connect a chat model" at users who have one.
  Owner ruling was "build it later": add a pending arm, then delete-or-reach the note.
- **`respell` derive-or-cite row:** search `DigestsParams` / `SegmentsParams` ≡ contracts
  `MemoryQueryOptions` (both still live in `domain/search/contract/params`). Its twin,
  `MemoryBackfillCounts`, is GONE — that half is closed.
- **`import-user-settings` bypasses the routing write-guard** (whole-blob verb) — imports heal+warn at
  read instead of refusing at write; lift the guard into the import path on want.
- **`connection.getCatalog` / `getAgentSdkCatalog`** appear in admin `invalidates` with zero literal
  consumers — aliased reads or dead rows; disposition.
- **`field-reachability` suite ignores a `.ok`** (SM5's flag — non-vacuous, honest-fix-same-shape).
- **L8-inbound:** foreign ST `mes:""` rows at import — declined-by-scope in ANCHOR, a one-liner if
  wanted.
- **The seeder drop-patch STAYS** until the next fixture regen (the committed flagship fixture carries
  durable pre-D124 `mes:""` rows). ANCHOR's "matched nothing" premise was corrected.
- **CPD's 3 opportunistic dup rows** (invites verb+persistence pair · embed-store per-store reads ·
  rebuild-from-canon) — consolidate when next IN the file, no dedicated lane (DRY-not-gospel).
- **TYPO class-A: 27 as-const tuples** stay untagged manual-lens candidates.
- **`staging.ensure` residual** — first-write-wins seeded from HEAD; dormant unless rpg tools ever mount
  as REGISTRY tools again (D112 keeps `tools: []`).
- **R5b(a) verify:** `refEnumerationLines` (the non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm the R6 build carried it; ~2 lines if not.
- **WAKE-STATUS:** the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.
- **`lockdown` §16 G-table deliberately not grown** (CR0's flag — it defers to the live count).
- **The F4-CACHE-VOLATILITY probe follow-up:** `buildToolRoundWireTools` re-renders descriptions +
  ref-constrained schemas from LIVE game state every call (`compose/rpg.ts:407,411`), so each new
  condition/actor re-bills the whole prefix (~10× that turn). Verify whether that path's system block is
  already per-turn volatile, then pick between `scripts/probes/openrouter/RESULTS.md`'s two options.
- **`E2E_LIVE=1 pnpm e2e`** is owed on a push window (never re-confirmed since the era's start).

## ═══ WATCH LIST (flakes + pre-existing reds; none blocking) ═══

- `code-editor.ct` completion flake under contention (documented CM6 75ms window).
- `drawer.ct:162` focus-trap failure — PRE-EXISTING at HEAD (D8R's flag).
- `preset-editor-surface.ct:140` parallel-load flake — A/B-proven pre-existing.
- `seed-demo-chats` cold-import contention — STRUCTURALLY fixed by routing to `SERIAL_INT`
  (`aef89ecb`); watch that it stays quiet.
- A hand `editSnapshot` during an in-flight turn can be clobbered by the flush (seen once, unchased).
- `rpg-scene-tab.tsx` sits near the 450-line cap.

## ═══ STANDING OWNER ITEMS (his word, nobody else's) ═══

1. **THE PUSH WORD** — 101 commits armed; a fresh `verify --push` is owed first (see STATE).
2. **The three nudge default texts** (I-8) — his veto, verbatim in NARCOLOR's report.
3. **Structured-output nullable-union reshape** (I-1) — the A/B call.
4. **Presets into the config rail** (I-3) — owner-timed, one array member forever.
5. **`tags.sortOrder` earns its keep?** (I-4 TAGSORT) — report-then-decide.
6. **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed `trustHtml` renders
   them; needs a "what render policy would this card get" server seam. Architecture call.
7. **AGENT-1** — agent-sdk FIRST-CLASS for rpg-lite. Plumbing is ~complete (terminal tools · stateful
   tools · session resume · compaction envs · firewall · catalog). Remaining arms in ruled order 2→3→1→4:
   (2) REASONING visibility parity — the model reasons at native depth on BOTH arms; max-pro-sub
   delivers ENCRYPTED deltas (hidden by provider), the OR skin delivers them readable, so the OR arm
   captures into our reasoning channel and the sub arm handles encrypted deltas HONESTLY (never an
   empty/broken pane) · (3) usage/context accounting parity (per-turn DELTA semantics) · (1) knob
   HONESTY (the SDK wire ignores most sampling knobs) · (4) the live rpg-lite loop scored on the SDK
   wire. FYI standing: Claude Max OAuth expired — the agent-sdk backend is dead until he re-auths.
8. **JSON-card export format** + **absent-character transcript import policy** (I-6).
9. **Doc-Law §-refs-in-comments ruling** — `rpg.ts` carries 33; sweep or carve out.
10. **Macro-feed cast-guides** — `chat-ops/macro-view.ts`'s cast projection does NOT carry the RV-11
    guide fields (appearance/outfit/thoughts). Should user macros bind cast guides via `celBindings`?
    Thread them, or note the asymmetry in the file.
11. **VRAM-refusal drill** — needs his word for a real GPU hog (unit-covered; the live arm is open).
12. **v3 transcripts reach NEW installs only** — the pack heal carries dressing, never transcripts
    (deliberate; his stack is fresh, so this is fine). A transcript-heal arm is his call if other
    installs ever matter.
13. **RV-13 second half — branch-and-save game modes**: the ruling (freeform demoted, d20-in-lite is the
    direction) is doctrine; the BUILD was deliberately sequenced AFTER the hardcoded-constants-become-
    user-slots work (PROSE-1 + knob editors + tracker-def editors — now largely landed, so this is
    ready to spec when he wants it).
14. **Unsent-draft reload persistence** — nav round-trips keep everything; only a PAGE RELOAD loses an
    unsent draft, deliberately. Persistence-design fork, not a bug.
15. **The held-back rail merge** — characters + chats into ONE glyph. He considered it, went with A+B,
    and A+B CONVERGES toward it, so it stays a cheap rail-level edit whenever he feels it.
16. Taste tail: Meteocons artwork fork (~8 icons, MIT) · grimstone theme (parked) · chat-options
    placement (D111 clause OPEN, breaks nothing) · persona=character design pass
    ([[persona-pin-prompt-resolution]]).

## ═══ UNKNOWABLE — flagged for the owner, kept on the board ═══

Items this audit could not prove either way from the tree. **None were dropped.**

- **The three live lanes' outcomes** (SCHEMA · DBANK2 · SWEEP). Their scope above is what was
  dispatched, not what landed; reconcile at their merges.
- **"the two `countByBook` twins"** (REGROSTER's flag, 2-instance dup). Today the symbol exists in
  exactly ONE home — `packages/server/src/domain/world-info/persistence/queries.ts:81`, called five
  times. Either the twin already dissolved or it lives under a different spelling; needs a look before
  anyone acts on the flag.
- The 08-01/08-02-era probe residue that was never re-driven: the `#16` engine auto-sleep/wake LIVE
  pass beyond the 6/6 arms already proven, and the VRAM drill it depends on.
- Whether every one of NIGHTFIX's three ARGUED refusals (row-pitch parity · scent scope ·
  `listScriptUsage` ×3) is settled with the owner, or only with the reviewer.

## ═══ ORCHESTRATOR QUICK-ONBOARD (load-bearing — keep) ═══

**Dispatch + lanes**

- `Agent {isolation:"worktree"}` — the WorktreeCreate hook owns creation (local HEAD + auto-install).
  POST-DISPATCH verify bases (`git -C <wt> rev-parse HEAD` = main HEAD). Briefs ALWAYS include: the
  back-channel line (lanes SendMessage you MID-RUN — the owner wants this), scope boundaries vs sibling
  lanes, `git -C` discipline, lane-unique scratchpad names, and **the explicit playwright CT files the
  lane's floor must run**.
- Message live lanes by AGENT ID, not role name. **TaskStop an agent once its report merges** — a
  lingering resumed instance in a torn-down worktree correctly refuses to act but sits in the owner's
  UI as running. NEVER resume an agent whose worktree you removed.
- **ALLOCATE D-NUMBERS AT DISPATCH** when two live lanes both mint (D123/D124 needed a mid-run
  renumber).
- Lanes cite their own defaults mid-run (the default-and-deadline law) — rule fast, they don't stall.
- Sticklers are the design-question vehicle (five ran in one day, every one changed the plan) —
  dispatch with the actor-state-review form + "write the file first".
- Scout dormancy censuses (LIVE / DOORWAY / DEAD-WIRE / ABSENT per verb) answer "is this domain real"
  cheaply — wired-or-cited applies at domain scale.
- **Every scout PRESENCE claim needs AST, not grep** (three instrument-error retractions in one day).

**Merges**

- A FAST-FORWARD merge SKIPS the pre-merge-commit hook — run `pnpm check` on main after any FF (or
  `merge --no-ff`). NEVER DEFER that check when the branch's gate list missed any stage.
- **NEVER CHAIN TEARDOWN BEHIND A MERGE IN ONE COMMAND** (burned twice: a `| tail` swallowed a hook
  failure and teardown ran on a failed merge; a red hook left staged-no-commit and the chained `rm -rf`
  deleted a lane worktree that then needed resurrection). merge → SEPARATE verify call → THEN teardown.
  A staged-failed merge is `git merge --abort`, never `reset --hard` with uncommitted work.
- **The orchestrator's own shell cwd can silently sit in (or die with) a worktree** — a bare `git
  log`/`git merge` then acts on the WRONG repo and even the verification lies. `git -C <ABSOLUTE-main>`
  always.
- **HOLD merges while a `verify --push` runs** (merging mid-battery muddies what got certified).
- Merge-hook format-drift reds: fix IN the staged merge (scoped biome on the named files, inspect the
  diff, `git add`, `commit --no-edit`).
- Teardown: `status --short` (untracked survivors) + `git show --stat` receipts FIRST; never tear down
  a resumable lane. Recovery: the branch always survives —
  `git worktree add <same-path> <branch>` re-installs via the post-checkout hook.

**Verification instruments**

- `pnpm check` = STATIC only (~90-220s, in the pre-commit hook). `pnpm test` = the battery (~10 min,
  vitest ~9,800 + CT). `pnpm verify --push` = check + tests:node + e2e-smoke and **runs NO CTs**. READ
  `reports/` instead of re-running.
- snap is STUDIED IN FULL in `side-eye.md`: `--eval` takes a BARE arrow (an arrow-IIFE double-invokes);
  `--jsclick` for list rows; `--isolated`/`--dirty` beat dev-stack HMR; `--goto`/`__orb.nav` for SPA
  reach; `--file` renders committed HTML mocks; `--contexts` now works ALONGSIDE the dev stack (the
  fixture is an offset-pair sidecar since `73f78c81`). **The hover-loop class is REAL-POINTER-ONLY** —
  synthetic/CT/CDP-discrete are all blind; assert the structural invariant instead.
- `pnpm ast refs/jsx/orphans/unwired/chains` (resolution-based, beats grep) to verify a lane's deletion
  and sweep claims. Probes: snap + design-audit + perf-meter + motion-audit + `pnpm record`.
- Chrome MCP (claude-in-chrome) for live pairing with the owner: CDP hover survives screenshots, zoom
  regions, in-page counter probes — the tool for "I see it but can't shoot it".

**Owner cadence**

- He answers question-tool batches fast and almost always takes the mantra-marked arm — pose ALL
  pending forks, batch of ~4, recommendations marked; text-list the minor defaults you're taking under
  proceed-in-full.
- **When he says "read the reports in full" — do it.** The summaries drop load-bearing items (proven
  twice).
- **He challenges PREMISES, correctly and often** (tag reorder, display ephemerality, databank
  section). When a queued item's premise dies, say so and re-rule — don't build the boarded letter.
- Publish mocks as artifacts for his eyeball (four config-rail mocks ruled two forks in minutes).

**Compact ritual**

- Any OWED DELIVERABLE (unanswered owner question, undelivered report) gets written INTO this board
  before compact — never trust the summary to carry a whole deliverable across the boundary.
- The context-sentinel can fire a STALE ~99%-full warning on the first post-compact turn — ignore it.
- MEMORY is SYMLINKED across both accounts (one store, either login).
- **Resume read order:** this board (whole file) → `git log --oneline -40` → `MEMORY.md` (auto-loads) →
  `docs/architecture/core/AGENTS.md` for architecture work → the history archive only if you need the
  archeology of a specific landed program.
- AGENT-DEF REFINEMENT LOOP: at lane completion, occasionally ask the agent for onboarding friction and
  fold the good answers into `.claude/agents/*.md` / `.claude/agent-doctrine.md`.

## ═══ STANDING FACTS + POSTURE ═══

- **Stack:** `pnpm stack restart` defaults `ENGINES_POSTURE=adopt-only`; `--force` is the ONE
  fleet-killer. Engines: `pnpm engines:{wake,sleep,status}`; truth = `GET /is_sleeping` (`/health` AND
  `/v1/models` both LIE while asleep); the hold marker refuses auto-wake. Wake-on-demand is built into
  the server's vllm request seam (single-flight, fail-loud). No stack restart mid-battery.
- **DB:** pre-launch, schema changes SQUASH into `0000_baseline.sql` — a baseline regen DROPS the dev db
  on next boot (backup + re-migrate, reseeds via the latch). Announce it when squashing. **NEVER bare
  `sqlite3` on the live db** — probe COPIES or `/api/_debug/*`. Wire capture:
  `GET /api/_debug/wire/captures?chatId=…` (`x-debug-token: dbg`).
- **Worktree lanes:** the auto-hook creates `wt/<name>` from local HEAD + `pnpm install` (2s/48MiB);
  NEVER `enableGlobalVirtualStore`. ONE committer on main; lanes commit with PATHSPEC and must
  `git add` new files first; lane cwd RESETS across notification boundaries. Semantic conflicts on a
  lane's own files → abort and send the LANE to merge main into its branch.
- **Probe harnesses:** `scripts/probes/rpg-extraction/` (`run-coverage.mjs` env-driven ·
  `steer-probe-real.ts` · `local-8b-vehicles.ts` with resumable `SPIKE_ARMS` · `card-teach-probe.ts`).
  Score against OPPORTUNITIES and through the PRODUCTION tokenizer (emitted ≠ rendered).
- **The extraction-mode map is EMPIRICAL** (spike §4f-§4h — read it before ANY mode work): hosted strong
  × folded = the proven default · agent-sdk wire = no terminal channel → LOUD fallback round · local
  vLLM × folded = prose-silenced → the `local-engine-fold-guard` runs the cheap round · **cheap is the
  local champion** (grammar-bound via `tool_choice:"required"`). `reliable` was CONTRADICTED by
  measurement and DELETED 2026-08-01.
- **Orchestration:** delegate volume, keep judgment; a fresh-context verifier/side-eye before any
  non-trivial "done"; diff an executor's self-flagged "deliberate deviation" against the SPEC TEXT
  before minting law ([[spec-completeness-no-improvisation]]).

## ═══ THE RECEIPT TRAIL ═══

Everything this board used to carry inline — the 2026-08-01→08-03 snapshots, every lane seal with its
merge sha, every superseded ruling, the whole burn-down archeology — lives at
[`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md), audited and
intact. `git log --follow docs/retro-workboard.md` is the other half.

## ═══ ▶▶▶ RECONCILIATION (post-audit, 08-03 — landed AFTER the board rewrite's base) ═══

The audit wrote SCHEMA / DBANK2 / SWEEP as *dispatched*. Since then:
- ✅ **SCHEMA MERGED (`c92b7aeb`)** — one `scrubWireSchema` engine + FOUR wire modes
  (hosted-common · anthropic-format · guided-decoding [KEEPS bounds, the xgrammar lever] ·
  strict-compatible [all-required + anyOf-null, BUILT and OFF behind `EXTRACTION_STRICT_WIRE`]).
  Absorbed THREE drifted hand-rolled walkers — vLLM's wasn't position-aware, so a field NAMED
  `title`/`default` was being deleted from the guided wire (live bug, found by absorption).
  `parallel_tool_calls:false` + a loud extra-call warn. **Refusals READ on both roles.**
  **RESYNC IS A TOOL ROUND**; FOLDED PROVEN UNTOUCHED (4 named pins + 49 tests unmodified).
- ✅ **DBANK2 MERGED (`2b4c2d24`)** — the per-chat rack + **the D85 visibility toggle (the
  board's oldest unbuilt item)**; D-2 sources threaded; hide writes the FULL set; `formatBytes`
  promoted to `@orb/kit/strings`. Databank tail: D-3 arm (a) · S6 character rack · D-7 tile.
- ✅ **HISTLEG MERGED (`537a475e`, merge `fc35b0d9`)** — the FIFTH regex leg `PROMPT_HISTORY` is
  live: transforms the assembled history at prompt-build time and never reaches canon, with
  `historyDepth {min,max|null}` scoped to that leg alone (contracts-checked in BOTH directions,
  because `placement` is a SET and no discriminated arm can say "this field exists only here").
  **D125 MINTED** from its text. Consolidated `pnpm check` on the merged result: **14/14 PASS**.
  795 node tests / 143 CT green; ephemerality pinned at the SHARED source all four planes read
  (`message_variants.content`, D26) plus the mutation route — not four verb-level round-trips.
  **Deviation ACCEPTED:** the leg runs before the token FIT, not after — which is ST's own order
  (`script.js:4475-4501` precedes `getMaxPromptTokens()`) and the better arm, because stripping
  before the fit is what makes "strip it from the prompt" actually buy context back.
  **⚑ TWO FORKS IT RAISED, both boarded not built:** (1) ST derives a ROLE scope from the
  placement; our persist-time legs can't, so `PROMPT_HISTORY` hits ALL history rows — a role axis
  is a later two-member split, deliberately not a silent difference. (2) The card lift
  accept-and-DROPS an imported card's flat `minDepth`/`maxDepth` rather than mapping them onto
  `historyDepth` (ST scopes them on placements meaning something else here) — **the only place
  ST's stored depth data is currently discarded**; re-scoping is one chip in the editor.
- **LIVE NOW (cap 5):** GATES3 (`ac3f82aceafab7894` — nullable-`ne()` · NUL-bytes-in-source · the
  hosted-keyword lock) · DBFIX (`a423c577e9d55294a` — databank ingest concurrency, the D117
  contradiction) · STRUCTOUT (`a8be7d2d06f5157b0` — the nullable-union wire mode gets a real
  config home; **D126 allocated**) · OBSCLOSE (`a02d4bfd89a9321f0` — I-7's last three spans, to
  close that initiative outright).
- **OWNER RULINGS (dawn):** databank KEEPS its rail section (fork closed) · tag manual reorder
  NOT lifted (premise challenged: `tags.sortOrder` exists but a global manager may not want it
  — TAGSORT audit queued, do not delete blind) · prompt-ephemerality **now BUILDING** via
  HISTLEG (supersedes the accept-and-rename REC) · regex extras = bulk edit + debugger +
  per-script JSON door, **NOT presets** ("we made regex part of presets kinda").
- **PUSH-READY IS STALE** (declared at 85; HEAD is 101+ past origin) — a fresh `verify --push`
  is owed at quiesce before asking for the word.

### SWEEP SEALED (`d2b73def`) — 6 defects found-and-fixed + the REAL mock-vs-rendered pass
Fixed: the config CONTEXT pane said one fact TWICE (NIGHTFIX's new header re-printed the body's
title — it REBUILT the F-12 defect registry-contracts.ts names verbatim) · both CONTEXT bands
painted a different voice than the LIST band on the same 48px horizon · databank's band said
generic "Details" colliding with CONTENT's own group · a databank readout row spread 1392px in
a 1440px pane · the picker's ordered slice carried NO RANK numbers · **the Add-a-document
upload arm had ZERO buttons — Esc/backdrop was the only exit**. All red-first, 150 CT green.
MOCK-VS-RENDERED done properly: 18 frame pairs (`reports/snaps/mvr-*`) with per-element delta
tables classified rendered-wrong / mock-stale-sanctioned / deliberate-with-cite.
**⚑ NEW OWNER FORK — mobile config lands on the WELCOME, not the roster** (the mock says "the
roster IS the screen"): `resolvePanelMode` makes mobile never dock a LIST *shell-wide*, so the
fix is either a shell-law change (every section) or config rendering its roster into CONTENT
on mobile (two homes for one roster). Lane did NOT improvise. REC: config-local.
**FLAGGED, not fixed:** SwitchField anatomy differs CONTENT vs CONTEXT (shared forms-tier
component — own lane) · COLLECTION_WINDOW_MAX_HEIGHT is a fixed cap where a pane-relative one
belongs (~485px dead at 1080) · **`databank.createFromText` CONFLICTs while another ingest
runs** (a second document is refused server-side; client shows a generic toast — workloads
lane) · **documents can park in `Queued` forever** (3 of 7 in the seed; the 5-min stall hint
fires on DETAIL but the LIST row says nothing) · character-opening inline `<code>` renders
with UNGENERATED classes (the Streamdown-root-seal class) · listScriptUsage still 3× per batch
· an inherited app-shell CT red (proven pre-existing at HEAD).

**⚑ MOBILE-ROSTER FORK — OWNER RULED (08-03): NEITHER offered arm; the CONSISTENT rule.**
Owner: "what would be the cleanest most consistent option? do it properly without making a
singular exception." The finding was mis-framed as config-vs-shell — the truth is chats and
characters ALREADY do the right thing on mobile (list is the screen → tap → container-queried
PUSH-detail with a back row, the SE-A arm), and config + databank are the DEVIATIONS. RULED:
**one shell rule — on mobile, a list-bearing section with NO selection shows its LIST as the
screen; selecting pushes to CONTENT with a back row** — applied by the shell to every section
that declares a list. That REMOVES two exceptions instead of minting a third, and it is what
`mobile.html` was drawing. Lane MOBILE queued: resolvePanelMode (shell-store.ts:372) + the
push-detail seam + per-section CTs at the mobile frame (config · databank · chats · characters
· corpus regression) + the mock frame re-compared.
