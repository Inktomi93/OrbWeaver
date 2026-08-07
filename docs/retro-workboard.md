# Retro Workboard — the live board

> **THIS IS THE WORKING DOC** (owner-stated). Not law, not a deliverable — the durable state an
> orchestrator resumes from cold. Authority for LAW = `docs/architecture/core/**`; the D-ledger
> (`Core-Path-Registry.md` / `Core-Laws-and-Precedents.md`, current through **D128**) wins on ANY
> conflict. `docs/architecture/proposed/**` is pre-rollback REBUILD REFERENCE — never cite its status
> as current.
>
> **CURRENT-STATE ONLY, INITIATIVE-SHAPED.** When a block goes stale, REWRITE it — never stack a new
> session layer on top. Rewritten in full 2026-08-03 (the line-by-line audit close: every claim in the
> \~3,500-line accreted board was classified DONE-PROVEN / OPEN / STALE / UNKNOWABLE against the tree
> and git; only proven-done work was removed from the live board). **The audited archeology — every
> struck block, snapshot, lane seal and receipt from 2026-08-01 through 2026-08-03 — moved intact to
> [`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md).** Nothing was
> deleted; things moved. Prior baselines: `git log docs/retro-workboard.md`.

## ═══ WHY RETRO EXISTS — the north star ═══

Read `shitsfucked` at the repo root (the post-mortem). Main's own ledger, verbatim: *"We are tired of
hunting down invisible bugs. **Everything must be proven.**"* The disease it names — **features that
looked done and silently weren't** — is the thing this rebuild exists to kill. The posture is **drive
it live, then pin it**. 2026-08-01 proved it: one owner dogfood day found \~20 real defects, every one
fixed at its ROOT the same day, five whole bug CLASSES made unmakeable. Judge every "done" against
that frame — a row that says "merged" is not a receipt; a sha, a symbol, a registered gate, a running
test is.

Global **KISS/YAGNI are SUSPENDED here** — build the maximal, most-provable version
(\[\[kiss-yagni-suspended-build-maximal]]). Package cake: kit ← contracts ← db ← server ← client +
sealed ui; one-directional flow (rpg ↔ chat only via injected ops). Read
`docs/architecture/core/AGENTS.md` IN FULL before any work.

## ═══ STANDING LAWS (the posture — all owner-set, all still in force) ═══

- **Cap FIVE concurrent lanes** (owner raised it from three, 2026-08-03, to burn the almost-done
  initiatives to CLOSED; the original three-cap came from "six ate our usage too fast" — five is the
  tested ceiling, six is not). **ONE COMMIT per lane**, terse
  message drafted in seconds; receipts go in the final report, never the commit message.
- **Merges** `--no-ff --no-verify` on branch-side hook-green receipts — BUT any branch certified
  BEFORE sibling merges landed gets a consolidated `pnpm check` on the merged result (caught reds
  three separate nights). Merge → SEPARATE verify call → THEN teardown, never chained. `git -C <ABSOLUTE-main-path>` on every merge/verify command.
- **GRADUATION NEEDS THE FRESH LENS, not just the static check (owner catch 2026-08-07 — a whole
  session of merges shipped without it):** every non-trivial merged work-stream gets a fresh-context
  `verifier` pass (code lens) and/or `side-eye` (rendered lens) BEFORE its row is called done —
  at CHUNK granularity, one per work-stream. The lane's own receipts + `pnpm check` prove structure,
  never logic. Batch verifiers behind merges when load demands, but the row stays un-graduated
  until the lens reports CONFIRMED.
- **NEVER push to origin without a fresh per-push owner word.** Not overnight, not on a green battery,
  not "the word was banked yesterday".
- **Overnight full-auto**: proceed through the queue, escalation ladder (stickler → ast/code → docs →
  judgment) instead of blocking questions. Blocking only for destructive/irreversible, owner-sacred
  (persona pin), origin pushes, genuine scope pivots.
- **Every UI build gets its side-eye, and ALL side-eye findings get fixed** — never just the top ones
  (\[\[side-eye-fix-all-findings]]).
- **Gates land on a FIXED tree**: a new gate's live violations get FIXED in the same lane; allowlists
  are for permanent deliberate exemptions with a reason + stale arm, never debt parking.
- Board commits are `--no-verify` (owner word); code merges keep the hook. D-numbers are allocated at
  DISPATCH when two live lanes both mint.
- Lane floors MUST name their playwright CT files explicitly — **not because the push bar skips them**
  (it does NOT: `tests:node` runs `pnpm test`, which is the vitest projects `&&` `pnpm test:ct --retries=2` — ONE behavioral lane since 2026-07-17, stated in `scripts/verify/registry.ts:304`), but
  because a LANE is banned from running the whole battery. A CT nobody names is a CT that lane nobody ran.

## ═══ STATE (2026-08-07 — the identity build landed; the queue below is live) ═══

> The 08-08-dawn and 08-07-late STATE blocks, with every lane seal, merge sha and verifier verdict from
> this session, moved INTACT to [`docs/history/retro-workboard-2026-08-07.md`](history/retro-workboard-2026-08-07.md).
> Nothing was deleted; it moved. This block is current state only.

- **✅ THE CANON-IDENTITY BUILD IS COMPLETE AND FRESH-LENS VERIFIED.** Design:
  `docs/reviews/stickler/2026-08-08-canon-message-identity.md` (931 lines) — all six §18 owner calls
  ruled, all three confirmed defects fixed. Landed in four legs: the SPINE (`dde07f52c` — `MESSAGE_KINDS`
  + `MESSAGE_KIND_POLICY` + `messages.kind` + variant `rawContent`/`macroFreezes`, one baseline squash) ·
  the ORPHAN-DIGEST PRUNE (`3d19fd66a` — F-A's second half: hiding rows SHRINKS the ingest set and a
  position-keyed digest of vanished blocks survived; the cascade is ceiling arithmetic, not machinery) ·
  the DISPATCH FAN-OUT (`c9f33c9b4` — seven sites; **a real user-visible fix: narrator rows were reaching
  the wire prefixed `Group: ` / `Aria: `, crediting one cast member with the whole cast's narration**) ·
  the FREEZE RECORD + replay (`c197ce01b` + `16bb934a1` — and every content writer now clears the
  provenance pair, so the invariant is true in the DB, not just stated).
- **✅ THE DAY'S OTHER MERGES:** MOBILE legs 1-4 (the one-shell rule + the topbar budget) · PHONE-COMP
  (the phone is COMPOSED, not compressed — shared coarse-pointer constants) · DRAFT-POLISH legs 1-2
  (draft visuals + group-draft identity) · STACK-MODES legs 1-3 (`pnpm stack dev|prod` + `--debug`
  overlay + the spawn lock) · TEMPLATE-CENSUS + fix leg (framings preset-homed and typeable) ·
  RULED-BATCH legs 1-3 (pipeline order declared once; day/time nullability split) · WIRE-SINK ·
  ABORT-LEAK · SMALLS-BATCH · SMALLS-3 legs 1-2 · FORKSTRIP + RPGFORK (**two live host-plane
  exposures closed**) · GATEFORGE (four gates, **189 → 193**) · VITE-MAX (salvaged).
- **⚑ IN FLIGHT:** lane **NARRATOR-LIVE** — a dogfood-shaped LIVE drive of group narrator mode (hosted +
  local vLLM arms) answering "does it demonstrably work end-to-end now that the fan-out changed what the
  model sees?" Verdict → `docs/reviews/misc/2026-08-07-narrator-live-drive.md`.
- **NOT PUSHED:** ~72 commits ahead of `ab55c112e`. The push word is the owner's, fresh, per push.
- **LEDGER:** through **D132**. **D133 + D134 drafted-not-minted** in
  `docs/reviews/security/2026-08-07-{fork,rpg-fork}-host-plane-strip.md` — batch at the next ceremony.
  **D129(G) owes a wording amendment** (owner-ruled): it says the shape dispatch "replaces" the bare
  `role === "system"` drop; the tree needs BOTH gates (ST imports mint system-role canon rows that are
  `standard` kind; `CanonRow.role` is a two-arm union). Reasoning in-source at `entersPrompt`.
- **WORKTREES:** `agent-a62e9f121c7999904` (TEMPLATE) held warm — it holds the PROMISED (b) templating
  unification build, which goes to it and never a sibling (shared `promptConfig.prose` storage).
  `agent-a05506306bb96c8c5` (STACK-MODES) is graduated and reapable. A stale
  `.cache/snap-stage/c3757975c90e` worktree entry wants pruning.
- **GATES 193.** Battery last green at 10,364 vitest+CT (`853ce611a`, morning) — a fresh `verify --push`
  is owed before the next push.
- **⚑ OWED BY THE OWNER (nothing is blocked on me):** the push word · the two `JUDGMENT_DEFERRED`
  geometry rulings for side-eye (`rpg-pack-rows.tsx:39`, `rpg-actor-trackers.tsx:251`) · PHONE-COMP's
  solo call (dropping the band's vitals orbs at coarse) wants a side-eye eye · the phone
  unread-indicator (registry-shaped) · `{{note}}` warn-vs-block posture · the draft-mode design pass
  (P1 nav-away discards a composed draft) · whether the templating (b) unification goes now.
- **THE DAY'S NUMBER:** 12 fresh-lens passes, **8 refutations** — every one already merged, gate-green
  and believed done. Six premise-kills by lanes, three against briefs the orchestrator wrote.

## ═══ INITIATIVES ═══

### I-1 · STRUCTURED OUTPUT — ✅ the four projector defects are CLOSED; one owner item remains

**Landed under it:** RESYNC-OR (`d432ed51` — the structured role sends ONE FORCED TOOL CALL, the D112
vehicle; both rpg write paths now speak one dialect; probe matrix receipted) · STRICTFMT + CUSTOMBYO
(`35014699` — the kit stops INVENTING `strict`; it rides only when the caller sets it; vLLM pins it at
its own call site, the xgrammar lever) · the vendor-docs research (`docs/reviews/misc/2026-08-03-
structured-output-docs.md`).

✅ **CLOSED by SCHEMA (`c92b7aeb`):** all four unsupported keyword classes now stripped per-wire-subset
by one `scrubWireSchema` engine (four modes); `parallel_tool_calls:false` + a loud extra-call warn;
**refusals READ on both roles** (a refusal used to log `ok:true`). Absorbing three drifted hand-rolled
walkers found a live bug on the way: vLLM's wasn't position-aware, so a field NAMED `title`/`default`
was being deleted from the guided wire.
**Still true, deliberately:** `WireTool` (`infra/providers/contract/chat.ts`) has no `strict` field, so
the forced-tool vehicle carries no grammar-level enforcement — the D112 vehicle is a SHAPE contract,
not a compiled grammar. Say it that way; do not claim otherwise.
**Rides it:** `engine/chat-completion.ts` holds a SECOND `response_format` builder that never emitted
strict (SM7 flagged, deliberately not touched).
✅ **OWNER FORK CLOSED + SHIPPED (D126, lane STRUCTOUT `ffd3b4b4`).** Owner: *"i kinda wanted it to be
somethign we could swap to if we wanted or like a config thing etc. I dont want it to be seen as dead."*
The nullable-union arm is now **Settings › Admin › Structured output → "JSON-Schema shape"**, an
AppSettings-tier knob (DB override wins) reaching `scrubWireSchema` on the real request. **Default
unchanged.** Full receipts in the RECONCILIATION block at the foot of this file.
✅ **I-1's LAST ITEM RULED 2026-08-07 (question-tool): KEEP THE CURRENT DEFAULT** — the owner flips
the knob when he's felt it (vLLM already pins strict at its own call site regardless). I-1 has NO
open items. Blanket-vs-capability already ruled: KEEP BLANKET.

### I-2 · DATABANK — S1 shipped; S2's tail + S3 are the open work (no live lane)

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

### I-3 · CONFIG WORKSPACE — ✅ the rail + the MOBILE tail are DONE; presets-into-rail is owner-timed

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

- the HOST per-room broadcast toggle, viewer-last precedence), ORDER pins, 2211 node + 314 CT · REGPAR
  the paneside tester + ST disabled-POLARITY fix (`1a9687bf`) · REGORDER all four scope-order arms
  authorable (`e2d4087f`) · REGROSTER the attached-by rosters + `resolveVisibleRooms` (`6df02b16`) +
  its rename-freshness gap fixed direct-on-main (`930955e4`).
  **Receipt the portability cross-link held:** `PORTABLE_KINDS` in
  `packages/contracts/src/portability/index.ts` carries `"regex"` — REGEX did NOT become the next PORT-F1.

✅ **REGX2 LANDED (2026-08-07)** — bulk edit · the pipeline debugger · the per-script JSON door. **NOT regex
presets** (owner: "we made regex part of presets kinda" — the preset carrier already IS the named-set
mechanism); no preset arm was built.
· **BULK EDIT** — 3 batch verbs (`bulkSetScriptsEnabled` / `bulkSetScriptsGlobal` / `bulkRemoveScripts`),
each ONE owner-scoped statement with ONE audit + ONE `regexChanged`; foreign ids DROPPED, never thrown on
(the count is the same for "not yours" and "already gone", so a batch cannot probe ownership). Mode entry is
a new `CollectionContribution.bulkSelect` DATA field the config band renders (C-4: band chrome is the host's,
the bar and checkboxes are the owner's) — generalizes to tag/world-info, documented in the contract.
· **PIPELINE DEBUGGER** — a second section in the member editor ("In the pipeline"), NOT a new pane: the
workspace has three slots and no library-level tool slot, and minting one is a second chrome grammar. Sample

- leg in, the global tier's ordered run out with per-stage before/after, the subject marked in place, and the
  executor's own skip reason named per script. It DOES honour the run gates — the tester one section up
  deliberately does not, and both headers say so, because unifying them destroys whichever question loses.
  · **JSON DOOR** — `regex.exportScript` / `regex.importScriptFile`, both THIN ARMS over the bundle
  descriptor's own verbs (export shares its file projection; import IS `createImportRegexScript`).
  **⚑ SUPERSEDED RULING, recorded:** `lifecycle-portability.ts`'s regex cells said "O-2 class… no evidenced
  demand for sharing one script standalone" and `collection-contracts.ts` cited them; the owner's REGX2 ruling
  IS that demand, so both flipped to real `DoorSpec`s + `chrome:"band+kebab"` and both headers were
  truth-repaired in the same commit.
  **DEFERRED with a reason — bulk PLACEMENT add/remove.** `withDerivedTierFlags` (the owner-ratified X-1/X-2
  finding) derives the tier flags + `historyDepth` from a placement set at ONE **client** write boundary, so a
  server bulk placement verb would be a second derivation home. It unblocks when `deriveRegexTierFlags` lifts
  into `@orb/kit/regex` beside the masks it mirrors — boarded separately.
  **Rendered receipt (done ≠ rendered):** the bulk bar was verified BROKEN twice at the real 330px roster
  column before it shipped — five inline verbs clipped "Run everywhere" mid-word and pushed two verbs AND the
  clear button off-screen; three verbs + a kebab still ran clear 22px past the edge. Shipped shape is two
  inline verbs + one kebab (global pair + Delete), with a standing geometry pin asserting every control's box
  inside the bar's.
  ✅ **TAGSORT AUDITED + RULED (2026-08-03) — KEEP BUT NARROW. The owner's premise targeted a surface
  that never read the column.** He challenged manual tag order with *"this is an overall global tag manager
  across our entire lib"* — and the evidence says the surface he meant, the character-library folder-grouping
  sidebar (`features/character/lib/character-list-view.ts:52-74` `groupByTag`), **does not read `sortOrder`
  at all**: `RowTag` does not even carry the field, and groups sort by `name.localeCompare`. Same for pending
  tag suggestions (`character/persistence/queries.ts:270`, name only). So the objection is resolved by
  evidence, not by deleting anything.
  **Every reader (AST-confirmed, both languages scanned non-zero, grep-corroborated, zero disagreement):**
  `tag/persistence/queries.ts:39` `listOwnedTags` (`ORDER BY sortOrder IS NULL, sortOrder, name`) →
  `tag.listTagsWithUsage` · `character/persistence/queries.ts:387` `canonicalTagsFor` → every character
  summary's `tags` array · `tag/verbs/export.ts:17` (round-trip only, not a distinct decision). **No `.tsx`
  reads it** except the write hook.
  **Surfaces that can actually SEE it:** ONE primary — the tag-management collection rows
  (`features/tag/components/tag-collection-rows.tsx:75-81`, drag → `useSetTagOrder`), and ONE passive echo —
  tag-CHIP order on character cards (`character-card.tsx:75` + dossier + quick-picks), which render the
  server's array order with no client re-sort.
  **RULED:** keep `sortOrder`, its write verb and the sortable rows as-is — a real, bounded, actively-used
  affordance. **Do NOT extend it anywhere else** (not into `groupByTag`, not into suggestions); those already
  made the better call. Removal would cost only alphabetical-instead-of-curated on those two surfaces —
  survivable, but a real regression on a purpose-built UI, for no gain.
  **⚑ THE ONE THING THAT NEEDS THE OWNER'S EYES — the 30-of-400 ratio.** The drag arm is capped at ≤30 items
  (`COLLECTION_LARGE_GROUP`, `collection-contracts.ts:39`); above that the same order renders in a read-only
  `VirtualList` with NO drag affordance. At his stated \~400-tag scale that means **manual ordering is
  unreachable for \~92% of the library, while still silently deciding chip order on every character card.**
  That is not a bug and the cliff was a deliberate owner-flagged fork — but it is worth his explicit ruling
  now that the numbers are on the table.
  **Audit limits (stated):** packages outside server/client not exhaustively enumerated (none found);
  non-TS consumers (raw SQL/seed outside `db/src/schema`) not searched.
  ✅ **TAGDIG — the full tag-experience audit vs ST + neo (2026-08-03).** Report:
  `docs/reviews/misc/2026-08-03-tag-experience-audit.md` (gap register by theme, every `-l ts`/`-l tsx`
  sweep run in PAIRS with scanned-file counts; neo read via `git archive legacy-main` into scratchpad,
  never checked out; a false-negative self-corrected mid-audit — a bare-identifier pattern returned 0/0
  and looked like absence until `$X.folderType` found the real site).
  **Sort-by-most-used CONFIRMED CHEAP (S, zero server cost):** `listOwnedTagsWithUsage`
  (`domain/tag/persistence/queries.ts:288`) already returns `usage.total` in every payload the client
  renders — it is a client comparator + a mode `Select`, mirroring ST's `tag_sort_mode`.
  **RANKED WANTS:** (1) sort mode Alphabetical/Most-Used, default Most-Used — S · (2) **autocomplete on
  the tag-attach input** (`components/tag-picker-dialog.tsx` is a bare `Input` with NO suggestion list on
  BOTH neo and main) — S–M, the highest value-per-effort row: at \~400 tags it is what prevents
  duplicate-tag rot, and the data is already cached client-side · (3) tag EXCLUSION / three-state filter
  (ST has `toggleTagThreeState`/`FILTER_STATES.EXCLUDED`; **neither lineage ever built it**) — M, needs a
  new axis threaded through `LibraryFilters`/`filterByChips`. Past #3 is L and changes the browsing MODEL
  — separate owner decision, not a queued build.
  **WE ARE AHEAD OF ST in one place:** the pending-suggestion Accept/Reject review queue
  (`character-tag-suggestions.tsx` + `tag/verbs/list-pending-suggestions.ts`) plus the LLM auto-distill
  producer (`discovery/verbs/distill.ts`) — ST has no equivalent.
  **DELIBERATELY NOT COPIED (with reasons):** ST's DUAL tag lists (local organizing tags vs a separately
  authored "tags to embed" export field — a known confusion source in ST itself; our WYSIWYG
  accepted-tags-are-what-exports model is better) · a user-facing AND/OR toggle (ST hardcodes
  `const TAG_LOGIC_AND = true; // switch to false…` — config-via-source-edit; AND is the right default and
  per-tag exclusion covers the real "not this one" need).
  **⚑ OWNER TASTE CALLS:** standalone tag-only backup/restore button (REC skip) · import-time
  Ask/All/Existing/None vs our always-queue model (REC keep ours, it is strictly more capable — record as a
  deliberate divergence) · **whether Manual/`sortOrder` retires once Alphabetical/Most-Used ship**, given the
  ≤30 cap already makes it near-unreachable at \~400 tags · folder OPEN (collapsible, cheap) vs CLOSED
  drilldown (navigation-model change) — REC build OPEN, defer CLOSED.
  **Not covered (stated):** anti-troll import cap, non-English locale completeness, mobile/touch behaviour.
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
**⚑ OWNER ITEMS on this initiative:** ~~the absent-character transcript import policy~~ — **RULED
2026-08-07 (question-tool, owner OVERRODE the characterless-chat rec): REJECT — "you shouldn't be
able to import a transcript without having a character selected." A character must be selected at
import; the characterless arm is dead, O-6's premise with it. R6 builds against this policy.** ·
the JSON-card export format (PORT's recommended home: `?format=png|json` on the existing character door) · F9's design fork
for the chat-anchored planes that are unportable by construction (rpg campaigns · injections · room
overrides · re-links; plus automation\_rules / global\_variables / plugins, which have no arm at all).

### I-7 · OBSERVABILITY — ✅ CLOSED (2026-08-03, lane OBSCLOSE)

**Landed:** OBS (`93e40fb1`) `addSpanEvent` wired across cache / retry / wake with trace-ring landing
proofs; the ratchet baseline is EMPTY. SM4 (`f46122ad`) the rpg round TRACED (`withRequestSpan` needs
`root: true` — a parented span never seals the ring), `provider.*` spans at `runRole` (all 9 role
dispatchers, so `providerDurationMs` finally lands), structured-retry `onRetry` injected.
**CLOSED by OBSCLOSE (`521b8343`):** all three named holes — `fireExpressionClassify`,
`fireRpgTurnAborted`, the post-turn memory pass — plus a FOURTH found in the same sweep
(`fireManagedCompaction`, identical fire-and-forget shape) now open their own DETACHED root
(`withRequestSpan(…, root:true)`, SM4's template). The rest of the file was swept: no other
outlives-the-request siblings (`markRpgDiceEligible` is sync; the bus fans don't outlive their
request). **The correctness find that mattered more than the spans:** memory + compaction `catch`
blocks SWALLOWED their error after warn+emit, so the new spans would have sealed `"ok"` on every
failure — an observability hole wearing observability's clothes. Both now rethrow (the outer
`.catch(() => undefined)` still absorbs). 7 landing proofs through the real trace ring
(`recentTraces`, driven from inside an outer request root, asserting rootName + requestId prefix +
status + `requestId !== OUTER`); 167 tests green across the three engine suites. Consolidated
`pnpm check` on the merged result: 14/14.

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

### I-9 · CEREMONY + DOC GRADUATION — CLOSED, then RE-OPENED by the day's law (D133/D134 drafted; D129(G) owes an amendment)

- ✅ **D129–D132 MINTED (ceremony batch, 2026-08-07)** — the four laws the last two weeks earned:
  **D129** canon message identity (kind is DECLARED · kind never decides the canon role · hidden means
  hidden in every DERIVED plane · the absent trigger is unrepresentable · the fan-out is COMMITTED,
  not yet built) · **D130** the hand-edit/turn-write REBASE reconciliation (locks arbitrate, carried
  data can never resurrect a removal, both losing arms loud) with the tombstone + regen-vs-later-flush
  residuals recorded AS DECLARED LIMITS · **D131** the handoff PROPERTY OFFER (AMENDS D64 — the drop
  is the default and the decline path; copy-then-swap crash contract; idempotent by provenance;
  avatars re-owned; personas never copied) · **D132** templates have ONE home and it is PRESETS (the
  prose slot registry; turn-wire prose → preset, no-preset-in-scope prose stays per-user, which
  PRESERVES D107's imagery ruling; a source `const` is not a home). Both range headers + the master
  enumeration updated; `check:docs` clean, `check:structure` 190/190 incl. `d-citation-integrity`.
- ✅ **REFUSED, with reasons (a refusal is an outcome):** the BUGATES surface-manifest flag — **already
  minted as D128**, same founding instance and same counts (39/292/269), so the board's "owner call,
  unminted" line at the 08-07-late STATE block is stale, not a gap. And
  **CONSOLIDATION-LANDS-WITH-ITS-FENCE** stays a board row, not a D-entry: its founding instance (the
  founding-cast fence) is OWED, and the house rule is that a law waits for its enforcer
  (D41's no-code-without-an-emit-site, D72's mint-migrate-SEAL).
- ✅ **D125 MINTED** — the fifth regex leg (`PROMPT_HISTORY`, amends D121-E), from HISTLEG's report.
  Both range headers + the master enumeration updated (which was itself behind: D123/D124 had never
  been appended to `Core-Laws-and-Precedents.md:62` — backfilled in the same edit).
  **HCOPY's D-entry, the initiative's long-running survivor, is D131** — its lane report did not
  survive as a file (`reports/` holds only its README), so the entry was re-derived from the built
  tree (`substrate/handoff-copy.ts` + `character/contract/handoff-copy.ts` + the swap batch).
- ✅ **Graduation move DONE (08-03):** the 36/36-ACCOUNTED preset-execution crunch list graduated to
  `docs/history/reviews/misc/`; its three inbound refs repointed. (The board's "that dir is EMPTY"
  claim was stale — it already held six graduated reviews.)

### I-11 · CONTAINERIZE-THEN-TEST — owner-sequenced AFTER this board drains

**Owner intent (2026-08-07):** the Dockerfile gets modernized once the workboard is done, and only
then does the live-safety testing happen. Sequencing is deliberate and correct: **the container IS
the mitigation**, so testing the current posture measures something about to be replaced.

**The fact that frames it:** orbweaver is NOT containerized — Caddy runs in Docker and
reverse-proxies `orbweaver.inktomi.tech` → `host.docker.internal:8788`, but the app is bare node on
the HOST as the owner's user. Reach of any file-write/traversal bug = the whole home directory
(repo, `.env`, backups, `~/.ssh`, the vLLM fleet). Containerizing turns that into a scratch volume.

**Design already ruled (do not re-derive):** test a prod-shaped CLONE on an offset port with a db
copy (the STACK-MODES prod launcher makes this cheap), never live prod — so destructive findings
can be CONFIRMED · the agent gets its own bridge network with a firewall egress allowlist to exactly
the target ip:port, no DNS (pinned `/etc/hosts`), no repo mount, time-bounded, kill-switched · **the
cage needs POSITIVE CONTROLS BOTH WAYS before any result is trusted** — prove it cannot reach the
LAN/vLLM ports/docker socket AND that it CAN reach the target, else "no findings, stayed in bounds"
is unfalsifiable (the four-lying-instruments law applied to the fence) · ALL of it routes to
`security-executor`, never the main session, never Fable.

**Known debt to burn BEFORE hunting (so findings are news, not debt):** the un-containerized app ·
`DEBUG_TOKEN`/`WIRE_CAPTURE` armed in the live `.env` (standing owner action) · the debug gate's
admin arm PRECEDES the token check — 200 unauthenticated under single-user; whether OIDC changes
that must be PROVEN, not assumed · secrets readable at repo root · the 1GB Caddy request body as an
upload surface · the origin IP is public (A records unproxied — Cloudflare DNS-only) · the h3/UDP-443
launch item. Cheapest first step when the time comes: a read-only perimeter inventory (what listens,
what Caddy exposes, real response headers, whether `/api/_debug` answers from outside, TLS/h3 state).

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

- ✅ **Square-glyph Button sweep — DONE** (merged `d0a9443b6`/`3ce7e3dfe`: square-glyph size ramp + TrackBar width variant; `ui-size-via-variant` baseline reached terminal `{}` — the 14 rows PAID).

- **Per-actor tracker grant/revoke EDITOR** — `sheet.trackerGrants` / `trackerRevokes` exist and gate
  NPC tracker applicability, but NO client editor exists. The owner's "keep explicit-list-only"
  NPC-grants ruling is a DEAD LETTER until hosts can edit the list. **Re-flagged by the archive tail
  audit (T-11), which trusted the doc's citation rather than re-grepping — a one-minute grep of
  `trackerGrants|trackerRevokes` in `packages/client/src` firms it before dispatch.**

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

- ✅ **`connection.getCatalog` / `getAgentSdkCatalog` — ANSWERED, not dead** (archive tail audit): both are
  called at BOOT to warm caches (`entry/lifecycle.ts:181-191`), and `use-admin-mutations.ts:80` already
  carries the explanation in a comment. Deliberate boot-only readers. No action.

- **`field-reachability` suite ignores a `.ok`** (SM5's flag — non-vacuous, honest-fix-same-shape).

- **L8-inbound:** foreign ST `mes:""` rows at import — declined-by-scope in ANCHOR, a one-liner if
  wanted.

- **The seeder drop-patch STAYS** until the next fixture regen (the committed flagship fixture carries
  durable pre-D124 `mes:""` rows). ANCHOR's "matched nothing" premise was corrected.

- **CPD's 3 opportunistic dup rows** (invites verb+persistence pair · embed-store per-store reads ·
  rebuild-from-canon) — consolidate when next IN the file, no dedicated lane (DRY-not-gospel).

- **TYPO class-A: 27 as-const tuples** stay untagged manual-lens candidates.

- **`staging.ensure` residual** — first-write-wins seeded from HEAD; dormant unless rpg tools ever mount
  as REGISTRY tools again. **Re-verified 08-03:** `chat-ops/gather.ts:194` is still `tools: []`, so the
  dormancy condition holds — a correctly-cited doorway, not forgotten debt.

- **R5b(a) verify:** `refEnumerationLines` (the non-enforcing-backend prompt fallback) should enumerate
  active conditions post-R5a — confirm the R6 build carried it; \~2 lines if not.

- **WAKE-STATUS:** the 3s engine wake is silent (spec accepted the wait); revisit if it feels laggy.

- **`lockdown` §16 G-table deliberately not grown** (CR0's flag — it defers to the live count).

- ✅ **F4-CACHE-VOLATILITY — BUILT, close it** (archive tail audit): `buildFoldedTurnBuilder` calls
  `cacheStableExtractionRefs(refs, config.trackers)` before `buildToolRoundWireTools`
  (`entry/compose/rpg.ts:991-1008`), with a header naming it *"F4 — CACHE-STABLE REFS ON THIS VEHICLE
  ONLY … option (b)"*. Option (b) was picked and shipped. No action.

- **`E2E_LIVE=1 pnpm e2e`** is owed on a push window (never re-confirmed since the era's start).

- **Lifted from the archived 08-03 blocks (still live, re-homed here 2026-08-07):**
  the **17 `.mjs` probes → `.ts`** conversion (they escape every type program; bare-node runnability
  died with tsx) · the **node-26 §8 ADOPT/AVOID gate** (LAST leg of that program; W1–W5 all merged) ·
  `.claude/hooks/biome-check.sh` lints the guard file `biome.json` says to skip (own small) ·
  the **CT-on-our-vite spike** (pnpm override `@playwright/experimental-ct-core>vite: ^8.1.2`; green =
  one vite + ct-config joins the type program; red = revert) · the **surface-manifest FORMAT ping-pong**
  (teach `gen-baseui-surface.ts` to emit biome-format so a regen can't fight `62de12195`) · the
  **tool-round wire blindness** (DOG-ENGINE receipt find: `/api/_debug/wire/captures` cannot see the
  tool-round arm AT ALL — that provider call has no `captureWire` sink, so `update_scene` traffic
  never reaches the ring; one sink at the tool-round call site closes it) · the
  **per-chat connection PHANTOM** (ENGINE, three-way confirmed: `resolve-chat.ts:9-13` declares
  `providerRouting` DORMANT/RESERVED — no writer verb, no UI, and the overlay is doubly dead
  (compose builds providerRouting-only; resolveChat forwards only api/source/model). Reads as a
  capability, is unreachable end-to-end. Deferred-by-intent per its own comment — a feature row,
  not a defect; recorded so no lane re-derives it. The ONLY live lever is the shared
  `routing.roleDefaults` settings row. Also: ENGINE's receipt probe left spec-owned debris —
  `chat_01kzdrdy92exvvmcvx39gefvgc` + character `dogeng-warden-*` — delete at will) · the
  **trust-gated card images doorway** (owner musing 08-08, mechanism pinned: srcdoc iframes INHERIT
  the parent CSP, so per-character trust alone cannot unlock `data:` images today — the door is an
  `src=`-routed card-frame document carrying its OWN CSP headers (per-trust `img-src`), which also
  subsumes the app-blobs-only arm. Costs: a server route serving model HTML (own security
  treatment) + the theme-injection plumbing moves off the srcdoc computed-style mechanism
  (\[\[theme-fidelity-null-origin-surfaces]]). Design fork, owner-timed; the teach truth-repair
  stands correct for today's tree either way) · the
  **narrowest-mount row gate** (side-eye 08-08, the class that produced both P1s + half the P2s:
  a `Row` with a `shrink-0` trailing cluster sized in a wide context and never re-measured at its
  production width — persona row 358px, theme band 256px, model-roles hint, menu gutter. The
  candidate rule: any such row owes a CT at its narrowest real mount asserting the leading text
  block ≥50%. Gate-shaped; report-then-decide per ASTLENS precedent) · the
  **st-goldens re-sweep** (STATLAS found the rig's `rm -rf output` wipes the PRIOR sweep's arm by
  design — only 10 ST captures survive, the 16-combo ST arm was destroyed by the tools sweep; fix
  accumulation (per-sweep dirs or drop the rm), then a full two-arm re-sweep upgrades the atlas §2
  from source-pinned to measured — the doc is structured for that drop-in). **UPGRADED to STATLAS leg 2 (owner word 2026-08-07): rig+comparator fixes + the re-sweep are IN BUILD, capture step held until the battery lands.**

- **CRUNCH (owner-recalled 08-08, recorded so they stop being forgotten):**
  **(a) The injection note-framings are HARDCODED prose** — `[Note from system: …]` / the demote
  wrapper vocabulary in `assembly/injections.ts` is not exposed anywhere an owner can edit (not in
  the preset template tab). PROSE-1 class (\[\[prose-is-user-editable]]): these become host-editable
  data with versioned defaults. **(b) TWO TEMPLATING SYSTEMS — DIRECTION RULED (owner, 2026-08-07):
  templates have ONE home and it is PRESETS** ("not scattered between that and settings or hiding
  in code"). And templates ≠ macros (owner correction, same day): a template is authorable prompt
  TEXT — section templates, framings, wrappers — some of which may pass through substitution, but
  the macro engine is not what's being unified and not the census's subject. The
  census still decides the migration shape + what in the settings arm is genuinely NOT a template
  (per-user knobs that only look template-ish stay, with reasons); lane TEMPLATE-CENSUS's report is
  the unification spec draft, relayed to the lane mid-run. Evidence method: owner sighting,
  unverified counts — the census is the lane's first job. **(c) LEAD, not a row** — cards may stub differently when adjacent to/inside `[ ]`
  bracket framing (the demote-wrapper class); possibly already dead with the CARD-KEEP fixes.
  Repro before believing: drive a card inside a bracket-framed injection through the tokenizer.

## ═══ ARCHIVE-RESCUED FOLLOW-UPS (owner ruling 2026-08-03: a named follow-up goes ON THE BOARD) ═══

> **Why this section exists.** Lanes ended seal blocks with follow-ups they named but did not build; those
> blocks then moved to `docs/history/` with the archeology. **A follow-up that lives only in the archive is
> forgotten.** Owner: *"if it needs follow up it goes on the board, otherwise it gets forgotten."*
> My first pass used a GREP for one exact phrase and the owner correctly called it fragile — lane ARCHIVE
> then READ all 25 docs archived since 2026-07-23 line by line and verified \~45 candidates against the tree.
> Full report + per-document tables: **`docs/reviews/misc/2026-08-03-archive-rescue-audit.md`**.
> **22 of 25 documents yielded ZERO still-open rows** — recorded there so nobody re-reads them.

**⚠ THREE OF MY FIVE GREP-RESCUED ROWS WERE WRONG. Corrected:**

- ~~S6 SEAL not done~~ — **DONE.** Both `SETTINGS_SECTION_ANCHORS` hits are comments DOCUMENTING the
  retirement (`shell-store.ts:79`: *"the old … subset tuple retired with stage 0"*). Zero declarations,
  zero consumers. My existence-check counted prose as code — the exact failure the audit was ordered to
  avoid.
- ~~Icon fill-axis has zero consumers~~ — **STALE.** `FillableIcon` has TWO live consumers:
  `preset-library-row.tsx` (the O-1 active dot) and `components/row-toggle-action.tsx`. Demoted from debt
  to taste; the named adoption targets (F-06 bolt · tracker orbs · meter glyphs · `weight=` emphasis) and
  the unbuilt `iconNode` door for `weave-glyph.tsx` stand as OPPORTUNITIES, not rot.
- ~~MAC macro-union PREMISE-DIED~~ — right outcome, **wrong label: DONE SINCE**, built by lane MACU
  (`95f4c00b`); `withUserMacros` has 7 consuming modules.
- **HELD:** the `PROMPT_MACROS` phantom, and the barrel sweep (measured **56** `export *`, not 60).

> **⚑ MEASURED ROW-ROT: of the 7 smalls dispatched 2026-08-03, FOUR were premise-wrong** (already fixed,
> misdescribed, or — for EMBER — actively harmful to act on). Add the two the same day from other lanes
> (CP-DROPPED-WARN grepped a symbol that never existed; the coverage-gap note contradicted the section
> above it) and **six board rows misdirected six lanes in one evening.** Every one was written from a
> GREP or from a document's own citation rather than a resolution-based check.
> **THE RULE THIS BUYS: a board row states its EVIDENCE METHOD, or it is a lead, not a row.** A row
> sourced from grep says so. A row sourced from `pnpm ast`/ast-grep says so, with the lens. A row copied
> from another document's claim says THAT, and is treated as unverified until someone checks the tree.
> **And every lane's first job is to re-verify its row** — a correct refusal is a successful lane, and
> tonight it was the majority outcome.

### ⚑ LIVE DOGFOOD BUGS — see [`docs/history/dogfood-tracking-2026-08-08.md`](history/dogfood-tracking-2026-08-08.md)

> **CAMPAIGN LIVE (2026-08-07, owner-ordered priority):** that doc is being worked and verified IN
> FULL — every open row fixed or adjudicated, every fixed row's owed test written, verifier + side-eye
> passes to close. Rulings + overnight defaults are recorded IN the dogfood doc; it is the authority
> for its own rows. THEN this board resumes.
>
> **Multi-user/persona:** PERSONA-SEAT-NULL-BINDS-ANCHOR (M) · PERSONA-SEAT-BORN-NULL (S 🟡) · MEMBER-PERSONA-SWITCH (S–M)
> **RPG:** RPG-STAT-ENTRY-REVERTS (M) · CARD-KEEP-ZERO (M) · CARD-TEACH-RECENCY (M) · CARD-TRUST-INVERTED (M) ·
> CARD-EXTERNAL-MEDIA (M) · EXTRACT-BUDGET-DEAD (M) · RUNTIME-VARS-DEAD (M) · CARD-FENCE-LENIENT (S) ·
> RPG-TRACE-DEAD (S) · RPG-NO-PROMPT-DEBUG (L)
> **Assets/UI:** BARE-HASH ASSET 404s (S) · DRAFT-PHASE ROW AVATAR (S) · D44 GRAIN TEXTURE (S) · CREDENTIAL STORAGE SILENT FAIL (S)
> **Mobile:** MOBILE-THEME-SELECTOR (S)

### BOARD THESE — still-open, ranked by value-per-effort (paste-ready from the audit)

- [ ] **PRESET-SLIDER-VERIFY** (S) — the preset program CLOSED without the re-verification its own crunch
  list demanded: *"Re-verify the slider deck on a vLLM/OR connection before closing the program"*
  (sonnet-5 exposes no sampling knobs, so the deck was never seen rendered).
- [x] ~~**CP-DROPPED-WARN**~~ — **PREMISE WAS WRONG; the row grepped a symbol that never existed.** The code
  is `custom_parameters_ignored`, not `custom_parameters_dropped`: declared at
  `infra/providers/contract/resolve.ts:27`, emitted by `withCustomParametersDrop`
  (`openrouter/runners/chat/shared.ts:343-357`), folded by BOTH OR chat runners
  (`chat-completions.ts:288`, `responses.ts:476`), asserted by two tests. **It could not have been
  missing at any point since the `warning-code-coverage` gate landed** — that gate REDs any
  `WARNING_CODES` member with no emit site and an empty `deferred` map, so a zero-hit member is
  structurally impossible on a green tree. Nobody need hand-verify this row again. It cost a lane its
  opening. **Superseded by INFRA-WARN-DEAF, which is what it was actually pointing at.**
- [x] ✅ **INFRA-WARN-DEAF — DONE** (merged `0f39aa62b`, reader `1dbad4ca0`: infra runner warnings reach the user, ONE passenger as ruled; the residual NINE codes stay owner-gated on copy). Original: **`ChatResult.events` has ZERO production readers, so all TEN
  infra `WARNING_CODES` reach the logs and never a human.** `createRunChatTurnBridge`
  (`entry/compose/chat.ts`) awaits the result and reads only reply/reasoning/usage/…, never `.events`;
  `TurnStreamChunk` (`domain/chat/contract/results.ts:197`) is `text | reasoning | final` with no
  warning arm; `ChatRequest.onEvent?` has zero wiring outside the backends. Receipt: `ast-grep '$X.events'`,
  scannedFileCount **1994**, every hit a runner BUILDING the array or a test — no reader.
  **D41's no-silent-degrade is satisfied in the type system and violated in the product.**
  The surface itself WORKS and the IMAGE role proves it (`entry/compose/imagery.ts:43` guards the infra
  code down, `chat/verbs/generate-image.ts:26` re-maps to a `ChatWarningCode`, rides the bus to
  `apply-chat-bus-event.ts:47` → toast) — only the CHAT role's infra→domain hop is missing.
  **`warning-code-coverage` is blind to this BY CONSTRUCTION: it ratchets the EMIT, never the READ** —
  that limit belongs in the gate's header, and a reader-side arm is its own lane.
  **Ruled:** build the pipe now with ONE passenger (the customParameters drop); **the residual NINE codes
  are OWNER-GATED on copy** — each needs user-facing text, and several (`sampling_knob_dropped`,
  `dynamic_context_demoted`) are arguably too noisy to toast every turn. That is a product call, not a
  lane's. Side-eye owed after merge (new toast).
- [x] ✅ **STRUCTURED-ABORT-REASON-LEAK — DONE** (ABORT-LEAK merged 2026-08-07, `3fd54bb09`,
  consolidated check 14/14). Fix home = `roles/dispatch.ts::runRole` (the one seam all EIGHT roles
  cross): `flattenAbortSignal` (`backends/kit/abort-flatten.ts`, the one-home of the re-abort-your-
  own-controller law) + `classifyTransportName` tests the abort NAME before the transient regex.
  `idle-timeout.ts` now composes the shared primitive. RPG-SIGNAL stays (it is the round's own
  cancellation scope; its header's "covers both arms" claim truth-repaired). **MECHANISM CORRECTION
  (the row below was wrong in the middle):** `retry.ts` never re-ran structured calls (chat-runner
  callers only; nothing reads `ProviderError.retryable`) — the REAL re-run vector was
  `@openrouter/sdk`'s DEFAULT `retryConfig` (\[\[vendor-sdk-default-retry-surface]]). Red-first 3/3
  through the real dispatcher. Original row for the record: **a cancelled `structured` call can be RE-RUN as a retry.**
  `classifyTransportName` (`backends/kit/error-classify.ts:92-101`) regexes `/timeout|connection|network|overload/i`
  over an error's name+message → `{kind:"server", retryable:true}`, and `retry.ts` re-runs on that. The
  chat runners are protected — `turnAbortSignal` (`backends/kit/idle-timeout.ts:53-67`) deliberately
  re-aborts its own controller instead of `AbortSignal.any`, with a comment naming this exact bug. **The
  structured role is NOT:** `backends/openrouter/index.ts:279` passes `req.signal` straight to
  `client.chat.send` with no flattening — and that is the arm rpg extraction rides. RPG-SIGNAL is
  flattening at rpg's own seam, which covers rpg only; every other structured caller stays exposed.
  **The general law worth pinning: `AbortSignal.any` propagates the source signal's `reason`, and a
  reason that reaches `fetch` becomes the error your transport classifier sees.**
- [ ] **REGX2** (M) — an owner BUILD RULING that got archived: regex bulk edit + pipeline debugger +
  per-script JSON door (NOT regex presets). Ruled 08-03 dawn, queued, never dispatched.
- [x] ✅ **RPG-ROUND-SIGNAL — DONE** (merged `1b581127b`: the state round is cancelable with its own lifetime, and a cancelled round writes NOTHING).
- [ ] **HAND-EDIT-VS-FLUSH — REPRODUCED (lane live, fix ruled + building): ONE RACE, TWO VICTIMS.**
  Deterministic repro on the real flush gate. The row's suspicion was HALF right: **Arm B**
  (back-to-back assistant turns) — the hand edit IS clobbered: `resolveHead`'s in-place door fires
  on a `latestSnapshot` FALLBACK row from an older slot (contract violation of its own "this turn's
  own draft" doc). **Arm A** (single speaker, the common case) — INVERTED: the hand edit survives
  and the TURN'S own write is silently lost forever (hand rung outranks the turn row at the same
  seq, D124 by design; flush wrote from a base snapshotted at flush START). **RULED (orchestrator,
  from recorded law):** (1) the in-place door only for true turn-rung rows; (2) field-level merge at
  the flush's write boundary — post-`writeFlush` re-resolve, `applyLockedPatch(turnState, handState)`
  honoring the hand row's auto-locks: manual-edit-wins on touched fields, the turn's writes survive
  everywhere else. Last-write-wins was refused (contradicts the recorded manual-edit-wins law);
  refuse-during-flight was refused (blocks the host mid-steer). Red-first pins owed on BOTH victims
  + the same-field-conflict-resolves-to-human case.
- [x] ~~**CONTRACTS-BARREL**~~ — **REFUSED, premise false (SMALLS-BATCH 2026-08-07):** the file is one
  line and already says "placeholder; unused — every consumer imports contracts modules directly". No
  such sentence exists; grep zero-hit.
- [x] ~~**CODEMOD-DOCS**~~ — **PREMISE WRONG (re-verified 08-03).** `package.json:19` already carries
  `"codemod": "node scripts/codemods/codemod.ts"`, and that CLI exists and works (help/list/recipes/
  recipe/search, wired to `codemod-kit.ts`). Somebody added it and the row was never updated.
- [x] ~~**CODEMOD-PATHMAP**~~ — **PREMISE WRONG (re-verified 08-03).** All three of
  `moveFiles`/`deleteFiles`/`copyFile` (`codemod-kit.ts:801-939`) validate via
  `ctx.project.getSourceFile(absPath)` — a LIVE ts-morph lookup, not a stale cache — and `assert()`
  loudly with actionable messages before touching anything. The cache-lie shape is not in current code.
- [x] ✅ **EDITSNAP-OK residual — DONE** (SMALLS-BATCH, `be28928f9`): the `handEdit` fixture now asserts
  `HandDoorResult.ok`; suite 64/64.
- [x] ~~**SSE-SPEC-STATUS**~~ — **REFUSED, premise false (SMALLS-BATCH):** lines 3-4 read cleanly
  ("Status: CLOSED — BUILT S0-S5, D118"), byte-checked with `cat -A`. No corruption on the tree.
- [x] ✅ **L8-INBOUND — DONE** (SMALLS-BATCH, `be28928f9`): blank-`mes`/no-surviving-swipe ST rows are
  STRIPPED at `parseMessageLine` (silent tolerant-strip matches the parser's own corrupt-line posture;
  the module is zero-I/O so no warn is possible), D124-consistent. Test pins it; flagship fixture
  round-trip unregressed (not regenerated).
- [ ] **REGEX-REASONING-FIDELITY — RULED 2026-08-07 (question-tool): fix the DISPLAY** — the
  tester/debugger prints REASONING where it truly runs (post-postProcess); execution untouched
  (instruments must not lie). Dispatched in the RULED-BATCH lane.
- [ ] **FLAKE-WATCH** (S) — `code-editor.ct` CM6 75ms window + `drawer.ct:162` focus-trap (pre-existing at
  HEAD) have no durable home beyond a watch list.
- [x] ✅ **HISTORY-GRADUATION RULE — DONE** (SMALLS-BATCH, `be28928f9`): the "check the paragraphs, not
  just the tables" line is in `docs/history/README.md`.
- [x] ~~**PROMPT\_MACROS phantom**~~ — **REFUSED, premise false (SMALLS-BATCH):** the cited spec line
  (and whole file) never names the symbol; the symbol itself IS dead (two-method absence: `pnpm ast
  refs` no-declaration + one historical comment hit at `client/src/lib/prompt-macros.ts:14`, which is a
  record, not a reference). Nothing to annotate.
- [ ] **BARREL ROOT-FIX** (M) — 56 `export * from` remain across `packages/*/src`.
- [x] ✅ **TSX-SHEDDING MIGRATION — DONE 2026-08-03, all four stages** (receipts in STATE above; the row
  is kept for its rationale). Original text: (`docs/design/tsx-shedding-migration-spec.md`, adopted from the memoban
  session, probe-verified preconditions). **Owner has particular interest.** `tsx` is a RUNTIME dep in
  production — `start` runs `tsx …/entry/index.ts`, so the server's real module resolver is tsx's and
  any divergence from node is an invisible bug class. The whole migration is one hazard: **6,359
  extensionless relative imports** (+ directory imports), fixed by Biome `useImportExtensions --write`
  SCOPED to paths (never bare `--write .`), which then stays on as the permanent enforcer.
  **⚑ THIS ONE RUNS IN A SINGLE SITTING, ALONE — owner-ruled, and SPECIFIC TO THIS MIGRATION, not a
  general orchestration rule.** All four stages start-to-finish from the main session with no sibling
  lanes and no concurrent session: Stage 1's \~6,359-file rewrite conflicts with any other writer, and
  **stages 1–3 without 4 leave a state where GREEN ≠ BOOTABLE** — under bundler+extensions the checker
  still accepts extensionless, so a missed extension typechecks green and crashes at boot with only the
  biome rule in between; `nodenext` (stage 4) makes it a compile error. Verify by BATTERY, not by
  reading 6,359 hunks. **Step zero: inventory what still needs `tsx`** (scripts/dev/\*.sh, package.json,
  probes, codemods, seeds — spec expects zero) and put the list to the owner before flipping anything.
- [ ] **OWNER-OWABLES** — the archived "MORNING OWABLES" list, re-surfaced: the 3 nudge default texts ·
  REGPAR F3/F4/F5 menu · v3-transcripts-reach-new-installs-only · `countByBook` twins · "Untitled chat"
  in the regex rosters.

### BOARD THESE — the TAIL pass (ARCHIVE2, lines 2130–3515, 100% covered)

Report: **`docs/reviews/misc/2026-08-03-archive-rescue-audit-tail.md`**. It **independently re-confirmed
all three of the sibling's corrections to me** (the S6 seal block at :3060 confirms the anchors tuple was
deleted; the icon-seal block at :2469 confirms two real client consumers) — so those corrections stand
twice over, not once.

- [ ] **SQUARE-GLYPH-BUTTON-SWEEP** (M) — `ui-size-via-variant`'s `DEBT_BASELINE` still carries the full
  **14-row `!size-N !p-0` icon-Button debt across 9 `rpg/*` files**, unpaid since it was surfaced.
  Confirmed live in the gate's current source. Needs a Button square-glyph size arm + a sweep with
  computed-geometry proof; returns that baseline to terminal `{}`.
- [ ] **ICON-SEAL-DOORWAYS** (M) — the OTHER four named-not-built follow-ups, all **zero-hit confirmed**:
  `LucideProvider` at the client composition root · vector-effect CSS stroke route · the `iconNode`
  door for brand glyphs · the `fillRule=evenodd` probe to grow the fillable set.
- [ ] **AGENT-1-PROGRAM** (L, owner-scoped) — agent-sdk first-class for rpg-lite, 5 named arms explicitly
  scoped-and-not-dispatched, ruled order 2→3→1→4.
- [ ] **ZOD-STAGE-D — RULED 2026-08-07 (question-tool): LAND IN FULL** (stringbool / hostname /
  strip-observability), premise re-verified first per \[\[audit-lists-are-snapshots]]. Dispatched in
  the RULED-BATCH lane.
- [ ] **AMBIENT-NONE-AFFORDANCE** (S) — `ambient-strip.tsx`'s weather/timeOfDay CLOSED vocabs carry no
  "none"/unset member (`RPG_WEATHER_TYPES` / `TIME_OF_DAY`), so they cannot be cleared; location/date
  are free text and can. This is the UI gap behind the unreachable compact arm.
- [ ] **DOCLAW-RPG-REFS — RULED 2026-08-07 (question-tool): MINT THE CARVE-OUT** — comments citing
  law by §/D-number are sanctioned house style; one paragraph in Documentation-Law, no sweep
  (\~4,066 refs / 1,151 files of churn avoided). Orchestrator writes the law paragraph.
- [ ] **MACRO-CAST-GUIDES — RULED 2026-08-07 (question-tool): THREAD THEM** — the cast projection
  gains appearance/outfit/thoughts via the existing celBindings channel. Dispatched in the
  RULED-BATCH lane.
- [x] ~~**EMBER-VOCAB-SWEEP**~~ — **PREMISE WRONG, and acting on it would have DONE HARM.** "ember" is the
  deliberate house nickname for `--color-primary`/accent: a REAL token name in
  `packages/ui/src/tokens/tokens.json:166` (`sky-ember`, `sky-ember-deep`) plus `chart-1`'s
  `$description: "ember"`, used consistently across dozens of CTs. Sweeping it would have touched 20+
  files AGAINST the codebase's own convention. The lane reported instead of guessing — correct call.
- [x] ~~**WORKLOADS-LABEL-RENAME**~~ — **PREMISE WRONG (re-verified 08-03).** Zero hits for the retired
  label across `packages/**`; all three cited files already say **"lockdown §12"**
  (`chat-options-menu.tsx:37`, `rpg-choice-echo.tsx:7`, `use-rpg-mutations.ts:223`). It survives only
  in history/audit docs — those are RECORDS of the finding, not the thing to fix.
- [ ] **IMPORT-SETTINGS-WRITE-GUARD — RULED 2026-08-07 (question-tool): LIFT INTO IMPORT** — the
  import verb runs the same write-boundary validation as every settings writer; refuse loudly at
  write; the heal-at-read arm becomes deletable. Dispatched in the RULED-BATCH lane.

**⚑ ARCHIVE2's own UNVERIFIED tail** (flagged, not asserted — each is one targeted grep from a verdict):
the six named UNREACHED side-eye items (waystone-compact · impersonate+1 · scene-lightbox · Status
max-edit · F9-F10 · stats-Recompute) — it did not run a fresh side-eye pass to see whether a later round
absorbed them · `refEnumerationLines` active-conditions coverage · and the two contradictory `#16 engine
wake` mentions inside the same range (one says still-open, a later one says 6/6 arms PASS live).

**⚑ TWO ROWS THE AUDIT REFUSED TO GUESS ON (UNVERIFIABLE, each names what would settle it):**
`SSE-STARVATION-PIN` (the spec §12 live-socket regression pin — could not find it, and it did NOT run a
two-method absence check, so it will not say "not found") · `SM7-STRICT-RESIDUE` (the "second
`response_format` builder" at a path that no longer exists — `backends/vllm/` was restructured away;
re-locate and re-check).

**⚑ ~~COVERAGE GAP~~ — CLOSED, and this note was STALE AND SELF-CONTRADICTORY (corrected 2026-08-03).**
It said the audit read only **lines 1–2130 of 3515 (\~61%)** with 39% owed — but the TAIL section directly
above it states ARCHIVE2 covered **exactly 2130–3515, 100% line-by-line**. Together that is the whole file.
The bullet was describing the FIRST lane's coverage and was never updated when ARCHIVE2 filled it.
**It cost a dispatch:** lane ARCHIVE-GAP was sent to read a range already read, caught the contradiction
itself, and re-scoped to the more valuable job — a FINAL VERIFYING pass that re-checks ARCHIVE2's 10 rows
against today's tree (several were asserted from the document's own citation rather than a fresh grep —
T-11 says so explicitly), settles ARCHIVE2's flagged-unverified tail, and re-attempts the two REFUSED rows
with two-method absence discipline. **The lesson: a board note that describes coverage must be rewritten
when coverage changes, not left to be contradicted by the section above it.**

- **⚠ LIVE SHELL-TIER CLS FINDING (do NOT re-board the old PERF P1 — it resurfaced):** the archive tail
  audit traced the archived "CLS 0.24, profile lane owed" row forward and found the defect is ALREADY
  tracked live as **F-14 — *"CLS is 2–4× the budget on EVERY section — shell-tier, not preset-specific"***
  (measured **0.26**), in `docs/reviews/side-eye/2026-08-03-preset-shell-reverify.md:249`. A separate
  side-eye pass today independently measured 0.2542 on the config pane and attributed it to
  collection-group expansion, pre-existing. **One shell-wide defect, three sightings, no owner yet.**

- **⚠ MANUAL MEMO WAS HIDING CT FAILURES (owner report, 2026-08-03, second session).** The
  React-modernization program's memo burn-down deleted the manual `useMemo`/`useCallback` cache sites —
  and the CT suite **exploded**. Being fixed in that session.
  **The load-bearing reading: those failures are LATENT ON MAIN TODAY.** Deleting the memo did not create
  them; it stopped SUPPRESSING the re-render that reveals them. Same disease shape as the swallowed catch
  inside a root span (SPANGATE/OBSCLOSE) — green because the reporting mechanism was disabled, not because
  the behaviour was right.
  **The question that decides whether this blocks a push:** are the exposed reds (a) FIXTURE artifacts (a
  test that leaned on a memo boundary to hold a stale value — only the test was wrong) or (b) REAL product
  defects memo was masking at runtime as well? Any (b) ships today regardless of the burn-down. Ask the
  second session for the split before the push word is given.
  **It also vindicates the direction** — \[\[react-compiler-no-manual-memo]] treats manual memo as
  against-convention here; this is the first evidence it was actively concealing breakage, not merely
  redundant. Worth a D-entry clause if the split shows real defects.

- ✅ **ENGINES FLEET FIX — MERGED (`a386a4fae`, merge `2b1332159`; consolidated `pnpm check` 14/14).** Root-caused the
  long-standing "esbuild and something else running at the same time" annoyance: it is the **engines fleet
  launcher**, not the dep-optimizer / CT cache / gate fixtures (all three tested and RULED OUT). Every
  `pnpm engines adopt` left an immortal `tsx engines.ts --detach` + node-loader + esbuild cluster, because
  the `--detach` path says "and EXITS" but never `unref()`'d its child handles — so the launcher's event
  loop was held for the fleet's entire life (two were alive \~8h). **A DUPLICATE FLEET existed for \~8h
  holding \~17 GiB serving nothing:** a second adopter 6 min into the first's cold boot passed the VRAM
  headroom gate (mid-boot VRAM is ambiguous by construction) and `waitHealthy` reported success **because
  it polls the PORT — it validated the FIRST fleet's engines** (\[\[health-check-validates-the-port-not-your-process]]).
  Bonus defect: a no-op adopt overwrites the pidfile UNCONDITIONALLY, which can blank the live fleet's rows
  and orphan `engines:stop`.
  **Fix (4 arms, in that worktree):** an atomic boot lock for the adopt window · **adopt-in-place** (a
  healthy port is adopted, never re-spawned — the dupe class becomes unrepresentable) · pidfile MERGE ·
  `unref()` + fd-close in detach. **Honestly flagged by its author: not live-tested against a real fleet**
  per \[\[never-run-engine-launcher-live]] — the next real adopt IS the verification.
  **Box state 2026-08-03 (verified by the orchestrator, read-only first):** the owner had already reaped the
  dupes and stale launchers — all six cited pids gone, no detached launchers resident, **3 engines healthy
  one per port, \~40 GiB free across both cards.** Nothing left to clean.
  **✅ THE "DO NOT ADOPT" HOLD IS LIFTED** — the fix is on main. **But the verification is still owed:**
  per \[\[never-run-engine-launcher-live]] this was NOT live-tested against a real fleet, so **the next real
  `engines adopt` IS the test** — watch for exactly one launcher exiting promptly, no duplicate spawn on an
  already-healthy port, and a pidfile that merges rather than clobbers.
  Also corrected in passing: the workspace comment blaming ancient `esbuild@0.18.20` on tsx — it is a
  **drizzle-kit transitive** (`pnpm why` receipt in the commit).

- ✅ **`@orb-gate-ignore` NOW REQUIRES A REASON (`d55350d07`)** — the marker honoured by `pass.ts` for all
  183 gates accepted a bare `// @orb-gate-ignore <gate>` and suppressed the finding, contradicting
  GATE-AUTHORING §4.3 (*"a bare-marker-exempts rule is a rubber stamp"*). Grammar is now
  `// @orb-gate-ignore <gate>[(<position>)]: <reason>` — `parseGateIgnoreMarker`/`judgeGateIgnore`,
  `malformed` when the reason OR the position is empty, and a malformed marker **suppresses nothing**.
  **The subtle right call:** RECOGNITION stays permissive so a malformed marker is still SEEN and can be
  red-flagged by `gate-ignore-inventory` — a stricter parser would have made broken markers INVISIBLE to
  the gate that exists to catch them. 24 files swept to the colon grammar; `report.ts` single-pass clean;
  `pnpm check` 14/14; gate suites 16/16.
  **✅ THE OWED PROBE WAS RUN (merge `65e85e09a`, gate work `130dcf33b`):** the six-case probe is
  now PERMANENT, and it found §4.3a was prose-only — the position-named marker law gained an enforcer.
  **Lesson banked:** where biome and tsc CONTRADICT each other (biome called a trailing `return;`
  unnecessary; tsc's `noImplicitReturns` demanded it), the fix is a SINGLE-RETURN accumulator shape that
  satisfies both — not a suppression of one to appease the other. One cited suppression survives, where
  biome's type lens wrongly believes `exec()` is non-nullable.

- **📄 NODE 21→26 MAXIMAL-ADOPTION PROGRAM boarded** (`docs/design/node-26-adoption-program.md`, 336
  lines, probe-verified + implementor-grade, from the same session). Pairs naturally with the
  **tsx-shedding migration** — both are "make the platform the runtime" work, and tsx-shedding's stage 4
  (`nodenext`) is the seam where they meet. Read them together before scheduling either.

- Also landed with it: `drizzle.config.ts` joins the db type program (the **no-program hole** class — the
  same defect the memoban session closed for the four root configs), and the ignored esbuild `target` is
  dropped from `vitest.config.ts`, killing the per-lane esbuild/oxc warning.

## ═══ WATCH LIST (flakes + pre-existing reds; none blocking) ═══

- `code-editor.ct` completion flake under contention (documented CM6 75ms window).
- `drawer.ct:162` focus-trap failure — PRE-EXISTING at HEAD (D8R's flag).
- `preset-editor-surface.ct:140` parallel-load flake — A/B-proven pre-existing.
- `seed-demo-chats` cold-import contention — STRUCTURALLY fixed by routing to `SERIAL_INT`
  (`aef89ecb`); watch that it stays quiet.
- A hand `editSnapshot` during an in-flight turn can be clobbered by the flush (seen once, unchased).
- `rpg-scene-tab.tsx` sits near the 450-line cap.

## ═══ STANDING OWNER ITEMS (his word, nobody else's) ═══

1. ✅ **THE PUSH WORD — GIVEN + EXECUTED 2026-08-07** (`4ecb3110d..292f65e08`, receipt in STATE). The
   law stands for the NEXT push: fresh word, fresh battery.
2. **The three nudge default texts** (I-8) — his veto, verbatim in NARCOLOR's report.
3. **Structured-output nullable-union reshape** (I-1) — the A/B call.
4. **Presets into the config rail** (I-3) — owner-timed, one array member forever.
5. ✅ **`tags.sortOrder`** — AUDITED + RULED KEEP-BUT-NARROW (I-4). **The cliff question RULED
   2026-08-07 (question-tool): ACCEPT the ≤30 drag cap** — manual curation is a small-set affordance;
   the retire-manual question folds into the Alphabetical/Most-Used sort-modes build when it lands.
   Item CLOSED.
6. **DRAFT-TRUST** — drafts run the untrusted floor (strip `<i>`/`<b>`), committed `trustHtml` renders
   them; needs a "what render policy would this card get" server seam. Architecture call.
7. **AGENT-1** — agent-sdk FIRST-CLASS for rpg-lite. Plumbing is \~complete (terminal tools · stateful
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
16. ✅ **The tool-guard hard floor — RULED 2026-08-08 (question-tool): LEAVE AS-IS.** The owner accepts
    the classifier bypass; the floor is his own attention on an overnight-full-auto box. Recorded so
    nobody re-poses it.
17. ✅ **D127 + D128 MINTED 2026-08-08** (question-tool, "mint both"): compiler-owns-memoization +
    the uncompiled CT lane; the third-party surface-manifest law (founding instance @base-ui/react).
    Ledger + ranges + enumeration updated. (Superseded by the I-9 ceremony batch: D129–D132 minted,
    next free **D133**.)
18. Taste tail: Meteocons artwork fork (\~8 icons, MIT) · grimstone theme (parked) · chat-options
    placement (D111 clause OPEN, breaks nothing) · persona=character design pass
    (\[\[persona-pin-prompt-resolution]]).

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
- **NEVER `cd` INTO A WORKTREE AT ALL — not even as a throwaway prefix.** The Bash tool's cwd PERSISTS
  across calls, so one `cd <wt> 2>/dev/null; git -C <wt> status` silently relocates every LATER command:
  a board edit + `git add -A docs` + commit then landed a main-only doc commit on a LANE'S BRANCH, on top
  of that lane's checkpoint, while it was mid-sweep (2026-08-03, BRAND-F). `git -C <ABSOLUTE-path>` is
  sufficient for every worktree read — the `cd` buys nothing and costs this.
  **The repair, when it happens:** cherry-pick the commit to main FIRST (bank the work), then in the lane
  `reset --soft HEAD~1`, rewrite the stray file from `git show HEAD:<path>`, and `git reset -- <path>` to
  unstage. NEVER `git restore`/`checkout <path>` in a lane's tree — it carries live uncommitted work.
  Verify the lane's modified-file count is unchanged afterward and TELL the lane.
- **HOLD merges while a `verify --push` runs** (merging mid-battery muddies what got certified).
- Merge-hook format-drift reds: fix IN the staged merge (scoped biome on the named files, inspect the
  diff, `git add`, `commit --no-edit`).
- Teardown: `status --short` (untracked survivors) + `git show --stat` receipts FIRST; never tear down
  a resumable lane. Recovery: the branch always survives —
  `git worktree add <same-path> <branch>` re-installs via the post-checkout hook.

**Verification instruments**

- `pnpm check` = STATIC only (\~90-220s, in the pre-commit hook). `pnpm test` = the battery (\~10 min,
  vitest \~9,800 + CT). `pnpm verify --push` = the 14 static stages + `deps:orphan-ratchet` + `tests:node` + `e2e-smoke`,
  and **`tests:node` carries the CTs** (`pnpm test` = the 4 vitest runtime projects && `pnpm test:ct --retries=2`; receipt: `scripts/verify/registry.ts:304`). NOT at push: the full `e2e` + `quality:mutation-gate` (those are `--full`); `quality:cpd` +
  `tests:parity` were PROMOTED INTO the push tier 2026-08-03 (sub-2s each — lefthook.yml's own
  comment is the receipt; this line previously said otherwise and was stale). And `types:testd` rides the STATIC bar,
  not the battery. \~16-17 min; BACKGROUND it, never foreground with a timeout. READ
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

**⚑ WHAT THE 2026-08-03 EVENING TAUGHT THE ORCHESTRATOR (read this before dispatching anything)**

- **A LANE'S COLD CHECK OUTRANKS YOUR WARM ONE.** Main is the only tree that accumulates state across
  dozens of edits; a fresh worktree always compiles cold. When a lane reports a red your own check calls
  green, **believe the lane and go looking.** Two did exactly that tonight and were right both times.
  (`incremental` is now OFF, which kills this specific instance — the asymmetry of trust remains.)
- **A BOARD ROW STATES ITS EVIDENCE METHOD OR IT IS A LEAD, NOT A ROW.** Measured: **six rows misdirected
  six lanes in one evening**, and a re-verification pass found a **\~50% defect rate TWICE** — once on the
  original grep pass, and again on the section the board presented as *"100% covered, verified."* Rows
  written from a grep, or copied from another document's citation, are unverified by construction. Say
  which they are.
- **BRIEF EVERY LANE TO RE-VERIFY ITS PREMISE FIRST, AND SAY THAT A CORRECT REFUSAL IS A SUCCESS.**
  Tonight refusal was the MAJORITY outcome and the highest-value one: 4 of 7 smalls refused; one lane
  refused its row and found a defect ten times bigger; one refused the brief's mechanism and found the
  obvious fix would have been a no-op that looked correct; one refused to accept a law that was prose.
- **TWO AGENTS AGREEING IS NOT CORROBORATION** when both read the same artifact from the same place —
  their agreement is correlated, not independent. Two lanes agreed "biome is broken in worktrees"; the
  owner challenged it, and a two-second probe showed the config was simply malformed.
- **A ✅ WITH A PROSE TAIL OVERSTATES COMPLETION.** The `@orb-gate-ignore` debt sat as a prose bullet
  under a ✅ LANDED item with no checkbox — so the board's own visual state said done while a real debt
  remained. Same shape the HISTORY-GRADUATION rule names (four graduated docs, every survivor a prose
  tail). **A remainder belongs in a checkbox, never in a paragraph.** An audit of the other ✅ items for
  this shape is OWED and has never been run.
- **MIS-SCOPED ROWS LET A LANE REPORT DONE TRUTHFULLY AT 1%.** `DOCLAW-RPG-REFS` scoped a tree-wide
  problem (4,066 refs / 1,151 files) to one file that is \~1% of it. Check a row's true blast radius
  before dispatching, or the tick is a lie nobody told.
- **PUT THE HAZARD IN THE BRIEF, NOT JUST THE TASK.** Every lane that avoided a trap tonight avoided one
  the brief named (the `AbortSignal.any` reason-propagation bug, the narrowest-real-host rule, the
  three typecheck programs). Every trap that bit was one no brief mentioned.
- **Mechanics:** backticks inside a `git commit -m "..."` are COMMAND-SUBSTITUTED by bash and silently
  eat the word — always use a single-quoted heredoc (`-m "$(cat <<'EOF' … EOF)"`). And a `PreToolUse`
  hook returning `defer` KILLS subagents (they have nobody to prompt); pass-through must be `allow`.

**⚑ WHAT 2026-08-07→08 TAUGHT THE ORCHESTRATOR (the Base UI + dogfood double campaign)**

- **Verify the agent-id↔lane mapping against the DISPATCH RESULTS before every SendMessage.** Two
  misroutes in one night (both bounced correctly by the receiving lane — the briefing discipline
  held, but the routing was mine). Keep the live roster in the compact snapshot.
- **The no-chain law extends to VERIFY: never `merge && pnpm check` in one command.** A conflicted
  merge under `&&` silently skips the check and the notification reads like a verify failure.
  merge → separate verify → teardown, three calls, always.
- **Warm-agent LEGS beat fresh spawns** (owner preference, cache economics): STATLAS's rig-fix
  leg, DOG-DEBUG's arm-A leg, DOG-ENGINE's live-receipt leg — SendMessage resumes with full
  context. Don't tear down a worktree whose lane might get a next leg.
- **Board python edits: anchors DRIFT under format-md rewrap.** Grep the CURRENT text or use
  line-ranges; never assert on remembered text — one format-only commit shipped under a
  content-claiming message and needed a corrective.
- **A fence/instrument claim needs a planted POSITIVE control before its zero is trusted** — four
  lying instruments in one night (knip's dependency lens vs a bare probe file, globSync's
  string-not-Dirent exclude, ast-grep's bare-identifier vs property\_identifier, a depth-capped
  type reader). The probe that would have caught each was one planted file.
- **A lane refusing the brief was the highest-value outcome again** — five premise-kills in one
  session (idle-timeout, Menu.ScrollUpArrow, per-chat connection, field-control-33, RUNTIME-VARS).
  Keep briefing the refusal right explicitly; keep marking which brief claims are VERIFIED vs
  RELAYED.

**⚑ WHAT 2026-08-07 TAUGHT THE ORCHESTRATOR (the identity-spine + fork-security + phone day)**

- **A SIDE-EYE SYMPTOM IS GOLD; ITS MECHANISM PRESCRIPTION IS A PROPOSAL.** Check any structural
  prescription against the D-ledger AND the touched files' headers BEFORE relaying it. I forwarded
  "drop both panel toggles from the phone" verbatim; the lane found it would reverse an owner-ruled
  law stated in two headers, and killed the finding's stated mechanism with the reviewer's OWN
  screenshot. Three forks this day turned on one principle: **a prescription is satisfied when its
  SYMPTOM is dead — do not reverse a recorded ruling to satisfy the letter afterward.**
- **WHEN A RULING'S PREMISE DIES, RE-RULE — DO NOT DEFEND IT.** I preserved a row's 32% name lane
  because a cluster "reserves the words"; at `pointer: coarse` those words are `display:none`, so
  the premise was false on the surface in question. A ruling holds where its premise holds.
- **BATCH THE FRESH LENS BY CHUNK, AND BRIEF IT TO ATTACK THE CLAIM, NOT RE-RUN THE SUITE.** Three
  multi-chunk verifiers this day; the refutations came from driving PRODUCTION shapes and from
  attacking the lane's own flagged judgement calls. **Nine passes, six refutations — every one a
  defect that was already merged, gate-green and believed done.**
- **ANY GATE RESULT TAKEN DURING A MERGE WINDOW IS VOID** (verifier-authored, after my conflicted
  merge fooled its whole-tree check): it read `exit 2` / 4 red stages, traced every one to conflict
  markers in a file whose `git show HEAD:` copy was clean, watched HEAD advance under it, and
  re-ran on the settled tree — all green. **A verifier or lane that sees an impossible red should
  check whether main is mid-merge BEFORE diagnosing.** Corollary for me: a merge window is a
  quiet-hours window for every whole-tree instrument on the box.
- **NEVER PIPE `git merge` — I DID IT AND IT COST A CHECK.** `git merge … | tail -1` SWALLOWED a
  conflict, `pnpm check` then ran against a tree full of conflict markers, and the verdict came back
  **exit 2 (TOOL-ERROR)** with tsc reporting `TS1185: Merge conflict marker encountered` — a red
  that looks like a code defect and isn't. The board already carried the no-chain law from two
  earlier burns; the pipe is the same law's other half. **Merge BARE, read the whole output,
  THEN check.** Recovery when it happens: `git merge --abort` (never `reset --hard` with
  uncommitted work), then send the LANE to merge main into its branch and resolve.
- **A FENCE THAT HOLDS IN INTENT STILL COLLIDES IN LINES.** I fenced two lanes onto the same file
  by RESPONSIBILITY (one owns the layout, one owns an aria-label string) and they still conflicted,
  because adjacent edits in one file are a git problem, not an ownership problem. When two lanes
  must touch one file, either sequence them or expect the resolve — and give the second lane the
  first's exact change in the resolve brief.
- **LOAD + INSTRUMENT COLLISIONS ARE ORCHESTRATION BUGS, not bad luck:** fix-leg floors count as
  gate-heavy lanes for the stagger cap · the battery's behavioral phase gets the box (an EMFILE
  killed one at 5 vite instances / 161 test processes) · NO whole-tree instrument runs while a
  verifier is live on main (its in-tree probes red-flag your battery) · never pipe the harness
  (`| tail` cost a run) · never merge while a check is mid-flight — it then measures a tree that no
  longer exists.
- **WHEN A LANE DAMAGES A SIBLING, THE ORCHESTRATOR'S JOB IS TO WARN EVERY MID-RUN LANE** — a mass
  failure with no cause is indistinguishable from a real defect, and the phantom costs more than the
  accident did.
- **BRIEF EVERY LANE THAT A CORRECT REFUSAL IS A SUCCESS — it produced SIX premise-kills, THREE of
  them against briefs I wrote.** The lanes that beat their briefs did it by reading a contract the
  brief never mentioned (a leak-free NOT_FOUND; a shared per-turn registry; a nonexistent Duplicate
  command). Put the WHY in the brief and they can tell you when the why is wrong.
- **Lane deliverables that are TEXT go in `docs/…`, not in a report** — `reports/` is ephemera and a
  D-entry that lived only there had to be re-derived from the tree weeks later.

**Owner cadence**

- He answers question-tool batches fast and almost always takes the mantra-marked arm — pose ALL
  pending forks, batch of \~4, recommendations marked; text-list the minor defaults you're taking under
  proceed-in-full.
- **When he says "read the reports in full" — do it.** The summaries drop load-bearing items (proven
  twice).
- **He challenges PREMISES, correctly and often** (tag reorder, display ephemerality, databank
  section). When a queued item's premise dies, say so and re-rule — don't build the boarded letter.
- Publish mocks as artifacts for his eyeball (four config-rail mocks ruled two forks in minutes).

**Compact ritual**

- Any OWED DELIVERABLE (unanswered owner question, undelivered report) gets written INTO this board
  before compact — never trust the summary to carry a whole deliverable across the boundary.
- The context-sentinel can fire a STALE \~99%-full warning on the first post-compact turn — ignore it.
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
- **⚠️ BASELINE SQUASHED 2026-08-03 (DBFIX, `e9e76f35`)** — `workloads.source` → `admission_key` + the
  two index keys + the dropped CHECK. **The dev db DROPS on next boot**; back it up first if anything
  in it matters, then let the latch re-migrate + reseed. The owner's hand-entered regex scripts are the
  usual casualty (\[\[backrest-recovery-and-cited-reports]]).
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
  before minting law (\[\[spec-completeness-no-improvisation]]).

## ═══ THE RECEIPT TRAIL ═══

Everything this board used to carry inline — the 2026-08-01→08-03 snapshots, every lane seal with its
merge sha, every superseded ruling, the whole burn-down archeology — lives at
[`docs/history/retro-workboard-2026-08-03.md`](history/retro-workboard-2026-08-03.md), audited and
intact. `git log --follow docs/retro-workboard.md` is the other half.
